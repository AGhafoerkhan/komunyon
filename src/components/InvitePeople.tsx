'use client';

import { useEffect, useState } from 'react';
import { Avatar, Button, fieldClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { inviteToStudy, loadPeople, revokeInvite } from '@/lib/studies';
import { searchProfiles } from '@/lib/users';
import type { BibleStudy, JoinRequest, UserProfile } from '@/types';

export function InvitePeople({ study }: { study: BibleStudy }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [invited, setInvited] = useState<JoinRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = study.approvedUserIds.length >= study.maxCapacity;

  useEffect(() => {
    let active = true;
    void loadPeople(study.id, study.invitedUserIds)
      .then((people) => {
        if (active) setInvited(people);
      })
      .catch((failure: unknown) => {
        if (active) setError(actionError(failure));
      });
    return () => {
      active = false;
    };
  }, [study.id, study.invitedUserIds]);

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
        .then((people) => setResults(people.filter((person) => person.uid !== study.hostId)))
        .catch((failure: unknown) => setError(actionError(failure)))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [study.hostId, term]);

  async function send(person: UserProfile) {
    setBusy(person.uid);
    setError(null);
    try {
      await inviteToStudy(study.id, person.uid);
      setTerm('');
      setResults([]);
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      await revokeInvite(study.id, userId);
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-card">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-serif text-xl">Invite someone</h2>
        <p className="mt-1 text-sm text-muted">
          Search by their real name. They can accept from Invites. The address stays hidden until they do.
        </p>
      </div>
      <div className="px-4 py-4">
        {error ? <p className="mb-3 text-sm text-clay">{error}</p> : null}
        <input
          className={fieldClass}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search a name"
          aria-label="Search a name"
          autoComplete="off"
        />
        {searching ? <p className="mt-3 text-sm text-muted">Searching…</p> : null}
        {!searching && term.trim().length >= 2 && results.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No one with that name yet.</p>
        ) : null}
        {results.length > 0 ? (
          <ul className="mt-3">
            {results.map((person) => {
              const already =
                study.invitedUserIds.includes(person.uid) ||
                study.approvedUserIds.includes(person.uid) ||
                study.pendingUserIds.includes(person.uid);
              const label = study.approvedUserIds.includes(person.uid)
                ? 'In the group'
                : study.invitedUserIds.includes(person.uid)
                  ? 'Invited'
                  : study.pendingUserIds.includes(person.uid)
                    ? 'Requested'
                    : 'Invite';
              return (
                <li key={person.uid} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                  <Avatar src={person.photoURL} name={person.fullName} size={36} />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {person.fullName}
                    <span className="font-normal text-muted"> · {person.age}</span>
                  </p>
                  <Button
                    size="sm"
                    variant={already ? 'secondary' : 'primary'}
                    disabled={already || full || busy !== null || study.invitedUserIds.length >= 40}
                    onClick={() => void send(person)}
                  >
                    {label}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {full ? <p className="mt-3 text-xs text-muted">This study is full, so a new invite has to wait.</p> : null}
      </div>
      {invited.length > 0 ? (
        <ul className="border-t border-line">
          {invited.map((person) => (
            <li key={person.userId} className="flex items-center gap-3 px-4 py-3">
              <Avatar src={person.photoURL} name={person.fullName} size={36} />
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{person.fullName}</span>
                <span className="text-muted"> · Waiting</span>
              </p>
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void withdraw(person.userId)}>
                Withdraw
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
