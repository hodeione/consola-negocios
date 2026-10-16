/**
 * "¿Qué le vendemos a este negocio y cómo?" — recomendación de venta a partir
 * de los datos que ya tenemos (necesidad digital, sector, valoración...).
 *
 * Son reglas, no IA: instantáneo, gratis y predecible. El agente sigue
 * mandando — esto le da un punto de partida y los argumentos ya escritos
 * para no improvisar en la llamada.
 */

// Precios orientativos — cámbialos aquí y se actualizan en toda la consola.
export const PRODUCT_PRICE: Record<string, string> = {
  LANDING: "450 – 900 €",
  SEO: "200 – 400 €/mes",
  ECOMMERCE: "1.200 – 2.500 €",
  SAAS: "40 – 90 €/mes",
  CUSTOM: "desde 2.000 €",
  OTHER: "a consultar",
};

type Sector =
  | "hosteleria"
  | "salud"
  | "deporte"
  | "inmobiliaria"
  | "profesional"
  | "oficio"
  | "comercio"
  | "otro";

// Palabras clave → sector. Manda keyword (lo que se buscó); si no encaja, se
// mira category (lo que pone Google, a veces demasiado específica).
const SECTOR_PATTERNS: [Sector, RegExp][] = [
  ["hosteleria", /restaura|bar\b|bar |cafeter|catering|taberna|marisquer|cocteler|pasteler|pizzer|asador|tapas|sidrer|hotel|hostal|casa rural/],
  ["salud", /dental|dentist|clinic|veterinar|fisio|estetic|peluquer|barber|optica|psicolog|podolog|nutricion|centro de salud/],
  ["deporte", /gimnasio|deportiv|crossfit|yoga|pilates|academia|formacion|autoescuela|escuela/],
  ["inmobiliaria", /inmobiliari|agentes? inmobiliari/],
  ["profesional", /asesor|gestor|abogad|legal|seguros|arquitect|consultor|notari|ingenier/],
  ["oficio", /fontaner|cerrajer|electricist|desatasc|plagas|fumigac|mudanz|carpinter|pintor|persiana|toldo|jardin|techad|reforma|instalac|climatiz|albanil|cristaler/],
  ["comercio", /tienda|zapater|floristeri|joyeri|e-commerce|retail|boutique|moda|libreri|jugueter|ferreteri/],
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function detectSector(keyword: string, category: string): Sector {
  for (const text of [normalize(keyword), normalize(category)]) {
    if (!text) continue;
    for (const [sector, re] of SECTOR_PATTERNS) if (re.test(text)) return sector;
  }
  return "otro";
}

// Cómo encaja cada sector con lo que vendemos.
const SECTOR_COPY: Record<Sector, { label: string; plural: string; booking: string; afterWeb: { product: string; why: string } }> = {
  hosteleria: {
    label: "Hostelería",
    plural: "restaurantes y bares",
    booking: "reservas de mesa online y carta digital",
    afterWeb: { product: "SAAS", why: "Un sistema de reservas propio evita pagar comisión a TheFork y llena las horas flojas." },
  },
  salud: {
    label: "Salud y estética",
    plural: "clínicas y centros",
    booking: "cita online 24h",
    afterWeb: { product: "SAAS", why: "La cita online 24h reduce llamadas en recepción y los huecos vacíos por olvidos (recordatorios automáticos)." },
  },
  deporte: {
    label: "Deporte y formación",
    plural: "gimnasios y academias",
    booking: "reserva de clases y alta de socios online",
    afterWeb: { product: "SAAS", why: "Gestionar socios, cuotas y reservas de clases desde el móvil ahorra horas de papeleo cada semana." },
  },
  inmobiliaria: {
    label: "Inmobiliaria",
    plural: "inmobiliarias",
    booking: "fichas de inmuebles y captación de propietarios",
    afterWeb: { product: "SEO", why: "Salir arriba en \"vender piso en [zona]\" trae propietarios directos sin depender de Idealista." },
  },
  profesional: {
    label: "Despacho profesional",
    plural: "despachos y asesorías",
    booking: "formulario de consulta y cita",
    afterWeb: { product: "SEO", why: "Quien busca un asesor o abogado elige entre los 3 primeros de Google; estar ahí es captar clientes cada mes." },
  },
  oficio: {
    label: "Oficios y urgencias",
    plural: "profesionales de oficios",
    booking: "botón de llamada y WhatsApp directo",
    afterWeb: { product: "SEO", why: "El que busca \"urgente\" llama al primero que sale en Google en su zona; cada puesto arriba son llamadas reales." },
  },
  comercio: {
    label: "Comercio",
    plural: "comercios",
    booking: "catálogo y venta online",
    afterWeb: { product: "ECOMMERCE", why: "Una tienda online le deja vender fuera de horario y fuera de su barrio." },
  },
  otro: {
    label: "Otro",
    plural: "negocios",
    booking: "formulario de contacto",
    afterWeb: { product: "SEO", why: "Aparecer en Google cuando le buscan en su zona trae clientes sin pagar anuncios." },
  },
};

export const SECTOR_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(SECTOR_COPY).map(([k, v]) => [k, v.label])
);

export interface SalesInput {
  name: string;
  keyword: string;
  category: string;
  zone: string;
  website: string;
  rating: number;
  emails: string[];
  digitalNeedSignals: string[];
  contactName?: string;
  // Datos de su web (opcionales: solo existen si ya se ha analizado).
  legalOwnerName?: string;
  legalOwnerType?: string;
  webTech?: string;
  webCopyrightYear?: number | null;
  hasOnlineShop?: boolean;
  hasOnlineBooking?: boolean;
  socialLinks?: string[];
  webInsightsAt?: Date | string | null;
}

// Constructores de webs de plantilla: el negocio paga cuota, posiciona mal y
// no puede crecer — argumento claro para una web propia.
const TEMPLATE_BUILDERS = new Set(["Wix", "Jimdo", "Webnode", "GoDaddy", "Google Sites", "Squarespace"]);

/** Nombre de la persona a la que preguntar: el contacto apuntado o, si el titular es un autónomo, su nombre. */
export function personToAskFor(b: Pick<SalesInput, "contactName" | "legalOwnerName" | "legalOwnerType">): string {
  if (b.contactName) return b.contactName;
  if (b.legalOwnerType === "persona" && b.legalOwnerName) return b.legalOwnerName;
  return "";
}

export interface SalesRecommendation {
  product: string; // clave de PRODUCT_LABEL
  price: string;
  /** Qué tan clara es la venta: alta = tiene un problema evidente. */
  confidence: "alta" | "media" | "baja";
  sector: Sector;
  sectorLabel: string;
  /** Una frase para el agente: qué le vendemos y por qué. */
  headline: string;
  /** Argumentos que puede decir tal cual en la llamada. */
  arguments: string[];
  opening: string;
  objections: { q: string; a: string }[];
  whatsappMessage: string;
}

function cityOf(zone: string): string {
  return zone.replace(/\s*españa\s*$/i, "").trim() || "tu zona";
}

export function recommendSale(b: SalesInput): SalesRecommendation {
  const sector = detectSector(b.keyword, b.category);
  const copy = SECTOR_COPY[sector];
  const city = cityOf(b.zone);
  const s = new Set(b.digitalNeedSignals);
  const args: string[] = [];
  const analyzed = !!b.webInsightsAt && !!b.webTech;
  const isTemplate = !!b.webTech && TEMPLATE_BUILDERS.has(b.webTech);
  const thisYear = new Date().getFullYear();

  let product: string;
  let confidence: SalesRecommendation["confidence"];
  let headline: string;

  if (s.has("sin_web") || s.has("web_red_social") || s.has("web_caida")) {
    product = sector === "comercio" ? "ECOMMERCE" : "LANDING";
    confidence = "alta";
    if (s.has("sin_web")) {
      headline = `No tiene web: ofrécele una ${product === "ECOMMERCE" ? "tienda online" : "web profesional"} con ${copy.booking}.`;
      args.push(`Cuando alguien busca "${(b.keyword || copy.label).toLowerCase()} en ${city}" en Google, a ${b.name} no le encuentra: se va a la competencia.`);
    } else if (s.has("web_red_social")) {
      headline = `Su "web" es solo una red social: ofrécele una web propia con ${copy.booking}.`;
      args.push("Una red social no sale en Google ni es suya: si la cuenta se bloquea o cambia el algoritmo, pierde a sus clientes.");
    } else {
      headline = `Su web está caída: ofrécele rehacerla con ${copy.booking}.`;
      args.push("Ahora mismo su web no carga: cada cliente que la intenta abrir piensa que ha cerrado.");
    }
    args.push(`Incluye ${copy.booking}, para que le contacten sin tener que llamar.`);
  } else if (s.has("sin_ssl") || s.has("no_responsive") || s.has("web_antigua") || isTemplate) {
    product = "LANDING";
    confidence = "media";
    headline = isTemplate && !s.has("sin_ssl") && !s.has("no_responsive") && !s.has("web_antigua")
      ? `Tiene una web de plantilla (${b.webTech}): ofrécele una web propia que posicione.`
      : "Tiene web, pero anticuada: ofrécele renovarla (móvil + seguridad).";
    if (s.has("web_antigua") && b.webCopyrightYear) {
      args.push(`Su web pone © ${b.webCopyrightYear}: lleva unos ${thisYear - b.webCopyrightYear} años sin renovarse, y se nota en diseño y en Google.`);
    }
    if (isTemplate) {
      args.push(`Está hecha con ${b.webTech}: paga cuota todos los meses por una plantilla que posiciona peor que una web propia.`);
    }
    if (s.has("no_responsive")) args.push("Su web no se adapta al móvil, y 7 de cada 10 visitas llegan desde el móvil: se ve mal y se van.");
    if (s.has("sin_ssl")) args.push("Su web sale como \"No segura\" en Chrome: espanta a los clientes y Google la baja en los resultados.");
    args.push(`De paso le añadimos ${copy.booking}.`);
  } else {
    product = copy.afterWeb.product;
    // Si ya tiene lo que le íbamos a ofrecer (reservas, tienda), el siguiente paso es SEO.
    if ((product === "SAAS" && b.hasOnlineBooking) || (product === "ECOMMERCE" && b.hasOnlineShop)) product = "SEO";
    confidence = "baja";
    headline = `Su web está bien: el siguiente paso es ${product === "SAAS" ? "un sistema de " + copy.booking : product === "ECOMMERCE" ? "vender online" : "posicionarla en Google"}.`;
    args.push(product === copy.afterWeb.product ? copy.afterWeb.why : SECTOR_COPY.otro.afterWeb.why);
  }

  if (analyzed) {
    const socials = new Set(b.socialLinks ?? []);
    if (["hosteleria", "comercio", "salud", "deporte"].includes(sector) && !socials.has("instagram")) {
      args.push("Su web no enlaza ningún Instagram: en su sector es donde los clientes miran fotos antes de decidir.");
    }
    if (!socials.has("whatsapp") && (sector === "oficio" || sector === "salud" || sector === "hosteleria")) {
      args.push("No tiene botón de WhatsApp en la web: mucha gente prefiere escribir a llamar.");
    }
  }

  if (b.rating > 0 && b.rating < 4) {
    args.push(`Tiene ${b.rating}★ en Google: con más reseñas buenas (le ayudamos a pedirlas) sube en Maps y genera más confianza.`);
  } else if (b.rating >= 4.5) {
    args.push(`Tiene ${b.rating}★ en Google: buena reputación que ahora mismo no está aprovechando para captar clientes.`);
  }
  if (b.emails.length === 0) args.push("No hemos encontrado un email suyo publicado: le cuesta que le escriban clientes y proveedores.");

  const person = personToAskFor(b);
  const greeting = person ? `Hola, ¿hablo con ${person.split(" ")[0]}?` : `Hola, ¿es ${b.name}? ¿Podría hablar con el responsable?`;
  const opening = `${greeting} Le llamo porque estamos ayudando a ${copy.plural} de ${city} a conseguir más clientes por internet, y he visto que ${headlineHook(s)}. ¿Tiene dos minutos?`;

  const objections = [
    { q: "Es caro / no tengo presupuesto", a: `Se paga sola con ${product === "SEO" || product === "SAAS" ? "uno o dos clientes al mes" : "uno o dos clientes nuevos"}. Podemos fraccionarlo y empezar por lo básico.` },
    { q: "Ya tengo web / ya tengo a alguien", a: "Perfecto, no se trata de cambiar por cambiar. Le hago una revisión gratis y si lo que tiene funciona, se lo digo." },
    { q: "No tengo tiempo", a: "Nosotros nos encargamos de todo; usted solo nos dedica 20 minutos para contarnos su negocio. ¿Le va mejor mañana a primera hora o a última?" },
    { q: "Mándame información", a: "Claro. Para mandarle algo útil y no genérico, ¿qué le preocupa más ahora: conseguir más clientes o ahorrar tiempo?" },
  ];

  const whatsappMessage = `Hola${person ? " " + person.split(" ")[0] : ""}, soy de la agencia digital que le ha llamado. He revisado la presencia online de ${b.name} y ${headlineHook(s)}. ¿Le cuento en 2 minutos cómo lo solucionaríamos? Sin compromiso.`;

  return {
    product,
    price: PRODUCT_PRICE[product] ?? PRODUCT_PRICE.OTHER,
    confidence,
    sector,
    sectorLabel: copy.label,
    headline,
    arguments: args,
    opening,
    objections,
    whatsappMessage,
  };
}

function headlineHook(s: Set<string>): string {
  if (s.has("sin_web")) return "no le encuentran en Google porque no tiene web";
  if (s.has("web_red_social")) return "solo aparece en redes sociales, sin web propia";
  if (s.has("web_caida")) return "su página web no está cargando ahora mismo";
  if (s.has("no_responsive")) return "su web no se ve bien en el móvil";
  if (s.has("sin_ssl")) return "su web aparece como \"No segura\" en el navegador";
  if (s.has("web_antigua")) return "su web lleva años sin renovarse";
  return "tiene margen para conseguir más clientes desde Google";
}

export const CONFIDENCE_BADGE: Record<SalesRecommendation["confidence"], { label: string; className: string }> = {
  alta: { label: "Venta clara", className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
  media: { label: "Buena oportunidad", className: "bg-blue-500/10 text-blue-300 border-blue-500/20" },
  baja: { label: "Venta de mejora", className: "bg-slate-500/10 text-slate-300 border-slate-500/20" },
};
