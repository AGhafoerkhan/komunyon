export const COUNTRIES = [
  'Netherlands',
  'Belgium',
  'Germany',
  'France',
  'United Kingdom',
  'Suriname',
  'Turkey',
  'Morocco',
  'Poland',
  'Spain',
  'Italy',
  'Portugal',
  'Romania',
  'Bulgaria',
  'Greece',
  'Hungary',
  'Ukraine',
  'United States',
  'Canada',
  'Brazil',
  'Indonesia',
  'China',
  'India',
  'Syria',
  'Eritrea',
  'Somalia',
  'Afghanistan',
] as const;

export const NETHERLANDS_CITIES = [
  'The Hague',
  'Amsterdam',
  'Rotterdam',
  'Utrecht',
  'Eindhoven',
  'Groningen',
  'Tilburg',
  'Almere',
  'Breda',
  'Nijmegen',
  'Haarlem',
  'Arnhem',
  'Amersfoort',
  'Zoetermeer',
  'Zwolle',
  'Leiden',
  'Maastricht',
  'Dordrecht',
  'Delft',
  'Leeuwarden',
] as const;

export function isCountry(value: string): boolean {
  return (COUNTRIES as readonly string[]).includes(value);
}

export function citiesIn(country: string): readonly string[] | null {
  if (country === 'Netherlands') return NETHERLANDS_CITIES;
  return null;
}

export function placeLine(parts: { neighbourhood: string; city: string; country: string }): string {
  return [parts.neighbourhood, parts.city, parts.country].map((part) => part.trim()).filter(Boolean).join(', ');
}
