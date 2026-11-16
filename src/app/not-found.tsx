import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 sm:px-6">
      <p className="font-serif text-3xl leading-tight break-words">This page is not here.</p>
      <Link href="/dashboard" className="mt-4 text-sm text-canal">
        Back to studies
      </Link>
    </div>
  );
}
