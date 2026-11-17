import { collection, doc, getDocs, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';

export type SessionAttendance = {
  uid: string;
  joined: boolean;
};

function attendanceRef(studyId: string, date: string, uid: string) {
  return doc(getFirebase().db, 'studies', studyId, 'sessions', date, 'attendees', uid);
}

export async function setSessionAttendance(
  studyId: string,
  date: string,
  uid: string,
  joined: boolean,
  capacity: number,
): Promise<void> {
  const attendance = await loadSessionAttendance(studyId, date);
  const alreadyJoined = attendance.some((record) => record.uid === uid && record.joined);
  const joinedCount = attendance.filter((record) => record.joined).length;
  if (joined && !alreadyJoined && joinedCount >= capacity) throw new Error('This session is full.');
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

export function subscribeSessionAttendanceList(
  studyId: string,
  date: string,
  onData: (records: SessionAttendance[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebase().db, 'studies', studyId, 'sessions', date, 'attendees'),
    (snapshot) => {
      onData(
        snapshot.docs.flatMap((item) => {
          const data = item.data();
          return typeof data.uid === 'string' && typeof data.joined === 'boolean'
            ? [{ uid: data.uid, joined: data.joined }]
            : [];
        }),
      );
    },
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
