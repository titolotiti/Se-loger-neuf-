"use client";

import { useState } from "react";
import type { NeufAnalysisResult, NeufProgram, NeufTypology, ScrapeReport, ScrapeDiagnosisType, ProgramDebugInfo } from "@/types/neuf";

const TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];

function fmt(n: number | null | undefined, unit = ""): string {
  if (n == null || !isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")}${unit}`;
}

// ─── Composant : tableau debug données par programme ─────────────────────────

function ProgramDebugTable({ infos }: { infos: ProgramDebugInfo[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const ok = (v: boolean) => v ? <span className="text-green-700 font-bold">✓</span> : <span className="text-red-500">✗</span>;

  return (
    <div className="mt-3 border border-blue-200 rounded-lg bg-blue-50 p-3">
      <p className="text-xs font-semibold text-blue-800 mb-2">
        📋 Données disponibles par programme ({infos.length})
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-blue-100 text-blue-800">
              <th className="px-2 py-1 text-left font-medium">Programme</th>
              <th className="px-2 py-1 text-center font-medium">Promoteur</th>
              <th className="px-2 py-1 text-center font-medium">Livraison</th>
              <th className="px-2 py-1 text-center font-medium">Prix</th>
              <th className="px-2 py-1 text-center font-medium">Surface</th>
              <th className="px-2 py-1 text-center font-medium">Lots</th>
              <th className="px-2 py-1 text-left font-medium">Clés trouvées</th>
            </tr>
          </thead>
          <tbody>
            {infos.map((info) => (
              <>
                <tr key={info.programId} className="border-t border-blue-200 hover:bg-blue-100">
                  <td className="px-2 py-1">
                    <a href={info.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline font-medium">
                      {info.programName}
                    </a>
                  </td>
                  <td className="px-2 py-1 text-center">{ok(info.hasPromoter)}</td>
                  <td className="px-2 py-1 text-center">{ok(info.hasDelivery)}</td>
                  <td className="px-2 py-1 text-center">{ok(info.hasPrice)}</td>
                  <td className="px-2 py-1 text-center">{ok(info.hasSurface)}</td>
                  <td className="px-2 py-1 text-center">{ok(info.hasLots)}</td>
                  <td className="px-2 py-1 text-gray-600 font-mono text-[10px] max-w-xs truncate">
                    {info.rawKeys.join(", ")}
                  </td>
                </tr>
                {expanded === info.programId && (
                  <tr key={`${info.programId}-detail`} className="bg-white">
                    <td colSpan={7} className="px-2 py-2">
                      <pre className="text-[10px] font-mono text-gray-700 whitespace-pre-wrap break-all bg-gray-50 p-2 rounded border border-gray-200 max-h-60 overflow-y-auto">
                        {info.rawPreview}
                      </pre>
                    </td>
                  </tr>
                )}
                <tr key={`${info.programId}-toggle`} className="border-b border-blue-100">
                  <td colSpan={7} className="px-2 pb-1">
                    <button
                      onClick={() => setExpanded(expanded === info.programId ? null : info.programId)}
                      className="text-[10px] text-blue-600 underline"
                    >
                      {expanded === info.programId ? "Masquer" : "Voir"} JSON brut
                    </button>
                  </td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Composant : rapport de scraping ─────────────────────────────────────────

const DIAG_CONFIG: Record<ScrapeDiagnosisType, { icon: string; title: string; color: string; border: string; titleColor: string; textColor: string }> = {
  blocked:   { icon: "⛔", title: "SeLoger Neuf bloque les requêtes serveur",         color: "bg-red-50",    border: "border-red-300",    titleColor: "text-red-800",    textColor: "text-red-700" },
  url_error: { icon: "🔍", title: "URL SeLoger Neuf invalide ou inexistante (HTTP 404)", color: "bg-orange-50", border: "border-orange-300",  titleColor: "text-orange-800", textColor: "text-orange-700" },
  js_only:   { icon: "⚡", title: "Pages SeLoger Neuf chargées en JavaScript",          color: "bg-amber-50",  border: "border-amber-300",   titleColor: "text-amber-800",  textColor: "text-amber-700" },
  timeout:   { icon: "⏱", title: "Timeout — SeLoger Neuf ne répond pas",               color: "bg-amber-50",  border: "border-amber-300",   titleColor: "text-amber-800",  textColor: "text-amber-700" },
  network:   { icon: "🌐", title: "Erreur réseau vers SeLoger Neuf",                    color: "bg-amber-50",  border: "border-amber-300",   titleColor: "text-amber-800",  textColor: "text-amber-700" },
  no_links:  { icon: "⚠",  title: "Pages accessibles mais aucun lien de programme",    color: "bg-yellow-50", border: "border-yellow-300",  titleColor: "text-yellow-800", textColor: "text-yellow-700" },
};

function ScrapeReportPanel({ report, defaultExpanded = false }: { report: ScrapeReport; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const diagConfig = report.diagnosisType ? DIAG_CONFIG[report.diagnosisType] : null;
  const hasIssue = report.diagnosisType != null || report.totalLinksFound === 0;
  const panelColor = diagConfig ? `${diagConfig.color} ${diagConfig.border}` : "bg-gray-50 border-gray-200";

  const iconFor = (errorType?: string) => {
    if (!errorType) return "✓";
    if (errorType === "http_403" || errorType === "anti_bot_cloudflare") return "⛔";
    if (errorType === "http_404") return "🔍";
    if (errorType === "http_429") return "🚦";
    if (errorType === "timeout") return "⏱";
    if (errorType === "network_error") return "🌐";
    if (errorType === "js_only_page") return "⚡";
    return "⚠";
  };

  const labelFor = (errorType?: string) => {
    if (!errorType) return "OK";
    const labels: Record<string, string> = {
      http_403: "403 Accès refusé (anti-bot)",
      http_404: "404 URL introuvable (format incorrect ?)",
      http_429: "429 Trop de requêtes",
      anti_bot_cloudflare: "Cloudflare challenge",
      js_only_page: "Page JS-only (vide)",
      timeout: "Timeout",
      network_error: "Erreur réseau",
      http_error: "Erreur HTTP",
      empty_html: "HTML vide",
      invalid_url: "URL invalide",
    };
    return labels[errorType] ?? errorType;
  };

  return (
    <div className={`rounded-lg border p-4 ${panelColor}`}>
      {/* Diagnostic principal */}
      {diagConfig && report.diagnosis && (
        <div className="mb-3 flex gap-2 items-start">
          <span className="text-xl shrink-0">{diagConfig.icon}</span>
          <div>
            <p className={`font-semibold text-sm ${diagConfig.titleColor}`}>{diagConfig.title}</p>
            <p className={`text-sm mt-0.5 ${diagConfig.textColor}`}>{report.diagnosis}</p>
          </div>
        </div>
      )}

      {/* Résumé statistiques */}
      <div className="flex flex-wrap gap-3 text-xs mb-3">
        <Stat label="URLs testées" value={report.searchUrlsTested} />
        {report.totalLinksFound > 0 && <Stat label="Items __NEXT_DATA__" value={report.totalLinksFound} />}
        {report.categoryLinksSkipped != null && report.categoryLinksSkipped > 0 && (
          <Stat label="Catégories filtrées" value={report.categoryLinksSkipped} warn />
        )}
        {report.duplicatesSkipped != null && report.duplicatesSkipped > 0 && (
          <Stat label="Doublons ignorés" value={report.duplicatesSkipped} warn />
        )}
        {report.programLinksRetained != null && report.programLinksRetained > 0 && (
          <Stat label="Programmes retenus" value={report.programLinksRetained} />
        )}
        {report.lotsExtracted != null && report.lotsExtracted > 0 && (
          <Stat label="Lots extraits" value={report.lotsExtracted} />
        )}
        {report.notFound404 > 0 && <Stat label="404 URL invalide" value={report.notFound404} warn />}
        {report.blocked403 > 0 && <Stat label="403 Bloquées" value={report.blocked403} red />}
        {report.cloudflareBlocks > 0 && <Stat label="Cloudflare" value={report.cloudflareBlocks} red />}
        {report.jsOnlyPages > 0 && <Stat label="JS-only" value={report.jsOnlyPages} warn />}
        {report.timeouts > 0 && <Stat label="Timeouts" value={report.timeouts} warn />}
        {report.networkErrors > 0 && <Stat label="Erreurs réseau" value={report.networkErrors} warn />}
        {report.successfulPages > 0 && <Stat label="Pages OK" value={report.successfulPages} />}
      </div>

      {/* Données disponibles par programme */}
      {report.nextDataDebug?.programDebugInfos && report.nextDataDebug.programDebugInfos.length > 0 && (
        <ProgramDebugTable infos={report.nextDataDebug.programDebugInfos} />
      )}

      {/* Debug __NEXT_DATA__ — affiché quand items trouvés mais 0 programmes */}
      {report.nextDataDebug && report.totalLinksFound > 0 && (report.programLinksRetained ?? 0) === 0 && (
        <div className="mt-3 border border-orange-200 rounded-lg bg-orange-50 p-3">
          <p className="text-xs font-semibold text-orange-800 mb-2">
            🔍 Debug __NEXT_DATA__ — {report.totalLinksFound} item(s) trouvé(s), 0 programme mappé
          </p>

          {/* Raisons de rejet */}
          {Object.keys(report.nextDataDebug.rejectionSummary).length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-orange-700 mb-1">Raisons de rejet :</p>
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-orange-100 text-orange-800">
                    <th className="px-2 py-1 text-left font-medium">Raison</th>
                    <th className="px-2 py-1 text-right font-medium">Nb</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.nextDataDebug.rejectionSummary)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => (
                      <tr key={reason} className="border-t border-orange-200">
                        <td className="px-2 py-1 text-orange-900">{reason}</td>
                        <td className="px-2 py-1 text-right font-bold text-orange-800">{count}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Clés des premiers items */}
          {report.nextDataDebug.sampleItemKeys.length > 0 && (
            <div>
              <p className="text-xs font-medium text-orange-700 mb-1">Clés des {report.nextDataDebug.sampleItemKeys.length} premiers items :</p>
              <div className="space-y-1">
                {report.nextDataDebug.sampleItemKeys.map((keys, i) => (
                  <div key={i} className="bg-white rounded border border-orange-200 p-2 font-mono text-[11px] text-gray-700 break-all">
                    <span className="text-orange-600 font-bold">Item[{i}]</span> — {keys.join(", ")}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Détail par URL */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-700 underline mt-2 block"
      >
        {expanded ? "Masquer" : "Voir"} le détail des {report.searchUrlsTested} URLs testées
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {report.urlResults.map((r, i) => (
            <div key={i} className="bg-white rounded border border-gray-200 p-3 text-xs font-mono break-all">
              <div className="flex items-start gap-2 mb-1">
                <span className="text-base shrink-0">{iconFor(r.errorType)}</span>
                <div className="flex-1 min-w-0">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline break-all">
                    {r.url}
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600 pl-6">
                <span>Status : <strong>{r.status ?? "—"} {r.statusText ?? ""}</strong></span>
                <span>Erreur : <strong className="text-red-700">{labelFor(r.errorType)}</strong></span>
                <span>HTML : {r.htmlLength.toLocaleString("fr-FR")} chars</span>
                <span>Liens : {r.linksFound}</span>
                {r.isCloudflarePage && <span className="text-red-600 col-span-2">⛔ Page Cloudflare détectée</span>}
                {r.isJsOnlyPage && <span className="text-orange-600 col-span-2">⚡ Page JS-only (contenu chargé par JavaScript)</span>}
                {r.hasNextData && <span className="text-green-700 col-span-2">✓ __NEXT_DATA__ présent</span>}
              </div>
              {r.htmlPreview && (
                <div className="mt-1 pl-6 text-gray-400 text-[10px] break-all line-clamp-2">
                  {r.htmlPreview}
                </div>
              )}
              {r.errorMessage && (
                <div className="mt-1 pl-6 text-red-600 text-[11px]">
                  {r.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, red, warn }: { label: string; value: number; red?: boolean; warn?: boolean }) {
  const cls = red ? "bg-red-100 text-red-800" : warn ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700";
  return (
    <span className={`px-2 py-1 rounded font-medium ${cls}`}>
      {label}: <strong>{value}</strong>
    </span>
  );
}

// ─── Composant : ligne de programme ──────────────────────────────────────────

function ProgramRow({ prog }: { prog: NeufProgram }) {
  const included = prog.listings.filter((l) => !l.excludedFromStats);

  const priceByTypo: Record<NeufTypology, number | null> = {
    "T1 / Studio": null, T2: null, T3: null, T4: null, "T5+": null,
  };

  for (const t of TYPOLOGIES) {
    const prices = included
      .filter((l) => l.typology === t)
      .map((l) => l.pricePerM2)
      .filter((v): v is number => v != null && isFinite(v));
    if (prices.length > 0) {
      priceByTypo[t] = prices.reduce((a, b) => a + b, 0) / prices.length;
    }
  }

  return (
    <tr className="hover:bg-blue-50 border-b border-gray-100">
      <td className="px-3 py-2 text-sm font-medium text-gray-900">
        <a href={prog.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
          {prog.programName}
        </a>
      </td>
      <td className="px-3 py-2 text-sm text-gray-600">{prog.developer ?? "—"}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{prog.city}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{prog.deliveryDate ?? "—"}</td>
      <td className="px-3 py-2 text-sm text-center text-gray-600">
        {prog.availableUnits != null && prog.totalUnits != null
          ? `${prog.availableUnits} / ${prog.totalUnits}`
          : "—"}
      </td>
      {TYPOLOGIES.map((t) => (
        <td key={t} className="px-3 py-2 text-sm text-right text-gray-700">
          {priceByTypo[t] != null ? `${fmt(priceByTypo[t])} €/m²` : "—"}
        </td>
      ))}
      <td className="px-3 py-2 text-sm text-center">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          prog.zoneType === "Commune principale"
            ? "bg-blue-100 text-blue-800"
            : "bg-gray-100 text-gray-600"
        }`}>
          {prog.zoneType === "Commune principale" ? "Principale" : "Limitrophe"}
        </span>
      </td>
    </tr>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

type Props = {
  result: NeufAnalysisResult;
  onExport: () => void;
  exportLoading: boolean;
};

export default function NeufAnalysisResults({ result, onExport, exportLoading }: Props) {
  const [showExcluded, setShowExcluded] = useState(false);

  const allListings = result.listings;
  const included = allListings.filter((l) => !l.excludedFromStats);
  const excluded = allListings.filter((l) => l.excludedFromStats && !l.isPlaceholderLot);
  const placeholderCount = allListings.filter((l) => !!l.isPlaceholderLot).length;
  const allLotsArePlaceholders = result.programs.length > 0 && placeholderCount === result.programs.length && included.length === 0;

  const isBlocked =
    result.scrapeReport?.diagnosisType != null && result.programs.length === 0;

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="bg-blue-900 text-white rounded-xl p-5">
        <h2 className="text-lg font-bold">
          Analyse de l'offre neuve — {result.geocodedAddress.label}
        </h2>
        <p className="text-blue-200 text-sm mt-1">
          Données extraites le{" "}
          {new Date(result.extractedAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
        </p>
      </div>

      {/* Avertissement prix */}
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800">
        <strong>⚠️ Prix de commercialisation</strong> — données issues exclusivement de SeLoger Neuf.
        Ces données ne constituent pas des transactions actées et doivent être vérifiées.
      </div>

      {/* Bannière info source de données */}
      {result.programs.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex gap-2 items-start">
          <span className="shrink-0">ℹ️</span>
          <span>
            Données extraites depuis les pages de résultats SeLoger Neuf (<strong>__NEXT_DATA__</strong>).
            Les pages détail programme ne sont pas consultées individuellement.
          </span>
        </div>
      )}

      {/* Rapport de scraping — toujours affiché, mais collapsed si programmes trouvés */}
      {result.scrapeReport && (
        <ScrapeReportPanel report={result.scrapeReport} defaultExpanded={result.programs.length === 0} />
      )}

      {/* Warnings (autres) */}
      {result.warnings.filter((w) => !w.startsWith("⛔") && !w.startsWith("ℹ️")).length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1">
          {result.warnings
            .filter((w) => !w.startsWith("⛔") && !w.startsWith("ℹ️"))
            .map((w, i) => (
              <p key={i} className="text-xs text-gray-600">{w}</p>
            ))}
        </div>
      )}

      {/* Bannière : programmes trouvés mais aucun prix/surface */}
      {allLotsArePlaceholders && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 text-sm text-orange-800">
          <strong>⚠️ Données lots non disponibles</strong> — SeLoger Neuf expose les programmes sur la page de résultats
          mais pas les prix ni surfaces. Les pages détail programme contenant ces données renvoient{" "}
          <strong>HTTP 403</strong> depuis Vercel et ne peuvent pas être consultées.
          Les programmes sont listés ci-dessous à titre de référence.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Programmes trouvés" value={result.programs.length} />
        <Kpi label="Lots analysés" value={included.length} />
        <Kpi label="Lots exclus" value={excluded.length} />
        <Kpi
          label="Prix/m² moyen"
          value={
            included.length > 0
              ? `${fmt(
                  included
                    .map((l) => l.pricePerM2)
                    .filter((v): v is number => v != null)
                    .reduce((a, b, _, arr) => a + b / arr.length, 0)
                )} €/m²`
              : "—"
          }
        />
      </div>

      {/* Tableau par typologie */}
      {included.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Prix/m² moyens par typologie</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white">
                {TYPOLOGIES.map((t) => (
                  <th key={t} className="px-4 py-2 text-center font-semibold">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white border-b border-gray-200">
                {TYPOLOGIES.map((t) => {
                  const prices = included
                    .filter((l) => l.typology === t)
                    .map((l) => l.pricePerM2)
                    .filter((v): v is number => v != null && isFinite(v));
                  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
                  return (
                    <td key={t} className="px-4 py-3 text-center font-mono text-gray-800">
                      {avg != null ? (
                        <>
                          <div className="font-bold text-blue-800">{fmt(avg)} €/m²</div>
                          <div className="text-xs text-gray-500">{prices.length} lot(s)</div>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Tableau programmes */}
      {result.programs.length > 0 ? (
        <div className="overflow-x-auto">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Programmes ({result.programs.length})
          </h3>
          <table className="w-full text-sm border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th className="px-3 py-2 text-left">Programme</th>
                <th className="px-3 py-2 text-left">Promoteur</th>
                <th className="px-3 py-2 text-left">Commune</th>
                <th className="px-3 py-2 text-left">Livraison</th>
                <th className="px-3 py-2 text-center">Dispo / Total</th>
                {TYPOLOGIES.map((t) => (
                  <th key={t} className="px-3 py-2 text-right whitespace-nowrap">{t}</th>
                ))}
                <th className="px-3 py-2 text-center">Zone</th>
              </tr>
            </thead>
            <tbody>
              {result.programs.map((prog) => (
                <ProgramRow key={prog.programId} prog={prog} />
              ))}
            </tbody>
          </table>
        </div>
      ) : !isBlocked ? (
        <div className="bg-gray-100 rounded-lg p-6 text-center text-gray-500">
          <p className="text-lg font-medium mb-1">Aucune offre neuve trouvée</p>
          <p className="text-sm">
            Aucun programme neuf n'a pu être extrait pour cette commune.
          </p>
        </div>
      ) : null}

      {/* Lots exclus */}
      {excluded.length > 0 && (
        <div>
          <button
            onClick={() => setShowExcluded(!showExcluded)}
            className="text-xs text-gray-500 underline"
          >
            {showExcluded ? "Masquer" : "Voir"} les {excluded.length} lot(s) exclus des stats
          </button>
          {showExcluded && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-gray-200 text-gray-700">
                    <th className="px-2 py-1 text-left">Programme</th>
                    <th className="px-2 py-1 text-left">Typologie</th>
                    <th className="px-2 py-1 text-right">Surface</th>
                    <th className="px-2 py-1 text-right">Prix</th>
                    <th className="px-2 py-1 text-left">Raison exclusion</th>
                  </tr>
                </thead>
                <tbody>
                  {excluded.map((l, i) => (
                    <tr key={i} className="border-b border-gray-100 bg-gray-50">
                      <td className="px-2 py-1">{l.programName ?? "—"}</td>
                      <td className="px-2 py-1">{l.typology ?? "—"}</td>
                      <td className="px-2 py-1 text-right">{l.surfaceM2 != null ? `${l.surfaceM2} m²` : "—"}</td>
                      <td className="px-2 py-1 text-right">{l.priceEur != null ? `${fmt(l.priceEur)} €` : "—"}</td>
                      <td className="px-2 py-1 text-red-600">{l.exclusionReason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Export Excel */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onExport}
          disabled={exportLoading}
          className="bg-green-700 hover:bg-green-800 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm flex items-center gap-2"
        >
          {exportLoading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Génération…
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exporter Excel
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
      <div className="text-2xl font-bold text-blue-800">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
