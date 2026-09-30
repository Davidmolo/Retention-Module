/** Client-safe types + helpers (no DB / Node imports). */

export type CompanyUpdate = {
  id: number;
  title: string;
  summary: string;
  tag: string | null;
  /** ISO date YYYY-MM-DD */
  publishedOn: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export function formatUpdateDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
