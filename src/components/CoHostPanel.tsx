'use client';

import Link from 'next/link';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Avatar, Button, buttonClass, fieldClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { getFirebase } from '@/lib/firebase';
import { loadPeople } from '@/lib/studies';
import { searchProfiles } from '@/lib/users';
import type { BibleStudy, JoinRequest, UserProfile } from '@/types';

export function CoHostPanel({ study }: { study: BibleStudy }) {
  const [people, setPeople] = useState<JoinRequest[]>([]);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [coHostIds, setCoHostIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [adminUid, setAdminUid] = useState<string | null>(null);
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
        setPermissions(Object.fromEntries(managers.docs.map((item) => [item.id, item.data().permissions?.canEdit === true])));
      })
      .catch((failure: unknown) => {
        if (active) setError(actionError(failure));
      });
    return () => {
      active = false;
    };
  }, [study.id, study.approvedUserIds]);

  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchProfiles(query)
        .then((profiles) => setResults(profiles.filter((person) => person.uid !== study.hostId && !coHostIds.includes(person.uid))))
        .catch((failure: unknown) => setError(actionError(failure)))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [coHostIds, study.hostId, term]);

  async function toggle(person: UserProfile) {
    const assigned = coHostIds.includes(person.uid);
    setBusy(person.uid);
    setError(null);
    try {
      const managerRef = doc(getFirebase().db, 'studies', study.id, 'managers', person.uid);
      if (assigned) {
        await deleteDoc(managerRef);
        setCoHostIds((current) => current.filter((id) => id !== person.uid));
      } else {
        await setDoc(managerRef, { uid: person.uid, createdAt: new Date().toISOString() });
        setCoHostIds((current) => [...current, person.uid]);
      }
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(null);
    }
  }

  async function saveAdmin(uid: string) {
    setBusy(uid);
    setError(null);
    try {
      await setDoc(doc(getFirebase().db, 'studies', study.id, 'managers', uid), {
        uid,
        permissions: { canEdit: permissions[uid] === true },
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setAdminUid(null);
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
        <input className={fieldClass} value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search an approved participant" aria-label="Search an approved participant" autoComplete="off" />
        {coHostIds.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Assigned co-hosts</p>
            <ul className="mt-2">
              {people.filter((person) => coHostIds.includes(person.userId)).map((person) => (
                <div key={person.userId}>
                <li className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                  <Avatar src={person.photoURL} name={person.fullName} size={36} />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{person.fullName}</p>
                  <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void toggle({ uid: person.userId, fullName: person.fullName, photoURL: person.photoURL } as UserProfile)}>
                    Remove
                  </Button>
                  <Link
                    href={`/studies/${study.id}/admin?uid=${encodeURIComponent(person.userId)}`}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Admin
                  </Link>
                </li>
                {adminUid === person.userId ? (
                  <li className="border-b border-line pb-3 text-sm">
                    <label className="flex items-center gap-2 text-muted">
                      <input
                        type="checkbox"
                        checked={permissions[person.userId] === true}
                        onChange={(event) => setPermissions((current) => ({ ...current, [person.userId]: event.target.checked }))}
                      />
                      Can edit this study
                    </label>
                    <Button size="sm" className="mt-2" disabled={busy !== null} onClick={() => void saveAdmin(person.userId)}>
                      Save access
                    </Button>
                  </li>
                ) : null}
                </div>
              ))}
            </ul>
          </div>
        ) : null}
        {searching ? <p className="mt-3 text-sm text-muted">Searching…</p> : null}
        {!searching && term.trim().length >= 2 && results.length === 0 ? <p className="mt-3 text-sm text-muted">No one with that name yet.</p> : null}
        <ul>
          {results.map((person) => {
            const approved = people.some((member) => member.userId === person.uid);
            const assigned = coHostIds.includes(person.uid);
            return (
              <li key={person.uid} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                <Avatar src={person.photoURL} name={person.fullName} size={36} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{person.fullName}</p>
                <Button size="sm" variant="secondary" disabled={!approved || busy !== null} onClick={() => void toggle(person)}>
                  {!approved ? 'Approve first' : assigned ? 'Remove' : 'Assign'}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
