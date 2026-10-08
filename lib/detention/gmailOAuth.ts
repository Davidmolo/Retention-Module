/**
 * Gmail OAuth for Detention intake (ar@ mailbox).
 * Read-only scope. Refresh token stored in MySQL.
 */
import { createHash, randomBytes } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getPool } from "@/lib/db";

const GMAIL_READONLY =
  "https://www.googleapis.com/auth/gmail.readonly";

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function detentionGmailExpectedEmail(): string {
  return env("DETENTION_GMAIL_EMAIL", "ar@goxxii.com").toLowerCase();
}

export function detentionGmailOAuthConfigured(): boolean {
  return Boolean(
    env("DETENTION_GMAIL_OAUTH_CLIENT_ID") &&
      env("DETENTION_GMAIL_OAUTH_CLIENT_SECRET")
  );
}

export function detentionGmailRedirectUri(): string {
  return (
    env("DETENTION_GMAIL_OAUTH_REDIRECT_URI") ||
    `${env("NEXT_PUBLIC_APP_URL", "https://v2.goxxii.com").replace(/\/$/, "")}/api/detention/gmail/callback`
  );
}

export function detentionGmailSetupKey(): string {
  return env("DETENTION_GMAIL_SETUP_KEY");
}

export function isValidDetentionGmailSetupKey(raw: string | null | undefined): boolean {
  const expected = detentionGmailSetupKey();
  if (!expected || !raw) return false;
  return timingSafeEqualString(raw, expected);
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  if (ah.length !== bh.length) return false;
  let out = 0;
  for (let i = 0; i < ah.length; i++) out |= ah[i] ^ bh[i];
  return out === 0;
}

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function buildGoogleAuthUrl(state: string): string {
  const clientId = env("DETENTION_GMAIL_OAUTH_CLIENT_ID");
  if (!clientId) {
    throw new Error("DETENTION_GMAIL_OAUTH_CLIENT_ID is not set");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: detentionGmailRedirectUri(),
    response_type: "code",
    scope: GMAIL_READONLY,
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    login_hint: detentionGmailExpectedEmail(),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  scope: string | null;
}> {
  const clientId = env("DETENTION_GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = env("DETENTION_GMAIL_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error("Gmail OAuth is not configured on the server"), {
      status: 500,
    });
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: detentionGmailRedirectUri(),
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw Object.assign(
      new Error(json.error_description || json.error || "Token exchange failed"),
      { status: 502 }
    );
  }
  if (!json.refresh_token) {
    throw Object.assign(
      new Error(
        "Google did not return a refresh token. Revoke XXII access in Google Account → Security → Third-party access, then connect again."
      ),
      { status: 400 }
    );
  }

  const expiresAt =
    typeof json.expires_in === "number"
      ? new Date(Date.now() + json.expires_in * 1000)
      : null;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    scope: json.scope || GMAIL_READONLY,
  };
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const json = (await res.json()) as { emailAddress?: string; error?: { message?: string } };
  if (!res.ok || !json.emailAddress) {
    throw Object.assign(
      new Error(json.error?.message || "Could not read Gmail profile"),
      { status: 502 }
    );
  }
  return json.emailAddress.trim().toLowerCase();
}

type OauthRow = RowDataPacket & {
  email: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: Date | string | null;
  scope: string | null;
  connected_by: string | null;
  connected_at: Date | string;
  updated_at: Date | string;
};

export type DetentionGmailConnection = {
  connected: boolean;
  email: string | null;
  expectedEmail: string;
  connectedAt: string | null;
  connectedBy: string | null;
  oauthConfigured: boolean;
};

export async function getDetentionGmailConnection(): Promise<DetentionGmailConnection> {
  const expectedEmail = detentionGmailExpectedEmail();
  const oauthConfigured = detentionGmailOAuthConfigured();
  try {
    const pool = getPool();
    const [rows] = await pool.query<OauthRow[]>(
      `SELECT email, refresh_token, access_token, access_token_expires_at,
              scope, connected_by, connected_at, updated_at
         FROM detention_gmail_oauth
        WHERE id = 1
        LIMIT 1`
    );
    const row = rows[0];
    if (!row?.refresh_token) {
      return {
        connected: false,
        email: null,
        expectedEmail,
        connectedAt: null,
        connectedBy: null,
        oauthConfigured,
      };
    }
    return {
      connected: true,
      email: row.email,
      expectedEmail,
      connectedAt: row.connected_at
        ? new Date(row.connected_at).toISOString()
        : null,
      connectedBy: row.connected_by,
      oauthConfigured,
    };
  } catch {
    return {
      connected: false,
      email: null,
      expectedEmail,
      connectedAt: null,
      connectedBy: null,
      oauthConfigured,
    };
  }
}

export async function saveDetentionGmailTokens(opts: {
  email: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: Date | null;
  scope: string | null;
  connectedBy: string | null;
}): Promise<void> {
  const pool = getPool();
  await pool.query<ResultSetHeader>(
    `INSERT INTO detention_gmail_oauth (
       id, email, refresh_token, access_token, access_token_expires_at,
       scope, connected_by, connected_at, updated_at
     ) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       email = VALUES(email),
       refresh_token = VALUES(refresh_token),
       access_token = VALUES(access_token),
       access_token_expires_at = VALUES(access_token_expires_at),
       scope = VALUES(scope),
       connected_by = VALUES(connected_by),
       connected_at = CURRENT_TIMESTAMP(3),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [
      opts.email,
      opts.refreshToken,
      opts.accessToken,
      opts.expiresAt,
      opts.scope,
      opts.connectedBy,
    ]
  );
}

export async function clearDetentionGmailTokens(): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM detention_gmail_oauth WHERE id = 1`);
}

type TokenRow = RowDataPacket & {
  email: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: Date | string | null;
};

/** Valid access token for Gmail API (refreshes when expired / near expiry). */
export async function getValidGmailAccessToken(): Promise<{
  accessToken: string;
  email: string;
}> {
  const pool = getPool();
  const [rows] = await pool.query<TokenRow[]>(
    `SELECT email, refresh_token, access_token, access_token_expires_at
       FROM detention_gmail_oauth
      WHERE id = 1
      LIMIT 1`
  );
  const row = rows[0];
  if (!row?.refresh_token) {
    throw Object.assign(
      new Error("ar@ Gmail is not connected. Open /detention/connect-ar-mailbox first."),
      { status: 503 }
    );
  }

  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at).getTime()
    : 0;
  const stillValid =
    row.access_token && expiresAt - Date.now() > 60_000;
  if (stillValid && row.access_token) {
    return { accessToken: row.access_token, email: row.email };
  }

  const clientId = env("DETENTION_GMAIL_OAUTH_CLIENT_ID");
  const clientSecret = env("DETENTION_GMAIL_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error("Gmail OAuth client is not configured"), {
      status: 500,
    });
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: row.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw Object.assign(
      new Error(
        json.error_description ||
          json.error ||
          "Failed to refresh Gmail access token — reconnect ar@ mailbox"
      ),
      { status: 502 }
    );
  }

  const nextExpires =
    typeof json.expires_in === "number"
      ? new Date(Date.now() + json.expires_in * 1000)
      : null;
  await pool.query(
    `UPDATE detention_gmail_oauth
        SET access_token = ?,
            access_token_expires_at = ?,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = 1`,
    [json.access_token, nextExpires]
  );

  return { accessToken: json.access_token, email: row.email };
}
