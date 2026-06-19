import * as cheerio from "cheerio";
import type { NeufListing, NeufProgram, NeufTypology, ParkingStatus } from "@/types/neuf";
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
