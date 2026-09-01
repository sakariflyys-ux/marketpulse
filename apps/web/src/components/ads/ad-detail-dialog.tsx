"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCompact, formatCurrency, formatDate } from "@/lib/format";
import type { Serialized } from "@/lib/serialize";
import type { AdSummary } from "@marketpulse/db/repositories";

import { PlatformBadge } from "./platform-badge";

export type AdRowData = Serialized<AdSummary>;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function AdDetailDialog({ ad, onClose }: { ad: AdRowData | null; onClose: () => void }) {
  const audience = ad?.targetAudience;
  return (
    <Dialog open={ad !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {ad ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <PlatformBadge platform={ad.platform} />
                <span className="text-xs text-muted-foreground">{formatDate(ad.createdAt)}</span>
              </div>
              <DialogTitle className="pr-6 leading-snug">{ad.headline}</DialogTitle>
              <DialogDescription>
                by{" "}
                <Link
                  href={`/store/${encodeURIComponent(ad.store.shopifyDomain)}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {ad.store.name}
                </Link>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 sm:grid-cols-[240px_1fr]">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                <Image
                  src={ad.creativeUrl}
                  alt=""
                  fill
                  sizes="240px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="flex flex-col gap-4">
                <p className="text-sm leading-relaxed">{ad.bodyText}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Engagement rate" value={`${ad.engagementRate.toFixed(2)}%`} />
                  <Stat label="Spend estimate" value={formatCurrency(ad.spendEstimate)} />
                  <Stat label="Impressions" value={formatCompact(ad.impressions)} />
                  <Stat label="Call to action" value={ad.cta} />
                </div>
                {audience ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Target audience</p>
                    <div className="flex flex-wrap gap-1.5">
                      {audience.ageRange ? (
                        <Badge variant="secondary">Age {audience.ageRange}</Badge>
                      ) : null}
                      {audience.gender ? (
                        <Badge variant="secondary">{audience.gender}</Badge>
                      ) : null}
                      {audience.countries?.map((c) => (
                        <Badge key={c} variant="outline">
                          {c}
                        </Badge>
                      ))}
                      {audience.interests?.map((i) => (
                        <Badge key={i} variant="outline" className="text-muted-foreground">
                          {i}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-auto flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/store/${encodeURIComponent(ad.store.shopifyDomain)}`}>
                      View store
                      <ExternalLink />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
