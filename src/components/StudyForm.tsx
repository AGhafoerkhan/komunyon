'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, FormError, Spinner, fieldClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { HAGUE_AREAS } from '@/lib/hague';
import { isDayOfWeek } from '@/lib/guards';
import { DAY_FILTERS, dayName, formatDdMmYyyy, upcomingSessions } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { sortTags, STUDY_TAGS, type StudyTag } from '@/lib/tags';
import { CHECK_AGAIN, validateStudyDraft, type StudyField } from '@/lib/validate';
import { jumpToFirstInvalidField } from '@/lib/forms';
import { useSuccessToast } from '@/components/SuccessToast';
import { useAuth } from '@/components/AuthProvider';
import { ClientDraftStatus, useClientDraft } from '@/components/useClientDraft';
import { clientDraftKey } from '@/lib/clientDrafts';
import type { DayOfWeek, StudyDraft, StudyFormat } from '@/types';

const EMPTY: StudyDraft = {
  title: '',
  description: '',
  tags: [],
  format: 'recurring',
  dayOfWeek: null,
  date: null,
  time: '19:00',
  maxCapacity: 8,
  area: '',
  isPublic: true,
  showMemberContacts: true,
  skippedDates: [],
  exactAddress: '',
  entryNotes: '',
};

export function StudyForm({
  initial,
  minCapacity = 1,
  submitLabel,
  successMessage,
  draftId,
  sourceVersion = null,
  onSubmit,
}: {
  initial?: StudyDraft;
  minCapacity?: number;
  submitLabel: string;
  successMessage: string;
  draftId: string;
  sourceVersion?: string | null;
  onSubmit: (draft: StudyDraft) => Promise<void>;
}) {
  const { showSuccess } = useSuccessToast();
  const { user } = useAuth();
  const initialDraft = useRef<StudyDraft>(initial ?? EMPTY).current;
  const [draft, setDraft] = useState<StudyDraft>(initialDraft);
  const [fields, setFields] = useState<Partial<Record<StudyField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const storageKey = user ? clientDraftKey(user.uid, `study-${draftId}`) : 'komunyon:form-draft:study:anonymous';
  const { status: draftStatus, markSaved: markDraftSaved, discardDraft } = useClientDraft({
    storageKey,
    initialValue: initialDraft,
    value: draft,
    setValue: setDraft,
    sourceVersion,
  });

  useEffect(() => {
    if (Object.keys(fields).length === 0) return;
    const frame = window.requestAnimationFrame(() => jumpToFirstInvalidField(formRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [fields]);

  function patch(partial: Partial<StudyDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function toggleTag(tag: StudyTag) {
    setDraft((current) => {
      const tags = current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag];
      return { ...current, tags: sortTags(tags) };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateStudyDraft(draft, minCapacity);
    if (Object.keys(found).length > 0) {
      setFields(found);
      setFormError(CHECK_AGAIN);
      return;
    }
    setSaving(true);
    setFields({});
    setFormError(null);
    try {
      await onSubmit(draft);
      markDraftSaved();
      showSuccess(successMessage);
    } catch (failure) {
      setFormError(actionError(failure));
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={(event) => void handleSubmit(event)} className="mt-6 flex flex-col gap-8 pb-16" noValidate>
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-serif text-xl">The gathering</h2>
          <p className="mt-1 text-sm text-muted">Visible to anyone signed in. Use a neighbourhood, never a street.</p>
        </div>

        <Field label="Title" hint="At least 6 characters." error={fields.title}>
          <input
            className={fieldClass}
            aria-invalid={Boolean(fields.title)}
            value={draft.title}
            maxLength={LIMITS.titleMax}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="Thursday evening communion"
            required
          />
        </Field>

        <Field label="Description" hint="At least 12 characters." error={fields.description}>
          <textarea
            className={`${fieldClass} min-h-28 resize-y`}
            aria-invalid={Boolean(fields.description)}
            value={draft.description}
            maxLength={LIMITS.descriptionMax}
            onChange={(event) => patch({ description: event.target.value })}
            placeholder="What you read, who it is for, and whether you share a meal."
            required
          />
        </Field>

        <div>
          <p className="text-sm font-medium">What happens</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Pick every label that fits. A prayer night with communion can wear both.
          </p>
          <div
            className="mt-2 flex flex-wrap gap-2"
            role="group"
            aria-label="What happens labels"
            data-invalid={Boolean(fields.tags)}
            tabIndex={fields.tags ? -1 : undefined}
          >
            {STUDY_TAGS.map((tag) => {
              const pressed = draft.tags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => toggleTag(tag.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    pressed ? 'border-canal bg-canal/5 text-ink' : 'border-line bg-card text-muted hover:bg-sand'
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
          {fields.tags ? <p className="mt-1.5 text-sm text-clay">{fields.tags}</p> : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <FormatChoice
            label="Recurring"
            detail="Same day each week"
            pressed={draft.format === 'recurring'}
            onClick={() => patch({ format: 'recurring' })}
          />
          <FormatChoice
            label="One-off"
            detail="A single tryout gathering"
            pressed={draft.format === 'one-off'}
            onClick={() => patch({ format: 'one-off' })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {draft.format === 'recurring' ? (
            <Field label="Day of week" error={fields.day}>
              <select
                className={fieldClass}
                aria-invalid={Boolean(fields.day)}
                value={draft.dayOfWeek === null ? '' : String(draft.dayOfWeek)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  patch({ dayOfWeek: isDayOfWeek(value) ? value : null, skippedDates: [] });
                }}
                required
              >
                <option value="">Choose a day</option>
                {DAY_FILTERS.map((day) => (
                  <option key={day} value={day}>
                    {dayName(day)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Date" error={fields.date}>
              <input
                className={fieldClass}
                aria-invalid={Boolean(fields.date)}
                type="date"
                value={draft.date ?? ''}
                onChange={(event) => patch({ date: event.target.value || null })}
                required
              />
            </Field>
          )}
          <Field label="Time" error={fields.time}>
            <input
              className={fieldClass}
              aria-invalid={Boolean(fields.time)}
              type="time"
              value={draft.time}
              onChange={(event) => patch({ time: event.target.value })}
              required
            />
          </Field>
        </div>

        {draft.format === 'recurring' && draft.dayOfWeek !== null ? (
          <WeekSkips
            day={draft.dayOfWeek}
            time={draft.time}
            skippedDates={draft.skippedDates}
            onToggle={(date) =>
              setDraft((current) => ({
                ...current,
                skippedDates: current.skippedDates.includes(date)
                  ? current.skippedDates.filter((item) => item !== date)
                  : [...current.skippedDates, date],
              }))
            }
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Neighbourhood" hint="Shown on the study card." error={fields.area}>
            <select
              className={fieldClass}
              aria-invalid={Boolean(fields.area)}
              value={draft.area}
              onChange={(event) => patch({ area: event.target.value })}
              required
            >
              <option value="">Choose an area in The Hague</option>
              {HAGUE_AREAS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Max capacity"
            hint="Maximum attendance for each session."
            error={fields.maxCapacity}
          >
            <input
              className={fieldClass}
              aria-invalid={Boolean(fields.maxCapacity)}
              type="number"
              min={minCapacity}
              max={LIMITS.capacityMax}
              value={Number.isInteger(draft.maxCapacity) ? draft.maxCapacity : ''}
              onChange={(event) => patch({ maxCapacity: Number(event.target.value) })}
              required
            />
          </Field>
        </div>
      </section>

      <section className="flex items-center justify-between gap-4 rounded-lg border border-line bg-card px-4 py-4">
        <div className="min-w-0">
          <h2 className="font-serif text-xl">Public</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            On, anyone signed in can find this study. Off, only you can see it until you invite someone.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.isPublic}
          aria-label="Public"
          onClick={() => patch({ isPublic: !draft.isPublic })}
          className="inline-flex h-11 w-16 shrink-0 items-center justify-center"
        >
          <span className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${draft.isPublic ? 'bg-canal' : 'bg-line'}`}>
            <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${draft.isPublic ? 'translate-x-7' : 'translate-x-1'}`} />
          </span>
        </button>
      </section>

      <section className="flex items-center justify-between gap-4 rounded-lg border border-line bg-card px-4 py-4">
        <div className="min-w-0">
          <h2 className="font-serif text-xl">Participants can see each other’s numbers</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">When enabled, approved members can see each other’s phone numbers and WhatsApp links.</p>
        </div>
        <button type="button" role="switch" aria-checked={draft.showMemberContacts} aria-label="Members can contact each other" onClick={() => patch({ showMemberContacts: !draft.showMemberContacts })} className="inline-flex h-11 w-16 shrink-0 items-center justify-center">
          <span className={'relative inline-flex h-8 w-14 items-center rounded-full transition ' + (draft.showMemberContacts ? 'bg-canal' : 'bg-line')}>
            <span className={'inline-block h-6 w-6 rounded-full bg-white shadow transition ' + (draft.showMemberContacts ? 'translate-x-7' : 'translate-x-1')} />
          </span>
        </button>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-line bg-sand/50 p-4">
        <div>
          <h2 className="font-serif text-xl">At the door</h2>
          <p className="mt-1 text-sm text-muted">
            Saved separately and shown only to you and people you approve. It is not on the public study.
          </p>
        </div>
        <Field label="Exact address" error={fields.exactAddress}>
          <input
            className={fieldClass}
            aria-invalid={Boolean(fields.exactAddress)}
            value={draft.exactAddress}
            maxLength={LIMITS.addressMax}
            autoComplete="street-address"
            onChange={(event) => patch({ exactAddress: event.target.value })}
            placeholder="Street and number"
            required
          />
        </Field>
        <Field label="Entry notes" hint="Buzzer, floor, or where to wait. Optional." error={fields.entryNotes}>
          <textarea
            className={`${fieldClass} min-h-24 resize-y`}
            aria-invalid={Boolean(fields.entryNotes)}
            value={draft.entryNotes}
            maxLength={LIMITS.entryNotesMax}
            onChange={(event) => patch({ entryNotes: event.target.value })}
          />
        </Field>
      </section>

      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-muted">Drafts are saved in this browser tab for up to 7 days, including the private address and entry notes. They are not published until saved and are cleared after saving, signing out, or closing the tab.</p>
        <ClientDraftStatus status={draftStatus} onDiscard={() => discardDraft()} />
        {formError ? <FormError>{formError}</FormError> : null}
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function WeekSkips({
  day,
  time,
  skippedDates,
  onToggle,
}: {
  day: DayOfWeek;
  time: string;
  skippedDates: string[];
  onToggle: (date: string) => void;
}) {
  const sessions = upcomingSessions(day, time);
  const next = sessions.find((date) => !skippedDates.includes(date));
  return (
    <section>
      <h2 className="font-serif text-xl">Upcoming {dayName(day)}s</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {next
          ? `Turn a week off to cancel it. The study then shows ${formatDdMmYyyy(next)}.`
          : 'The upcoming sessions are canceled. Turn one back on to choose a date.'}
      </p>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {sessions.map((date) => {
          const canceled = skippedDates.includes(date);
          return (
            <li key={date}>
              <button
                type="button"
                aria-pressed={!canceled}
                onClick={() => onToggle(date)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
              >
                <span className={canceled ? 'text-sm text-muted line-through' : 'text-sm font-medium'}>
                  {formatDdMmYyyy(date)}
                </span>
                <span className={`shrink-0 text-sm ${canceled ? 'text-clay' : 'text-canal'}`}>
                  {canceled ? 'Canceled' : 'Ongoing'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FormatChoice({
  label,
  detail,
  pressed,
  onClick,
}: {
  label: string;
  detail: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-md border px-3 py-3 text-left ${
        pressed ? 'border-canal bg-canal/5' : 'border-line bg-card hover:bg-sand'
      }`}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="mt-0.5 block text-xs text-muted">{detail}</span>
    </button>
  );
}

export function draftFromStudy(
  study: {
    title: string;
    description: string;
    tags: StudyTag[];
    format: StudyFormat;
    dayOfWeek: DayOfWeek | null;
    date: string | null;
    time: string;
    maxCapacity: number;
    area: string;
    isPublic: boolean;
    showMemberContacts: boolean;
    skippedDates: string[];
  },
  details: { exactAddress: string; entryNotes: string } | null,
): StudyDraft {
  return {
    title: study.title,
    description: study.description,
    tags: study.tags,
    format: study.format,
    dayOfWeek: study.dayOfWeek,
    date: study.date,
    time: study.time,
    maxCapacity: study.maxCapacity,
    area: study.area,
    isPublic: study.isPublic,
    showMemberContacts: study.showMemberContacts,
    skippedDates: study.skippedDates,
    exactAddress: details?.exactAddress ?? '',
    entryNotes: details?.entryNotes ?? '',
  };
}
