'use client';

import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Avatar, Button } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { getFirebase } from '@/lib/firebase';
import { loadPeople } from '@/lib/studies';
import type { BibleStudy, JoinRequest } from '@/types';

export function CoHostPanel({ study }: { study: BibleStudy }) {
  const [people, setPeople] = useState<JoinRequest[]>([]);
  const [coHostIds, setCoHostIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadPeople(study.id, study.approvedUserIds),
      getDocs(collection(getFirebase().db, 'studies', study.id, 'managers')),
    ])
      .then(([approved, managers]) => {
        if (!active) return;
        setPeople(approved);
        setCoHostIds(managers.docs.map((item) => item.id));
      })
      .catch((failure: unknown) => {
        if (active) setError(actionError(failure));
      });
    return () => {
      active = false;
    };
  }, [study.id, study.approvedUserIds]);

  async function toggle(person: JoinRequest) {
    const assigned = coHostIds.includes(person.userId);
    setBusy(person.userId);
    setError(null);
    try {
      const managerRef = doc(getFirebase().db, 'studies', study.id, 'managers', person.userId);
      if (assigned) {
        await deleteDoc(managerRef);
        setCoHostIds((current) => current.filter((id) => id !== person.userId));
      } else {
        await setDoc(managerRef, { uid: person.userId, createdAt: new Date().toISOString() });
        setCoHostIds((current) => [...current, person.userId]);
      }
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section id="co-host" className="rounded-lg border border-line bg-card scroll-mt-24">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-serif text-xl">Co-host</h2>
        <p className="mt-1 text-sm text-muted">Assign an approved participant to help manage this study.</p>
      </div>
      <div className="px-4 py-3">
        {error ? <p className="mb-3 text-sm text-clay">{error}</p> : null}
        {people.length === 0 ? <p className="text-sm text-muted">Approve someone first to assign a co-host.</p> : null}
        <ul>
          {people.map((person) => {
            const assigned = coHostIds.includes(person.userId);
            return (
              <li key={person.userId} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                <Avatar src={person.photoURL} name={person.fullName} size={36} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{person.fullName}</p>
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void toggle(person)}>
                  {assigned ? 'Remove' : 'Assign'}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
