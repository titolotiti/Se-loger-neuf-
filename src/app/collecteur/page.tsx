"use client";

import { useEffect, useState } from "react";
import type {
  NeufListing,
  NeufProgram,
  NeufAnalysisResult,
  NeufTypology,
} from "@/types/neuf";

type ImportedLot = {
  typology: NeufTypology | null;
  rawTypology?: string;
  surfaceM2?: number | null;
  priceEur?: number | null;
  pricePerM2?: number | null;
  availableCount?: number | null;
  debug?: unknown;
};

type ImportedProgramData = {
  bookmarkletVersion?: string;
  programName: string;
  pageUrl?: string;
  sourceUrl?: string;
  totalUnits?: number | null;
  availableUnits?: number | null;
  bodyTextSample?: string;
  rawTypologyBlocks?: unknown[];
  lots?: ImportedLot[];
  importedAt?: string;
  developer?: string;
  city?: string;
  address?: string;
};


const LS_KEY = "seloger_neuf_collected_programs";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR");
}

function buildAnalysisResult(programs: ImportedProgramData[]): NeufAnalysisResult {
  const neufPrograms: NeufProgram[] = programs.map((prog, idx) => {
    const programId = `collected-${idx}`;
    const sourceUrl = prog.sourceUrl || prog.pageUrl || "";
    const city = prog.city?.trim() || "Import";

    const listings: NeufListing[] = (prog.lots ?? [])
      .filter(
        (lot): lot is ImportedLot & { typology: NonNullable<ImportedLot["typology"]> } =>
          lot.typology != null
      )
      .map((lot, li) => {
        const pricePerM2 =
          lot.pricePerM2 ??
          (lot.priceEur && lot.surfaceM2
            ? Math.round(lot.priceEur / lot.surfaceM2)
            : undefined);
        const hasSurface = (lot.surfaceM2 ?? 0) > 0;
        const hasPrice = (lot.priceEur ?? 0) > 0;
        return {
          id: `${programId}-${li}`,
          programId,
          source: "SeLogerNeuf" as const,
          url: sourceUrl,
          extractedAt: prog.importedAt ?? new Date().toISOString(),
          programName: prog.programName,
          city,
          geoPrecision: "unknown" as const,
          typology: lot.typology,
          surfaceM2: lot.surfaceM2 ?? undefined,
          priceEur: lot.priceEur ?? undefined,
          pricePerM2,
          availableCount: lot.availableCount ?? undefined,
          reliabilityScore: hasSurface && hasPrice ? 85 : 50,
          excludedFromStats: !hasSurface || !hasPrice,
          exclusionReason: !hasSurface ? "Surface manquante" : !hasPrice ? "Prix manquant" : undefined,
        };
      });

    return {
      programId,
      source: "SeLogerNeuf" as const,
      programName: prog.programName,
      city,
      address: prog.address || undefined,
      developer: prog.developer || undefined,
      zoneType: "Commune principale" as const,
      url: sourceUrl,
      totalUnits: prog.totalUnits ?? undefined,
      availableUnits: prog.availableUnits ?? undefined,
      listings,
    };
  });

  return {
    input: { address: "Import bookmarklet" },
    geocodedAddress: { label: "Import bookmarklet", city: "Analyse", postalCode: "", lat: 0, lng: 0 },
    programs: neufPrograms,
    listings: neufPrograms.flatMap((p) => p.listings),
    warnings: [],
    hasData: neufPrograms.length > 0,
    extractedAt: new Date().toISOString(),
  };
}

export default function CollecteurPage() {
  const [programs, setPrograms] = useState<ImportedProgramData[]>([]);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const list = raw ? (JSON.parse(raw) as ImportedProgramData[]) : [];
      setPrograms(Array.isArray(list) ? list : []);
    } catch {
      setPrograms([]);
    }
    setReady(true);
  }, []);

  function save(list: ImportedProgramData[]) {
    setPrograms(list);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  function remove(idx: number) {
    save(programs.filter((_, i) => i !== idx));
  }

  function clearAll() {
    if (
      confirm(
        `Supprimer les ${programs.length} programme(s) collecté(s) ?\n\nCette action est irréversible. À faire avant de commencer une nouvelle analyse.`
      )
    ) {
      save([]);
    }
  }

  function copyJson() {
    navigator.clipboard.writeText(JSON.stringify(programs, null, 2)).catch(() => {});
  }

  async function exportExcel() {
    if (programs.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      const result = buildAnalysisResult(programs);
      const res = await fetch("/api/neuf/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seloger_neuf_collecteur_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setExporting(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#2563EB] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Header */}
      <header className="bg-[#0F172A] text-white sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="/" className="text-slate-400 hover:text-white text-sm transition-colors">
              ← Accueil
            </a>
            <span className="text-slate-600">|</span>
            <span className="font-bold text-base">Collecteur</span>
            {programs.length > 0 && (
              <span className="bg-[#2563EB] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {programs.length}
              </span>
            )}
          </div>
          <a
            href="/bookmarklet"
            className="text-xs font-medium text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            ★ Bookmarklet
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#111827]">Programmes collectés</h1>
            <p className="text-sm text-[#6B7280] mt-0.5">
              {programs.length === 0
                ? "Aucun programme dans le collecteur"
                : `${programs.length} programme${programs.length > 1 ? "s" : ""} importé${programs.length > 1 ? "s" : ""} via bookmarklet`}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap gap-2">
            {programs.length > 0 && (
              <>
                {/* Vider — bouton bien visible */}
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-2 border-red-200 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-400 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Vider le collecteur
                </button>

                <button
                  onClick={copyJson}
                  className="px-3 py-2 text-xs font-medium border border-[#E5E7EB] text-[#6B7280] rounded-xl hover:bg-white hover:text-[#111827] transition-colors"
                >
                  Copier JSON
                </button>

                <button
                  onClick={exportExcel}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#9CA3AF] text-white rounded-xl transition-colors"
                >
                  {exporting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Export…
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
              </>
            )}
          </div>
        </div>

        {/* Note "Vider avant nouvelle analyse" */}
        {programs.length > 0 && (
          <div className="bg-[#FFFBEB] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
            <span className="text-amber-500 shrink-0 mt-0.5">ℹ</span>
            <span>
              <strong>Nouvelle série d&apos;actifs ?</strong> Cliquez sur{" "}
              <strong>Vider le collecteur</strong> avant de commencer pour repartir d&apos;une liste
              vierge.
            </span>
          </div>
        )}

        {/* Export error */}
        {exportError && (
          <div className="bg-[#FEF2F2] border border-red-200 rounded-xl p-4 text-sm text-red-800">
            <strong>Erreur export :</strong> {exportError}
          </div>
        )}

        {/* Empty state */}
        {programs.length === 0 && (
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-12 text-center space-y-4">
            <div className="text-5xl">📭</div>
            <h2 className="text-lg font-semibold text-[#111827]">Collecteur vide</h2>
            <p className="text-sm text-[#6B7280] max-w-sm mx-auto">
              Installez le bookmarklet et cliquez dessus sur une page programme SeLoger Neuf pour
              l&apos;ajouter automatiquement ici.
            </p>
            <a
              href="/bookmarklet"
              className="inline-block mt-2 px-5 py-2.5 bg-[#2563EB] text-white text-sm font-semibold rounded-xl hover:bg-[#1D4ED8] transition-colors"
            >
              ★ Installer le bookmarklet
            </a>
          </div>
        )}

        {/* Liste des programmes */}
        {programs.length > 0 && (
          <div className="space-y-3">
            {programs.map((prog, idx) => {
              const validLots = prog.lots?.filter((l) => l.typology !== null) ?? [];
              const sourceUrl =
                prog.sourceUrl ||
                ((prog as Record<string, unknown>).pageUrl as string) ||
                "";
              const importedDate = prog.importedAt
                ? new Date(prog.importedAt).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—";

              // Avg price/m² from lots
              const pm2vals = validLots.flatMap((l) => {
                if (!l.surfaceM2 || !l.priceEur) return [];
                const p = l.pricePerM2 ?? Math.round(l.priceEur / l.surfaceM2);
                const count = Math.max(1, l.availableCount ?? 1);
                return Array<number>(count).fill(p);
              });
              const avgPm2 =
                pm2vals.length > 0
                  ? Math.round(pm2vals.reduce((a, b) => a + b, 0) / pm2vals.length)
                  : null;

              return (
                <div
                  key={idx}
                  className="bg-white border border-[#E5E7EB] rounded-2xl p-5 hover:border-[#BFDBFE] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Titre */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-[#111827] text-sm">{prog.programName}</h3>
                        {prog.bookmarkletVersion && (
                          <span className="text-[10px] bg-[#F1F5F9] text-[#6B7280] px-1.5 py-0.5 rounded font-mono">
                            {prog.bookmarkletVersion}
                          </span>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex flex-wrap gap-3 text-xs text-[#6B7280] mb-3">
                        {prog.totalUnits != null && (
                          <span>
                            <span className="font-semibold text-[#111827]">
                              {fmt(prog.totalUnits)}
                            </span>{" "}
                            logements
                          </span>
                        )}
                        {prog.availableUnits != null && (
                          <span>
                            <span className="font-semibold text-[#111827]">
                              {fmt(prog.availableUnits)}
                            </span>{" "}
                            disponibles
                          </span>
                        )}
                        {avgPm2 != null && (
                          <span>
                            Moy.{" "}
                            <span className="font-semibold text-[#111827]">
                              {fmt(avgPm2)} €/m²
                            </span>
                          </span>
                        )}
                        <span>Importé le {importedDate}</span>
                      </div>

                      {/* Lots / typologies */}
                      {validLots.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {validLots.map((lot, li) => (
                            <span
                              key={li}
                              className="inline-flex items-center gap-1 bg-[#EFF6FF] text-[#2563EB] text-[11px] font-medium px-2 py-0.5 rounded-full"
                            >
                              <span>{lot.typology}</span>
                              {lot.surfaceM2 != null && <span>{lot.surfaceM2} m²</span>}
                              {lot.pricePerM2 != null && (
                                <span>{fmt(lot.pricePerM2)} €/m²</span>
                              )}
                              {(lot.availableCount ?? 0) > 0 && (
                                <span className="text-[#93C5FD]">×{lot.availableCount}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {sourceUrl && (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-[#2563EB] hover:underline truncate max-w-full block"
                        >
                          {sourceUrl}
                        </a>
                      )}
                    </div>

                    {/* Supprimer */}
                    <button
                      onClick={() => remove(idx)}
                      className="shrink-0 text-[#D1D5DB] hover:text-red-500 transition-colors text-2xl leading-none mt-0.5"
                      title="Supprimer ce programme"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        {programs.length > 0 && (
          <p className="text-xs text-[#9CA3AF] text-center">
            Source exclusive SeLoger Neuf · Prix de commercialisation, non vérifiés
          </p>
        )}
      </main>
    </div>
  );
}
