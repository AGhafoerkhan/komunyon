import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadString } from 'firebase/storage';

const projectId = 'demo-komunyon';
const studyId = 'event-one';
const createdAt = '2026-11-19T00:00:00.000Z';
let testEnv: RulesTestEnvironment;

const baseStudy = {
  hostId: 'host',
  hostName: 'Host Example',
  hostAge: 30,
  hostPhotoURL: '',
  title: 'Safety test event',
  description: 'A sample event for security rule tests.',
  tags: ['event'],
  format: 'one-off',
  dayOfWeek: null,
  date: '2026-12-01',
  time: '19:00',
  maxCapacity: 8,
  area: 'Centrum',
  isPublic: true,
  showMemberContacts: true,
  approvedCount: 3,
  skippedDates: [],
  createdAt,
  updatedAt: createdAt,
};

async function seed(path: string, value: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), value);
  });
}

async function seedPublicUser(uid: string): Promise<void> {
  await seed(`users/${uid}`, {
    uid,
    fullName: 'Test User',
    age: 30,
    photoURL: '',
    bio: 'A test profile for membership integration.',
    profileCompleted: true,
    publicProfile: true,
    nameTokens: ['test', 'user'],
    createdAt,
    updatedAt: createdAt,
  });
}

async function seedStudy(id = studyId, patch: Record<string, unknown> = {}): Promise<void> {
  const merged: Record<string, unknown> = { ...baseStudy, ...patch };
  const pending = Array.isArray(merged.pendingUserIds) ? merged.pendingUserIds as string[] : [];
  const approved = Array.isArray(merged.approvedUserIds) ? merged.approvedUserIds as string[] : ['member', 'manager', 'editor'];
  const invited = Array.isArray(merged.invitedUserIds) ? merged.invitedUserIds as string[] : ['invitee'];
  delete merged.pendingUserIds;
  delete merged.approvedUserIds;
  delete merged.invitedUserIds;
  merged.approvedCount = approved.length;
  await seed(`studies/${id}`, merged);
  for (const [status, uids] of [['pending', pending], ['approved', approved], ['invited', invited]] as const) {
    for (const uid of uids) await seed(`studies/${id}/members/${uid}`, { uid, status, createdAt, updatedAt: createdAt });
  }
}

function db(uid?: string) {
  return uid ? testEnv.authenticatedContext(uid).firestore() : testEnv.unauthenticatedContext().firestore();
}

function managerPermissions(uid: string, permissions: Record<string, unknown>) {
  return seed(`studies/${studyId}/managers/${uid}`, {
    uid,
    createdAt,
    permissions,
  });
}

async function createAuthUser(label: string): Promise<{ uid: string; token: string }> {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${label}-${crypto.randomUUID()}@example.test`, password: 'test-password-123', returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`Auth emulator sign-up failed: ${await response.text()}`);
  const data = await response.json() as { localId: string; idToken: string };
  return { uid: data.localId, token: data.idToken };
}

async function callMembership(token: string, data: Record<string, unknown>): Promise<{ ok: boolean; body: any }> {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/europe-west4/changeStudyMembership`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  return { ok: response.ok, body: await response.json() };
}

async function callDeleteStudy(token: string, studyId: string): Promise<{ ok: boolean; body: any }> {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/europe-west4/deleteHostedStudy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: { studyId } }),
  });
  return { ok: response.ok, body: await response.json() };
}

async function callAttendance(token: string, data: Record<string, unknown>): Promise<{ ok: boolean; body: any }> {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/europe-west4/toggleSessionAttendance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  return { ok: response.ok, body: await response.json() };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8') },
    storage: { rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

describe('study visibility and private address', () => {
  it('allows a signed-in host to create a valid study but rejects invalid or impersonated creation', async () => {
    const valid = { ...baseStudy, hostId: 'creator', approvedCount: 0 };
    await assertSucceeds(setDoc(doc(db('creator'), 'studies', 'created-valid'), valid));
    await assertFails(setDoc(doc(db('creator'), 'studies', 'created-short-title'), {
      ...valid, title: 'Short',
    }));
    await assertFails(setDoc(doc(db('attacker'), 'studies', 'created-as-other-host'), valid));
    await assertFails(setDoc(doc(db(), 'studies', 'created-anonymously'), valid));
  });

  it('lets the host edit allowed fields but protects ownership and attendance totals', async () => {
    await seedStudy();
    const hostRef = doc(db('host'), 'studies', studyId);
    await assertSucceeds(updateDoc(hostRef, { title: 'A safely updated event', updatedAt: createdAt }));
    await assertFails(updateDoc(hostRef, { hostId: 'attacker', updatedAt: createdAt }));
    await assertFails(updateDoc(hostRef, { approvedCount: 999, updatedAt: createdAt }));
    await assertFails(updateDoc(doc(db('visitor'), 'studies', studyId), {
      title: 'Visitor changed this study', updatedAt: createdAt,
    }));
  });

  it('requires sign-in for study reads and hides unlisted events from unrelated users', async () => {
    await seedStudy();
    await seedStudy('unlisted-event', { isPublic: false });

    await assertFails(getDoc(doc(db(), 'studies', studyId)));
    await assertSucceeds(getDoc(doc(db('visitor'), 'studies', studyId)));
    await assertFails(getDoc(doc(db('visitor'), 'studies', 'unlisted-event')));
    await assertSucceeds(getDoc(doc(db('host'), 'studies', 'unlisted-event')));
    await assertSucceeds(getDoc(doc(db('invitee'), 'studies', 'unlisted-event')));
  });

  it('keeps membership IDs out of public study data and limits roster reads to members', async () => {
    await seedStudy(studyId, { pendingUserIds: ['request'], invitedUserIds: ['invitee'] });
    const publicStudy = await getDoc(doc(db('visitor'), 'studies', studyId));
    expect(publicStudy.data()).not.toHaveProperty('approvedUserIds');
    expect(publicStudy.data()).not.toHaveProperty('pendingUserIds');
    expect(publicStudy.data()).not.toHaveProperty('invitedUserIds');
    expect(publicStudy.data()?.approvedCount).toBe(3);

    await assertSucceeds(getDoc(doc(db('member'), 'studies', studyId, 'members', 'member')));
    await assertFails(getDoc(doc(db('visitor'), 'studies', studyId, 'members', 'member')));
    await assertFails(getDoc(doc(db('member'), 'studies', studyId, 'members', 'request')));
    await assertFails(getDoc(doc(db('member'), 'studies', studyId, 'members', 'invitee')));
    await assertSucceeds(getDoc(doc(db('member'), 'studies', studyId, 'members', 'manager')));
    await assertSucceeds(getDocs(query(collection(db('member'), 'studies', studyId, 'members'), where('status', '==', 'approved'))));
    await assertSucceeds(getDocs(query(collectionGroup(db('member'), 'members'), where('uid', '==', 'member'))));
    await assertFails(getDocs(query(collectionGroup(db('member'), 'members'), where('uid', '==', 'request'))));
    await assertFails(getDocs(collection(db('member'), 'studies', studyId, 'members')));
    await assertFails(setDoc(doc(db('member'), 'studies', studyId, 'members', 'attacker'), {
      uid: 'attacker', status: 'approved', createdAt, updatedAt: createdAt,
    }));
    await assertFails(updateDoc(doc(db('host'), 'studies', studyId), { approvedCount: 999 }));
  });

  it('grants exact-address access only to the host and approved members', async () => {
    await seedStudy();
    await seed(`studies/${studyId}/private/details`, {
      exactAddress: 'Sample Street 1',
      entryNotes: 'Ring the bell',
      updatedAt: createdAt,
    });
    await assertSucceeds(getDoc(doc(db('host'), 'studies', studyId, 'private', 'details')));
    await assertSucceeds(getDoc(doc(db('member'), 'studies', studyId, 'private', 'details')));
    await assertFails(getDoc(doc(db('invitee'), 'studies', studyId, 'private', 'details')));
    await assertFails(getDoc(doc(db('visitor'), 'studies', studyId, 'private', 'details')));
  });

  it('restricts private session notes to current members and study editors', async () => {
    await seedStudy();
    await seed(`studies/${studyId}/sessions/2026-12-01`, {
      description: 'Private notes for the meeting', updatedAt: createdAt,
    });
    await managerPermissions('editor', { canEdit: true });

    await assertSucceeds(getDoc(doc(db('host'), 'studies', studyId, 'sessions', '2026-12-01')));
    await assertSucceeds(getDoc(doc(db('member'), 'studies', studyId, 'sessions', '2026-12-01')));
    await assertFails(getDoc(doc(db('invitee'), 'studies', studyId, 'sessions', '2026-12-01')));
    await assertFails(getDoc(doc(db('visitor'), 'studies', studyId, 'sessions', '2026-12-01')));
    await assertSucceeds(updateDoc(doc(db('editor'), 'studies', studyId, 'sessions', '2026-12-01'), {
      description: 'Editor updated the notes', updatedAt: createdAt,
    }));
    await assertFails(updateDoc(doc(db('member'), 'studies', studyId, 'sessions', '2026-12-01'), {
      description: 'Participant must not edit notes', updatedAt: createdAt,
    }));
  });

  it('does not let a session manager edit private notes without study-edit permission', async () => {
    await seedStudy();
    await seed(`studies/${studyId}/sessions/2026-12-01`, {
      description: 'Host notes', updatedAt: createdAt,
    });
    await managerPermissions('manager', { canManageSessions: true });

    await assertFails(updateDoc(doc(db('manager'), 'studies', studyId, 'sessions', '2026-12-01'), {
      description: 'Session manager cannot edit these notes', updatedAt: createdAt,
    }));
  });

  it('allows only the notice owner and host to read a membership notice', async () => {
    await seedStudy();
    await seed(`studies/${studyId}/notices/member`, {
      type: 'removed', userId: 'member', createdAt,
    });

    await assertSucceeds(getDoc(doc(db('host'), 'studies', studyId, 'notices', 'member')));
    await assertSucceeds(getDoc(doc(db('member'), 'studies', studyId, 'notices', 'member')));
    await assertFails(getDoc(doc(db('manager'), 'studies', studyId, 'notices', 'member')));
    await assertFails(getDoc(doc(db('visitor'), 'studies', studyId, 'notices', 'member')));
  });

  it('rejects malformed phone numbers in group contact records', async () => {
    await seedStudy();
    const contactRef = doc(db('member'), 'studies', studyId, 'memberContacts', 'member');
    await assertFails(setDoc(contactRef, {
      phone: 'call-me-at-this-number', place: 'Centrum, The Hague', updatedAt: createdAt,
    }));
  });

  it('lets profile owners update public fields but keeps private contact data out of the public document', async () => {
    await seed('users/member', {
      uid: 'member',
      fullName: 'Member Example',
      age: 25,
      photoURL: '',
      bio: 'A public profile bio.',
      profileCompleted: true,
      publicProfile: true,
      nameTokens: ['member'],
      createdAt,
      updatedAt: createdAt,
    });
    await seed('users/member/private/contact', {
      email: 'member@example.test',
      phone: '+31612345678',
      country: 'Netherlands',
      city: 'The Hague',
      neighbourhood: 'Centrum',
      updatedAt: createdAt,
    });
    const ownerRef = doc(db('member'), 'users', 'member');

    await assertSucceeds(updateDoc(ownerRef, { fullName: 'Updated Member', updatedAt: createdAt }));
    await assertFails(updateDoc(ownerRef, { email: 'private@example.test', updatedAt: createdAt }));
    await assertFails(updateDoc(ownerRef, { uid: 'other-user', updatedAt: createdAt }));
    await assertFails(updateDoc(doc(db('visitor'), 'users', 'member'), {
      fullName: 'Visitor changed profile', updatedAt: createdAt,
    }));
  });

  it('allows the host to unpublish a study but blocks participants from changing visibility', async () => {
    await seedStudy();
    const hostRef = doc(db('host'), 'studies', studyId);
    const memberRef = doc(db('member'), 'studies', studyId);

    await assertSucceeds(updateDoc(hostRef, { isPublic: false, updatedAt: createdAt }));
    await assertFails(updateDoc(memberRef, { isPublic: true, updatedAt: createdAt }));
  });
});

describe('co-host participant permissions', () => {
  it('keeps join request and approval functional through the trusted membership function', async () => {
    const host = await createAuthUser('host');
    const requester = await createAuthUser('requester');
    await seedPublicUser(requester.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [],
    });
    await seed(`studies/${studyId}/private/details`, {
      exactAddress: 'Sample Street 1',
      entryNotes: 'Ring the bell',
      updatedAt: createdAt,
    });

    const requestResult = await callMembership(requester.token, { studyId, action: 'request' });
    expect(requestResult.ok).toBe(true);
    let pendingStatus: unknown;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const pending = await getDoc(doc(context.firestore(), 'studies', studyId, 'members', requester.uid));
      pendingStatus = pending.data()?.status;
    });
    expect(pendingStatus).toBe('pending');
    await assertFails(getDoc(doc(db(requester.uid), 'studies', studyId, 'private', 'details')));

    const approvalResult = await callMembership(host.token, { studyId, action: 'approve', targetUid: requester.uid });
    expect(approvalResult.ok).toBe(true);
    let approvedStatus: unknown;
    let approvedCount: unknown;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [approved, study] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', requester.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId)),
      ]);
      approvedStatus = approved.data()?.status;
      approvedCount = study.data()?.approvedCount;
    });
    expect(approvedStatus).toBe('approved');
    expect(approvedCount).toBe(1);
    await assertSucceeds(getDoc(doc(db(requester.uid), 'studies', studyId, 'private', 'details')));
  });

  it('lets only the host delete a study and recursively removes its private records', async () => {
    const host = await createAuthUser('delete-host');
    const visitor = await createAuthUser('delete-visitor');
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [],
    });
    await seed(`studies/${studyId}/members/legacy-member`, {
      uid: 'legacy-member', status: 'approved', createdAt, updatedAt: createdAt,
    });
    await seed(`studies/${studyId}/sessions/2026-12-01/attendees/${host.uid}`, {
      uid: host.uid, joined: true, updatedAt: createdAt,
    });
    await seed(`studies/${studyId}/private/details`, {
      exactAddress: 'Sample Street 1', entryNotes: '', updatedAt: createdAt,
    });

    await assertFails(deleteDoc(doc(db(host.uid), 'studies', studyId)));

    const denied = await callDeleteStudy(visitor.token, studyId);
    expect(denied.ok).toBe(false);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      expect((await getDoc(doc(context.firestore(), 'studies', studyId))).exists()).toBe(true);
    });

    const deleted = await callDeleteStudy(host.token, studyId);
    expect(deleted.ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [study, member, attendee, details] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', 'legacy-member')),
        getDoc(doc(context.firestore(), 'studies', studyId, 'sessions', '2026-12-01', 'attendees', host.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'private', 'details')),
      ]);
      expect(study.exists()).toBe(false);
      expect(member.exists()).toBe(false);
      expect(attendee.exists()).toBe(false);
      expect(details.exists()).toBe(false);
    });
  });

  it('keeps invitations, acceptance, and leaving functional with matching counts and notices', async () => {
    const host = await createAuthUser('host');
    const invitee = await createAuthUser('invitee');
    await seedPublicUser(invitee.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [],
    });

    expect((await callMembership(host.token, { studyId, action: 'invite', targetUid: invitee.uid })).ok).toBe(true);
    expect((await callMembership(invitee.token, { studyId, action: 'accept-invite' })).ok).toBe(true);
    let approvedCount: unknown;
    let inviteNoticeType: unknown;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [study, notice] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'notices', invitee.uid)),
      ]);
      approvedCount = study.data()?.approvedCount;
      inviteNoticeType = notice.data()?.type;
    });
    expect(approvedCount).toBe(1);
    expect(inviteNoticeType).toBe('accepted');

    expect((await callMembership(invitee.token, { studyId, action: 'leave' })).ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [study, notice] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'notices', invitee.uid)),
      ]);
      approvedCount = study.data()?.approvedCount;
      inviteNoticeType = notice.data()?.type;
    });
    expect(approvedCount).toBe(0);
    expect(inviteNoticeType).toBe('left');
  });

  it('rejects a duplicate join request without changing the pending membership', async () => {
    const host = await createAuthUser('repeat-request-host');
    const requester = await createAuthUser('repeat-request-user');
    await seedPublicUser(requester.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [],
    });

    expect((await callMembership(requester.token, { studyId, action: 'request' })).ok).toBe(true);
    expect((await callMembership(requester.token, { studyId, action: 'request' })).ok).toBe(false);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [member, study] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', requester.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId)),
      ]);
      expect(member.data()?.status).toBe('pending');
      expect(study.data()?.approvedCount).toBe(0);
    });
  });

  it('lets the host admit more group members than a single session capacity', async () => {
    const host = await createAuthUser('unlimited-group-host');
    const existingMember = await createAuthUser('existing-group-member');
    const invitee = await createAuthUser('extra-group-invitee');
    await seedPublicUser(invitee.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      maxCapacity: 1,
      pendingUserIds: [],
      approvedUserIds: [existingMember.uid],
      invitedUserIds: [],
    });

    expect((await callMembership(host.token, { studyId, action: 'invite', targetUid: invitee.uid })).ok).toBe(true);
    expect((await callMembership(invitee.token, { studyId, action: 'accept-invite' })).ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [existing, added, study] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', existingMember.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', invitee.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId)),
      ]);
      expect(existing.data()?.status).toBe('approved');
      expect(added.data()?.status).toBe('approved');
      expect(study.data()?.approvedCount).toBe(2);
    });
  });

  it('lets an invitee decline without taking a spot or receiving private-address access', async () => {
    const host = await createAuthUser('decline-host');
    const invitee = await createAuthUser('decline-invitee');
    await seedPublicUser(invitee.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [],
    });
    await seed(`studies/${studyId}/private/details`, {
      exactAddress: 'Sample Street 1', entryNotes: '', updatedAt: createdAt,
    });
    expect((await callMembership(host.token, { studyId, action: 'invite', targetUid: invitee.uid })).ok).toBe(true);
    await assertFails(getDoc(doc(db(invitee.uid), 'studies', studyId, 'private', 'details')));

    expect((await callMembership(invitee.token, { studyId, action: 'decline-invite' })).ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [member, study, notice] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', invitee.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'notices', invitee.uid)),
      ]);
      expect(member.exists()).toBe(false);
      expect(study.data()?.approvedCount).toBe(0);
      expect(notice.data()?.type).toBe('declined');
    });
  });

  it('lets the host revoke an invitation and prevents the former invitee from accepting it', async () => {
    const host = await createAuthUser('revoke-invite-host');
    const invitee = await createAuthUser('revoke-invite-user');
    await seedPublicUser(invitee.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [],
    });

    expect((await callMembership(host.token, { studyId, action: 'invite', targetUid: invitee.uid })).ok).toBe(true);
    expect((await callMembership(host.token, { studyId, action: 'revoke-invite', targetUid: invitee.uid })).ok).toBe(true);
    expect((await callMembership(invitee.token, { studyId, action: 'accept-invite' })).ok).toBe(false);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [membership, study] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', invitee.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId)),
      ]);
      expect(membership.exists()).toBe(false);
      expect(study.data()?.approvedCount).toBe(0);
    });
  });

  it('supports canceling and re-sending a request, then host decline without changing approved count', async () => {
    const host = await createAuthUser('request-lifecycle-host');
    const requester = await createAuthUser('request-lifecycle-user');
    await seedPublicUser(requester.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [requester.uid],
      approvedUserIds: [],
      invitedUserIds: [],
    });

    expect((await callMembership(requester.token, { studyId, action: 'cancel-request' })).ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      expect((await getDoc(doc(context.firestore(), 'studies', studyId, 'notices', requester.uid))).data()?.type).toBe('cancelled');
    });
    expect((await callMembership(requester.token, { studyId, action: 'request' })).ok).toBe(true);
    expect((await callMembership(host.token, { studyId, action: 'decline', targetUid: requester.uid })).ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [member, study, notice] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', requester.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'notices', requester.uid)),
      ]);
      expect(member.exists()).toBe(false);
      expect(study.data()?.approvedCount).toBe(0);
      expect(notice.exists()).toBe(false);
    });
  });

  it('does not let an edit-only co-host invite or approve participants', async () => {
    const host = await createAuthUser('edit-only-host');
    const editor = await createAuthUser('edit-only-manager');
    const target = await createAuthUser('edit-only-target');
    const requester = await createAuthUser('edit-only-requester');
    await seedPublicUser(target.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [requester.uid],
      approvedUserIds: [editor.uid],
      invitedUserIds: [],
    });
    await managerPermissions(editor.uid, { canEdit: true });

    expect((await callMembership(editor.token, { studyId, action: 'invite', targetUid: target.uid })).ok).toBe(false);
    expect((await callMembership(editor.token, { studyId, action: 'approve', targetUid: requester.uid })).ok).toBe(false);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [targetMembership, pendingMembership, study] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', target.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', requester.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId)),
      ]);
      expect(targetMembership.exists()).toBe(false);
      expect(pendingMembership.data()?.status).toBe('pending');
      expect(study.data()?.approvedCount).toBe(1);
    });
  });

  it('rejects unauthenticated and malformed callable membership requests without writes', async () => {
    const host = await createAuthUser('invalid-call-host');
    const member = await createAuthUser('invalid-call-member');
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [],
    });

    expect((await callMembership('', { studyId, action: 'request' })).ok).toBe(false);
    const invalid = await callMembership(member.token, { studyId, action: 'make-host' });
    expect(invalid.ok).toBe(false);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [membership, study] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', member.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId)),
      ]);
      expect(membership.exists()).toBe(false);
      expect(study.data()?.approvedCount).toBe(0);
    });
  });

  it('blocks membership and attendance changes while a study migration lock is active', async () => {
    const host = await createAuthUser('locked-study-host');
    const member = await createAuthUser('locked-study-member');
    await seedPublicUser(member.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      membershipMigrationLocked: true,
      pendingUserIds: [],
      approvedUserIds: [member.uid],
      invitedUserIds: [],
    });

    const requestResult = await callMembership(member.token, { studyId, action: 'request' });
    expect(requestResult.ok).toBe(false);
    expect(requestResult.body.error?.status).toBe('UNAVAILABLE');
    const attendanceResult = await callAttendance(member.token, {
      studyId, date: '2026-12-01', joined: true,
    });
    expect(attendanceResult.ok).toBe(false);
    expect(attendanceResult.body.error?.status).toBe('UNAVAILABLE');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      expect((await getDoc(doc(context.firestore(), 'studies', studyId, 'sessions', '2026-12-01', 'attendees', member.uid))).exists()).toBe(false);
    });
  });

  it('enforces manager permissions, blocks self-removal, and attributes removals to the actor', async () => {
    const host = await createAuthUser('host');
    const manager = await createAuthUser('manager');
    const member = await createAuthUser('member');
    await seedPublicUser(manager.uid);
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [manager.uid, member.uid],
      invitedUserIds: [],
    });
    await managerPermissions(manager.uid, { canManageParticipants: true });

    const selfRemoval = await callMembership(manager.token, { studyId, action: 'remove', targetUid: manager.uid });
    expect(selfRemoval.ok).toBe(false);
    const hostRemoval = await callMembership(manager.token, { studyId, action: 'remove', targetUid: host.uid });
    expect(hostRemoval.ok).toBe(false);

    const removal = await callMembership(manager.token, { studyId, action: 'remove', targetUid: member.uid });
    expect(removal.ok).toBe(true);
    let removedMembershipExists = true;
    let remainingApprovedCount: unknown;
    let removalNotice: Record<string, unknown> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [membership, study, notice] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'members', member.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'notices', member.uid)),
      ]);
      removedMembershipExists = membership.exists();
      remainingApprovedCount = study.data()?.approvedCount;
      removalNotice = notice.data();
    });
    expect(removedMembershipExists).toBe(false);
    expect(remainingApprovedCount).toBe(1);
    expect(removalNotice?.type).toBe('removed');
    expect(removalNotice?.hostName).toBe('Test User');
  });

  it('rejects direct membership edits, including participant-manager approval attempts', async () => {
    await seedStudy(studyId, { pendingUserIds: ['request-a', 'request-b'] });
    await managerPermissions('manager', { canManageParticipants: true });
    await assertFails(setDoc(doc(db('manager'), 'studies', studyId, 'members', 'request-a'), {
      uid: 'request-a', status: 'approved', createdAt, updatedAt: createdAt,
    }));
    await assertFails(deleteDoc(doc(db('manager'), 'studies', studyId, 'members', 'request-a')));
  });

  it('does not let an editor without participant access change membership lists', async () => {
    await seedStudy(studyId, { pendingUserIds: ['request-a'] });
    await managerPermissions('editor', { canEdit: true });
    const ref = doc(db('editor'), 'studies', studyId);

    await assertSucceeds(updateDoc(ref, { title: 'Updated safe event', updatedAt: createdAt }));
    await assertFails(updateDoc(ref, { approvedCount: 999, updatedAt: createdAt }));
  });

  it('revokes co-host edit access as soon as the host turns the permission off', async () => {
    await seedStudy();
    await managerPermissions('editor', { canEdit: true });
    const editorStudy = doc(db('editor'), 'studies', studyId);
    await assertSucceeds(updateDoc(editorStudy, { title: 'Editor can change this', updatedAt: createdAt }));

    await assertSucceeds(updateDoc(doc(db('host'), 'studies', studyId, 'managers', 'editor'), {
      permissions: { canEdit: false },
    }));
    await assertFails(updateDoc(editorStudy, { title: 'Editor access was revoked', updatedAt: createdAt }));
  });

  it('does not let a co-host change their own permissions', async () => {
    await seedStudy();
    await managerPermissions('manager', {
      canManageCoHostPermissions: true,
      grantable: {
        canEdit: true,
        canManageParticipants: true,
        canManageSessions: true,
        canManageCoHosts: true,
        canManageCoHostPermissions: true,
      },
    });
    await assertFails(updateDoc(doc(db('manager'), 'studies', studyId, 'managers', 'manager'), {
      permissions: { canManageSessions: true },
    }));
  });

  it('revokes a former co-host’s edit permission when they leave the approved group', async () => {
    await seedStudy();
    await managerPermissions('former-manager', { canEdit: true });
    await assertFails(updateDoc(doc(db('former-manager'), 'studies', studyId), {
      title: 'Unauthorized changed title',
      updatedAt: createdAt,
    }));
  });

  it('rejects direct invite writes to membership documents', async () => {
    await seedStudy();
    await managerPermissions('manager', { canManageParticipants: true });
    await assertFails(setDoc(doc(db('manager'), 'studies', studyId, 'members', 'new-invitee'), {
      uid: 'new-invitee', status: 'invited', createdAt, updatedAt: createdAt,
    }));
  });

  it('does not let a co-host remove the host manager record', async () => {
    await seedStudy();
    await managerPermissions('manager', { canManageCoHosts: true });
    await managerPermissions('host', { canEdit: true });

    await assertFails(deleteDoc(doc(db('manager'), 'studies', studyId, 'managers', 'host')));
    await assertSucceeds(deleteDoc(doc(db('manager'), 'studies', studyId, 'managers', 'manager')));
  });

  it('limits a co-host to granting only permissions the host delegated', async () => {
    await seedStudy(studyId, {
      approvedUserIds: ['manager', 'target-editor', 'target-planner'],
      pendingUserIds: [],
      invitedUserIds: [],
    });
    await seed(`studies/${studyId}/managers/manager`, {
      uid: 'manager',
      createdAt,
      permissions: {
        canManageCoHosts: true,
        canManageCoHostPermissions: true,
        grantable: {
          canEdit: true,
          canManageParticipants: false,
          canManageSessions: false,
          canManageCoHosts: false,
          canManageCoHostPermissions: false,
        },
      },
    });

    await assertSucceeds(setDoc(doc(db('manager'), 'studies', studyId, 'managers', 'target-editor'), {
      uid: 'target-editor',
      createdAt,
      permissions: { canEdit: true },
    }));
    await assertFails(setDoc(doc(db('manager'), 'studies', studyId, 'managers', 'target-planner'), {
      uid: 'target-planner',
      createdAt,
      permissions: { canManageSessions: true },
    }));
  });
});

describe('account deletion backend journey', () => {
  it('cleans hosted studies, every membership state, private profile data, avatar, and Auth account', async () => {
    const account = await createAuthUser('full-delete-account');
    await seedPublicUser(account.uid);
    await seed(`users/${account.uid}/private/contact`, {
      email: 'full-delete-account@example.test',
      phone: '+31612345678',
      country: 'Netherlands',
      city: 'The Hague',
      neighbourhood: 'Centrum',
      updatedAt: createdAt,
    });

    const profileRef = doc(db(account.uid), 'users', account.uid);
    await assertSucceeds(updateDoc(profileRef, {
      fullName: 'Updated Test User',
      bio: 'Updated profile before account deletion.',
      updatedAt: createdAt,
    }));
    expect((await getDoc(profileRef)).data()?.fullName).toBe('Updated Test User');

    await seedStudy('owned-study', {
      hostId: account.uid,
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [],
    });
    await seed('studies/owned-study/private/details', {
      exactAddress: 'Sample Street 1', entryNotes: '', updatedAt: createdAt,
    });
    await seedStudy('joined-study', {
      hostId: 'other-host-a',
      pendingUserIds: [],
      approvedUserIds: [account.uid],
      invitedUserIds: [],
    });
    await seedStudy('pending-study', {
      hostId: 'other-host-b',
      pendingUserIds: [account.uid],
      approvedUserIds: [],
      invitedUserIds: [],
    });
    await seedStudy('invited-study', {
      hostId: 'other-host-c',
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [account.uid],
    });

    const bucketUrl = `gs://${projectId}.appspot.com`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadString(ref(context.storage(bucketUrl), `avatars/${account.uid}`), 'avatar bytes', 'raw', {
        contentType: 'image/jpeg',
      });
    });

    expect((await callDeleteStudy(account.token, 'owned-study')).ok).toBe(true);
    expect((await callMembership(account.token, { studyId: 'joined-study', action: 'leave' })).ok).toBe(true);
    expect((await callMembership(account.token, { studyId: 'pending-study', action: 'cancel-request' })).ok).toBe(true);
    expect((await callMembership(account.token, { studyId: 'invited-study', action: 'decline-invite' })).ok).toBe(true);

    const ownerDb = db(account.uid);
    await assertSucceeds(deleteDoc(doc(ownerDb, 'users', account.uid)));
    await assertSucceeds(deleteDoc(doc(ownerDb, 'users', account.uid, 'private', 'contact')));
    await assertSucceeds(deleteObject(ref(testEnv.authenticatedContext(account.uid).storage(bucketUrl), `avatars/${account.uid}`)));

    const authDelete = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-api-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: account.token }),
    });
    expect(authDelete.ok).toBe(true);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const refs = [
        ['studies', 'owned-study'],
        ['studies', 'joined-study', 'members', account.uid],
        ['studies', 'pending-study', 'members', account.uid],
        ['studies', 'invited-study', 'members', account.uid],
        ['users', account.uid],
        ['users', account.uid, 'private', 'contact'],
      ] as const;
      const snapshots = await Promise.all(refs.map((parts) => getDoc(doc(context.firestore(), parts.join('/')))));
      expect(snapshots.every((snapshot) => !snapshot.exists())).toBe(true);
    });
    await expect(getBytes(ref(testEnv.authenticatedContext(account.uid).storage(bucketUrl), `avatars/${account.uid}`)))
      .rejects.toMatchObject({ code: 'storage/object-not-found' });

    const postDeleteLookup = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken: account.token }),
    });
    expect(postDeleteLookup.ok).toBe(false);
  });
});

describe('session attendance and capacity', () => {
  const date = '2026-12-01';

  it('counts an approved participant once when joining repeatedly', async () => {
    const host = await createAuthUser('attendance-host');
    const member = await createAuthUser('attendance-member');
    await seedStudy(studyId, {
      hostId: host.uid,
      maxCapacity: 3,
      pendingUserIds: [],
      approvedUserIds: [member.uid],
      invitedUserIds: [],
    });
    await seed(`studies/${studyId}/sessions/${date}/summary/attendance`, {
      attendingCount: 1, updatedAt: createdAt,
    });

    expect((await callAttendance(member.token, { studyId, date, joined: true })).ok).toBe(true);
    expect((await callAttendance(member.token, { studyId, date, joined: true })).ok).toBe(true);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [attendee, summary] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'sessions', date, 'attendees', member.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'sessions', date, 'summary', 'attendance')),
      ]);
      expect(attendee.data()?.joined).toBe(true);
      expect(summary.data()?.attendingCount).toBe(2);
    });
  });

  it('rejects new attendance when a session is full without changing its count', async () => {
    const host = await createAuthUser('full-host');
    const member = await createAuthUser('full-member');
    await seedStudy(studyId, {
      hostId: host.uid,
      maxCapacity: 2,
      pendingUserIds: [],
      approvedUserIds: [member.uid],
      invitedUserIds: [],
    });
    await seed(`studies/${studyId}/sessions/${date}/summary/attendance`, {
      attendingCount: 2, updatedAt: createdAt,
    });

    const result = await callAttendance(member.token, { studyId, date, joined: true });
    expect(result.ok).toBe(false);
    expect(result.body.error?.status).toBe('RESOURCE_EXHAUSTED');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [attendee, summary] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'sessions', date, 'attendees', member.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'sessions', date, 'summary', 'attendance')),
      ]);
      expect(attendee.exists()).toBe(false);
      expect(summary.data()?.attendingCount).toBe(2);
    });
  });

  it('rejects attendance from a user who is not an approved member', async () => {
    const host = await createAuthUser('private-host');
    const visitor = await createAuthUser('attendance-visitor');
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [],
      invitedUserIds: [],
    });

    const result = await callAttendance(visitor.token, { studyId, date, joined: true });
    expect(result.ok).toBe(false);
    expect(result.body.error?.status).toBe('PERMISSION_DENIED');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      expect((await getDoc(doc(context.firestore(), 'studies', studyId, 'sessions', date, 'attendees', visitor.uid))).exists()).toBe(false);
    });
  });

  it('rejects direct client writes to attendance records and summary counts', async () => {
    await seedStudy();
    await assertFails(setDoc(doc(db('member'), 'studies', studyId, 'sessions', date, 'attendees', 'member'), {
      uid: 'member', joined: true, updatedAt: createdAt,
    }));
    await assertFails(setDoc(doc(db('member'), 'studies', studyId, 'sessions', date, 'summary', 'attendance'), {
      attendingCount: 999, updatedAt: createdAt,
    }));
  });

  it('decrements attendance once when an approved participant leaves a session', async () => {
    const host = await createAuthUser('leave-session-host');
    const member = await createAuthUser('leave-session-member');
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [member.uid],
      invitedUserIds: [],
    });
    await seed(`studies/${studyId}/sessions/${date}/attendees/${member.uid}`, {
      uid: member.uid, joined: true, updatedAt: createdAt,
    });
    await seed(`studies/${studyId}/sessions/${date}/summary/attendance`, {
      attendingCount: 1, updatedAt: createdAt,
    });

    expect((await callAttendance(member.token, { studyId, date, joined: false })).ok).toBe(true);
    expect((await callAttendance(member.token, { studyId, date, joined: false })).ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const [attendee, summary] = await Promise.all([
        getDoc(doc(context.firestore(), 'studies', studyId, 'sessions', date, 'attendees', member.uid)),
        getDoc(doc(context.firestore(), 'studies', studyId, 'sessions', date, 'summary', 'attendance')),
      ]);
      expect(attendee.data()?.joined).toBe(false);
      expect(summary.data()?.attendingCount).toBe(0);
    });
  });

  it('cancels only when every host-side person is unavailable, and reopens when the host joins', async () => {
    const host = await createAuthUser('availability-host');
    const cohost = await createAuthUser('availability-cohost');
    await seedStudy(studyId, {
      hostId: host.uid,
      pendingUserIds: [],
      approvedUserIds: [cohost.uid],
      invitedUserIds: [],
    });
    await managerPermissions(cohost.uid, { canManageSessions: true });

    expect((await callAttendance(host.token, { studyId, date, joined: false })).ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      expect((await getDoc(doc(context.firestore(), 'studies', studyId))).data()?.skippedDates).toEqual([]);
    });

    expect((await callAttendance(cohost.token, { studyId, date, joined: false })).ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      expect((await getDoc(doc(context.firestore(), 'studies', studyId))).data()?.skippedDates).toContain(date);
    });

    expect((await callAttendance(host.token, { studyId, date, joined: true })).ok).toBe(true);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      expect((await getDoc(doc(context.firestore(), 'studies', studyId))).data()?.skippedDates).not.toContain(date);
    });
  });
});

describe('profile and group contact privacy', () => {
  it('allows incomplete onboarding profiles but rejects invalid age and forged ownership', async () => {
    const incompleteProfile = {
      uid: 'new-user',
      fullName: '',
      age: 0,
      photoURL: '',
      bio: '',
      profileCompleted: false,
      publicProfile: false,
      nameTokens: [],
      createdAt,
      updatedAt: createdAt,
    };
    await assertSucceeds(setDoc(doc(db('new-user'), 'users', 'new-user'), incompleteProfile));
    await assertFails(setDoc(doc(db('bad-age'), 'users', 'bad-age'), {
      ...incompleteProfile, uid: 'bad-age', age: 121,
    }));
    await assertFails(setDoc(doc(db('attacker'), 'users', 'victim'), {
      ...incompleteProfile, uid: 'victim',
    }));
  });

  it('requires private contact details before a new profile can become public', async () => {
    const ownerDb = testEnv.authenticatedContext('complete-user', { email: 'complete@example.test' }).firestore();
    const profile = {
      uid: 'complete-user',
      fullName: 'Complete User',
      age: 28,
      photoURL: '',
      bio: 'I speak Dutch and English.',
      profileCompleted: true,
      publicProfile: true,
      nameTokens: ['complete', 'user'],
      createdAt,
      updatedAt: createdAt,
    };
    await assertFails(setDoc(doc(ownerDb, 'users', 'complete-user'), profile));
    await assertSucceeds(setDoc(doc(ownerDb, 'users', 'complete-user', 'private', 'contact'), {
      email: 'complete@example.test',
      phone: '+31612345678',
      country: 'Netherlands',
      city: 'The Hague',
      neighbourhood: 'Centrum',
      updatedAt: createdAt,
    }));
    await assertSucceeds(setDoc(doc(ownerDb, 'users', 'complete-user'), profile));
  });

  it('allows only the profile owner to delete their profile and private contact record', async () => {
    await seedPublicUser('member');
    await seed('users/member/private/contact', {
      email: 'member@example.test', phone: '+31612345678', country: 'Netherlands',
      city: 'The Hague', neighbourhood: 'Centrum', updatedAt: createdAt,
    });

    await assertFails(deleteDoc(doc(db('visitor'), 'users', 'member')));
    await assertSucceeds(deleteDoc(doc(db('member'), 'users', 'member')));
    await assertSucceeds(deleteDoc(doc(db('member'), 'users', 'member', 'private', 'contact')));
  });

  it('keeps phone, email, and location private to the profile owner', async () => {
    await seed('users/member', {
      uid: 'member',
      fullName: 'Member Example',
      age: 25,
      photoURL: '',
      bio: 'A public profile bio.',
      profileCompleted: true,
      publicProfile: true,
      nameTokens: ['member'],
      createdAt,
      updatedAt: createdAt,
    });
    await seed('users/member/private/contact', {
      email: 'member@example.test',
      phone: '+31612345678',
      country: 'Netherlands',
      city: 'The Hague',
      neighbourhood: 'Centrum',
      updatedAt: createdAt,
    });
    await seed('users/legacy-member', {
      uid: 'legacy-member',
      fullName: 'Legacy Member',
      age: 24,
      photoURL: '',
      bio: 'Old profile data.',
      email: 'legacy@example.test',
      phone: '+31612345679',
      country: 'Netherlands',
      city: 'The Hague',
      neighbourhood: 'Laak',
      profileCompleted: true,
      nameTokens: ['legacy'],
      createdAt,
      updatedAt: createdAt,
    });

    await assertSucceeds(getDoc(doc(db('visitor'), 'users', 'member')));
    await assertFails(getDoc(doc(db('visitor'), 'users', 'member', 'private', 'contact')));
    await assertSucceeds(getDoc(doc(db('member'), 'users', 'member', 'private', 'contact')));
    await assertFails(getDoc(doc(db('visitor'), 'users', 'legacy-member')));
    await assertSucceeds(getDoc(doc(db('legacy-member'), 'users', 'legacy-member')));
  });

  it('shares group contact records only with current event members while enabled', async () => {
    await seedStudy();
    await seed(`studies/${studyId}/memberContacts/member`, {
      phone: '+31612345678',
      place: 'Centrum, The Hague, Netherlands',
      updatedAt: createdAt,
    });

    await assertSucceeds(getDoc(doc(db('host'), 'studies', studyId, 'memberContacts', 'member')));
    await assertSucceeds(getDoc(doc(db('manager'), 'studies', studyId, 'memberContacts', 'member')));
    await assertFails(getDoc(doc(db('invitee'), 'studies', studyId, 'memberContacts', 'member')));
    await assertFails(getDoc(doc(db('visitor'), 'studies', studyId, 'memberContacts', 'member')));
    await assertFails(getDoc(doc(db('manager'), 'studies', studyId, 'memberContacts', 'invitee')));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'studies', studyId), { showMemberContacts: false });
    });
    await assertFails(getDoc(doc(db('manager'), 'studies', studyId, 'memberContacts', 'member')));
    await assertSucceeds(getDoc(doc(db('member'), 'studies', studyId, 'memberContacts', 'member')));
  });
});

describe('storage membership revocation', () => {
  it('allows host and edit co-host uploads but rejects participant uploads', async () => {
    await seedStudy();
    await managerPermissions('editor', { canEdit: true });
    const bucketUrl = `gs://${projectId}.appspot.com`;
    const hostStorage = testEnv.authenticatedContext('host').storage(bucketUrl);
    const editorStorage = testEnv.authenticatedContext('editor').storage(bucketUrl);
    const memberStorage = testEnv.authenticatedContext('member').storage(bucketUrl);

    await assertSucceeds(uploadString(ref(hostStorage, `sessions/${studyId}/2026-12-01/host-1.txt`), 'host notes', 'raw', {
      contentType: 'text/plain',
    }));
    await assertSucceeds(uploadString(ref(editorStorage, `sessions/${studyId}/2026-12-01/editor-1.txt`), 'editor notes', 'raw', {
      contentType: 'text/plain',
    }));
    await assertFails(uploadString(ref(memberStorage, `sessions/${studyId}/2026-12-01/member-1.txt`), 'participant notes', 'raw', {
      contentType: 'text/plain',
    }));
  });

  it('rejects unsupported extensions and incorrect media content types', async () => {
    await seedStudy();
    const hostStorage = testEnv.authenticatedContext('host').storage(`gs://${projectId}.appspot.com`);
    await assertFails(uploadString(ref(hostStorage, `sessions/${studyId}/2026-12-01/host-1.pdf`), 'not an allowed file', 'raw', {
      contentType: 'text/plain',
    }));
    await assertFails(uploadString(ref(hostStorage, `sessions/${studyId}/2026-12-01/host-2.mp3`), 'not audio data', 'raw', {
      contentType: 'text/plain',
    }));
  });

  it('allows members to write only their own group contact record', async () => {
    await seedStudy();
    const memberDb = db('member');
    const ownRef = doc(memberDb, 'studies', studyId, 'memberContacts', 'member');
    const otherRef = doc(memberDb, 'studies', studyId, 'memberContacts', 'manager');
    const contact = { phone: '+31612345678', place: 'Centrum, The Hague', updatedAt: createdAt };

    await assertSucceeds(setDoc(ownRef, contact));
    await assertFails(setDoc(otherRef, contact));
  });

  it('allows approved members to read session files but blocks pending and unrelated users', async () => {
    await seedStudy();
    const filePath = `sessions/${studyId}/2026-12-01/notes.txt`;
    const bucketUrl = `gs://${projectId}.appspot.com`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadString(ref(context.storage(bucketUrl), filePath), 'private session notes', 'raw', {
        contentType: 'text/plain',
      });
    });

    await assertSucceeds(getBytes(ref(testEnv.authenticatedContext('member').storage(bucketUrl), filePath)));
    await assertFails(getBytes(ref(testEnv.authenticatedContext('invitee').storage(bucketUrl), filePath)));
    await assertFails(getBytes(ref(testEnv.authenticatedContext('visitor').storage(bucketUrl), filePath)));
    await assertFails(uploadString(
      ref(testEnv.authenticatedContext('member').storage(bucketUrl), `sessions/${studyId}/2026-12-01/member-1.txt`),
      'members cannot upload host session notes',
      'raw',
      { contentType: 'text/plain' },
    ));
  });

  it('revokes access to event files as soon as approval is removed', async () => {
    await seedStudy();
    const filePath = `sessions/${studyId}/2026-12-01/member-1.txt`;
    const bucketUrl = `gs://${projectId}.appspot.com`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadString(ref(context.storage(bucketUrl), filePath), 'sample notes', 'raw', {
        contentType: 'text/plain',
      });
    });

    const memberStorage = testEnv.authenticatedContext('member').storage(bucketUrl);
    await assertSucceeds(getBytes(ref(memberStorage, filePath)));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'studies', studyId), {
        approvedCount: 2,
      });
      await deleteDoc(doc(context.firestore(), 'studies', studyId, 'members', 'member'));
    });
    await assertFails(getBytes(ref(memberStorage, filePath)));
  });
});
