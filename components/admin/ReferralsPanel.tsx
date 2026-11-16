"use client";

import { useCallback, useEffect, useState } from "react";
import { REFERRAL_STATUSES } from "@/lib/retention/referral";

type ReferralRow = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  relationship: string;
  referrerName: string;
  status: string;
  createdAt: string;
};

function formatDate(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ReferralsPanel({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/retention/referrals");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not load referrals");
      setRows(json.data.referrals || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = useCallback(async (id: string, status: string) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, status } : row))
    );
    const res = await fetch(`/api/retention/referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "Could not update status");
      void load();
    }
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-[var(--xxii-text)]">
          Referrals
        </h1>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-semibold text-[var(--xxii-blue)]"
        >
          Back
        </button>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-[var(--xxii-muted)]">Loading referrals…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--xxii-muted)]">No referrals yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--xxii-line)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--xxii-blue-soft)] text-xs uppercase tracking-wide text-[var(--xxii-muted)]">
              <tr>
                <th className="px-3 py-2">First name</th>
                <th className="px-3 py-2">Last name</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Relationship</th>
                <th className="px-3 py-2">Referral from</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--xxii-line)]">
                  <td className="px-3 py-2">{row.firstName}</td>
                  <td className="px-3 py-2">{row.lastName}</td>
                  <td className="px-3 py-2">{row.phone}</td>
                  <td className="px-3 py-2">{row.relationship}</td>
                  <td className="px-3 py-2">{row.referrerName}</td>
                  <td className="px-3 py-2">
                    <select
                      value={row.status}
                      onChange={(e) => void setStatus(row.id, e.target.value)}
                      className="rounded-lg border border-[var(--xxii-line)] bg-white px-2 py-1"
                    >
                      {REFERRAL_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">{formatDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
