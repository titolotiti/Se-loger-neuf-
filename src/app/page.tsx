"use client";

import { useState, useEffect } from "react";
import NeufAddressForm from "@/components/neuf/NeufAddressForm";
import NeufAnalysisResults from "@/components/neuf/NeufAnalysisResults";
import type {
  NeufAnalysisInput,
  NeufAnalysisResult,
  NeufListing,
  NeufTypology,
} from "@/types/neuf";

type ImportedLot = {
  typology: NeufTypology | null;
  rawTypology?: string;
  surfaceM2?: number | null;
  priceEur?: number | null;
  pricePerM2?: number | null;
  availableCount: number;
  debug?: {
    rawBlockText?: string;
    parsingWarnings?: string[];
  } & Record<string, unknown>;
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
  lots: ImportedLot[];
  importedAt?: string;
  developer?: string;
  city?: string;
  address?: string;
};


const LS_KEY = "seloger_neuf_collected_programs";

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
          extractedAt: imported.importedAt ?? new Date().toISOString(),
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
          availableCount: lot.availableCount ?? undefined,
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
  const [collectedCount, setCollectedCount] = useState(0);

  useEffect(() => {
    function updateCount() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        const list = raw ? (JSON.parse(raw) as unknown[]) : [];
        setCollectedCount(Array.isArray(list) ? list.length : 0);
      } catch {
        setCollectedCount(0);
      }
    }
    updateCount();
    window.addEventListener("storage", updateCount);
    return () => window.removeEventListener("storage", updateCount);
  }, []);

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
        throw new Error((data as { error?: string }).error ?? `Erreur serveur (${res.status})`);
      }
      const data = (await res.json()) as NeufAnalysisResult;
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
        throw new Error((data as { error?: string }).error ?? `Erreur export (${res.status})`);
      }
      const blob = await res.blob();
      const city = result.geocodedAddress.city.toLowerCase().replace(/[^a-z0-9]/g, "_");
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
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* ── Header ── */}
      <header className="bg-[#0F172A] text-white sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight">Neuf Analyzer</span>
            <span className="hidden sm:inline text-slate-500 text-xs">· SeLoger Neuf</span>
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="/collecteur"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8" />
              </svg>
              <span>Collecteur</span>
              {collectedCount > 0 && (
                <span className="bg-[#2563EB] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                  {collectedCount}
                </span>
              )}
            </a>
            <a
              href="/bookmarklet"
              className="text-xs font-medium text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              ★ Bookmarklet
            </a>
          </nav>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center pb-2">
          <h1 className="text-2xl font-bold text-[#111827]">Analyse de l'offre neuve</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Saisissez une adresse pour analyser les programmes immobiliers neufs à proximité.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm">
          <NeufAddressForm onSubmit={handleAnalyze} loading={loading} />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-[#FEF2F2] border border-red-200 rounded-xl p-4 text-sm text-red-800">
            <strong>Erreur :</strong> {error}
          </div>
        )}

        {/* Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#2563EB] border-t-transparent" />
            <p className="text-sm text-[#6B7280]">
              Recherche des programmes neufs sur SeLoger Neuf…
            </p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <NeufAnalysisResults
            result={result}
            onExport={handleExport}
            exportLoading={exportLoading}
            importedLots={importedLots}
            onImportLots={handleImportLots}
          />
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#E5E7EB] mt-16 py-5 text-center text-xs text-[#9CA3AF]">
        Source exclusive SeLoger Neuf · Prix de commercialisation affichés, non vérifiés
      </footer>
    </div>
  );
}
