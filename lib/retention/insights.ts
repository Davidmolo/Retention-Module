/**
 * Responses-page department rating averages + bad-feedback summaries.
 */
import { getGpAdapter } from "@/lib/adapters/gp";
import { DEPARTMENTS, type Department } from "./types";
import { retentionStore } from "./store";

export type DepartmentAvg = {
  department: Department;
  average: number | null;
  count: number;
  lowCount: number;
};

/** Low-rating comment sample — includes assigned dispatcher for Dispatch (and context). */
export type InsightComment = {
  text: string;
  /** Driver’s OpenRoad manager / dispatcher at time of lookup. */
  dispatcher: string | null;
  driverId: string;
  driverName: string | null;
};

export type DepartmentInsight = {
  department: Department;
  average: number | null;
  count: number;
  lowCount: number;
  summary: string;
  highlights: string[];
  sampleComments: InsightComment[];
};

export type ResponsesInsights = {
  month: string | null;
  monthsAvailable: string[];
  totalAverage: number | null;
  totalRated: number;
  departments: DepartmentInsight[];
  aiUsed: boolean;
};

function monthKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function heuristicSummary(
  department: Department,
  comments: string[],
  lowCount: number
): { summary: string; highlights: string[] } {
  const cleaned = comments
    .map((c) => c.trim())
    .filter((c) => c.length > 3)
    .slice(0, 12);
  if (!cleaned.length) {
    return {
      summary:
        lowCount > 0
          ? `${department} has ${lowCount} low rating(s) (≤3★) in this period, but no written comments.`
          : `No low ratings or comments for ${department} in this period.`,
      highlights: [],
    };
  }

  const blob = cleaned.join(" ").toLowerCase();
  const themes: { key: string; label: string; re: RegExp }[] = [
    { key: "communication", label: "Communication gaps", re: /communicat|call|text|respond|reply|update/ },
    { key: "pay", label: "Pay / settlements", re: /pay|payroll|settle|money|deduct|advance/ },
    { key: "dispatch", label: "Dispatch / loads", re: /dispatch|load|freight|route|home time|home-time/ },
    { key: "safety", label: "Safety / compliance", re: /safety|hos|log|dot|inspection/ },
    { key: "maintenance", label: "Equipment / maintenance", re: /truck|trailer|shop|repair|breakdown|maintenance/ },
    { key: "respect", label: "Respect / treatment", re: /respect|rude|attitude|treat|listen/ },
    { key: "support", label: "Support / follow-up", re: /support|help|follow.?up|ignore/ },
  ];
  const hits = themes.filter((t) => t.re.test(blob)).map((t) => t.label);
  const highlights = hits.slice(0, 4);
  const summary =
    `${department}: ${lowCount} low rating(s) with ${cleaned.length} comment(s). ` +
    (highlights.length
      ? `Recurring themes: ${highlights.join("; ")}.`
      : "Comments are varied — review samples below.");
  return { summary, highlights };
}

async function aiSummarizeDepartment(
  department: Department,
  comments: string[]
): Promise<{ summary: string; highlights: string[] } | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || comments.length === 0) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const prompt =
    `You summarize trucking driver survey feedback for the "${department}" department at XXII Century.\n` +
    `Given the low-rated comments below, return concise JSON only:\n` +
    `{"summary":"2-3 sentences","highlights":["issue 1","issue 2","issue 3"]}\n` +
    `Focus on recurring problems. No fluff.\n\nComments:\n` +
    comments
      .slice(0, 20)
      .map((c, i) => `${i + 1}. ${c}`)
      .join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are an ops analyst summarizing driver complaints.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[retention-insights] openai", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(raw) as {
      summary?: string;
      highlights?: string[];
    };
    return {
      summary: String(parsed.summary || "").trim() || "No summary generated.",
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.map((h) => String(h)).filter(Boolean).slice(0, 5)
        : [],
    };
  } catch (e) {
    console.error("[retention-insights] ai", (e as Error).message);
    return null;
  }
}

export async function getResponsesInsights(opts?: {
  month?: string | null;
}): Promise<ResponsesInsights> {
  const responses = await retentionStore.listSurveyResponses();
  const driverSubmitted = responses.filter(
    (r) => (r.submittedBy || "driver") === "driver"
  );

  const monthsSet = new Set<string>();
  for (const r of driverSubmitted) {
    const k = monthKey(r.submittedAt);
    if (k) monthsSet.add(k);
  }
  const monthsAvailable = [...monthsSet].sort((a, b) => b.localeCompare(a));

  const month =
    opts?.month && /^\d{4}-\d{2}$/.test(opts.month) ? opts.month : null;
  const filtered = month
    ? driverSubmitted.filter((r) => monthKey(r.submittedAt) === month)
    : driverSubmitted;

  let overallSum = 0;
  let overallN = 0;
  const deptSums = Object.fromEntries(
    DEPARTMENTS.map((d) => [d, { sum: 0, n: 0, low: 0 }])
  ) as Record<Department, { sum: number; n: number; low: number }>;
  const deptComments = Object.fromEntries(
    DEPARTMENTS.map((d) => [d, [] as InsightComment[]])
  ) as Record<Department, InsightComment[]>;

  // Resolve each driver’s assigned dispatcher (OpenRoad manager) once.
  const driverIds = [...new Set(filtered.map((r) => String(r.driverId)))];
  const dispatcherByDriver = new Map<
    string,
    { dispatcher: string | null; name: string | null }
  >();
  try {
    const drivers = await getGpAdapter().listDrivers({ includeInactive: true });
    const byId = new Map(drivers.map((d) => [String(d.id), d]));
    for (const id of driverIds) {
      const d = byId.get(id);
      dispatcherByDriver.set(id, {
        dispatcher: d?.dispatcher?.trim() || null,
        name: d?.name?.trim() || null,
      });
    }
  } catch (e) {
    console.error("[retention-insights] driver lookup", (e as Error).message);
  }

  for (const r of filtered) {
    if (r.overallRating >= 1 && r.overallRating <= 5) {
      overallSum += r.overallRating;
      overallN += 1;
    }
    const meta = dispatcherByDriver.get(String(r.driverId));
    for (const d of r.departmentFeedback || []) {
      if (!DEPARTMENTS.includes(d.department as Department)) continue;
      if (!(d.rating >= 1 && d.rating <= 5)) continue;
      const dept = d.department as Department;
      deptSums[dept].sum += d.rating;
      deptSums[dept].n += 1;
      if (d.rating <= 3) {
        deptSums[dept].low += 1;
        const note = [d.comment, r.generalComment]
          .map((x) => (x || "").trim())
          .filter(Boolean)
          .join(" — ");
        if (note) {
          deptComments[dept].push({
            text: note,
            dispatcher: meta?.dispatcher || null,
            driverId: String(r.driverId),
            driverName: meta?.name || null,
          });
        }
      }
    }
  }

  let aiUsed = false;
  const departments: DepartmentInsight[] = [];
  for (const department of DEPARTMENTS) {
    const stats = deptSums[department];
    // Dedupe by comment text + dispatcher so the same complaint isn’t repeated.
    const seen = new Set<string>();
    const comments: InsightComment[] = [];
    for (const c of deptComments[department]) {
      const key = `${c.dispatcher || ""}|${c.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      comments.push(c);
    }
    const commentTexts = comments.map((c) => c.text);
    const average = stats.n > 0 ? round1(stats.sum / stats.n) : null;
    let summaryPack = heuristicSummary(department, commentTexts, stats.low);
    if (commentTexts.length && process.env.OPENAI_API_KEY?.trim()) {
      const ai = await aiSummarizeDepartment(department, commentTexts);
      if (ai) {
        summaryPack = ai;
        aiUsed = true;
      }
    }
    // For Dispatch, surface which dispatcher’s drivers left low ratings.
    if (department === "Dispatch") {
      const names = [
        ...new Set(
          comments
            .map((c) => c.dispatcher)
            .filter((n): n is string => Boolean(n && n !== "Unassigned"))
        ),
      ];
      if (names.length) {
        summaryPack = {
          ...summaryPack,
          summary:
            `${summaryPack.summary} Dispatcher(s) on these low ratings: ${names.join(", ")}.`,
        };
      }
    }
    departments.push({
      department,
      average,
      count: stats.n,
      lowCount: stats.low,
      summary: summaryPack.summary,
      highlights: summaryPack.highlights,
      sampleComments: comments.slice(0, 5),
    });
  }

  return {
    month,
    monthsAvailable,
    totalAverage: overallN > 0 ? round1(overallSum / overallN) : null,
    totalRated: overallN,
    departments,
    aiUsed,
  };
}

export { monthLabel };
