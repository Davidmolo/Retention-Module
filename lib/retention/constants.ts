/** Max automated SMS reminders after the initial survey send (docs: up to 3). */
export const MAX_SURVEY_REMINDERS = 3;

/** Days between reminder touches (and before non_response close). */
export const SURVEY_REMINDER_AFTER_DAYS = 3;

/**
 * Delay between cadence survey SMS sends so all drivers are not messaged at once.
 * Override with RETENTION_SEND_STAGGER_MS.
 */
export const DEFAULT_SEND_STAGGER_MS = 5_000;

/**
 * After OpenRoad reactivates a driver (vacation / suspended→active), wait this
 * many days before automated surveys — same idea as new-hire eligibility (7d).
 */
export const POST_RETURN_SURVEY_GRACE_DAYS = 7;

export const RESOLUTION_ASPECTS = [
  { key: "quickly", label: "How quickly was the issue resolved?" },
  { key: "efficiently", label: "How efficiently was it handled?" },
  { key: "effectively", label: "How effectively was the problem fixed?" },
] as const;

export type ResolutionAspectKey = (typeof RESOLUTION_ASPECTS)[number]["key"];

export type ResolutionFeedback = {
  quickly: number;
  efficiently: number;
  effectively: number;
};
