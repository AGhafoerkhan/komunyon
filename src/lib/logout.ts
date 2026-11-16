import { signOut } from 'firebase/auth';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase';

let started = false;

/** Sign out on this site, wipe what the page is allowed to wipe, then open the home page. */
export async function leaveCompletely(): Promise<void> {
  if (started || typeof window === 'undefined') return;
  started = true;
  const home = window.location.hostname === 'komunyon.vercel.app' ? 'https://komunyon.vercel.app/' : '/';
  window.setTimeout(() => window.location.replace(home), 2000);
  try {
    await within(signOutIfPossible(), 800);
    await within(dropPermissions(), 400);
    await within(clearSiteData(), 800);
  } finally {
    window.location.replace(home);
  }
}

function within(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    work.then(
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      () => {
        window.clearTimeout(timer);
        resolve();
      },
    );
  });
}

async function signOutIfPossible(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await signOut(getFirebase().auth);
  } catch {
    // The stored session is removed below even if Firebase is already signed out.
  }
}

async function dropPermissions(): Promise<void> {
  await navigator.credentials?.preventSilentAccess?.().catch(() => undefined);
  const permissions = navigator.permissions as Permissions & {
    revoke?: (descriptor: PermissionDescriptor) => Promise<PermissionStatus>;
  };
  if (!permissions.revoke) return;
  const names = [
    'notifications',
    'push',
    'geolocation',
    'camera',
    'microphone',
    'midi',
    'background-sync',
    'persistent-storage',
  ] as const;
  await Promise.all(
    names.map((name) => permissions.revoke?.({ name } as PermissionDescriptor).catch(() => undefined)),
  );
}

async function clearSiteData(): Promise<void> {
  clearCookies();
  window.localStorage.clear();
  window.sessionStorage.clear();
  await Promise.all([clearDatabases(), clearWorkers()]);
}

function clearCookies(): void {
  const names = document.cookie
    .split(';')
    .map((cookie) => cookie.split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name));
  const host = window.location.hostname;
  const domains = new Set<string>([host]);
  const labels = host.split('.');
  if (labels.length > 1) domains.add(`.${labels.slice(-2).join('.')}`);
  const expires = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; ${expires}; path=/; domain=${domain}`;
    }
    document.cookie = `${name}=; ${expires}; path=/`;
  }
}

async function clearDatabases(): Promise<void> {
  const names = new Set([
    'firebaseLocalStorageDb',
    'firebase-heartbeat-database',
    'firebase-installations-database',
  ]);
  if (typeof indexedDB.databases === 'function') {
    const existing = await indexedDB.databases().catch(() => []);
    existing.forEach((database) => {
      if (database.name) names.add(database.name);
    });
  }
  await Promise.all([...names].map((name) => clearDatabase(name).then(() => deleteDatabase(name))));
}

function clearDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const open = indexedDB.open(name);
    const done = () => resolve();
    open.onerror = done;
    open.onblocked = done;
    open.onsuccess = () => {
      const db = open.result;
      const stores = [...db.objectStoreNames];
      if (stores.length === 0) {
        db.close();
        done();
        return;
      }
      try {
        const tx = db.transaction(stores, 'readwrite');
        stores.forEach((store) => tx.objectStore(store).clear());
        tx.oncomplete = () => {
          db.close();
          done();
        };
        tx.onerror = () => {
          db.close();
          done();
        };
        tx.onabort = () => {
          db.close();
          done();
        };
      } catch {
        db.close();
        done();
      }
    };
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function clearWorkers(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(
      registrations.map(async (registration) => {
        const subscription = await registration.pushManager?.getSubscription().catch(() => null);
        await subscription?.unsubscribe().catch(() => undefined);
        const notices = (await registration.getNotifications().catch(() => [])) ?? [];
        notices.forEach((notice) => notice.close());
        await registration.unregister().catch(() => undefined);
      }),
    );
  }
  if ('caches' in window) {
    const keys = await caches.keys().catch(() => []);
    await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
  }
}
