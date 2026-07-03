// file-storage.js — File System Access API for local file persistence
// Only works on desktop Chrome/Edge. Mobile falls back silently.

let _fileHandle = null;

/** Check if File System Access API is supported */
export function isSupported() {
  return 'showSaveFilePicker' in window;
}

/**
 * Ask user to pick (or create) a file for auto-save.
 * Returns the file name if successful, null otherwise.
 */
export async function pickSaveFile(suggestedName = 'pdm-backup.json') {
  if (!isSupported()) return null;

  try {
    _fileHandle = await window.showSaveFilePicker({
      suggestedName,
      types: [{
        description: 'JSON Data',
        accept: { 'application/json': ['.json'] }
      }]
    });
    return _fileHandle.name;
  } catch (e) {
    if (e.name === 'AbortError') return null; // user cancelled
    console.warn('[FileStorage] save file picker error:', e);
    return null;
  }
}

/**
 * Ask user to open an existing backup file.
 * Returns parsed JSON data if successful, null otherwise.
 */
export async function openBackupFile() {
  if (!isSupported()) return null;

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'JSON Data',
        accept: { 'application/json': ['.json'] }
      }],
      multiple: false
    });
    const file = await handle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'AbortError') return null;
    console.warn('[FileStorage] open file error:', e);
    return null;
  }
}

/**
 * Write data to the previously selected save file.
 */
export async function autoSave(data) {
  if (!_fileHandle || !isSupported()) return false;

  try {
    // Verify permission
    const opts = { mode: 'readwrite' };
    if (await _fileHandle.queryPermission(opts) !== 'granted') {
      const granted = await _fileHandle.requestPermission(opts);
      if (granted !== 'granted') {
        _fileHandle = null;
        return false;
      }
    }

    const writable = await _fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch (e) {
    console.warn('[FileStorage] autoSave error:', e);
    _fileHandle = null;
    return false;
  }
}

/** Check if we have an active file handle for auto-saving */
export function hasActiveFile() {
  return _fileHandle !== null && isSupported();
}

/** Get the active file name */
export function getFileName() {
  return _fileHandle?.name || null;
}

/** Reset the file handle (e.g. when user wants to pick a different file) */
export function resetFile() {
  _fileHandle = null;
}
