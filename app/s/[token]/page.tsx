import { Suspense } from "react";
import { SurveyClient } from "./SurveyClient";

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
          Loading survey…
        </div>
      }
    >
      <SurveyClient token={token} />
    </Suspense>
  );
}
