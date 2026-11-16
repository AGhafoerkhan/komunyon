import { isHagueArea } from '@/lib/hague';
import { isStudyTag, STUDY_TAGS } from '@/lib/tags';
import { isIsoDate, normalizeTime } from '@/lib/guards';
import { LIMITS } from '@/lib/limits';
import type { StudyDraft } from '@/types';

export function validateProfile(input: { fullName: string; age: string; bio: string }): string | null {
  const name = input.fullName.trim();
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    return `Enter your full name (${LIMITS.nameMin}–${LIMITS.nameMax} characters).`;
  }
  if (!/^\d+$/.test(input.age.trim())) return 'Enter your age as a whole number.';
  const age = Number(input.age);
  if (age < LIMITS.ageMin || age > LIMITS.ageMax) {
    return `Age needs to be between ${LIMITS.ageMin} and ${LIMITS.ageMax}.`;
  }
  const bio = input.bio.trim();
  if (bio.length === 0) return 'Add a short bio or any pre-requisites.';
  if (bio.length > LIMITS.bioMax) return `Bio needs to be ${LIMITS.bioMax} characters or fewer.`;
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
