import { auth } from "@/lib/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user) return null;
  return session.user;
}

/** Como requireUser(), pero además exige rol ADMIN. */
export async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "ADMIN") return null;
  return user;
}
