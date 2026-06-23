"use client";

import { useState } from "react";
import type {
  NeufAnalysisResult,
  NeufProgram,
  NeufTypology,
  ScrapeReport,
  ScrapeDiagnosisType,
  ProgramDebugInfo,
} from "@/types/neuf";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return Math.round(n).toLocaleString("fr-FR");
}

function avgPriceM2ForProgram(prog: NeufProgram): number | null {
  const valid = prog.listings.filter((l) => !l.excludedFromStats && l.pricePerM2 != null);
  if (valid.length === 0) return null;
  return valid.reduce((a, l) => a + l.pricePerM2!, 0) / valid.length;
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-4">
      <p className="text-xs text-[#6B7280] mb-1">{label}</p>
      <p className="text-xl font-bold text-[#111827] leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-[#9CA3AF] mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Programme card ────────────────────────────────────────────────────────────

function ProgramCard({ prog }: { prog: NeufProgram }) {
  const available = prog.availableUnitsDetected ?? prog.availableUnits;
  const delivery = prog.deliveryDate ?? prog.commercialStatus;
  const pm2 = avgPriceM2ForProgram(prog);

  const showAddress =
    prog.address && !/^\d{1,3}$/.test(prog.address.trim()) && prog.address.trim().length > 2;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 hover:border-[#BFDBFE] transition-colors">
      {/* Titre + badge zone */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <a
            href={prog.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-bold text-[#111827] hover:text-[#2563EB] transition-colors leading-snug"
          >
            {prog.programName}
          </a>
          <p className="text-sm text-[#6B7280] mt-0.5 leading-snug">
            {[prog.developer, prog.city].filter(Boolean).join(" · ")}
          </p>
          {showAddress && (
            <p className="text-xs text-[#9CA3AF] mt-0.5">{prog.address}</p>
          )}
        </div>
        <span
          className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
            prog.zoneType === "Commune principale"
              ? "bg-[#EFF6FF] text-[#2563EB]"
              : "bg-[#F3F4F6] text-[#6B7280]"
          }`}
        >
          {prog.zoneType === "Commune principale" ? "Commune" : "Limitrophe"}
        </span>
      </div>

      {/* Chiffres clés */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Total", value: prog.totalUnits != null ? `${fmt(prog.totalUnits)} log.` : "—" },
          { label: "Disponibles", value: available != null ? fmt(available) : "—" },
          { label: "Livraison", value: delivery ?? "—" },
        ].map((item) => (
          <div key={item.label} className="bg-[#F8FAFC] rounded-xl px-3 py-2.5">
            <p className="text-[10px] text-[#9CA3AF] mb-0.5">{item.label}</p>
            <p className="text-sm font-semibold text-[#111827] leading-snug">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Typologies */}
      {prog.typologies && prog.typologies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {prog.typologies.map((t: NeufTypology) => (
            <span
              key={t}
              className="text-[11px] font-medium bg-[#EFF6FF] text-[#2563EB] px-2 py-0.5 rounded-full"
            >
              {t}
            </span>
          ))}
          {prog.typologyRange && prog.typologies.length === 0 && (
            <span className="text-[11px] text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded-full">
              {prog.typologyRange}
            </span>
          )}
        </div>
      )}

      {/* Prix */}
      {(prog.priceFromEur != null || pm2 != null) && (
        <div className="flex flex-wrap gap-4 text-sm mb-4">
          {prog.priceFromEur != null && (
            <p className="text-[#6B7280] text-xs">
              À partir de{" "}
              <span className="font-semibold text-[#111827]">
                {fmt(prog.priceFromEur)} €{prog.isPriceMin ? "*" : ""}
              </span>
            </p>
          )}
          {pm2 != null && (
            <p className="text-[#6B7280] text-xs">
              Moy.{" "}
              <span className="font-semibold text-[#111827]">{fmt(pm2)} €/m²</span>
            </p>
          )}
        </div>
      )}

      {/* CTA SeLoger */}
      <div className="flex flex-col gap-1.5">
        <a
          href={prog.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-4 py-2.5 rounded-xl transition-colors"
        >
          Ouvrir sur SeLoger →
        </a>
        <p className="text-[11px] text-[#9CA3AF] text-center leading-snug">
          Puis cliquez sur le favori bookmarklet pour envoyer les lots dans le collecteur.
        </p>
      </div>
    </div>
  );
}

// ── Debug: tableau données par programme ─────────────────────────────────────

function ProgramDebugTable({ infos }: { infos: ProgramDebugInfo[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const ok = (v: boolean) =>
    v ? (
      <span className="text-green-600 font-bold">✓</span>
    ) : (
      <span className="text-red-400">✗</span>
    );

  return (
    <div className="border border-[#E5E7EB] rounded-lg bg-[#F8FAFC] p-3">
      <p className="text-xs font-semibold text-[#374151] mb-2">
        Données disponibles par programme ({infos.length})
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-[#F1F5F9] text-[#6B7280]">
              <th className="px-2 py-1 text-left font-medium">Programme</th>
              <th className="px-2 py-1 text-center font-medium">Promoteur</th>
              <th className="px-2 py-1 text-center font-medium">Livraison</th>
              <th className="px-2 py-1 text-center font-medium">Prix</th>
              <th className="px-2 py-1 text-center font-medium">Surface</th>
              <th className="px-2 py-1 text-center font-medium">Lots</th>
              <th className="px-2 py-1 text-left font-medium">Clés</th>
            </tr>
          </thead>
          <tbody>
            {infos.map((info) => (
              <>
                <tr key={info.programId} className="border-t border-[#E5E7EB] hover:bg-white">
                  <td className="px-2 py-1">
                    <a
                      href={info.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#2563EB] underline"
                    >
                      {info.programName}
                    </a>
                  </td>
                  <td className="px-2 py-1 text-center">{ok(info.hasPromoter)}</td>
                  <td className="px-2 py-1 text-center">{ok(info.hasDelivery)}</td>
                  <td className="px-2 py-1 text-center">{ok(info.hasPrice)}</td>
                  <td className="px-2 py-1 text-center">{ok(info.hasSurface)}</td>
                  <td className="px-2 py-1 text-center">{ok(info.hasLots)}</td>
                  <td className="px-2 py-1 text-[#9CA3AF] font-mono text-[10px] max-w-xs truncate">
                    {info.rawKeys.join(", ")}
                  </td>
                </tr>
                {expanded === info.programId && (
                  <tr key={`${info.programId}-detail`} className="bg-white">
                    <td colSpan={7} className="px-2 py-2">
                      <pre className="text-[10px] font-mono text-[#374151] whitespace-pre-wrap break-all bg-[#F8FAFC] p-2 rounded border border-[#E5E7EB] max-h-60 overflow-y-auto">
                        {info.rawPreview}
                      </pre>
                    </td>
                  </tr>
                )}
                <tr key={`${info.programId}-toggle`} className="border-b border-[#E5E7EB]">
                  <td colSpan={7} className="px-2 pb-1">
                    <button
                      onClick={() =>
                        setExpanded(expanded === info.programId ? null : info.programId)
                      }
                      className="text-[10px] text-[#2563EB] underline"
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

// ── Debug: téléchargement JSON ────────────────────────────────────────────────

function DebugDownloader({ address }: { address: string }) {
  const [loading, setLoading] = useState<"nextdata" | "programs" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchDebugData() {
    const res = await fetch("/api/neuf/debug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, rawDebug: true }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
    return res.json() as Promise<{
      meta: unknown;
      nextData: unknown;
      itemsPath: string | null;
      itemsAnalysis: unknown[];
      error?: string;
    }>;
  }

  function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDownload(target: "nextdata" | "programs") {
    setLoading(target);
    setError(null);
    try {
      const data = await fetchDebugData();
      if (target === "nextdata") {
        downloadJson(data.nextData, "debug_nextdata.json");
      } else {
        downloadJson(
          { meta: data.meta, itemsPath: data.itemsPath, itemsAnalysis: data.itemsAnalysis },
          "debug_programs.json"
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="border border-[#E5E7EB] rounded-lg p-3">
      <p className="text-xs font-semibold text-[#374151] mb-2">Export debug __NEXT_DATA__</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleDownload("nextdata")}
          disabled={!!loading}
          className="text-xs bg-[#374151] hover:bg-[#1F2937] disabled:bg-[#9CA3AF] text-white px-3 py-1.5 rounded transition-colors"
        >
          {loading === "nextdata" ? "Chargement…" : "⬇ debug_nextdata.json"}
        </button>
        <button
          onClick={() => handleDownload("programs")}
          disabled={!!loading}
          className="text-xs bg-[#374151] hover:bg-[#1F2937] disabled:bg-[#9CA3AF] text-white px-3 py-1.5 rounded transition-colors"
        >
          {loading === "programs" ? "Chargement…" : "⬇ debug_programs.json"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">Erreur : {error}</p>}
    </div>
  );
}

// ── Debug: rapport de scraping ────────────────────────────────────────────────

const DIAG_CONFIG: Record<
  ScrapeDiagnosisType,
  { icon: string; title: string; textColor: string }
> = {
  blocked: { icon: "⛔", title: "SeLoger Neuf bloque les requêtes serveur", textColor: "text-red-700" },
  url_error: { icon: "🔍", title: "URL SeLoger Neuf invalide ou inexistante (HTTP 404)", textColor: "text-orange-700" },
  js_only: { icon: "⚡", title: "Pages chargées en JavaScript uniquement", textColor: "text-amber-700" },
  timeout: { icon: "⏱", title: "Timeout — SeLoger Neuf ne répond pas", textColor: "text-amber-700" },
  network: { icon: "🌐", title: "Erreur réseau vers SeLoger Neuf", textColor: "text-amber-700" },
  no_links: { icon: "⚠", title: "Pages accessibles mais aucun programme trouvé", textColor: "text-yellow-700" },
};

function ScrapeReportPanel({
  report,
  defaultExpanded = false,
}: {
  report: ScrapeReport;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const diagConfig = report.diagnosisType ? DIAG_CONFIG[report.diagnosisType] : null;

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
      http_404: "404 URL introuvable",
      http_429: "429 Trop de requêtes",
      anti_bot_cloudflare: "Cloudflare challenge",
      js_only_page: "Page JS-only",
      timeout: "Timeout",
      network_error: "Erreur réseau",
      http_error: "Erreur HTTP",
      empty_html: "HTML vide",
      invalid_url: "URL invalide",
    };
    return labels[errorType] ?? errorType;
  };

  return (
    <div className="border border-[#E5E7EB] rounded-lg p-3">
      <p className="text-xs font-semibold text-[#374151] mb-2">Rapport de scraping</p>

      {diagConfig && report.diagnosis && (
        <div className="mb-2 flex gap-2 items-start">
          <span className="shrink-0">{diagConfig.icon}</span>
          <p className={`text-xs ${diagConfig.textColor}`}>
            <strong>{diagConfig.title}</strong> — {report.diagnosis}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-[11px] mb-2">
        {[
          { label: "URLs testées", value: report.searchUrlsTested },
          report.totalLinksFound > 0 && { label: "Items __NEXT_DATA__", value: report.totalLinksFound },
          report.duplicatesSkipped && report.duplicatesSkipped > 0 && { label: "Doublons ignorés", value: report.duplicatesSkipped },
          report.programLinksRetained && report.programLinksRetained > 0 && { label: "Programmes retenus", value: report.programLinksRetained },
          report.lotsExtracted && report.lotsExtracted > 0 && { label: "Lots extraits", value: report.lotsExtracted },
          report.blocked403 > 0 && { label: "403 Bloquées", value: report.blocked403, red: true },
          report.cloudflareBlocks > 0 && { label: "Cloudflare", value: report.cloudflareBlocks, red: true },
          report.successfulPages > 0 && { label: "Pages OK", value: report.successfulPages },
        ]
          .filter(Boolean)
          .map((s) => {
            const stat = s as { label: string; value: number; red?: boolean };
            return (
              <span
                key={stat.label}
                className={`px-2 py-0.5 rounded font-medium ${
                  stat.red ? "bg-red-100 text-red-700" : "bg-[#F1F5F9] text-[#374151]"
                }`}
              >
                {stat.label}: <strong>{stat.value}</strong>
              </span>
            );
          })}
      </div>

      {report.nextDataDebug?.programDebugInfos &&
        report.nextDataDebug.programDebugInfos.length > 0 && (
          <ProgramDebugTable infos={report.nextDataDebug.programDebugInfos} />
        )}

      {report.nextDataDebug &&
        report.totalLinksFound > 0 &&
        (report.programLinksRetained ?? 0) === 0 && (
          <div className="mt-2 border border-orange-200 rounded bg-orange-50 p-2">
            <p className="text-[11px] font-semibold text-orange-800 mb-1">
              {report.totalLinksFound} item(s) __NEXT_DATA__ trouvé(s), 0 programme mappé
            </p>
            {Object.keys(report.nextDataDebug.rejectionSummary).length > 0 && (
              <ul className="text-[10px] text-orange-700 space-y-0.5">
                {Object.entries(report.nextDataDebug.rejectionSummary)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <li key={reason}>
                      {reason}: <strong>{count}</strong>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[11px] text-[#2563EB] underline mt-2 block"
      >
        {expanded ? "Masquer" : "Voir"} le détail des {report.searchUrlsTested} URLs
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {report.urlResults.map((r, i) => (
            <div key={i} className="bg-[#F8FAFC] rounded border border-[#E5E7EB] p-2 text-[10px] font-mono break-all">
              <div className="flex gap-2 mb-0.5">
                <span>{iconFor(r.errorType)}</span>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#2563EB] underline">
                  {r.url}
                </a>
              </div>
              <div className="pl-5 text-[#6B7280] space-y-0.5">
                <div>Status: {r.status ?? "—"} · {labelFor(r.errorType)} · {r.htmlLength.toLocaleString("fr-FR")} chars</div>
                {r.hasNextData && <div className="text-green-600">✓ __NEXT_DATA__ présent</div>}
                {r.errorMessage && <div className="text-red-500">{r.errorMessage}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

type Props = {
  result: NeufAnalysisResult;
  onExport: () => void;
  exportLoading: boolean;
};

export default function NeufAnalysisResults({ result, onExport, exportLoading }: Props) {
  const [showDebug, setShowDebug] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  const allListings = result.listings;
  const included = allListings.filter((l) => !l.excludedFromStats);
  const excluded = allListings.filter((l) => l.excludedFromStats && !l.isPlaceholderLot);
  const placeholderCount = allListings.filter((l) => !!l.isPlaceholderLot).length;
  const allLotsArePlaceholders =
    result.programs.length > 0 &&
    placeholderCount === result.programs.length &&
    included.length === 0;

  const isBlocked =
    result.scrapeReport?.diagnosisType != null && result.programs.length === 0;

  const includedWithPm2 = included.filter((l) => l.pricePerM2 != null);
  const avgPm2 =
    includedWithPm2.length > 0
      ? includedWithPm2.reduce((a, l) => a + l.pricePerM2!, 0) / includedWithPm2.length
      : null;

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div>
        <h2 className="text-xl font-bold text-[#111827]">{result.geocodedAddress.city}</h2>
        <p className="text-sm text-[#6B7280] mt-0.5">
          {new Date(result.extractedAt).toLocaleString("fr-FR", {
            dateStyle: "long",
            timeStyle: "short",
          })}{" "}
          · Source SeLoger Neuf
        </p>
      </div>

      {/* Note discrète source */}
      <div className="text-xs text-[#9CA3AF] bg-[#F8FAFC] border border-[#E5E7EB] rounded-lg px-4 py-2.5">
        Prix de commercialisation issus de SeLoger Neuf — à vérifier avant toute utilisation.
      </div>

      {/* Blocage */}
      {isBlocked && result.scrapeReport?.diagnosis && (
        <div className="bg-[#FEF2F2] border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-800 mb-1">Accès limité à SeLoger Neuf</p>
          <p className="text-sm text-red-700">{result.scrapeReport.diagnosis}</p>
          <p className="text-xs text-red-500 mt-2">
            Utilisez le{" "}
            <a href="/bookmarklet" className="underline">
              bookmarklet
            </a>{" "}
            pour importer les données directement depuis SeLoger Neuf.
          </p>
        </div>
      )}

      {/* Lots non disponibles */}
      {allLotsArePlaceholders && (
        <div className="bg-[#FFFBEB] border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-1">
            Prix et surfaces non disponibles
          </p>
          <p className="text-xs text-amber-700">
            Les programmes sont listés, mais les détails (prix, surfaces) ne sont pas accessibles
            depuis le serveur. Utilisez le{" "}
            <a href="/bookmarklet" className="underline">
              bookmarklet
            </a>{" "}
            sur chaque page programme pour importer les données dans le collecteur.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Programmes"
          value={result.programs.length}
          sub={
            result.programs.filter(
              (p) => (p.availableUnitsDetected ?? p.availableUnits ?? 0) > 0
            ).length > 0
              ? `${result.programs.filter((p) => (p.availableUnitsDetected ?? p.availableUnits ?? 0) > 0).length} avec lots`
              : undefined
          }
        />
        <KpiCard
          label="Lots disponibles"
          value={included.length > 0 ? included.length : "—"}
        />
        <KpiCard
          label="Prix/m² moyen"
          value={avgPm2 != null ? `${fmt(avgPm2)} €/m²` : "—"}
        />
      </div>

      {/* Cartes programmes */}
      {result.programs.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-[#9CA3AF] uppercase tracking-wide mb-3">
            {result.programs.length} programme{result.programs.length > 1 ? "s" : ""} trouvé
            {result.programs.length > 1 ? "s" : ""}
          </p>
          <div className="grid gap-3">
            {result.programs.map((prog) => (
              <ProgramCard key={prog.programId} prog={prog} />
            ))}
          </div>
        </div>
      ) : !isBlocked ? (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-10 text-center">
          <p className="text-lg font-semibold text-[#111827] mb-2">Aucune offre neuve trouvée</p>
          <p className="text-sm text-[#6B7280]">
            Aucun programme n&apos;a pu être extrait pour cette commune.
          </p>
        </div>
      ) : null}

      {/* Export */}
      <div className="flex justify-end">
        <button
          onClick={onExport}
          disabled={exportLoading}
          className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exporter Excel
            </>
          )}
        </button>
      </div>

      {/* Accordéon Détails techniques */}
      <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-colors text-sm text-[#6B7280] font-medium"
        >
          <span>Détails techniques</span>
          <span className="text-xs">{showDebug ? "▲ Masquer" : "▼ Afficher"}</span>
        </button>

        {showDebug && (
          <div className="p-5 space-y-4 bg-white border-t border-[#E5E7EB]">
            {result.scrapeReport && (
              <ScrapeReportPanel
                report={result.scrapeReport}
                defaultExpanded={result.programs.length === 0}
              />
            )}
            <DebugDownloader address={result.input.address} />
            {excluded.length > 0 && (
              <div>
                <button
                  onClick={() => setShowExcluded(!showExcluded)}
                  className="text-xs text-[#6B7280] underline"
                >
                  {showExcluded ? "Masquer" : "Voir"} les {excluded.length} lot(s) exclus des stats
                </button>
                {showExcluded && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-xs border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-[#F1F5F9] text-[#6B7280]">
                          <th className="px-2 py-1 text-left">Programme</th>
                          <th className="px-2 py-1 text-left">Typologie</th>
                          <th className="px-2 py-1 text-right">Surface</th>
                          <th className="px-2 py-1 text-right">Prix</th>
                          <th className="px-2 py-1 text-left">Raison exclusion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excluded.map((l, i) => (
                          <tr key={i} className="border-b border-[#E5E7EB]">
                            <td className="px-2 py-1">{l.programName ?? "—"}</td>
                            <td className="px-2 py-1">{l.typology ?? "—"}</td>
                            <td className="px-2 py-1 text-right">
                              {l.surfaceM2 != null ? `${l.surfaceM2} m²` : "—"}
                            </td>
                            <td className="px-2 py-1 text-right">
                              {l.priceEur != null ? `${fmt(l.priceEur)} €` : "—"}
                            </td>
                            <td className="px-2 py-1 text-red-500">{l.exclusionReason ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
