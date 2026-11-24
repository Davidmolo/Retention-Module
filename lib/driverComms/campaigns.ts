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
};

function notifyEmail(username: string): string | null {
  const value = username.trim();
  return value.includes("@") ? value : null;
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.title, c.body, c.created_by_name, c.created_by_user_id,
            c.sent_count, c.created_at,
            (SELECT COUNT(*) FROM driver_comms_campaign_replies r WHERE r.campaign_id = c.id) AS reply_count,
            (SELECT COUNT(*) FROM driver_comms_campaign_replies r WHERE r.campaign_id = c.id AND r.seen_at IS NULL) AS unseen_count
       FROM driver_comms_campaigns c
      ORDER BY c.created_at DESC`
  );
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
  }));
}

export async function createCampaign(input: {
  title: string;
  body: string;
  userId: number;
  userName: string;
  username: string;
  driverIds?: string[] | null;
}) {
  const body = input.body.trim();
  if (!body) {
    const err = new Error("Message text is required");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const title = input.title.trim() || body.slice(0, 80);
  const id = nanoid(16);
  const pool = getPool();
  await pool.query(
    `INSERT INTO driver_comms_campaigns
      (id, title, body, created_by_user_id, created_by_name, notify_email, sent_count)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [id, title, body, input.userId, input.userName, notifyEmail(input.username)]
  );

  const all = await getGpAdapter().listDrivers({ includeInactive: false });
  const idFilter = input.driverIds?.length ? new Set(input.driverIds) : null;
  const targets = all.filter((driver) => {
    if (isRetentionExcludedDriverId(driver.id)) return false;
    if (idFilter && !idFilter.has(String(driver.id))) return false;
    return Boolean(driver.phone?.trim());
  });

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
      sentBy: input.userName,
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
    `UPDATE driver_comms_campaigns SET sent_count = ? WHERE id = ?`,
    [sent, id]
  );
  return { id, title, sent, skipped, failed };
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
