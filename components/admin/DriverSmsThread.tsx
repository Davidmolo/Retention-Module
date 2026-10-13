"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

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

export function DriverSmsThread({
  driverId,
  tall = false,
  apiBase,
}: {
  driverId: string;
  tall?: boolean;
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
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Send failed");
      setText("");
      setMessages(json.data?.messages || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex-1 space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3 ${
          tall ? "min-h-[420px]" : "min-h-[280px] max-h-[480px]"
        }`}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading thread…</p>
        ) : null}
        {!loading && !messages.length ? (
          <p className="text-sm text-muted-foreground">
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
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  outbound
                    ? "bg-foreground text-background"
                    : "bg-card border border-border text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p
                  className={`mt-1 text-[10px] ${
                    outbound ? "text-background/70" : "text-muted-foreground"
                  }`}
                >
                  {sourceLabel(m.source)}
                  {m.sentBy ? ` · ${m.sentBy}` : ""} · {formatWhen(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Write a text to this driver…"
          className="min-h-[64px] flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
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
          disabled={sending || !text.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 self-end rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
