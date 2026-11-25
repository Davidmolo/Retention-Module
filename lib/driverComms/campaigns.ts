import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getGpAdapter } from "@/lib/adapters/gp";
import { getPool } from "@/lib/db";
import { isRetentionExcludedDriverId } from "@/lib/retention/rosterExclusions";
import { sendSms } from "@/lib/retention/sms";
import { retentionStore } from "@/lib/retention/store";

export type CampaignSummary = {
  id: string;
  title: string;
  body: string;
  createdByName: string;
  createdByUserId: number;
  sentCount: number;
  replyCount: number;
  unseenCount: number;
  createdAt: string;
  status: string;
  scheduledAt: string | null;
};

function notifyEmail(username: string): string | null {
  const value = username.trim();
  return value.includes("@") ? value : null;
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  try {
    await sendDueCampaigns();
  } catch (error) {
    console.error("[campaigns] due send", (error as Error).message);
  }
  const pool = getPool();
  const counts = `(SELECT COUNT(*) FROM driver_comms_campaign_replies r WHERE r.campaign_id = c.id) AS reply_count,
            (SELECT COUNT(*) FROM driver_comms_campaign_replies r WHERE r.campaign_id = c.id AND r.seen_at IS NULL) AS unseen_count
       FROM driver_comms_campaigns c
      ORDER BY c.created_at DESC`;
  const base = `SELECT c.id, c.title, c.body, c.created_by_name, c.created_by_user_id,
            c.sent_count, c.created_at`;
  let rows: RowDataPacket[];
  try {
    const [rich] = await pool.query<RowDataPacket[]>(
      `${base}, c.status, c.scheduled_at, ${counts}`
    );
    rows = rich;
  } catch {
    const [plain] = await pool.query<RowDataPacket[]>(`${base}, ${counts}`);
    rows = plain;
  }
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title || ""),
    body: String(row.body || ""),
    createdByName: String(row.created_by_name || ""),
    createdByUserId: Number(row.created_by_user_id || 0),
    sentCount: Number(row.sent_count || 0),
    replyCount: Number(row.reply_count || 0),
    unseenCount: Number(row.unseen_count || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    status: String(row.status || "sent"),
    scheduledAt: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
  }));
}

export async function createCampaign(input: {
  title: string;
  body: string;
  userId: number;
  userName: string;
  username: string;
  driverIds?: string[] | null;
  scheduledAt?: string | null;
  files?: { buffer: Buffer; filename: string; contentType: string }[];
}) {
  const body = input.body.trim();
  if (!body) {
    const err = new Error("Message text is required");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const title = input.title.trim() || body.slice(0, 80);
  const id = nanoid(16);
  const when = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const later = Boolean(when && when.getTime() > Date.now());
  const pool = getPool();
  if (input.files?.length) {
    const dir = path.join(process.cwd(), "data", "campaign-media", id);
    await mkdir(dir, { recursive: true });
    const saved = [];
    for (const file of input.files) {
      const safe = file.filename.replace(/[^\w.\-]+/g, "_") || "file";
      await writeFile(path.join(dir, safe), file.buffer);
      saved.push({ filename: safe, contentType: file.contentType });
    }
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify(saved));
  }
  await pool.query(
    `INSERT INTO driver_comms_campaigns
      (id, title, body, created_by_user_id, created_by_name, notify_email, sent_count,
       scheduled_at, status, driver_ids_json)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [
      id,
      title,
      body,
      input.userId,
      input.userName,
      notifyEmail(input.username),
      later && when ? when.toISOString().slice(0, 23).replace("T", " ") : null,
      later ? "scheduled" : "sent",
      input.driverIds?.length ? JSON.stringify(input.driverIds) : null,
    ]
  );
  if (later) return { id, title, sent: 0, skipped: 0, failed: 0, scheduled: true };
  return deliverCampaign(id);
}

async function campaignFiles(id: string) {
  const dir = path.join(process.cwd(), "data", "campaign-media", id);
  const names = (await readdir(dir).catch(() => [] as string[])).filter(
    (name) => name !== "manifest.json"
  );
  const raw = await readFile(path.join(dir, "manifest.json"), "utf8").catch(() => "[]");
  let listed: { filename: string; contentType: string }[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) listed = parsed;
  } catch {
    listed = [];
  }
  const types = new Map(listed.map((file) => [file.filename, file.contentType]));
  const files = [];
  for (const filename of names) {
    files.push({
      buffer: await readFile(path.join(dir, filename)),
      filename,
      contentType: types.get(filename) || "application/octet-stream",
    });
  }
  return files;
}

async function deliverCampaign(id: string) {
  const pool = getPool();
  const [locked] = await pool.query<ResultSetHeader>(
    `UPDATE driver_comms_campaigns
        SET status = 'sent', sent_count = -1
      WHERE id = ? AND sent_count = 0
        AND (scheduled_at IS NULL OR scheduled_at <= UTC_TIMESTAMP(3))`,
    [id]
  );
  if (!locked.affectedRows) {
    return { id, title: "", sent: 0, skipped: 0, failed: 0, scheduled: false };
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT title, body, created_by_name, driver_ids_json FROM driver_comms_campaigns WHERE id = ?`,
    [id]
  );
  const row = rows[0];
  const title = String(row?.title || "");
  const body = String(row?.body || "");
  let chosen: string[] | null = null;
  if (row?.driver_ids_json) {
    try {
      const parsed = JSON.parse(String(row.driver_ids_json));
      if (Array.isArray(parsed) && parsed.length) chosen = parsed.map(String);
    } catch {
      chosen = null;
    }
  }
  const idFilter = chosen ? new Set(chosen) : null;
  const all = await getGpAdapter().listDrivers({ includeInactive: false });
  const targets = all.filter((driver) => {
    if (isRetentionExcludedDriverId(driver.id)) return false;
    if (idFilter && !idFilter.has(String(driver.id))) return false;
    return Boolean(driver.phone?.trim());
  });
  const files = await campaignFiles(id);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const driver of targets) {
    if (await retentionStore.isOptedOut(driver.phone)) {
      skipped += 1;
      continue;
    }
    const sms = await sendSms(driver.phone, body, {
      contactName: driver.name,
      driverId: driver.id,
      source: "campaign",
      sentBy: String(row?.created_by_name || "System"),
      files,
    });
    if (!sms.ok) {
      failed += 1;
      continue;
    }
    sent += 1;
    await pool.query(
      `INSERT IGNORE INTO driver_comms_campaign_recipients (campaign_id, driver_id)
       VALUES (?, ?)`,
      [id, String(driver.id)]
    );
  }
  await pool.query(
    `UPDATE driver_comms_campaigns SET sent_count = ?, status = 'sent' WHERE id = ?`,
    [sent, id]
  );
  return { id, title, sent, skipped, failed, scheduled: false };
}

export async function sendDueCampaigns() {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM driver_comms_campaigns
      WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
        AND scheduled_at <= UTC_TIMESTAMP(3)`
  );
  for (const row of rows) await deliverCampaign(String(row.id));
}

export async function getCampaign(id: string, viewerUserId: number) {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, title, body, created_by_name, created_by_user_id, sent_count, created_at
       FROM driver_comms_campaigns WHERE id = ? LIMIT 1`,
    [id]
  );
  const campaign = rows[0];
  if (!campaign) return null;
  const mine = Number(campaign.created_by_user_id) === viewerUserId;
  if (mine) {
    await pool.query(
      `UPDATE driver_comms_campaign_replies
          SET seen_at = CURRENT_TIMESTAMP(3)
        WHERE campaign_id = ? AND seen_at IS NULL`,
      [id]
    );
  }
  const [replies] = await pool.query<RowDataPacket[]>(
    `SELECT id, driver_id, body, created_at
       FROM driver_comms_campaign_replies
      WHERE campaign_id = ?
      ORDER BY created_at DESC`,
    [id]
  );
  const drivers = await getGpAdapter().listDrivers({ includeInactive: true });
  const names = new Map(drivers.map((d) => [String(d.id), d.name]));
  return {
    id: String(campaign.id),
    title: String(campaign.title),
    body: String(campaign.body),
    createdByName: String(campaign.created_by_name),
    mine,
    sentCount: Number(campaign.sent_count || 0),
    replies: replies.map((row) => ({
      id: String(row.id),
      driverId: String(row.driver_id),
      driverName: names.get(String(row.driver_id)) || `Driver ${row.driver_id}`,
      body: String(row.body || ""),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    })),
  };
}

/** A reply belongs to the latest campaign sent to that driver. Email only its creator. */
export async function recordCampaignReply(driverId: string, body: string) {
  const text = body.trim();
  if (!driverId || !text) return;
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.title, c.notify_email, c.created_by_name
       FROM driver_comms_campaign_recipients r
       JOIN driver_comms_campaigns c ON c.id = r.campaign_id
      WHERE r.driver_id = ?
      ORDER BY c.created_at DESC
      LIMIT 1`,
    [driverId]
  );
  const campaign = rows[0];
  if (!campaign) return;
  const [insert] = await pool.query<ResultSetHeader>(
    `INSERT INTO driver_comms_campaign_replies (id, campaign_id, driver_id, body)
     VALUES (?, ?, ?, ?)`,
    [nanoid(16), String(campaign.id), driverId, text]
  );
  if (!insert.affectedRows) return;
  const email = String(campaign.notify_email || "").trim();
  if (!email) return;
  const { sendRetentionEmail } = await import("@/lib/retention/email");
  const drivers = await getGpAdapter().listDrivers({ includeInactive: true });
  const name =
    drivers.find((d) => String(d.id) === String(driverId))?.name || "A driver";
  await sendRetentionEmail({
    to: email,
    subject: `Reply to your campaign: ${campaign.title}`,
    text: `${name} replied to your campaign "${campaign.title}":\n\n${text}`,
    driverId,
  });
}
