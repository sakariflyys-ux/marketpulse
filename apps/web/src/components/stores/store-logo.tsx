import Image from "next/image";

import { cn } from "@/lib/utils";

export function StoreLogo({
  src,
  name,
  size = 40,
  className,
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-xs font-semibold text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // Logos are external SVGs (DiceBear); unoptimized skips the image
        // optimizer, which doesn't handle SVG without extra config.
        <Image src={src} alt="" width={size} height={size} unoptimized />
      ) : (
        initials
      )}
    </span>
  );
}
