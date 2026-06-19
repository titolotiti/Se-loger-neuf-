import * as cheerio from "cheerio";

const CACHE = new Map<string, { html: string; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REQUEST_DELAY_MS = 1500;
const MAX_RETRIES = 2;

const SELOGER_NEUF_DOMAINS = [
  "selogerneuf.com",
  "www.selogerneuf.com",
  "seloger.com",
  "www.seloger.com",
];

export function isSeLogerNeufUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return SELOGER_NEUF_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(url: string): Promise<string | null> {
  if (!isSeLogerNeufUrl(url)) {
    console.warn(`[scraper] URL refusée (hors SeLoger Neuf) : ${url}`);
    return null;
  }

  const cached = CACHE.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.html;
  }

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Referer: "https://www.selogerneuf.com/",
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await delay(REQUEST_DELAY_MS * attempt);

    try {
      const res = await fetch(url, { headers, redirect: "follow" });

      if (res.status === 403 || res.status === 429) {
        console.warn(`[scraper] Accès refusé (${res.status}) pour ${url}`);
        return null;
      }

      if (!res.ok) {
        console.warn(`[scraper] HTTP ${res.status} pour ${url}`);
        if (attempt < MAX_RETRIES) continue;
        return null;
      }

      const html = await res.text();
      CACHE.set(url, { html, ts: Date.now() });
      await delay(REQUEST_DELAY_MS);
      return html;
    } catch (err) {
      console.warn(`[scraper] Erreur réseau pour ${url}:`, err);
      if (attempt === MAX_RETRIES) return null;
    }
  }

  return null;
}

export type ProgramLink = {
  url: string;
  name?: string;
  city?: string;
};

/**
 * Extrait les liens vers les programmes neufs depuis une page de résultats SeLoger Neuf.
 * Tente plusieurs sélecteurs CSS pour s'adapter aux changements de structure HTML.
 */
export function extractProgramLinks(html: string, baseUrl: string): ProgramLink[] {
  const $ = cheerio.load(html);
  const links: ProgramLink[] = [];
  const seen = new Set<string>();

  const selectors = [
    "a[href*='/annonces/']",
    "a[href*='/programme-neuf/']",
    "a[href*='/immobilier/achat/']",
    ".CardResultat a[href]",
    ".listing-result a[href]",
    ".product-card a[href]",
    "[data-test='card-title-link']",
    "[data-testid='sl.card-link']",
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href) return;

      let fullUrl: string;
      try {
        fullUrl = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
      } catch {
        return;
      }

      if (!isSeLogerNeufUrl(fullUrl)) return;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      const name =
        $(el).find("h2, h3, .program-name, .titre, [data-test='card-title']").first().text().trim() ||
        $(el).text().trim() ||
        undefined;

      links.push({ url: fullUrl, name: name || undefined });
    });
  }

  // Tenter d'extraire les données JSON embarquées (next.js __NEXT_DATA__ ou window.__INITIAL_STATE__)
  const jsonLinks = extractLinksFromJson($, baseUrl, seen);
  links.push(...jsonLinks);

  return links;
}

function extractLinksFromJson(
  $: ReturnType<typeof cheerio.load>,
  baseUrl: string,
  seen: Set<string>
): ProgramLink[] {
  const links: ProgramLink[] = [];

  try {
    const nextData = $("#__NEXT_DATA__").html();
    if (nextData) {
      const parsed = JSON.parse(nextData);
      const listings = findNestedArray(parsed, ["listings", "annonces", "programs", "results"]);
      for (const rawItem of listings) {
        const item = rawItem as Record<string, unknown>;
        const url = (item?.url ?? item?.link ?? item?.href ?? item?.detailUrl) as string | undefined;
        if (!url || !isSeLogerNeufUrl(url)) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        links.push({
          url,
          name: (item?.name ?? item?.title ?? item?.programName ?? undefined) as string | undefined,
          city: (item?.city ?? item?.commune ?? undefined) as string | undefined,
        });
      }
    }
  } catch {
    // JSON invalide ou structure différente
  }

  return links;
}

function findNestedArray(obj: unknown, keys: string[]): unknown[] {
  if (!obj || typeof obj !== "object") return [];
  for (const key of keys) {
    const val = (obj as Record<string, unknown>)[key];
    if (Array.isArray(val)) return val;
  }
  for (const val of Object.values(obj as Record<string, unknown>)) {
    const found = findNestedArray(val, keys);
    if (found.length) return found;
  }
  return [];
}

export function clearCache(): void {
  CACHE.clear();
}
