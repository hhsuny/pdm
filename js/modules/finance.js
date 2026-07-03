// finance.js — Personal Finance Module (accounts, bills, budget, trades, dashboard)
import { state } from '../state.js';
import { db } from '../db.js';
import { router } from '../router.js';
import { today, niceDate, formatYearMonth, formatCurrency, formatNumber, uuid, niceMonth } from '../utils.js';
import { hashPassword, verifyPassword } from '../crypto.js';

const CATEGORIES_EXPENSE = ['餐饮', '交通', '购物', '娱乐', '健身', '学习', '日用', '医疗', '通讯', '住房', '游戏充值', '其他'];
const CATEGORIES_INCOME = ['工资', '奖金', '投资', '兼职', '退款', '其他'];

let pinVerified = false; // module-level, resets on page refresh

export const financeModule = {
  _cleanup: [],
  _subView: 'dashboard', // 'dashboard' | 'accounts' | 'bills' | 'budget' | 'trades' | 'quick-bill'

  async render(params, container) {
    this.destroy();
    const path = router.getCurrentPath();
    if (path === '/finance/accounts') this._subView = 'accounts';
    else if (path === '/finance/bills') this._subView = 'bills';
    else if (path === '/finance/budget') this._subView = 'budget';
    else if (path === '/finance/trades') this._subView = 'trades';
    else this._subView = 'dashboard';

    // PIN check
    if (!state.financeUnlocked) {
      await this._pinGate(container);
      return;
    }

    switch (this._subView) {
      case 'accounts': await this._renderAccounts(container); break;
      case 'bills': await this._renderBills(container); break;
      case 'budget': await this._renderBudget(container); break;
      case 'trades': await this._renderTrades(container); break;
      default: await this._renderDashboard(container);
    }

    // Listen for quick bill from global shortcut
    const onQuick = () => this._subView = 'quick-bill';
    state.on('finance:quickBill', onQuick);
    this._cleanup.push(() => state.off('finance:quickBill', onQuick));
  },

  async renderQuickBill(params, container) {
    if (!state.financeUnlocked) { await this._pinGate(container); return; }
    this._subView = 'quick-bill';
    await this._renderQuickBill(params, container);
  },

  // --- PIN Gate ---
  async _pinGate(container) {
    container.innerHTML = `
      <div class="min-h-[60vh] flex items-center justify-center fade-in">
        <div class="glass-card p-8 max-w-sm w-full text-center">
          <div class="text-4xl mb-4">🔐</div>
          <h2 class="text-lg font-semibold mb-2">金融模块已锁定</h2>
          <p class="text-sm text-secondary mb-6" id="pin-msg">请输入 4 位数字密码</p>
          <div class="flex justify-center gap-3 mb-4">
            <input type="password" class="pin-input" maxlength="1" pattern="[0-9]" inputmode="numeric" id="pin-1">
            <input type="password" class="pin-input" maxlength="1" pattern="[0-9]" inputmode="numeric" id="pin-2">
            <input type="password" class="pin-input" maxlength="1" pattern="[0-9]" inputmode="numeric" id="pin-3">
            <input type="password" class="pin-input" maxlength="1" pattern="[0-9]" inputmode="numeric" id="pin-4">
          </div>
          <p class="text-xs text-secondary" id="pin-hint">首次使用？请先设置密码</p>
          <button class="btn-primary w-full mt-4" id="pin-submit">解锁</button>
        </div>
      </div>`;

    const settings = db.getSettings();
    const isNew = !settings.financePinHash;

    if (isNew) {
      document.getElementById('pin-hint').textContent = '请设置 4 位数字密码';
      document.getElementById('pin-submit').textContent = '设置密码';
      document.getElementById('pin-msg').textContent = '首次使用，请设置 PIN 码';
    }

    // Auto-focus and tab between PIN inputs
    const inputs = container.querySelectorAll('.pin-input');
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && i < 3) inputs[i + 1].focus();
        if (e.target.value.length === 1 && i === 3) {
          setTimeout(() => document.getElementById('pin-submit').click(), 200);
        }
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i - 1].focus();
      });
    });
    setTimeout(() => inputs[0]?.focus(), 300);

    document.getElementById('pin-submit').addEventListener('click', async () => {
      const pin = Array.from(inputs).map(i => i.value).join('');
      if (pin.length < 4) { state.emit('toast:show', { message: '请输入 4 位数字', type: 'warning' }); return; }

      if (isNew) {
        const hash = await hashPassword(pin);
        await db.saveSettings({ financePinHash: hash });
        state.unlockFinance();
        state.emit('toast:show', { message: 'PIN 码已设置', type: 'success' });
      } else {
        const ok = await verifyPassword(pin, settings.financePinHash);
        if (ok) {
          state.unlockFinance();
        } else {
          state.emit('toast:show', { message: '密码错误', type: 'error' });
          inputs.forEach(i => i.value = '');
          inputs[0].focus();
          return;
        }
      }
      this.render({}, container);
    });
  },

  // --- Dashboard ---
  async _renderDashboard(container) {
    const accounts = await db.getAccounts();
    const totalAssets = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    const todayStr = state.currentDate;
    const txs = await db.getTransactionsForRange(todayStr, todayStr);
    const todayIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
    const todayExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    const monthStats = await db.getMonthlyFinanceStats(formatYearMonth(new Date()));
    const budget = await db.getBudget(formatYearMonth(new Date()));
    const budgetUsed = todayExpense;
    // Note: budget tracking across month uses monthStats

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-4xl mx-auto fade-in">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold">💰 金融</h2>
          <div class="flex gap-2">
            <button class="btn-secondary text-sm" data-action="nav" data-target="accounts">🏦 账户</button>
            <button class="btn-secondary text-sm" data-action="nav" data-target="bills">🧾 账单</button>
            <button class="btn-secondary text-sm" data-action="nav" data-target="budget">📊 预算</button>
            <button class="btn-secondary text-sm" data-action="nav" data-target="trades">📈 交易</button>
          </div>
        </div>

        <!-- Total Assets -->
        <div class="glass-card p-6 mb-4 text-center">
          <p class="text-sm text-secondary mb-1">总资产</p>
          <p class="text-4xl font-bold">${formatCurrency(totalAssets)}</p>
          <div class="flex justify-center gap-6 mt-2 text-sm">
            <span class="text-[#34C759]">+${formatCurrency(todayIncome)}</span>
            <span class="text-[#FF3B30]">-${formatCurrency(todayExpense)}</span>
          </div>
        </div>

        <!-- Account Pie + Budget -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div class="glass-card-subtle p-5">
            <h3 class="text-sm font-semibold mb-3">资产分布</h3>
            ${accounts.length > 0
              ? accounts.map(a => `
                <div class="flex items-center justify-between text-sm py-1">
                  <span>${a.icon || '💳'} ${a.name}</span>
                  <span class="font-medium">${formatCurrency(a.balance)}</span>
                </div>
              `).join('')
              : '<p class="text-sm text-secondary">暂无账户</p>'
            }
          </div>
          <div class="glass-card-subtle p-5">
            <h3 class="text-sm font-semibold mb-3">本月概览</h3>
            <div class="flex justify-between text-sm py-1"><span>收入</span><span class="text-[#34C759]">${formatCurrency(monthStats.income)}</span></div>
            <div class="flex justify-between text-sm py-1"><span>支出</span><span class="text-[#FF3B30]">${formatCurrency(monthStats.expense)}</span></div>
            <div class="flex justify-between text-sm py-1 font-semibold"><span>结余</span><span>${formatCurrency(monthStats.net)}</span></div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="glass-card-subtle p-5">
          <h3 class="text-sm font-semibold mb-3">⚡ 快速记账</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2" id="quick-actions">
            <button class="btn-secondary text-sm" data-action="quick-record" data-type="expense">💸 记支出</button>
            <button class="btn-secondary text-sm" data-action="quick-record" data-type="income">💰 记收入</button>
            <button class="btn-secondary text-sm" data-action="quick-record" data-type="transfer">🔄 转账</button>
          </div>
          <div id="quick-form" class="hidden mt-4"></div>
        </div>
      </div>`;

    this._bindDashboardEvents(container);
  },

  _bindDashboardEvents(container) {
    container.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-action="nav"]');
      if (nav) {
        const target = nav.dataset.target;
        router.navigate('/finance/' + target);
      }
      const rec = e.target.closest('[data-action="quick-record"]');
      if (rec) this._showQuickForm(rec.dataset.type, container);
    });
  },

  _showQuickForm(type, container) {
    const form = document.getElementById('quick-form');
    form.classList.remove('hidden');
    form.innerHTML = `
      <div class="glass-card p-4 mt-3">
        <h4 class="text-sm font-semibold mb-3">${type === 'expense' ? '💸 记支出' : type === 'income' ? '💰 记收入' : '🔄 转账'}</h4>
        ${type === 'transfer' ? `
          <select class="input-field mb-2" id="qf-from-account">
            <option value="">付款账户</option>
          </select>
          <select class="input-field mb-2" id="qf-to-account">
            <option value="">收款账户</option>
          </select>
        ` : `
          <select class="input-field mb-2" id="qf-account">
            <option value="">选择账户</option>
          </select>
          <select class="input-field mb-2" id="qf-category">
            <option value="">选择分类</option>
            ${(type === 'expense' ? CATEGORIES_EXPENSE : CATEGORIES_INCOME).map(c => `<option>${c}</option>`).join('')}
          </select>
        `}
        <input type="number" class="input-field mb-2" id="qf-amount" placeholder="金额" step="0.01" min="0.01">
        <input type="text" class="input-field mb-2" id="qf-notes" placeholder="备注" maxlength="100">
        <input type="date" class="input-field mb-2" id="qf-date" value="${state.currentDate}">
        <div class="flex gap-2">
          <button class="btn-primary text-sm" data-action="save-quick" data-type="${type}">保存</button>
          <button class="btn-ghost text-sm" data-action="cancel-quick">取消</button>
        </div>
      </div>`;

    // Populate account dropdowns
    db.getAccounts().then(accounts => {
      const opts = accounts.map(a => `<option value="${a.id}">${a.icon||'💳'} ${a.name}</option>`).join('');
      const sel = document.getElementById('qf-account');
      if (sel) sel.innerHTML = '<option value="">选择账户</option>' + opts;
      const selFrom = document.getElementById('qf-from-account');
      if (selFrom) selFrom.innerHTML = '<option value="">付款账户</option>' + opts;
      const selTo = document.getElementById('qf-to-account');
      if (selTo) selTo.innerHTML = '<option value="">收款账户</option>' + opts;
    });

    form.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action="cancel-quick"]')) form.classList.add('hidden');
      if (e.target.closest('[data-action="save-quick"]')) {
        const txType = e.target.closest('[data-action="save-quick"]').dataset.type;
        await this._saveQuickTx(txType, container);
      }
    });
  },

  async _saveQuickTx(type, container) {
    const amount = parseFloat(document.getElementById('qf-amount')?.value);
    if (!amount || amount <= 0) { state.emit('toast:show', { message: '请输入有效金额', type: 'warning' }); return; }

    const date = document.getElementById('qf-date')?.value || today();
    const notes = document.getElementById('qf-notes')?.value || '';

    if (type === 'transfer') {
      const fromId = document.getElementById('qf-from-account')?.value;
      const toId = document.getElementById('qf-to-account')?.value;
      if (!fromId || !toId) { state.emit('toast:show', { message: '请选择两个账户', type: 'warning' }); return; }
      if (fromId === toId) { state.emit('toast:show', { message: '两个账户不能相同', type: 'warning' }); return; }
      await db.addTransaction({ type: 'transfer', fromAccountId: fromId, toAccountId: toId, amount, notes, date });
    } else {
      const accountId = document.getElementById('qf-account')?.value;
      if (!accountId) { state.emit('toast:show', { message: '请选择账户', type: 'warning' }); return; }
      const category = document.getElementById('qf-category')?.value || '其他';
      await db.addTransaction({ type, fromAccountId: accountId, amount, category, notes, date });
    }

    state.emit('toast:show', { message: '记账成功！', type: 'success' });
    state.emit('finance:updated', {});
    document.getElementById('quick-form').classList.add('hidden');
    this.render({}, container);
  },

  // --- Accounts ---
  async _renderAccounts(container) {
    const accounts = await db.getAccounts();
    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <div class="flex items-center justify-between mb-6">
          <button class="btn-ghost text-sm" data-action="nav" data-target="dashboard">← 返回</button>
          <button class="btn-primary text-sm" data-action="add-account">+ 新账户</button>
        </div>
        <h2 class="text-xl font-semibold mb-4">🏦 账户管理</h2>
        ${accounts.length === 0 ? '<p class="text-secondary text-sm">暂无账户</p>' : accounts.map(a => `
          <div class="glass-card-subtle p-4 mb-2 flex items-center justify-between">
            <div>
              <span class="font-medium">${a.icon||'💳'} ${a.name}</span>
              <span class="text-xs text-secondary ml-2">${a.type === 'liquid' ? '流动资产' : a.type === 'investment' ? '投资' : '特殊'}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-bold">${formatCurrency(a.balance)}</span>
              <button class="btn-ghost text-xs" data-action="edit-account" data-id="${a.id}">编辑</button>
              <button class="btn-ghost text-xs text-[#FF3B30]" data-action="delete-account" data-id="${a.id}">删除</button>
            </div>
          </div>
        `).join('')}
        <div id="account-form" class="hidden mt-4"></div>
      </div>`;
    this._bindAccountEvents(container);
  },

  _bindAccountEvents(container) {
    container.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-action="nav"]');
      if (nav) router.navigate('/finance' + (nav.dataset.target === 'dashboard' ? '' : '/' + nav.dataset.target));
      if (e.target.closest('[data-action="add-account"]')) this._showAccountForm(container);
      if (e.target.closest('[data-action="edit-account"]')) this._showAccountForm(container, e.target.closest('[data-action="edit-account"]').dataset.id);
      if (e.target.closest('[data-action="delete-account"]')) {
        const id = e.target.closest('[data-action="delete-account"]').dataset.id;
        if (confirm('确定删除该账户？')) { db.getAccounts().then(acc => db.saveAccounts(acc.filter(a => a.id !== id))).then(() => this._renderAccounts(container)); }
      }
    });
  },

  _showAccountForm(container, editId = null) {
    db.getAccounts().then(accounts => {
      const acc = editId ? accounts.find(a => a.id === editId) : null;
      const form = document.getElementById('account-form');
      form.classList.remove('hidden');
      form.innerHTML = `
        <div class="glass-card p-4">
          <h4 class="text-sm font-semibold mb-3">${acc ? '编辑账户' : '新账户'}</h4>
          <input type="text" class="input-field mb-2" id="af-name" placeholder="账户名称" value="${acc?.name||''}">
          <select class="input-field mb-2" id="af-type">
            <option value="liquid" ${acc?.type==='liquid'?'selected':''}>流动资产</option>
            <option value="investment" ${acc?.type==='investment'?'selected':''}>投资资产</option>
            <option value="special" ${acc?.type==='special'?'selected':''}>特殊资产</option>
          </select>
          <input type="text" class="input-field mb-2" id="af-icon" placeholder="emoji图标" value="${acc?.icon||'💳'}" maxlength="2">
          <input type="number" class="input-field mb-2" id="af-balance" placeholder="当前余额" value="${acc?.balance||0}" step="0.01">
          <div class="flex gap-2">
            <button class="btn-primary text-sm" data-action="save-account" data-id="${acc?.id||''}">保存</button>
            <button class="btn-ghost text-sm" data-action="cancel-account">取消</button>
          </div>
        </div>`;
      form.addEventListener('click', async (e) => {
        if (e.target.closest('[data-action="cancel-account"]')) form.classList.add('hidden');
        if (e.target.closest('[data-action="save-account"]')) {
          const data = {
            id: e.target.closest('[data-action="save-account"]').dataset.id || uuid(),
            name: document.getElementById('af-name').value,
            type: document.getElementById('af-type').value,
            icon: document.getElementById('af-icon').value || '💳',
            balance: parseFloat(document.getElementById('af-balance').value) || 0,
            sortOrder: accounts.length
          };
          if (acc) { const idx = accounts.findIndex(a => a.id === data.id); if (idx>=0) accounts[idx] = { ...accounts[idx], ...data }; }
          else accounts.push(data);
          await db.saveAccounts(accounts);
          form.classList.add('hidden');
          this._renderAccounts(container);
        }
      });
    });
  },

  // --- Bills ---
  async _renderBills(container) {
    const txs = await db.getTransactionsForRange(
      new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0],
      today()
    );
    const accounts = await db.getAccounts();
    const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-4xl mx-auto fade-in">
        <div class="flex items-center justify-between mb-6">
          <button class="btn-ghost text-sm" data-action="nav" data-target="dashboard">← 返回</button>
          <div class="flex gap-2">
            <select class="input-field w-auto text-sm" id="bill-filter-type">
              <option value="">全部类型</option><option value="income">收入</option><option value="expense">支出</option><option value="transfer">转账</option>
            </select>
            <select class="input-field w-auto text-sm" id="bill-filter-cat">
              <option value="">全部分类</option>
              ${[...CATEGORIES_EXPENSE, ...CATEGORIES_INCOME].map(c => `<option>${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <h2 class="text-xl font-semibold mb-4">🧾 账单历史</h2>
        <div class="space-y-2" id="bills-list">
          ${txs.length === 0 ? '<p class="text-secondary text-sm text-center py-8">暂无账单</p>' : ''}
        </div>
      </div>`;

    this._filterBills(container, txs, accountMap);
  },

  _filterBills(container, txs, accountMap) {
    const render = () => {
      const typeFilter = document.getElementById('bill-filter-type')?.value || '';
      const catFilter = document.getElementById('bill-filter-cat')?.value || '';
      let filtered = txs;
      if (typeFilter) filtered = filtered.filter(t => t.type === typeFilter);
      if (catFilter) filtered = filtered.filter(t => t.category === catFilter);

      const list = document.getElementById('bills-list');
      list.innerHTML = filtered.length === 0
        ? '<p class="text-secondary text-sm text-center py-8">没有匹配的账单</p>'
        : filtered.sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(tx => {
            const acc = accountMap[tx.fromAccountId];
            const toAcc = accountMap[tx.toAccountId];
            const typeLabel = tx.type === 'income' ? '💰 收入' : tx.type === 'expense' ? '💸 支出' : '🔄 转账';
            return `
              <div class="glass-card-subtle p-3 flex items-center justify-between text-sm">
                <div>
                  <span class="font-medium">${typeLabel}</span>
                  <span class="text-xs text-secondary ml-2">${tx.category||''} ${tx.notes||''}</span>
                  <span class="text-xs text-secondary ml-2">${acc?.name||''} ${tx.type==='transfer'? '→ '+ (toAcc?.name||'') : ''}</span>
                  <span class="text-xs text-secondary ml-2">${tx.date}</span>
                </div>
                <span class="font-bold ${tx.type==='income'?'text-[#34C759]':tx.type==='expense'?'text-[#FF3B30]':''}">${tx.type==='expense'?'-':tx.type==='income'?'+':''}${formatCurrency(tx.amount)}</span>
              </div>`;
          }).join('');
    };
    container.addEventListener('change', render);
    render();
  },

  // --- Budget ---
  async _renderBudget(container) {
    const ym = formatYearMonth(new Date());
    const budget = (await db.getBudget(ym)) || { total: 0, categories: {} };
    const stats = await db.getMonthlyFinanceStats(ym);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <div class="flex items-center justify-between mb-6">
          <button class="btn-ghost text-sm" data-action="nav" data-target="dashboard">← 返回</button>
          <h2 class="text-xl font-semibold">📊 ${niceMonth(ym)} 预算</h2>
        </div>
        <div class="glass-card p-5 mb-4">
          <p class="text-sm text-secondary mb-2">月度总预算</p>
          <div class="flex gap-3 items-end">
            <input type="number" class="input-field text-xl font-bold" id="budget-total" value="${budget.total || ''}" placeholder="设定总预算" step="0.01">
            <button class="btn-primary" data-action="save-budget">保存</button>
          </div>
        </div>
        <div class="glass-card-subtle p-5">
          <h3 class="text-sm font-semibold mb-3">支出概览</h3>
          <p class="text-sm">本月支出：<span class="font-bold ${budget.total && stats.expense > budget.total ? 'text-[#FF3B30]' : ''}">${formatCurrency(stats.expense)}</span> / ${formatCurrency(budget.total || 0)}</p>
          ${budget.total > 0 ? `
            <div class="mt-2 progress-track">
              <div class="progress-fill ${stats.expense/budget.total > 0.8 ? (stats.expense/budget.total >= 1 ? 'danger' : 'warning') : ''}" style="width:${Math.min(stats.expense/budget.total*100, 100)}%"></div>
            </div>
            <p class="text-xs text-secondary mt-1">
              ${stats.expense > budget.total ? '⚠️ 已超预算！' : `剩余 ${formatCurrency(budget.total - stats.expense)}`}
            </p>
          ` : ''}
        </div>
      </div>`;

    container.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action="nav"]')) router.navigate('/finance');
      if (e.target.closest('[data-action="save-budget"]')) {
        const total = parseFloat(document.getElementById('budget-total').value) || 0;
        await db.saveBudget(ym, { total, categories: budget.categories });
        state.emit('toast:show', { message: '预算已保存', type: 'success' });
      }
    });
  },

  // --- Trades ---
  async _renderTrades(container) {
    const trades = await db.getTrades();
    const accounts = await db.getAccounts();
    const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));

    // Calculate P&L per symbol
    const pnlBySymbol = {};
    for (const t of trades) {
      if (!pnlBySymbol[t.symbol]) pnlBySymbol[t.symbol] = { buyQty: 0, buyCost: 0, sellQty: 0, sellRevenue: 0 };
      if (t.tradeType === 'buy') { pnlBySymbol[t.symbol].buyQty += t.quantity; pnlBySymbol[t.symbol].buyCost += t.quantity * t.price; }
      else { pnlBySymbol[t.symbol].sellQty += t.quantity; pnlBySymbol[t.symbol].sellRevenue += t.quantity * t.price; }
    }

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-3xl mx-auto fade-in">
        <div class="flex items-center justify-between mb-6">
          <button class="btn-ghost text-sm" data-action="nav" data-target="dashboard">← 返回</button>
          <button class="btn-primary text-sm" data-action="add-trade">+ 新交易</button>
        </div>
        <h2 class="text-xl font-semibold mb-4">📈 投资交易</h2>
        ${Object.keys(pnlBySymbol).length > 0 ? `
          <div class="glass-card-subtle p-4 mb-4">
            <h3 class="text-sm font-semibold mb-3">持仓盈亏</h3>
            ${Object.entries(pnlBySymbol).map(([sym, p]) => {
              const pnl = p.sellRevenue - (p.sellQty / p.buyQty * p.buyCost);
              return `
                <div class="flex justify-between text-sm py-1"><span>${sym}</span>
                <span class="${pnl >=0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}">${formatCurrency(pnl)}</span></div>`;
            }).join('')}
          </div>
        ` : ''}
        <div class="space-y-2">
          ${trades.sort((a,b)=>b.date.localeCompare(a.date)).map(t => `
            <div class="glass-card-subtle p-3 text-sm flex justify-between">
              <span>${t.tradeType==='buy'?'🟢':'🔴'} ${t.symbol} ${t.tradeType==='buy'?'买入':'卖出'} ${t.quantity}股 @ ${formatCurrency(t.price)} (${accountMap[t.accountId]?.name||''})</span>
              <span class="text-xs text-secondary">${t.date}</span>
            </div>
          `).join('')}
        </div>
        <div id="trade-form" class="hidden mt-4"></div>
      </div>`;

    container.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="nav"]')) router.navigate('/finance');
      if (e.target.closest('[data-action="add-trade"]')) this._showTradeForm(container);
    });
  },

  _showTradeForm(container) {
    db.getAccounts().then(accounts => {
      const form = document.getElementById('trade-form');
      form.classList.remove('hidden');
      form.innerHTML = `
        <div class="glass-card p-4">
          <h4 class="text-sm font-semibold mb-3">新交易</h4>
          <select class="input-field mb-2" id="tf-account">
            <option value="">选择账户</option>
            ${accounts.filter(a=>a.type==='investment').map(a=>`<option value="${a.id}">${a.icon||'📈'} ${a.name}</option>`).join('')}
          </select>
          <input type="text" class="input-field mb-2" id="tf-symbol" placeholder="标的代码/名称">
          <select class="input-field mb-2" id="tf-type"><option value="buy">买入</option><option value="sell">卖出</option></select>
          <input type="number" class="input-field mb-2" id="tf-qty" placeholder="数量" step="0.01">
          <input type="number" class="input-field mb-2" id="tf-price" placeholder="单价" step="0.01">
          <input type="date" class="input-field mb-2" id="tf-date" value="${state.currentDate}">
          <input type="text" class="input-field mb-2" id="tf-notes" placeholder="备注">
          <div class="flex gap-2">
            <button class="btn-primary text-sm" data-action="save-trade">保存</button>
            <button class="btn-ghost text-sm" data-action="cancel-trade">取消</button>
          </div>
        </div>`;
      form.addEventListener('click', async (e) => {
        if (e.target.closest('[data-action="cancel-trade"]')) form.classList.add('hidden');
        if (e.target.closest('[data-action="save-trade"]')) {
          await db.addTrade({
            accountId: document.getElementById('tf-account').value,
            symbol: document.getElementById('tf-symbol').value,
            tradeType: document.getElementById('tf-type').value,
            quantity: parseFloat(document.getElementById('tf-qty').value),
            price: parseFloat(document.getElementById('tf-price').value),
            date: document.getElementById('tf-date').value,
            notes: document.getElementById('tf-notes').value
          });
          form.classList.add('hidden');
          state.emit('toast:show', { message: '交易已记录', type: 'success' });
          this._renderTrades(container);
        }
      });
    });
  },

  // --- Quick Bill (iOS Shortcut) ---
  async _renderQuickBill(params, container) {
    const amount = parseFloat(params.amount) || 0;
    const source = params.source || '';
    const merchant = params.merchant || '';
    const accounts = await db.getAccounts();
    const matchedAccount = source ? accounts.find(a => a.name.toLowerCase().includes(source.toLowerCase())) : null;
    const matchedCat = await db.getCategoryForMerchant(merchant);

    container.innerHTML = `
      <div class="p-6 lg:p-10 max-w-lg mx-auto fade-in">
        <div class="glass-card p-8">
          <div class="text-center mb-6">
            <div class="text-4xl mb-2">⚡</div>
            <h2 class="text-xl font-semibold">快速记账</h2>
            <p class="text-sm text-secondary">来自快捷指令</p>
          </div>
          <div class="space-y-3">
            <div class="input-field bg-[var(--color-border)]">金额：${formatCurrency(amount)}</div>
            <div class="input-field bg-[var(--color-border)]">商户：${merchant || '---'}</div>
            <select class="input-field" id="quick-bill-account">
              <option value="">选择账户</option>
              ${accounts.map(a => `<option value="${a.id}" ${matchedAccount && a.id===matchedAccount.id?'selected':''}>${a.icon||'💳'} ${a.name}</option>`).join('')}
            </select>
            <select class="input-field" id="quick-bill-category">
              <option value="">选择分类</option>
              ${CATEGORIES_EXPENSE.map(c => `<option ${matchedCat===c?'selected':''}>${c}</option>`).join('')}
            </select>
            <input type="text" class="input-field" id="quick-bill-notes" placeholder="备注" value="${merchant}">
            <button class="btn-primary w-full py-3" data-action="save-quick-bill" data-amount="${amount}" data-merchant="${merchant}">💾 保存</button>
            <button class="btn-ghost w-full text-sm" data-action="cancel-quick-bill">取消</button>
          </div>
        </div>
      </div>`;

    container.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action="cancel-quick-bill"]')) {
        // Try to close window (for iOS shortcut flow)
        if (window.history.length > 1) window.history.back();
        else router.navigate('/finance');
      }
      if (e.target.closest('[data-action="save-quick-bill"]')) {
        const btn = e.target.closest('[data-action="save-quick-bill"]');
        const amt = parseFloat(btn.dataset.amount);
        const merchant = btn.dataset.merchant;
        const accountId = document.getElementById('quick-bill-account').value;
        const category = document.getElementById('quick-bill-category').value || '其他';
        const notes = document.getElementById('quick-bill-notes').value || merchant;

        if (!accountId) { state.emit('toast:show', { message: '请选择账户', type: 'warning' }); return; }

        await db.addTransaction({
          type: 'expense', fromAccountId: accountId, amount: amt, category, notes, merchant, date: today()
        });

        // Remember category for this merchant
        if (merchant && category) await db.setMerchantCategory(merchant, category);

        state.emit('toast:show', { message: '已保存：' + formatCurrency(amt), type: 'success' });
        state.emit('finance:updated', {});

        // Go back
        if (window.history.length > 1) window.history.back();
        else router.navigate('/finance');
      }
    });
  },

  destroy() {
    this._cleanup.forEach(fn => fn());
    this._cleanup = [];
  }
};
