import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { fetchHtmlDetailed, isSeLogerNeufUrl } from "@/lib/neuf/scraper";
import { buildAllSearchUrls } from "@/lib/neuf/searchUrls";
import { geocodeAddress } from "@/lib/neuf/geocode";
import {
  findListingsWithPaths,
  analyzeItemsForDebug,
} from "@/lib/neuf/parser";

/**
 * POST /api/neuf/debug
 *
 * Mode export brut : { "address": "...", "rawDebug": true }
 *   → retourne { meta, nextData, itemsAnalysis } pour inspection complète
 *
 * Mode URL :     { "url": "https://www.selogerneuf.com/..." }
 * Mode adresse : { "address": "..." }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { url?: string; address?: string; rawDebug?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  // ── Mode export brut ──────────────────────────────────────────────────────
  if (body.address && body.rawDebug) {
    const { address } = body;

    let geocodedAddress;
    try {
      geocodedAddress = await geocodeAddress(address.trim());
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 422 });
    }

    const searchUrls = buildAllSearchUrls(
      { city: geocodedAddress.city, postalCode: geocodedAddress.postalCode },
      1
    );
    const firstUrl = searchUrls[0];
    if (!firstUrl) {
      return NextResponse.json({ error: "Aucune URL générée" }, { status: 500 });
    }

    const fetchResult = await fetchHtmlDetailed(firstUrl);

    const meta = {
      address,
      geocode: geocodedAddress,
      searchUrl: firstUrl,
      fetchStatus: fetchResult.status,
      fetchStatusText: fetchResult.statusText,
      fetchSuccess: fetchResult.success,
      errorType: fetchResult.errorType ?? null,
      errorMessage: fetchResult.errorMessage ?? null,
      htmlLength: fetchResult.htmlLength,
      isCloudflarePage: fetchResult.isCloudflarePage,
      isJsOnlyPage: fetchResult.isJsOnlyPage,
      hasNextData: fetchResult.hasNextData,
      extractedAt: new Date().toISOString(),
    };

    if (!fetchResult.success || !fetchResult.html) {
      return NextResponse.json({
        meta,
        nextData: null,
        itemsPath: null,
        itemsAnalysis: [],
        error: fetchResult.errorMessage ?? "Fetch échoué",
      });
    }

    // Extraire __NEXT_DATA__ brut
    const $ = cheerio.load(fetchResult.html);
    const rawNextDataStr = $("#__NEXT_DATA__").html();

    let nextData: unknown = null;
    if (rawNextDataStr) {
      try {
        nextData = JSON.parse(rawNextDataStr);
      } catch {
        nextData = { _parseError: "JSON invalide dans __NEXT_DATA__" };
      }
    }

    // Trouver les items avec leur chemin JSON
    let itemsPath: string | null = null;
    let itemsAnalysis: object[] = [];

    if (nextData) {
      const found = findListingsWithPaths(nextData);
      if (found) {
        itemsPath = found.path;
        itemsAnalysis = analyzeItemsForDebug(found.items, found.path, firstUrl);
      }
    }

    return NextResponse.json({
      meta,
      nextData,
      itemsPath,
      itemsAnalysis,
    });
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

    let itemsPath: string | null = null;
    let itemCount = 0;

    if (result.success && result.html) {
      const $ = cheerio.load(result.html);
      const rawStr = $("#__NEXT_DATA__").html();
      if (rawStr) {
        try {
          const data = JSON.parse(rawStr);
          const found = findListingsWithPaths(data);
          if (found) {
            itemsPath = found.path;
            itemCount = found.items.length;
          }
        } catch { /* ignore */ }
      }
    }

    return NextResponse.json({
      mode: "url",
      url,
      success: result.success,
      status: result.status,
      statusText: result.statusText,
      errorType: result.errorType,
      errorMessage: result.errorMessage,
      htmlLength: result.htmlLength,
      htmlPreview: result.htmlPreview,
      isCloudflarePage: result.isCloudflarePage,
      isJsOnlyPage: result.isJsOnlyPage,
      hasNextData: result.hasNextData,
      itemsPath,
      itemCount,
    });
  }

  // ── Mode adresse simple ───────────────────────────────────────────────────
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
    let totalItems = 0;

    for (const url of searchUrls) {
      const r = await fetchHtmlDetailed(url);
      let items = 0;
      let foundPath: string | null = null;

      if (r.success && r.html) {
        const $ = cheerio.load(r.html);
        const rawStr = $("#__NEXT_DATA__").html();
        if (rawStr) {
          try {
            const data = JSON.parse(rawStr);
            const found = findListingsWithPaths(data);
            if (found) {
              foundPath = found.path;
              items = found.items.length;
              totalItems += items;
            }
          } catch { /* ignore */ }
        }
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
        itemsPath: foundPath,
        itemsFound: items,
        htmlPreview: r.htmlPreview.substring(0, 300),
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    report.urlResults = urlResults;
    report.summary = {
      totalUrlsTested: searchUrls.length,
      totalItemsFound: totalItems,
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
        : totalItems === 0
        ? "⚠ Pages accessibles mais 0 item détecté dans __NEXT_DATA__ — structure JSON changée."
        : `✓ OK — ${totalItems} item(s) trouvé(s) dans __NEXT_DATA__.`;

    return NextResponse.json({ mode: "address", ...report });
  }

  return NextResponse.json(
    {
      error: "Fournir { url }, { address } ou { address, rawDebug: true } dans le body",
      examples: {
        rawDebug: { address: "23 Boulevard d'Argenson, 92200 Neuilly-sur-Seine", rawDebug: true },
        byUrl: { url: "https://www.selogerneuf.com/achat/neuilly-sur-seine-92200/" },
        byAddress: { address: "23 Boulevard d'Argenson, 92200 Neuilly-sur-Seine" },
      },
    },
    { status: 400 }
  );
}
