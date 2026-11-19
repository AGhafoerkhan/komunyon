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
import { getBytes, ref, uploadString } from 'firebase/storage';

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
});

describe('profile and group contact privacy', () => {
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
