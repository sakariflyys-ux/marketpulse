/**
 * Compact number formatting is implemented by hand rather than with
 * `Intl.NumberFormat({ notation: "compact" })`: Node and Chromium ship
 * different ICU builds and disagree on trailing zeros ("$6.0K" vs "$6K"),
 * which causes React hydration mismatches.
 */
function compactParts(value: number): { num: string; suffix: string } {
  const abs = Math.abs(value);
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [div, suffix] of units) {
    if (abs >= div) {
      const scaled = abs / div;
      const num = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "");
      return { num, suffix };
    }
  }
  return {
    num: abs < 10 && !Number.isInteger(abs) ? abs.toFixed(1) : Math.round(abs).toString(),
    suffix: "",
  };
}

export function formatCurrency(value: number): string {
  const { num, suffix } = compactParts(value);
  return `${value < 0 ? "-" : ""}$${num}${suffix}`;
}

export function formatCompact(value: number): string {
  const { num, suffix } = compactParts(value);
  return `${value < 0 ? "-" : ""}${num}${suffix}`;
}

export function formatPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function formatDate(value: string | Date): string {
  return dateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function formatShortDate(value: string | Date): string {
  return shortDateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

/** Builds a query string from an object, skipping empty values. */
export function toQueryString(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
