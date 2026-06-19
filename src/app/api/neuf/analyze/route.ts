import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/neuf/geocode";
import { buildAllSearchUrls } from "@/lib/neuf/searchUrls";
import { fetchHtmlDetailed, extractProgramLinks } from "@/lib/neuf/scraper";
import { parseProgramPage } from "@/lib/neuf/parser";
import { normalizePrograms, filterByTypologies } from "@/lib/neuf/normalize";
import { buildWarnings } from "@/lib/neuf/stats";
import type {
  NeufAnalysisInput,
  NeufAnalysisResult,
  NeufProgram,
  ScrapeReport,
  ScrapeUrlResult,
} from "@/types/neuf";

const MAX_PROGRAMS = 30;
const MAX_SEARCH_PAGES = 3;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: NeufAnalysisInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide (JSON attendu)" }, { status: 400 });
  }

  const { address, radiusKm, typologies, cityOnly = true } = body;

  if (!address || typeof address !== "string" || address.trim().length < 3) {
    return NextResponse.json({ error: "Adresse invalide ou trop courte" }, { status: 400 });
  }

  console.log(`\n[analyze] ══════════════════════════════════════`);
  console.log(`[analyze] Nouvelle analyse — adresse: "${address}"`);
  console.log(`[analyze] cityOnly: ${cityOnly}, radiusKm: ${radiusKm}`);

  // ── 1. Géocodage ──────────────────────────────────────────────────────────
  let geocodedAddress;
  try {
    geocodedAddress = await geocodeAddress(address.trim());
    console.log(`[analyze] Géocodage OK → ville: "${geocodedAddress.city}", CP: ${geocodedAddress.postalCode}`);
  } catch (err) {
    console.error(`[analyze] Échec géocodage:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Géocodage échoué" },
      { status: 422 }
    );
  }

  const warnings: string[] = [];
  const programs: NeufProgram[] = [];
  const urlResults: ScrapeUrlResult[] = [];

  // ── 2. Génération des URLs de recherche ───────────────────────────────────
  const searchUrls = buildAllSearchUrls(
    {
      city: geocodedAddress.city,
      postalCode: geocodedAddress.postalCode,
      radiusKm: cityOnly ? undefined : radiusKm,
    },
    MAX_SEARCH_PAGES
  );

  console.log(`[analyze] ${searchUrls.length} URLs de recherche générées:`);
  searchUrls.forEach((u, i) => console.log(`[analyze]   ${i + 1}. ${u}`));

  const programLinks = new Map<string, { url: string; name?: string; city?: string }>();

  // ── 3. Scraping des pages de résultats ────────────────────────────────────
  for (const searchUrl of searchUrls) {
    console.log(`\n[analyze] ── Recherche : ${searchUrl}`);

    const fetchResult = await fetchHtmlDetailed(searchUrl);

    console.log(`[analyze] Résultat fetch:`);
    console.log(`[analyze]   status: ${fetchResult.status ?? "N/A"} ${fetchResult.statusText ?? ""}`);
    console.log(`[analyze]   errorType: ${fetchResult.errorType ?? "aucune"}`);
    console.log(`[analyze]   htmlLength: ${fetchResult.htmlLength}`);
    console.log(`[analyze]   Cloudflare: ${fetchResult.isCloudflarePage} | JS-only: ${fetchResult.isJsOnlyPage} | __NEXT_DATA__: ${fetchResult.hasNextData}`);
    if (fetchResult.htmlPreview) {
      console.log(`[analyze]   Aperçu HTML: ${fetchResult.htmlPreview.substring(0, 200)}`);
    }

    let linksFound = 0;

    if (fetchResult.success && fetchResult.html) {
      const links = extractProgramLinks(fetchResult.html, searchUrl);
      linksFound = links.length;
      console.log(`[analyze] ${links.length} lien(s) programme trouvé(s)`);

      for (const link of links) {
        if (!programLinks.has(link.url)) {
          programLinks.set(link.url, link);
          console.log(`[analyze]   → ${link.url}`);
        }
      }
    } else {
      console.warn(`[analyze] Fetch échoué : ${fetchResult.errorMessage}`);
      if (fetchResult.errorMessage) {
        warnings.push(`[${searchUrl}] ${fetchResult.errorMessage}`);
      }
    }

    urlResults.push({
      url: searchUrl,
      status: fetchResult.status,
      statusText: fetchResult.statusText,
      errorType: fetchResult.errorType,
      errorMessage: fetchResult.errorMessage,
      linksFound,
      isCloudflarePage: fetchResult.isCloudflarePage,
      isJsOnlyPage: fetchResult.isJsOnlyPage,
      hasNextData: fetchResult.hasNextData,
      htmlLength: fetchResult.htmlLength,
      htmlPreview: fetchResult.htmlPreview.substring(0, 200),
    });

    if (programLinks.size >= MAX_PROGRAMS) break;
  }

  console.log(`\n[analyze] ══ ${programLinks.size} programme(s) unique(s) trouvé(s) au total`);

  // ── 4. Extraction des pages programmes ────────────────────────────────────
  let count = 0;
  for (const [url, link] of programLinks) {
    if (count >= MAX_PROGRAMS) break;

    console.log(`\n[analyze] ── Programme : ${url}`);
    const fetchResult = await fetchHtmlDetailed(url);

    if (!fetchResult.success || !fetchResult.html) {
      console.warn(`[analyze] Fetch programme échoué : ${fetchResult.errorMessage}`);
      continue;
    }

    const prog = parseProgramPage(
      fetchResult.html,
      url,
      link.city ?? geocodedAddress.city,
      geocodedAddress.postalCode,
      "Commune principale"
    );

    if (prog) {
      console.log(`[analyze] Programme extrait : "${prog.programName}" — ${prog.listings.length} lot(s)`);
      programs.push(prog);
      count++;
    } else {
      console.warn(`[analyze] parseProgramPage → null pour ${url}`);
    }
  }

  console.log(`\n[analyze] ══ ${programs.length} programme(s) parsé(s)`);

  // ── 5. Normalisation ──────────────────────────────────────────────────────
  let normalizedPrograms = normalizePrograms(programs);
  if (typologies && typologies.length > 0) {
    normalizedPrograms = filterByTypologies(normalizedPrograms, typologies);
  }

  const allListings = normalizedPrograms.flatMap((p) => p.listings);
  const includedListings = allListings.filter((l) => !l.excludedFromStats);

  // ── 6. Rapport de scraping ────────────────────────────────────────────────
  const blocked403 = urlResults.filter((r) => r.errorType === "http_403").length;
  const blocked429 = urlResults.filter((r) => r.errorType === "http_429").length;
  const networkErrors = urlResults.filter((r) => r.errorType === "network_error").length;
  const timeouts = urlResults.filter((r) => r.errorType === "timeout").length;
  const cloudflareBlocks = urlResults.filter((r) => r.errorType === "anti_bot_cloudflare" || r.isCloudflarePage).length;
  const jsOnlyPages = urlResults.filter((r) => r.errorType === "js_only_page" || r.isJsOnlyPage).length;
  const successfulPages = urlResults.filter((r) => r.linksFound > 0 || (r.htmlLength > 2000 && !r.isCloudflarePage)).length;
  const totalLinksFound = programLinks.size;

  let diagnosis: string | undefined;
  if (normalizedPrograms.length === 0) {
    if (blocked403 > 0 || cloudflareBlocks > 0) {
      diagnosis =
        "SeLoger Neuf bloque les requêtes serveur (HTTP 403 / Cloudflare anti-bot). " +
        "Le site refuse l'accès depuis les IPs des serveurs Vercel. " +
        "Sans navigateur headless ou proxy résidentiel, le scraping est impossible.";
    } else if (jsOnlyPages > 0) {
      diagnosis =
        "Les pages SeLoger Neuf sont rendues côté client (JavaScript). " +
        "Le HTML reçu est vide — les annonces sont chargées via des appels API. " +
        "Un navigateur headless (Puppeteer, Playwright) serait nécessaire.";
    } else if (timeouts > 0) {
      diagnosis =
        "Les requêtes vers SeLoger Neuf ont expiré (timeout). " +
        "Le site peut bloquer les connexions depuis Vercel ou répondre trop lentement.";
    } else if (networkErrors > 0) {
      diagnosis =
        "Erreurs réseau lors de l'accès à SeLoger Neuf. " +
        "Vérifier la connectivité de l'environnement Vercel.";
    } else if (totalLinksFound === 0) {
      diagnosis =
        "Les pages ont été récupérées mais aucun lien de programme n'a été trouvé. " +
        "SeLoger Neuf a peut-être changé sa structure HTML ou ses sélecteurs CSS.";
    }
  }

  const scrapeReport: ScrapeReport = {
    searchUrlsTested: urlResults.length,
    urlResults,
    totalLinksFound,
    blocked403,
    blocked429,
    networkErrors,
    timeouts,
    cloudflareBlocks,
    jsOnlyPages,
    successfulPages,
    diagnosis,
  };

  // ── 7. Avertissements ─────────────────────────────────────────────────────
  const builtWarnings = buildWarnings(normalizedPrograms, allListings.length, includedListings.length);
  warnings.push(...builtWarnings);

  if (diagnosis) {
    warnings.unshift(`⛔ ${diagnosis}`);
  } else if (normalizedPrograms.length === 0) {
    warnings.unshift("Aucune offre neuve exploitable trouvée sur SeLoger Neuf pour cette commune.");
  }

  const result: NeufAnalysisResult = {
    input: body,
    geocodedAddress,
    programs: normalizedPrograms,
    listings: allListings,
    warnings: [...new Set(warnings)],
    hasData: normalizedPrograms.length > 0 && allListings.length > 0,
    extractedAt: new Date().toISOString(),
    scrapeReport,
  };

  console.log(`[analyze] ✓ Fin — ${normalizedPrograms.length} prog, ${allListings.length} lots | diagnosis: ${diagnosis ?? "aucun"}`);
  return NextResponse.json(result, { status: 200 });
}
