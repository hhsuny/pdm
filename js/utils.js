// utils.js — Utility functions

/** Generate a simple UUID v4 */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Get today's date string "YYYY-MM-DD" */
export function today() {
  return formatDate(new Date());
}

/** Format a Date to "YYYY-MM-DD" */
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format date as "YYYY-MM" */
export function formatYearMonth(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Parse "YYYY-MM-DD" to Date */
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Add days to a date string */
export function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

/** Get the start of the week (Monday) for a date string */
export function getWeekStart(dateStr) {
  const d = parseDate(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

/** Get ISO week number */
export function getWeekNumber(dateStr) {
  const d = parseDate(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

/** Get "YYYY-Www" period string */
export function getWeekPeriod(dateStr) {
  const d = parseDate(dateStr);
  return `${d.getFullYear()}-W${String(getWeekNumber(dateStr)).padStart(2, '0')}`;
}

/** Get all dates in the week containing dateStr (Monday-Sunday) */
export function getWeekDates(dateStr) {
  const start = getWeekStart(dateStr);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(start, i));
  }
  return dates;
}

/** Get nice display for a date */
export function niceDate(dateStr) {
  const t = today();
  if (dateStr === t) return '今天';
  if (dateStr === addDays(t, -1)) return '昨天';
  if (dateStr === addDays(t, 1)) return '明天';
  const d = parseDate(dateStr);
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${days[d.getDay()]}`;
}

/** Get month string */
export function niceMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${y}年${m}月`;
}

/** Escape HTML to prevent XSS */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Parse query string from URL hash or search */
export function parseQueryString(str) {
  if (!str) return {};
  const params = {};
  str.split('&').forEach(pair => {
    const [key, val] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || '');
  });
  return params;
}

/** Build query string */
export function buildQueryString(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** Debounce function */
export function debounce(fn, ms = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/** Throttle function */
export function throttle(fn, ms = 300) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn.apply(this, args); }
  };
}

/** Event delegation helper: returns cleanup function */
export function delegate(container, selector, event, handler) {
  const fn = (e) => {
    const el = e.target.closest(selector);
    if (el && container.contains(el)) handler(e, el);
  };
  container.addEventListener(event, fn);
  return () => container.removeEventListener(event, fn);
}

/** Simple deep clone via JSON */
export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Format number with comma separators */
export function formatNumber(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('zh-CN');
}

/** Format currency */
export function formatCurrency(n) {
  if (n == null) return '¥0.00';
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format minutes to "Xh Ym" or "Xm" */
export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0分钟';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}小时${m}分钟`;
  if (h > 0) return `${h}小时`;
  return `${m}分钟`;
}

/** Time string "HH:MM" to minutes */
export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes to "HH:MM" */
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Get relative time string */
export function timeAgo(dateStr) {
  const now = Date.now();
  const then = parseDate(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
  return niceDate(dateStr);
}
