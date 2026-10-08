/**
 * Parse OpenRoad "Detention completed" email bodies (Art's Apps Script logic ported).
 */
import {
  DEFAULT_RATE_PER_HOUR,
  MIN_BILLABLE_AMOUNT,
  computeAmountFromMins,
} from "@/lib/detention/types";

export type ParsedDetentionEmail = {
  customer: string | null;
  customerEmail: string | null;
  dispatcherHint: string | null;
  loadNumber: string | null;
  shipmentNumber: string | null;
  driverName: string | null;
  driverNumber: string | null;
  truckNumber: string | null;
  stopType: string | null;
  puLocation: string | null;
  puAppt: string | null;
  delLocation: string | null;
  delAppt: string | null;
  arrivalTime: string | null;
  detentionStart: string | null;
  driverDeparture: string | null;
  detentionMins: number | null;
  detentionTimeLabel: string | null;
  ratePerHour: number;
  amount: number;
  loadLink: string | null;
  subject: string;
};

function flatten(text: string): string {
  return String(text || "")
    .replace(/\r/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function grab(flat: string, pattern: RegExp, group = 1): string {
  const m = flat.match(pattern);
  if (!m?.[group]) return "";
  return String(m[group]).trim().replace(/[,;:]+$/, "");
}

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function parseDurationMinutes(raw: string): number {
  const s = flatten(raw).toLowerCase();
  if (!s) return 0;
  const clock = s.match(/^(\d{1,3}):(\d{2})/);
  if (clock) return parseInt(clock[1], 10) * 60 + parseInt(clock[2], 10);

  let total = 0;
  let found = false;
  const days = s.match(/(\d+)\s*(?:days?|d\b)/);
  if (days) {
    total += parseInt(days[1], 10) * 1440;
    found = true;
  }
  const hrs = s.match(/(\d+)\s*(?:hours?|hrs?|h\b)/);
  if (hrs) {
    total += parseInt(hrs[1], 10) * 60;
    found = true;
  }
  const mins = s.match(/(\d+)\s*(?:minutes?|mins?|m\b)/);
  if (mins) {
    total += parseInt(mins[1], 10);
    found = true;
  }
  return found ? total : 0;
}

function formatDuration(minutes: number): string {
  const mins = Number(minutes) || 0;
  if (mins <= 0) return "";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return d + "d" + (h ? " " + h + "h" : "");
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseStamp(raw: string): { display: string; date: Date | null } {
  const s = flatten(raw);
  if (!s) return { display: "", date: null };

  const tzOffsets: Record<string, number> = {
    EST: 5,
    EDT: 4,
    CST: 6,
    CDT: 5,
    MST: 7,
    MDT: 6,
    PST: 8,
    PDT: 7,
    AKST: 9,
    AKDT: 8,
    HST: 10,
    HDT: 9,
    AST: 4,
    ADT: 3,
    UTC: 0,
    GMT: 0,
  };

  let hh = 0;
  let mm = 0;
  let tz = "";
  let y = 0;
  let mo = 0;
  let d = 0;

  let m = s.match(
    /(\d{1,2}):(\d{2})\s*([A-Z]{2,4})?\s*\/\s*(\d{4})-(\d{1,2})-(\d{1,2})/
  );
  if (m) {
    hh = parseInt(m[1], 10);
    mm = parseInt(m[2], 10);
    tz = m[3] || "";
    y = parseInt(m[4], 10);
    mo = parseInt(m[5], 10);
    d = parseInt(m[6], 10);
  } else {
    m = s.match(
      /(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})\s*([A-Z]{2,4})?/
    );
    if (m) {
      y = parseInt(m[1], 10);
      mo = parseInt(m[2], 10);
      d = parseInt(m[3], 10);
      hh = parseInt(m[4], 10);
      mm = parseInt(m[5], 10);
      tz = m[6] || "";
    } else {
      m = s.match(
        /(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})\s*([A-Z]{2,4})?/
      );
      if (!m) return { display: s, date: null };
      mo = parseInt(m[1], 10);
      d = parseInt(m[2], 10);
      y = parseInt(m[3], 10);
      hh = parseInt(m[4], 10);
      mm = parseInt(m[5], 10);
      tz = m[6] || "";
    }
  }

  const offset = Object.prototype.hasOwnProperty.call(tzOffsets, tz)
    ? tzOffsets[tz]
    : null;
  const date =
    offset == null
      ? new Date(y, mo - 1, d, hh, mm, 0)
      : new Date(Date.UTC(y, mo - 1, d, hh + offset, mm, 0));

  const display =
    `${pad(mo)}/${pad(d)}/${y} ${pad(hh)}:${pad(mm)}` + (tz ? ` ${tz}` : "");
  return { display, date };
}

function cleanStop(text: string): string {
  return String(text || "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim()
    .replace(/[,;:]+$/, "");
}

function extractStops(flat: string): { pickup: string; delivery: string } {
  const out = { pickup: "", delivery: "" };
  const marker =
    /\((\d+)\)\s*(Pick\s*-?\s*up|Pickup|Delivery|Deliver|Drop\s*-?\s*off)\s*:\s*/gi;
  const marks: { kind: string; bodyStart: number; markStart: number }[] = [];
  let found: RegExpExecArray | null;
  while ((found = marker.exec(flat)) !== null) {
    marks.push({
      kind: found[2],
      bodyStart: marker.lastIndex,
      markStart: found.index,
    });
  }
  const tail =
    /\s*(?:If you have|Please don|Powered by|Your shipment details|Email\s*:|Phone\s*:)/i;

  if (marks.length) {
    for (let i = 0; i < marks.length; i++) {
      const stopEnd =
        i + 1 < marks.length ? marks[i + 1].markStart : flat.length;
      let text = flat.substring(marks[i].bodyStart, stopEnd);
      const cut = text.search(tail);
      if (cut > -1) text = text.substring(0, cut);
      text = cleanStop(text);
      if (/pick/i.test(marks[i].kind)) {
        if (!out.pickup) out.pickup = text;
      } else {
        out.delivery = text;
      }
    }
    return out;
  }

  out.pickup = cleanStop(
    grab(flat, /Pick\s*-?\s*up\s*:\s*(.+?)\s*(?:Deliver|Drop\s*-?\s*off)/i)
  );
  out.delivery = cleanStop(
    grab(
      flat,
      /Delivery\s*:\s*(.+?)\s*(?:If you have|Please don|Powered by|$)/i
    )
  );
  return out;
}

function extractEmails(headerValue: string): string[] {
  return (
    String(headerValue || "").match(
      /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g
    ) || []
  );
}

function pickCustomerEmail(to: string, cc: string): string | null {
  const ignored = ["openroadtms.com", "amazonses.com", "mimecast.com"];
  const all = extractEmails(`${to}, ${cc}`);
  for (const addr of all) {
    const lower = addr.toLowerCase();
    if (lower.endsWith("@goxxii.com")) continue;
    if (ignored.some((d) => lower.includes(d))) continue;
    return lower;
  }
  return null;
}

function unwrapLoadLink(raw: string | null, html: string): string | null {
  const candidates = [
    raw || "",
    ...Array.from(
      String(html || "").matchAll(/https?:\/\/[^\s"'<>]+/gi),
      (m) => m[0]
    ),
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (/openroadtms\.com/i.test(c) && !/mimecast/i.test(c)) {
      return c.replace(/[),.;]+$/, "");
    }
  }
  const mimecast = candidates.find((c) => /mimecastprotect\.com/i.test(c));
  if (mimecast) {
    try {
      const u = new URL(mimecast);
      const domain = u.searchParams.get("domain");
      if (domain && /openroadtms\.com/i.test(domain)) {
        return `https://${domain}`;
      }
    } catch {
      /* ignore */
    }
    return mimecast.replace(/[),.;]+$/, "");
  }
  return raw?.replace(/[),.;]+$/, "") || null;
}

function shiftDisplay(
  start: { display: string; date: Date | null },
  minutes: number
): string | null {
  if (!start.date || !minutes) return null;
  const end = new Date(start.date.getTime() + minutes * 60_000);
  const mo = end.getUTCMonth() + 1;
  const d = end.getUTCDate();
  const y = end.getUTCFullYear();
  const hh = end.getUTCHours();
  const mm = end.getUTCMinutes();
  // Keep wall-clock style when we only have display; prefer appending from display tz
  const tz = (start.display.match(/\b([A-Z]{2,4})$/) || [])[1] || "";
  if (tz) {
    // Approximate: use local components from original display arithmetic on Date
    const local = new Date(start.date.getTime());
    local.setMinutes(local.getMinutes() + minutes);
    return `${pad(local.getMonth() + 1)}/${pad(local.getDate())}/${local.getFullYear()} ${pad(local.getHours())}:${pad(local.getMinutes())} ${tz}`;
  }
  return `${pad(mo)}/${pad(d)}/${y} ${pad(hh)}:${pad(mm)}`;
}

export function parseOpenRoadDetentionEmail(opts: {
  subject: string;
  plainBody?: string | null;
  htmlBody?: string | null;
  to?: string | null;
  cc?: string | null;
}): ParsedDetentionEmail | null {
  const subject = opts.subject || "";
  let raw = opts.plainBody || "";
  if (!raw && opts.htmlBody) raw = stripHtml(opts.htmlBody);
  const flat = flatten(raw);
  if (!flat.toLowerCase().includes("detention")) return null;

  let customer = grab(flat, /Dear\s+([^,]+),/i) || null;
  const customerEmail = pickCustomerEmail(opts.to || "", opts.cc || "");

  const driverNumber = grab(flat, /driver\s*#\s*(\d+)/i) || null;
  let driverName =
    grab(flat, /driver\s*#\s*\d+\s*\(([^)]+)\)/i) ||
    grab(flat, /our driver\s+([A-Za-z .'-]+?)\s+with Truck/i) ||
    null;
  const truckNumber =
    grab(flat, /with\s+Truck\s*#\s*([A-Za-z0-9-]+)/i) || null;

  let shipmentNumber =
    grab(flat, /Shipment\s*#\s*:\s*([A-Za-z0-9-]+)/i) ||
    grab(flat, /shipment\s*#\s*([A-Za-z0-9-]+)\s*:/i) ||
    null;

  let loadNumber =
    grab(flat, /Load\s+Number\s*:\s*#?\s*([A-Za-z0-9-]+)/i) ||
    grab(subject, /Load\s*#\s*([A-Za-z0-9-]+)/i) ||
    null;

  const loadLinkRaw =
    grab(flat, /Load\s+Number\s*:[^(]*\(\s*(https?:\/\/[^\s)]+)\s*\)/i) ||
    null;
  const loadLink = unwrapLoadLink(loadLinkRaw, opts.htmlBody || "");

  let stopOff =
    grab(flat, /Type of stop-?off\s*:\s*(.+?)\s*Appointment Time/i) ||
    grab(flat, /Type of stop-?off\s*:\s*(.+?)\s*Driver Arrival Time/i) ||
    "";

  const stopType = /pick/i.test(stopOff)
    ? "Pickup"
    : /deliver|drop/i.test(stopOff)
      ? "Delivery"
      : stopOff
        ? stopOff
        : "Unknown";

  const apptFromRaw = grab(
    flat,
    /Appointment Time From\s*:\s*(.+?)\s*Appointment Time To\s*:/i
  );
  const apptToRaw = grab(
    flat,
    /Appointment Time To\s*:\s*(.+?)\s*(?:Driver Arrival Time|Detention start time)\s*:/i
  );
  let apptSingleRaw = "";
  if (!apptFromRaw && !apptToRaw) {
    apptSingleRaw = grab(
      flat,
      /Appointment Time\s*:\s*(.+?)\s*(?:Driver Arrival Time|Detention start time)\s*:/i
    );
  }

  const arrivalRaw = grab(
    flat,
    /Driver Arrival Time\s*:\s*(.+?)\s*Detention start time\s*:/i
  );
  const detStartRaw = grab(
    flat,
    /Detention start time\s*:\s*(.+?)\s*Total time of the detention\s*:/i
  );
  const durationRaw = grab(
    flat,
    /Total time of the detention\s*:\s*(.+?)\s*(?:Your shipment details|Shipment\s*#|$)/i
  );

  const stops = extractStops(flat);
  const driverManager =
    grab(flat, /driver manager\s+([A-Za-z .'-]+?)\s+at\s/i) || null;

  const apptFrom = parseStamp(apptFromRaw);
  const apptTo = parseStamp(apptToRaw);
  const apptSingle = parseStamp(apptSingleRaw);
  const arrival = parseStamp(arrivalRaw);
  const detStart = parseStamp(detStartRaw);

  let apptWindow = "";
  if (apptFrom.display && apptTo.display) {
    apptWindow = `${apptFrom.display} - ${apptTo.display.replace(/^\d{2}\/\d{2}\/\d{4}\s+/, "")}`;
  } else if (apptSingle.display) {
    apptWindow = apptSingle.display;
  } else {
    apptWindow = apptFrom.display || apptTo.display || "";
  }

  const minutes = parseDurationMinutes(durationRaw);
  const ratePerHour = DEFAULT_RATE_PER_HOUR;
  const amount =
    computeAmountFromMins(minutes, ratePerHour) ??
    Math.round(((minutes || 0) / 60) * ratePerHour * 100) / 100;

  if (!customer && customerEmail) {
    const domain = customerEmail.split("@")[1] || "";
    const base = domain.split(".")[0]?.replace(/[-_]/g, " ") || "";
    if (base) {
      customer = base.charAt(0).toUpperCase() + base.slice(1);
    }
  }

  return {
    customer,
    customerEmail,
    dispatcherHint: driverManager,
    loadNumber,
    shipmentNumber,
    driverName,
    driverNumber,
    truckNumber,
    stopType,
    puLocation: stops.pickup || null,
    puAppt: stopType === "Pickup" ? apptWindow || null : null,
    delLocation: stops.delivery || null,
    delAppt: stopType === "Delivery" ? apptWindow || null : null,
    arrivalTime: arrival.display || flatten(arrivalRaw) || null,
    detentionStart: detStart.display || flatten(detStartRaw) || null,
    driverDeparture: shiftDisplay(detStart, minutes),
    detentionMins: minutes || null,
    detentionTimeLabel: formatDuration(minutes) || flatten(durationRaw) || null,
    ratePerHour,
    amount,
    loadLink,
    subject,
  };
}

export function isBelowMinBillable(amount: number): boolean {
  return !Number.isFinite(amount) || amount < MIN_BILLABLE_AMOUNT;
}
