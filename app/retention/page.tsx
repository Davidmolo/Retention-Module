import { RetentionHome } from "@/components/admin/RetentionHome";
import { parseRetentionView, type RetentionView } from "@/lib/retention/viewNav";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RetentionPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {};
  const raw = sp.view;
  const viewParam = Array.isArray(raw) ? raw[0] : raw;
  const initialView: RetentionView = parseRetentionView(
    viewParam ? `?view=${viewParam}` : ""
  );

  return <RetentionHome initialView={initialView} />;
}
