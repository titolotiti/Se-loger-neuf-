import * as cheerio from "cheerio";

const CACHE = new Map<string, { html: string; ts: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const REQUEST_DELAY_MS = 1500;
const MAX_RETRIES = 2;

const SELOGER_NEUF_DOMAINS = [
  "selogerneuf.com",
  "www.selogerneuf.com",
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

export type FetchDebugInfo = {
  url: string;
  status: number | null;
  htmlLength: number;
  htmlPreview: string;
  contentType: string | null;
  isCloudflarePage: boolean;
  isJsOnlyPage: boolean;
  hasNextData: boolean;
  hasContent: boolean;
  programLinksFound?: number;
  nextDataKeys?: string[];
  nextDataPropsKeys?: string[];
  nextDataPagePropsKeys?: string[];
  anchorsCount?: number;
  sampleHrefs?: string[];
  error?: string;
};

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

export async function fetchHtml(url: string): Promise<string | null> {
  if (!isSeLogerNeufUrl(url)) {
    console.warn(`[scraper] URL refusée (hors SeLoger Neuf) : ${url}`);
    return null;
  }

  const cached = CACHE.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[scraper] Cache HIT : ${url}`);
    return cached.html;
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await delay(REQUEST_DELAY_MS * attempt);

    try {
      console.log(`[scraper] Fetch attempt ${attempt + 1}/${MAX_RETRIES + 1} : ${url}`);

      const res = await fetch(url, { headers: FETCH_HEADERS, redirect: "follow" });
      const contentType = res.headers.get("content-type") ?? "";

      console.log(`[scraper] HTTP ${res.status} | Content-Type: ${contentType} | URL: ${url}`);

      if (res.status === 403 || res.status === 429) {
        console.warn(`[scraper] Accès refusé (${res.status}) — anti-bot probable : ${url}`);
        return null;
      }

      if (!res.ok) {
        console.warn(`[scraper] HTTP ${res.status} pour ${url}`);
        if (attempt < MAX_RETRIES) continue;
        return null;
      }

      const html = await res.text();

      const isCloudflarePage =
        html.toLowerCase().includes("just a moment") ||
        html.toLowerCase().includes("cloudflare") ||
        html.toLowerCase().includes("checking your browser") ||
        html.toLowerCase().includes("enable javascript");
      const isJsOnlyPage = html.length < 3000 && html.includes("<script");
      const hasNextData = html.includes("__NEXT_DATA__");

      console.log(`[scraper] HTML longueur: ${html.length} | Cloudflare: ${isCloudflarePage} | JS-only: ${isJsOnlyPage} | __NEXT_DATA__: ${hasNextData}`);
      console.log(`[scraper] Aperçu HTML: ${html.substring(0, 300).replace(/\s+/g, " ").trim()}`);

      if (isCloudflarePage) {
        console.warn(`[scraper] ⚠ Page Cloudflare/challenge détectée : ${url}`);
      }
      if (isJsOnlyPage) {
        console.warn(`[scraper] ⚠ Page JS-only (${html.length} chars) — contenu client-side : ${url}`);
      }

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

export async function fetchHtmlWithDebug(url: string): Promise<FetchDebugInfo> {
  const info: FetchDebugInfo = {
    url,
    status: null,
    htmlLength: 0,
    htmlPreview: "",
    contentType: null,
    isCloudflarePage: false,
    isJsOnlyPage: false,
    hasNextData: false,
    hasContent: false,
  };

  if (!isSeLogerNeufUrl(url)) {
    info.error = "URL refusée (hors SeLoger Neuf)";
    return info;
  }

  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, redirect: "follow" });
    info.status = res.status;
    info.contentType = res.headers.get("content-type");

    if (!res.ok) {
      info.error = `HTTP ${res.status}`;
      return info;
    }

    const html = await res.text();
    info.htmlLength = html.length;
    info.htmlPreview = html.substring(0, 500).replace(/\s+/g, " ").trim();
    info.hasNextData = html.includes("__NEXT_DATA__");
    info.hasContent = html.length > 2000;
    info.isCloudflarePage =
      html.toLowerCase().includes("just a moment") ||
      html.toLowerCase().includes("cloudflare") ||
      html.toLowerCase().includes("checking your browser");
    info.isJsOnlyPage = html.length < 3000 && html.includes("<script");

    // Inspecter __NEXT_DATA__
    if (info.hasNextData) {
      try {
        const $ = cheerio.load(html);
        const raw = $("#__NEXT_DATA__").html();
        if (raw) {
          const parsed = JSON.parse(raw);
          info.nextDataKeys = Object.keys(parsed ?? {});
          if (parsed?.props) {
            info.nextDataPropsKeys = Object.keys(parsed.props ?? {});
            if (parsed.props?.pageProps) {
              info.nextDataPagePropsKeys = Object.keys(parsed.props.pageProps ?? {});
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // Compter les ancres
    const $ = cheerio.load(html);
    const anchors = $("a[href]");
    info.anchorsCount = anchors.length;
    const hrefs: string[] = [];
    anchors.each((_, el) => {
      if (hrefs.length < 20) hrefs.push($(el).attr("href") ?? "");
    });
    info.sampleHrefs = hrefs;

    const links = extractProgramLinks(html, url);
    info.programLinksFound = links.length;
  } catch (err) {
    info.error = err instanceof Error ? err.message : "Erreur réseau";
  }

  return info;
}

export type ProgramLink = {
  url: string;
  name?: string;
  city?: string;
};

const LINK_SELECTORS = [
  "a[href*='/annonces/']",
  "a[href*='/programme-neuf/']",
  "a[href*='/programme/']",
  "a[href*='/programmes/']",
  "a[href*='/achat/']",
  "a[href*='/immobilier/achat/']",
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
];

const JSON_ARRAY_KEYS = [
  "listings", "annonces", "programs", "results",
  "data", "items", "cards", "hits", "searchResults",
  "biens", "logements", "programmes", "offres",
  "announcements", "properties", "ads", "annoncesResult",
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
      if (path === "/" || path === "/achat/" || path === "/immobilier/") return;

      seen.add(fullUrl);

      const name =
        $(el)
          .find("h2, h3, h4, .program-name, .titre, [data-test='card-title'], [class*='title'], [class*='Title']")
          .first()
          .text()
          .trim() ||
        $(el).attr("title") ||
        $(el).text().trim().substring(0, 100) ||
        undefined;

      links.push({ url: fullUrl, name: name || undefined });
    });
  }

  if (totalMatches === 0) {
    const allAnchors = $("a[href]");
    console.log(`[scraper] 0 sélecteur matché — ${allAnchors.length} liens <a> au total dans la page`);
    const sampleHrefs: string[] = [];
    allAnchors.each((_, el) => {
      if (sampleHrefs.length < 15) sampleHrefs.push($(el).attr("href") ?? "");
    });
    console.log(`[scraper] Exemples href: ${JSON.stringify(sampleHrefs)}`);
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
    if (raw) {
      console.log(`[scraper] __NEXT_DATA__ trouvé (${raw.length} chars) — tentative extraction liens`);
      const parsed = JSON.parse(raw);
      console.log(`[scraper] __NEXT_DATA__ top keys: ${JSON.stringify(Object.keys(parsed ?? {}))}`);
      if (parsed?.props?.pageProps) {
        console.log(`[scraper] pageProps keys: ${JSON.stringify(Object.keys(parsed.props.pageProps ?? {}))}`);
      }

      const listings = findNestedArray(parsed, JSON_ARRAY_KEYS);
      console.log(`[scraper] Entrées tableau trouvées dans __NEXT_DATA__: ${listings.length}`);

      for (const rawItem of listings) {
        const item = rawItem as Record<string, unknown>;
        const rawUrl =
          (item?.url ?? item?.link ?? item?.href ?? item?.detailUrl ?? item?.slug) as string | undefined;
        if (!rawUrl) continue;

        let fullUrl: string;
        try {
          fullUrl = rawUrl.startsWith("http") ? rawUrl : new URL(rawUrl, baseUrl).toString();
        } catch {
          continue;
        }

        if (!isSeLogerNeufUrl(fullUrl)) continue;
        if (seen.has(fullUrl)) continue;
        seen.add(fullUrl);
        links.push({
          url: fullUrl,
          name: (item?.name ?? item?.title ?? item?.programName ?? item?.nom) as string | undefined,
          city: (item?.city ?? item?.commune ?? item?.ville) as string | undefined,
        });
      }
    } else {
      console.log(`[scraper] Pas de __NEXT_DATA__ dans la page`);
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
