'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { StudyCardView } from '@/components/StudyCardView';
import { Spinner } from '@/components/ui';
import { OFFLINE_AUTH_MESSAGE, SIGN_IN_CANCELLED_MESSAGE } from '@/lib/errors';
import { missingFirebaseEnv } from '@/lib/firebase';
import type { BibleStudy } from '@/types';

const exampleStudy: BibleStudy = {
  id: 'landing-example',
  hostId: 'example-host',
  hostName: 'Alex van Dijk',
  hostAge: 29,
  hostPhotoURL: '',
  title: 'Understanding biblical history',
  description: 'A welcoming event for conversation and shared study.',
  tags: ['bible-study', 'communion'],
  format: 'recurring',
  dayOfWeek: 0,
  date: null,
  time: '19:00',
  maxCapacity: 8,
  area: 'Centrum',
  isPublic: true,
  showMemberContacts: false,
  archived: false,
  approvedCount: 4,
  pendingUserIds: [],
  approvedUserIds: [],
  invitedUserIds: [],
  skippedDates: [],
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
};

const landingCardTheme = {
  '--color-card': '#171a20',
  '--color-ink': '#f0f2f4',
  '--color-muted': '#a7afbe',
  '--color-line': '#2b303b',
  '--color-canal': '#70c2b4',
  '--color-sand': '#252a33',
  '--color-clay': '#ff999c',
} as CSSProperties;

const steps = [
  {
    number: '01',
    title: 'Find an event',
    body: 'See public events by neighbourhood, time, and the next date’s available places. An event can be a study, prayer gathering, communion, or shared meal.',
  },
  {
    number: '02',
    title: 'Ask to join',
    body: 'A place being open does not add you automatically. The host or an authorized co-host reviews your request.',
  },
  {
    number: '03',
    title: 'Know where you’re going',
    body: 'After approval, you can see the exact address and the people attending the event.',
  },
] as const;

export default function HomePage() {
  const { signInWithGoogle, prepareGoogleSignIn, configured, signInError } = useAuth();
  const [busy, setBusy] = useState(false);
  const signInUnavailable = !configured || missingFirebaseEnv().length > 0;
  const message = signInError === SIGN_IN_CANCELLED_MESSAGE || signInError === OFFLINE_AUTH_MESSAGE
    ? signInError
    : signInError
      ? 'Sign-in didn’t work. Please try again or contact support.'
      : null;

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
    try {
      await signInWithGoogle();
    } catch {
      // AuthProvider logs the failure and provides the safe user-facing message.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#0f1115] text-[#f0f2f4]">
      <a href="#main" className="sr-only z-[100] rounded-md bg-[#f0f2f4] px-4 py-3 text-sm font-medium text-[#0f1115] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>

      <header className="relative z-10 border-b border-[#2b303b] bg-[#0f1115]/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4db3a2]">
            <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-[#4db3a2] font-serif text-lg text-[#0f1115]">K</span>
            <span>
              <span className="block font-serif text-lg leading-5">Komunyon</span>
              <span className="block text-xs leading-4 text-[#a7afbe]">The Hague</span>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="ml-auto flex items-center gap-2 sm:gap-5">
            <a href="#how-it-works" className="hidden rounded-sm text-sm text-[#c2c9d5] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4db3a2] sm:inline">
              How it works
            </a>
            <a href="#for-hosts" className="hidden rounded-sm text-sm text-[#c2c9d5] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4db3a2] sm:inline">
              For hosts
            </a>
            <Link href="/login" className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#3b4654] px-4 text-sm font-medium text-white transition hover:border-[#4db3a2] hover:bg-[#161e24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4db3a2]">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_25%,rgba(77,179,162,0.19),transparent_40%),radial-gradient(ellipse_at_10%_80%,rgba(77,179,162,0.08),transparent_35%)]" />
          <div className="mx-auto grid min-h-[620px] max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#314540] bg-[#14201f] px-3 py-1.5 text-xs font-medium tracking-wide text-[#9bd9ce]">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[#70c2b4]" />
                LOCAL EVENTS · THE HAGUE · COMING TO YOUR CITY SOON!
              </p>
              <h1 className="mt-6 font-serif text-4xl font-normal leading-[1.08] tracking-tight text-[#f0f2f4] sm:text-5xl lg:text-6xl">
                Find an event. Find your people.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[#b5bdca] sm:text-lg">
                Komunyon brings local events together. Find a study, prayer gathering, communion, or shared meal—or host an event of your own.
              </p>
              <p className="mt-3 text-sm font-medium text-[#70c2b4]">Coming to your city soon!</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <SignInButton busy={busy} unavailable={signInUnavailable} onWarm={prepareGoogleSignIn} onSignIn={() => void signIn()} />
                <a href="#how-it-works" className="inline-flex min-h-12 items-center justify-center rounded-md px-4 text-sm font-medium text-[#c6ced9] underline decoration-[#53606e] underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4db3a2]">
                  See how joining works
                </a>
              </div>
              {message ? <p role="alert" className="mt-4 max-w-md text-sm text-[#ffb1b4]">{message}</p> : null}
              {signInUnavailable ? <p role="status" className="mt-4 max-w-md text-sm text-[#a7afbe]">Sign-in is temporarily unavailable. Please try again later.</p> : null}
              <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-[#a7afbe]">
                <ShieldIcon />
                <span>You are never added just because a place is open. A host reviews your request first.</span>
              </p>
            </div>

            <ExampleStudyCard
              busy={busy}
              unavailable={signInUnavailable}
              onWarm={prepareGoogleSignIn}
              onSignIn={() => void signIn()}
            />
          </div>
        </section>

        <section aria-label="How Komunyon works" className="border-y border-[#2b303b] bg-[#16181d]">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 md:gap-0">
            <TrustPoint title="Host approval" text="Requests are reviewed before someone joins the group." />
            <TrustPoint title="Address stays private" text="The exact location is shared after approval." />
            <TrustPoint title="Choose each date" text="Join or leave individual dates. A recurring event doesn’t commit you to every week." />
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.18em] text-[#70c2b4]">A CLEAR WAY IN</p>
              <h2 className="mt-4 font-serif text-3xl font-normal leading-tight sm:text-4xl">A place is requested, not claimed.</h2>
              <p className="mt-4 text-base leading-relaxed text-[#a7afbe]">
                Open spots help you decide whether to ask. They never bypass the host’s approval.
              </p>
            </div>
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {steps.map((step) => (
                <li key={step.number} className="rounded-xl border border-[#2b303b] bg-[#14161b] p-5 sm:p-6">
                  <p className="font-mono text-xs tracking-widest text-[#70c2b4]">{step.number}</p>
                  <h3 className="mt-5 text-lg font-medium text-[#f0f2f4]">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#a7afbe]">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-col gap-4 rounded-xl border border-[#33443f] bg-[#14201f] p-5 sm:flex-row sm:items-start sm:p-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#203a35] text-[#9bd9ce]"><LockIcon /></span>
              <div>
                <h3 className="font-medium text-[#e9f5f2]">No surprise access to someone’s home</h3>
                <p className="mt-1 text-sm leading-relaxed text-[#b5c9c4]">
                  Public event cards show a neighbourhood, not a street address. Only approved members can open the private address and entry notes.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="for-hosts" className="scroll-mt-20 border-y border-[#2b303b] bg-[#16181d] px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[#70c2b4]">FOR HOSTS</p>
              <h2 className="mt-4 font-serif text-3xl font-normal leading-tight sm:text-4xl">Host an event. Keep control of the group.</h2>
              <p className="mt-4 text-base leading-relaxed text-[#a7afbe]">
                Set a place limit for each date, decide who can join, and hand specific responsibilities to a co-host when you need help.
              </p>
              <ul className="mt-7 space-y-3 text-sm text-[#d1d6df]">
                <Feature>Set recurring or one-off dates and cancel a single week.</Feature>
                <Feature>See who is attending each session and manage its open places.</Feature>
                <Feature>Grant co-host permissions by task, then change them when needed.</Feature>
                <Feature>Add session notes, photos, recordings, and transcripts to its history.</Feature>
              </ul>
            </div>
            <div className="rounded-2xl border border-[#303743] bg-[#101318] p-5 shadow-2xl shadow-black/20 sm:p-7">
              <div className="flex items-center justify-between gap-4 border-b border-[#2b303b] pb-4">
                <div>
                  <p className="text-xs text-[#8f9aaa]">HOST CONTROLS</p>
                  <h3 className="mt-1 font-serif text-xl">Your event, your call</h3>
                </div>
                <span className="rounded-full border border-[#3e5b53] bg-[#14201f] px-3 py-1 text-xs text-[#9bd9ce]">Host + co-host</span>
              </div>
              <div className="mt-5 space-y-3">
                <ControlRow icon={<CheckIcon />} title="Approve a request" detail="Share the address only when you approve." />
                <ControlRow icon={<CheckIcon />} title="Set a session limit" detail="Each date has its own attendance count." />
                <ControlRow icon={<CheckIcon />} title="Delegate carefully" detail="Give a co-host only the permissions you choose." />
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-6xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#70c2b4]">BUILT FOR PEOPLE, NOT PAPERWORK</p>
            <h2 className="mt-4 max-w-2xl font-serif text-3xl font-normal leading-tight sm:text-4xl">Quick to use. Clear about what happens next.</h2>
            <div className="mt-10 grid gap-8 border-t border-[#2b303b] pt-7 sm:grid-cols-3">
              <div>
                <h3 className="font-medium">Move at the speed of a tap</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#a7afbe]">Check dates, spots, and attendance together. Join one session without planning months ahead.</p>
              </div>
              <div>
                <h3 className="font-medium">Made to work on phones</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#a7afbe]">Responsive layouts, visible keyboard focus, reduced-motion support, and forms that take you to the first field needing attention.</p>
              </div>
              <div>
                <h3 className="font-medium">Private by design</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#a7afbe]">Firebase access rules protect private details and role-based actions. The host decides who is approved and which co-host tasks are allowed.</p>
              </div>
            </div>
            <p className="mt-8 max-w-3xl text-xs leading-relaxed text-[#8791a0]">
              Komunyon gives hosts tools to review membership and manage access; it does not independently verify a person’s identity or guarantee who will attend.
            </p>
          </div>
        </section>

        <section className="border-t border-[#2b303b] bg-[#11151a] px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.18em] text-[#70c2b4]">YOUR NEXT GATHERING COULD START HERE</p>
              <h2 className="mt-3 font-serif text-3xl font-normal sm:text-4xl">Find an event. Or host one.</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#a7afbe]">Sign in to see events in The Hague and request a place, or create an event of your own.</p>
            </div>
            <div className="shrink-0">
              <SignInButton busy={busy} unavailable={signInUnavailable} onWarm={prepareGoogleSignIn} onSignIn={() => void signIn()} />
              {message ? <p role="status" className="mt-3 text-sm text-[#ffb1b4]">{message}</p> : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#2b303b] bg-[#0f1115] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 text-sm text-[#8d97a6] sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p>Komunyon · The Hague</p>
            <address className="flex flex-col gap-2 not-italic sm:flex-row sm:gap-6">
              <a href="mailto:angeloghafoerkhan@gmail.com" className="w-fit rounded-sm underline decoration-[#596572] underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4db3a2]">
                angeloleeuw@gmail.com
              </a>
              <a href="tel:+31681963662" className="w-fit rounded-sm underline decoration-[#596572] underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4db3a2]">
                +31 6 8196 3662
              </a>
            </address>
          </div>
          <p className="border-t border-[#2b303b] pt-4 text-xs">© 2026 Komunyon. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}

function SignInButton({
  busy,
  unavailable,
  onWarm,
  onSignIn,
}: {
  busy: boolean;
  unavailable: boolean;
  onWarm: () => void;
  onSignIn: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={onWarm}
      onClick={onSignIn}
      disabled={busy || unavailable}
      className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-md bg-[#4db3a2] px-5 text-sm font-semibold text-[#0f1115] transition hover:bg-[#70c2b4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#b6eee3] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
    >
      {busy ? <Spinner /> : <GoogleMark />}
      {busy ? 'Signing in…' : unavailable ? 'Sign-in unavailable' : 'Continue with Google'}
    </button>
  );
}

function ExampleStudyCard({ busy, unavailable, onWarm, onSignIn }: { busy: boolean; unavailable: boolean; onWarm: () => void; onSignIn: () => void }) {
  return (
    <aside aria-label="Example event card" className="mx-auto w-full max-w-md" style={landingCardTheme}>
      <StudyCardView
        study={exampleStudy}
        href="/login"
        hosting={false}
        joined={false}
        past={false}
        canceledDate={null}
        scheduleText="Every Sunday · 19:00"
        note=""
        displayedHostName="A van Dijk"
        sessionDate={null}
        sessionTaken={4}
        joinBusy={busy || unavailable}
        joinRequested={false}
        onRequestJoinWarm={onWarm}
        onRequestJoin={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSignIn();
        }}
      />
    </aside>
  );
}

function TrustPoint({ title, text }: { title: string; text: string }) {
  return (
    <div className="border-b border-[#2b303b] py-3 first:pt-0 last:border-b-0 last:pb-0 md:border-b-0 md:border-l md:px-7 md:first:border-l-0 md:first:pl-0 md:last:pr-0">
      <h2 className="text-sm font-semibold text-[#eef1f5]">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-[#a7afbe]">{text}</p>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 leading-relaxed">
      <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#203a35] text-[#9bd9ce]"><CheckIcon /></span>
      <span>{children}</span>
    </li>
  );
}

function ControlRow({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#2b303b] bg-[#171a20] p-4">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#203a35] text-[#9bd9ce]">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-[#a7afbe]">{detail}</span>
      </span>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5 16 5v4.4c0 3.9-2.6 6.7-6 8.1-3.4-1.4-6-4.2-6-8.1V5l6-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m7.3 9.8 1.8 1.8 3.7-3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 20 20" fill="none">
      <rect x="3.5" y="8.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 8.5V6a3.5 3.5 0 1 1 7 0v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="size-3.5" viewBox="0 0 16 16" fill="none">
      <path d="m3.5 8.2 2.8 2.7 6.2-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}
