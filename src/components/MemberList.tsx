'use client';

import type { ReactNode } from 'react';
import { Avatar } from '@/components/ui';
import type { JoinRequest } from '@/types';

export function MemberList({
  title,
  description,
  empty,
  requests,
  renderActions,
}: {
  title: string;
  description?: string;
  empty: string;
  requests: JoinRequest[];
  renderActions: (request: JoinRequest) => ReactNode;
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
                <Avatar src={request.photoURL} name={request.fullName} size={44} />
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">
                    {request.fullName}
                    {request.profileMissing ? null : <span className="font-normal text-muted"> · {request.age}</span>}
                  </p>
                  {request.profileMissing || request.bio.length === 0 ? null : (
                    <p className="mt-1 line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap text-muted">
                      {request.bio}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
                {renderActions(request)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
