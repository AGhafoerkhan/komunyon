# Komunyon — ChatGPT Development Context

## Product

Komunyon is a Next.js Bible-study gathering app hosted on Vercel. Users can create studies, request or accept invitations, be approved, attend individual recurring sessions, and contact approved participants by phone or WhatsApp.

The Firebase project is `continuity-32390`. Firestore and Functions use the Europe region where configured. The production site is `https://komunyon.vercel.app`.

## Stack

- Next.js App Router with TypeScript
- Firebase Auth, Firestore, Storage, and callable Cloud Functions
- Tailwind-style utility classes
- Firebase callable function: `toggleSessionAttendance` in `functions/index.js`
- Firebase rules: `firestore.rules`, `storage.rules`
- Main app source: `src/`

## Important roles

Every signed-in person is a user. A user may also host a study.

- Primary host: owns the study and has full control.
- Approved participant: can attend sessions and see private study details.
- Co-host: an approved participant assigned in `studies/{studyId}/managers/{uid}`.

Manager permissions are stored in the manager document:

```text
permissions.canEdit
permissions.canManageParticipants
permissions.canManageSessions
```

Permission meanings:

- `canEdit`: edit study details and recurring schedule.
- `canManageParticipants`: approve, decline, and remove participants. A co-host cannot remove themselves or the primary host.
- `canManageSessions`: cancel or proceed with individual sessions.

The primary host cannot be removed by a co-host. A co-host should not receive delete-study or co-host-permission management controls.

## Attendance model

Attendance is per session, not just per study:

```text
studies/{studyId}/sessions/{yyyy-mm-dd}/attendees/{uid}
studies/{studyId}/sessions/{yyyy-mm-dd}/summary/attendance
```

The callable Function updates attendee state and `attendingCount` transactionally. Do not let clients directly modify attendance summaries or counts.

Attendance list subscriptions should be realtime for participants, hosts, and co-hosts. The attendee list and Spots count must use the same session records. The host is counted only when the host actually joins that session; never blindly add a host to the count or attendee list.

For canceled dates:

- Spots must show `0 / capacity` and all spots left.
- The attendee list and ⓘ attendee control are hidden.
- Participants cannot join a canceled session.
- Hosts/co-hosts with session permission can proceed the session.

Host-side attendance is optional. If the host does not attend but an assigned co-host attends, the session continues. A session is automatically canceled only when the host and every assigned co-host explicitly mark themselves unavailable for that date. This logic runs in the trusted attendance Function.

## Session UI

The study page uses these concepts:

- `Attending this session`: opened with the small ⓘ control beside Spots. This is independent of `canManageSessions`.
- `Plan future attendance`: personal `Join / Cancel` choices for participants, hosts, and co-hosts.
- `Plan future sessions`: host/co-host session management with `Ongoing / Cancel`.

Hosts and co-hosts can have both personal attendance planning and session-management controls. A host may choose not to attend. A co-host with session permission can take over by joining attendance.

The host’s session-control column is labeled `Session`; for co-hosts it is labeled `Attendance` even when they can manage sessions.

## Co-host UI

The study page has a searchable Co-host panel. Assigned co-hosts appear below the search input, with an `Admin` button. Admin opens in the same tab and provides ON/OFF sliders for the three manager permissions. Save access stays below all sliders so more permissions can be added later.

Co-host labels should update realtime wherever the user appears, including People in this study and Attending this session.

## Rules and security

Firestore rules are authoritative. When changing roles or permissions:

1. Update the client UI.
2. Update `firestore.rules` with least-privilege checks.
3. Deploy with:

```powershell
npx -y firebase-tools deploy --only firestore:rules
```

The attendance Function is deployed with:

```powershell
npx -y firebase-tools deploy --only functions:toggleSessionAttendance --force
```

The old US-central function may produce a harmless cleanup warning because the active function is in `europe-west4`.

## UI conventions

- Preserve fixed dashboard card dimensions to prevent layout shifts.
- Keep controls minimal and aligned in stable columns.
- Use existing `PhotoLightbox` for profile and member photos.
- Use `Starts` instead of `When` for study start time.
- Use `Hosted · Joined · Circles` beside the profile image/name.
- Use the existing dark-mode colors and transition behavior.
- Keep phone numbers underlined/clickable and offer Phone or WhatsApp where already implemented.

## Development rules

- Workspace: `C:\github\projects\komunyon`
- Always run `npm run typecheck` after code changes.
- Every code change must be committed and pushed immediately.
- Git executable when `git` is not on PATH:

```text
C:\Users\extre\AppData\Local\GitHubDesktop\app-3.6.11\resources\app\git\cmd\git.exe
```

- Use `apply_patch` for edits.
- Preserve unrelated working-tree changes; stage only files belonging to the current task.
- Never reset or discard unrelated user changes.

## Recent important behavior

- A participant leaving their own study membership sees `You left this event.`
- A host removal shows `The host removed you from this study.`
- Host and participant counts must be unique by user ID.
- A host cannot be removed through participant management.
- Profile images open in the existing lightbox.
- Dashboard cards have a fixed, slightly reduced height with stable internal zones.

