import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { isIsoDate } from '@/lib/guards';
import { LIMITS } from '@/lib/limits';
import { listSessionFileDates } from '@/lib/photos';

function sessionRef(studyId: string, date: string) {
  return doc(getFirebase().db, 'studies', studyId, 'sessions', date);
}

export async function loadSessionDescription(studyId: string, date: string): Promise<{ text: string; updatedAt: string | null }> {
  const snap = await getDoc(sessionRef(studyId, date));
  if (!snap.exists()) return { text: '', updatedAt: null };
  const data = snap.data();
  const updatedAt = typeof data.updatedAt === 'string'
    ? data.updatedAt
    : data.updatedAt?.toDate instanceof Function
      ? data.updatedAt.toDate().toISOString()
      : null;
  return { text: typeof data.description === 'string' ? data.description : '', updatedAt };
}

export async function saveSessionDescription(studyId: string, date: string, description: string): Promise<void> {
  const text = description.trim();
  if (text.length > LIMITS.sessionDescriptionMax) {
    throw new Error('The description needs to be 4000 characters or less.');
  }
  await setDoc(sessionRef(studyId, date), {
    description: text,
    updatedAt: new Date().toISOString(),
  });
}

/** Dates that stay in history because a description or a file was saved there. */
export async function listAnchoredSessionDates(studyId: string): Promise<string[]> {
  const notes = await getDocs(collection(getFirebase().db, 'studies', studyId, 'sessions'));
  const described = notes.docs.flatMap((item) => {
    const description = item.data().description;
    return isIsoDate(item.id) && typeof description === 'string' && description.trim() ? [item.id] : [];
  });
  const files = await listSessionFileDates(studyId).catch(() => [] as string[]);
  return [...new Set([...described, ...files])];
}

export async function deleteSessionNotes(studyId: string): Promise<void> {
  const notes = await getDocs(collection(getFirebase().db, 'studies', studyId, 'sessions'));
  await Promise.all(notes.docs.map((item) => deleteDoc(item.ref)));
}
