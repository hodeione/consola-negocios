export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  NO_ANSWER: "No contesta",
  CALLBACK_LATER: "Llamar más tarde",
  INTERESTED: "Interesado",
  NOT_INTERESTED: "No interesado",
  CUSTOMER: "Cliente",
  INVALID_NUMBER: "Nº inválido",
};

export const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-slate-700 text-slate-300",
  NO_ANSWER: "bg-amber-900 text-amber-300",
  CALLBACK_LATER: "bg-blue-900 text-blue-300",
  INTERESTED: "bg-emerald-900 text-emerald-300",
  NOT_INTERESTED: "bg-red-900 text-red-300",
  CUSTOMER: "bg-purple-900 text-purple-300",
  INVALID_NUMBER: "bg-slate-800 text-slate-500",
};

export const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
};

export const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-slate-700 text-slate-300",
  MEDIUM: "bg-blue-900 text-blue-300",
  HIGH: "bg-red-900 text-red-300",
};

export const STATUS_OPTIONS = Object.keys(STATUS_LABEL);
export const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABEL);
