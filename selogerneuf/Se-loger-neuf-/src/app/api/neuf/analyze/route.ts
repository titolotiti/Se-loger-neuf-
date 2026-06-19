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

  // ── 1. Géocodage ──────────────────────────────────────────────────────────
  let geocodedAddress;
  try {
    geocodedAddress = await geocodeAddress(address.trim());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Géocodage échoué" },
      { status: 422 }
    );
  }

  const warnings: string[] = [];
  const programs: NeufProgram[] = [];

  // ── 2. Recherche sur SeLoger Neuf ─────────────────────────────────────────
  const searchUrls = buildAllSearchUrls(
    {
      city: geocodedAddress.city,
      postalCode: geocodedAddress.postalCode,
      radiusKm: cityOnly ? undefined : radiusKm,
    },
    MAX_SEARCH_PAGES
  );

  const programLinks = new Map<string, { url: string; name?: string; city?: string }>();

  for (const searchUrl of searchUrls) {
    try {
      const html = await fetchHtml(searchUrl);
      if (!html) continue;
      const links = extractProgramLinks(html, searchUrl);
      for (const link of links) {
        if (!programLinks.has(link.url)) {
          programLinks.set(link.url, link);
        }
      }
    } catch (err) {
      warnings.push(`Erreur lors de la recherche sur ${searchUrl}: ${err instanceof Error ? err.message : "inconnue"}`);
    }

    if (programLinks.size >= MAX_PROGRAMS) break;
  }

  // ── 3. Extraction des programmes ──────────────────────────────────────────
  let count = 0;
  for (const [url, link] of programLinks) {
    if (count >= MAX_PROGRAMS) break;
    try {
      const html = await fetchHtml(url);
      if (!html) continue;

      const prog = parseProgramPage(
        html,
        url,
        link.city ?? geocodedAddress.city,
        geocodedAddress.postalCode,
        "Commune principale"
      );

      if (prog) {
        programs.push(prog);
        count++;
      }
    } catch (err) {
      warnings.push(`Erreur extraction programme ${url}: ${err instanceof Error ? err.message : "inconnue"}`);
    }
  }

  // ── 4. Normalisation ──────────────────────────────────────────────────────
  let normalizedPrograms = normalizePrograms(programs);

  if (typologies && typologies.length > 0) {
    normalizedPrograms = filterByTypologies(normalizedPrograms, typologies);
  }

  const allListings = normalizedPrograms.flatMap((p) => p.listings);
  const includedListings = allListings.filter((l) => !l.excludedFromStats);

  // ── 5. Avertissements ─────────────────────────────────────────────────────
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

  return NextResponse.json(result, { status: 200 });
}
