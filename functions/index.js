const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

initializeApp();
const db = getFirestore();

const HAGUE_AREAS = new Set([
  'Centrum', 'Scheveningen', 'Statenkwartier', 'Duinoord', 'Zeeheldenkwartier',
  'Archipelbuurt', 'Bezuidenhout', 'Mariahoeve', 'Haagse Hout', 'Segbroek',
  'Regentessekwartier', 'Transvaalkwartier', 'Schildersbuurt', 'Laak', 'Binckhorst',
  'Escamp', 'Moerwijk', 'Loosduinen', 'Ypenburg', 'Leidschenveen',
]);
const STUDY_TAGS = new Set(['bible-study', 'prayer-worship', 'communion', 'event', 'dinner']);

exports.createHostedStudy = onCall({ region: 'europe-west4' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to host an event.');
  const uid = request.auth.uid;
  const input = request.data || {};
  const { studyId, title, description, tags, format, dayOfWeek, date, time, maxCapacity, area,
    isPublic, showMemberContacts, exactAddress, entryNotes, dates } = input;
  const validDates = (Array.isArray(dates) && dates.length <= 8 && new Set(dates).size === dates.length
    && dates.every((value) => typeof value === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
      && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value));
  const validRecurring = format === 'recurring' && Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6
    && date === null && validDates && dates.length === 8
    && dates.every((value) => new Date(`${value}T00:00:00.000Z`).getUTCDay() === dayOfWeek)
    && dates.slice(1).every((value, index) => Date.parse(`${value}T00:00:00.000Z`)
      - Date.parse(`${dates[index]}T00:00:00.000Z`) === 7 * 24 * 60 * 60 * 1000);
  const validOneOff = format === 'one-off' && dayOfWeek === null && typeof date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(date) && validDates && dates.length === 1 && dates[0] === date;
  if (typeof studyId !== 'string' || studyId.length === 0 || studyId.length > 128 || studyId.includes('/')
    || typeof title !== 'string' || title.trim().length < 6 || title.trim().length > 120
    || typeof description !== 'string' || description.trim().length < 12 || description.trim().length > 2000
    || !Array.isArray(tags) || tags.length < 1 || tags.length > 5 || new Set(tags).size !== tags.length
    || tags.some((tag) => !STUDY_TAGS.has(tag))
    || (!validRecurring && !validOneOff)
    || typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    || !Number.isInteger(maxCapacity) || maxCapacity < 1 || maxCapacity > 100
    || typeof area !== 'string' || !HAGUE_AREAS.has(area)
    || typeof isPublic !== 'boolean' || typeof showMemberContacts !== 'boolean'
    || typeof exactAddress !== 'string' || exactAddress.trim().length < 1 || exactAddress.trim().length > 180
    || typeof entryNotes !== 'string' || entryNotes.trim().length > 1000) {
    throw new HttpsError('invalid-argument', 'Check the event details and try again.');
  }

  const studyRef = db.doc(`studies/${studyId}`);
  const userRef = db.doc(`users/${uid}`);
  const contactRef = db.doc(`users/${uid}/private/contact`);
  const privateRef = db.doc(`studies/${studyId}/private/details`);
  const memberContactRef = db.doc(`studies/${studyId}/memberContacts/${uid}`);
  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const [userSnap, contactSnap] = await transaction.getAll(userRef, contactRef);
    if (!userSnap.exists || userSnap.data().profileCompleted !== true || !contactSnap.exists) {
      throw new HttpsError('failed-precondition', 'Complete your profile before hosting an event.');
    }
    const profile = userSnap.data();
    const contact = contactSnap.data();
    const phone = typeof contact.phone === 'string' ? contact.phone : '';
    const place = [contact.neighbourhood, contact.city, contact.country]
      .filter((value) => typeof value === 'string' && value.length > 0).join(', ').slice(0, 240);
    if (typeof profile.fullName !== 'string' || profile.fullName.trim().length === 0 || profile.fullName.length > 80
      || !Number.isInteger(profile.age) || profile.age < 1 || profile.age > 120
      || typeof profile.photoURL !== 'string'
      || !(profile.photoURL.length === 0
        || (profile.photoURL.length <= 2000 && profile.photoURL.startsWith('https://'))
        || (profile.photoURL.length <= 24000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(profile.photoURL)))
      || !/^\+?[0-9]{8,15}$/.test(phone)) {
      throw new HttpsError('failed-precondition', 'Complete your profile before hosting an event.');
    }

    transaction.create(studyRef, {
      hostId: uid,
      hostName: profile.fullName,
      hostAge: profile.age,
      hostPhotoURL: profile.photoURL,
      title: title.trim(),
      description: description.trim(),
      tags,
      format,
      dayOfWeek: format === 'recurring' ? dayOfWeek : null,
      date: format === 'one-off' ? date : null,
      time,
      maxCapacity,
      area,
      isPublic,
      showMemberContacts,
      archived: false,
      approvedCount: 0,
      skippedDates: [],
      createdAt: now,
      updatedAt: now,
    });
    transaction.create(privateRef, {
      exactAddress: exactAddress.trim(),
      entryNotes: entryNotes.trim(),
      updatedAt: now,
    });
    transaction.create(memberContactRef, { phone, place, updatedAt: now });
    dates.forEach((sessionDate) => {
      transaction.create(db.doc(`studies/${studyId}/sessions/${sessionDate}/attendees/${uid}`), {
        uid, joined: true, updatedAt: now,
      });
      transaction.create(db.doc(`studies/${studyId}/sessions/${sessionDate}/summary/attendance`), {
        attendingCount: 1, updatedAt: now,
      });
    });
  });
  return { studyId };
});

exports.initializeHostedStudySessions = onCall({ region: 'europe-west4' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to initialize study sessions.');
  const { studyId, dates } = request.data || {};
  if (
    typeof studyId !== 'string' || studyId.length === 0 || studyId.length > 128 || studyId.includes('/') ||
    !Array.isArray(dates) || dates.length > 8 || dates.some((date) =>
      typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date
    ) ||
    new Set(dates).size !== dates.length
  ) {
    throw new HttpsError('invalid-argument', 'Invalid initial session list.');
  }

  const studyRef = db.doc(`studies/${studyId}`);
  const sessionRefs = dates.flatMap((date) => [
    db.doc(`studies/${studyId}/sessions/${date}/attendees/${request.auth.uid}`),
    db.doc(`studies/${studyId}/sessions/${date}/summary/attendance`),
  ]);
  await db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(studyRef, ...sessionRefs);
    const studySnap = snapshots[0];
    if (!studySnap.exists) throw new HttpsError('not-found', 'Study not found.');
    const study = studySnap.data();
    if (study.hostId !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the host can initialize study sessions.');
    if (!Number.isInteger(study.maxCapacity) || study.maxCapacity < 1) throw new HttpsError('failed-precondition', 'Study capacity is invalid.');
    if (snapshots.slice(1).some((snapshot) => snapshot.exists)) {
      throw new HttpsError('failed-precondition', 'These study sessions have already been initialized.');
    }

    const updatedAt = new Date().toISOString();
    dates.forEach((date, index) => {
      const attendeeRef = sessionRefs[index * 2];
      const summaryRef = sessionRefs[index * 2 + 1];
      transaction.create(attendeeRef, { uid: request.auth.uid, joined: true, updatedAt });
      transaction.create(summaryRef, { attendingCount: 1, updatedAt });
    });
  });

  return { initialized: dates.length };
});

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
    if (study.membershipMigrationLocked === true) throw new HttpsError('unavailable', 'Study membership is being updated. Try again shortly.');
    const membershipSnap = await transaction.get(db.doc(`studies/${studyId}/members/${request.auth.uid}`));
    if (study.hostId !== request.auth.uid && (!membershipSnap.exists || membershipSnap.data().status !== 'approved')) {
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

  // A session is canceled only when every host-side person has explicitly
  // marked themselves unavailable for this date.
  const managerSnap = await db.collection(`studies/${studyId}/managers`).get();
  const studySnap = await studyRef.get();
  if (studySnap.exists) {
    const study = studySnap.data();
    const managerIds = await Promise.all(managerSnap.docs.map(async (item) => {
      const membership = await db.doc(`studies/${studyId}/members/${item.id}`).get();
      return membership.exists && membership.data().status === 'approved' ? item.id : null;
    }));
    const teamIds = [...new Set([study.hostId, ...managerIds.filter(Boolean)])];
    const teamRefs = teamIds.map((uid) => db.doc(`studies/${studyId}/sessions/${date}/attendees/${uid}`));
    const teamSnaps = await db.getAll(...teamRefs);
    const allUnavailable = teamSnaps.every((item) => item.exists && item.data().joined === false);
    const skipped = Array.isArray(study.skippedDates) && study.skippedDates.includes(date);
    if (allUnavailable && !skipped) {
      await studyRef.update({ skippedDates: FieldValue.arrayUnion(date), updatedAt: new Date().toISOString() });
    } else if (!allUnavailable && skipped) {
      await studyRef.update({ skippedDates: FieldValue.arrayRemove(date), updatedAt: new Date().toISOString() });
    }
  }
  return { joined };
});

function membershipRef(studyId, uid) {
  return db.doc(`studies/${studyId}/members/${uid}`);
}

exports.changeStudyMembership = onCall({ region: 'europe-west4' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to manage study membership.');
  const { studyId, action, targetUid } = request.data || {};
  const uid = request.auth.uid;
  const validActions = new Set(['request', 'cancel-request', 'invite', 'revoke-invite', 'accept-invite', 'decline-invite', 'approve', 'decline', 'remove', 'leave']);
  if (typeof studyId !== 'string' || studyId.length > 128 || !validActions.has(action)) {
    throw new HttpsError('invalid-argument', 'Invalid membership request.');
  }
  const target = ['request', 'cancel-request', 'accept-invite', 'decline-invite', 'leave'].includes(action)
    ? uid
    : targetUid;
  if (typeof target !== 'string' || target.length === 0 || target.length > 128) {
    throw new HttpsError('invalid-argument', 'A valid member is required.');
  }
  const studyRef = db.doc(`studies/${studyId}`);
  const targetRef = membershipRef(studyId, target);
  const targetProfileRef = db.doc(`users/${target}`);
  const actorMembershipRef = membershipRef(studyId, uid);
  const managerPermission = ['invite', 'revoke-invite', 'approve', 'decline', 'remove'].includes(action);
  const managerRef = db.doc(`studies/${studyId}/managers/${uid}`);
  const actorProfile = action === 'remove' ? await db.doc(`users/${uid}`).get() : null;
  const now = new Date().toISOString();
  const noticeRef = db.doc(`studies/${studyId}/notices/${target}`);

  await db.runTransaction(async (transaction) => {
    const [studySnap, memberSnap, noticeSnap, managerSnap, actorMembershipSnap, targetProfileSnap] = await Promise.all([
      transaction.get(studyRef),
      transaction.get(targetRef),
      transaction.get(noticeRef),
      managerPermission ? transaction.get(managerRef) : Promise.resolve(null),
      managerPermission ? transaction.get(actorMembershipRef) : Promise.resolve(null),
      ['request', 'invite'].includes(action) ? transaction.get(targetProfileRef) : Promise.resolve(null),
    ]);
    if (!studySnap.exists) throw new HttpsError('not-found', 'Study not found.');
    const study = studySnap.data();
    if (study.membershipMigrationLocked === true) throw new HttpsError('unavailable', 'Study membership is being updated. Try again shortly.');
    const isHost = study.hostId === uid;
    const member = memberSnap.exists ? memberSnap.data() : null;
    const isManager = managerSnap?.exists
      && actorMembershipSnap?.exists
      && actorMembershipSnap.data().status === 'approved'
      && managerSnap.data().permissions?.canManageParticipants === true
      && !isHost;
    const canManageParticipants = isHost || isManager;
    const setMember = (status) => transaction.set(targetRef, {
      uid: target,
      status,
      createdAt: member?.createdAt || now,
      updatedAt: now,
    });
    const deleteMember = () => transaction.delete(targetRef);
    const writeNotice = (type, extra = {}) => transaction.set(noticeRef, {
      type,
      userId: target,
      createdAt: now,
      ...extra,
    });
    let countChanged = false;

    switch (action) {
      case 'request':
        if (isHost || study.archived === true || study.isPublic === false || member || noticeSnap.data()?.type === 'removed'
          || !targetProfileSnap?.exists || targetProfileSnap.data().publicProfile !== true) {
          throw new HttpsError('failed-precondition', 'This event is not available for a join request.');
        }
        setMember('pending');
        if (noticeSnap.exists) transaction.delete(noticeRef);
        break;
      case 'cancel-request':
        if (!member || member.status !== 'pending') throw new HttpsError('failed-precondition', 'That request is no longer pending.');
        deleteMember();
        writeNotice('cancelled');
        break;
      case 'invite':
        if (!canManageParticipants) throw new HttpsError('permission-denied', 'You cannot invite people to this study.');
        if (!targetProfileSnap?.exists || targetProfileSnap.data().publicProfile !== true) throw new HttpsError('failed-precondition', 'This person does not have a complete profile.');
        if (target === study.hostId || member) throw new HttpsError('failed-precondition', 'This person already has a membership state.');
        setMember('invited');
        break;
      case 'revoke-invite':
        if (!canManageParticipants) throw new HttpsError('permission-denied', 'You cannot manage invitations.');
        if (!member || member.status !== 'invited') throw new HttpsError('failed-precondition', 'That invitation is no longer active.');
        deleteMember();
        break;
      case 'accept-invite':
        if (!member || member.status !== 'invited') throw new HttpsError('failed-precondition', 'This invitation is no longer available.');
        setMember('approved');
        transaction.update(studyRef, { approvedCount: (study.approvedCount || 0) + 1, updatedAt: now });
        countChanged = true;
        writeNotice('accepted');
        break;
      case 'decline-invite':
        if (!member || member.status !== 'invited') throw new HttpsError('failed-precondition', 'This invitation is no longer available.');
        deleteMember();
        writeNotice('declined');
        break;
      case 'approve':
        if (!canManageParticipants) throw new HttpsError('permission-denied', 'You cannot approve participants.');
        if (!member || member.status !== 'pending') throw new HttpsError('failed-precondition', 'That request is no longer pending.');
        setMember('approved');
        transaction.update(studyRef, { approvedCount: (study.approvedCount || 0) + 1, updatedAt: now });
        countChanged = true;
        break;
      case 'decline':
        if (!canManageParticipants) throw new HttpsError('permission-denied', 'You cannot decline participants.');
        if (!member || member.status !== 'pending') throw new HttpsError('failed-precondition', 'That request is no longer pending.');
        deleteMember();
        break;
      case 'remove': {
        if (!canManageParticipants) throw new HttpsError('permission-denied', 'You cannot remove participants.');
        if (target === study.hostId || target === uid) throw new HttpsError('failed-precondition', 'You cannot remove the host or yourself.');
        if (!member || member.status !== 'approved') throw new HttpsError('failed-precondition', 'That person is no longer in this study.');
        deleteMember();
        transaction.update(studyRef, { approvedCount: Math.max(0, (study.approvedCount || 0) - 1), updatedAt: now });
        countChanged = true;
        const actorName = actorProfile?.exists ? actorProfile.data().fullName : '';
        writeNotice('removed', {
          studyTitle: typeof study.title === 'string' ? study.title : 'A study',
          hostName: typeof actorName === 'string' && actorName ? actorName : 'A study manager',
        });
        break;
      }
      case 'leave':
        if (isHost || !member || member.status !== 'approved') throw new HttpsError('failed-precondition', 'You are not a participant in this study.');
        deleteMember();
        transaction.update(studyRef, { approvedCount: Math.max(0, (study.approvedCount || 0) - 1), updatedAt: now });
        countChanged = true;
        writeNotice('left');
        break;
    }
    if (!countChanged) transaction.update(studyRef, { updatedAt: now });
  });

  return { success: true };
});

exports.deleteHostedStudy = onCall({ region: 'europe-west4' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to delete this study.');
  const { studyId } = request.data || {};
  if (typeof studyId !== 'string' || studyId.length === 0 || studyId.length > 128 || studyId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Invalid study ID.');
  }

  const studyRef = db.doc(`studies/${studyId}`);
  await db.runTransaction(async (transaction) => {
    const studySnap = await transaction.get(studyRef);
    if (!studySnap.exists) throw new HttpsError('not-found', 'Study not found.');
    if (studySnap.data().hostId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Only the host can delete this study.');
    }
  });

  await getStorage().bucket().deleteFiles({ prefix: `sessions/${studyId}/`, force: true });
  await db.recursiveDelete(studyRef);
  return { success: true };
});

exports.archiveHostedStudy = onCall({ region: 'europe-west4' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to archive this event.');
  const { studyId } = request.data || {};
  if (typeof studyId !== 'string' || studyId.length === 0 || studyId.length > 128 || studyId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Invalid study ID.');
  }
  const studyRef = db.doc(`studies/${studyId}`);
  const snapshot = await studyRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Event not found.');
  if (snapshot.data().hostId !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the host can archive this event.');
  await studyRef.update({ archived: true, updatedAt: new Date().toISOString() });
  return { success: true };
});

exports.unarchiveHostedStudy = onCall({ region: 'europe-west4' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to restore this event.');
  const { studyId } = request.data || {};
  if (typeof studyId !== 'string' || studyId.length === 0 || studyId.length > 128 || studyId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Invalid study ID.');
  }
  const studyRef = db.doc(`studies/${studyId}`);
  const snapshot = await studyRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Event not found.');
  if (snapshot.data().hostId !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the host can restore this event.');
  await studyRef.update({ archived: false, isPublic: true, updatedAt: new Date().toISOString() });
  return { success: true };
});
