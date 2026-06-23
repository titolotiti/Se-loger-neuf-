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
      .filter((lot): lot is ImportedLot & { typology: NonNullable<ImportedLot["typology"]> } =>
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
          exclusionReason: !hasSurface
            ? "Surface manquante"
            : !hasPrice
            ? "Prix manquant"
            : undefined,
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
    geocodedAddress: {
      label: "Import bookmarklet",
      city: "Analyse",
      postalCode: "",
      lat: 0,
      lng: 0,
    },
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

  function clear() {
    if (confirm(`Supprimer les ${programs.length} programme(s) du collecteur ?`)) {
      save([]);
    }
  }

  function copyJson() {
    const json = JSON.stringify(programs, null, 2);
    navigator.clipboard.writeText(json).catch(() => {});
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
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-700 rounded-lg p-2">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Collecteur de programmes</h1>
              <p className="text-blue-300 text-xs">Programmes importés via bookmarklet</p>
            </div>
          </div>
          <a href="/" className="text-blue-200 hover:text-white text-sm underline">
            ← Retour à l&apos;analyse
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-gray-700 font-semibold text-sm">
            {programs.length === 0
              ? "Aucun programme importé"
              : `${programs.length} programme(s) importé(s)`}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <a
              href="/bookmarklet"
              className="px-3 py-1.5 text-xs font-medium border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
            >
              ★ Obtenir le bookmarklet
            </a>
            {programs.length > 0 && (
              <>
                <button
                  onClick={copyJson}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Copier JSON
                </button>
                <button
                  onClick={clear}
                  className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Nouvelle analyse / vider
                </button>
                <button
                  onClick={exportExcel}
                  disabled={exporting}
                  className="px-4 py-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                >
                  {exporting ? "Export…" : "↓ Exporter Excel"}
                </button>
              </>
            )}
          </div>
        </div>

        {exportError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <strong>Erreur export :</strong> {exportError}
          </div>
        )}

        {/* Empty state */}
        {programs.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center space-y-4">
            <div className="text-5xl">📭</div>
            <h2 className="text-lg font-semibold text-gray-700">Aucun programme collecté</h2>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Installez le bookmarklet et cliquez dessus sur une page programme SeLoger Neuf pour
              l&apos;ajouter automatiquement ici.
            </p>
            <a
              href="/bookmarklet"
              className="inline-block mt-2 px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors"
            >
              ★ Obtenir le bookmarklet
            </a>
          </div>
        )}

        {/* Programs list */}
        {programs.length > 0 && (
          <div className="space-y-3">
            {programs.map((prog, idx) => {
              const validLots = prog.lots?.filter((l) => l.typology !== null) ?? [];
              const importedDate = prog.importedAt
                ? new Date(prog.importedAt).toLocaleString("fr-FR", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })
                : "—";
              const sourceUrl = prog.sourceUrl || (prog as Record<string, unknown>).pageUrl as string || "";

              return (
                <div
                  key={idx}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-gray-900 text-sm truncate">
                          {prog.programName}
                        </h3>
                        {prog.bookmarkletVersion && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                            {prog.bookmarkletVersion}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-3">
                        <span>
                          <span className="font-medium text-gray-700">{prog.lots?.length ?? 0}</span>{" "}
                          lot(s) brut ·{" "}
                          <span className="font-medium text-gray-700">{validLots.length}</span>{" "}
                          typologie(s) reconnue(s)
                        </span>
                        {prog.totalUnits != null && (
                          <span>
                            Total :{" "}
                            <span className="font-medium text-gray-700">
                              {fmt(prog.totalUnits)}
                            </span>{" "}
                            logements
                          </span>
                        )}
                        {prog.availableUnits != null && (
                          <span>
                            Dispo :{" "}
                            <span className="font-medium text-gray-700">
                              {fmt(prog.availableUnits)}
                            </span>
                          </span>
                        )}
                        <span>Importé le {importedDate}</span>
                      </div>

                      {/* Lots summary */}
                      {validLots.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {validLots.map((lot, li) => (
                            <span
                              key={li}
                              className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 text-[11px] px-2 py-0.5 rounded-full"
                            >
                              <span className="font-semibold">{lot.typology}</span>
                              {lot.surfaceM2 != null && <span>{lot.surfaceM2} m²</span>}
                              {lot.pricePerM2 != null && (
                                <span>{fmt(lot.pricePerM2)} €/m²</span>
                              )}
                              {(lot.availableCount ?? 0) > 0 && (
                                <span className="text-blue-500">×{lot.availableCount}</span>
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
                          className="inline-block mt-2 text-[11px] text-blue-600 hover:underline truncate max-w-full"
                        >
                          {sourceUrl}
                        </a>
                      )}
                    </div>

                    <button
                      onClick={() => remove(idx)}
                      className="shrink-0 text-gray-300 hover:text-red-500 transition-colors text-xl leading-none mt-0.5"
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

        {programs.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>⚠️ Rappel :</strong> source exclusive SeLoger Neuf. Prix de commercialisation
            affichés, non vérifiés, à confirmer avant toute utilisation.
          </div>
        )}
      </div>
    </main>
  );
}
