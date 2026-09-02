"use client";

import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact, formatCurrency, formatDate, formatShortDate } from "@/lib/format";

type Point = { capturedAt: string; value: number | null };

/**
 * Single-series line over snapshot history. One axis, thin line, crosshair
 * tooltip; the title above names the series so no legend is needed. Points
 * with a null value are dropped, never zero-filled.
 */
/**
 * Server pages choose the formatter by name: functions cannot cross the
 * server/client boundary.
 */
export function RevenueChart({
  data,
  formatAs = "currency",
}: {
  data: Point[];
  formatAs?: "currency" | "compact";
}) {
  const format = formatAs === "compact" ? formatCompact : formatCurrency;
  const points = React.useMemo(
    () =>
      data
        .filter((p): p is { capturedAt: string; value: number } => p.value !== null)
        .map((p) => ({ t: new Date(p.capturedAt).getTime(), revenue: p.value })),
    [data],
  );

  if (points.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Not enough history to chart yet.
      </div>
    );
  }

  return (
    <div className="h-64 w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => formatShortDate(new Date(v))}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tick={{ fill: "var(--muted-foreground)" }}
          />
          <YAxis
            width={56}
            tickFormatter={(v: number) => format(v)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { t: number; revenue: number } | undefined;
              if (!active || !p) return null;
              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
                  <p className="text-muted-foreground">{formatDate(new Date(p.t))}</p>
                  <p className="font-semibold tabular-nums">{format(p.revenue)}</p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
