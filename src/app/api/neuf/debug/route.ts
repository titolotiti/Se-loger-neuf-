import { NextRequest, NextResponse } from "next/server";
import { fetchHtmlDetailed, isSeLogerNeufUrl, extractProgramLinks } from "@/lib/neuf/scraper";
import { buildAllSearchUrls } from "@/lib/neuf/searchUrls";
import { geocodeAddress } from "@/lib/neuf/geocode";

/**
 * POST /api/neuf/debug
 *
 * Mode URL :     { "url": "https://www.selogerneuf.com/..." }
 * Mode adresse : { "address": "23 Boulevard d'Argenson, 92200 Neuilly-sur-Seine" }
 *
 * Retourne un rapport complet sur l'accessibilité des pages SeLoger Neuf
 * depuis les serveurs Vercel.
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
      return NextResponse.json({
        error: "URL refusée — hors domaine SeLoger Neuf",
        allowed_domains: ["selogerneuf.com", "www.selogerneuf.com"],
      }, { status: 400 });
    }

    const result = await fetchHtmlDetailed(url);

    let programLinksFound = 0;
    if (result.success && result.html) {
      const links = extractProgramLinks(result.html, url);
      programLinksFound = links.length;
    }

    return NextResponse.json({
      mode: "url",
      url,
      success: result.success,
      status: result.status,
      statusText: result.statusText,
      contentType: result.contentType,
      errorType: result.errorType,
      errorMessage: result.errorMessage,
      htmlLength: result.htmlLength,
      htmlPreview: result.htmlPreview,
      isCloudflarePage: result.isCloudflarePage,
      isJsOnlyPage: result.isJsOnlyPage,
      hasNextData: result.hasNextData,
      programLinksFound,
      diagnosis: !result.success
        ? result.errorType === "http_403"
          ? "HTTP 403 — SeLoger Neuf bloque les requêtes depuis les IPs serveur (anti-bot)"
          : result.errorType === "anti_bot_cloudflare"
          ? "Cloudflare challenge — contenu inaccessible sans navigateur réel"
          : result.errorType === "js_only_page"
          ? "Page JS-only — contenu chargé via API côté client (navigateur headless requis)"
          : result.errorType === "timeout"
          ? "Timeout — le serveur ne répond pas dans les 15s (IP cloud peut-être bloquée)"
          : result.errorMessage
        : programLinksFound === 0
        ? "Page accessible mais 0 lien programme détecté — sélecteurs CSS ou JSON à adapter"
        : `OK — ${programLinksFound} lien(s) programme(s) trouvé(s)`,
    });
  }

  // ── Mode adresse : géocode + teste toutes les URLs ────────────────────────
  if (body.address) {
    const { address } = body;
    const report: Record<string, unknown> = { address };

    let geocodedAddress;
    try {
      geocodedAddress = await geocodeAddress(address);
      report.geocode = { ok: true, ...geocodedAddress };
    } catch (err) {
      report.geocode = { ok: false, error: String(err) };
      return NextResponse.json({ mode: "address", ...report });
    }

    const searchUrls = buildAllSearchUrls(
      { city: geocodedAddress.city, postalCode: geocodedAddress.postalCode },
      2
    );
    report.searchUrls = searchUrls;

    const urlResults = [];
    let totalLinks = 0;

    for (const url of searchUrls) {
      const r = await fetchHtmlDetailed(url);
      let links = 0;

      if (r.success && r.html) {
        const found = extractProgramLinks(r.html, url);
        links = found.length;
        totalLinks += links;
      }

      urlResults.push({
        url,
        success: r.success,
        status: r.status,
        statusText: r.statusText,
        errorType: r.errorType,
        errorMessage: r.errorMessage,
        htmlLength: r.htmlLength,
        isCloudflarePage: r.isCloudflarePage,
        isJsOnlyPage: r.isJsOnlyPage,
        hasNextData: r.hasNextData,
        linksFound: links,
        htmlPreview: r.htmlPreview.substring(0, 300),
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    report.urlResults = urlResults;
    report.summary = {
      totalUrlsTested: searchUrls.length,
      totalProgramLinksFound: totalLinks,
      blocked403: urlResults.filter((r) => r.errorType === "http_403").length,
      cloudflare: urlResults.filter((r) => r.isCloudflarePage || r.errorType === "anti_bot_cloudflare").length,
      jsOnly: urlResults.filter((r) => r.isJsOnlyPage || r.errorType === "js_only_page").length,
      timeout: urlResults.filter((r) => r.errorType === "timeout").length,
      networkError: urlResults.filter((r) => r.errorType === "network_error").length,
      success: urlResults.filter((r) => r.success).length,
    };

    const s = report.summary as Record<string, number>;
    report.diagnosis =
      s.blocked403 > 0
        ? "⛔ HTTP 403 — SeLoger Neuf bloque les requêtes depuis les serveurs Vercel (anti-bot / IP cloud)."
        : s.cloudflare > 0
        ? "⛔ Cloudflare challenge — accès impossible sans navigateur réel."
        : s.jsOnly > 0
        ? "⚡ Pages JS-only — contenu chargé par JavaScript côté client, navigateur headless requis."
        : s.timeout > 0
        ? "⏱ Timeouts — le serveur SeLoger Neuf ne répond pas dans les délais depuis Vercel."
        : s.networkError > 0
        ? "🌐 Erreurs réseau — connectivité Vercel vers SeLoger Neuf à vérifier."
        : totalLinks === 0
        ? "⚠ Pages accessibles mais 0 lien programme détecté — structure HTML ou JSON changée."
        : `✓ OK — ${totalLinks} lien(s) programme(s) trouvé(s) au total.`;

    return NextResponse.json({ mode: "address", ...report });
  }

  return NextResponse.json(
    {
      error: "Fournir { url } ou { address } dans le body",
      examples: {
        byUrl: { url: "https://www.selogerneuf.com/achat/neuilly-sur-seine-92200/" },
        byAddress: { address: "23 Boulevard d'Argenson, 92200 Neuilly-sur-Seine" },
      },
    },
    { status: 400 }
  );
}
