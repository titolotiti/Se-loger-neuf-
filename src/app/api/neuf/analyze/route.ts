import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/neuf/geocode";
import { buildAllSearchUrls } from "@/lib/neuf/searchUrls";
import { fetchHtml, extractProgramLinks } from "@/lib/neuf/scraper";
import { parseProgramPage } from "@/lib/neuf/parser";
import { normalizePrograms, filterByTypologies } from "@/lib/neuf/normalize";
import { buildWarnings } from "@/lib/neuf/stats";
import type { NeufAnalysisInput, NeufAnalysisResult, NeufProgram } from "@/types/neuf";

const MAX_PROGRAMS = 30;
const MAX_SEARCH_PAGES = 3;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: NeufAnalysisInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide (JSON attendu)" }, { status: 400 });
  }

  const { address, radiusKm, includeBorderCities = false, typologies, cityOnly = true } = body;

  if (!address || typeof address !== "string" || address.trim().length < 3) {
    return NextResponse.json({ error: "Adresse invalide ou trop courte" }, { status: 400 });
  }

  console.log(`[analyze] ══ Nouvelle analyse ══ adresse: "${address}"`);

  // ── 1. Géocodage ──────────────────────────────────────────────────────────
  let geocodedAddress;
  try {
    geocodedAddress = await geocodeAddress(address.trim());
    console.log(`[analyze] Géocodage OK → ville: ${geocodedAddress.city}, CP: ${geocodedAddress.postalCode}, dept: ${geocodedAddress.department}`);
  } catch (err) {
    console.error(`[analyze] Échec géocodage:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Géocodage échoué" },
      { status: 422 }
    );
  }

  const warnings: string[] = [];
  const programs: NeufProgram[] = [];

  // ── 2. Génération des URLs de recherche ───────────────────────────────────
  const searchUrls = buildAllSearchUrls(
    {
      city: geocodedAddress.city,
      postalCode: geocodedAddress.postalCode,
      radiusKm: cityOnly ? undefined : radiusKm,
    },
    MAX_SEARCH_PAGES
  );

  console.log(`[analyze] ${searchUrls.length} URLs de recherche générées :`);
  searchUrls.forEach((u, i) => console.log(`[analyze]   ${i + 1}. ${u}`));

  const programLinks = new Map<string, { url: string; name?: string; city?: string }>();

  // ── 3. Scraping des pages de résultats ────────────────────────────────────
  for (const searchUrl of searchUrls) {
    try {
      console.log(`\n[analyze] ── Scraping page de recherche : ${searchUrl}`);
      const html = await fetchHtml(searchUrl);

      if (!html) {
        console.warn(`[analyze] HTML null pour ${searchUrl} — bloqué ou erreur réseau`);
        warnings.push(`Page inaccessible : ${searchUrl}`);
        continue;
      }

      console.log(`[analyze] HTML reçu (${html.length} chars) — extraction des liens programmes`);
      const links = extractProgramLinks(html, searchUrl);
      console.log(`[analyze] ${links.length} lien(s) programme trouvé(s) dans ${searchUrl}`);

      for (const link of links) {
        if (!programLinks.has(link.url)) {
          programLinks.set(link.url, link);
          console.log(`[analyze]   → ${link.url} (${link.name ?? "sans nom"})`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "inconnue";
      console.error(`[analyze] Erreur recherche ${searchUrl}:`, msg);
      warnings.push(`Erreur lors de la recherche : ${msg}`);
    }

    if (programLinks.size >= MAX_PROGRAMS) break;
  }

  console.log(`\n[analyze] ══ ${programLinks.size} programme(s) unique(s) trouvé(s) au total ══`);

  if (programLinks.size === 0) {
    console.warn(`[analyze] ⚠ Aucun lien de programme trouvé — vérifier les URLs et le HTML retourné`);
    warnings.push(
      "Aucun programme trouvé dans les pages de résultats SeLoger Neuf. " +
      "Le site peut bloquer les requêtes serveur (anti-bot) ou avoir changé de structure."
    );
  }

  // ── 4. Extraction des programmes ──────────────────────────────────────────
  let count = 0;
  for (const [url, link] of programLinks) {
    if (count >= MAX_PROGRAMS) break;
    try {
      console.log(`\n[analyze] ── Extraction programme : ${url}`);
      const html = await fetchHtml(url);

      if (!html) {
        console.warn(`[analyze] HTML null pour programme ${url}`);
        continue;
      }

      const prog = parseProgramPage(
        html,
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
        console.warn(`[analyze] parseProgramPage a retourné null pour ${url}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "inconnue";
      console.error(`[analyze] Erreur extraction ${url}:`, msg);
      warnings.push(`Erreur extraction programme : ${msg}`);
    }
  }

  console.log(`\n[analyze] ══ ${programs.length} programme(s) parsé(s) avec succès ══`);

  // ── 5. Normalisation ──────────────────────────────────────────────────────
  let normalizedPrograms = normalizePrograms(programs);

  if (typologies && typologies.length > 0) {
    normalizedPrograms = filterByTypologies(normalizedPrograms, typologies);
  }

  const allListings = normalizedPrograms.flatMap((p) => p.listings);
  const includedListings = allListings.filter((l) => !l.excludedFromStats);

  console.log(`[analyze] Lots totaux: ${allListings.length}, inclus dans stats: ${includedListings.length}`);

  // ── 6. Avertissements ─────────────────────────────────────────────────────
  const builtWarnings = buildWarnings(normalizedPrograms, allListings.length, includedListings.length);
  warnings.push(...builtWarnings);

  if (normalizedPrograms.length === 0) {
    warnings.unshift(
      "Aucune offre neuve exploitable trouvée sur SeLoger Neuf pour cette adresse / commune."
    );
  }

  const result: NeufAnalysisResult = {
    input: body,
    geocodedAddress,
    programs: normalizedPrograms,
    listings: allListings,
    warnings: [...new Set(warnings)],
    hasData: normalizedPrograms.length > 0 && allListings.length > 0,
    extractedAt: new Date().toISOString(),
  };

  console.log(`[analyze] ✓ Analyse terminée — ${normalizedPrograms.length} programme(s), ${allListings.length} lot(s)`);
  return NextResponse.json(result, { status: 200 });
}
