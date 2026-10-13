"use client";

import { useState } from "react";
import Link from "next/link";

export function BroadcastPanel() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!text.trim() || busy) return;
    if (
      !window.confirm(
        "Send this SMS to all active OpenRoad drivers with a phone number (excluding opt-outs)?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/driver-comms/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Broadcast failed");
      const d = json.data;
      setResult(
        `Sent ${d.sent} · skipped (opt-out) ${d.skipped} · failed ${d.failed} (of ${d.totalTargets} with phones)`
      );
      if (!d.failed) setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link
          href="/driver-comms"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to inbox
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Fleet broadcast
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send one notice to every active driver (OpenRoad roster). Delivered
          through XXII Century GHL — same channel as Retention surveys. Each
          send is logged on the driver’s SMS thread.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Type the fleet-wide message…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send to all active drivers"}
        </button>
        <span className="text-xs text-muted-foreground">
          Opted-out phones are skipped automatically.
        </span>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result ? <p className="text-sm text-emerald-700">{result}</p> : null}
    </div>
  );
}
