// Prisma 7 config. The datasource URL lives here (not in schema.prisma) and is
// only needed by the CLI (migrate/studio). The runtime client gets its
// connection from src/client.ts via the pg driver adapter.
import "./src/load-env";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
