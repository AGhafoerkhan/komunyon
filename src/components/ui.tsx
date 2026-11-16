'use client';

import { type ButtonHTMLAttributes, type ReactNode, useState } from 'react';
import { tagLabel, type StudyTag } from '@/lib/tags';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm';

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-canal text-white hover:bg-canal-dark',
    secondary: 'border border-line bg-card text-ink hover:bg-sand',
    ghost: 'text-muted hover:bg-sand hover:text-ink',
    danger: 'border border-danger/30 bg-card text-danger hover:bg-danger/5',
  };
  const sizes: Record<ButtonSize, string> = {
    md: 'h-10 px-3.5 text-sm',
    sm: 'h-8 px-2.5 text-sm',
  };
  return `inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}

export const fieldClass =
  'w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-canal';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-relaxed text-muted">{hint}</span> : null}
    </label>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
      {children}
    </p>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden
    />
  );
}

export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-muted">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

function displayPhoto(src: string): string {
  if (src.startsWith('https://') || src.startsWith('blob:')) return src;
  if (src.startsWith('data:image/jpeg;base64,')) return src;
  return '';
}

export function Avatar({ src, name, size = 40 }: { src: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const photo = displayPhoto(src);
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?';

  if (!photo || failed) {
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-sand text-xs font-medium text-ink"
      >
        {initials}
      </span>
    );
  }

  return (
    // Firebase download URLs are tokenized and are not a fixed remote pattern.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-sand object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function TagList({ tags }: { tags: StudyTag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <li key={tag} className="rounded-md bg-sand px-1.5 py-0.5 text-xs text-ink">
          {tagLabel(tag)}
        </li>
      ))}
    </ul>
  );
}

export function FormatBadge({ format }: { format: 'recurring' | 'one-off' }) {
  const recurring = format === 'recurring';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
        recurring ? 'bg-canal/10 text-canal' : 'bg-clay/10 text-clay'
      }`}
    >
      {recurring ? 'Recurring' : 'One-off'}
    </span>
  );
}
