import { ComingSoon } from "@/components/coming-soon";

export const metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <ComingSoon
      title="Discover"
      phase={3}
      summary="A card grid of trending stores with revenue, tech stack and growth indicators."
    />
  );
}
