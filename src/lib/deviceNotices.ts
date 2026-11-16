import type { HostNotice } from '@/lib/studies';

export type DeviceNoticePermission = NotificationPermission | 'unsupported';

export function deviceNoticePermission(): DeviceNoticePermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function installedApp(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia('(display-mode: standalone)').matches;
}

export async function askDeviceNotices(): Promise<DeviceNoticePermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

const ASKED_PREFIX = 'komunyon-notice-asked:';

let noticeAsk: { uid: string; started: number; promise: Promise<DeviceNoticePermission> } | null = null;

export function beginNoticeAsk(uid: string): { started: number; promise: Promise<DeviceNoticePermission> } | null {
  if (typeof window === 'undefined') return null;
  if (noticeAsk?.uid === uid) return noticeAsk;
  if (sessionStorage.getItem(ASKED_PREFIX + uid) === '1') return null;
  sessionStorage.setItem(ASKED_PREFIX + uid, '1');
  noticeAsk = { uid, started: performance.now(), promise: askDeviceNotices() };
  return noticeAsk;
}

export function clearNoticeAsk(): void {
  noticeAsk = null;
  if (typeof window === 'undefined') return;
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(ASKED_PREFIX)) sessionStorage.removeItem(key);
  }
}

const ENABLED_KEY = 'komunyon-notices';

export function noticesEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(ENABLED_KEY);
  if (stored === 'on') return true;
  if (stored === 'off') return false;
  return deviceNoticePermission() === 'granted';
}

export async function setNoticesEnabled(on: boolean): Promise<void> {
  localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off');
  if (on || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const open = (await registration?.getNotifications()) ?? [];
  open.forEach((notice) => notice.close());
}

export function noticeLine(notice: HostNotice): string {
  if (notice.kind === 'left') return `${notice.fullName} left`;
  if (notice.kind === 'cancelled') return `${notice.fullName} cancelled`;
  if (notice.kind === 'accepted') return `${notice.fullName} accepted`;
  if (notice.kind === 'declined') return `${notice.fullName} declined`;
  if (notice.kind === 'invite') return `${notice.fullName} invited you`;
  return `${notice.fullName} requested to join`;
}

export async function showDeviceNotice(notice: HostNotice): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window) || !noticesEnabled()) return;
  if (Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(notice.studyTitle, {
    body: noticeLine(notice),
    icon: '/icons/icon-192.png',
    tag: notice.id,
    data: { href: `/studies/${notice.studyId}` },
  });
}
