/**
 * Formato válido de teléfono español: móvil (6/7) o fijo (8/9), 9 dígitos,
 * con o sin prefijo +34/0034. No comprueba que el número exista de verdad
 * (para eso hay que llamar) — solo que tiene una forma plausible, para
 * detectar de un vistazo un dato mal extraído (p. ej. un NIF confundido con
 * teléfono al scrapear).
 */
export function isValidSpanishPhone(raw: string): boolean {
  if (!raw) return true; // vacío no es "inválido", es "sin dato" — se trata aparte
  const digits = raw.replace(/[^\d]/g, "").replace(/^0034|^34/, "");
  return /^[6789]\d{8}$/.test(digits);
}

/** Móvil español (empieza por 6 o 7) — suele ser un autónomo y admite WhatsApp. */
export function isSpanishMobile(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, "").replace(/^0034|^34/, "");
  return /^[67]\d{8}$/.test(digits);
}

/** Enlace wa.me con un mensaje ya escrito, para abrir el chat desde la ficha. */
export function whatsappLink(raw: string, message: string): string {
  const digits = raw.replace(/[^\d]/g, "").replace(/^0034|^34/, "");
  return `https://wa.me/34${digits}?text=${encodeURIComponent(message)}`;
}
