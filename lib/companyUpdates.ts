/**
 * Static Company Updates for the landing Dashboard.
 * Replace / extend later when admins can publish updates from Settings.
 */
export type CompanyUpdate = {
  id: string;
  title: string;
  date: string; // ISO date YYYY-MM-DD
  summary: string;
  tag?: string;
};

export const COMPANY_UPDATES: CompanyUpdate[] = [
  {
    id: 'retention-live',
    title: 'Retention module is live',
    date: '2026-09-26',
    tag: 'Retention',
    summary:
      'Driver surveys, at-risk follow-ups, Configure message templates, and SMS reminders are available under Retention.',
  },
  {
    id: 'roles-modules',
    title: 'Roles and module access',
    date: '2026-09-30',
    tag: 'Admin',
    summary:
      'Users only see modules they are granted. Super Admins can manage admin access; everyone can update their password in Settings.',
  },
  {
    id: 'dashboard-landing',
    title: 'New Dashboard landing page',
    date: '2026-09-30',
    tag: 'Platform',
    summary:
      'Dashboard is now a company landing page with greetings and updates. Gross Profit numbers stay under Gross Profit / Summary.',
  },
];

export function formatUpdateDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
