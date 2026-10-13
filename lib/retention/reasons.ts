/**
 * Reasons / Feedback Summary — all negative driver feedback for admins.
 */
import { getGpAdapter } from "@/lib/adapters/gp";
import { DEPARTMENTS, type Department } from "./types";
import { retentionStore } from "./store";
import { isRetentionExcludedDriverId } from "./rosterExclusions";

export type NegativeFeedbackItem = {
  id: string;
  responseId: string;
  driverId: string;
  driverName: string;
  dispatcher: string;
  submittedAt: string;
  overallRating: number;
  /** Where the low score / comment came from. */
  scope: "overall" | Department;
  rating: number;
  comment: string;
  caseStatus: string | null;
  atRisk: boolean;
};

export type ReasonsSummary = {
  totals: {
    negativeResponses: number;
    withComments: number;
    openAtRisk: number;
    byDepartment: { department: string; count: number }[];
  };
  items: NegativeFeedbackItem[];
};

function isLow(n: number | null | undefined): boolean {
  return typeof n === "number" && n >= 1 && n <= 3;
}

export async function getReasonsSummary(): Promise<ReasonsSummary> {
  const [responses, cases, drivers] = await Promise.all([
    retentionStore.listSurveyResponses(),
    retentionStore.listRetentionCases(),
    getGpAdapter().listDrivers({ includeInactive: true }),
  ]);

  const driverById = new Map(
    drivers
      .filter((d) => !isRetentionExcludedDriverId(d.id))
      .map((d) => [String(d.id), d])
  );

  const caseByDriver = new Map<string, (typeof cases)[0]>();
  for (const c of cases) {
    const existing = caseByDriver.get(c.driverId);
    if (!existing) {
      caseByDriver.set(c.driverId, c);
      continue;
    }
    // Prefer open/at-risk over resolved for badge.
    const open =
      c.status !== "Resolved" && c.status !== "Completed" ? c : existing;
    caseByDriver.set(c.driverId, open);
  }

  const items: NegativeFeedbackItem[] = [];
  const deptCounts: Record<string, number> = Object.fromEntries(
    DEPARTMENTS.map((d) => [d, 0])
  );
  let negativeResponses = 0;
  let withComments = 0;
  const openAtRiskDrivers = new Set<string>();

  for (const r of responses) {
    if (isRetentionExcludedDriverId(r.driverId)) continue;
    const driver = driverById.get(String(r.driverId));
    if (!driver) continue;

    const lowDepts = (r.departmentFeedback || []).filter((d) =>
      isLow(d.rating)
    );
    const overallLow = isLow(r.overallRating);
    if (!overallLow && !lowDepts.length) continue;

    negativeResponses += 1;
    const openCase = caseByDriver.get(r.driverId);
    const atRisk =
      Boolean(openCase?.atRisk) ||
      (openCase != null &&
        openCase.status !== "Resolved" &&
        openCase.status !== "Completed");
    if (atRisk) openAtRiskDrivers.add(String(r.driverId));

    const base = {
      responseId: r.id,
      driverId: String(r.driverId),
      driverName: driver.name || String(r.driverId),
      dispatcher: driver.dispatcher || "—",
      submittedAt: r.submittedAt,
      overallRating: r.overallRating,
      caseStatus: openCase?.status || null,
      atRisk,
    };

    let addedComment = false;

    if (overallLow) {
      const comment = String(r.generalComment || "").trim();
      if (comment) addedComment = true;
      items.push({
        ...base,
        id: `${r.id}:overall`,
        scope: "overall",
        rating: r.overallRating,
        comment,
      });
    }

    for (const d of lowDepts) {
      deptCounts[d.department] = (deptCounts[d.department] || 0) + 1;
      const comment =
        String(d.comment || "").trim() ||
        (!overallLow ? String(r.generalComment || "").trim() : "");
      if (comment) addedComment = true;
      items.push({
        ...base,
        id: `${r.id}:${d.department}`,
        scope: d.department as Department,
        rating: d.rating,
        comment,
      });
    }

    if (addedComment) withComments += 1;
  }

  items.sort(
    (a, b) =>
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  return {
    totals: {
      negativeResponses,
      withComments,
      openAtRisk: openAtRiskDrivers.size,
      byDepartment: DEPARTMENTS.map((department) => ({
        department,
        count: deptCounts[department] || 0,
      })),
    },
    items,
  };
}
