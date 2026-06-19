"use client";

import { useState } from "react";
import NeufAddressForm from "@/components/neuf/NeufAddressForm";
import NeufAnalysisResults from "@/components/neuf/NeufAnalysisResults";
import type {
  NeufAnalysisInput,
  NeufAnalysisResult,
  NeufListing,
  ImportedProgramData,
} from "@/types/neuf";

function mergeImportedLotsIntoResult(
  result: NeufAnalysisResult,
  importedLots: Record<string, ImportedProgramData>
): NeufAnalysisResult {
  if (Object.keys(importedLots).length === 0) return result;

  const mergedPrograms = result.programs.map((prog) => {
    const imported = importedLots[prog.programId];
    if (!imported || imported.lots.length === 0) return prog;

    const listings: NeufListing[] = imported.lots
      .filter((lot) => lot.typology !== null)
      .map((lot, idx) => {
        const pricePerM2 =
          lot.pricePerM2 ??
          (lot.priceEur && lot.surfaceM2
            ? Math.round(lot.priceEur / lot.surfaceM2)
            : undefined);
        const hasSurface = lot.surfaceM2 != null && lot.surfaceM2 > 0;
        const hasPrice = lot.priceEur != null && lot.priceEur > 0;
        return {
          id: `imported_${prog.programId}_${idx}`,
          programId: prog.programId,
          source: "SeLogerNeuf" as const,
          url: imported.sourceUrl || prog.url,
          extractedAt: imported.importedAt,
          programName: prog.programName,
          developer: prog.developer,
          city: prog.city,
          postalCode: prog.postalCode,
          geoPrecision: "city_only" as const,
          typology: lot.typology!,
          surfaceM2: lot.surfaceM2 ?? undefined,
          priceEur: lot.priceEur ?? undefined,
          pricePerM2,
          parking: prog.parking ?? "Non communiqué",
          deliveryDate: prog.deliveryDate,
          reliabilityScore: hasSurface && hasPrice ? 85 : 50,
          excludedFromStats: !hasSurface || !hasPrice,
          exclusionReason: !hasSurface
            ? "Surface non disponible dans le JSON importé"
            : !hasPrice
            ? "Prix non disponible dans le JSON importé"
            : undefined,
          availableCount: lot.availableCount,
        };
      });

    if (listings.length === 0) return prog;
    return {
      ...prog,
      availableUnits: imported.availableUnits ?? prog.availableUnits,
      totalUnits: imported.totalUnits ?? prog.totalUnits,
      listings,
    };
  });

  return {
    ...result,
    programs: mergedPrograms,
    listings: mergedPrograms.flatMap((p) => p.listings),
  };
}

export default function Home() {
  const [result, setResult] = useState<NeufAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedLots, setImportedLots] = useState<Record<string, ImportedProgramData>>({});

  function handleImportLots(programId: string, data: ImportedProgramData) {
    setImportedLots((prev) => ({ ...prev, [programId]: data }));
  }

  async function handleAnalyze(input: NeufAnalysisInput) {
    setLoading(true);
    setError(null);
    setResult(null);
    setImportedLots({});

    try {
      const res = await fetch("/api/neuf/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Erreur serveur (${res.status})`);
      }

      const data: NeufAnalysisResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!result) return;
    setExportLoading(true);

    try {
      const merged = mergeImportedLotsIntoResult(result, importedLots);
      const res = await fetch("/api/neuf/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Erreur export (${res.status})`);
      }

      const blob = await res.blob();
      const city = result.geocodedAddress.city
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");
      const date = new Date().toISOString().slice(0, 10);
      const filename = `seloger_neuf_${city}_${date}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'export");
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="bg-blue-700 rounded-lg p-2">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Analyse Offre Neuve</h1>
            <p className="text-blue-300 text-xs">Source exclusive : SeLoger Neuf</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Formulaire */}
        <section>
          <h2 className="text-base font-semibold text-gray-700 mb-3">
            Saisir une adresse à analyser
          </h2>
          <NeufAddressForm onSubmit={handleAnalyze} loading={loading} />
        </section>

        {/* Erreur */}
        {error && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-4 text-red-700 text-sm">
            <strong>Erreur :</strong> {error}
          </div>
        )}

        {/* Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700" />
            <p className="text-gray-500 text-sm">
              Recherche des programmes neufs sur SeLoger Neuf…
            </p>
            <p className="text-gray-400 text-xs">
              Cette opération peut prendre quelques secondes.
            </p>
          </div>
        )}

        {/* Résultats */}
        {result && !loading && (
          <section>
            <NeufAnalysisResults
              result={result}
              onExport={handleExport}
              exportLoading={exportLoading}
              importedLots={importedLots}
              onImportLots={handleImportLots}
            />
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16 py-6 text-center text-xs text-gray-400">
        Outil d'analyse — Source exclusive SeLoger Neuf — Prix de commercialisation affichés,
        non vérifiés, à vérifier avant toute utilisation.
      </footer>
    </main>
  );
}
