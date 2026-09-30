import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import {
  createCompanyUpdate,
  listCompanyUpdates,
} from '@/lib/companyUpdates';
import { isAdminRole } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden' },
      { status: 403 }
    );
  }
  const updates = await listCompanyUpdates();
  return NextResponse.json({ ok: true, updates });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden — admin access required' },
      { status: 403 }
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
    const update = await createCompanyUpdate({
      title: String(body.title || ''),
      summary: String(body.summary || ''),
      tag: body.tag,
      publishedOn:
        body.publishedOn || new Date().toISOString().slice(0, 10),
      createdBy: user.id,
    });
    return NextResponse.json({ ok: true, update });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'Could not create update' },
      { status: 400 }
    );
  }
}
