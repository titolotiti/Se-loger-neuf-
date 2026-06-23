"use client";

import { useCallback, useEffect, useState } from "react";
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
const BC_CHANNEL = "seloger_neuf_collecteur";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Carte compacte programme ──────────────────────────────────────────────────

function SidebarProgramCard({
  prog,
  onRemove,
}: {
  prog: ImportedProgramData;
  onRemove: () => void;
}) {
  const validLots = (prog.lots ?? []).filter((l) => l.typology !== null);
  const sourceUrl =
    prog.sourceUrl || ((prog as Record<string, unknown>).pageUrl as string) || "";

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

  const importedTime = prog.importedAt
    ? new Date(prog.importedAt).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-3.5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#111827] leading-snug line-clamp-2">
            {prog.programName}
          </p>
          {importedTime && (
            <p className="text-[10px] text-[#9CA3AF] mt-0.5">Importé à {importedTime}</p>
          )}
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 text-[#D1D5DB] hover:text-red-400 text-xl leading-none mt-0.5 transition-colors"
          title="Supprimer"
        >
          ×
        </button>
      </div>

      {/* Chiffres */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#6B7280] mb-2">
        {prog.totalUnits != null && <span>{fmt(prog.totalUnits)} log.</span>}
        {prog.availableUnits != null && <span>{fmt(prog.availableUnits)} dispo.</span>}
        {avgPm2 != null && (
          <span className="font-semibold text-[#111827]">
            {fmt(avgPm2)} €/m²
          </span>
        )}
      </div>

      {/* Typologies */}
      {validLots.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {validLots.map((lot, i) => (
            <span
              key={i}
              className="text-[10px] bg-[#EFF6FF] text-[#2563EB] font-medium px-1.5 py-0.5 rounded-full"
            >
              {lot.typology}
              {lot.surfaceM2 != null && ` ${lot.surfaceM2}m²`}
              {lot.pricePerM2 != null && ` · ${fmt(lot.pricePerM2)}€/m²`}
            </span>
          ))}
        </div>
      )}

      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#2563EB] hover:underline truncate block"
        >
          Voir sur SeLoger →
        </a>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function CollectedProgramsSidebar() {
  const [programs, setPrograms] = useState<ImportedProgramData[]>([]);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const list = raw ? (JSON.parse(raw) as ImportedProgramData[]) : [];
      setPrograms(Array.isArray(list) ? list : []);
    } catch {
      setPrograms([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);

    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_CHANNEL);
      bc.onmessage = refresh;
    } catch {}

    // Polling fallback every 2 s for same-tab localStorage changes
    const interval = setInterval(refresh, 2000);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      bc?.close();
      clearInterval(interval);
    };
  }, [refresh]);

  function remove(idx: number) {
    const next = programs.filter((_, i) => i !== idx);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setPrograms(next);
  }

  function clearAll() {
    if (
      confirm(
        `Supprimer les ${programs.length} programme(s) collecté(s) ?\n\nÀ faire avant de commencer une nouvelle série d'actifs.`
      )
    ) {
      localStorage.removeItem(LS_KEY);
      setPrograms([]);
    }
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

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#111827]">Collecteur</h2>
            <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
              LIVE
            </span>
          </div>
          {programs.length > 0 && (
            <span className="text-xs text-[#6B7280]">
              {programs.length} prog.
            </span>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={exportExcel}
            disabled={exporting || programs.length === 0}
            className="w-full text-sm font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed text-white py-2 rounded-xl transition-colors"
          >
            {exporting ? "Export…" : "↓ Exporter Excel"}
          </button>

          {programs.length > 0 && (
            <button
              onClick={clearAll}
              className="w-full text-xs font-medium text-red-500 hover:text-red-700 border border-red-100 hover:border-red-200 py-1.5 rounded-xl transition-colors"
            >
              Nouvelle analyse / vider
            </button>
          )}
        </div>

        {exportError && <p className="mt-2 text-xs text-red-500">{exportError}</p>}

        <div className="mt-3 pt-3 border-t border-[#F3F4F6]">
          <a
            href="/bookmarklet"
            className="flex items-center justify-center gap-1 text-[11px] text-[#6B7280] hover:text-[#2563EB] transition-colors"
          >
            <span>★</span>
            <span>Installer le bookmarklet</span>
          </a>
        </div>
      </div>

      {/* Empty state */}
      {ready && programs.length === 0 && (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 text-center">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm font-semibold text-[#111827] mb-1">Aucun programme</p>
          <p className="text-xs text-[#6B7280] leading-relaxed">
            Cliquez sur le bookmarklet depuis une page SeLoger Neuf pour ajouter un programme ici.
          </p>
        </div>
      )}

      {/* Cards */}
      {programs.map((prog, idx) => (
        <SidebarProgramCard key={idx} prog={prog} onRemove={() => remove(idx)} />
      ))}
    </div>
  );
}
