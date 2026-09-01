import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Ad Library" };

export default function AdsPage() {
  return (
    <ComingSoon
      title="Ad Library"
      phase={3}
      summary="Searchable, filterable table of ad creatives across Meta, TikTok and Google."
    />
  );
}
