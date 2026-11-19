export const STUDY_TAGS = [
  { id: 'bible-study', label: 'Study' },
  { id: 'prayer', label: 'Prayer' },
  { id: 'worship', label: 'Worship' },
  { id: 'communion', label: 'Communion' },
  { id: 'event', label: 'Event' },
] as const;

export type StudyTag = (typeof STUDY_TAGS)[number]['id'];

const TAG_IDS = STUDY_TAGS.map((tag) => tag.id);

export function isStudyTag(value: unknown): value is StudyTag {
  return typeof value === 'string' && TAG_IDS.some((id) => id === value);
}

export function tagLabel(id: StudyTag): string {
  return STUDY_TAGS.find((tag) => tag.id === id)?.label ?? id;
}

/** Keep the chip order stable: Study, Prayer, Worship, Communion, Event. */
export function sortTags(tags: readonly StudyTag[]): StudyTag[] {
  return TAG_IDS.filter((id) => tags.includes(id));
}
