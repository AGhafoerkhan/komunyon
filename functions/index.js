const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

exports.toggleSessionAttendance = onCall({ region: 'europe-west4' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to manage attendance.');
  const { studyId, date, joined } = request.data || {};
  if (typeof studyId !== 'string' || typeof date !== 'string' || typeof joined !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Invalid attendance request.');
  }
  const studyRef = db.doc(`studies/${studyId}`);
  const attendeeRef = db.doc(`studies/${studyId}/sessions/${date}/attendees/${request.auth.uid}`);
  const summaryRef = db.doc(`studies/${studyId}/sessions/${date}/summary/attendance`);
  await db.runTransaction(async (transaction) => {
    const [studySnap, attendeeSnap, summarySnap] = await Promise.all([
      transaction.get(studyRef),
      transaction.get(attendeeRef),
      transaction.get(summaryRef),
    ]);
    if (!studySnap.exists) throw new HttpsError('not-found', 'Study not found.');
    const study = studySnap.data();
    if (study.hostId !== request.auth.uid && !study.approvedUserIds.includes(request.auth.uid)) {
      throw new HttpsError('permission-denied', 'You are not approved for this study.');
    }
    const wasJoined = attendeeSnap.exists && attendeeSnap.data().joined === true;
    const count = summarySnap.exists && Number.isInteger(summarySnap.data().attendingCount)
      ? summarySnap.data().attendingCount : 0;
    if (joined && !wasJoined && count >= study.maxCapacity) {
      throw new HttpsError('resource-exhausted', 'This session is full.');
    }
    const delta = joined === wasJoined ? 0 : joined ? 1 : -1;
    transaction.set(attendeeRef, { uid: request.auth.uid, joined, updatedAt: new Date().toISOString() });
    transaction.set(summaryRef, { attendingCount: Math.max(0, count + delta), updatedAt: new Date().toISOString() });
  });
  return { joined };
});
