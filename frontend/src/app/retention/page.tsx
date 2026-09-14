import { AdminShell } from "@/components/admin/AdminShell";
import { RetentionDashboard } from "@/components/admin/RetentionDashboard";
import { getOverview } from "@/lib/retention/service";

export const dynamic = "force-dynamic";

export default async function RetentionPage() {
  const data = await getOverview();
  return (
    <AdminShell>
      <RetentionDashboard data={data} />
    </AdminShell>
  );
}
