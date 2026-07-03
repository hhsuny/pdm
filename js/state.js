// state.js — EventBus + GlobalState singleton
import { today } from './utils.js';
import { loadSync, saveSync } from './storage.js';

/** Simple pub/sub event bus */
class EventBus {
  _listeners = {};

  on(event, fn) {
    (this._listeners[event] ??= []).push(fn);
    return () => this.off(event, fn); // returns unsubscribe function
  }

  off(event, fn) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter(f => f !== fn);
  }

  emit(event, data) {
    (this._listeners[event] ?? []).forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[EventBus] ${event} handler error:`, e); }
    });
  }
}

/**
 * GlobalState — singleton that holds app-wide state and emits events.
 * All modules read from / write to this.
 */
class GlobalState extends EventBus {
  _currentUser = null;      // { userId, username }
  _currentDate = today();   // "YYYY-MM-DD"
  _financeUnlocked = false; // RAM only, never persisted
  _currentModule = null;    // currently active module name

  // --- Getters ---
  get currentUser() { return this._currentUser; }
  get currentDate() { return this._currentDate; }
  get financeUnlocked() { return this._financeUnlocked; }
  get currentModule() { return this._currentModule; }

  get isLoggedIn() { return !!this._currentUser; }
  get userId() { return this._currentUser?.userId || null; }

  // --- Setters ---

  setCurrentUser(user) {
    this._currentUser = user;
    if (user) {
      saveSync('pdm_session', { userId: user.userId, username: user.username, loggedInAt: Date.now() });
    } else {
      saveSync('pdm_session', null);
    }
    this.emit('auth:changed', user);
  }

  setCurrentDate(date) {
    if (date !== this._currentDate) {
      const prev = this._currentDate;
      this._currentDate = date;
      this.emit('date:changed', { date, previous: prev });
    }
  }

  setCurrentModule(name) {
    this._currentModule = name;
    this.emit('module:changed', name);
  }

  unlockFinance() {
    this._financeUnlocked = true;
    this.emit('finance:unlocked');
  }

  lockFinance() {
    this._financeUnlocked = false;
    this.emit('finance:locked');
  }

  /** Restore session from storage on app start */
  restoreSession() {
    const session = loadSync('pdm_session');
    if (session && session.userId) {
      this._currentUser = { userId: session.userId, username: session.username };
      return true;
    }
    return false;
  }

  /** Destroy current session (logout) */
  destroySession() {
    this._currentUser = null;
    saveSync('pdm_session', null);
    this._financeUnlocked = false;
    this.emit('auth:changed', null);
  }
}

export const state = new GlobalState();
