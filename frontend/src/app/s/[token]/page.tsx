import { SurveyClient } from "./SurveyClient";

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SurveyClient token={token} />;
}
