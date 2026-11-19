import { isHagueArea } from '@/lib/hague';
import { isStudyTag, sortTags, type StudyTag } from '@/lib/tags';
import { isDayOfWeek, isIsoDate, normalizeTime } from '@/lib/guards';
import type { BibleStudy, PrivateStudyDetails, StudyFormat, UserProfile } from '@/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isFormat(value: unknown): value is StudyFormat {
  return value === 'recurring' || value === 'one-off';
}

/** Missing tags stay empty so studies created before tags still load. */
function parseTags(value: unknown): StudyTag[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) return null;
  const compatible = value.map((item) => item === 'prayer' || item === 'worship' ? 'prayer-worship' : item);
  if (!compatible.every((item) => isStudyTag(item))) return null;
  const tags = sortTags(compatible as StudyTag[]);
  if (tags.length !== new Set(compatible).size) return null;
  return tags;
}

export function parseUserProfile(id: string, data: unknown, fallbackEmail = ''): UserProfile | null {
  if (!isRecord(data)) return null;
  if (data.email !== undefined && typeof data.email !== 'string') return null;
  if (typeof data.fullName !== 'string') return null;
  if (typeof data.age !== 'number' || !Number.isInteger(data.age)) return null;
  if (typeof data.photoURL !== 'string') return null;
  if (typeof data.bio !== 'string') return null;
  if (typeof data.profileCompleted !== 'boolean') return null;
  if (typeof data.createdAt !== 'string' || typeof data.updatedAt !== 'string') return null;

  return {
    uid: id,
    email: typeof data.email === 'string' ? data.email : fallbackEmail,
    fullName: data.fullName,
    age: data.age,
    photoURL: data.photoURL,
    bio: data.bio,
    country: typeof data.country === 'string' ? data.country : '',
    city: typeof data.city === 'string' ? data.city : '',
    neighbourhood: typeof data.neighbourhood === 'string' ? data.neighbourhood : '',
    phone: typeof data.phone === 'string' ? data.phone : '',
    profileCompleted: data.profileCompleted,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function parseBibleStudy(id: string, data: unknown): BibleStudy | null {
  if (!isRecord(data)) return null;
  if (!isFormat(data.format)) return null;
  if (typeof data.hostId !== 'string' || data.hostId.length === 0) return null;
  if (typeof data.hostName !== 'string') return null;
  if (typeof data.hostAge !== 'number' || !Number.isInteger(data.hostAge)) return null;
  if (typeof data.hostPhotoURL !== 'string') return null;
  if (typeof data.title !== 'string' || typeof data.description !== 'string') return null;
  const tags = parseTags(data.tags);
  if (!tags) return null;
  if (typeof data.time !== 'string' || normalizeTime(data.time) === null) return null;
  if (typeof data.maxCapacity !== 'number' || !Number.isInteger(data.maxCapacity)) return null;
  if (typeof data.area !== 'string' || !isHagueArea(data.area)) return null;
  if (data.isPublic !== undefined && typeof data.isPublic !== 'boolean') return null;
  if (data.approvedCount !== undefined && (!Number.isInteger(data.approvedCount) || (data.approvedCount as number) < 0)) return null;
  // These arrays are accepted only as a legacy-read path during staged migration.
  if (data.pendingUserIds !== undefined && !isStringArray(data.pendingUserIds)) return null;
  if (data.approvedUserIds !== undefined && !isStringArray(data.approvedUserIds)) return null;
  if (data.invitedUserIds !== undefined && !isStringArray(data.invitedUserIds)) return null;
  if (typeof data.createdAt !== 'string' || typeof data.updatedAt !== 'string') return null;

  if (data.format === 'recurring') {
    if (!isDayOfWeek(data.dayOfWeek) || data.date !== null) return null;
  } else if (typeof data.date !== 'string' || !isIsoDate(data.date) || data.dayOfWeek !== null) {
    return null;
  }

  return {
    id,
    hostId: data.hostId,
    hostName: data.hostName,
    hostAge: data.hostAge,
    hostPhotoURL: data.hostPhotoURL,
    title: data.title,
    description: data.description,
    tags,
    format: data.format,
    dayOfWeek: data.format === 'recurring' && isDayOfWeek(data.dayOfWeek) ? data.dayOfWeek : null,
    date: data.format === 'one-off' && typeof data.date === 'string' ? data.date : null,
    time: data.time,
    maxCapacity: data.maxCapacity,
    area: data.area,
    isPublic: data.isPublic !== false,
    showMemberContacts: data.showMemberContacts !== false,
    approvedCount: typeof data.approvedCount === 'number' ? data.approvedCount : (Array.isArray(data.approvedUserIds) ? data.approvedUserIds.length : 0),
    pendingUserIds: isStringArray(data.pendingUserIds) ? data.pendingUserIds : [],
    approvedUserIds: isStringArray(data.approvedUserIds) ? data.approvedUserIds : [],
    invitedUserIds: isStringArray(data.invitedUserIds) ? data.invitedUserIds : [],
    skippedDates: skippedDates(data.skippedDates),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function skippedDates(value: unknown): string[] {
  if (!isStringArray(value)) return [];
  return value.filter((date) => isIsoDate(date)).slice(0, 12);
}

export function parsePrivateDetails(data: unknown): PrivateStudyDetails | null {
  if (!isRecord(data)) return null;
  if (typeof data.exactAddress !== 'string' || data.exactAddress.trim().length === 0) return null;
  if (typeof data.entryNotes !== 'string') return null;
  if (typeof data.updatedAt !== 'string') return null;
  return {
    exactAddress: data.exactAddress,
    entryNotes: data.entryNotes,
    updatedAt: data.updatedAt,
  };
}
