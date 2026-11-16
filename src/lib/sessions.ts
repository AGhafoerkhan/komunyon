import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { LIMITS } from '@/lib/limits';

function sessionRef(studyId: string, date: string) {
  return doc(getFirebase().db, 'studies', studyId, 'sessions', date);
}

export async function loadSessionDescription(studyId: string, date: string): Promise<string> {
  const snap = await getDoc(sessionRef(studyId, date));
  if (!snap.exists()) return '';
  const description = snap.data().description;
  return typeof description === 'string' ? description : '';
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

export async function deleteSessionNotes(studyId: string): Promise<void> {
  const notes = await getDocs(collection(getFirebase().db, 'studies', studyId, 'sessions'));
  await Promise.all(notes.docs.map((item) => deleteDoc(item.ref)));
}
