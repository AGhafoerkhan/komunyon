'use client';

import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui';
import { normalizePhone } from '@/lib/validate';
import type { JoinRequest } from '@/types';

export function MemberList({
  title,
  description,
  empty,
  requests,
  renderActions,
  onPhoto,
  showPhone = true,
}: {
  title: string;
  description?: string;
  empty: string;
  requests: JoinRequest[];
  renderActions?: (request: JoinRequest) => ReactNode;
  onPhoto?: (src: string, name: string) => void;
  showPhone?: boolean;
}) {
  return (
    <section className="rounded-lg border border-line bg-card">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-serif text-xl break-words">
          {title}
          <span className="ml-2 font-sans text-base font-normal text-muted tabular-nums">{requests.length}</span>
        </h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {requests.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <ul>
          {requests.map((request) => (
            <li
              key={request.userId}
              className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:flex-row sm:items-start"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                <Avatar
                  src={request.photoURL}
                  name={request.fullName}
                  size={44}
                  onOpen={onPhoto ? () => onPhoto(request.photoURL, request.fullName) : undefined}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">
                    {request.fullName}
                    {request.profileMissing ? null : <span className="font-normal text-muted"> · {request.age}</span>}
                  </p>
                  {request.place ? <p className="mt-0.5 text-xs text-muted">{request.place}</p> : null}
                  {showPhone && request.phone ? <PhoneLink phone={request.phone} /> : null}
                  {request.profileMissing || request.bio.length === 0 ? null : (
                    <p className="mt-1 line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap text-muted">
                      {request.bio}
                    </p>
                  )}
                </div>
              </div>
              {renderActions ? (
                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
                  {renderActions(request)}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PhoneLink({ phone }: { phone: string }) {
  const dial = normalizePhone(phone);
  if (!dial) return <p className="mt-0.5 text-xs text-muted">{phone}</p>;
  return (
    <a href={`tel:${dial}`} className="mt-0.5 inline-block text-xs font-medium text-ink hover:text-canal">
      {phone}
    </a>
  );
}
