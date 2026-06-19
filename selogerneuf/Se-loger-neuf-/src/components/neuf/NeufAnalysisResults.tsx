"use client";

import { useState } from "react";
import type { NeufAnalysisResult, NeufProgram, NeufTypology } from "@/types/neuf";

const TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];

function fmt(n: number | null | undefined, unit = ""): string {
  if (n == null || !isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")}${unit}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)} %`;
}

type ProgramRowProps = {
  prog: NeufProgram;
};

function ProgramRow({ prog }: ProgramRowProps) {
  const included = prog.listings.filter((l) => !l.excludedFromStats);

  const priceByTypo: Record<NeufTypology, number | null> = {
    "T1 / Studio": null,
    T2: null,
    T3: null,
    T4: null,
    "T5+": null,
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
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            prog.zoneType === "Commune principale"
              ? "bg-blue-100 text-blue-800"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {prog.zoneType === "Commune principale" ? "Principale" : "Limitrophe"}
        </span>
      </td>
    </tr>
  );
}

type Props = {
  result: NeufAnalysisResult;
  onExport: () => void;
  exportLoading: boolean;
};

export default function NeufAnalysisResults({ result, onExport, exportLoading }: Props) {
  const [showExcluded, setShowExcluded] = useState(false);

  const allListings = result.listings;
  const included = allListings.filter((l) => !l.excludedFromStats);
  const excluded = allListings.filter((l) => l.excludedFromStats);

  return (
    <div className="space-y-6">
      {/* En-tête résultats */}
      <div className="bg-blue-900 text-white rounded-xl p-5">
        <h2 className="text-lg font-bold">
          Analyse de l'offre neuve — {result.geocodedAddress.label}
        </h2>
        <p className="text-blue-200 text-sm mt-1">
          Données extraites le{" "}
          {new Date(result.extractedAt).toLocaleString("fr-FR", {
            dateStyle: "long",
            timeStyle: "short",
          })}
        </p>
      </div>

      {/* Avertissement */}
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800">
        <strong>⚠️ Prix affichés / prix de commercialisation</strong> — données issues
        exclusivement de SeLoger Neuf, à vérifier. Ces données ne constituent pas des
        transactions actées.
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-gray-600">
              {w}
            </p>
          ))}
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
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Prix/m² moyens par typologie
          </h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-blue-700 text-white">
                {TYPOLOGIES.map((t) => (
                  <th key={t} className="px-4 py-2 text-center font-semibold">
                    {t}
                  </th>
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
                  const avg = prices.length
                    ? prices.reduce((a, b) => a + b, 0) / prices.length
                    : null;
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

      {/* Tableau des programmes */}
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
                  <th key={t} className="px-3 py-2 text-right whitespace-nowrap">
                    {t}
                  </th>
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
      ) : (
        <div className="bg-gray-100 rounded-lg p-6 text-center text-gray-500">
          <p className="text-lg font-medium mb-1">Aucune offre neuve exploitable trouvée</p>
          <p className="text-sm">
            Aucun programme neuf n'a été trouvé sur SeLoger Neuf pour cette commune.
            <br />
            Essayez d'élargir la recherche aux communes limitrophes.
          </p>
        </div>
      )}

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
                      <td className="px-2 py-1 text-right">
                        {l.surfaceM2 != null ? `${l.surfaceM2} m²` : "—"}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {l.priceEur != null ? `${fmt(l.priceEur)} €` : "—"}
                      </td>
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
