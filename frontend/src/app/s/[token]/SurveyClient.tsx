"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Department } from "@/lib/retention/types";

type Session = {
  driver: { id: string; name: string; firstName: string } | null;
  departments: Department[];
  googleReviewUrl: string;
};

type DeptRating = { department: Department; rating: number; comment: string };

export function SurveyClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<
    "rate" | "departments" | "comment" | "thanks-high" | "thanks-low" | "done"
  >("rate");
  const [overall, setOverall] = useState(0);
  const [hover, setHover] = useState(0);
  const [deptRatings, setDeptRatings] = useState<DeptRating[]>([]);
  const [generalComment, setGeneralComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/survey/${token}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        if (cancelled) return;
        setSession(json.data);
        setDeptRatings(
          json.data.departments.map((d: Department) => ({
            department: d,
            rating: 0,
            comment: "",
          }))
        );
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const firstName = session?.driver?.firstName || "there";

  const canContinueDepartments = useMemo(
    () => deptRatings.every((d) => d.rating >= 1),
    [deptRatings]
  );

  async function submit(payload: {
    overallRating: number;
    generalComment?: string;
    departmentFeedback?: DeptRating[];
  }) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/survey/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      if (json.data.branch === "positive") {
        setGoogleUrl(json.data.googleReviewUrl);
        setStep("thanks-high");
      } else {
        setStep("thanks-low");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <div className="animate-pulse space-y-4 p-6">
          <div className="mx-auto h-10 w-10 rounded-full bg-slate-200" />
          <div className="mx-auto h-4 w-40 rounded bg-slate-200" />
          <div className="mx-auto h-4 w-56 rounded bg-slate-200" />
        </div>
      </Shell>
    );
  }

  if (error && !session) {
    return (
      <Shell>
        <div className="p-6 text-center">
          <h1 className="text-lg font-bold text-slate-900">Survey unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="border-b border-slate-100 px-5 py-4 text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#0b1f3a] text-[10px] font-extrabold tracking-wider text-white">
          XXII
        </div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          Driver Feedback
        </div>
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait">
          {step === "rate" && (
            <motion.div
              key="rate"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="space-y-5"
            >
              <div className="text-center">
                <h1 className="text-xl font-extrabold text-slate-900">
                  Hi {firstName}!
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  How would you rate your overall experience with XXII?
                </p>
              </div>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setOverall(n)}
                    className="rounded-xl p-2 transition hover:scale-110"
                    aria-label={`${n} stars`}
                  >
                    <Star
                      size={36}
                      className={
                        (hover || overall) >= n
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-300"
                      }
                    />
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!overall}
                onClick={() => {
                  if (overall >= 4) {
                    void submit({ overallRating: overall, generalComment: "" });
                  } else {
                    setStep("departments");
                  }
                }}
                className="w-full rounded-xl bg-[#2f6fed] py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                Next
              </button>
              <button
                type="button"
                className="w-full py-2 text-sm font-semibold text-slate-400"
              >
                Maybe later
              </button>
            </motion.div>
          )}

          {step === "departments" && (
            <motion.div
              key="departments"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="space-y-4"
            >
              <div className="text-center">
                <h2 className="text-lg font-extrabold">What needs attention?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Please rate each department
                </p>
              </div>
              {deptRatings.map((row, idx) => (
                <div key={row.department} className="rounded-xl bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold">{row.department}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setDeptRatings((prev) =>
                              prev.map((d, i) =>
                                i === idx ? { ...d, rating: n } : d
                              )
                            );
                          }}
                        >
                          <Star
                            size={18}
                            className={
                              row.rating >= n
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-300"
                            }
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  {row.rating > 0 && row.rating <= 3 && (
                    <textarea
                      value={row.comment}
                      onChange={(e) =>
                        setDeptRatings((prev) =>
                          prev.map((d, i) =>
                            i === idx ? { ...d, comment: e.target.value } : d
                          )
                        )
                      }
                      placeholder={`Optional note about ${row.department}...`}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none"
                    />
                  )}
                </div>
              ))}
              <button
                type="button"
                disabled={!canContinueDepartments}
                onClick={() => setStep("comment")}
                className="w-full rounded-xl bg-[#2f6fed] py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                Continue
              </button>
            </motion.div>
          )}

          {step === "comment" && (
            <motion.div
              key="comment"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="space-y-4"
            >
              <div className="text-center">
                <h2 className="text-lg font-extrabold">Tell us more</h2>
                <p className="mt-1 text-sm text-slate-500">
                  A short comment is required for low ratings
                </p>
              </div>
              <textarea
                value={generalComment}
                onChange={(e) => setGeneralComment(e.target.value)}
                rows={5}
                placeholder="What happened? How can we help?"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#2f6fed]"
              />
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button
                type="button"
                disabled={submitting || !generalComment.trim()}
                onClick={() =>
                  void submit({
                    overallRating: overall,
                    generalComment,
                    departmentFeedback: deptRatings,
                  })
                }
                className="w-full rounded-xl bg-[#2f6fed] py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                {submitting ? "Submitting..." : "Submit feedback"}
              </button>
            </motion.div>
          )}

          {step === "thanks-high" && (
            <motion.div
              key="thanks-high"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 py-6 text-center"
            >
              <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
              <h2 className="text-xl font-extrabold">Thank you!</h2>
              <p className="text-sm text-slate-500">
                We&apos;re glad things are going well. Would you leave us a public review?
              </p>
              {googleUrl && (
                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-[#2f6fed] py-3 text-sm font-bold text-white"
                >
                  Leave a Google Review
                </a>
              )}
            </motion.div>
          )}

          {step === "thanks-low" && (
            <motion.div
              key="thanks-low"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 py-6 text-center"
            >
              <CheckCircle2 className="mx-auto text-emerald-500" size={48} />
              <h2 className="text-xl font-extrabold">Thank you!</h2>
              <p className="text-sm text-slate-500">
                Your feedback was received. Our team will follow up.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#0b1f3a_0%,#16325a_40%,#eef3fb_40%)] px-4 py-8">
      <div className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-black/5">
        {children}
      </div>
    </div>
  );
}
