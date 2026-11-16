'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Spinner } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { missingFirebaseEnv } from '@/lib/firebase';

const story = [
  {
    label: 'Problem',
    title: 'You want to go, and you don’t know where',
    body: 'People want a Bible study almost every day. They don’t know who is hosting, where they could go, or how to host their own. They want to meet new people and really connect.',
    tone: 'slate',
    labelClass: 'text-[#fa387f]',
  },
  {
    label: 'Solution',
    title: 'Every study in the city, on one list',
    body: 'Komunyon is the overview for The Hague. Join a communion any time a seat is left, anywhere in the city, even if you don’t know the people. Or host one yourself.',
    tone: 'teal',
    labelClass: 'text-[#94d1c7]',
  },
  {
    label: 'Benefit',
    title: 'You meet people, then you get the details',
    body: 'You can see the neighbourhood, the time, and who is hosting before you go. After the host approves you, you receive the address and how to come in.',
    tone: 'ink',
    labelClass: 'text-[#ff999c]',
  },
] as const;

const steps = [
  { n: '1', title: 'Sign in', body: 'Start here with your Google account.' },
  { n: '2', title: 'Host or request', body: 'Host a study, or request to join one that still has a seat.' },
  { n: '3', title: 'Get the information', body: 'Once you are in, you receive the details for that gathering.' },
] as const;

const titleClass = 'w-full font-serif text-2xl leading-snug font-normal break-words text-[#f0f2f4] sm:text-3xl';
const bodyClass = 'mt-4 w-full text-sm leading-relaxed text-[#a7afbe] sm:text-base';

export default function HomePage() {
  const { signInWithGoogle, prepareGoogleSignIn, configured, signInError } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = missingFirebaseEnv();
  const message = error || signInError;

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const previous = meta?.getAttribute('content');
    meta?.setAttribute('content', '#0f1115');
    return () => {
      if (previous) meta?.setAttribute('content', previous);
    };
  }, []);

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
    <div className="flex min-h-dvh w-full flex-col bg-[#0f1115] text-[#e2e4e9]">
      <section className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-[#0f1115]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,179,162,0.18),transparent_58%)]"
        />
        <header className="relative w-full border-b border-[#2b303b]">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <span className="font-serif text-lg text-[#f0f2f4]">Komunyon</span>
            <span className="text-sm text-[#8a94a8]">The Hague</span>
          </div>
        </header>
        <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-12 text-center">
          <p className="text-xs tracking-wide text-[#70c2b4]">Bible studies &amp; communion</p>
          <span aria-hidden className="mt-5 h-px w-16 bg-gradient-to-r from-[#4db3a2] to-[#f9065f]" />
          <h1 className="mt-5 w-full font-serif text-3xl leading-tight font-normal break-words text-[#f0f2f4] sm:text-4xl">
            A seat at a Bible study, with people you have yet to meet.
          </h1>
          <p className="mt-4 w-full text-base leading-relaxed text-[#a7afbe]">
            Find who is gathering in The Hague, ask for a seat, or host a table of your own.
          </p>
        </div>
      </section>

      <main className="w-full">
        {story.map((item) => (
          <Band key={item.label} fill tone={item.tone}>
            <p className={`text-xs tracking-wide ${item.labelClass}`}>{item.label}</p>
            <h2 className={`mt-4 ${titleClass}`}>{item.title}</h2>
            <p className={bodyClass}>{item.body}</p>
          </Band>
        ))}

        <Band tone="slate">
          <h2 className={titleClass}>Start now</h2>
          <p className={bodyClass}>
            First sign in here. Then host a study, or request to join one. After that, you get the information about it.
          </p>
          <ol className="mt-8 grid w-full border-t border-[#2b303b] sm:grid-cols-3">
            {steps.map((step) => (
              <li
                key={step.n}
                className="border-b border-[#2b303b] py-5 sm:border-b-0 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0"
              >
                <p className="text-xs tracking-wide text-[#70c2b4]">{step.n}</p>
                <h3 className="mt-2 text-sm font-medium text-[#f0f2f4]">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[#a7afbe]">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8">
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

        <Band>
          <p className="text-xs tracking-wide text-[#ff999c]">Questions</p>
          <h2 className={`mt-4 ${titleClass}`}>Bring a question, or a specific request.</h2>
          <p className={bodyClass}>
            If you want to know how a study works before you sign in, or you need something the list does not cover, write
            or call. The contact is just below the button.
          </p>
        </Band>

        <Band tone="teal">
          <h2 className={titleClass}>Start now</h2>
          <p className={bodyClass}>Sign in, then host a study or request to join one. After that, you get the information.</p>
          <div className="mt-6">
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

        <Band>
          <h2 className={titleClass}>Inquiries and specific requests</h2>
          <dl className="mt-8 grid w-full gap-6 border-t border-[#2b303b] pt-6 sm:grid-cols-3">
            <div>
              <dt className="text-xs tracking-wide text-[#8a94a8]">Name</dt>
              <dd className="mt-1 text-sm break-words text-[#f0f2f4]">Angelo Ghafoerkhan</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-[#8a94a8]">Phone</dt>
              <dd className="mt-1 text-sm">
                <a href="tel:+31681963662" className="text-[#70c2b4] underline-offset-2 hover:underline">
                  +31 6 8196 3662
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-[#8a94a8]">Email</dt>
              <dd className="mt-1 text-sm">
                <a href="mailto:angeloghafoerkhan@gmail.com" className="break-all text-[#70c2b4] underline-offset-2 hover:underline">
                  angeloghafoerkhan@gmail.com
                </a>
              </dd>
            </div>
          </dl>
        </Band>
      </main>

      <footer className="w-full border-t border-[#2b303b] bg-[#0f1115] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-[#8a94a8]">
        <div className="mx-auto w-full max-w-2xl px-5 py-6 text-center">
          <p>Komunyon · The Hague</p>
          <p className="mt-1">Hosts approve each person. You can host, and you can join.</p>
        </div>
      </footer>
    </div>
  );
}

function Band({
  children,
  fill = false,
  tone = 'ink',
}: {
  children: ReactNode;
  fill?: boolean;
  tone?: 'ink' | 'slate' | 'teal';
}) {
  const tones = {
    ink: 'bg-[#0f1115]',
    slate: 'bg-[#16181d]',
    teal: 'bg-[#0f2420]',
  };
  return (
    <section className={`flex w-full items-center justify-center border-t border-[#2b303b] text-[#f0f2f4] ${tones[tone]} ${fill ? 'min-h-dvh' : ''}`}>
      <div className={`mx-auto flex w-full max-w-2xl flex-col items-center justify-center px-5 text-center ${fill ? 'py-12' : 'py-12 sm:py-16'}`}>
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
}: {
  configured: boolean;
  missing: string[];
  busy: boolean;
  message: string | null;
  onWarm: () => void;
  onSignIn: () => void;
}) {
  if (!configured) {
    return (
      <div className="w-full border border-[#2b303b] p-4 text-left text-[#f0f2f4]">
        <p className="text-sm font-medium">Add your Firebase web config to continue.</p>
        <p className="mt-2 text-sm leading-relaxed text-[#a7afbe]">
          Copy <code className="text-[#f0f2f4]">.env.example</code> to <code className="text-[#f0f2f4]">.env.local</code>, then deploy{' '}
          <code className="text-[#f0f2f4]">firestore.rules</code> and <code className="text-[#f0f2f4]">storage.rules</code>.
        </p>
        <ul className="mt-3 space-y-1 font-mono text-xs text-[#f0f2f4]">
          {missing.map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {message ? <Alert>{message}</Alert> : null}
      <button
        type="button"
        onPointerDown={onWarm}
        onClick={onSignIn}
        disabled={busy}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#4db3a2] bg-transparent px-4 text-sm font-medium text-[#dbf0ec] transition hover:bg-[#4db3a2] hover:text-[#0f1115] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {busy ? <Spinner /> : <GoogleMark />}
        Sign in with Google
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
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
