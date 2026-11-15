'use client';

import { useRef, useState } from 'react';
import { Alert, Button, Field, Spinner, fieldClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { HAGUE_AREAS } from '@/lib/hague';
import { isDayOfWeek } from '@/lib/guards';
import { DAY_FILTERS, dayName } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import { validateStudyDraft } from '@/lib/validate';
import type { DayOfWeek, StudyDraft, StudyFormat } from '@/types';

const EMPTY: StudyDraft = {
  title: '',
  description: '',
  format: 'recurring',
  dayOfWeek: null,
  date: null,
  time: '19:00',
  maxCapacity: 8,
  area: '',
  exactAddress: '',
  entryNotes: '',
};

export function StudyForm({
  initial,
  minCapacity = 1,
  submitLabel,
  onSubmit,
}: {
  initial?: StudyDraft;
  minCapacity?: number;
  submitLabel: string;
  onSubmit: (draft: StudyDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<StudyDraft>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  function patch(partial: Partial<StudyDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = validateStudyDraft(draft, minCapacity);
    if (message) {
      setError(message);
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: 'center' }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (failure) {
      setError(actionError(failure));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 flex flex-col gap-8 pb-16" noValidate>
      {error ? (
        <div ref={errorRef}>
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-serif text-xl">The gathering</h2>
          <p className="mt-1 text-sm text-muted">Visible to anyone signed in. Use a neighbourhood, never a street.</p>
        </div>

        <Field label="Title">
          <input
            className={fieldClass}
            value={draft.title}
            maxLength={LIMITS.titleMax}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder="Thursday evening communion"
            required
          />
        </Field>

        <Field label="Description">
          <textarea
            className={`${fieldClass} min-h-28 resize-y`}
            value={draft.description}
            maxLength={LIMITS.descriptionMax}
            onChange={(event) => patch({ description: event.target.value })}
            placeholder="What you read, who it is for, and whether you share a meal."
            required
          />
        </Field>

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
            <Field label="Day of week">
              <select
                className={fieldClass}
                value={draft.dayOfWeek === null ? '' : String(draft.dayOfWeek)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  patch({ dayOfWeek: isDayOfWeek(value) ? value : null });
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
            <Field label="Date">
              <input
                className={fieldClass}
                type="date"
                value={draft.date ?? ''}
                onChange={(event) => patch({ date: event.target.value || null })}
                required
              />
            </Field>
          )}
          <Field label="Time">
            <input
              className={fieldClass}
              type="time"
              value={draft.time}
              onChange={(event) => patch({ time: event.target.value })}
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Neighbourhood" hint="Shown on the study card.">
            <select
              className={fieldClass}
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
            hint={minCapacity > 1 ? `At least ${minCapacity} — people you have already approved.` : 'Including guests, not yourself.'}
          >
            <input
              className={fieldClass}
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

      <section className="flex flex-col gap-4 rounded-lg border border-line bg-sand/50 p-4">
        <div>
          <h2 className="font-serif text-xl">At the door</h2>
          <p className="mt-1 text-sm text-muted">
            Saved separately and shown only to you and people you approve. It is not on the public study.
          </p>
        </div>
        <Field label="Exact address">
          <input
            className={fieldClass}
            value={draft.exactAddress}
            maxLength={LIMITS.addressMax}
            autoComplete="street-address"
            onChange={(event) => patch({ exactAddress: event.target.value })}
            placeholder="Street and number"
            required
          />
        </Field>
        <Field label="Entry notes" hint="Buzzer, floor, or where to wait. Optional.">
          <textarea
            className={`${fieldClass} min-h-24 resize-y`}
            value={draft.entryNotes}
            maxLength={LIMITS.entryNotesMax}
            onChange={(event) => patch({ entryNotes: event.target.value })}
          />
        </Field>
      </section>

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
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
    format: StudyFormat;
    dayOfWeek: DayOfWeek | null;
    date: string | null;
    time: string;
    maxCapacity: number;
    area: string;
  },
  details: { exactAddress: string; entryNotes: string } | null,
): StudyDraft {
  return {
    title: study.title,
    description: study.description,
    format: study.format,
    dayOfWeek: study.dayOfWeek,
    date: study.date,
    time: study.time,
    maxCapacity: study.maxCapacity,
    area: study.area,
    exactAddress: details?.exactAddress ?? '',
    entryNotes: details?.entryNotes ?? '',
  };
}
