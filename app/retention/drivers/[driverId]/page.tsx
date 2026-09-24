import { DriverDetailClient } from "@/components/admin/DriverDetailClient";

/** Pass id only — client fetches detail so navigation isn't blocked on RSC data. */
export default async function DriverDetailPage({
  params,
}: {
  params: Promise<{ driverId: string }>;
}) {
  const { driverId } = await params;
  return <DriverDetailClient driverId={driverId} />;
}
