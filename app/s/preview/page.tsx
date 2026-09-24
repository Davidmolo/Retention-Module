import { Suspense } from "react";
import { DEPARTMENTS, GOOGLE_REVIEW_URL } from "@/lib/retention/types";
import { SurveyClient } from "../[token]/SurveyClient";

/** TEMP: demo-only survey UI — remove app/s/preview + driver-detail Preview button after review. */
export default async function SurveyPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; driverId?: string }>;
}) {
  const params = await searchParams;
  const name = String(params.name || "Driver").trim() || "Driver";
  const driverId = String(params.driverId || "preview").trim() || "preview";
  const firstName = name.split(/\s+/)[0] || "Driver";

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
          Loading survey…
        </div>
      }
    >
      <SurveyClient
        token="preview"
        previewSession={{
          driver: { id: driverId, name, firstName },
          departments: DEPARTMENTS,
          googleReviewUrl: GOOGLE_REVIEW_URL,
        }}
      />
    </Suspense>
  );
}
