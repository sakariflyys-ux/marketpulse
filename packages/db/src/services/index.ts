/**
 * User-data services (folders, saved items). Unlike the repositories these
 * are not data-source abstractions — they are the app's own tables — and are
 * shared by the API routes, the MCP `save_to_folder` tool and server pages.
 */
export * from "./errors";
export * from "./folders";
export * from "./saved";
export * from "./ingest";
