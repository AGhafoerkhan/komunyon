# Komunyon

Host and join Bible studies and communion groups in **The Hague**. Street addresses stay off the public study document until a host approves someone.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Firebase Auth, Firestore, and Storage via the modular client SDK
- No Firebase Admin SDK and no Next.js API routes

## Privacy model

| Path | Who can read | Who can write |
| --- | --- | --- |
| `users/{uid}` | Signed-in users | That user only |
| `studies/{studyId}` | Signed-in users | The host, plus a member adding/removing **their own** uid |
| `studies/{studyId}/private/details` | Host and `approvedUserIds` | Host only |
| `avatars/{uid}` | Signed-in users | That user only |

`studies/{studyId}` stores the host snapshot, neighbourhood, schedule, capacity, `pendingUserIds`, and `approvedUserIds`. `exactAddress` and `entryNotes` live only under `private/details`.

A host solely owns their study: only `hostId` can edit, delete, approve, decline, or remove someone. Any signed-in user can host a study and request to join others.

## Setup

1. Create a Firebase project and a web app.
2. Enable **Google** as a sign-in provider, and add `localhost` to authorized domains.
3. Create Firestore and Storage.
4. Copy the environment file and fill in the web config:

```bash
cp .env.example .env.local
```

5. Deploy the security rules before using the app (the client cannot enforce them):

```bash
npx firebase-tools deploy --only firestore:rules,storage
```

6. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — local dev server
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — Next.js ESLint
- `npm run build` — production build

## Licence

[MIT](./LICENSE)
