import { isHagueArea } from '@/lib/hague';
import { isStudyTag, STUDY_TAGS } from '@/lib/tags';
import { isIsoDate, normalizeTime } from '@/lib/guards';
import { LIMITS } from '@/lib/limits';
import { isCountry } from '@/lib/places';
import type { StudyDraft, UserProfile } from '@/types';

export function normalizePhone(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (!/^\+?[0-9]{8,15}$/.test(compact)) return null;
  return compact;
}

export function isProfileReady(profile: UserProfile | null): boolean {
  if (!profile) return false;
  if (!profile.photoURL || profile.fullName.trim().length < LIMITS.nameMin) return false;
  if (profile.age < LIMITS.ageMin || profile.age > LIMITS.ageMax) return false;
  if (!isCountry(profile.country) || profile.city.trim().length < 2) return false;
  if (profile.city === 'The Hague' && !isHagueArea(profile.neighbourhood)) return false;
  if (!normalizePhone(profile.phone)) return false;
  return true;
}

export function validateProfile(input: {
  fullName: string;
  age: string;
  bio: string;
  country: string;
  city: string;
  neighbourhood: string;
  phone: string;
  hasPhoto: boolean;
}): string | null {
  if (!input.hasPhoto) return 'Add a profile picture.';
  const name = input.fullName.trim();
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    return `Enter your full name (${LIMITS.nameMin}–${LIMITS.nameMax} characters).`;
  }
  if (!/^\d+$/.test(input.age.trim())) return 'Enter your age as a whole number.';
  const age = Number(input.age);
  if (age < LIMITS.ageMin || age > LIMITS.ageMax) {
    return `Age needs to be between ${LIMITS.ageMin} and ${LIMITS.ageMax}.`;
  }
  if (!isCountry(input.country)) return 'Choose your country.';
  const city = input.city.trim();
  if (city.length < 2 || city.length > 80) return 'Enter your city.';
  const neighbourhood = input.neighbourhood.trim();
  if (city === 'The Hague' && !isHagueArea(neighbourhood)) return 'Choose your neighbourhood in The Hague.';
  if (neighbourhood.length > 80) return 'Neighbourhood needs to be 80 characters or fewer.';
  const bio = input.bio.trim();
  if (bio.length > LIMITS.bioMax) return `Bio needs to be ${LIMITS.bioMax} characters or fewer.`;
  if (!normalizePhone(input.phone)) return 'Enter a phone number, including the country code.';
  return null;
}

export function validateStudyDraft(draft: StudyDraft, minCapacity: number): string | null {
  const title = draft.title.trim();
  if (title.length === 0 || title.length > LIMITS.titleMax) {
    return `Add a title (up to ${LIMITS.titleMax} characters).`;
  }
  const description = draft.description.trim();
  if (description.length === 0 || description.length > LIMITS.descriptionMax) {
    return `Add a description (up to ${LIMITS.descriptionMax} characters).`;
  }
  if (
    draft.tags.length === 0 ||
    draft.tags.length > STUDY_TAGS.length ||
    new Set(draft.tags).size !== draft.tags.length ||
    draft.tags.some((tag) => !isStudyTag(tag))
  ) {
    return 'Choose at least one: Bible study, prayer, worship, or communion.';
  }
  if (draft.format === 'recurring' && draft.dayOfWeek === null) return 'Choose the day of the week.';
  if (draft.format === 'one-off' && (draft.date === null || !isIsoDate(draft.date))) return 'Choose a date.';
  if (normalizeTime(draft.time) === null) return 'Choose a time.';
  if (!isHagueArea(draft.area)) return 'Choose a neighbourhood in The Hague.';
  if (!Number.isInteger(draft.maxCapacity) || draft.maxCapacity < minCapacity || draft.maxCapacity > LIMITS.capacityMax) {
    return minCapacity > 1
      ? `Capacity must be at least ${minCapacity}, the number of people already approved.`
      : `Capacity must be between 1 and ${LIMITS.capacityMax}.`;
  }
  const address = draft.exactAddress.trim();
  if (address.length === 0 || address.length > LIMITS.addressMax) {
    return `Add the exact address (up to ${LIMITS.addressMax} characters). It stays private until you approve someone.`;
  }
  if (draft.entryNotes.trim().length > LIMITS.entryNotesMax) {
    return `Entry notes need to be ${LIMITS.entryNotesMax} characters or fewer.`;
  }
  return null;
}
