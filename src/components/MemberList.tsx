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
  coHostIds = [],
  hostId,
  rowId,
}: {
  title: string;
  description?: string;
  empty: string;
  requests: JoinRequest[];
  renderActions?: (request: JoinRequest) => ReactNode;
  onPhoto?: (src: string, name: string) => void;
  showPhone?: boolean;
  coHostIds?: string[];
  hostId?: string;
  rowId?: (request: JoinRequest) => string;
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
              id={rowId?.(request)}
              className="flex scroll-mt-24 flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:flex-row sm:items-start"
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
                    {hostId === request.userId ? <span className="font-normal text-canal"> · Host</span> : null}
                    {hostId !== request.userId && coHostIds.includes(request.userId) ? <span className="font-normal text-canal"> · Co-host</span> : null}
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
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
      <a href={`tel:${dial}`} className="text-ink underline decoration-1 underline-offset-2 hover:text-canal">
        Call {phone}
      </a>
      <a href={`https://wa.me/${dial.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-ink underline decoration-1 underline-offset-2 hover:text-canal">
        WhatsApp
      </a>
    </span>
  );
}
