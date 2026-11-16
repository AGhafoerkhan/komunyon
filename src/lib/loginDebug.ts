const FLAG_KEY = 'komunyon-login-debug';
const LOG_KEY = 'komunyon-login-log';
const MAX_LINES = 120;

const listeners = new Set<() => void>();
let lines: string[] | null = null;

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeLoginDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loginDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const requested = new URLSearchParams(window.location.search).get('debug') === '1';
  return requested || sessionStorage.getItem(FLAG_KEY) === '1';
}

export function captureLoginDebugRequest(): void {
  if (typeof window === 'undefined') return;
  if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
  if (sessionStorage.getItem(FLAG_KEY) === '1') return;
  sessionStorage.setItem(FLAG_KEY, '1');
  emit();
}

function storedLines(): string[] {
  if (lines) return lines;
  try {
    const saved = sessionStorage.getItem(LOG_KEY);
    const parsed = saved ? (JSON.parse(saved) as unknown) : [];
    lines = Array.isArray(parsed) ? parsed.filter((line) => typeof line === 'string') : [];
  } catch {
    lines = [];
  }
  return lines;
}

export function loginLogLines(): string[] {
  if (typeof window === 'undefined') return [];
  return storedLines();
}

export function loginLog(message: string): void {
  if (!loginDebugEnabled()) return;
  const stamp = new Date().toISOString().slice(11, 23);
  const next = [...storedLines(), `${stamp} ${message}`].slice(-MAX_LINES);
  lines = next;
  sessionStorage.setItem(LOG_KEY, JSON.stringify(next));
  emit();
}

export function clearLoginDebug(): void {
  lines = [];
  sessionStorage.removeItem(FLAG_KEY);
  sessionStorage.removeItem(LOG_KEY);
  const url = new URL(window.location.href);
  url.searchParams.delete('debug');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, '', next);
  emit();
}

function redactKey(key: string): string {
  return key.replace(/AIza[0-9A-Za-z_-]+/g, '[api-key]');
}

export function readableCookieLines(): string[] {
  if (!document.cookie.trim()) return ['cookies: none readable by the page'];
  return document.cookie.split(';').map((part) => {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    const name = eq === -1 ? trimmed : trimmed.slice(0, eq);
    const value = eq === -1 ? '' : trimmed.slice(eq + 1);
    const sensitive = /auth|session|token|firebase|sid/i.test(name) || value.length > 24;
    return sensitive ? `cookie ${name}: present, length ${value.length}` : `cookie ${name}=${value}`;
  });
}

export function storageKeyLines(storage: Storage, label: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !/firebase|komunyon|google/i.test(key)) continue;
    keys.push(`${label} ${redactKey(key)}`);
  }
  return keys.length > 0 ? keys : [`${label}: none`];
}

export function readAuthIndexedDb(): Promise<string[]> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open('firebaseLocalStorageDb');
    } catch (error) {
      resolve([`indexedDB: unavailable (${error instanceof Error ? error.name : 'error'})`]);
      return;
    }
    request.onerror = () => resolve([`indexedDB: ${request.error?.name ?? 'could not open'}`]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
        db.close();
        resolve(['indexedDB: no saved login']);
        return;
      }
      const tx = db.transaction('firebaseLocalStorage', 'readonly');
      const keys = tx.objectStore('firebaseLocalStorage').getAllKeys();
      keys.onerror = () => {
        db.close();
        resolve(['indexedDB: could not read login keys']);
      };
      keys.onsuccess = () => {
        const found = keys.result.map((key) => `indexedDB ${redactKey(String(key))}`);
        db.close();
        resolve(found.length > 0 ? found : ['indexedDB: store empty']);
      };
    };
  });
}
