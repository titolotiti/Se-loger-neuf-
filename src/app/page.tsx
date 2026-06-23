"use client";

import { useState } from "react";
import NeufAddressForm from "@/components/neuf/NeufAddressForm";
import NeufAnalysisResults from "@/components/neuf/NeufAnalysisResults";
import CollectedProgramsSidebar from "@/components/neuf/CollectedProgramsSidebar";
import type { NeufAnalysisInput, NeufAnalysisResult } from "@/types/neuf";

export default function Home() {
  const [result, setResult] = useState<NeufAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleAnalyze(input: NeufAnalysisInput) {
    setLoading(true);
    setError(null);
    setResult(null);
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
      const res = await fetch("/api/neuf/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
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
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight">Neuf Analyzer</span>
            <span className="hidden sm:inline text-slate-500 text-xs">· SeLoger Neuf</span>
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="/bookmarklet"
              className="text-xs font-medium text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              ★ Bookmarklet
            </a>
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              Collecteur
            </button>
          </nav>
        </div>
      </header>

      {/* ── Mobile sidebar drawer ── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative ml-auto w-[320px] max-w-[90vw] h-full bg-[#F7F8FA] overflow-y-auto p-4 shadow-xl">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-[#6B7280] hover:text-[#111827] text-2xl leading-none"
              aria-label="Fermer"
            >
              ×
            </button>
            <div className="mt-10">
              <CollectedProgramsSidebar />
            </div>
          </div>
        </div>
      )}

      {/* ── 2-column layout ── */}
      <div className="max-w-7xl mx-auto px-4 py-8 lg:flex lg:gap-6 lg:items-start">
        {/* Sidebar – desktop only */}
        <aside className="hidden lg:block w-[320px] shrink-0 sticky top-[65px] max-h-[calc(100vh-80px)] overflow-y-auto">
          <CollectedProgramsSidebar />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-8">
          {/* Hero */}
          <div className="text-center pb-2">
            <h1 className="text-2xl font-bold text-[#111827]">Analyse de l&apos;offre neuve</h1>
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
            />
          )}
        </main>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-[#E5E7EB] mt-16 py-5 text-center text-xs text-[#9CA3AF]">
        Source exclusive SeLoger Neuf · Prix de commercialisation affichés, non vérifiés
      </footer>
    </div>
  );
}
