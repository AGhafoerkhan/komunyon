/** Keep these aligned with firestore.rules and storage.rules. */
export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  ageMin: 1,
  ageMax: 120,
  bioMax: 800,
  titleMax: 120,
  titleMin: 10,
  descriptionMax: 2000,
  sessionDescriptionMax: 4000,
  addressMax: 180,
  entryNotesMax: 1000,
  capacityMax: 100,
  avatarBytes: 5 * 1024 * 1024,
  sessionTextBytes: 1024 * 1024,
  sessionAudioBytes: 32 * 1024 * 1024,
  /** Matches `validPhoto` in firestore.rules. */
  photoUrlMax: 24000,
} as const;
