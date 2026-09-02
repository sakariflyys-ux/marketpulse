import "server-only";
import { auth } from "@/auth";
import { ApiError } from "@/lib/api";

/** Resolves the signed-in user's id for route handlers; 401 otherwise. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new ApiError(401, "UNAUTHORIZED", "Sign in to manage folders and saved items");
  return id;
}
