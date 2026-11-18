import type { StudyTag } from '@/lib/tags';

/** 0 = Sunday … 6 = Saturday. Matches `Date.getDay()`. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** `recurring` uses `dayOfWeek` + `time`. `one-off` uses `date` + `time`. */
export type StudyFormat = 'recurring' | 'one-off';

export type { StudyTag };

export type JoinRequestStatus = 'pending' | 'approved' | 'declined';

/**
 * `users/{uid}`. `photoURL` is a Google account URL or a small JPEG stored on this document.
 * `profileCompleted` stays false until a picture, name, age, place, and phone number are saved.
 */
export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  age: number;
  photoURL: string;
  bio: string;
  country: string;
  city: string;
  neighbourhood: string;
  phone: string;
  profileCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * `studies/{studyId}` — listed studies are readable by signed-in users.
 * A private study is readable by the host, people they invited, and approved members.
 * Street address and entry notes are never fields on this document.
 */
export interface BibleStudy {
  id: string;
  hostId: string;
  hostName: string;
  hostAge: number;
  hostPhotoURL: string;
  title: string;
  description: string;
  /** What happens at the gathering. A group may carry more than one. */
  tags: StudyTag[];
  format: StudyFormat;
  /** Set for `recurring`. Null for `one-off`. */
  dayOfWeek: DayOfWeek | null;
  /** `YYYY-MM-DD` for `one-off`. Null for `recurring`. */
  date: string | null;
  /** 24-hour `HH:mm`. */
  time: string;
  maxCapacity: number;
  /** Neighbourhood in The Hague, never a street address. */
  area: string;
  /** False hides the study from everyone except the host. */
  isPublic: boolean;
  showMemberContacts: boolean;
  pendingUserIds: string[];
  approvedUserIds: string[];
  /** People the host invited. They can read the study, not the address, until they accept. */
  invitedUserIds: string[];
  /** `YYYY-MM-DD` sessions of a recurring study that will not meet. */
  skippedDates: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * `studies/{studyId}/private/details`.
 * Readable only by the host and users in `approvedUserIds`.
 */
export interface PrivateStudyDetails {
  exactAddress: string;
  entryNotes: string;
  updatedAt: string;
}

/**
 * View of someone asking to join, or already approved.
 * Persistence is the uid arrays on `BibleStudy`; profiles are read from `users/{uid}`.
 * Declined requests are removed from `pendingUserIds` and are not stored.
 */
export interface JoinRequest {
  id: string;
  studyId: string;
  userId: string;
  fullName: string;
  age: number;
  photoURL: string;
  bio: string;
  phone: string;
  place: string;
  status: JoinRequestStatus;
  profileMissing: boolean;
}

/** Fields the host form collects before they are split across the two documents. */
export interface StudyDraft {
  title: string;
  description: string;
  tags: StudyTag[];
  format: StudyFormat;
  dayOfWeek: DayOfWeek | null;
  date: string | null;
  time: string;
  maxCapacity: number;
  area: string;
  isPublic: boolean;
  /** Recurring sessions, as `YYYY-MM-DD`, that will not meet. */
  skippedDates: string[];
  exactAddress: string;
  entryNotes: string;
}
