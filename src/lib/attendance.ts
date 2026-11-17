import { collection, doc, getDocs, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';

export type SessionAttendance = {
  uid: string;
  joined: boolean;
};

function attendanceRef(studyId: string, date: string, uid: string) {
  return doc(getFirebase().db, 'studies', studyId, 'sessions', date, 'attendees', uid);
}

export async function setSessionAttendance(studyId: string, date: string, uid: string, joined: boolean): Promise<void> {
  await setDoc(attendanceRef(studyId, date, uid), { uid, joined, updatedAt: new Date().toISOString() });
}

export function subscribeSessionAttendance(
  studyId: string,
  date: string,
  uid: string,
  onData: (joined: boolean) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    attendanceRef(studyId, date, uid),
    (snapshot) => onData(snapshot.exists() && snapshot.data().joined === true),
    onError,
  );
}

export async function loadSessionAttendance(studyId: string, date: string): Promise<SessionAttendance[]> {
  const snapshot = await getDocs(collection(getFirebase().db, 'studies', studyId, 'sessions', date, 'attendees'));
  return snapshot.docs.flatMap((item) => {
    const data = item.data();
    return typeof data.uid === 'string' && typeof data.joined === 'boolean' ? [{ uid: data.uid, joined: data.joined }] : [];
  });
}
