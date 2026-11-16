'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Avatar, Button, Field, Spinner, fieldClass } from '@/components/ui';
import { actionError } from '@/lib/errors';
import { LIMITS } from '@/lib/limits';
import { validateProfile } from '@/lib/validate';

export function ProfileForm({
  mode,
  initial,
}: {
  mode: 'onboarding' | 'edit';
  initial: { fullName: string; age: number; photoURL: string; bio: string };
}) {
  const { saveProfile, user } = useAuth();
  const accountPhoto = initial.photoURL || user?.photoURL || '';
  const [fullName, setFullName] = useState(initial.fullName);
  const [age, setAge] = useState(initial.age > 0 ? String(initial.age) : '');
  const [bio, setBio] = useState(initial.bio);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState(accountPhoto);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = validateProfile({
      fullName,
      age,
      bio,
    });
    if (message) {
      setError(message);
      setSaved(false);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveProfile({ fullName: fullName.trim(), age: Number(age), bio: bio.trim() }, photo);
      setSaved(true);
    } catch (failure) {
      setError(actionError(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mt-6 flex flex-col gap-5" noValidate>
      {error ? <Alert>{error}</Alert> : null}
      {saved && mode === 'edit' ? (
        <p className="rounded-md border border-moss/30 bg-moss/5 px-3 py-2 text-sm text-moss">Profile saved.</p>
      ) : null}
      {saved && mode === 'onboarding' ? (
        <p className="rounded-md border border-moss/30 bg-moss/5 px-3 py-2 text-sm text-moss">
          Profile saved. Opening studies…
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <Avatar src={preview} name={fullName || 'Profile'} size={72} />
        <div className="text-sm leading-relaxed text-muted">
          <p>
            {accountPhoto
              ? 'Your Google photo is used until you choose a different picture.'
              : 'Choose a picture, or your initials are shown.'}
          </p>
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

      <Field label="Full name">
        <input
          className={fieldClass}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          maxLength={LIMITS.nameMax}
          required
        />
      </Field>

      <Field label="Age">
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

      <Field
        label="Pre-requisites / Bio"
        hint="Church background, languages, or anything a host should know before approving you."
      >
        <textarea
          className={`${fieldClass} min-h-32 resize-y`}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={LIMITS.bioMax}
          required
        />
      </Field>

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner /> : null}
          {mode === 'onboarding' ? 'Continue' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}
