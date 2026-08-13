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

function normalizePhoneForKey(phone: string): string {
  return phone.replace(/\D/g, "");
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
