import * as cheerio from "cheerio";
import type { NeufListing, NeufProgram, NeufTypology, ParkingStatus, ProgramDebugInfo } from "@/types/neuf";
import { isSeLogerNeufUrl } from "./scraper";

let listingCounter = 0;
let programCounter = 0;

const GENERIC_PROGRAM_NAME_PATTERNS = [
  /^programme[s]?\s+neuf[s]?\s*:/i,
  /achat\s+immobilier\s+neuf/i,
  /programme[s]?\s+neuf[s]?\s+(en|à|dans|sur)\s/i,
  /immobilier\s+neuf\s+(en|à|dans)\s/i,
  /logement[s]?\s+neuf[s]?\s+(en|à|dans)\s/i,
  /appartement[s]?\s+neuf[s]?\s+(en|à|dans)\s/i,
  /biens?\s+neufs?\s+(en|à|dans)\s/i,
  /programmes?\s+neufs?\s+à\s+vendre/i,
  /^résultats\s+(de\s+)?recherche/i,
  /^annonces?\s+immobilière/i,
  /[ÎI]le-de-France/i,
  /Hauts-de-Seine/,
];

function isValidProgramName(name: string): boolean {
  if (!name || name === "Programme inconnu") return false;
  return !GENERIC_PROGRAM_NAME_PATTERNS.some((p) => p.test(name));
}

export function parsePrice(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d,. ]/g, "").replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isFinite(num) && num > 0 ? num : undefined;
}

export function parseSurface(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  return isFinite(num) && num > 0 ? num : undefined;
}

export function parseTypology(raw: string | null | undefined): NeufTypology | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();

  if (/studio|t1|f1|1\s*pi[eè]ce/.test(s)) return "T1 / Studio";
  if (/t2|f2|2\s*pi[eè]ces?/.test(s)) return "T2";
  if (/t3|f3|3\s*pi[eè]ces?/.test(s)) return "T3";
  if (/t4|f4|4\s*pi[eè]ces?/.test(s)) return "T4";
  if (/t5|f5|t6|f6|t7|f7|5\s*pi[eè]ces?|6\s*pi[eè]ces?/.test(s)) return "T5+";

  // Essai par nombre de pièces
  const rooms = parseInt(s);
  if (!isNaN(rooms)) {
    if (rooms <= 1) return "T1 / Studio";
    if (rooms === 2) return "T2";
    if (rooms === 3) return "T3";
    if (rooms === 4) return "T4";
    if (rooms >= 5) return "T5+";
  }

  return undefined;
}

export function parseParking(raw: string | null | undefined): ParkingStatus {
  if (!raw) return "Non communiqué";
  const s = raw.toLowerCase();
  if (/oui|inclus|compris/.test(s)) return "Oui";
  if (/option/.test(s)) return "En option";
  if (/non/.test(s)) return "Non";
  return "Non communiqué";
}

function parseRooms(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(\d+)/);
  return match ? parseInt(match[1]) : undefined;
}

function extractText($: ReturnType<typeof cheerio.load>, selectors: string[]): string | null {
  for (const sel of selectors) {
    const text = $(sel).first().text().trim();
    if (text) return text;
  }
  return null;
}

function extractAttr(
  $: ReturnType<typeof cheerio.load>,
  selectors: string[],
  attr: string
): string | null {
  for (const sel of selectors) {
    const val = $(sel).first().attr(attr);
    if (val) return val.trim();
  }
  return null;
}

export function parseProgramPage(
  html: string,
  url: string,
  city: string,
  postalCode: string,
  zoneType: "Commune principale" | "Commune limitrophe"
): NeufProgram | null {
  if (!isSeLogerNeufUrl(url)) return null;

  const $ = cheerio.load(html);
  const extractedAt = new Date().toISOString();

  // Essai extraction données JSON embarquées (plus fiable)
  const jsonProgram = extractFromNextData($, url, city, postalCode, zoneType, extractedAt);
  if (jsonProgram) return jsonProgram;

  // Fallback : parsing HTML direct
  const programName =
    extractText($, [
      "h1",
      "[data-test='program-title']",
      ".program-title",
      ".titre-programme",
      "[class*='title']",
    ]) ?? "Programme inconnu";

  if (!isValidProgramName(programName)) {
    console.warn(`[parser] Nom de programme générique rejeté (page catégorie ?) : "${programName}" — ${url}`);
    return null;
  }

  const developer =
    extractText($, [
      "[data-test='developer-name']",
      ".developer-name",
      ".promoteur",
      ".commercialisateur",
      "[class*='developer']",
      "[class*='promoteur']",
    ]) ?? undefined;

  const address =
    extractText($, [
      "[data-test='program-address']",
      ".program-address",
      ".adresse",
      "address",
      "[class*='address']",
    ]) ?? undefined;

  const deliveryDate =
    extractText($, [
      "[data-test='delivery-date']",
      ".delivery-date",
      ".livraison",
      "[class*='delivery']",
      "[class*='livraison']",
    ]) ?? undefined;

  const totalUnitsRaw = extractText($, ["[data-test='total-units']", ".total-units", "[class*='logements']"]);
  const totalUnits = totalUnitsRaw ? parseInt(totalUnitsRaw.replace(/\D/g, "")) : undefined;

  const availableUnitsRaw = extractText($, ["[data-test='available-units']", ".available-units", "[class*='disponible']"]);
  const availableUnits = availableUnitsRaw ? parseInt(availableUnitsRaw.replace(/\D/g, "")) : undefined;

  const parkingRaw = extractText($, ["[data-test='parking']", ".parking", "[class*='parking']"]);
  const parking = parseParking(parkingRaw);

  const programId = `prog_${++programCounter}_${Date.now()}`;

  const listings = parseListings($, programId, programName, developer, city, postalCode, url, extractedAt);

  // Rejeter les pages sans aucune donnée exploitable
  if (listings.length === 0 && !developer && !deliveryDate) {
    console.warn(`[parser] Programme sans données utiles rejeté (HTML fallback) : "${programName}" — ${url}`);
    return null;
  }

  return {
    programId,
    source: "SeLogerNeuf",
    programName,
    developer,
    address,
    city,
    postalCode,
    zoneType,
    url,
    totalUnits: isFinite(totalUnits ?? NaN) ? totalUnits : undefined,
    availableUnits: isFinite(availableUnits ?? NaN) ? availableUnits : undefined,
    deliveryDate,
    parking,
    listings,
  };
}

function extractFromNextData(
  $: ReturnType<typeof cheerio.load>,
  url: string,
  city: string,
  postalCode: string,
  zoneType: "Commune principale" | "Commune limitrophe",
  extractedAt: string
): NeufProgram | null {
  try {
    const raw = $("#__NEXT_DATA__").html();
    if (!raw) return null;

    const data = JSON.parse(raw);
    const props = data?.props?.pageProps ?? data?.props ?? {};

    // Différents schémas possibles selon la version de SeLoger Neuf
    const prog =
      props?.program ??
      props?.annonce ??
      props?.listing ??
      props?.detail ??
      findFirst(props, ["program", "annonce", "listing", "programme"]);

    if (!prog) return null;

    const programName =
      prog.name ?? prog.title ?? prog.programName ?? prog.nom ?? "Programme inconnu";

    if (!isValidProgramName(programName)) {
      console.warn(`[parser] __NEXT_DATA__ : nom générique rejeté : "${programName}" — ${url}`);
      return null;
    }
    const developer =
      prog.developer ?? prog.promoteur ?? prog.commercialisateur ?? prog.developerName ?? undefined;
    const address = prog.address ?? prog.adresse ?? prog.location ?? undefined;
    const deliveryDate =
      prog.deliveryDate ?? prog.datelivraison ?? prog.livraison ?? prog.delivery ?? undefined;
    const totalUnits = prog.totalUnits ?? prog.nombreLogements ?? prog.nbLogements ?? undefined;
    const availableUnits = prog.availableUnits ?? prog.logementsDisponibles ?? prog.nbDisponibles ?? undefined;
    const parkingRaw = prog.parking ?? prog.hasParking ?? undefined;
    const parking = typeof parkingRaw === "boolean" ? (parkingRaw ? "Oui" : "Non") : parseParking(String(parkingRaw ?? ""));

    const programId = prog.id ?? prog.programId ?? prog.idAnnonce ?? `prog_${++programCounter}_${Date.now()}`;

    const rawListings: unknown[] = prog.lots ?? prog.listings ?? prog.logements ?? prog.units ?? [];

    const listings: NeufListing[] = rawListings.map((lot) => {
      const l = lot as Record<string, unknown>;
      const typologyRaw = (l.typology ?? l.type ?? l.typelogement ?? l.typeName ?? "") as string;
      const typology = parseTypology(typologyRaw);
      const surfaceM2 = parseSurface(String(l.surface ?? l.surfaceHabitable ?? ""));
      const priceEur = parsePrice(String(l.price ?? l.prix ?? l.tarif ?? ""));

      const listingId = String(l.id ?? l.lotId ?? ++listingCounter);
      const reliabilityScore = computeReliability({ typology, surfaceM2, priceEur, url, city });

      return {
        id: listingId,
        programId: String(programId),
        source: "SeLogerNeuf" as const,
        url,
        extractedAt,
        programName,
        developer,
        city,
        postalCode,
        address: address ?? undefined,
        geoPrecision: "city_only" as const,
        typology,
        rooms: parseRooms(typologyRaw) ?? (l.rooms as number | undefined),
        bedrooms: (l.bedrooms as number | undefined) ?? undefined,
        surfaceM2,
        priceEur,
        floor: (l.floor as string | undefined) ?? undefined,
        outdoorSpace: (l.outdoor as string | undefined) ?? (l.exterieur as string | undefined) ?? undefined,
        parking: parseParking((l.parking as string | undefined) ?? ""),
        deliveryDate,
        description: (l.description as string | undefined) ?? undefined,
        reliabilityScore,
        excludedFromStats: reliabilityScore < 60 || !priceEur || !surfaceM2,
        exclusionReason: buildExclusionReason({ typology, surfaceM2, priceEur, reliabilityScore }),
      };
    });

    return {
      programId: String(programId),
      source: "SeLogerNeuf",
      programName,
      developer,
      address,
      city,
      postalCode,
      zoneType,
      url,
      totalUnits: typeof totalUnits === "number" ? totalUnits : undefined,
      availableUnits: typeof availableUnits === "number" ? availableUnits : undefined,
      deliveryDate,
      parking,
      listings,
    };
  } catch {
    return null;
  }
}

function parseListings(
  $: ReturnType<typeof cheerio.load>,
  programId: string,
  programName: string,
  developer: string | undefined,
  city: string,
  postalCode: string,
  url: string,
  extractedAt: string
): NeufListing[] {
  const listings: NeufListing[] = [];

  const lotSelectors = [
    "[data-test='lot-item']",
    ".lot-item",
    ".lot",
    "[class*='Lot']",
    "[class*='lot-']",
    ".logement",
    ".unit",
    "tr[data-lot]",
  ];

  let lotEls: ReturnType<typeof $> | null = null;
  for (const sel of lotSelectors) {
    const found = $(sel);
    if (found.length > 0) {
      lotEls = found;
      break;
    }
  }

  if (!lotEls || lotEls.length === 0) return [];

  lotEls.each((_, el) => {
    const $el = $(el);

    const typologyRaw =
      $el.find("[data-test='lot-type'], .lot-type, .typology, [class*='type']").first().text().trim() ||
      $el.find("td").first().text().trim();
    const surfaceRaw =
      $el.find("[data-test='lot-surface'], .lot-surface, .surface, [class*='surface']").first().text().trim();
    const priceRaw =
      $el.find("[data-test='lot-price'], .lot-price, .price, [class*='price'], [class*='prix']").first().text().trim();
    const floorRaw =
      $el.find("[data-test='lot-floor'], .lot-floor, .floor, [class*='etage']").first().text().trim();
    const outdoorRaw =
      $el.find("[data-test='lot-outdoor'], .outdoor, .exterieur, [class*='outdoor'], [class*='balcon']").first().text().trim();

    const typology = parseTypology(typologyRaw);
    const surfaceM2 = parseSurface(surfaceRaw);
    const priceEur = parsePrice(priceRaw);

    const reliabilityScore = computeReliability({ typology, surfaceM2, priceEur, url, city });

    const listing: NeufListing = {
      id: `lot_${++listingCounter}`,
      programId,
      source: "SeLogerNeuf",
      url,
      extractedAt,
      programName,
      developer,
      city,
      postalCode,
      geoPrecision: "city_only",
      typology,
      surfaceM2,
      priceEur,
      floor: floorRaw || undefined,
      outdoorSpace: outdoorRaw || undefined,
      parking: "Non communiqué",
      reliabilityScore,
      excludedFromStats: reliabilityScore < 60 || !priceEur || !surfaceM2,
      exclusionReason: buildExclusionReason({ typology, surfaceM2, priceEur, reliabilityScore }),
    };

    listings.push(listing);
  });

  return listings;
}

function computeReliability(opts: {
  typology?: NeufTypology;
  surfaceM2?: number;
  priceEur?: number;
  url: string;
  city: string;
}): number {
  let score = 0;
  if (opts.url && isSeLogerNeufUrl(opts.url)) score += 20;
  if (opts.city) score += 10;
  if (opts.typology) score += 20;
  if (opts.surfaceM2 && opts.surfaceM2 > 0) score += 20;
  if (opts.priceEur && opts.priceEur > 0) score += 30;
  return Math.min(score, 100);
}

function buildExclusionReason(opts: {
  typology?: NeufTypology;
  surfaceM2?: number;
  priceEur?: number;
  reliabilityScore: number;
}): string | undefined {
  if (!opts.priceEur) return "Prix absent";
  if (!opts.surfaceM2) return "Surface absente";
  if (!opts.typology) return "Typologie non identifiée";
  if (opts.reliabilityScore < 60) return "Score de fiabilité insuffisant";
  const ratio = opts.priceEur / opts.surfaceM2;
  if (ratio < 1000 || ratio > 30000) return "Prix/m² incohérent";
  return undefined;
}

function findFirst(obj: unknown, keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== undefined && val !== null) return val;
  }
  for (const val of Object.values(obj as Record<string, unknown>)) {
    const found = findFirst(val, keys);
    if (found) return found;
  }
  return null;
}

// ─── Extraction depuis __NEXT_DATA__ des pages de résultats ──────────────────

function getStr(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function getStrNested(item: Record<string, unknown>, fields: string[]): string | undefined {
  for (const f of fields) {
    const v = item[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const val of Object.values(item)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const f of fields) {
        const v = (val as Record<string, unknown>)[f];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
  }
  return undefined;
}

function getRawUrl(item: Record<string, unknown>): string | undefined {
  for (const f of URL_FIELDS) {
    const v = item[f];
    if (typeof v === "string" && v.trim() && v.includes("/")) return v.trim();
  }
  for (const val of Object.values(item)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;
      for (const f of URL_FIELDS) {
        const v = nested[f];
        if (typeof v === "string" && v.trim() && v.includes("/")) return v.trim();
      }
    }
  }
  return undefined;
}

function getNum(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && isFinite(v) && v > 0) return v;
    if (typeof v === "string" && v.trim()) {
      const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
      if (isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

function getArr(obj: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v) && v.length > 0) return v;
  }
  return [];
}

function getIdStr(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && (typeof v === "string" || typeof v === "number") && String(v).trim()) {
      return String(v).trim();
    }
  }
  return undefined;
}

const URL_FIELDS = [
  "url", "permalink", "detailUrl", "href", "link",
  "urlPermalink", "urlDetail", "urlAnnonce", "urlProgramme", "programUrl",
  "annonceUrl", "canonicalUrl", "seoUrl", "urlFiche", "ficheUrl",
  "urlBien", "absoluteUrl", "path", "route", "linkUrl",
  "urlSlug", "pageUrl", "annonceSeoUrl", "programmeUrl",
];

const NAME_FIELDS = [
  "title", "name", "titre", "libelle", "nom", "programName", "programmeNom",
  "programmeTitle", "programTitle", "label", "heading", "intitule",
  "designation", "programmeName", "nomProgramme", "titreProgramme",
  "displayName", "shortTitle", "fullTitle", "programmeLibelle",
];

const CITY_FIELDS = [
  "city", "ville", "commune", "localite", "cityName", "nomCommune",
  "locality", "municipalite", "villeNom", "townName", "cityLabel",
  "communeNom", "citySlug",
];

const DEVELOPER_FIELDS = [
  "promoteur", "developer", "agency", "advertiser", "promoterName",
  "commercialisateur", "agence", "developerName", "promoterLabel",
  "promoteurNom", "promoteurName", "agencyName",
  "constructeur", "lotisseur", "vendeur", "nomPromoteur",
];

const EXCLUDED_URL_SUBSTRINGS = [
  "/annuaire/",
  "/bien-programme/ile-de-france/",
  "/bien-programme/investissement-loi-lmnp/",
  "/bien-programme/commodite-",
  "/1-piece/",
  "/2-pieces/",
  "/3-pieces/",
  "/4-pieces/",
  "/5-pieces/",
];

function isProgramDetailUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    if (!path.startsWith("/annonces/neuf/programme/")) return false;
    return !EXCLUDED_URL_SUBSTRINGS.some((s) => url.includes(s));
  } catch {
    return false;
  }
}

function extractCityFromProgramUrl(url: string): { city?: string; dept?: string; programId?: string } {
  try {
    const path = new URL(url).pathname;
    // /annonces/neuf/programme/neuilly-sur-seine-92/239524289/
    const match = /\/annonces\/neuf\/programme\/([^/]+)\/(\d+)/.exec(path);
    if (!match) return {};
    const slug = match[1];
    const programId = match[2];
    const deptMatch = /-(\d{2,3})$/.exec(slug);
    const dept = deptMatch?.[1];
    const citySlug = dept ? slug.slice(0, -(dept.length + 1)) : slug;
    const city = citySlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");
    return { city, dept, programId };
  } catch {
    return {};
  }
}

const SEARCH_LISTING_ARRAY_KEYS = [
  "listings", "annonces", "programs", "results",
  "data", "items", "cards", "hits",
  "biens", "logements", "programmes", "offres",
  "classifieds", "realEstates", "searchResults",
  "announcements", "properties", "ads",
  "listingResults", "searchHits",
];

function looksLikeProgramArray(arr: unknown[]): boolean {
  return arr.slice(0, 5).some((item) => {
    if (!item || typeof item !== "object") return false;
    const obj = item as Record<string, unknown>;
    const hasUrl = URL_FIELDS.some((k) => typeof obj[k] === "string" && (obj[k] as string).includes("/"));
    const hasId = ["id", "idAnnonce", "classifiedId", "programmeId", "programId"].some(
      (k) => obj[k] != null && String(obj[k]).trim() !== ""
    );
    const hasName = NAME_FIELDS.some((k) => typeof obj[k] === "string" && (obj[k] as string).trim() !== "");
    return hasUrl || hasId || hasName;
  });
}

// Navigate the known SeLoger Neuf Redux state path:
// data.props.initialReduxState.searchPrograms.[dynamicKey].programs
function findProgramsInInitialReduxState(data: unknown): { items: unknown[]; path: string } | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const props = root.props as Record<string, unknown> | undefined;
  if (!props) return null;
  const irs = props.initialReduxState as Record<string, unknown> | undefined;
  if (!irs) return null;
  const sp = irs.searchPrograms as Record<string, unknown> | undefined;
  if (!sp || typeof sp !== "object") return null;
  for (const [key, val] of Object.entries(sp)) {
    if (!val || typeof val !== "object") continue;
    const programs = (val as Record<string, unknown>).programs;
    if (Array.isArray(programs) && programs.length > 0) {
      console.log(`[parser:search] Chemin Redux trouvé: searchPrograms.${key}.programs (${programs.length} programmes)`);
      return {
        items: programs,
        path: `root.props.initialReduxState.searchPrograms.${key}.programs`,
      };
    }
  }
  return null;
}

function findListingsInNextData(data: unknown, depth = 0): unknown[] {
  // Try the known Redux state path first
  if (depth === 0) {
    const specific = findProgramsInInitialReduxState(data);
    if (specific) return specific.items;
  }
  if (depth > 8 || !data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  for (const key of SEARCH_LISTING_ARRAY_KEYS) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && looksLikeProgramArray(val)) {
      console.log(`[parser:search] Tableau "${key}" (${val.length} items) profondeur ${depth}`);
      return val;
    }
  }
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const found = findListingsInNextData(val, depth + 1);
      if (found.length > 0) return found;
    }
  }
  return [];
}

// ── Extraction profonde : promoteur, livraison, prix, surface, lots ───────────

const DEVELOPER_OBJECT_KEYS = [
  "professional", "agency", "contact", "advertiser", "promoteur",
  "brand", "publisher", "operator", "seller",
];
const DEVELOPER_NAME_SUBKEYS = [
  "name", "nom", "companyName", "label", "displayName",
  "accountName", "brandName", "corporateName",
];

function extractDeveloper(item: Record<string, unknown>): string | undefined {
  const direct = getStrNested(item, DEVELOPER_FIELDS);
  if (direct) return direct;
  for (const key of DEVELOPER_OBJECT_KEYS) {
    const obj = item[key];
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const name = getStr(obj as Record<string, unknown>, ...DEVELOPER_NAME_SUBKEYS);
      if (name) return name;
    }
  }
  return undefined;
}

const DELIVERY_FIELDS_EXT = [
  "deliveryDate", "livraison", "availabilityDate", "dateLivraison",
  "delivery", "remiseCles", "actability", "availableAt",
  "deliveryQuarter", "dateDelivery", "trimester", "quarter",
  "availability", "dateDisponibilite", "disponibilite", "dateActabilite",
];

const PRICE_OBJECT_KEYS_EXT = ["price", "prices", "prix", "priceRange", "budget", "tarif", "montant"];
const PRICE_VALUE_SUBKEYS = ["min", "from", "fromPrice", "minPrice", "value", "amount", "total", "minimum"];

function extractPrice(item: Record<string, unknown>): number | undefined {
  const direct = getNum(
    item,
    "price", "prix", "prixMin", "priceMin", "budgetMin", "fromPrice",
    "minPrice", "amount", "value", "montant", "prixHt", "priceHt"
  );
  if (direct !== undefined) return direct;
  for (const key of PRICE_OBJECT_KEYS_EXT) {
    const obj = item[key];
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const nested = getNum(obj as Record<string, unknown>, ...PRICE_VALUE_SUBKEYS);
      if (nested !== undefined) return nested;
    }
  }
  for (const val of Object.values(item)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nested = getNum(
        val as Record<string, unknown>,
        "price", "prix", "minPrice", "prixMin", "fromPrice", "amount", "value"
      );
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

const SURFACE_OBJECT_KEYS_EXT = ["surface", "surfaces", "area", "areas", "livingArea", "floorArea"];
const SURFACE_VALUE_SUBKEYS = ["min", "from", "value", "area", "minimum", "minSurface", "minimum"];

function extractSurface(item: Record<string, unknown>): number | undefined {
  const direct = getNum(
    item,
    "surface", "surfaceMin", "minSurface", "surfaceHabitableMin", "area", "m2", "sqm"
  );
  if (direct !== undefined) return direct;
  for (const key of SURFACE_OBJECT_KEYS_EXT) {
    const obj = item[key];
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const nested = getNum(obj as Record<string, unknown>, ...SURFACE_VALUE_SUBKEYS);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

const LOTS_ARRAY_FIELDS_EXT = [
  "lots", "logements", "units", "typologies", "lotsTypes", "lotsTypologies",
  "properties", "housing", "children", "cards", "items", "availableLots",
  "classifications", "offerings", "realEstates", "annonces",
];
const LOTS_SUB_OBJECT_KEYS = [
  "programme", "program", "classified", "housing", "ad", "annonce", "realEstate",
];

function extractLots(item: Record<string, unknown>): unknown[] {
  const direct = getArr(item, ...LOTS_ARRAY_FIELDS_EXT);
  if (direct.length > 0) return direct;
  for (const subKey of LOTS_SUB_OBJECT_KEYS) {
    const sub = item[subKey];
    if (sub && typeof sub === "object" && !Array.isArray(sub)) {
      const found = getArr(sub as Record<string, unknown>, ...LOTS_ARRAY_FIELDS_EXT);
      if (found.length > 0) return found;
    }
  }
  return [];
}

// ── Livraison depuis stamp + description ──────────────────────────────────────

function extractDeliveryFromProgram(item: Record<string, unknown>): string | undefined {
  const stamp = getStr(item, "stamp");
  if (stamp) {
    if (/livraison\s+imm[eé]diate/i.test(stamp)) return "Livraison immédiate";
    const m = stamp.match(/[Ll]ivraison\s*(?:prévisionnelle)?\s*[:\-]?\s*(.{3,60})/);
    if (m) return m[1].trim();
    if (/livraison/i.test(stamp)) return stamp.trim();
  }
  const description = getStr(item, "description");
  if (description) {
    const m = description.match(/[Ll]ivraison\s*(?:prévisionnelle)?\s*[:\-]?\s*([^\n\r.]{3,60})/);
    if (m) return m[1].trim();
  }
  return getStr(item, ...DELIVERY_FIELDS_EXT);
}

// ── Typologies depuis propertiesAvailability ──────────────────────────────────
// "Du studio au 5 pièces" → [T1/Studio, T2, T3, T4, T5+]
// "Du 3 pièces au 5 pièces" → [T3, T4, T5+]
// "Appartement 4 pièces" → [T4]

function roomsToTypology(rooms: number): NeufTypology {
  if (rooms <= 1) return "T1 / Studio";
  if (rooms === 2) return "T2";
  if (rooms === 3) return "T3";
  if (rooms === 4) return "T4";
  return "T5+";
}

function extractTypologiesFromRange(propertiesAvailability: string | undefined): NeufTypology[] {
  if (!propertiesAvailability) return [];
  const s = propertiesAvailability.toLowerCase();
  let minRooms = 99;
  let maxRooms = 0;
  if (/studio/i.test(s)) { minRooms = 1; maxRooms = Math.max(maxRooms, 1); }
  for (const m of s.matchAll(/(\d+)\s*pi[eè]ces?/g)) {
    const n = parseInt(m[1]);
    if (n > 0) { minRooms = Math.min(minRooms, n); maxRooms = Math.max(maxRooms, n); }
  }
  if (maxRooms === 0) return [];
  if (minRooms === 99) minRooms = maxRooms;
  const seen = new Set<NeufTypology>();
  for (let r = minRooms; r <= maxRooms; r++) seen.add(roomsToTypology(r));
  return [...seen];
}

type BuildResult = NeufProgram | "duplicate" | { reject: string };

function buildProgramFromSearchItem(
  item: Record<string, unknown>,
  baseUrl: string,
  city: string,
  postalCode: string,
  zoneType: "Commune principale" | "Commune limitrophe",
  extractedAt: string,
  seen: Set<string>,
  debugInfos: ProgramDebugInfo[]
): BuildResult {
  // ── URL — programUrl est le champ direct dans les résultats SeLoger Neuf ──
  const rawUrl = getStr(item, "programUrl") ?? getRawUrl(item);
  if (!rawUrl) return { reject: "URL manquante" };

  let fullUrl: string;
  try {
    const resolved = rawUrl.startsWith("http") ? rawUrl : new URL(rawUrl, baseUrl).toString();
    fullUrl = resolved.split("#")[0];
  } catch {
    return { reject: "URL invalide" };
  }

  if (!isProgramDetailUrl(fullUrl)) return { reject: "URL non-programme (catégorie ou filtre)" };
  if (seen.has(fullUrl)) return "duplicate";
  seen.add(fullUrl);

  const urlInfo = extractCityFromProgramUrl(fullUrl);

  // ── Nom — "name" est le champ direct dans les résultats SeLoger Neuf ──
  const rawName = getStr(item, "name") ?? getStrNested(item, NAME_FIELDS);
  const validName = rawName && isValidProgramName(rawName);
  if (!validName && !urlInfo.city) {
    return { reject: `Nom absent ou générique: "${rawName ?? "(vide)"}"` };
  }
  const programName = validName ? rawName! : `Programme ${urlInfo.city ?? "inconnu"}`;

  // ── ID programme ──
  const programId =
    getIdStr(item, "programId", "id", "idAnnonce", "classifiedId", "programmeId") ??
    urlInfo.programId ??
    `prog_${++programCounter}_${Date.now()}`;

  // ── Promoteur — "professionalName" est le champ direct SeLoger Neuf ──
  const developer = getStr(item, "professionalName") ?? extractDeveloper(item);

  // ── Localisation ──
  const itemCity = getStr(item, "cityName") ?? getStrNested(item, CITY_FIELDS) ?? urlInfo.city ?? city;
  const itemPostalCode = getStr(item, "zipCode", "postalCode", "codePostal", "cp", "codepostal", "zip") ?? postalCode;
  const inseeCode = getStr(item, "inseeCode");

  // ── Prix à partir de — "price" + "isPriceMin" dans les résultats SeLoger Neuf ──
  const priceFromEur = getNum(item, "price") ?? extractPrice(item);
  const isPriceMin = Boolean(item.isPriceMin);

  // ── Typologies — depuis "propertiesAvailability" ──
  const typologyRange = getStr(item, "propertiesAvailability");
  const typologies = extractTypologiesFromRange(typologyRange);

  // ── Livraison — depuis "stamp" puis "description" ──
  const commercialStatus = getStr(item, "stamp");
  const deliveryDate = extractDeliveryFromProgram(item);

  // ── Description ──
  const description = getStr(item, "description");

  // ── Lots matchant la recherche ──
  const lotsMatchingSearch = item.lotsMatchingSearch;
  const availableUnitsDetected = Array.isArray(lotsMatchingSearch)
    ? lotsMatchingSearch.length
    : typeof lotsMatchingSearch === "number" ? lotsMatchingSearch : undefined;

  // ── Lots détaillés (vides dans les pages de résultats SeLoger Neuf) ──
  const rawLots = extractLots(item);
  let listings: NeufListing[] = [];

  if (rawLots.length > 0) {
    for (const rawLot of rawLots) {
      if (!rawLot || typeof rawLot !== "object") continue;
      const l = rawLot as Record<string, unknown>;
      const typologyRaw =
        getStr(l, "typology", "type", "typelogement", "typeName", "label", "libelle", "roomType") ??
        String(getNum(l, "pieces", "nbPieces", "rooms", "roomsNumber", "roomCount") ?? "");
      const typology = parseTypology(typologyRaw);
      const surface = extractSurface(l);
      const price = extractPrice(l);
      const reliabilityScore = computeReliability({ typology, surfaceM2: surface, priceEur: price, url: fullUrl, city: itemCity });
      listings.push({
        id: getIdStr(l, "id", "lotId", "classifiedId") ?? `lot_${++listingCounter}`,
        programId,
        source: "SeLogerNeuf",
        url: fullUrl,
        extractedAt,
        programName,
        developer,
        city: itemCity,
        postalCode: itemPostalCode,
        geoPrecision: "city_only",
        typology,
        surfaceM2: surface,
        priceEur: price,
        parking: "Non communiqué",
        deliveryDate,
        reliabilityScore,
        excludedFromStats: reliabilityScore < 60 || !price || !surface,
        exclusionReason: buildExclusionReason({ typology, surfaceM2: surface, priceEur: price, reliabilityScore }),
      });
    }
  }

  // Programme sans lots détaillés : une ligne par programme avec prix à partir de.
  // Surface absente → prix/m² non calculable → exclu des stats mais ne compte pas
  // comme "lot exclu" dans l'interface (isPlaceholderLot: true).
  if (listings.length === 0) {
    const hasKeyData = !!(programName && fullUrl && developer && priceFromEur);
    const singleTypo = typologies.length === 1 ? typologies[0] : undefined;
    listings = [{
      id: `lot_${++listingCounter}`,
      programId,
      source: "SeLogerNeuf",
      url: fullUrl,
      extractedAt,
      programName,
      developer,
      city: itemCity,
      postalCode: itemPostalCode,
      geoPrecision: "city_only",
      typology: singleTypo,
      surfaceM2: undefined,
      priceEur: priceFromEur,
      parking: "Non communiqué",
      deliveryDate,
      reliabilityScore: hasKeyData ? 70 : 40,
      excludedFromStats: true,
      exclusionReason: "Surface non disponible dans __NEXT_DATA__ — prix/m² non calculable",
      isPlaceholderLot: true,
    }];
  }

  debugInfos.push({
    programId,
    programName,
    url: fullUrl,
    rawKeys: Object.keys(item),
    rawPreview: JSON.stringify(item, null, 2).slice(0, 2000),
    hasPromoter: !!developer,
    hasDelivery: !!deliveryDate,
    hasPrice: priceFromEur !== undefined,
    hasSurface: false,
    hasLots: rawLots.length > 0,
  });

  return {
    programId,
    source: "SeLogerNeuf",
    programName,
    developer,
    city: itemCity,
    postalCode: itemPostalCode,
    inseeCode,
    zoneType,
    url: fullUrl,
    deliveryDate,
    commercialStatus,
    parking: "Non communiqué",
    priceFromEur,
    isPriceMin,
    typologyRange,
    typologies,
    availableUnitsDetected,
    description,
    listings,
  };
}

export type SearchExtractResult = {
  programs: NeufProgram[];
  rawItemCount: number;
  categorySkipped: number;
  duplicatesSkipped: number;
  rejectionSummary: Record<string, number>;
  sampleItemKeys: string[][];
  programDebugInfos: ProgramDebugInfo[];
};

export function parseSearchResultsPrograms(
  html: string,
  baseUrl: string,
  city: string,
  postalCode: string,
  zoneType: "Commune principale" | "Commune limitrophe",
  seen: Set<string>
): SearchExtractResult {
  const $ = cheerio.load(html);
  const extractedAt = new Date().toISOString();
  const empty: SearchExtractResult = {
    programs: [], rawItemCount: 0, categorySkipped: 0,
    duplicatesSkipped: 0, rejectionSummary: {}, sampleItemKeys: [], programDebugInfos: [],
  };

  const raw = $("#__NEXT_DATA__").html();
  if (!raw) {
    console.log(`[parser:search] Pas de __NEXT_DATA__ dans ${baseUrl}`);
    return empty;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    console.warn(`[parser:search] JSON invalide dans __NEXT_DATA__ de ${baseUrl}`);
    return empty;
  }

  const items = findListingsInNextData(data);
  console.log(`[parser:search] ${items.length} item(s) brut(s) dans ${baseUrl}`);

  const sampleItemKeys: string[][] = items.slice(0, 5).map((item) => {
    if (!item || typeof item !== "object") return [];
    return Object.keys(item as Record<string, unknown>);
  });
  sampleItemKeys.forEach((keys, i) => {
    console.log(`[parser:search] Item[${i}] clés: ${keys.join(", ")}`);
  });

  const programs: NeufProgram[] = [];
  let duplicatesSkipped = 0;
  const rejectionSummary: Record<string, number> = {};
  const debugInfos: ProgramDebugInfo[] = [];

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const result = buildProgramFromSearchItem(
      rawItem as Record<string, unknown>,
      baseUrl, city, postalCode, zoneType, extractedAt, seen, debugInfos
    );
    if (result === "duplicate") {
      duplicatesSkipped++;
    } else if (typeof result === "object" && "reject" in result) {
      const reason = (result as { reject: string }).reject;
      rejectionSummary[reason] = (rejectionSummary[reason] ?? 0) + 1;
      if (rejectionSummary[reason] <= 2) {
        const itemKeys = Object.keys(rawItem as Record<string, unknown>).slice(0, 10).join(", ");
        console.warn(`[parser:search] ✗ "${reason}" — clés: ${itemKeys}`);
      }
    } else {
      const prog = result as NeufProgram;
      programs.push(prog);
      console.log(`[parser:search] ✓ "${prog.programName}" — ${prog.listings.length} lot(s) — ${prog.url}`);
    }
  }

  const categorySkipped = rejectionSummary["URL non-programme (catégorie ou filtre)"] ?? 0;
  console.log(`[parser:search] → ${programs.length} programme(s), ${duplicatesSkipped} doublons, rejets: ${JSON.stringify(rejectionSummary)}`);
  return { programs, rawItemCount: items.length, categorySkipped, duplicatesSkipped, rejectionSummary, sampleItemKeys, programDebugInfos: debugInfos };
}

// ─── Exports utilitaires pour le endpoint debug ───────────────────────────────

export function findListingsWithPaths(
  data: unknown,
  path = "root",
  depth = 0
): { items: unknown[]; path: string } | null {
  // Try the specific SeLoger Neuf Redux path first
  if (depth === 0) {
    const specific = findProgramsInInitialReduxState(data);
    if (specific) return specific;
  }
  if (depth > 8 || !data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  for (const key of SEARCH_LISTING_ARRAY_KEYS) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && looksLikeProgramArray(val)) {
      return { items: val, path: `${path}.${key}` };
    }
  }
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const found = findListingsWithPaths(val, `${path}.${key}`, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function analyzeItemsForDebug(items: unknown[], basePath: string, baseUrl: string): object[] {
  return items.map((rawItem, i) => {
    const itemPath = `${basePath}[${i}]`;
    if (!rawItem || typeof rawItem !== "object") {
      return { index: i, path: itemPath, error: "Item non-objet", rawObject: rawItem };
    }
    const item = rawItem as Record<string, unknown>;

    const rawUrl = getRawUrl(item);
    let resolvedUrl: string | undefined;
    let hasValidProgramUrl = false;
    if (rawUrl) {
      try {
        const resolved = rawUrl.startsWith("http") ? rawUrl : new URL(rawUrl, baseUrl).toString();
        resolvedUrl = resolved.split("#")[0];
        hasValidProgramUrl = isProgramDetailUrl(resolvedUrl);
      } catch { /* ignore */ }
    }

    const name = getStrNested(item, NAME_FIELDS);
    const hasValidName = !!(name && isValidProgramName(name));
    const urlInfo = resolvedUrl ? extractCityFromProgramUrl(resolvedUrl) : {};

    let rejectReason: string | undefined;
    if (!rawUrl) rejectReason = "URL manquante";
    else if (!resolvedUrl) rejectReason = "URL invalide";
    else if (!hasValidProgramUrl) rejectReason = `URL non-programme: "${resolvedUrl}"`;
    else if (!hasValidName && !urlInfo.city) rejectReason = `Nom absent ou générique: "${name ?? "(vide)"}"`;

    const lots = extractLots(item);

    return {
      index: i,
      path: itemPath,
      rawKeys: Object.keys(item),
      rawObject: item,
      detected: {
        url: rawUrl,
        resolvedUrl,
        name: name ?? undefined,
        city: getStrNested(item, CITY_FIELDS) ?? urlInfo.city,
        developer: extractDeveloper(item),
        price: extractPrice(item),
        surface: extractSurface(item),
        deliveryDate: getStr(item, ...DELIVERY_FIELDS_EXT),
        lotsCount: lots.length,
        programId: getIdStr(item, "id", "idAnnonce", "classifiedId", "programmeId", "programId") ?? urlInfo.programId,
      },
      validation: {
        hasValidProgramUrl,
        hasValidName,
        rejectReason,
        retained: !rejectReason,
      },
    };
  });
}
