/**
 * Repository results carry `Date`s; once they cross into client components or
 * come back from the JSON API they are ISO strings. `Serialized<T>` is the
 * shape client code works with, and `serialize()` converts server data into
 * exactly what `fetch('/api/…').json()` would return, so both paths match.
 */
export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export function serialize<T>(value: T): Serialized<T> {
  return JSON.parse(JSON.stringify(value)) as Serialized<T>;
}
