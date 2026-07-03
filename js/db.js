// db.js — Data access layer
// All entity CRUD with user-keyed namespace + monthly sharding
import { state } from './state.js';
import { load, save, loadSync, saveSync, keys, remove } from './storage.js';
import { today, formatYearMonth, uuid } from './utils.js';
import { hashPassword, verifyPassword } from './crypto.js';

// ============================================================
// User Management
// ============================================================

export const db = {
  // --- Users ---

  async createUser(username, password) {
    const users = (await load('pdm_users')) || [];
    if (users.find(u => u.username === username)) {
      throw new Error('用户名已存在');
    }
    const passwordHash = await hashPassword(password);
    const user = {
      id: uuid(),
      username,
      passwordHash,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    await save('pdm_users', users);
    return { id: user.id, username: user.username };
  },

  async loginUser(username, password) {
    const users = (await load('pdm_users')) || [];
    const user = users.find(u => u.username === username);
    if (!user) throw new Error('用户名或密码错误');
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new Error('用户名或密码错误');
    return { userId: user.id, username: user.username };
  },

  // --- Settings ---

  getSettings(userId) {
    const uid = userId || state.userId;
    if (!uid) return {};
    return loadSync(`pdm_settings_${uid}`) || {};
  },

  async saveSettings(settings) {
    const uid = state.userId;
    if (!uid) return;
    const existing = await load(`pdm_settings_${uid}`) || {};
    await save(`pdm_settings_${uid}`, { ...existing, ...settings });
  },

  // --- Pomodoros (monthly shard) ---

  _pomKey(userId, yearMonth) {
    return `pdm_pomodoros_${userId}_${yearMonth}`;
  },

  async getPomodoros(yearMonth) {
    const uid = state.userId; if (!uid) return [];
    return (await load(this._pomKey(uid, yearMonth))) || [];
  },

  async addPomodoro(record) {
    const uid = state.userId; if (!uid) return null;
    const ym = record.date ? record.date.substring(0, 7) : formatYearMonth(new Date());
    const pomodoros = await this.getPomodoros(ym);
    const entry = { id: uuid(), ...record, createdAt: new Date().toISOString() };
    pomodoros.push(entry);
    await save(this._pomKey(uid, ym), pomodoros);
    return entry;
  },

  async getPomodorosForDate(dateStr) {
    const ym = dateStr.substring(0, 7);
    const all = await this.getPomodoros(ym);
    return all.filter(p => p.date === dateStr);
  },

  async getPomodoroStatsForRange(startDate, endDate) {
    // Load all months in range
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const months = new Set();
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      months.add(formatYearMonth(d));
    }
    const uid = state.userId; if (!uid) return [];
    let all = [];
    for (const ym of months) {
      const data = await this.getPomodoros(ym);
      all = all.concat(data);
    }
    return all.filter(p => p.date >= startDate && p.date <= endDate);
  },

  // --- Schedule (daily shard) ---

  _schKey(userId, dateStr) {
    return `pdm_schedule_${userId}_${dateStr}`;
  },

  async getSchedule(dateStr) {
    const uid = state.userId; if (!uid) return [];
    return (await load(this._schKey(uid, dateStr))) || [];
  },

  async saveSchedule(dateStr, items) {
    const uid = state.userId; if (!uid) return;
    // Add updatedAt timestamps
    const now = new Date().toISOString();
    const stamped = items.map(i => ({ ...i, updatedAt: i.updatedAt || now }));
    await save(this._schKey(uid, dateStr), stamped);
  },

  // --- Diary (daily shard) ---

  _diaryKey(userId, dateStr) {
    return `pdm_diary_${userId}_${dateStr}`;
  },

  async getDiary(dateStr) {
    const uid = state.userId; if (!uid) return null;
    return (await load(this._diaryKey(uid, dateStr)));
  },

  async saveDiary(dateStr, data) {
    const uid = state.userId; if (!uid) return;
    data.updatedAt = new Date().toISOString();
    await save(this._diaryKey(uid, dateStr), data);
  },

  // --- Templates ---

  async getTemplates() {
    const uid = state.userId; if (!uid) return [];
    return (await load(`pdm_templates_${uid}`)) || [];
  },

  async saveTemplate(template) {
    const uid = state.userId; if (!uid) return;
    const templates = await this.getTemplates();
    const idx = templates.findIndex(t => t.id === template.id);
    if (idx >= 0) templates[idx] = template;
    else templates.unshift(template);
    await save(`pdm_templates_${uid}`, templates);
  },

  async deleteTemplate(id) {
    const uid = state.userId; if (!uid) return;
    const templates = await this.getTemplates();
    await save(`pdm_templates_${uid}`, templates.filter(t => t.id !== id));
  },

  // --- Finance Accounts ---

  async getAccounts() {
    const uid = state.userId; if (!uid) return [];
    return (await load(`pdm_finance_accounts_${uid}`)) || [];
  },

  async saveAccounts(accounts) {
    const uid = state.userId; if (!uid) return;
    await save(`pdm_finance_accounts_${uid}`, accounts);
  },

  async updateAccountBalance(accountId, newBalance) {
    const accounts = await this.getAccounts();
    const idx = accounts.findIndex(a => a.id === accountId);
    if (idx >= 0) {
      const delta = newBalance - accounts[idx].balance;
      accounts[idx].balance = newBalance;
      accounts[idx].updatedAt = new Date().toISOString();
      await this.saveAccounts(accounts);
      // Record balance change as a transaction
      await this.addTransaction({
        type: 'adjustment',
        fromAccountId: accountId,
        amount: delta,
        category: 'balance_update',
        notes: `余额更新: ¥${accounts[idx].balance}`,
        date: today()
      });
    }
  },

  // --- Finance Transactions (monthly shard) ---

  _txKey(userId, yearMonth) {
    return `pdm_finance_tx_${userId}_${yearMonth}`;
  },

  async getTransactions(yearMonth) {
    const uid = state.userId; if (!uid) return [];
    return (await load(this._txKey(uid, yearMonth))) || [];
  },

  async addTransaction(tx) {
    const uid = state.userId; if (!uid) return null;
    const ym = tx.date ? tx.date.substring(0, 7) : formatYearMonth(new Date());
    const txs = await this.getTransactions(ym);
    const entry = { id: uuid(), ...tx, createdAt: new Date().toISOString() };
    txs.push(entry);

    // Auto-update account balance for income/expense
    if (tx.type === 'expense' && tx.fromAccountId) {
      const accounts = await this.getAccounts();
      const acc = accounts.find(a => a.id === tx.fromAccountId);
      if (acc) {
        acc.balance = (acc.balance || 0) - (tx.amount || 0);
        acc.updatedAt = new Date().toISOString();
        await this.saveAccounts(accounts);
      }
    } else if (tx.type === 'income' && tx.fromAccountId) {
      const accounts = await this.getAccounts();
      const acc = accounts.find(a => a.id === tx.fromAccountId);
      if (acc) {
        acc.balance = (acc.balance || 0) + (tx.amount || 0);
        acc.updatedAt = new Date().toISOString();
        await this.saveAccounts(accounts);
      }
    } else if (tx.type === 'transfer' && tx.fromAccountId && tx.toAccountId) {
      const accounts = await this.getAccounts();
      const from = accounts.find(a => a.id === tx.fromAccountId);
      const to = accounts.find(a => a.id === tx.toAccountId);
      if (from) from.balance = (from.balance || 0) - (tx.amount || 0);
      if (to) to.balance = (to.balance || 0) + (tx.amount || 0);
      await this.saveAccounts(accounts);
    }

    await save(this._txKey(uid, ym), txs);
    return entry;
  },

  async updateTransaction(id, updates) {
    const uid = state.userId; if (!uid) return;
    const ym = updates.date ? updates.date.substring(0, 7) : formatYearMonth(new Date());
    const txs = await this.getTransactions(ym);
    const idx = txs.findIndex(t => t.id === id);
    if (idx >= 0) {
      txs[idx] = { ...txs[idx], ...updates, updatedAt: new Date().toISOString() };
      await save(this._txKey(uid, ym), txs);
    }
  },

  async deleteTransaction(id, yearMonth) {
    const uid = state.userId; if (!uid) return;
    if (!yearMonth) {
      // Search all months (simplified: search current + last 2 months)
      const now = new Date();
      for (let i = 0; i < 6; i++) {
        const ym = formatYearMonth(new Date(now.getFullYear(), now.getMonth() - i, 1));
        const txs = await this.getTransactions(ym);
        const filtered = txs.filter(t => t.id !== id);
        if (filtered.length < txs.length) {
          await save(this._txKey(uid, ym), filtered);
          return;
        }
      }
      return;
    }
    const txs = await this.getTransactions(yearMonth);
    await save(this._txKey(uid, yearMonth), txs.filter(t => t.id !== id));
  },

  async getTransactionsForRange(startDate, endDate) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const months = new Set();
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      months.add(formatYearMonth(d));
    }
    const uid = state.userId; if (!uid) return [];
    let all = [];
    for (const ym of months) {
      all = all.concat(await this.getTransactions(ym));
    }
    return all.filter(t => t.date >= startDate && t.date <= endDate);
  },

  // --- Finance Trades ---

  async getTrades() {
    const uid = state.userId; if (!uid) return [];
    return (await load(`pdm_finance_trades_${uid}`)) || [];
  },

  async addTrade(trade) {
    const uid = state.userId; if (!uid) return null;
    const trades = await this.getTrades();
    const entry = { id: uuid(), ...trade, createdAt: new Date().toISOString() };
    trades.push(entry);

    // Update account balance
    if (trade.accountId) {
      const accounts = await this.getAccounts();
      const acc = accounts.find(a => a.id === trade.accountId);
      if (acc) {
        const cost = trade.quantity * trade.price;
        if (trade.tradeType === 'buy') {
          acc.balance = (acc.balance || 0) - cost;
        } else {
          acc.balance = (acc.balance || 0) + cost;
        }
        acc.updatedAt = new Date().toISOString();
        await this.saveAccounts(accounts);
      }
    }

    await save(`pdm_finance_trades_${uid}`, trades);
    return entry;
  },

  async updateTrade(id, updates) {
    const uid = state.userId; if (!uid) return;
    const trades = await this.getTrades();
    const idx = trades.findIndex(t => t.id === id);
    if (idx >= 0) {
      trades[idx] = { ...trades[idx], ...updates, updatedAt: new Date().toISOString() };
      await save(`pdm_finance_trades_${uid}`, trades);
    }
  },

  async deleteTrade(id) {
    const uid = state.userId; if (!uid) return;
    const trades = await this.getTrades();
    await save(`pdm_finance_trades_${uid}`, trades.filter(t => t.id !== id));
  },

  // --- Budget ---

  async getBudget(yearMonth) {
    const uid = state.userId; if (!uid) return null;
    return (await load(`pdm_budgets_${uid}_${yearMonth}`));
  },

  async saveBudget(yearMonth, budget) {
    const uid = state.userId; if (!uid) return;
    await save(`pdm_budgets_${uid}_${yearMonth}`, budget);
  },

  // --- Merchant Categories ---

  async getMerchantCategories() {
    const uid = state.userId; if (!uid) return {};
    return (await load(`pdm_merchant_categories_${uid}`)) || {};
  },

  async setMerchantCategory(merchant, category) {
    const uid = state.userId; if (!uid) return;
    const map = await this.getMerchantCategories();
    map[merchant.toLowerCase()] = category;
    await save(`pdm_merchant_categories_${uid}`, map);
  },

  async getCategoryForMerchant(merchant) {
    if (!merchant) return null;
    const map = await this.getMerchantCategories();
    return map[merchant.toLowerCase()] || null;
  },

  // --- Habits ---

  async getHabits() {
    const uid = state.userId; if (!uid) return [];
    return (await load(`pdm_habits_${uid}`)) || [];
  },

  async saveHabits(habits) {
    const uid = state.userId; if (!uid) return;
    await save(`pdm_habits_${uid}`, habits);
  },

  _habitLogKey(userId, yearMonth) {
    return `pdm_habit_logs_${userId}_${yearMonth}`;
  },

  async getHabitLogs(yearMonth) {
    const uid = state.userId; if (!uid) return [];
    return (await load(this._habitLogKey(uid, yearMonth))) || [];
  },

  async setHabitLog(habitId, dateStr, done, note = '') {
    const uid = state.userId; if (!uid) return;
    const ym = dateStr.substring(0, 7);
    const logs = await this.getHabitLogs(ym);
    const idx = logs.findIndex(l => l.habitId === habitId && l.date === dateStr);
    if (idx >= 0) {
      logs[idx] = { habitId, date: dateStr, done, note };
    } else {
      logs.push({ habitId, date: dateStr, done, note });
    }
    await save(this._habitLogKey(uid, ym), logs);
  },

  async getHabitLogsForDate(dateStr) {
    const ym = dateStr.substring(0, 7);
    const all = await this.getHabitLogs(ym);
    return all.filter(l => l.date === dateStr);
  },

  async getHabitLogsForRange(startDate, endDate) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const months = new Set();
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      months.add(formatYearMonth(d));
    }
    const uid = state.userId; if (!uid) return [];
    let all = [];
    for (const ym of months) {
      all = all.concat(await this.getHabitLogs(ym));
    }
    return all.filter(l => l.date >= startDate && l.date <= endDate);
  },

  // --- Reviews ---

  async getReview(id) {
    const uid = state.userId; if (!uid) return null;
    return (await load(`pdm_reviews_${uid}_${id}`));
  },

  async saveReview(id, data) {
    const uid = state.userId; if (!uid) return;
    data.updatedAt = new Date().toISOString();
    await save(`pdm_reviews_${uid}_${id}`, data);
  },

  // --- Unified Tags ---

  async getUnifiedTags() {
    const uid = state.userId; if (!uid) return {};
    return (await load(`pdm_unified_tags_${uid}`)) || {};
  },

  async updateTagCounts(tags) {
    const uid = state.userId; if (!uid) return;
    const existing = await this.getUnifiedTags();
    for (const tag of tags) {
      existing[tag] = (existing[tag] || 0) + 1;
    }
    await save(`pdm_unified_tags_${uid}`, existing);
  },

  // --- Cross-module Queries ---

  async getDayStats(dateStr) {
    const pomodoros = await this.getPomodorosForDate(dateStr);
    const schedule = await this.getSchedule(dateStr);
    const txs = await this.getTransactionsForRange(dateStr, dateStr);
    const habits = await this.getHabitLogsForDate(dateStr);

    const focusCompleted = pomodoros.filter(p => p.sessionType === 'focus' && !p.interrupted).length;
    const breakCompleted = pomodoros.filter(p => p.sessionType === 'break' && !p.interrupted).length;
    const totalFocusMin = pomodoros.filter(p => p.sessionType === 'focus').reduce((s, p) => s + (p.durationMin || 0), 0);

    const scheduleTotal = schedule.length;
    const scheduleDone = schedule.filter(s => s.done).length;
    const scheduleRate = scheduleTotal > 0 ? Math.round((scheduleDone / scheduleTotal) * 100) : 0;

    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);

    return {
      pomodoros: { focusCompleted, breakCompleted, totalFocusMin },
      schedule: { total: scheduleTotal, done: scheduleDone, rate: scheduleRate },
      finance: { income, expense, net: income - expense },
      habits: { completed: habits.filter(h => h.done).length, total: habits.length }
    };
  },

  async getMonthlyFinanceStats(yearMonth) {
    const [y, m] = yearMonth.split('-').map(Number);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
    const txs = await this.getTransactionsForRange(startDate, endDate);

    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);

    const byCategory = {};
    for (const t of txs) {
      if (t.type === 'expense') {
        const cat = t.category || '其他';
        byCategory[cat] = (byCategory[cat] || 0) + (t.amount || 0);
      }
    }

    return { income, expense, net: income - expense, byCategory };
  },

  /** Global search across schedule, diary, and transactions */
  async searchAll(query) {
    const uid = state.userId; if (!uid || !query) return [];
    const q = query.toLowerCase();
    const results = [];

    // Search schedule (last 30 days)
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const items = await this.getSchedule(dateStr);
      for (const item of items) {
        if (item.content?.toLowerCase().includes(q) || item.tags?.some(t => t.toLowerCase().includes(q))) {
          results.push({ type: 'schedule', date: dateStr, data: item });
        }
      }
    }

    // Search diary
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const diary = await this.getDiary(dateStr);
      if (diary && (diary.content?.toLowerCase().includes(q) || diary.tags?.some(t => t.toLowerCase().includes(q)))) {
        results.push({ type: 'diary', date: dateStr, data: diary });
      }
    }

    // Search transactions (last 3 months)
    const endDate = today();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    const txs = await this.getTransactionsForRange(startDate.toISOString().split('T')[0], endDate);
    for (const tx of txs) {
      if (tx.notes?.toLowerCase().includes(q) || tx.merchant?.toLowerCase().includes(q) || tx.category?.toLowerCase().includes(q)) {
        results.push({ type: 'finance', date: tx.date, data: tx });
      }
    }

    return results.slice(0, 50); // limit to 50 results
  },

  /** Export all user data */
  async exportAll() {
    const { exportAll: storageExport } = await import('./storage.js');
    const uid = state.userId;
    return storageExport(`pdm_${uid ? uid + '_' : ''}`);
  },

  /** Import user data */
  async importAll(data, mode = 'merge') {
    const { importAll: storageImport } = await import('./storage.js');
    await storageImport(data, mode);
    state.emit('auth:changed', state.currentUser); // trigger module reloads
  }
};
