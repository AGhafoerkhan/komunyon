export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';
  return Response.json(
    { version },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  );
}
