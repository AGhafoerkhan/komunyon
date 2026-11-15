/** Keep these aligned with firestore.rules and storage.rules. */
export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  ageMin: 1,
  ageMax: 120,
  bioMax: 800,
  titleMax: 120,
  descriptionMax: 2000,
  addressMax: 180,
  entryNotesMax: 1000,
  capacityMax: 100,
  avatarBytes: 5 * 1024 * 1024,
} as const;
