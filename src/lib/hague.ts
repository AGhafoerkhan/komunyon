export const HAGUE_AREAS = [
  'Centrum',
  'Scheveningen',
  'Statenkwartier',
  'Duinoord',
  'Zeeheldenkwartier',
  'Archipelbuurt',
  'Bezuidenhout',
  'Mariahoeve',
  'Haagse Hout',
  'Segbroek',
  'Regentessekwartier',
  'Transvaalkwartier',
  'Schildersbuurt',
  'Laak',
  'Binckhorst',
  'Escamp',
  'Moerwijk',
  'Loosduinen',
  'Ypenburg',
  'Leidschenveen',
] as const;

export type HagueArea = (typeof HAGUE_AREAS)[number];

export function isHagueArea(value: string): value is HagueArea {
  return (HAGUE_AREAS as readonly string[]).includes(value);
}
