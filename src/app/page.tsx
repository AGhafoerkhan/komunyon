'use client';

import { useState, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Spinner } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { missingFirebaseEnv } from '@/lib/firebase';

const story = [
  {
    label: 'Problem',
    title: 'You want to go, and you don’t know where',
    body: 'People want a Bible study almost every day. They don’t know who is hosting, where they could go, or how to host their own. They want to meet new people and really connect.',
    tone: 'paper',
  },
  {
    label: 'Solution',
    title: 'Every study in the city, on one list',
    body: 'Komunyon is the overview for The Hague. Join a communion any time a seat is left, anywhere in the city, even if you don’t know the people. Or host one yourself.',
    tone: 'sand',
  },
  {
    label: 'Benefit',
    title: 'You meet people, then you get the details',
    body: 'You can see the neighbourhood, the time, and who is hosting before you go. After the host approves you, you receive the address and how to come in.',
    tone: 'card',
  },
] as const;

const steps = [
  { n: '1', title: 'Sign in', body: 'Start here with your Google account.' },
  { n: '2', title: 'Host or request', body: 'Host a study, or request to join one that still has a seat.' },
  { n: '3', title: 'Get the information', body: 'Once you are in, you receive the details for that gathering.' },
] as const;

export default function HomePage() {
  const { signInWithGoogle, prepareGoogleSignIn, configured, signInError } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = missingFirebaseEnv();
  const message = error || signInError;

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh w-full flex-col">
      <header className="flex w-full items-center justify-between gap-4 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 sm:px-8 lg:px-12">
        <span className="font-serif text-lg">Komunyon</span>
        <span className="text-sm text-muted">The Hague</span>
      </header>

      <main className="w-full">
        <Band>
          <p className="text-sm font-medium text-canal">Bible studies &amp; communion</p>
          <h1 className="mt-6 w-full font-serif text-4xl leading-tight break-words sm:text-6xl">
            A seat at a Bible study, with people you have yet to meet.
          </h1>
          <p className="mt-8 w-full text-lg leading-relaxed text-muted">
            Find who is gathering in The Hague, ask for a seat, or host a table of your own.
          </p>
        </Band>

        {story.map((item) => (
          <Band key={item.label} tone={item.tone} fill>
            <p className="text-sm font-medium text-canal">{item.label}</p>
            <h2 className="mt-6 w-full font-serif text-3xl leading-tight break-words sm:text-5xl">{item.title}</h2>
            <p className="mt-6 w-full text-base leading-relaxed text-muted sm:text-lg">{item.body}</p>
          </Band>
        ))}

        <Band>
          <h2 className="w-full font-serif text-3xl leading-tight sm:text-5xl">Start now</h2>
          <p className="mt-6 w-full text-base leading-relaxed text-muted sm:text-lg">
            First sign in here. Then host a study, or request to join one. After that, you get the information about it.
          </p>
          <ol className="mt-12 grid w-full gap-6 sm:grid-cols-3 sm:gap-8">
            {steps.map((step) => (
              <li key={step.n} className="rounded-lg border border-line bg-card p-6 sm:p-8">
                <span className="font-serif text-3xl text-canal">{step.n}</span>
                <h3 className="mt-4 font-serif text-2xl leading-tight">{step.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12">
            <Access
              configured={configured}
              missing={missing}
              busy={busy}
              message={message}
              onWarm={prepareGoogleSignIn}
              onSignIn={() => void signIn()}
            />
          </div>
        </Band>

        <Band tone="sand">
          <p className="text-sm font-medium text-canal">Questions</p>
          <h2 className="mt-6 w-full font-serif text-3xl leading-tight break-words sm:text-5xl">
            Bring a question, or a specific request.
          </h2>
          <p className="mt-6 w-full text-base leading-relaxed text-muted sm:text-lg">
            If you want to know how a study works before you sign in, or you need something the list does not cover, write
            or call. The contact is just below the button.
          </p>
        </Band>

        <Band tone="canal">
          <h2 className="w-full font-serif text-3xl leading-tight sm:text-5xl">Start now</h2>
          <p className="mt-6 w-full text-base leading-relaxed text-white/80 sm:text-lg">
            Sign in, then host a study or request to join one. After that, you get the information.
          </p>
          <div className="mt-12">
            <Access
              configured={configured}
              missing={missing}
              busy={busy}
              message={message}
              onWarm={prepareGoogleSignIn}
              onSignIn={() => void signIn()}
              light
            />
          </div>
        </Band>

        <Band>
          <h2 className="w-full font-serif text-3xl leading-tight sm:text-5xl">Inquiries and specific requests</h2>
          <p className="mt-6 w-full text-base leading-relaxed text-muted sm:text-lg">
            Angelo Ghafoerkhan answers questions about hosting, joining, and anything the list does not cover.
          </p>
          <dl className="mt-12 grid w-full gap-10 sm:grid-cols-3 sm:gap-8">
            <div>
              <dt className="text-sm font-medium text-canal">Name</dt>
              <dd className="mt-2 font-serif text-2xl leading-tight break-words">Angelo Ghafoerkhan</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-canal">Phone</dt>
              <dd className="mt-2 text-lg">
                <a href="tel:+31681963662" className="text-ink underline-offset-2 hover:underline">
                  +31 6 8196 3662
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-canal">Email</dt>
              <dd className="mt-2 text-lg">
                <a href="mailto:angeloghafoerkhan@gmail.com" className="break-all text-ink underline-offset-2 hover:underline">
                  angeloghafoerkhan@gmail.com
                </a>
              </dd>
            </div>
          </dl>
        </Band>
      </main>

      <footer className="w-full border-t border-line px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-sm leading-relaxed text-muted sm:px-8 lg:px-12">
        <p>Komunyon · The Hague</p>
        <p className="mt-2">Hosts approve each person. You can host, and you can join.</p>
      </footer>
    </div>
  );
}

function Band({
  children,
  tone = 'paper',
  fill = false,
}: {
  children: ReactNode;
  tone?: 'paper' | 'sand' | 'card' | 'canal';
  fill?: boolean;
}) {
  const tones = {
    paper: 'bg-paper text-ink',
    sand: 'bg-sand text-ink',
    card: 'bg-card text-ink',
    canal: 'bg-canal text-white',
  };
  return (
    <section className={`flex w-full ${fill ? 'min-h-dvh' : ''} ${tones[tone]}`}>
      <div
        className={`flex w-full flex-col justify-center px-5 sm:px-8 lg:px-12 ${
          fill ? 'py-16' : 'py-16 sm:py-24 lg:py-28'
        }`}
      >
        {children}
      </div>
    </section>
  );
}

function Access({
  configured,
  missing,
  busy,
  message,
  onWarm,
  onSignIn,
  light = false,
}: {
  configured: boolean;
  missing: string[];
  busy: boolean;
  message: string | null;
  onWarm: () => void;
  onSignIn: () => void;
  light?: boolean;
}) {
  if (!configured) {
    return (
      <div className="w-full rounded-lg border border-line bg-card p-6 text-ink">
        <p className="text-sm font-medium">Add your Firebase web config to continue.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Copy <code className="text-ink">.env.example</code> to <code className="text-ink">.env.local</code>, then deploy{' '}
          <code className="text-ink">firestore.rules</code> and <code className="text-ink">storage.rules</code>.
        </p>
        <ul className="mt-4 space-y-1 font-mono text-xs text-ink">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-4 sm:items-start">
      {message ? <Alert>{message}</Alert> : null}
      <button
        type="button"
        onPointerDown={onWarm}
        onClick={onSignIn}
        disabled={busy}
        className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${
          light ? 'bg-white text-ink hover:bg-sand' : 'border border-line bg-white text-ink hover:bg-sand'
        }`}
      >
        {busy ? <Spinner /> : <GoogleMark />}
        Sign in with Google
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
