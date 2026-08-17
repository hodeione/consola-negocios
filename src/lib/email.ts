import { Resend } from "resend";

/**
 * Envío de email con degradación segura: si no hay proveedor configurado
 * (RESEND_API_KEY), no falla — registra el contenido en el log del servidor
 * y sigue. Así el resto de la funcionalidad (recuperar contraseña,
 * recordatorios) se puede construir y probar en local antes de tener una
 * cuenta de Resend, y activarla en producción es solo poner la env var.
 */
export interface SendEmailResult {
  sent: boolean;
  reason?: string;
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.log(
      `[email] RESEND_API_KEY/RESEND_FROM_EMAIL no configurados — no se envía. ` +
        `Para: ${opts.to} · Asunto: ${opts.subject}\n${opts.html}`
    );
    return { sent: false, reason: "NOT_CONFIGURED" };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html });
    if (error) {
      console.error("[email] Resend devolvió error:", error);
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] Fallo enviando email:", err);
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Plantilla base — un solo estilo para todos los correos de la consola. */
export function emailShell(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #0a0e14; padding: 32px 16px;">
      <div style="max-width: 480px; margin: 0 auto; background: #121822; border: 1px solid #232e3d; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #3b82f6, #4f46e5); padding: 20px 24px;">
          <span style="color: #fff; font-size: 15px; font-weight: 600;">Consola de negocios</span>
        </div>
        <div style="padding: 24px; color: #e8edf4;">
          <h1 style="font-size: 18px; margin: 0 0 16px; color: #e8edf4;">${title}</h1>
          ${bodyHtml}
        </div>
      </div>
    </div>
  `;
}
