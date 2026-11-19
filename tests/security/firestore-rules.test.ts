import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { arrayRemove, arrayUnion, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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
  pendingUserIds: [],
  approvedUserIds: ['member', 'manager', 'editor'],
  invitedUserIds: ['invitee'],
  skippedDates: [],
  createdAt,
  updatedAt: createdAt,
};

async function seed(path: string, value: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), value);
  });
}

async function seedStudy(id = studyId, patch: Record<string, unknown> = {}): Promise<void> {
  await seed(`studies/${id}`, { ...baseStudy, ...patch });
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
  it('requires sign-in and hides unlisted events from unrelated users', async () => {
    await seedStudy();
    await seedStudy('unlisted-event', { isPublic: false });

    await assertFails(getDoc(doc(db(), 'studies', studyId)));
    await assertSucceeds(getDoc(doc(db('visitor'), 'studies', studyId)));
    await assertFails(getDoc(doc(db('visitor'), 'studies', 'unlisted-event')));
    await assertSucceeds(getDoc(doc(db('host'), 'studies', 'unlisted-event')));
    await assertSucceeds(getDoc(doc(db('invitee'), 'studies', 'unlisted-event')));
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
  it('allows a participant manager to approve only the same person removed from pending', async () => {
    await seedStudy(studyId, { pendingUserIds: ['request-a', 'request-b'] });
    await managerPermissions('manager', { canManageParticipants: true });
    const ref = doc(db('manager'), 'studies', studyId);

    await assertSucceeds(updateDoc(ref, {
      pendingUserIds: ['request-b'],
      approvedUserIds: ['member', 'manager', 'editor', 'request-a'],
      updatedAt: createdAt,
    }));

    await testEnv.clearFirestore();
    await seedStudy(studyId, { pendingUserIds: ['request-a', 'request-b'] });
    await managerPermissions('manager', { canManageParticipants: true });
    await assertFails(updateDoc(doc(db('manager'), 'studies', studyId), {
      pendingUserIds: ['request-b'],
      approvedUserIds: ['member', 'manager', 'editor', 'unrequested-user'],
      updatedAt: createdAt,
    }));
  });

  it('allows an authorized co-host to decline one other person’s pending request', async () => {
    await seedStudy(studyId, { pendingUserIds: ['request-a', 'request-b'] });
    await managerPermissions('manager', { canManageParticipants: true });
    await assertSucceeds(updateDoc(doc(db('manager'), 'studies', studyId), {
      pendingUserIds: ['request-b'],
      updatedAt: createdAt,
    }));
  });

  it('does not let an editor without participant access change membership lists', async () => {
    await seedStudy(studyId, { pendingUserIds: ['request-a'] });
    await managerPermissions('editor', { canEdit: true });
    const ref = doc(db('editor'), 'studies', studyId);

    await assertSucceeds(updateDoc(ref, { title: 'Updated safe event', updatedAt: createdAt }));
    await assertFails(updateDoc(ref, {
      pendingUserIds: [],
      approvedUserIds: ['member', 'manager', 'editor', 'request-a'],
      updatedAt: createdAt,
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

  it('allows participant managers to add and revoke invites', async () => {
    await seedStudy();
    await managerPermissions('manager', { canManageParticipants: true });
    const ref = doc(db('manager'), 'studies', studyId);
    await assertSucceeds(updateDoc(ref, {
      invitedUserIds: arrayUnion('new-invitee'),
      updatedAt: createdAt,
    }));
    await assertSucceeds(updateDoc(ref, {
      invitedUserIds: arrayRemove('new-invitee'),
      updatedAt: createdAt,
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
        approvedUserIds: ['manager', 'editor'],
      });
    });
    await assertFails(getBytes(ref(memberStorage, filePath)));
  });
});
