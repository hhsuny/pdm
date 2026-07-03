// backup.js — Backup scheduling, export, import, recovery
import { state } from './state.js';
import { db } from './db.js';
import { loadSync, saveSync, keys, exportAll, importAll, recoverFromIDB } from './storage.js';
import { today, formatDate } from './utils.js';

const CHECK_INTERVAL = 1000 * 60 * 60; // Check every hour
const REMIND_DAYS = 7; // Remind after 7 days

export const backup = {
  _timer: null,
  _lastCheck: null,

  init() {
    this._scheduleCheck();
  },

  _scheduleCheck() {
    this._timer = setInterval(() => this._check(), CHECK_INTERVAL);
    // Also check on startup after a short delay
    setTimeout(() => this._check(), 5000);
  },

  _check() {
    const uid = state.userId;
    if (!uid) return;

    const settings = loadSync(`pdm_settings_${uid}`) || {};
    const lastBackup = settings.lastBackupDate;

    if (!lastBackup) {
      // First time — set today as last backup date
      saveSync(`pdm_settings_${uid}`, { ...settings, lastBackupDate: today() });
      return;
    }

    const daysSince = Math.floor((new Date(today()) - new Date(lastBackup)) / 86400000);

    if (daysSince >= REMIND_DAYS) {
      state.emit('toast:show', {
        message: `已 ${daysSince} 天未备份数据，建议立即导出一份 JSON 文件保存`,
        type: 'warning',
        duration: 10000,
        action: {
          label: '立即备份',
          fn: () => this.downloadBackup()
        }
      });
    }
  },

  /** Download all user data as a JSON file */
  async downloadBackup() {
    try {
      const data = await db.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pdm-backup-${today()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Update last backup date
      const uid = state.userId;
      if (uid) {
        const settings = loadSync(`pdm_settings_${uid}`) || {};
        saveSync(`pdm_settings_${uid}`, { ...settings, lastBackupDate: today() });
      }

      state.emit('toast:show', { message: '备份文件已下载', type: 'success' });
    } catch (e) {
      state.emit('toast:show', { message: '备份失败: ' + e.message, type: 'error' });
    }
  },

  /** Upload and restore from a JSON backup file */
  async restoreFromFile(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate it looks like our data format
      if (typeof data !== 'object' || !Object.keys(data).some(k => k.startsWith('pdm_'))) {
        throw new Error('无效的备份文件格式');
      }

      await importAll(data, 'replace');
      state.emit('auth:changed', state.currentUser);
      state.emit('toast:show', { message: '数据已恢复', type: 'success' });
      return true;
    } catch (e) {
      state.emit('toast:show', { message: '恢复失败: ' + e.message, type: 'error' });
      return false;
    }
  },

  /** Attempt to recover data from IndexedDB */
  async recoverFromIDB() {
    const uid = state.userId;
    if (!uid) return 0;
    const count = await recoverFromIDB(`pdm_${uid}`);
    if (count > 0) {
      state.emit('toast:show', { message: `已从备份恢复 ${count} 条数据`, type: 'success' });
      state.emit('auth:changed', state.currentUser);
    }
    return count;
  },

  destroy() {
    if (this._timer) clearInterval(this._timer);
  }
};
