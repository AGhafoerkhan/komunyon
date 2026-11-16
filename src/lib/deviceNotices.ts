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

export function noticeLine(notice: HostNotice): string {
  if (notice.kind === 'left') return `${notice.fullName} left`;
  if (notice.kind === 'cancelled') return `${notice.fullName} cancelled`;
  return `${notice.fullName} requested to join`;
}

export async function showDeviceNotice(notice: HostNotice): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(notice.studyTitle, {
    body: noticeLine(notice),
    icon: '/icons/icon-192.png',
    tag: notice.id,
    data: { href: `/studies/${notice.studyId}` },
  });
}
