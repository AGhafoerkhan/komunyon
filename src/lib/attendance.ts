import { collection, doc, getDocs, onSnapshot, runTransaction, type Unsubscribe } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';

export type SessionAttendance = {
  uid: string;
  joined: boolean;
};

function attendanceRef(studyId: string, date: string, uid: string) {
  return doc(getFirebase().db, 'studies', studyId, 'sessions', date, 'attendees', uid);
}

function summaryRef(studyId: string, date: string) {
  return doc(getFirebase().db, 'studies', studyId, 'sessions', date, 'summary', 'attendance');
}

export async function setSessionAttendance(
  studyId: string,
  date: string,
  uid: string,
  joined: boolean,
  capacity: number,
): Promise<void> {
  await runTransaction(getFirebase().db, async (transaction) => {
    const userRef = attendanceRef(studyId, date, uid);
    const currentUser = await transaction.get(userRef);
    const summary = await transaction.get(summaryRef(studyId, date));
    const alreadyJoined = currentUser.exists() && currentUser.data().joined === true;
    const currentCount = summary.exists() && typeof summary.data().attendingCount === 'number'
      ? summary.data().attendingCount
      : 0;
    if (joined && !alreadyJoined && currentCount >= capacity) throw new Error('This session is full.');
    const delta = joined === alreadyJoined ? 0 : joined ? 1 : -1;
    transaction.set(userRef, { uid, joined, updatedAt: new Date().toISOString() });
    transaction.set(summaryRef(studyId, date), {
      attendingCount: Math.max(0, currentCount + delta),
      updatedAt: new Date().toISOString(),
    });
  });
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
