/**
 * Opaque cursor pagination. Cursors are base64url-encoded JSON; callers never
 * parse them. Two shapes exist:
 *   - keyset `{ v, id }`: the sort value and id of the last row (stable under
 *     inserts, used by list endpoints)
 *   - offset `{ o }`: used by the trending query, whose ranking is computed
 *     over a window and has no natural keyset column
 */

export type Page<T> = { data: T[]; nextCursor: string | null };

export type KeysetCursor = { v: string | number | null; id: string };
export type OffsetCursor = { o: number };

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid pagination cursor");
    this.name = "InvalidCursorError";
  }
}

export function encodeCursor(cursor: KeysetCursor | OffsetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeKeysetCursor(raw: string | undefined): KeysetCursor | null {
  if (!raw) return null;
  const parsed = safeDecode(raw);
  if (
    parsed &&
    typeof parsed === "object" &&
    "id" in parsed &&
    typeof parsed.id === "string" &&
    "v" in parsed &&
    (typeof parsed.v === "string" || typeof parsed.v === "number" || parsed.v === null)
  ) {
    return { v: parsed.v, id: parsed.id };
  }
  throw new InvalidCursorError();
}

export function decodeOffsetCursor(raw: string | undefined): number {
  if (!raw) return 0;
  const parsed = safeDecode(raw);
  if (
    parsed &&
    typeof parsed === "object" &&
    "o" in parsed &&
    typeof parsed.o === "number" &&
    Number.isInteger(parsed.o) &&
    parsed.o >= 0
  ) {
    return parsed.o;
  }
  throw new InvalidCursorError();
}

function safeDecode(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new InvalidCursorError();
  }
}

/** Trim a `limit + 1` result set into a page plus a cursor for the next one. */
export function toPage<T>(
  rows: T[],
  limit: number,
  cursorFor: (last: T) => KeysetCursor | OffsetCursor,
): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return { data, nextCursor: hasMore && last ? encodeCursor(cursorFor(last)) : null };
}
