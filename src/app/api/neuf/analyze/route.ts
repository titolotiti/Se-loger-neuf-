import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/neuf/geocode";
import { buildAllSearchUrls } from "@/lib/neuf/searchUrls";
import { fetchHtmlDetailed, extractProgramLinks, classifyLink } from "@/lib/neuf/scraper";
import { parseProgramPage } from "@/lib/neuf/parser";
import { normalizePrograms, filterByTypologies } from "@/lib/neuf/normalize";
import { buildWarnings } from "@/lib/neuf/stats";
import type {
  NeufAnalysisInput,
  NeufAnalysisResult,
  NeufProgram,
  ScrapeReport,
  ScrapeUrlResult,
  ScrapeDiagnosisType,
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

  console.log(`\n[analyze] ══ ${programLinks.size} lien(s) unique(s) trouvé(s) au total`);

  // ── 3b. Classification et filtrage des liens ──────────────────────────────
  let categoryLinksSkipped = 0;
  let promoterLinksSkipped = 0;
  let programLinksRetained = 0;

  const filteredLinks = new Map<string, { url: string; name?: string; city?: string }>();
  for (const [url, link] of programLinks) {
    const linkType = classifyLink(link);
    if (linkType === "category") {
      categoryLinksSkipped++;
      console.log(`[analyze] ↷ Catégorie ignorée : ${url}`);
    } else if (linkType === "promoter") {
      promoterLinksSkipped++;
      console.log(`[analyze] ↷ Promoteur ignoré : ${url}`);
    } else if (linkType === "navigation") {
      console.log(`[analyze] ↷ Navigation ignorée : ${url}`);
    } else {
      filteredLinks.set(url, link);
      programLinksRetained++;
      console.log(`[analyze] ✓ Programme retenu [${linkType}] : ${url}`);
    }
  }
  console.log(`[analyze] ══ Filtrage : ${programLinks.size} bruts → ${categoryLinksSkipped} catégories + ${promoterLinksSkipped} promoteurs ignorés → ${programLinksRetained} à analyser`);

  // ── 4. Extraction des pages programmes ────────────────────────────────────
  let count = 0;
  for (const [url, link] of filteredLinks) {
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
  const not404 = urlResults.filter((r) => r.errorType !== "http_404");
  const blocked403 = urlResults.filter((r) => r.errorType === "http_403").length;
  const blocked429 = urlResults.filter((r) => r.errorType === "http_429").length;
  const notFound404 = urlResults.filter((r) => r.errorType === "http_404").length;
  const networkErrors = urlResults.filter((r) => r.errorType === "network_error").length;
  const timeouts = urlResults.filter((r) => r.errorType === "timeout").length;
  const cloudflareBlocks = urlResults.filter((r) => r.errorType === "anti_bot_cloudflare" || r.isCloudflarePage).length;
  const jsOnlyPages = urlResults.filter((r) => r.errorType === "js_only_page" || r.isJsOnlyPage).length;
  const successfulPages = urlResults.filter((r) => r.linksFound > 0 || (r.htmlLength > 2000 && !r.isCloudflarePage)).length;
  const totalLinksFound = programLinks.size;

  console.log(`[analyze] Rapport URLs — 404: ${notFound404}, 403: ${blocked403}, CF: ${cloudflareBlocks}, JS-only: ${jsOnlyPages}, timeout: ${timeouts}, réseau: ${networkErrors}, ok: ${successfulPages}`);

  let diagnosis: string | undefined;
  let diagnosisType: ScrapeDiagnosisType | undefined;

  if (normalizedPrograms.length === 0) {
    if (blocked403 > 0 || cloudflareBlocks > 0) {
      diagnosisType = "blocked";
      diagnosis =
        "SeLoger Neuf bloque les requêtes serveur (HTTP 403 / protection anti-bot). " +
        "Le site refuse l'accès depuis les IPs des serveurs Vercel. " +
        "Sans navigateur headless ou proxy résidentiel, le scraping direct est impossible.";
    } else if (blocked429 > 0) {
      diagnosisType = "blocked";
      diagnosis =
        "SeLoger Neuf a renvoyé HTTP 429 (trop de requêtes). " +
        "Attendre avant de relancer l'analyse.";
    } else if (notFound404 > 0 && not404.filter((r) => !r.errorType).length === 0) {
      // Toutes les URLs retournent 404 — format URL incorrect
      diagnosisType = "url_error";
      diagnosis =
        `URL SeLoger Neuf invalide ou inexistante (HTTP 404 sur ${notFound404} URL(s)). ` +
        "Le format des URLs générées ne correspond pas à la structure réelle du site.";
    } else if (jsOnlyPages > 0) {
      diagnosisType = "js_only";
      diagnosis =
        "Les pages SeLoger Neuf sont rendues côté client (JavaScript). " +
        "Le HTML reçu est vide — les annonces sont chargées via API. " +
        "Un navigateur headless serait nécessaire pour récupérer le contenu.";
    } else if (timeouts > 0 && successfulPages === 0) {
      diagnosisType = "timeout";
      diagnosis =
        "Les requêtes vers SeLoger Neuf ont expiré (timeout > 15s). " +
        "Le site peut bloquer ou ralentir les connexions depuis Vercel.";
    } else if (networkErrors > 0 && successfulPages === 0) {
      diagnosisType = "network";
      diagnosis =
        "Erreurs réseau lors de l'accès à SeLoger Neuf depuis Vercel. " +
        "Vérifier la connectivité sortante de l'environnement serverless.";
    } else if (totalLinksFound === 0 && successfulPages > 0) {
      diagnosisType = "no_links";
      diagnosis =
        "Pages récupérées avec succès mais aucun lien de programme détecté. " +
        "SeLoger Neuf a peut-être changé sa structure HTML ou ses classes CSS.";
    }
  }

  const lotsExtracted = programs.reduce((acc, p) => acc + p.listings.length, 0);

  const scrapeReport: ScrapeReport = {
    searchUrlsTested: urlResults.length,
    urlResults,
    totalLinksFound,
    blocked403,
    blocked429,
    notFound404,
    networkErrors,
    timeouts,
    cloudflareBlocks,
    jsOnlyPages,
    successfulPages,
    diagnosisType,
    diagnosis,
    categoryLinksSkipped,
    promoterLinksSkipped,
    programLinksRetained,
    detailPagesFetched: count,
    lotsExtracted,
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
