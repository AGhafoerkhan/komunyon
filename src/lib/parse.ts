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
  if (!value.every((item) => isStudyTag(item))) return null;
  const tags = sortTags(value);
  if (tags.length !== value.length) return null;
  return tags;
}

export function parseUserProfile(id: string, data: unknown): UserProfile | null {
  if (!isRecord(data)) return null;
  if (typeof data.email !== 'string') return null;
  if (typeof data.fullName !== 'string') return null;
  if (typeof data.age !== 'number' || !Number.isInteger(data.age)) return null;
  if (typeof data.photoURL !== 'string') return null;
  if (typeof data.bio !== 'string') return null;
  if (typeof data.profileCompleted !== 'boolean') return null;
  if (typeof data.createdAt !== 'string' || typeof data.updatedAt !== 'string') return null;

  return {
    uid: id,
    email: data.email,
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
  if (!isStringArray(data.pendingUserIds) || !isStringArray(data.approvedUserIds)) return null;
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
    pendingUserIds: data.pendingUserIds,
    approvedUserIds: data.approvedUserIds,
    invitedUserIds: isStringArray(data.invitedUserIds) ? data.invitedUserIds : [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
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
