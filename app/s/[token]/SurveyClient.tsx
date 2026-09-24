"use client";

import { motion, AnimatePresence, type Variants } from "framer-motion";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import type { Department } from "@/lib/retention/types";
import { RESOLUTION_ASPECTS } from "@/lib/retention/constants";

type Session = {
  driver: { id: string; name: string; firstName: string } | null;
  departments: Department[];
  googleReviewUrl: string;
  surveyKind?: "regular" | "resolution";
};

type DeptRating = { department: Department; rating: number; comment: string };
type ResolutionRatings = {
  quickly: number;
  efficiently: number;
  effectively: number;
};
type Step =
  | "rate"
  | "departments"
  | "comment"
  | "resolution"
  | "thanks-high"
  | "thanks-low"
  | "thanks-resolution";

const STEP_ORDER: Step[] = [
  "rate",
  "departments",
  "comment",
  "resolution",
  "thanks-high",
  "thanks-low",
  "thanks-resolution",
];

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

const btnClass =
  "w-full rounded-xl bg-[linear-gradient(135deg,color-mix(in_oklch,var(--xxii-blue)_72%,oklch(0.62_0.13_240)),var(--xxii-blue))] py-3 text-sm font-bold text-white shadow-md shadow-[color-mix(in_oklch,var(--xxii-blue)_22%,transparent)] disabled:pointer-events-none disabled:opacity-40 transition-transform active:scale-[0.98]";

const easeOut = [0.16, 1, 0.3, 1] as const;
const easeInOut = [0.4, 0, 0.2, 1] as const;

const stepVariants: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? 14 : -14,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: easeOut },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -10 : 10,
    transition: { duration: 0.2, ease: easeInOut },
  }),
};

/** Soft card entrance — ease only (springs overshoot and feel jerky). */
const shellInitial = { opacity: 0, y: 8 };
const shellAnimate = { opacity: 1, y: 0 };
const shellTransition = { duration: 0.45, ease: easeOut };

const shellStyle = {
  background:
    "linear-gradient(165deg, color-mix(in oklch, var(--xxii-blue-soft) 85%, white) 0%, color-mix(in oklch, var(--xxii-blue) 8%, white) 45%, color-mix(in oklch, var(--xxii-blue-soft) 35%, white) 100%)",
};

const starHover = { scale: 1.1, y: -1 };
const starTap = { scale: 0.92 };
const starSpring = { type: "spring" as const, stiffness: 400, damping: 24 };
const smallStarTap = { scale: 0.88 };

const overlayFade = { duration: 0.2, ease: easeInOut };
const overlayPanel = { duration: 0.22, ease: easeOut };

/** Opacity-only body swap — no scale/y so height stays calm. */
const bodyFade = { duration: 0.4, ease: easeOut };

const MIN_LOADER_MS = 600;

const starFilled =
  "fill-[var(--xxii-warn)] text-[var(--xxii-warn)] transition-colors duration-150";
const starEmpty =
  "text-[color-mix(in_oklch,var(--xxii-muted)_35%,white)] transition-colors duration-150";

function mapDepts(departments: Department[]): DeptRating[] {
  return departments.map((d) => ({ department: d, rating: 0, comment: "" }));
}

export function SurveyClient({
  token,
  previewSession,
}: {
  token: string;
  /** When set, skips API load/submit — UI walkthrough only. */
  previewSession?: Session;
}) {
  const preview = Boolean(previewSession);
  const searchParams = useSearchParams();
  const isAdminTest = !preview && searchParams.get("via") === "admin";
  // Always start on loader so the handoff to rating can animate.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(
    previewSession ?? null
  );
  const [step, setStep] = useState<Step>("rate");
  const [direction, setDirection] = useState(1);
  const [overall, setOverall] = useState(0);
  const [deptRatings, setDeptRatings] = useState<DeptRating[]>(() =>
    previewSession ? mapDepts(previewSession.departments) : []
  );
  const [resolutionRatings, setResolutionRatings] = useState<ResolutionRatings>(
    {
      quickly: 0,
      efficiently: 0,
      effectively: 0,
    }
  );
  const [generalComment, setGeneralComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(
    previewSession?.googleReviewUrl ?? null
  );

  const submitLock = useRef(false);
  const stepRef = useRef(step);
  stepRef.current = step;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const overallRef = useRef(overall);
  overallRef.current = overall;
  const deptRatingsRef = useRef(deptRatings);
  deptRatingsRef.current = deptRatings;
  const resolutionRef = useRef(resolutionRatings);
  resolutionRef.current = resolutionRatings;
  const commentRef = useRef(generalComment);
  commentRef.current = generalComment;

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    (async () => {
      try {
        if (preview) {
          // Brief pause so preview still gets loader → rating animation
          await new Promise((r) => setTimeout(r, MIN_LOADER_MS));
        } else {
          const res = await fetch(`/api/survey/${token}`);
          const json = await res.json();
          if (!json.ok) throw new Error(json.error);
          if (cancelled) return;
          setSession(json.data);
          setDeptRatings(mapDepts(json.data.departments));
          if (json.data.surveyKind === "resolution") {
            setStep("resolution");
          }
          const wait = Math.max(0, MIN_LOADER_MS - (Date.now() - started));
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, preview]);

  const firstName = session?.driver?.firstName || "there";
  const canContinueDepartments = useMemo(
    () => deptRatings.every((d) => d.rating >= 1),
    [deptRatings]
  );
  const canSubmitComment = generalComment.trim().length > 0;
  const canSubmitResolution = useMemo(
    () =>
      resolutionRatings.quickly >= 1 &&
      resolutionRatings.efficiently >= 1 &&
      resolutionRatings.effectively >= 1,
    [resolutionRatings]
  );

  const goTo = useCallback((next: Step) => {
    const from = STEP_ORDER.indexOf(stepRef.current);
    const to = STEP_ORDER.indexOf(next);
    setDirection(to >= from ? 1 : -1);
    setStep(next);
  }, []);

  const submit = useCallback(
    async (payload: {
      overallRating?: number;
      generalComment?: string;
      departmentFeedback?: DeptRating[];
      resolutionFeedback?: ResolutionRatings;
    }) => {
      if (submitLock.current) return;
      submitLock.current = true;
      setSubmitting(true);
      setError(null);
      try {
        if (preview) {
          await new Promise((r) => setTimeout(r, 500));
          if (payload.resolutionFeedback) {
            goTo("thanks-resolution");
          } else if ((payload.overallRating || 0) >= 4) {
            setGoogleUrl(sessionRef.current?.googleReviewUrl ?? null);
            goTo("thanks-high");
          } else {
            goTo("thanks-low");
          }
          return;
        }
        const res = await fetch(`/api/survey/${token}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            submittedBy: isAdminTest ? "admin" : "driver",
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error);
        if (payload.resolutionFeedback) {
          goTo("thanks-resolution");
        } else if (json.data.branch === "positive") {
          setGoogleUrl(json.data.googleReviewUrl);
          goTo("thanks-high");
        } else {
          goTo("thanks-low");
        }
      } catch (e) {
        setError((e as Error).message);
        submitLock.current = false;
        setSubmitting(false);
      }
    },
    [preview, token, goTo, isAdminTest]
  );

  const onRateNext = useCallback(() => {
    if (submitLock.current) return;
    const rating = overallRef.current;
    if (!rating) return;
    if (rating >= 4) {
      void submit({ overallRating: rating, generalComment: "" });
    } else {
      goTo("departments");
    }
  }, [submit, goTo]);

  const onContinueDepartments = useCallback(() => {
    if (submitLock.current) return;
    goTo("comment");
  }, [goTo]);

  const onBackToDepartments = useCallback(() => {
    if (submitLock.current) return;
    goTo("departments");
  }, [goTo]);

  const onSubmitComment = useCallback(() => {
    if (submitLock.current) return;
    const comment = commentRef.current.trim();
    if (!comment) return;
    void submit({
      overallRating: overallRef.current,
      generalComment: comment,
      departmentFeedback: deptRatingsRef.current,
    });
  }, [submit]);

  const onSubmitResolution = useCallback(() => {
    if (submitLock.current) return;
    if (!canSubmitResolution) return;
    void submit({
      resolutionFeedback: resolutionRef.current,
      generalComment: commentRef.current.trim(),
    });
  }, [submit, canSubmitResolution]);

  const setResolutionAspect = useCallback(
    (key: keyof ResolutionRatings, rating: number) => {
      setResolutionRatings((prev) => ({ ...prev, [key]: rating }));
    },
    []
  );

  const setDeptRating = useCallback((idx: number, rating: number) => {
    setDeptRatings((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, rating } : d))
    );
  }, []);

  const setDeptComment = useCallback((idx: number, comment: string) => {
    setDeptRatings((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, comment } : d))
    );
  }, []);

  const onCommentChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setGeneralComment(e.target.value);
  }, []);

  const busy = submitting;
  const showError = Boolean(error && !session);
  const showThanks =
    step === "thanks-high" ||
    step === "thanks-low" ||
    step === "thanks-resolution";
  const showSurvey = !loading && !showError;

  return (
    <Shell>
      {preview && <PreviewBanner />}
      {!showError && <SurveyHeader />}

      <div className="relative min-h-[280px] overflow-hidden p-5">
        <AnimatePresence initial={false}>
          {loading && (
            <motion.div
              key="loading"
              className="absolute inset-0 flex items-center justify-center p-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={bodyFade}
            >
              <LoadingBlock
                title="Loading your survey"
                subtitle="Just a moment…"
              />
            </motion.div>
          )}

          {showError && (
            <motion.div
              key="error"
              className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={bodyFade}
            >
              <h1 className="text-lg font-bold text-[var(--xxii-text)]">
                Survey unavailable
                </h1>
              <p className="mt-2 text-sm text-[var(--xxii-muted)]">{error}</p>
            </motion.div>
          )}

          {showSurvey && (
            <motion.div
              key="survey"
              className="relative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={bodyFade}
            >
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                {step === "rate" && (
                  <StepFrame key="rate" direction={direction}>
                    <RateStep
                      firstName={firstName}
                      overall={overall}
                      busy={busy}
                      onSelect={setOverall}
                      onNext={onRateNext}
                    />
                  </StepFrame>
                )}

                {step === "resolution" && (
                  <StepFrame key="resolution" direction={direction}>
                    <ResolutionStep
                      firstName={firstName}
                      ratings={resolutionRatings}
                      comment={generalComment}
                      busy={busy}
                      canSubmit={canSubmitResolution}
                      error={error}
                      onRate={setResolutionAspect}
                      onComment={onCommentChange}
                      onSubmit={onSubmitResolution}
                    />
                  </StepFrame>
                )}

                {step === "departments" && (
                  <StepFrame key="departments" direction={direction}>
                    <DepartmentsStep
                      rows={deptRatings}
                      busy={busy}
                      canContinue={canContinueDepartments}
                      onRate={setDeptRating}
                      onComment={setDeptComment}
                      onContinue={onContinueDepartments}
                    />
                  </StepFrame>
                )}

                {step === "comment" && (
                  <StepFrame key="comment" direction={direction}>
                    <CommentStep
                      value={generalComment}
                      error={error}
                      busy={busy}
                      canSubmit={canSubmitComment}
                      onChange={onCommentChange}
                      onSubmit={onSubmitComment}
                      onBack={onBackToDepartments}
                    />
                  </StepFrame>
                )}

                {step === "thanks-high" && (
                  <StepFrame key="thanks-high" direction={direction}>
                    <ThanksHigh googleUrl={googleUrl} />
                  </StepFrame>
                )}

                {step === "thanks-low" && (
                  <StepFrame key="thanks-low" direction={direction}>
                    <ThanksLow />
                  </StepFrame>
                )}

                {step === "thanks-resolution" && (
                  <StepFrame key="thanks-resolution" direction={direction}>
                    <ThanksResolution />
                  </StepFrame>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {busy && !showThanks && (
                  <motion.div
                    key="submit-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={overlayFade}
                    className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-[2px]"
                  >
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={overlayPanel}
                    >
                      <LoadingBlock
                        title="Sending your feedback"
                        subtitle="Please wait…"
                      />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
              </div>
    </Shell>
  );
}

const StepFrame = memo(function StepFrame({
  direction,
  children,
}: {
  direction: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="origin-center"
    >
      {children}
    </motion.div>
  );
});

/** Hover stays local so parent doesn't re-render on every mouse move. */
const StarRating = memo(function StarRating({
  value,
  size = 36,
  disabled,
  onSelect,
}: {
  value: number;
  size?: number;
  disabled?: boolean;
  onSelect: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;

  const clearHover = useCallback(() => setHover(0), []);

  return (
              <div className="flex justify-center gap-2">
      {STAR_VALUES.map((n) => (
        <motion.button
                    key={n}
                    type="button"
          whileHover={disabled ? undefined : starHover}
          whileTap={disabled ? undefined : size > 24 ? starTap : smallStarTap}
          transition={starSpring}
          disabled={disabled}
          onMouseEnter={() => !disabled && setHover(n)}
          onMouseLeave={clearHover}
          onClick={() => !disabled && onSelect(n)}
          className="rounded-xl p-2 disabled:pointer-events-none disabled:opacity-50"
                    aria-label={`${n} stars`}
                  >
                    <Star
            size={size}
            className={active >= n ? starFilled : starEmpty}
          />
        </motion.button>
                ))}
              </div>
  );
});

const RateStep = memo(function RateStep({
  firstName,
  overall,
  busy,
  onSelect,
  onNext,
}: {
  firstName: string;
  overall: number;
  busy: boolean;
  onSelect: (n: number) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-extrabold text-[var(--xxii-text)]">
          Hi {firstName}!
        </h1>
        <p className="mt-2 text-sm text-[var(--xxii-muted)]">
          How would you rate your overall experience with XXII?
        </p>
      </div>
      <StarRating value={overall} disabled={busy} onSelect={onSelect} />
      <div className="space-y-1">
              <button
                type="button"
          disabled={busy || !overall}
          onClick={onNext}
          className={btnClass}
        >
          {busy ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </span>
          ) : (
            "Next"
          )}
              </button>
              <button
                type="button"
          disabled={busy}
          className="w-full py-2 text-sm font-semibold text-[var(--xxii-muted)] disabled:opacity-40"
              >
                Maybe later
              </button>
      </div>
              </div>
  );
});

const DeptRow = memo(function DeptRow({
  department,
  rating,
  comment,
  idx,
  busy,
  onRate,
  onComment,
}: {
  department: Department;
  rating: number;
  comment: string;
  idx: number;
  busy: boolean;
  onRate: (idx: number, rating: number) => void;
  onComment: (idx: number, comment: string) => void;
}) {
  const handleRate = useCallback(
    (n: number) => onRate(idx, n),
    [idx, onRate]
  );
  const handleComment = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => onComment(idx, e.target.value),
    [idx, onComment]
  );

  return (
    <div className="rounded-xl border border-[var(--xxii-line)] bg-[linear-gradient(135deg,var(--xxii-blue-soft),color-mix(in_oklch,var(--muted)_60%,white))] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-[var(--xxii-text)]">
          {department}
        </span>
                    <div className="flex gap-1">
          {STAR_VALUES.map((n) => (
            <motion.button
                          key={n}
                          type="button"
              whileTap={busy ? undefined : smallStarTap}
              disabled={busy}
              onClick={() => handleRate(n)}
              className="disabled:pointer-events-none disabled:opacity-50"
              aria-label={`${department} ${n} stars`}
                        >
                          <Star
                            size={18}
                className={rating >= n ? starFilled : starEmpty}
              />
            </motion.button>
                      ))}
                    </div>
                  </div>
      {rating > 0 && rating <= 3 && (
                    <textarea
          value={comment}
          disabled={busy}
          onChange={handleComment}
          placeholder={`Optional note about ${department}...`}
          className="mt-1 w-full rounded-lg border border-[var(--xxii-line)] bg-white px-2 py-1.5 text-sm outline-none focus:border-[var(--xxii-blue)] disabled:opacity-60"
                    />
                  )}
                </div>
  );
});

const DepartmentsStep = memo(function DepartmentsStep({
  rows,
  busy,
  canContinue,
  onRate,
  onComment,
  onContinue,
}: {
  rows: DeptRating[];
  busy: boolean;
  canContinue: boolean;
  onRate: (idx: number, rating: number) => void;
  onComment: (idx: number, comment: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-extrabold text-[var(--xxii-text)]">
          What needs attention?
        </h2>
        <p className="mt-1 text-sm text-[var(--xxii-muted)]">
          Please rate each department
        </p>
      </div>
      {rows.map((row, idx) => (
        <DeptRow
          key={row.department}
          department={row.department}
          rating={row.rating}
          comment={row.comment}
          idx={idx}
          busy={busy}
          onRate={onRate}
          onComment={onComment}
        />
              ))}
              <button
                type="button"
        disabled={busy || !canContinue}
        onClick={onContinue}
        className={btnClass}
              >
                Continue
              </button>
    </div>
  );
});

const CommentStep = memo(function CommentStep({
  value,
  error,
  busy,
  canSubmit,
  onChange,
  onSubmit,
  onBack,
}: {
  value: string;
  error: string | null;
  busy: boolean;
  canSubmit: boolean;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
              <div className="text-center">
        <h2 className="text-lg font-extrabold text-[var(--xxii-text)]">
          Tell us more
        </h2>
        <p className="mt-1 text-sm text-[var(--xxii-muted)]">
                  A short comment is required for low ratings
                </p>
              </div>
              <textarea
        value={value}
        disabled={busy}
        onChange={onChange}
                rows={5}
                placeholder="What happened? How can we help?"
        className="w-full rounded-xl border border-[var(--xxii-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--xxii-blue)] disabled:opacity-60"
              />
      {error && <p className="text-sm text-[var(--xxii-risk)]">{error}</p>}
      <div className="space-y-1">
              <button
                type="button"
          disabled={busy || !canSubmit}
          onClick={onSubmit}
          className={btnClass}
        >
          {busy ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </span>
          ) : (
            "Submit feedback"
          )}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className="w-full py-2 text-sm font-semibold text-[var(--xxii-muted)] disabled:opacity-40"
        >
          Back
        </button>
      </div>
    </div>
  );
});

const ResolutionStep = memo(function ResolutionStep({
  firstName,
  ratings,
  comment,
  busy,
  canSubmit,
  error,
  onRate,
  onComment,
  onSubmit,
}: {
  firstName: string;
  ratings: ResolutionRatings;
  comment: string;
  busy: boolean;
  canSubmit: boolean;
  error: string | null;
  onRate: (key: keyof ResolutionRatings, rating: number) => void;
  onComment: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[var(--xxii-text)]">
          Hi {firstName}
        </h1>
        <p className="mt-1 text-sm text-[var(--xxii-muted)]">
          Your recent issue was marked resolved. How did we do?
        </p>
      </div>
      <div className="space-y-4">
        {RESOLUTION_ASPECTS.map((aspect) => (
          <div key={aspect.key}>
            <p className="mb-2 text-sm font-semibold text-[var(--xxii-text)]">
              {aspect.label}
            </p>
            <div className="flex gap-1.5">
              {STAR_VALUES.map((n) => (
                <motion.button
                  key={n}
                  type="button"
                  whileTap={busy ? undefined : smallStarTap}
                  disabled={busy}
                  onClick={() => onRate(aspect.key, n)}
                  className="disabled:pointer-events-none disabled:opacity-50"
                  aria-label={`${aspect.label} ${n} stars`}
                >
                  <Star
                    size={28}
                    className={
                      ratings[aspect.key] >= n ? starFilled : starEmpty
                    }
                  />
                </motion.button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <textarea
        value={comment}
        disabled={busy}
        onChange={onComment}
        placeholder="Optional comment…"
        className="w-full rounded-xl border border-[var(--xxii-line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--xxii-blue)] disabled:opacity-60"
        rows={3}
      />
      {error ? (
        <p className="text-sm font-medium text-rose-600">{error}</p>
      ) : null}
      <button
        type="button"
        disabled={busy || !canSubmit}
        onClick={onSubmit}
        className={btnClass}
      >
        Submit
      </button>
    </div>
  );
});

const ThanksHigh = memo(function ThanksHigh({
  googleUrl,
}: {
  googleUrl: string | null;
}) {
  return (
    <div className="space-y-4 py-6 text-center">
      <CheckCircle2 className="mx-auto text-[var(--xxii-good)]" size={48} />
      <h2 className="text-xl font-extrabold text-[var(--xxii-text)]">
        Thank you!
      </h2>
      <p className="text-sm text-[var(--xxii-muted)]">
        We&apos;re glad things are going well. Would you leave us a public
        review?
              </p>
              {googleUrl && (
                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noreferrer"
          className={`inline-flex items-center justify-center ${btnClass}`}
                >
                  Leave a Google Review
                </a>
              )}
    </div>
  );
});

const ThanksLow = memo(function ThanksLow() {
  return (
    <div className="space-y-4 py-6 text-center">
      <CheckCircle2 className="mx-auto text-[var(--xxii-good)]" size={48} />
      <h2 className="text-xl font-extrabold text-[var(--xxii-text)]">
        Thank you!
      </h2>
      <p className="text-sm text-[var(--xxii-muted)]">
                Your feedback was received. Our team will follow up.
              </p>
    </div>
  );
});

const ThanksResolution = memo(function ThanksResolution() {
  return (
    <div className="space-y-4 py-6 text-center">
      <CheckCircle2 className="mx-auto text-[var(--xxii-good)]" size={48} />
      <h2 className="text-xl font-extrabold text-[var(--xxii-text)]">
        Thank you!
      </h2>
      <p className="text-sm text-[var(--xxii-muted)]">
        Your resolution feedback was received.
      </p>
    </div>
  );
});

const PreviewBanner = memo(function PreviewBanner() {
  return (
    <div className="bg-[color-mix(in_oklch,var(--xxii-warn)_16%,white)] px-4 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--xxii-warn)]">
      Preview only — nothing is saved
    </div>
  );
});

const SurveyHeader = memo(function SurveyHeader() {
  return (
    <div className="border-b border-[var(--xxii-line)] bg-[linear-gradient(135deg,var(--xxii-blue-soft),white_70%)] px-5 py-4 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,color-mix(in_oklch,var(--xxii-blue)_70%,oklch(0.72_0.12_230)),var(--xxii-blue))] text-[10px] font-extrabold tracking-wider text-white shadow-md shadow-[color-mix(in_oklch,var(--xxii-blue)_25%,transparent)]">
        XXII
      </div>
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--xxii-muted)]">
        Driver Feedback
      </div>
    </div>
  );
});

const LoadingBlock = memo(function LoadingBlock({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--xxii-blue)]" />
      <div>
        <p className="text-sm font-bold text-[var(--xxii-text)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--xxii-muted)]">{subtitle}</p>
      </div>
    </div>
  );
});

const Shell = memo(function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={shellStyle}
    >
      <motion.div
        className="w-full max-w-[390px] overflow-hidden rounded-[28px] bg-[var(--xxii-card)] shadow-xl shadow-[color-mix(in_oklch,var(--xxii-blue)_12%,transparent)] ring-1 ring-[var(--xxii-line)]"
        initial={shellInitial}
        animate={shellAnimate}
        transition={shellTransition}
      >
        {children}
      </motion.div>
    </div>
  );
});
