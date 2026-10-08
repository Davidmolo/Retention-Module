"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Link2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

type StatusData = {
  connected: boolean;
  email: string | null;
  expectedEmail: string;
  connectedAt: string | null;
  connectedBy: string | null;
  oauthConfigured: boolean;
};

export default function ConnectArMailboxPage() {
  const searchParams = useSearchParams();
  const setupKey = searchParams.get("key") || "";
  const flashStatus = searchParams.get("status");
  const flashMessage = searchParams.get("message");
  const flashEmail = searchParams.get("email");

  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const statusUrl = useMemo(() => {
    const sp = new URLSearchParams();
    if (setupKey) sp.set("key", setupKey);
    const q = sp.toString();
    return `/api/detention/gmail/status${q ? `?${q}` : ""}`;
  }, [setupKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(statusUrl, { credentials: "include", cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not load connection status");
      }
      setData(json.data as StatusData);
    } catch (e) {
      setError((e as Error).message || "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [statusUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const startHref = setupKey
    ? `/api/detention/gmail/start?key=${encodeURIComponent(setupKey)}`
    : "/api/detention/gmail/start";

  const disconnect = async () => {
    setDisconnecting(true);
    setError(null);
    try {
      const sp = setupKey ? `?key=${encodeURIComponent(setupKey)}` : "";
      const res = await fetch(`/api/detention/gmail/disconnect${sp}`, {
        method: "POST",
        credentials: "include",
        headers: setupKey
          ? { "x-detention-gmail-setup-key": setupKey }
          : undefined,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Disconnect failed");
      }
      await load();
    } catch (e) {
      setError((e as Error).message || "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          Connect AR mailbox
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One-time Google Allow so XXII can read OpenRoad{" "}
          <strong>Detention completed</strong> emails from{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {data?.expectedEmail || "ar@goxxii.com"}
          </code>
          . This is not an App Password and does not use the shared mailbox
          login password.
        </p>
      </div>

      {flashStatus === "connected" ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Connected successfully
            {flashEmail ? (
              <>
                {" "}
                as <strong>{flashEmail}</strong>
              </>
            ) : null}
            . You can close this page and tell Shahmeer it’s done.
          </div>
        </div>
      ) : null}

      {flashStatus === "error" ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{flashMessage || "Connect failed. Please try again."}</div>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {error}
            {!setupKey ? (
              <div className="mt-1 text-xs">
                If you are from IT, open the full setup link Shahmeer sent
                (includes a secure <code>key=</code>). Or sign in to XXII as
                Admin.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Mail className="h-4 w-4" />
          Connection status
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : data ? (
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Mailbox needed</dt>
              <dd className="font-medium">{data.expectedEmail}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Google OAuth ready</dt>
              <dd className="font-medium">
                {data.oauthConfigured ? "Yes" : "Not yet (Client ID/Secret)"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Connected</dt>
              <dd className="font-medium">
                {data.connected ? (
                  <span className="text-emerald-700">Yes — {data.email}</span>
                ) : (
                  <span className="text-amber-700">No</span>
                )}
              </dd>
            </div>
            {data.connectedAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Connected at</dt>
                <dd className="font-medium">
                  {new Date(data.connectedAt).toLocaleString()}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Open an Incognito/Private window (recommended).
          </li>
          <li>
            Sign into Gmail as{" "}
            <strong className="text-foreground">
              {data?.expectedEmail || "ar@goxxii.com"}
            </strong>{" "}
            only.
          </li>
          <li>
            Click <strong className="text-foreground">Connect ar@ with Google</strong>{" "}
            below.
          </li>
          <li>
            On Google’s screen, confirm the account is ar@, then click{" "}
            <strong className="text-foreground">Allow</strong>.
          </li>
          <li>Wait for the green success message on this page.</li>
        </ol>

        <div className="flex flex-wrap gap-2 pt-1">
          {data?.oauthConfigured && !loading ? (
            <a
              href={startHref}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              <Link2 className="h-4 w-4" />
              Connect ar@ with Google
            </a>
          ) : (
            <Button type="button" disabled>
              <Link2 className="h-4 w-4" />
              Connect ar@ with Google
            </Button>
          )}
          {data?.connected ? (
            <Button
              type="button"
              variant="outline"
              disabled={disconnecting}
              onClick={() => void disconnect()}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          ) : null}
        </div>

        {!data?.oauthConfigured && !loading ? (
          <p className="text-xs text-amber-700">
            Server is missing Google OAuth Client ID / Secret. IT must create
            the Google Cloud OAuth client (Internal app + Gmail API) and send
            those values to Shahmeer before Allow will work.
          </p>
        ) : null}
      </div>
    </div>
  );
}
