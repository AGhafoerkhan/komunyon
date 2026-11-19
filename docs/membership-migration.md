# Study membership migration

## New data shape

- `studies/{studyId}` keeps public event fields and the aggregate `approvedCount`.
- `studies/{studyId}/members/{uid}` stores one `pending`, `approved`, or `invited` state per person.
- Membership writes go through the `changeStudyMembership` callable Function. It updates the membership document and approved count atomically.
- A member can read their own record. Hosts and participant managers can read the full roster. Approved participants can read approved roster entries only.

The client still builds `pendingUserIds`, `approvedUserIds`, and `invitedUserIds` arrays in memory for existing UI components. They are not written to the event document.

## Existing Firebase data

The checked in migration script is read only unless `--apply` is supplied, and removes legacy UID arrays only with the additional `--prune` flag. It is restricted to the staging project `continuity-32390`.

Run a dry inventory first from the `functions` directory:

```powershell
npm run migrate:memberships -- --project=continuity-32390
```

The write run must happen in a planned maintenance window after the new Functions/client code is ready. It temporarily marks each study as locked, backfills missing member documents, calculates `approvedCount`, removes the three UID arrays, and unlocks the studies. Existing member documents are preserved, making a rerun safe after a partial interruption.

```powershell
npm run migrate:memberships -- --project=continuity-32390 --apply --prune
```

The script uses Firebase Admin Application Default Credentials. It does not read or print credentials. Do not run it against production; the script intentionally refuses project IDs other than staging.

## Rollout order

1. Back up the staging Firestore database and verify the backup is complete.
2. Schedule a brief membership maintenance window. Existing clients write the legacy arrays directly, so membership actions will be temporarily unavailable during the rules and data transition.
3. Deploy the `changeStudyMembership` and updated `toggleSessionAttendance` callable Functions.
4. Deploy the updated Firestore and Storage rules. This blocks legacy direct membership-array writes before the migration removes those arrays.
5. Run the migration with `--apply --prune` and verify its completion in the command output. The callable Functions check the temporary migration lock, so membership actions fail clearly while the conversion runs.
6. Deploy the updated web client, then smoke-test public cards/counts, request/approval, invites, leaving/removal, co-host permissions, file access, and account deletion on staging.

This repo change does not run the migration or deploy Functions, rules, or the site.
