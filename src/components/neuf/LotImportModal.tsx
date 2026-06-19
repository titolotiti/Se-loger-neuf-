"use client";

import { useState, useEffect } from "react";
import type { ImportedProgramData, ImportedLot, NeufTypology } from "@/types/neuf";

const VALID_TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];

type Props = {
  programName: string;
  programUrl: string;
  onImport: (data: ImportedProgramData) => void;
  onClose: () => void;
};

export default function LotImportModal({ programName, programUrl, onImport, onClose }: Props) {
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scriptContent, setScriptContent] = useState<string>("");
  const [scriptCopied, setScriptCopied] = useState(false);

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

  function handleImport() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch {
      setError("JSON invalide — vérifiez la syntaxe.");
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setError("Format inattendu — objet JSON attendu à la racine.");
      return;
    }

    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.lots) || obj.lots.length === 0) {
      setError("Le JSON ne contient pas de tableau 'lots' ou il est vide.");
      return;
    }

    const lots: ImportedLot[] = [];
    for (let i = 0; i < obj.lots.length; i++) {
      const lot = obj.lots[i] as Record<string, unknown>;
      const rawTypo = String(lot.typology ?? "");
      const typology = VALID_TYPOLOGIES.includes(rawTypo as NeufTypology)
        ? (rawTypo as NeufTypology)
        : null;
      lots.push({
        typology,
        rawTypology: String(lot.rawTypology ?? rawTypo ?? ""),
        surfaceM2: typeof lot.surfaceM2 === "number" ? lot.surfaceM2 : null,
        priceEur: typeof lot.priceEur === "number" ? lot.priceEur : null,
        pricePerM2: typeof lot.pricePerM2 === "number" ? lot.pricePerM2 : null,
        availableCount: typeof lot.availableCount === "number" ? Math.max(1, lot.availableCount) : 1,
      });
    }

    if (lots.every((l) => l.typology === null)) {
      setError(
        "Aucune typologie reconnue. Valeurs attendues : T1 / Studio, T2, T3, T4, T5+."
      );
      return;
    }

    const data: ImportedProgramData = {
      programName: typeof obj.programName === "string" ? obj.programName : programName,
      sourceUrl: typeof obj.sourceUrl === "string" ? obj.sourceUrl : programUrl,
      totalUnits: typeof obj.totalUnits === "number" ? obj.totalUnits : null,
      availableUnits: typeof obj.availableUnits === "number" ? obj.availableUnits : null,
      lots,
      importedAt: new Date().toISOString(),
    };

    onImport(data);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto"
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
              ② Ouvrez la console du navigateur
            </p>
            <p className="text-xs text-gray-600">
              Appuyez sur{" "}
              <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 font-mono text-[11px]">
                F12
              </kbd>{" "}
              → onglet <strong>Console</strong>
            </p>
          </div>

          {/* Étape 3 */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">
              ③ Copiez ce script, collez-le dans la console et appuyez sur Entrée
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
              Le script copie automatiquement le JSON dans le presse-papiers.
            </p>
          </div>

          {/* Étape 4 */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">
              ④ Collez le JSON généré ci-dessous
            </p>
            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setError(null);
              }}
              placeholder={'{\n  "programName": "Nom du programme",\n  "lots": [\n    { "typology": "T2", "surfaceM2": 45, "priceEur": 350000, "availableCount": 3 }\n  ]\n}'}
              className="w-full h-40 font-mono text-xs bg-gray-50 border border-gray-300 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Erreur */}
          {error && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700">
              <strong>Erreur :</strong> {error}
            </div>
          )}

          {/* Avertissement données */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <strong>⚠️ Rappel :</strong> source exclusive SeLoger Neuf. Ne pas saisir de données
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
              disabled={!jsonText.trim()}
              className="px-5 py-2 text-sm font-semibold bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              Importer les lots
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
