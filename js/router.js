// router.js — Hash-based SPA router
import { parseQueryString } from './utils.js';
import { state } from './state.js';

class Router {
  constructor() {
    this.routes = [];   // [{ pattern, handler }]
    this.guards = [];   // [{ pattern, fn }]
    this._currentHandler = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  /**
   * Register a route.
   * @param {string|RegExp} pattern - route pattern (e.g. '#/home' or /^#\/schedule/)
   * @param {Function} handler - async fn(params, container) => renders module
   */
  on(pattern, handler) {
    this.routes.push({ pattern, handler });
    return this;
  }

  /**
   * Register a guard. Guards run before route handlers.
   * @param {string|RegExp} pattern - route pattern to guard
   * @param {Function} fn - (path, params) => true (allow) | false (block)
   */
  guard(pattern, fn) {
    this.guards.push({ pattern, fn });
    return this;
  }

  /** Match a hash path against registered routes */
  matchRoute(hashPath) {
    for (const { pattern, handler } of this.routes) {
      if (typeof pattern === 'string') {
        if (pattern === hashPath) return { handler, params: {} };
      } else if (pattern instanceof RegExp) {
        const match = hashPath.match(pattern);
        if (match) {
          return { handler, params: match.groups || {} };
        }
      }
    }
    return null;
  }

  /** Check if a route path matches a guard pattern */
  _matchGuard(guardPattern, path) {
    if (typeof guardPattern === 'string') return path.startsWith(guardPattern);
    if (guardPattern instanceof RegExp) return guardPattern.test(path);
    return false;
  }

  /** Resolve current hash and render the matching module */
  async resolve() {
    const hash = window.location.hash.slice(1) || '/home';
    const [path, queryString] = hash.split('?');
    const params = parseQueryString(queryString);

    // Run guards
    for (const guard of this.guards) {
      if (this._matchGuard(guard.pattern, path)) {
        const allowed = await guard.fn(path, params);
        if (!allowed) return; // guard handled redirect
      }
    }

    // Destroy current module
    if (this._currentHandler && typeof this._currentHandler.destroy === 'function') {
      this._currentHandler.destroy();
    }
    this._currentHandler = null;

    // Match and render
    const matched = this.matchRoute(path);
    if (matched) {
      const container = document.getElementById('content');
      if (container) {
        // Emit module change
        const moduleName = path.split('/')[1] || 'home';
        state.setCurrentModule(moduleName);

        // Render
        try {
          await matched.handler.render(params, container);
          this._currentHandler = matched.handler;
        } catch (e) {
          console.error(`[Router] Error rendering ${path}:`, e);
          container.innerHTML = `<div class="flex items-center justify-center h-64"><p class="text-secondary">页面加载失败</p></div>`;
        }
      }
    } else {
      // 404 — redirect to home
      this.navigate('/home');
    }
  }

  /**
   * Navigate to a route.
   * @param {string} path - e.g. '/home' or '/schedule?date=2026-07-03'
   */
  navigate(path) {
    window.location.hash = '#' + path;
  }

  /** Get current route path (without query string) */
  getCurrentPath() {
    const hash = window.location.hash.slice(1) || '/home';
    return hash.split('?')[0];
  }

  /** Get current query params */
  getCurrentParams() {
    const hash = window.location.hash.slice(1) || '/home';
    const [, qs] = hash.split('?');
    return parseQueryString(qs || '');
  }
}

export const router = new Router();
