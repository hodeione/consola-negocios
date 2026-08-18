/**
 * Clave de deduplicación de un negocio: web normalizada, o "tel|nombre" si
 * no tiene web. Única por `ownerId` (ver `Business.dedupeKey` en el schema).
 */
export function normalizeWebsite(website: string): string {
  if (!website) return "";
  let w = website.trim().toLowerCase();
  w = w.replace(/^https?:\/\//, "");
  w = w.replace(/^www\./, "");
  w = w.split(/[?#]/)[0];
  w = w.replace(/\/+$/, "");
  return w;
}

/**
 * "+34 923 22 35 49" y "923 22 35 49" son el mismo número, pero sin quitar
 * el prefijo de país generaban claves distintas y dejaban colar duplicados
 * (encontrado el 18 ago 2026 al revisar duplicados tras una importación
 * masiva — 6 negocios reales duplicados solo por esto).
 */
function normalizePhoneForKey(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0034")) digits = digits.slice(4);
  else if (digits.startsWith("34") && digits.length === 11) digits = digits.slice(2);
  return digits;
}

function normalizeNameForKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildDedupeKey(opts: { website: string; phone: string; name: string }): string {
  const web = normalizeWebsite(opts.website);
  if (web) return `web:${web}`;

  const phone = normalizePhoneForKey(opts.phone);
  if (phone) return `tel:${phone}`;

  // Último recurso: sin web ni teléfono, usamos el nombre (puede colisionar
  // entre negocios homónimos en zonas distintas, aceptable como fallback).
  return `name:${normalizeNameForKey(opts.name)}`;
}
