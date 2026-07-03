// sync.js — GitHub Gist cloud sync engine
import { state } from './state.js';
import { load, save, loadSync, saveSync, exportAll, importAll } from './storage.js';

const GIST_API = 'https://api.github.com/gists';
let _syncTimer = null;
let _pushTimer = null;
let _dirty = false;
let _token = null;
let _gistId = null;

export const sync = {
  _status: 'disconnected', // 'disconnected' | 'synced' | 'pending' | 'error'
  _lastSync: null,

  get status() { return this._status; },
  get lastSync() { return this._lastSync; },

  init() {
    this._loadConfig();
    if (_token && _gistId) {
      this._pull().then(() => this._startAuto());
    }
  },

  _loadConfig() {
    const uid = state.userId;
    if (!uid) return;
    const settings = loadSync(`pdm_settings_${uid}`) || {};
    _token = settings.githubToken || null;
    _gistId = settings.gistId || null;
  },

  /** Setup sync with a GitHub token. Creates a new private gist. */
  async setup(token) {
    _token = token;
    const uid = state.userId;
    if (!uid) throw new Error('未登录');

    // Save encrypted token to settings
    await this._saveConfig();

    // Create private gist with initial data
    const data = await exportAll(`pdm_${uid}`);
    const resp = await fetch(GIST_API, {
      method: 'POST',
      headers: {
        'Authorization': `token ${_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        description: 'PDM 个人数据备份（自动同步）',
        public: false,
        files: { 'pdm-data.json': { content: JSON.stringify(data) } }
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.message || '创建 Gist 失败，请检查 Token 是否有效');
    }

    const gist = await resp.json();
    _gistId = gist.id;
    await this._saveConfig();
    this._status = 'synced';
    this._lastSync = Date.now();
    this._startAuto();
    return gist;
  },

  /** Restore account from cloud — works WITHOUT being logged in */
  async restoreAccount(token) {
    _token = token;

    // Find existing PDM gist
    const listResp = await fetch(`${GIST_API}?per_page=100`, {
      headers: {
        'Authorization': `token ${_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!listResp.ok) throw new Error('Token 无效，无法访问 GitHub');

    const gists = await listResp.json();
    const pdmGist = gists.find(g => g.description === 'PDM 个人数据备份（自动同步）');
    if (!pdmGist) throw new Error('未找到云端数据，请先在电脑上开启同步');

    _gistId = pdmGist.id;

    // Pull and import all data
    const file = pdmGist.files?.['pdm-data.json'];
    if (!file || !file.raw_url) throw new Error('云端数据为空');

    const dataResp = await fetch(file.raw_url);
    const remoteData = await dataResp.json();
    await importAll(remoteData, 'merge');

    // Save config
    await this._saveConfig();
    this._status = 'synced';
    this._lastSync = Date.now();
    this._startAuto();
    return true;
  },

  /** Push local data to Gist */
  async push() {
    if (!_token || !_gistId) return false;
    this._status = 'pending';
    state.emit('sync:status', 'pending');

    try {
      const uid = state.userId;
      const data = await exportAll(`pdm_${uid}`);
      const resp = await fetch(`${GIST_API}/${_gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${_token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          files: { 'pdm-data.json': { content: JSON.stringify(data) } }
        })
      });

      if (!resp.ok) {
        if (resp.status === 401) { this._status = 'error'; this.disconnect(); throw new Error('Token 已失效'); }
        throw new Error('推送失败: ' + resp.status);
      }

      this._status = 'synced';
      this._lastSync = Date.now();
      _dirty = false;
      state.emit('sync:status', 'synced');
      return true;
    } catch (e) {
      this._status = 'error';
      state.emit('sync:status', 'error');
      console.warn('[Sync] push error:', e);
      return false;
    }
  },

  /** Pull remote data from Gist and merge */
  async pull() {
    return this._pull();
  },

  async _pull() {
    if (!_token || !_gistId) return false;
    this._status = 'pending';
    state.emit('sync:status', 'pending');

    try {
      const resp = await fetch(`${GIST_API}/${_gistId}`, {
        headers: {
          'Authorization': `token ${_token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!resp.ok) {
        if (resp.status === 401) { this._status = 'error'; throw new Error('Token 已失效'); }
        throw new Error('拉取失败: ' + resp.status);
      }

      const gist = await resp.json();
      const file = gist.files?.['pdm-data.json'];
      if (!file) return false;

      const remoteData = JSON.parse(file.content);
      const localData = await exportAll(`pdm_${state.userId}`);

      // Merge: remote wins for keys it has that are newer, local wins otherwise
      // Simplified: just import remote data as merge
      await importAll(remoteData, 'merge');

      this._status = 'synced';
      this._lastSync = Date.now();
      _dirty = false;
      state.emit('sync:status', 'synced');
      state.emit('auth:changed', state.currentUser); // trigger UI refresh
      return true;
    } catch (e) {
      this._status = 'error';
      state.emit('sync:status', 'error');
      console.warn('[Sync] pull error:', e);
      return false;
    }
  },

  /** Mark data as dirty (needs push) */
  markDirty() {
    if (!_token || !_gistId) return;
    _dirty = true;
    this._status = 'pending';
    state.emit('sync:status', 'pending');
    this._schedulePush();
  },

  _schedulePush() {
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
      if (_dirty) this.push();
    }, 5000); // 5 second debounce
  },

  _startAuto() {
    if (_syncTimer) clearInterval(_syncTimer);
    // Pull every 5 minutes
    _syncTimer = setInterval(() => this._pull(), 5 * 60 * 1000);
  },

  async _saveConfig() {
    const uid = state.userId;
    if (!uid) return;
    const settings = loadSync(`pdm_settings_${uid}`) || {};
    await save(`pdm_settings_${uid}`, {
      ...settings,
      githubToken: _token,
      gistId: _gistId
    });
  },

  /** Disconnect sync (remove local config only) */
  async disconnect() {
    _token = null;
    _gistId = null;
    _dirty = false;
    this._status = 'disconnected';
    if (_syncTimer) clearInterval(_syncTimer);
    if (_pushTimer) clearTimeout(_pushTimer);

    const uid = state.userId;
    if (uid) {
      const settings = loadSync(`pdm_settings_${uid}`) || {};
      delete settings.githubToken;
      delete settings.gistId;
      await save(`pdm_settings_${uid}`, settings);
    }

    state.emit('sync:status', 'disconnected');
  },

  destroy() {
    if (_syncTimer) clearInterval(_syncTimer);
    if (_pushTimer) clearTimeout(_pushTimer);
  }
};
