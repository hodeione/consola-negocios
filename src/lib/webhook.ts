/**
 * Webhook saliente genérico — para que el usuario conecte esto con Zapier,
 * Make, n8n o lo que use, con su propia cuenta. No necesita que nosotros
 * demos de alta nada: solo hay que poner la URL que el usuario ya tenga
 * (p. ej. el trigger "Webhooks by Zapier" de su cuenta) en la env var
 * OUTBOUND_WEBHOOK_URL. Sin esa env var, no hace nada — igual que el email.
 */
export async function sendOutboundWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  const url = process.env.OUTBOUND_WEBHOOK_URL;
  if (!url) {
    console.log(`[webhook] OUTBOUND_WEBHOOK_URL no configurado — no se envía. Evento: ${event}`, payload);
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...payload, sentAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error(`[webhook] Fallo enviando el evento ${event}:`, err);
  }
}
