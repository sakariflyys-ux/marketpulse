-- Full-text search columns.
--
-- WHY raw SQL: Prisma models the column type (`Unsupported("tsvector")`) and the
-- GIN index, but cannot express `GENERATED ALWAYS AS (...) STORED`. A stored
-- generated column keeps the vector in sync on every INSERT/UPDATE with no
-- trigger and no application code. Weights: A = title-ish field, B = body.
-- Queries should use `websearch_to_tsquery('english', $q)` against these columns.

ALTER TABLE "Store"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

ALTER TABLE "Ad"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("headline", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("bodyText", '')), 'B')
  ) STORED;

CREATE INDEX "Store_searchVector_idx" ON "Store" USING GIN ("searchVector");
CREATE INDEX "Ad_searchVector_idx" ON "Ad" USING GIN ("searchVector");
