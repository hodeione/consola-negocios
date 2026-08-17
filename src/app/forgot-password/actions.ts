"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/email";

async function currentOrigin(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function forgotPasswordAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    // Solo se genera y envía el enlace si el usuario existe y está activo,
    // pero SIEMPRE se redirige al mismo "enviado" — así no se puede usar
    // este formulario para averiguar qué emails están dados de alta.
    if (user && user.active) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

      const link = `${await currentOrigin()}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: "Restablecer tu contraseña — Consola de negocios",
        html: emailShell(
          "Restablecer contraseña",
          `
            <p style="color:#93a3b8; font-size:14px; line-height:1.6;">
              Pediste restablecer tu contraseña. Este enlace caduca en 1 hora y solo funciona una vez.
            </p>
            <a href="${link}" style="display:inline-block; margin-top:14px; background:#2563eb; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:600;">
              Elegir nueva contraseña
            </a>
            <p style="color:#57647a; font-size:12px; margin-top:18px;">Si no has sido tú, ignora este correo — tu contraseña actual sigue siendo válida.</p>
          `
        ),
      });
    }
  }

  redirect("/forgot-password?sent=1");
}
