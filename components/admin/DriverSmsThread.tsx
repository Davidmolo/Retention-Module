"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { SkeletonThread } from "@/components/ui/skeleton";
import {
  SMS_MEDIA_MAX_BYTES,
  SMS_MEDIA_MAX_FILES,
} from "@/lib/driverComms/smsMediaLimits";

export type ThreadMessage = {
  id: string;
  direction: "outbound" | "inbound";
  body: string;
  source: string;
  sentBy: string | null;
  createdAt: string;
  legacy?: boolean;
};

function sourceLabel(source: string): string {
  switch (source) {
    case "survey":
    case "legacy_survey":
      return "Survey";
    case "reminder":
      return "Reminder";
    case "occasion":
    case "legacy_occasion":
      return "Greeting";
    case "resolution":
      return "Resolution";
    case "broadcast":
      return "Broadcast";
    case "inbound":
      return "Driver";
    case "manual":
      return "Manual";
    default:
      return source || "SMS";
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function DriverSmsThread({
  driverId,
  tall = false,
  /** Fill parent height; composer stays pinned (use in inbox panels). */
  fill = false,
  apiBase,
}: {
  driverId: string;
  tall?: boolean;
  fill?: boolean;
  /** Default retention messages API; Driver Comms can override. */
  apiBase?: string;
}) {
  const base =
    apiBase ||
    `/api/retention/drivers/${encodeURIComponent(driverId)}/messages`;
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(base, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load");
      setMessages(json.data?.messages || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

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
    if ((!text.trim() && !files.length) || sending) return;
    setSending(true);
    setError(null);
    try {
      let res: Response;
      if (files.length) {
        const form = new FormData();
        form.append("text", text.trim());
        for (const f of files) form.append("files", f);
        res = await fetch(base, { method: "POST", body: form });
      } else {
        res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        });
      }
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Send failed");
      setText("");
      setFiles([]);
      setMessages(json.data?.messages || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const listClass = fill
    ? "min-h-0 flex-1 overflow-y-auto"
    : tall
      ? "max-h-[min(420px,50vh)] min-h-[240px] overflow-y-auto"
      : "max-h-[min(360px,45vh)] min-h-[200px] overflow-y-auto";

  const canSend = Boolean(text.trim() || files.length);

  if (loading && !messages.length) {
    return <SkeletonThread fill={fill} />;
  }

  return (
    <div className={`flex min-h-0 flex-col ${fill ? "h-full flex-1" : ""}`}>
      <div
        ref={listRef}
        className={`space-y-3 rounded-xl border border-[var(--xxii-line)] bg-slate-50/80 p-3 ${listClass}`}
      >
        {!messages.length ? (
          <p className="text-sm text-[var(--xxii-muted)]">
            No messages yet. Survey requests, greetings, and manual texts will
            show here.
          </p>
        ) : null}
        {messages.map((m) => {
          const outbound = m.direction === "outbound";
          return (
            <div
              key={m.id}
              className={`flex ${outbound ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  outbound
                    ? "bg-[var(--xxii-blue)] text-white"
                    : "border border-[var(--xxii-line)] bg-white text-[var(--xxii-text)]"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p
                  className={`mt-1 text-[10px] ${
                    outbound ? "text-white/75" : "text-[var(--xxii-muted)]"
                  }`}
                >
                  {sourceLabel(m.source)}
                  {m.sentBy ? ` · ${m.sentBy}` : ""} · {formatWhen(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="mt-2 shrink-0 text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : null}

      {files.length ? (
        <ul className="mt-2 flex shrink-0 flex-wrap gap-1.5">
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
                className="shrink-0 rounded p-0.5 text-[var(--xxii-muted)] hover:bg-slate-100 hover:text-[var(--xxii-text)]"
                onClick={() =>
                  setFiles((prev) =>
                    prev.filter((x) => !(x.name === f.name && x.size === f.size))
                  )
                }
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex shrink-0 gap-2">
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
          title="Attach files"
          aria-label="Attach files"
          onClick={() => fileRef.current?.click()}
          disabled={sending || files.length >= SMS_MEDIA_MAX_FILES}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-xl border border-[var(--xxii-line)] bg-white text-[var(--xxii-text)] hover:bg-slate-50 disabled:opacity-50"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Write a text to this driver…"
          className="min-h-[64px] max-h-28 flex-1 resize-y rounded-xl border border-[var(--xxii-line)] bg-white px-3 py-2 text-sm text-[var(--xxii-text)] outline-none focus:border-[var(--xxii-blue)]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !canSend}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 self-end rounded-xl bg-[var(--xxii-blue)] px-3.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
