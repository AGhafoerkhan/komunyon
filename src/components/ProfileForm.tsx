'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, Button, Field, FormError, Spinner, fieldClass } from '@/components/ui';
import { HAGUE_AREAS } from '@/lib/hague';
import { actionError } from '@/lib/errors';
import { LIMITS } from '@/lib/limits';
import { COUNTRIES, citiesIn } from '@/lib/places';
import { CHECK_AGAIN, validateProfile, type ProfileField } from '@/lib/validate';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { jumpToFirstInvalidField } from '@/lib/forms';
import { useSuccessToast } from '@/components/SuccessToast';
import { formatPersonName } from '@/lib/names';
import { ClientDraftStatus, useClientDraft } from '@/components/useClientDraft';
import { clientDraftKey } from '@/lib/clientDrafts';

type ProfileDraft = {
  fullName: string;
  age: string;
  bio: string;
  country: string;
  city: string;
  otherCity: boolean;
  neighbourhood: string;
  phone: string;
};

export function ProfileForm({
  mode,
  initial,
  activity,
}: {
  mode: 'onboarding' | 'edit';
  initial: {
    fullName: string;
    age: number;
    photoURL: string;
    bio: string;
    country: string;
    city: string;
    neighbourhood: string;
    phone: string;
    updatedAt?: string;
  };
  activity?: {
    hosted: number;
    joined: number;
    circles: number;
  };
}) {
  const { saveProfile, user } = useAuth();
  const { showSuccess } = useSuccessToast();
  const accountPhoto = initial.photoURL || user?.photoURL || '';
  const profileActivity = activity ?? { hosted: 0, joined: 0, circles: 0 };
  const initialDraft = useMemo<ProfileDraft>(() => {
    const country = initial.country || 'Netherlands';
    const startingCities = citiesIn(country);
    const city = initial.city || (country === 'Netherlands' ? 'The Hague' : '');
    return {
      fullName: initial.fullName,
      age: initial.age > 0 ? String(initial.age) : '',
      bio: initial.bio,
      country,
      city,
      otherCity: Boolean(startingCities && city && !startingCities.includes(city)),
      neighbourhood: initial.neighbourhood,
      phone: initial.phone,
    };
  }, [initial.age, initial.bio, initial.city, initial.country, initial.fullName, initial.neighbourhood, initial.phone]);
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState(accountPhoto);
  const [fields, setFields] = useState<Partial<Record<ProfileField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const listedCities = citiesIn(draft.country);
  const draftStorageKey = user ? clientDraftKey(user.uid, `profile-${mode}`) : 'komunyon:form-draft:profile:anonymous';
  const { status: draftStatus, markSaved: markDraftSaved, discardDraft } = useClientDraft({
    storageKey: draftStorageKey,
    initialValue: initialDraft,
    value: draft,
    setValue: setDraft,
    sourceVersion: mode === 'edit' ? initial.updatedAt ?? null : null,
  });

  function patchDraft(partial: Partial<ProfileDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  useEffect(() => {
    if (Object.keys(fields).length === 0) return;
    const frame = window.requestAnimationFrame(() => jumpToFirstInvalidField(formRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, [fields]);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function chooseCountry(next: string) {
    patchDraft({ country: next, city: next === 'Netherlands' ? 'The Hague' : '', otherCity: false, neighbourhood: '' });
  }

  function chooseCity(next: string) {
    if (next === '__other__') {
      patchDraft({ otherCity: true, city: '', neighbourhood: '' });
      return;
    }
    patchDraft({ otherCity: false, city: next, neighbourhood: '' });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateProfile({
      ...draft,
      hasPhoto: preview.length > 0,
    });
    if (Object.keys(found).length > 0) {
      setFields(found);
      setFormError(CHECK_AGAIN);
      return;
    }
    setSaving(true);
    setFields({});
    setFormError(null);
    const savedDraft: ProfileDraft = {
      ...draft,
      fullName: formatPersonName(draft.fullName),
      age: String(Number(draft.age)),
      bio: draft.bio.trim(),
      city: draft.city.trim(),
      neighbourhood: draft.neighbourhood.trim(),
    };
    try {
      await saveProfile(
        {
          fullName: savedDraft.fullName,
          age: Number(savedDraft.age),
          bio: savedDraft.bio,
          country: savedDraft.country,
          city: savedDraft.city,
          neighbourhood: savedDraft.neighbourhood,
          phone: savedDraft.phone,
        },
        photo,
      );
      setDraft(savedDraft);
      markDraftSaved(savedDraft);
      showSuccess(mode === 'onboarding' ? 'Profile created.' : 'Profile saved.');
    } catch (failure) {
      setFormError(actionError(failure, {
        action: mode === 'edit' ? 'save profile changes' : 'complete profile setup',
        operation: 'write private contact data and public user profile; sync hosted study card',
        target: `users/${user?.uid ?? 'unknown'} and studies where hostId=${user?.uid ?? 'unknown'}`,
      }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={(event) => void onSubmit(event)} className="mt-6 flex flex-col gap-5" noValidate>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar src={preview} name={draft.fullName || 'Profile'} size={72} onOpen={() => setPhotoOpen(true)} />
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted">
          <p className="font-medium text-ink">{draft.fullName || 'Your profile'}{draft.age ? ` · ${draft.age}` : ''}</p>
          <p className="mt-1 text-xs" aria-label="Profile activity">
            {profileActivity.hosted} Hosted <span aria-hidden="true">·</span>{' '}
            {profileActivity.joined} Joined <span aria-hidden="true">·</span>{' '}
            {profileActivity.circles} Circles
          </p>
          <p>{preview ? 'A picture is required. This one is used until you choose another.' : 'A picture is required.'}</p>
          {fields.photo ? <p className="mt-1.5 text-sm text-clay">{fields.photo}</p> : null}
          <label className="mt-2 inline-block cursor-pointer font-medium text-canal">
            Choose a picture
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Profile picture"
              aria-invalid={Boolean(fields.photo)}
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
          </label>
          <p className="mt-1 text-xs text-muted">Selected picture files are not kept in the draft; choose the picture again if you return after reloading.</p>
        </div>
      </div>
      {photoOpen ? <PhotoLightbox src={preview} name={draft.fullName || 'Profile'} onClose={() => setPhotoOpen(false)} /> : null}

      <Field
        label="Full name"
        hint={mode === 'onboarding' ? 'Please use your real name. That is how a host finds you for an invite.' : undefined}
        error={fields.fullName}
      >
        <input
          className={fieldClass}
          aria-invalid={Boolean(fields.fullName)}
          value={draft.fullName}
          onChange={(event) => patchDraft({ fullName: event.target.value })}
          autoComplete="name"
          maxLength={LIMITS.nameMax}
          required
        />
      </Field>

      <Field label="Age" error={fields.age}>
        <input
          className={fieldClass}
          aria-invalid={Boolean(fields.age)}
          inputMode="numeric"
          value={draft.age}
          onChange={(event) => patchDraft({ age: event.target.value })}
          min={LIMITS.ageMin}
          max={LIMITS.ageMax}
          required
        />
      </Field>

      <Field label="Country" error={fields.country}>
        <select className={fieldClass} value={draft.country} aria-invalid={Boolean(fields.country)} onChange={(event) => chooseCountry(event.target.value)} required>
          {COUNTRIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </Field>

        <Field label="City" error={draft.otherCity ? undefined : fields.city}>
        {listedCities ? (
          <select
            className={fieldClass}
            aria-invalid={Boolean(!draft.otherCity && fields.city)}
            value={draft.otherCity ? '__other__' : draft.city}
            onChange={(event) => chooseCity(event.target.value)}
            required
          >
            {listedCities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            <option value="__other__">Another city</option>
          </select>
        ) : (
          <input
            className={fieldClass}
            aria-invalid={Boolean(fields.city)}
            value={draft.city}
            onChange={(event) => patchDraft({ city: event.target.value })}
            autoComplete="address-level2"
            maxLength={80}
            required
          />
        )}
      </Field>

      {listedCities && draft.otherCity ? (
        <Field label="Your city" error={fields.city}>
          <input
            className={fieldClass}
            aria-invalid={Boolean(fields.city)}
            value={draft.city}
            onChange={(event) => patchDraft({ city: event.target.value })}
            autoComplete="address-level2"
            maxLength={80}
            required
          />
        </Field>
      ) : null}

      {draft.city === 'The Hague' ? (
        <Field label="Neighbourhood" error={fields.neighbourhood}>
          <select
            className={fieldClass}
            aria-invalid={Boolean(fields.neighbourhood)}
            value={draft.neighbourhood}
            onChange={(event) => patchDraft({ neighbourhood: event.target.value })}
            required
          >
            <option value="">Choose a neighbourhood</option>
            {HAGUE_AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Neighbourhood" hint="Add it if you know it." error={fields.neighbourhood}>
          <input
            className={fieldClass}
            aria-invalid={Boolean(fields.neighbourhood)}
            value={draft.neighbourhood}
            onChange={(event) => patchDraft({ neighbourhood: event.target.value })}
            autoComplete="address-level3"
            maxLength={80}
          />
        </Field>
      )}

      <Field label="Bio" hint="Optional. Church background, languages, or anything a host should know." error={fields.bio}>
        <textarea
          className={`${fieldClass} min-h-32 resize-y`}
          aria-invalid={Boolean(fields.bio)}
          value={draft.bio}
          onChange={(event) => patchDraft({ bio: event.target.value })}
          maxLength={LIMITS.bioMax}
          placeholder="I speak Dutch/English."
        />
      </Field>

      <Field label="Phone number" hint="Include the country code, for example +31 6 1234 5678." error={fields.phone}>
        <input
          className={fieldClass}
          aria-invalid={Boolean(fields.phone)}
          type="tel"
          inputMode="tel"
          value={draft.phone}
          onChange={(event) => patchDraft({ phone: event.target.value })}
          autoComplete="tel"
          maxLength={20}
          required
        />
      </Field>

      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-muted">Drafts are saved in this browser tab for up to 7 days, including your phone number. They are not published until saved and are cleared after saving, signing out, or closing the tab.</p>
        <ClientDraftStatus status={draftStatus} onDiscard={() => {
          discardDraft();
          setPhoto(null);
          setPreview(accountPhoto);
        }} />
        {formError ? <FormError>{formError}</FormError> : null}
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner /> : null}
          {mode === 'onboarding' ? 'Continue' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}
