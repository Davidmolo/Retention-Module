"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Paperclip, X } from "lucide-react";
import {
  SMS_MEDIA_MAX_BYTES,
  SMS_MEDIA_MAX_FILES,
} from "@/lib/driverComms/smsMediaLimits";

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BroadcastPanel() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= SMS_MEDIA_MAX_FILES) {
        setError(`Max ${SMS_MEDIA_MAX_FILES} attachments.`);
        break;
      }
      if (f.size > SMS_MEDIA_MAX_BYTES) {
        setError(`${f.name} is too large (max 5 MB).`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    if ((!text.trim() && !files.length) || busy) return;
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
      let res: Response;
      if (files.length) {
        const form = new FormData();
        form.append("text", text.trim());
        for (const f of files) form.append("files", f);
        res = await fetch("/api/driver-comms/broadcast", {
          method: "POST",
          body: form,
        });
      } else {
        res = await fetch("/api/driver-comms/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        });
      }
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Broadcast failed");
      const d = json.data;
      setResult(
        `Sent ${d.sent} · skipped (opt-out) ${d.skipped} · failed ${d.failed} (of ${d.totalTargets} with phones)`
      );
      if (!d.failed) {
        setText("");
        setFiles([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canSend = Boolean(text.trim() || files.length);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link
          href="/driver-comms"
          className="text-sm font-semibold text-[var(--xxii-blue)] hover:underline"
        >
          ← Back to inbox
        </Link>
        <div className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-[var(--xxii-muted)]">
          Driver communication
        </div>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight text-[var(--xxii-text)] sm:text-2xl">
          Fleet broadcast
        </h1>
        <p className="mt-1 text-sm text-[var(--xxii-muted)]">
          Send one notice to every active driver (OpenRoad roster) through XXII
          Century GHL. Each send is logged on the driver’s SMS thread.
        </p>
      </div>

      <section className="xxii-card space-y-4 p-4 sm:p-5">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[var(--xxii-muted)]">
            Message
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Type the fleet-wide message…"
            className="w-full rounded-xl border border-[var(--xxii-line)] bg-white px-3 py-2.5 text-sm text-[var(--xxii-text)] outline-none focus:border-[var(--xxii-blue)]"
          />
        </label>

        {files.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {files.map((f) => (
              <li
                key={`${f.name}-${f.size}`}
                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-[var(--xxii-line)] bg-white px-2 py-1 text-[11px] text-[var(--xxii-text)]"
              >
                <span className="truncate font-medium">{f.name}</span>
                <span className="shrink-0 text-[var(--xxii-muted)]">
                  {formatSize(f.size)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 rounded p-0.5 text-[var(--xxii-muted)] hover:bg-slate-100"
                  onClick={() =>
                    setFiles((prev) =>
                      prev.filter(
                        (x) => !(x.name === f.name && x.size === f.size)
                      )
                    )
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || files.length >= SMS_MEDIA_MAX_FILES}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--xxii-line)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--xxii-text)] hover:bg-slate-50 disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
            Attach
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !canSend}
            className="rounded-xl bg-[var(--xxii-blue)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send to all active drivers"}
          </button>
          <span className="text-xs text-[var(--xxii-muted)]">
            Opted-out phones are skipped. Max {SMS_MEDIA_MAX_FILES} files, 5 MB
            each.
          </span>
        </div>

        {error ? (
          <p className="text-sm font-medium text-rose-600">{error}</p>
        ) : null}
        {result ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
            {result}
          </p>
        ) : null}
      </section>
    </div>
  );
}
