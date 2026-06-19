import * as cheerio from "cheerio";
import type { LinkType } from "@/types/neuf";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FetchErrorType =
  | "invalid_url"
  | "http_403"
  | "http_404"
  | "http_429"
  | "http_error"
  | "network_error"
  | "timeout"
  | "anti_bot_cloudflare"
  | "js_only_page"
  | "empty_html";

export type FetchResult = {
  success: boolean;
  html: string | null;
  url: string;
  finalUrl?: string;
  status?: number;
  statusText?: string;
  contentType?: string;
  htmlLength: number;
  htmlPreview: string;
  errorType?: FetchErrorType;
  errorMessage?: string;
  isCloudflarePage: boolean;
  isJsOnlyPage: boolean;
  hasNextData: boolean;
};

// ─── Config ───────────────────────────────────────────────────────────────────

const CACHE = new Map<string, { html: string; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_DELAY_MS = 1500;
const MAX_RETRIES = 2;
const FETCH_TIMEOUT_MS = 15_000;

const SELOGER_NEUF_DOMAINS = [
  "selogerneuf.com",
  "www.selogerneuf.com",
];

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isSeLogerNeufUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return SELOGER_NEUF_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
  } catch {
    return false;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function analyzeHtml(html: string): {
  isCloudflarePage: boolean;
  isJsOnlyPage: boolean;
  hasNextData: boolean;
} {
  const lower = html.toLowerCase();
  const isCloudflarePage =
    lower.includes("just a moment") ||
    lower.includes("cloudflare") ||
    lower.includes("checking your browser") ||
    lower.includes("enable javascript and cookies to continue") ||
    (lower.includes("ray id") && lower.includes("cloudflare"));
  const isJsOnlyPage = html.length < 3000 && html.includes("<script");
  const hasNextData = html.includes("__NEXT_DATA__");
  return { isCloudflarePage, isJsOnlyPage, hasNextData };
}

function emptyResult(url: string, errorType: FetchErrorType, errorMessage: string, status?: number, statusText?: string): FetchResult {
  return {
    success: false,
    html: null,
    url,
    status,
    statusText,
    htmlLength: 0,
    htmlPreview: "",
    errorType,
    errorMessage,
    isCloudflarePage: false,
    isJsOnlyPage: false,
    hasNextData: false,
  };
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

export async function fetchHtmlDetailed(url: string): Promise<FetchResult> {
  if (!isSeLogerNeufUrl(url)) {
    return emptyResult(url, "invalid_url", `URL refusée — hors domaine SeLoger Neuf : ${url}`);
  }

  const cached = CACHE.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    const { isCloudflarePage, isJsOnlyPage, hasNextData } = analyzeHtml(cached.html);
    console.log(`[scraper] Cache HIT : ${url}`);
    return {
      success: true,
      html: cached.html,
      url,
      htmlLength: cached.html.length,
      htmlPreview: cached.html.substring(0, 300).replace(/\s+/g, " ").trim(),
      isCloudflarePage,
      isJsOnlyPage,
      hasNextData,
    };
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await delay(REQUEST_DELAY_MS * attempt);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      console.log(`[scraper] Fetch attempt ${attempt + 1}/${MAX_RETRIES + 1} : ${url}`);

      const res = await fetch(url, {
        headers: FETCH_HEADERS,
        redirect: "follow",
        signal: controller.signal,
      });

      clearTimeout(timer);

      const contentType = res.headers.get("content-type") ?? "";
      const finalUrl = res.url ?? url;

      console.log(
        `[scraper] HTTP ${res.status} "${res.statusText}" | Content-Type: ${contentType} | Final URL: ${finalUrl}`
      );

      if (res.status === 403) {
        console.warn(`[scraper] 403 Forbidden — anti-bot probable : ${url}`);
        return emptyResult(url, "http_403", `HTTP 403 Forbidden — SeLoger Neuf bloque les requêtes serveur (anti-bot / IP cloud)`, 403, res.statusText);
      }

      if (res.status === 429) {
        console.warn(`[scraper] 429 Too Many Requests : ${url}`);
        return emptyResult(url, "http_429", `HTTP 429 Too Many Requests — limite de débit dépassée`, 429, res.statusText);
      }

      if (res.status === 404) {
        console.warn(`[scraper] 404 Not Found : ${url}`);
        return emptyResult(url, "http_404", `HTTP 404 Not Found — URL inexistante ou changée`, 404, res.statusText);
      }

      if (!res.ok) {
        const msg = `HTTP ${res.status} ${res.statusText}`;
        console.warn(`[scraper] ${msg} pour ${url}`);
        if (attempt < MAX_RETRIES) continue;
        return emptyResult(url, "http_error", msg, res.status, res.statusText);
      }

      const html = await res.text();
      const { isCloudflarePage, isJsOnlyPage, hasNextData } = analyzeHtml(html);
      const htmlPreview = html.substring(0, 500).replace(/\s+/g, " ").trim();

      console.log(
        `[scraper] HTML ${html.length} chars | Cloudflare: ${isCloudflarePage} | JS-only: ${isJsOnlyPage} | __NEXT_DATA__: ${hasNextData}`
      );
      console.log(`[scraper] Aperçu: ${htmlPreview.substring(0, 200)}`);

      if (html.trim().length === 0) {
        return emptyResult(url, "empty_html", "HTML vide reçu (0 caractères après trim)");
      }

      if (isCloudflarePage) {
        console.warn(`[scraper] Cloudflare challenge détecté : ${url}`);
        const result = emptyResult(url, "anti_bot_cloudflare", "Page Cloudflare / challenge JS — accès serveur bloqué", res.status, res.statusText);
        result.htmlLength = html.length;
        result.htmlPreview = htmlPreview;
        result.isCloudflarePage = true;
        return result;
      }

      if (isJsOnlyPage) {
        console.warn(`[scraper] Page JS-only (${html.length} chars) : ${url}`);
        const result = emptyResult(url, "js_only_page", `Page JS-only (${html.length} chars) — contenu chargé côté client via API`, res.status, res.statusText);
        result.htmlLength = html.length;
        result.htmlPreview = htmlPreview;
        result.isJsOnlyPage = true;
        result.hasNextData = hasNextData;
        return result;
      }

      CACHE.set(url, { html, ts: Date.now() });
      await delay(REQUEST_DELAY_MS);

      return {
        success: true,
        html,
        url,
        finalUrl,
        status: res.status,
        statusText: res.statusText,
        contentType,
        htmlLength: html.length,
        htmlPreview,
        isCloudflarePage,
        isJsOnlyPage,
        hasNextData,
      };
    } catch (err) {
      clearTimeout(timer);

      const isTimeout =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("aborted"));

      if (isTimeout) {
        console.warn(`[scraper] Timeout (${FETCH_TIMEOUT_MS}ms) pour ${url}`);
        if (attempt < MAX_RETRIES) continue;
        return emptyResult(url, "timeout", `Timeout — pas de réponse après ${FETCH_TIMEOUT_MS / 1000}s`);
      }

      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[scraper] Erreur réseau pour ${url}: ${msg}`);
      if (attempt < MAX_RETRIES) continue;
      return emptyResult(url, "network_error", `Erreur réseau : ${msg}`);
    }
  }

  return emptyResult(url, "network_error", "Échec après tous les essais");
}

// Compatibilité : wrapper retournant string | null
export async function fetchHtml(url: string): Promise<string | null> {
  const result = await fetchHtmlDetailed(url);
  return result.html;
}

// ─── Extraction des liens programmes ─────────────────────────────────────────

export type ProgramLink = {
  url: string;
  name?: string;
  city?: string;
};

const LINK_SELECTORS = [
  // Format SeLoger Neuf confirmé : /immobilier/neuf/immo-X/bien-programme/programme-slug/
  "a[href*='/bien-programme/']",
  "a[href*='/annonce-']",
  "a[href*='/annonces/']",
  "a[href*='/programme-neuf/']",
  "a[href*='/programme/']",
  "a[href*='/programmes/']",
  // Sélecteurs génériques (cards, résultats)
  ".CardResultat a[href]",
  ".listing-result a[href]",
  ".product-card a[href]",
  "[data-test='card-title-link']",
  "[data-testid='sl.card-link']",
  "[data-testid='card-link']",
  "article a[href]",
  "[class*='Card'] a[href]",
  "[class*='card'] a[href]",
  "[class*='result'] a[href]",
  "[class*='Result'] a[href]",
  "[class*='listing'] a[href]",
  "[class*='program'] a[href]",
  "[class*='Programme'] a[href]",
  "[class*='Annonce'] a[href]",
  "[class*='annonce'] a[href]",
];

const JSON_ARRAY_KEYS = [
  "listings", "annonces", "programs", "results",
  "data", "items", "cards", "hits", "searchResults",
  "biens", "logements", "programmes", "offres",
  "announcements", "properties", "ads",
];

export function extractProgramLinks(html: string, baseUrl: string): ProgramLink[] {
  const $ = cheerio.load(html);
  const links: ProgramLink[] = [];
  const seen = new Set<string>();

  let totalMatches = 0;
  for (const sel of LINK_SELECTORS) {
    const found = $(sel);
    if (found.length > 0) {
      console.log(`[scraper] Sélecteur "${sel}" → ${found.length} éléments`);
      totalMatches += found.length;
    }

    found.each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href || href === "/" || href === "#" || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let fullUrl: string;
      try {
        fullUrl = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
      } catch {
        return;
      }

      if (!isSeLogerNeufUrl(fullUrl)) return;
      if (seen.has(fullUrl)) return;

      const path = new URL(fullUrl).pathname;
      // Exclure les pages de listing génériques (pas les fiches programmes)
      const isListingRoot =
        path === "/" ||
        /^\/immobilier\/neuf\/immo-[^/]+\/bien-programme\/$/.test(path) ||
        /^\/immobilier\/neuf\/immo-[^/]+\/bien-programme\/\d+-pieces\/$/.test(path);
      if (isListingRoot) return;

      seen.add(fullUrl);
      const name =
        $(el).find("h2, h3, h4, .program-name, [data-test='card-title'], [class*='title']").first().text().trim() ||
        $(el).attr("title") ||
        $(el).text().trim().substring(0, 100) ||
        undefined;

      links.push({ url: fullUrl, name: name || undefined });
    });
  }

  if (totalMatches === 0) {
    const allAnchors = $("a[href]");
    console.log(`[scraper] 0 sélecteur matché — ${allAnchors.length} liens <a> dans la page`);
    const sample: string[] = [];
    allAnchors.each((_, el) => { if (sample.length < 10) sample.push($(el).attr("href") ?? ""); });
    console.log(`[scraper] Sample hrefs: ${JSON.stringify(sample)}`);
  }

  const jsonLinks = extractLinksFromJson($, baseUrl, seen);
  links.push(...jsonLinks);

  console.log(`[scraper] ✓ ${links.length} lien(s) programme extraits depuis ${baseUrl}`);
  return links;
}

function extractLinksFromJson(
  $: ReturnType<typeof cheerio.load>,
  baseUrl: string,
  seen: Set<string>
): ProgramLink[] {
  const links: ProgramLink[] = [];

  try {
    const raw = $("#__NEXT_DATA__").html();
    if (!raw) { console.log(`[scraper] Pas de __NEXT_DATA__`); return links; }

    console.log(`[scraper] __NEXT_DATA__ ${raw.length} chars`);
    const parsed = JSON.parse(raw);
    console.log(`[scraper] __NEXT_DATA__ top keys: ${JSON.stringify(Object.keys(parsed ?? {}))}`);
    if (parsed?.props?.pageProps) {
      console.log(`[scraper] pageProps keys: ${JSON.stringify(Object.keys(parsed.props.pageProps ?? {}))}`);
    }

    const listings = findNestedArray(parsed, JSON_ARRAY_KEYS);
    console.log(`[scraper] Tableaux __NEXT_DATA__: ${listings.length} entrées`);

    for (const rawItem of listings) {
      const item = rawItem as Record<string, unknown>;
      const rawUrl = (item?.url ?? item?.link ?? item?.href ?? item?.detailUrl ?? item?.slug) as string | undefined;
      if (!rawUrl) continue;

      let fullUrl: string;
      try { fullUrl = rawUrl.startsWith("http") ? rawUrl : new URL(rawUrl, baseUrl).toString(); }
      catch { continue; }

      if (!isSeLogerNeufUrl(fullUrl) || seen.has(fullUrl)) continue;
      seen.add(fullUrl);
      links.push({
        url: fullUrl,
        name: (item?.name ?? item?.title ?? item?.programName ?? item?.nom) as string | undefined,
        city: (item?.city ?? item?.commune ?? item?.ville) as string | undefined,
      });
    }
  } catch (err) {
    console.warn(`[scraper] Erreur parsing __NEXT_DATA__:`, err);
  }

  return links;
}

function findNestedArray(obj: unknown, keys: string[], depth = 0): unknown[] {
  if (depth > 8 || !obj || typeof obj !== "object") return [];
  for (const key of keys) {
    const val = (obj as Record<string, unknown>)[key];
    if (Array.isArray(val) && val.length > 0) return val;
  }
  for (const val of Object.values(obj as Record<string, unknown>)) {
    if (val && typeof val === "object") {
      const found = findNestedArray(val, keys, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

export function clearCache(): void {
  CACHE.clear();
}

// ─── Classification des liens ─────────────────────────────────────────────────

const CATEGORY_NAME_PATTERNS = [
  /achat\s+immobilier\s+neuf/i,
  /programme[s]?\s+neuf[s]?\s+(en|à|dans|sur)\s/i,
  /logement[s]?\s+neuf[s]?\s+(en|à|dans)\s/i,
  /appartement[s]?\s+neuf[s]?\s+(en|à|dans)\s/i,
  /biens?\s+neufs?\s+(en|à|dans)\s/i,
  /immobilier\s+neuf\s+(en|à|dans)\s/i,
  /[ÎI]le-de-France/i,
  /Hauts-de-Seine/,
  /éligible\s+LMNP/i,
  /eligible\s+LMNP/i,
  /avec\s+terrasse/i,
  /avec\s+piscine/i,
  /avec\s+jardin/i,
  /programmes?\s+neufs?\s+à\s+vendre/i,
];

const BIEN_PROGRAMME_FILTER_SLUGS = new Set([
  "avec-terrasse",
  "eligible-lmnp",
  "avec-piscine",
  "avec-jardin",
  "accessible",
  "loi-pinel",
  "primo-accedant",
  "investissement-locatif",
  "neuf-eligible-ptz",
  "neuf-lmnp",
  "en-vefa",
  "neuf-eligible-pret-taux-zero",
]);

export function classifyLink(link: ProgramLink): LinkType {
  let parsed: URL;
  try {
    parsed = new URL(link.url);
  } catch {
    return "unknown";
  }

  const path = parsed.pathname.toLowerCase();

  if (path === "/" || path === "") return "navigation";

  if (
    path.includes("/promoteurs/") ||
    path.includes("/promoteur/") ||
    path.includes("/constructeurs/") ||
    path.includes("/constructeur/")
  ) {
    return "promoter";
  }

  if (path.startsWith("/annonces/neuf/programme/")) return "program";

  if (path.includes("/bien-programme/")) {
    return "category";
  }

  if (path.includes("/annonce-")) return "program";

  if (path.startsWith("/immobilier/neuf/") && !path.includes("/bien-programme/")) {
    return "category";
  }

  if (link.name && CATEGORY_NAME_PATTERNS.some((p) => p.test(link.name!))) {
    return "category";
  }

  return "unknown";
}
