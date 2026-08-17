"use server";

import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (!token) redirect("/forgot-password");

  if (password.length < 8) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=short`);
  }
  if (password !== confirm) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=mismatch`);
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=expired`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    // Un solo uso: se marca gastado incluso si algo más falla después, para
    // no dejarlo reutilizable.
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  redirect("/login?reset=1");
}
