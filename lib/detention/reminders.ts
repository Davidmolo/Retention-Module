/**
 * Daily Detention follow-up reminders (email).
 * Sends to Art + ar@ + matched dispatcher email when possible.
 */
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { sendAppEmail } from "@/lib/mail";

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export type ReminderRunResult = {
  ok: boolean;
  dueCount: number;
  emailed: number;
  mocked: boolean;
  error?: string;
};

async function dispatcherEmail(name: string | null): Promise<string | null> {
  if (!name?.trim()) return null;
  const pool = getPool();
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT email
         FROM tms_users
        WHERE email IS NOT NULL
          AND TRIM(email) <> ''
          AND LOWER(TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')))) = LOWER(?)
        LIMIT 1`,
      [name.trim()]
    );
    const email = String(rows[0]?.email || "").trim().toLowerCase();
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

export async function runDetentionDailyReminders(): Promise<ReminderRunResult> {
  const pool = getPool();
  const appUrl = env("NEXT_PUBLIC_APP_URL", "https://v2.goxxii.com").replace(
    /\/$/,
    ""
  );
  const baseTo = parseEmails(
    env("DETENTION_REMINDER_TO", "Art@goxxii.com,ar@goxxii.com")
  );
  const cc = parseEmails(env("DETENTION_REMINDER_CC", "mantas@goxxii.com"));

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, customer, dispatcher, load_number, shipment_number, driver_name,
            amount, status, follow_up_date, awaiting_us
       FROM detentions
      WHERE status NOT IN ('Paid', 'Denied')
        AND follow_up_date IS NOT NULL
        AND follow_up_date <= CURDATE()
      ORDER BY follow_up_date ASC, updated_at ASC
      LIMIT 200`
  );

  if (!rows.length) {
    return { ok: true, dueCount: 0, emailed: 0, mocked: false };
  }

  const lines = [];
  const extraTo = new Set<string>();
  for (const r of rows) {
    const disp = r.dispatcher ? String(r.dispatcher) : null;
    const de = await dispatcherEmail(disp);
    if (de) extraTo.add(de);
    lines.push(
      `• ${r.customer || "Customer"} · Load ${r.load_number || "—"} · ${r.driver_name || "Driver"} · $${Number(r.amount || 0).toFixed(2)} · ${r.status} · follow-up ${r.follow_up_date}${r.awaiting_us ? " · awaiting us" : ""} · ${appUrl}/detention`
    );
  }

  const to = [...new Set([...baseTo, ...extraTo])];
  if (!to.length) {
    return {
      ok: false,
      dueCount: rows.length,
      emailed: 0,
      mocked: false,
      error: "No reminder recipients configured",
    };
  }

  const subject = `[XXII Detention] ${rows.length} follow-up${rows.length === 1 ? "" : "s"} due`;
  const text = [
    `Detention follow-ups due today or earlier (${rows.length}):`,
    "",
    ...lines,
    "",
    `Open Detention board: ${appUrl}/detention`,
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a">
      <p><strong>${rows.length}</strong> detention follow-up${rows.length === 1 ? "" : "s"} due today or earlier.</p>
      <ul>${lines.map((l) => `<li>${l.replace(/^•\s*/, "").replace(/·/g, "·")}</li>`).join("")}</ul>
      <p><a href="${appUrl}/detention">Open Detention board</a></p>
    </div>
  `;

  const send = await sendAppEmail({ to, cc, subject, text, html });
  if (!send.ok) {
    return {
      ok: false,
      dueCount: rows.length,
      emailed: 0,
      mocked: false,
      error: send.error || "Failed to send reminder email",
    };
  }

  return {
    ok: true,
    dueCount: rows.length,
    emailed: to.length,
    mocked: send.mocked,
  };
}
