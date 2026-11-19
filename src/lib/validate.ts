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

export const CHECK_AGAIN = 'An input is incorrect. Check again.';

export type ProfileField = 'photo' | 'fullName' | 'age' | 'country' | 'city' | 'neighbourhood' | 'bio' | 'phone';

export function validateProfile(input: {
  fullName: string;
  age: string;
  bio: string;
  country: string;
  city: string;
  neighbourhood: string;
  phone: string;
  hasPhoto: boolean;
}): Partial<Record<ProfileField, string>> {
  const errors: Partial<Record<ProfileField, string>> = {};
  if (!input.hasPhoto) errors.photo = 'Add a profile picture.';
  const name = input.fullName.trim();
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    errors.fullName = `Enter your full name (${LIMITS.nameMin}–${LIMITS.nameMax} characters).`;
  }
  if (!/^\d+$/.test(input.age.trim())) errors.age = 'Enter your age as a whole number.';
  else {
    const age = Number(input.age);
    if (age < LIMITS.ageMin || age > LIMITS.ageMax) {
      errors.age = `Age needs to be between ${LIMITS.ageMin} and ${LIMITS.ageMax}.`;
    }
  }
  if (!isCountry(input.country)) errors.country = 'Choose your country.';
  const city = input.city.trim();
  if (city.length < 2 || city.length > 80) errors.city = 'Enter your city.';
  const neighbourhood = input.neighbourhood.trim();
  if (city === 'The Hague' && !isHagueArea(neighbourhood)) errors.neighbourhood = 'Choose your neighbourhood in The Hague.';
  else if (neighbourhood.length > 80) errors.neighbourhood = 'Neighbourhood needs to be 80 characters or fewer.';
  const bio = input.bio.trim();
  if (bio.length > LIMITS.bioMax) errors.bio = `Bio needs to be ${LIMITS.bioMax} characters or fewer.`;
  if (!normalizePhone(input.phone)) errors.phone = 'Enter a phone number, including the country code.';
  return errors;
}

export type StudyField =
  | 'title'
  | 'description'
  | 'tags'
  | 'day'
  | 'date'
  | 'time'
  | 'area'
  | 'maxCapacity'
  | 'exactAddress'
  | 'entryNotes';

export function validateStudyDraft(draft: StudyDraft, minCapacity: number): Partial<Record<StudyField, string>> {
  const errors: Partial<Record<StudyField, string>> = {};
  const title = draft.title.trim();
  if (title.length < LIMITS.titleMin || title.length > LIMITS.titleMax) {
    errors.title = `Title must be between ${LIMITS.titleMin} and ${LIMITS.titleMax} characters.`;
  }
  const description = draft.description.trim();
  if (description.length < LIMITS.descriptionMin || description.length > LIMITS.descriptionMax) {
    errors.description = `Description must be between ${LIMITS.descriptionMin} and ${LIMITS.descriptionMax} characters.`;
  }
  if (
    draft.tags.length === 0 ||
    draft.tags.length > STUDY_TAGS.length ||
    new Set(draft.tags).size !== draft.tags.length ||
    draft.tags.some((tag) => !isStudyTag(tag))
  ) {
    errors.tags = 'Choose at least one: study, prayer/worship, communion, event, or dinner.';
  }
  if (draft.format === 'recurring' && draft.dayOfWeek === null) errors.day = 'Choose the day of the week.';
  if (draft.format === 'one-off' && (draft.date === null || !isIsoDate(draft.date))) errors.date = 'Choose a date.';
  if (normalizeTime(draft.time) === null) errors.time = 'Choose a time.';
  if (!isHagueArea(draft.area)) errors.area = 'Choose a neighbourhood in The Hague.';
  if (!Number.isInteger(draft.maxCapacity) || draft.maxCapacity < minCapacity || draft.maxCapacity > LIMITS.capacityMax) {
    errors.maxCapacity =
      minCapacity > 1
        ? `Capacity must be at least ${minCapacity}, the number of people already approved.`
        : `Capacity must be between 1 and ${LIMITS.capacityMax}.`;
  }
  const address = draft.exactAddress.trim();
  if (address.length === 0 || address.length > LIMITS.addressMax) {
    errors.exactAddress = `Add the exact address (up to ${LIMITS.addressMax} characters). It stays private until you approve someone.`;
  }
  if (draft.entryNotes.trim().length > LIMITS.entryNotesMax) {
    errors.entryNotes = `Entry notes need to be ${LIMITS.entryNotesMax} characters or fewer.`;
  }
  return errors;
}
