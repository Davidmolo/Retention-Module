"use client";

import { useMemo, useState } from "react";
import { ChevronDown, MessageSquareText } from "lucide-react";
import { Button } from "./ui/button";
import type { AppModule } from "@/lib/roles";

type FeedbackAbout = "overall" | "gross-profit" | "retention" | "detention";

const MODULE_OPTIONS: { value: FeedbackAbout; label: string; module?: AppModule }[] =
  [
    { value: "overall", label: "Website overall" },
    { value: "gross-profit", label: "Gross Profit", module: "gross-profit" },
    { value: "retention", label: "Retention", module: "retention" },
    { value: "detention", label: "Detention", module: "detention" },
  ];

export function FeedbackPanel({ modules }: { modules: AppModule[] }) {
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState<FeedbackAbout>("overall");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const options = useMemo(
    () =>
      MODULE_OPTIONS.filter(
        (opt) => !opt.module || modules.includes(opt.module)
      ),
    [modules]
  );

  const submit = async () => {
    setSending(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: about, message }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not send feedback");
      }
      setMessage("");
      setDone(true);
    } catch (e) {
      setError((e as Error).message || "Could not send feedback");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-md border border-border/70 bg-background/40">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setDone(false);
          setError(null);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <span className="inline-flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden />
          Feedback
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="space-y-2 border-t border-border px-3 py-3">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Tell us what to fix or improve. Goes to the build team; Mantas is
            copied.
          </p>
          <label className="block text-[11px] font-medium text-muted-foreground">
            About
            <select
              value={about}
              onChange={(e) => {
                setAbout(e.target.value as FeedbackAbout);
                setDone(false);
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-muted-foreground">
            Your feedback
            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setDone(false);
              }}
              rows={4}
              maxLength={5000}
              placeholder="What should we improve?"
              className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-[var(--xxii-brand,#1e4d9c)]"
            />
          </label>
          {error ? (
            <p className="text-[11px] text-rose-600">{error}</p>
          ) : null}
          {done ? (
            <p className="text-[11px] text-emerald-700">
              Sent — thank you.
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={sending || message.trim().length < 5}
            onClick={() => void submit()}
            className="w-full"
          >
            {sending ? "Sending…" : "Send feedback"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
