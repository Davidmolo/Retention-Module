import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DriverDetailClient } from "@/components/admin/DriverDetailClient";
import { getDriverDetail } from "@/lib/retention/service";

export const dynamic = "force-dynamic";

export default async function DriverDetailPage({
  params,
}: {
  params: Promise<{ driverId: string }>;
}) {
  const { driverId } = await params;
  try {
    const data = await getDriverDetail(driverId);
    return (
      <AdminShell>
        <DriverDetailClient data={data} />
      </AdminShell>
    );
  } catch {
    notFound();
  }
}
