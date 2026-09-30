import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getPool } from '@/lib/db';

export type CompanyUpdate = {
  id: number;
  title: string;
  summary: string;
  tag: string | null;
  /** ISO date YYYY-MM-DD */
  publishedOn: string;
  createdAt: string | null;
  updatedAt: string | null;
};

interface UpdateRow extends RowDataPacket {
  id: number;
  title: string;
  summary: string;
  tag: string | null;
  published_on: Date | string;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

const SEED_UPDATES: Omit<CompanyUpdate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    title: 'Retention module is live',
    publishedOn: '2026-09-26',
    tag: 'Retention',
    summary:
      'Driver surveys, at-risk follow-ups, Configure message templates, and SMS reminders are available under Retention.',
  },
  {
    title: 'Roles and module access',
    publishedOn: '2026-09-30',
    tag: 'Admin',
    summary:
      'Users only see modules they are granted. Super Admins can manage admin access; everyone can update their password in Settings.',
  },
  {
    title: 'New Dashboard landing page',
    publishedOn: '2026-09-30',
    tag: 'Platform',
    summary:
      'Dashboard is now a company landing page with greetings and updates. Gross Profit numbers stay under Gross Profit / Summary.',
  },
];

function toDateOnly(v: Date | string): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  return s.slice(0, 10);
}

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function mapRow(row: UpdateRow): CompanyUpdate {
  return {
    id: row.id,
    title: String(row.title || ''),
    summary: String(row.summary || ''),
    tag: row.tag ? String(row.tag) : null,
    publishedOn: toDateOnly(row.published_on),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function formatUpdateDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

async function seedIfEmpty(): Promise<void> {
  const pool = getPool();
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM company_updates`
  );
  if (Number(countRows[0]?.c || 0) > 0) return;

  for (const u of SEED_UPDATES) {
    await pool.query(
      `INSERT INTO company_updates (title, summary, tag, published_on)
       VALUES (?, ?, ?, ?)`,
      [u.title, u.summary, u.tag, u.publishedOn]
    );
  }
}

export async function listCompanyUpdates(): Promise<CompanyUpdate[]> {
  await seedIfEmpty();
  const [rows] = await getPool().query<UpdateRow[]>(
    `SELECT id, title, summary, tag, published_on, created_at, updated_at
     FROM company_updates
     ORDER BY published_on DESC, id DESC`
  );
  return rows.map(mapRow);
}

export async function createCompanyUpdate(opts: {
  title: string;
  summary: string;
  tag?: string | null;
  publishedOn: string;
  createdBy?: number | null;
}): Promise<CompanyUpdate> {
  const title = String(opts.title || '').trim();
  const summary = String(opts.summary || '').trim();
  const tag = String(opts.tag || '').trim() || null;
  const publishedOn = String(opts.publishedOn || '').trim().slice(0, 10);
  if (!title) throw new Error('Title is required');
  if (!summary) throw new Error('Summary is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedOn)) {
    throw new Error('Published date must be YYYY-MM-DD');
  }

  const [result] = await getPool().query<ResultSetHeader>(
    `INSERT INTO company_updates (title, summary, tag, published_on, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [title, summary, tag, publishedOn, opts.createdBy ?? null]
  );

  const [rows] = await getPool().query<UpdateRow[]>(
    `SELECT id, title, summary, tag, published_on, created_at, updated_at
     FROM company_updates WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return mapRow(rows[0]);
}

export async function updateCompanyUpdate(opts: {
  id: number;
  title: string;
  summary: string;
  tag?: string | null;
  publishedOn: string;
}): Promise<CompanyUpdate | null> {
  const title = String(opts.title || '').trim();
  const summary = String(opts.summary || '').trim();
  const tag = String(opts.tag || '').trim() || null;
  const publishedOn = String(opts.publishedOn || '').trim().slice(0, 10);
  if (!title) throw new Error('Title is required');
  if (!summary) throw new Error('Summary is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedOn)) {
    throw new Error('Published date must be YYYY-MM-DD');
  }

  const [result] = await getPool().query<ResultSetHeader>(
    `UPDATE company_updates
     SET title = ?, summary = ?, tag = ?, published_on = ?
     WHERE id = ?`,
    [title, summary, tag, publishedOn, opts.id]
  );
  if (!result.affectedRows) return null;

  const [rows] = await getPool().query<UpdateRow[]>(
    `SELECT id, title, summary, tag, published_on, created_at, updated_at
     FROM company_updates WHERE id = ? LIMIT 1`,
    [opts.id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteCompanyUpdate(id: number): Promise<boolean> {
  const [result] = await getPool().query<ResultSetHeader>(
    `DELETE FROM company_updates WHERE id = ?`,
    [id]
  );
  return result.affectedRows > 0;
}
