"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  SMS_MEDIA_MAX_BYTES,
  SMS_MEDIA_MAX_FILES,
} from "@/lib/driverComms/smsMediaLimits";

type Campaign = {
  id: string;
  title: string;
  createdByName: string;
  sentCount: number;
  replyCount: number;
  unseenCount: number;
  createdAt: string;
  status?: string;
  scheduledAt?: string | null;
};

type Reply = {
  id: string;
  driverId: string;
  driverName: string;
  body: string;
  createdAt: string;
};

export function CampaignsPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [openTitle, setOpenTitle] = useState("");
  const [drivers, setDrivers] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [driverQuery, setDriverQuery] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/driver-comms/campaigns");
    const json = await res.json();
    if (!json.ok) return;
    setCampaigns(json.data.campaigns || []);
    const next = (json.data.drivers || []) as { id: string; name: string }[];
    setDrivers(next);
    setSelected((current) => (current.length ? current : next.map((d) => d.id)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if ((!text.trim() && !files.length) || busy || !selected.length) return;
    const when = scheduledAt ? ` at ${scheduledAt}` : " now";
    if (!window.confirm(`Send this campaign to ${selected.length} drivers${when}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("title", title);
      form.set("text", text);
      if (scheduledAt) form.set("scheduledAt", new Date(scheduledAt).toISOString());
      const all = selected.length === drivers.length;
      if (!all) form.set("driverIds", JSON.stringify(selected));
      for (const file of files) form.append("files", file);
      const res = await fetch("/api/driver-comms/campaigns", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not send");
      setTitle("");
      setText("");
      setScheduledAt("");
      setFiles([]);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openCampaign(id: string) {
    setOpenId(id);
    const res = await fetch(`/api/driver-comms/campaigns/${id}`);
    const json = await res.json();
    if (!json.ok) return;
    setOpenTitle(json.data.campaign.title || "");
    setReplies(json.data.campaign.replies || []);
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/driver-comms" className="text-sm font-semibold text-[var(--xxii-blue)] hover:underline">
          ← Back to inbox
        </Link>
        <h1 className="mt-2 text-xl font-extrabold text-[var(--xxii-text)]">Campaigns</h1>
        <p className="mt-1 text-sm text-[var(--xxii-muted)]">
          A reply is tied to the latest campaign sent to that driver. Only the person who sent it gets the email, and a dot shows when they have not opened the new replies yet.
        </p>
      </div>

      <form onSubmit={send} className="xxii-card space-y-3 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Campaign name"
          className="w-full rounded-lg border border-[var(--xxii-line)] px-3 py-2 text-sm"
        />
        <textarea
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message"
          rows={4}
          className="w-full rounded-lg border border-[var(--xxii-line)] px-3 py-2 text-sm"
        />
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--xxii-muted)]">Send later</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="rounded-lg border border-[var(--xxii-line)] px-3 py-2 text-sm"
          />
        </label>
        <input
          type="file"
          multiple
          onChange={(e) => {
            const next = Array.from(e.target.files || []).slice(0, SMS_MEDIA_MAX_FILES);
            const tooBig = next.find((file) => file.size > SMS_MEDIA_MAX_BYTES);
            if (tooBig) {
              setError(`${tooBig.name} is too large (max 5 MB).`);
              setFiles([]);
              return;
            }
            setError(null);
            setFiles(next);
          }}
          className="text-sm"
        />
        <div className="rounded-lg border border-[var(--xxii-line)] p-2">
          <input
            value={driverQuery}
            onChange={(e) => setDriverQuery(e.target.value)}
            placeholder="Search drivers"
            className="mb-2 w-full rounded border border-[var(--xxii-line)] px-2 py-1 text-sm"
          />
          <label className="mb-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={drivers.length > 0 && selected.length === drivers.length}
              onChange={(e) =>
                setSelected(e.target.checked ? drivers.map((d) => d.id) : [])
              }
            />
            Select all
          </label>
          <ul className="max-h-40 space-y-1 overflow-auto text-sm">
            {drivers
              .filter((d) => d.name.toLowerCase().includes(driverQuery.trim().toLowerCase()))
              .map((driver) => (
                <li key={driver.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(driver.id)}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, driver.id]
                            : current.filter((id) => id !== driver.id)
                        )
                      }
                    />
                    {driver.name}
                  </label>
                </li>
              ))}
          </ul>
        </div>
        <button
          type="submit"
          disabled={busy || !selected.length}
          className="rounded-lg bg-[var(--xxii-blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Sending…" : scheduledAt ? "Schedule campaign" : "Send campaign"}
        </button>
      </form>

      <ul className="space-y-2">
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            <button
              type="button"
              onClick={() => void openCampaign(campaign.id)}
              className="xxii-card flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <span>
                <span className="block font-semibold text-[var(--xxii-text)]">
                  {campaign.title}
                  {campaign.unseenCount > 0 ? (
                    <span className="ml-2 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" title="Unseen replies" />
                  ) : null}
                </span>
                <span className="text-xs text-[var(--xxii-muted)]">
                  {campaign.createdByName}
                  {" · "}
                  {campaign.status === "scheduled"
                    ? `scheduled ${campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : ""}`
                    : `sent ${campaign.sentCount}`}
                  {" · replies "}
                  {campaign.replyCount}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {openId ? (
        <section className="xxii-card p-4">
          <h2 className="text-sm font-bold">{openTitle}</h2>
          <p className="mt-1 text-xs text-[var(--xxii-muted)]">
            Only drivers who answered this campaign are listed.
          </p>
          {!replies.length ? (
            <p className="mt-3 text-sm text-[var(--xxii-muted)]">No replies yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--xxii-line)]">
              {replies.map((reply) => (
                <li key={reply.id} className="py-2 text-sm">
                  <div className="font-semibold">{reply.driverName}</div>
                  <div>{reply.body}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
