import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: unknown, fallbackStatus = 500) {
  const err = error as Error & { status?: number; code?: string };
  return NextResponse.json(
    { ok: false, error: err.message || "Server error", code: err.code },
    { status: err.status || fallbackStatus }
  );
}
