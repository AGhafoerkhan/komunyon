import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectId = 'demo-komunyon';
const firebaseCli = resolve('node_modules/firebase-tools/lib/bin/firebase.js');
if (!existsSync(firebaseCli)) {
  throw new Error('Firebase CLI is missing. Install the project dependencies before running E2E tests.');
}

Object.assign(process.env, {
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR: 'true',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'fake-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456789:web:e2e-test',
});

const child = spawn(process.execPath, [
  firebaseCli,
  'emulators:exec',
  '--only',
  'auth,firestore,functions,storage',
  '--project',
  projectId,
  'npx playwright test --config=playwright.e2e.config.ts',
], { stdio: 'inherit', env: process.env });

child.on('error', (error) => {
  console.error('Could not start Firebase emulator E2E tests:', error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
