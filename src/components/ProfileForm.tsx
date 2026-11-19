'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Avatar, Button, Field, FormError, Spinner, fieldClass } from '@/components/ui';
import { HAGUE_AREAS } from '@/lib/hague';
import { actionError } from '@/lib/errors';
import { LIMITS } from '@/lib/limits';
import { COUNTRIES, citiesIn } from '@/lib/places';
import { CHECK_AGAIN, validateProfile, type ProfileField } from '@/lib/validate';
import { PhotoLightbox } from '@/components/PhotoLightbox';

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
  };
  activity?: {
    hosted: number;
    joined: number;
    circles: number;
  };
}) {
  const { saveProfile, user } = useAuth();
  const accountPhoto = initial.photoURL || user?.photoURL || '';
  const profileActivity = activity ?? { hosted: 0, joined: 0, circles: 0 };
  const startingCountry = initial.country || 'Netherlands';
  const startingCities = citiesIn(startingCountry);
  const startingCity = initial.city || (startingCountry === 'Netherlands' ? 'The Hague' : '');
  const [fullName, setFullName] = useState(initial.fullName);
  const [age, setAge] = useState(initial.age > 0 ? String(initial.age) : '');
  const [bio, setBio] = useState(initial.bio);
  const [country, setCountry] = useState(startingCountry);
  const [city, setCity] = useState(startingCity);
  const [otherCity, setOtherCity] = useState(Boolean(startingCities && startingCity && !startingCities.includes(startingCity)));
  const [neighbourhood, setNeighbourhood] = useState(initial.neighbourhood);
  const [phone, setPhone] = useState(initial.phone);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState(accountPhoto);
  const [fields, setFields] = useState<Partial<Record<ProfileField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const listedCities = citiesIn(country);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function chooseCountry(next: string) {
    setCountry(next);
    setCity(next === 'Netherlands' ? 'The Hague' : '');
    setOtherCity(false);
    setNeighbourhood('');
  }

  function chooseCity(next: string) {
    if (next === '__other__') {
      setOtherCity(true);
      setCity('');
      setNeighbourhood('');
      return;
    }
    setOtherCity(false);
    setCity(next);
    setNeighbourhood('');
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateProfile({
      fullName,
      age,
      bio,
      country,
      city,
      neighbourhood,
      phone,
      hasPhoto: preview.length > 0,
    });
    if (Object.keys(found).length > 0) {
      setFields(found);
      setFormError(CHECK_AGAIN);
      setSaved(false);
      return;
    }
    setSaving(true);
    setFields({});
    setFormError(null);
    setSaved(false);
    try {
      await saveProfile(
        {
          fullName: fullName.trim(),
          age: Number(age),
          bio: bio.trim(),
          country,
          city: city.trim(),
          neighbourhood: neighbourhood.trim(),
          phone,
        },
        photo,
      );
      setSaved(true);
    } catch (failure) {
      setFormError(actionError(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mt-6 flex flex-col gap-5" noValidate>
      {saved && mode === 'edit' ? (
        <p className="rounded-md border border-moss/30 bg-moss/5 px-3 py-2 text-sm text-moss">Profile saved.</p>
      ) : null}
      {saved && mode === 'onboarding' ? (
        <p className="rounded-md border border-moss/30 bg-moss/5 px-3 py-2 text-sm text-moss">
          Profile saved. Opening studies…
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Avatar src={preview} name={fullName || 'Profile'} size={72} onOpen={() => setPhotoOpen(true)} />
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted">
          <p className="font-medium text-ink">{fullName || 'Your profile'}{age ? ` · ${age}` : ''}</p>
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
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>
      {photoOpen ? <PhotoLightbox src={preview} name={fullName || 'Profile'} onClose={() => setPhotoOpen(false)} /> : null}

      <Field
        label="Full name"
        hint={mode === 'onboarding' ? 'Please use your real name. That is how a host finds you for an invite.' : undefined}
        error={fields.fullName}
      >
        <input
          className={fieldClass}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          maxLength={LIMITS.nameMax}
          required
        />
      </Field>

      <Field label="Age" error={fields.age}>
        <input
          className={fieldClass}
          inputMode="numeric"
          value={age}
          onChange={(event) => setAge(event.target.value)}
          min={LIMITS.ageMin}
          max={LIMITS.ageMax}
          required
        />
      </Field>

      <Field label="Country" error={fields.country}>
        <select className={fieldClass} value={country} onChange={(event) => chooseCountry(event.target.value)} required>
          {COUNTRIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </Field>

      <Field label="City" error={otherCity ? undefined : fields.city}>
        {listedCities ? (
          <select
            className={fieldClass}
            value={otherCity ? '__other__' : city}
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
            value={city}
            onChange={(event) => setCity(event.target.value)}
            autoComplete="address-level2"
            maxLength={80}
            required
          />
        )}
      </Field>

      {listedCities && otherCity ? (
        <Field label="Your city" error={fields.city}>
          <input
            className={fieldClass}
            value={city}
            onChange={(event) => setCity(event.target.value)}
            autoComplete="address-level2"
            maxLength={80}
            required
          />
        </Field>
      ) : null}

      {city === 'The Hague' ? (
        <Field label="Neighbourhood" error={fields.neighbourhood}>
          <select
            className={fieldClass}
            value={neighbourhood}
            onChange={(event) => setNeighbourhood(event.target.value)}
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
            value={neighbourhood}
            onChange={(event) => setNeighbourhood(event.target.value)}
            autoComplete="address-level3"
            maxLength={80}
          />
        </Field>
      )}

      <Field label="Bio" hint="Optional. Church background, languages, or anything a host should know." error={fields.bio}>
        <textarea
          className={`${fieldClass} min-h-32 resize-y`}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={LIMITS.bioMax}
          placeholder="I speak Dutch/English."
        />
      </Field>

      <Field label="Phone number" hint="Include the country code, for example +31 6 1234 5678." error={fields.phone}>
        <input
          className={fieldClass}
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
          maxLength={20}
          required
        />
      </Field>

      <div className="flex flex-col gap-3">
        {formError ? <FormError>{formError}</FormError> : null}
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner /> : null}
          {mode === 'onboarding' ? 'Continue' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}
