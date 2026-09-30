import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import {
  deleteCompanyUpdate,
  updateCompanyUpdate,
} from '@/lib/companyUpdates';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const user = await getAuthUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden' },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const updateId = Number(id);
  if (!Number.isFinite(updateId) || updateId <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Invalid id' },
      { status: 400 }
    );
  }

  let body: {
    title?: string;
    summary?: string;
    tag?: string;
    publishedOn?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  try {
    const update = await updateCompanyUpdate({
      id: updateId,
      title: String(body.title || ''),
      summary: String(body.summary || ''),
      tag: body.tag,
      publishedOn:
        body.publishedOn || new Date().toISOString().slice(0, 10),
    });
    if (!update) {
      return NextResponse.json(
        { ok: false, error: 'Update not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, update });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'Could not update' },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const user = await getAuthUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden' },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const updateId = Number(id);
  if (!Number.isFinite(updateId) || updateId <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Invalid id' },
      { status: 400 }
    );
  }

  const ok = await deleteCompanyUpdate(updateId);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: 'Update not found' },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
