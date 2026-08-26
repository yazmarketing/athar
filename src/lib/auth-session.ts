import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { resolveDbUserId } from "@/lib/auth-users";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const dbId = await resolveDbUserId(session.user);
  if (dbId) session.user.id = dbId;
  return session.user;
}
