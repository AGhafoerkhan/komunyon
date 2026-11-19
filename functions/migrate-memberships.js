const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const args = new Set(process.argv.slice(2));
const projectArg = [...args].find((value) => value.startsWith('--project='));
const projectId = projectArg?.split('=')[1];
const apply = args.has('--apply');
const prune = args.has('--prune');

if (!projectId) throw new Error('Pass an explicit --project=<firebase-project-id>.');
if (projectId !== 'continuity-32390') throw new Error('This migration runner is restricted to the staging project continuity-32390.');
if (prune && !apply) throw new Error('--prune requires --apply.');

initializeApp({ projectId });
const db = getFirestore();
const statuses = ['pending', 'approved', 'invited'];

function values(doc, field) {
  const value = doc[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((uid) => typeof uid !== 'string' || !uid)) {
    throw new Error(`Invalid ${field} value in study ${doc.id}.`);
  }
  return value;
}

function membershipPlan(study) {
  const lists = {
    pending: values(study, 'pendingUserIds'),
    approved: values(study, 'approvedUserIds'),
    invited: values(study, 'invitedUserIds'),
  };
  const seen = new Map();
  for (const status of statuses) {
    for (const uid of lists[status]) {
      if (seen.has(uid)) throw new Error(`UID appears in multiple membership lists for study ${study.id}: ${uid}`);
      seen.set(uid, status);
    }
  }
  return [...seen].map(([uid, status]) => ({ uid, status }));
}

async function commitBatches(writes) {
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch();
    writes.slice(index, index + 400).forEach((write) => write(batch));
    await batch.commit();
  }
}

async function main() {
  const studies = await db.collection('studies').get();
  const plans = studies.docs.map((snapshot) => ({ snapshot, members: membershipPlan({ ...snapshot.data(), id: snapshot.id }) }));
  const memberTotal = plans.reduce((total, plan) => total + plan.members.length, 0);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${plans.length} studies, ${memberTotal} legacy membership records; prune=${prune}.`);
  if (!apply) return;

  const lockedRefs = [];
  try {
    for (let index = 0; index < studies.docs.length; index += 400) {
      const chunk = studies.docs.slice(index, index + 400);
      await commitBatches(chunk.map((snapshot) => (batch) => batch.update(snapshot.ref, { membershipMigrationLocked: true })));
      lockedRefs.push(...chunk.map((snapshot) => snapshot.ref));
    }

    // Re-read after every study is locked, so a last write from an older client is included.
    const lockedSnapshots = await Promise.all(lockedRefs.map((ref) => ref.get()));
    const lockedPlans = lockedSnapshots.map((snapshot) => ({
      snapshot,
      members: membershipPlan({ ...snapshot.data(), id: snapshot.id }),
    }));

    for (const { snapshot, members } of lockedPlans) {
      const memberCollection = snapshot.ref.collection('members');
      for (const member of members) {
        const ref = memberCollection.doc(member.uid);
        await db.runTransaction(async (transaction) => {
          const existing = await transaction.get(ref);
          if (!existing.exists) {
            transaction.create(ref, {
              ...member,
              createdAt: snapshot.data().updatedAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        });
      }
      if (prune) {
        const roster = await memberCollection.get();
        const approvedCount = roster.docs.filter((item) => item.data().status === 'approved').length;
        await snapshot.ref.update({
          approvedCount,
          pendingUserIds: FieldValue.delete(),
          approvedUserIds: FieldValue.delete(),
          invitedUserIds: FieldValue.delete(),
        });
      }
      console.log(`Migrated ${snapshot.id}: ${members.length} legacy memberships.`);
    }
  } finally {
    await commitBatches(lockedRefs.map((ref) => (batch) => batch.update(ref, { membershipMigrationLocked: FieldValue.delete() })));
  }
  console.log(prune ? 'Membership IDs removed from study documents.' : 'Membership records backfilled; legacy arrays retained.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
