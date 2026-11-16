export const STUDY_TAGS = [
  { id: 'bible-study', label: 'Bible study' },
  { id: 'prayer', label: 'Prayer' },
  { id: 'worship', label: 'Worship' },
  { id: 'communion', label: 'Communion' },
] as const;

export type StudyTag = (typeof STUDY_TAGS)[number]['id'];

const TAG_IDS = STUDY_TAGS.map((tag) => tag.id);

export function isStudyTag(value: unknown): value is StudyTag {
  return typeof value === 'string' && TAG_IDS.some((id) => id === value);
}

export function tagLabel(id: StudyTag): string {
  return STUDY_TAGS.find((tag) => tag.id === id)?.label ?? id;
}

/** Keep the chip order stable: Bible study, Prayer, Worship, Communion. */
export function sortTags(tags: readonly StudyTag[]): StudyTag[] {
  return TAG_IDS.filter((id) => tags.includes(id));
}
