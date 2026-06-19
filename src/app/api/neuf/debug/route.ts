import { NextRequest, NextResponse } from "next/server";
import { fetchHtmlWithDebug, isSeLogerNeufUrl, extractProgramLinks } from "@/lib/neuf/scraper";
import { buildAllSearchUrls } from "@/lib/neuf/searchUrls";
import { geocodeAddress } from "@/lib/neuf/geocode";

/**
 * Endpoint de diagnostic pour comprendre pourquoi le scraper retourne 0 résultat.
 *
 * POST /api/neuf/debug
 * Body : { url?: string } — teste une URL précise
 *        { address?: string } — géocode et génère les URLs de recherche, les teste toutes
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { url?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  // ── Mode URL directe ──────────────────────────────────────────────────────
  if (body.url) {
    const { url } = body;

    if (!isSeLogerNeufUrl(url)) {
      return NextResponse.json({ error: "URL refusée — hors SeLoger Neuf" }, { status: 400 });
    }

    const info = await fetchHtmlWithDebug(url);
    return NextResponse.json({ mode: "url", result: info });
  }

  // ── Mode adresse : géocode + génère + teste toutes les URLs ──────────────
  if (body.address) {
    const { address } = body;
    const report: Record<string, unknown> = { address, steps: [] };
    const steps = report.steps as unknown[];

    // Géocodage
    let geocodedAddress;
    try {
      geocodedAddress = await geocodeAddress(address);
      steps.push({ step: "geocode", ok: true, result: geocodedAddress });
    } catch (err) {
      steps.push({ step: "geocode", ok: false, error: String(err) });
      return NextResponse.json({ mode: "address", ...report });
    }

    // Génération URLs
    const searchUrls = buildAllSearchUrls(
      { city: geocodedAddress.city, postalCode: geocodedAddress.postalCode },
      2
    );
    steps.push({ step: "searchUrls", urls: searchUrls });

    // Test de chaque URL
    const urlResults = [];
    for (const url of searchUrls) {
      const info = await fetchHtmlWithDebug(url);
      urlResults.push(info);

      // Petit délai pour ne pas spammer
      await new Promise((r) => setTimeout(r, 800));
    }

    steps.push({ step: "urlTests", results: urlResults });

    // Résumé
    const totalLinks = urlResults.reduce((sum, r) => sum + (r.programLinksFound ?? 0), 0);
    const blocked = urlResults.filter((r) => r.isCloudflarePage || r.status === 403 || r.status === 429);
    const jsOnly = urlResults.filter((r) => r.isJsOnlyPage);
    const ok = urlResults.filter((r) => r.hasContent && !r.isCloudflarePage);

    steps.push({
      step: "summary",
      totalUrlsTested: searchUrls.length,
      totalProgramLinksFound: totalLinks,
      pagesBlocked: blocked.length,
      pagesJsOnly: jsOnly.length,
      pagesWithContent: ok.length,
      diagnosis:
        blocked.length > 0
          ? "Anti-bot / Cloudflare bloque les requêtes serveur. Impossible de scraper sans navigateur headless."
          : jsOnly.length > 0
          ? "Pages JS-only — le contenu est chargé côté client via API. __NEXT_DATA__ absent ou incomplet."
          : totalLinks === 0
          ? "Pages reçues mais aucun lien de programme détecté — sélecteurs CSS ou structure JSON à revoir."
          : `OK — ${totalLinks} lien(s) programme(s) trouvé(s).`,
    });

    return NextResponse.json({ mode: "address", ...report });
  }

  return NextResponse.json(
    {
      error: "Fournir { url } ou { address } dans le body",
      examples: {
        urlTest: { url: "https://www.selogerneuf.com/achat/neuilly-sur-seine-92200/" },
        addressTest: { address: "23 Boulevard d'Argenson, 92200 Neuilly-sur-Seine" },
      },
    },
    { status: 400 }
  );
}
