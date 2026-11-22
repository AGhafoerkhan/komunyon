/** Capitalize the first character of each name part without changing the rest. */
export function formatPersonName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').split(' ').map((part) => {
    if (!part) return part;
    return part.charAt(0).toLocaleUpperCase() + part.slice(1);
  }).join(' ');
}
