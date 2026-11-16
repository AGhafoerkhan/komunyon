'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudyForm } from '@/components/StudyForm';
import { useAuth } from '@/components/AuthProvider';
import { AppShell } from '@/components/TopBar';
import { LoadingScreen, pageTitleClass } from '@/components/ui';
import { createStudy } from '@/lib/studies';

export default function NewStudyPage() {
  const router = useRouter();
  const { profile } = useAuth();
  if (!profile?.profileCompleted) return <LoadingScreen />;

  return (
    <AppShell>
      <Link href="/dashboard" className="inline-flex text-sm text-muted hover:text-ink">
        ← All studies
      </Link>
      <h1 className={`mt-3 ${pageTitleClass}`}>Host a Bible study</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Tell people when and where in The Hague you meet. The exact address is stored privately.
      </p>
      <div className="max-w-2xl">
        <StudyForm
          submitLabel="Publish study"
          onSubmit={async (draft) => {
            const id = await createStudy(profile, draft);
            router.push(`/studies/${id}`);
          }}
        />
      </div>
    </AppShell>
  );
}
