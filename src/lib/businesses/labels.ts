export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  NO_ANSWER: "No contesta",
  CALLBACK_LATER: "Llamar más tarde",
  INTERESTED: "Interesado",
  NOT_INTERESTED: "No interesado",
  CUSTOMER: "Cliente",
  INVALID_NUMBER: "Nº inválido",
};

// Fondo translúcido + texto claro + borde a juego: más sobrio que un fill
// sólido y funciona bien sobre las superficies con blur del resto de la UI.
export const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-slate-500/10 text-slate-300 border border-slate-500/20",
  NO_ANSWER: "bg-amber-500/10 text-amber-300 border border-amber-500/20",
  CALLBACK_LATER: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
  INTERESTED: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
  NOT_INTERESTED: "bg-red-500/10 text-red-300 border border-red-500/20",
  CUSTOMER: "bg-purple-500/10 text-purple-300 border border-purple-500/20",
  INVALID_NUMBER: "bg-slate-500/10 text-slate-500 border border-slate-500/20",
};

export const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
};

export const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-slate-500/10 text-slate-300 border border-slate-500/20",
  MEDIUM: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
  HIGH: "bg-red-500/10 text-red-300 border border-red-500/20",
};

export const STATUS_OPTIONS = Object.keys(STATUS_LABEL);
export const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABEL);

// Catálogo real de productos vendidos desde la consola.
export const PRODUCT_LABEL: Record<string, string> = {
  LANDING: "Landing page",
  SEO: "SEO",
  ECOMMERCE: "E-commerce",
  SAAS: "SaaS",
  CUSTOM: "A medida",
  OTHER: "Otro",
};
export const PRODUCT_OPTIONS = Object.keys(PRODUCT_LABEL);

// Auditoría: etiqueta legible para cada tipo de evento de AuditLog.
/** % de campos "de scraping" rellenos — para priorizar qué fichas enriquecer. */
export function completenessScore(b: {
  address: string;
  mapsPhone: string;
  website: string;
  emails: string[];
  webPhones: string[];
  category: string;
  rating: number;
}): number {
  const checks = [
    !!b.address,
    !!b.mapsPhone || b.webPhones.length > 0,
    !!b.website,
    b.emails.length > 0,
    !!b.category,
    b.rating > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  reassigned: "Reasignado",
  priority_changed: "Prioridad cambiada",
  status_changed: "Estado cambiado",
  tags_changed: "Etiquetas cambiadas",
  flagged_incorrect: "Marcado como dato incorrecto",
  unflagged_incorrect: "Desmarcado",
};
