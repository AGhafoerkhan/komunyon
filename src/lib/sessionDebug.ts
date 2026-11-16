const SECRET_KEY = /token|apikey|api_key|authorization|password|secret|cookie|credential/i;

export function sanitizeDebug(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[max depth]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)) return '[redacted jwt]';
    return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeDebug(item, depth + 1));
  if (value instanceof Error) return describeDebugError(value);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : sanitizeDebug(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function describeDebugError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { thrown: sanitizeDebug(error) };
  const record = error as Error & Record<string, unknown>;
  const fields: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };
  if (typeof record.code === 'string') fields.code = record.code;
  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === 'name' || key === 'message' || key === 'stack' || SECRET_KEY.test(key)) continue;
    fields[key] = sanitizeDebug(record[key]);
  }
  fields.stack = error.stack?.split('\n').slice(0, 12).join('\n') ?? '';
  return fields;
}

export function debugLine(title: string, detail?: unknown): string {
  const stamp = new Date().toISOString();
  if (detail === undefined) return `${stamp}  ${title}`;
  return `${stamp}  ${title}\n${JSON.stringify(sanitizeDebug(detail), null, 2)}`;
}
