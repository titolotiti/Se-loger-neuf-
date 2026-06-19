"use client";

import { useState, useEffect } from "react";
import type { ImportedProgramData, ImportedLot, ImportedLotDebug, NeufTypology } from "@/types/neuf";

const VALID_TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];

type Props = {
  programName: string;
  programUrl: string;
  onImport: (data: ImportedProgramData) => void;
  onClose: () => void;
};

type ParsedPreview = {
  data: ImportedProgramData;
  error: null;
} | {
  data: null;
  error: string;
} | null;

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR");
}

export default function LotImportModal({ programName, programUrl, onImport, onClose }: Props) {
  const [jsonText, setJsonText] = useState("");
  const [scriptContent, setScriptContent] = useState<string>("");
  const [scriptCopied, setScriptCopied] = useState(false);
  const [preview, setPreview] = useState<ParsedPreview>(null);
  const [expandedBlock, setExpandedBlock] = useState<number | null>(null);

  useEffect(() => {
    fetch("/selogerneuf-bookmarklet.js")
      .then((r) => r.text())
      .then(setScriptContent)
      .catch(() => {});
  }, []);

  async function copyScript() {
    if (!scriptContent) return;
    try {
      await navigator.clipboard.writeText(scriptContent);
      setScriptCopied(true);
      setTimeout(() => setScriptCopied(false), 2000);
    } catch {}
  }

  function parseJson(text: string): ParsedPreview {
    if (!text.trim()) return null;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(text.trim()) as Record<string, unknown>;
    } catch {
      return { data: null, error: "JSON invalide — vérifiez la syntaxe." };
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { data: null, error: "Format inattendu — objet JSON attendu à la racine." };
    }
    if (!Array.isArray(obj.lots) || (obj.lots as unknown[]).length === 0) {
      return { data: null, error: "Le JSON ne contient pas de tableau 'lots' ou il est vide." };
    }

    const lots: ImportedLot[] = (obj.lots as Record<string, unknown>[]).map((lot) => {
      const rawTypo = String(lot.typology ?? "");
      const typology = VALID_TYPOLOGIES.includes(rawTypo as NeufTypology)
        ? (rawTypo as NeufTypology)
        : null;
      const debug = lot.debug as ImportedLotDebug | undefined;
      return {
        typology,
        rawTypology: String(lot.rawTypology ?? rawTypo ?? ""),
        surfaceM2: typeof lot.surfaceM2 === "number" ? lot.surfaceM2 : null,
        priceEur: typeof lot.priceEur === "number" ? lot.priceEur : null,
        pricePerM2: typeof lot.pricePerM2 === "number" ? lot.pricePerM2 : null,
        availableCount: typeof lot.availableCount === "number" ? Math.max(1, lot.availableCount) : 1,
        debug,
      };
    });

    if (lots.every((l) => l.typology === null)) {
      return {
        data: null,
        error: "Aucune typologie reconnue. Valeurs attendues : T1 / Studio, T2, T3, T4, T5+.",
      };
    }

    const data: ImportedProgramData = {
      programName: typeof obj.programName === "string" ? obj.programName : programName,
      sourceUrl: typeof obj.sourceUrl === "string" ? obj.sourceUrl : programUrl,
      totalUnits: typeof obj.totalUnits === "number" ? obj.totalUnits : null,
      availableUnits: typeof obj.availableUnits === "number" ? obj.availableUnits : null,
      lots,
      importedAt: new Date().toISOString(),
      bookmarkletVersion: typeof obj.bookmarkletVersion === "string" ? obj.bookmarkletVersion : undefined,
      bodyTextSample: typeof obj.bodyTextSample === "string" ? obj.bodyTextSample : undefined,
    };

    return { data, error: null };
  }

  function handleTextChange(text: string) {
    setJsonText(text);
    setExpandedBlock(null);
    setPreview(parseJson(text));
  }

  function handleImport() {
    if (!preview || preview.error !== null || !preview.data) return;
    onImport(preview.data);
    onClose();
  }

  const canImport = preview?.error === null && !!preview?.data;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="bg-blue-900 text-white rounded-t-xl px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold">Importer les lots</h2>
            <p className="text-blue-200 text-xs mt-0.5 truncate max-w-md">{programName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-blue-200 text-2xl font-light leading-none shrink-0 -mt-0.5"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Étape 1 */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">
              ① Ouvrez la page du programme dans votre navigateur
            </p>
            <a
              href={programUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-700 underline break-all"
            >
              {programUrl}
            </a>
          </div>

          {/* Étape 2 */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">
              ② Ouvrez la console du navigateur (F12 → Console)
            </p>
            <p className="text-xs text-gray-600">
              Sur Chrome/Edge :{" "}
              <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 font-mono text-[11px]">
                F12
              </kbd>{" "}
              → onglet <strong>Console</strong>
            </p>
          </div>

          {/* Étape 3 — script */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">
              ③ Copiez ce script et collez-le dans la console, puis Entrée
            </p>
            <div className="relative">
              <pre className="bg-gray-900 text-green-300 rounded-lg p-3 text-[10px] font-mono max-h-28 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
                {scriptContent || "Chargement du script…"}
              </pre>
              <button
                onClick={copyScript}
                disabled={!scriptContent}
                className="absolute top-2 right-2 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-500 text-white text-[10px] px-2.5 py-1 rounded transition-colors font-medium"
              >
                {scriptCopied ? "✓ Copié !" : "Copier"}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Le script copie automatiquement le JSON dans le presse-papiers après extraction.
            </p>
          </div>

          {/* Étape 4 — coller JSON */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">
              ④ Collez le JSON généré ci-dessous
            </p>
            <textarea
              value={jsonText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={
                '{\n  "bookmarkletVersion": "v2-accordion-debug",\n  "programName": "...",\n  "lots": [...]\n}'
              }
              className="w-full h-36 font-mono text-xs bg-gray-50 border border-gray-300 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Erreur de parsing */}
          {preview?.error && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700">
              <strong>Erreur :</strong> {preview.error}
            </div>
          )}

          {/* ── Prévisualisation ────────────────────────────────────────── */}
          {preview?.data && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-green-800">
                  ✓ {preview.data.lots.length} lot(s) détecté(s)
                </p>
                {preview.data.bookmarkletVersion && (
                  <span className="text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded font-mono">
                    {preview.data.bookmarkletVersion}
                  </span>
                )}
              </div>

              {/* Tableau des lots parsés */}
              <div className="overflow-x-auto">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-green-200 text-green-900">
                      <th className="px-2 py-1 text-left font-medium">Brut</th>
                      <th className="px-2 py-1 text-left font-medium">Typo normalisée</th>
                      <th className="px-2 py-1 text-right font-medium">Surface</th>
                      <th className="px-2 py-1 text-right font-medium">Prix</th>
                      <th className="px-2 py-1 text-right font-medium">Prix/m²</th>
                      <th className="px-2 py-1 text-center font-medium">Dispo</th>
                      <th className="px-2 py-1 text-center font-medium">Bloc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.lots.map((lot, i) => {
                      const hasWarn = lot.debug?.parsingWarnings && lot.debug.parsingWarnings.length > 0;
                      return (
                        <>
                          <tr
                            key={i}
                            className={`border-t border-green-200 ${lot.typology ? "" : "bg-red-50"}`}
                          >
                            <td className="px-2 py-1 font-mono text-gray-600">{lot.rawTypology || "—"}</td>
                            <td className="px-2 py-1 font-semibold">
                              {lot.typology ?? (
                                <span className="text-red-600">Non reconnue</span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-right">
                              {lot.surfaceM2 != null ? `${lot.surfaceM2} m²` : (
                                <span className="text-red-500">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-right">
                              {lot.priceEur != null ? `${fmt(lot.priceEur)} €` : (
                                <span className="text-red-500">—</span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-right">
                              {lot.pricePerM2 != null ? `${fmt(lot.pricePerM2)} €/m²` : "—"}
                            </td>
                            <td className="px-2 py-1 text-center">{lot.availableCount}</td>
                            <td className="px-2 py-1 text-center">
                              {lot.debug?.rawBlockText ? (
                                <button
                                  onClick={() => setExpandedBlock(expandedBlock === i ? null : i)}
                                  className="text-[10px] text-blue-600 underline whitespace-nowrap"
                                >
                                  {expandedBlock === i ? "▲ masquer" : "▼ voir"}
                                </button>
                              ) : "—"}
                            </td>
                          </tr>
                          {/* Warnings */}
                          {hasWarn && (
                            <tr key={`warn-${i}`} className="bg-amber-50">
                              <td colSpan={7} className="px-2 pb-1 pt-0">
                                <p className="text-[10px] text-amber-700">
                                  ⚠ {lot.debug!.parsingWarnings.join(" · ")}
                                </p>
                              </td>
                            </tr>
                          )}
                          {/* rawBlockText */}
                          {expandedBlock === i && lot.debug?.rawBlockText && (
                            <tr key={`block-${i}`}>
                              <td colSpan={7} className="px-2 py-2 bg-gray-900">
                                <pre className="text-[10px] font-mono text-green-300 whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto">
                                  {lot.debug.rawBlockText}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* bodyTextSample */}
              {preview.data.bodyTextSample && (
                <details className="text-[11px] text-green-700">
                  <summary className="cursor-pointer font-medium">
                    Voir bodyTextSample (texte autour de &quot;Logements disponibles&quot;)
                  </summary>
                  <pre className="mt-2 bg-gray-900 text-green-300 rounded p-2 text-[10px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto leading-relaxed">
                    {preview.data.bodyTextSample}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Avertissement source */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>⚠️ Rappel :</strong> source exclusive SeLoger Neuf. Ne jamais saisir de données
            issues d'autres sources. Les prix sont des prix de commercialisation affichés, non vérifiés.
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1 border-t border-gray-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleImport}
              disabled={!canImport}
              className="px-5 py-2 text-sm font-semibold bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {canImport
                ? `Importer ${preview!.data!.lots.length} lot(s)`
                : "Importer les lots"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
