"use client";

import { useState } from "react";
import type { NeufAnalysisInput, NeufTypology } from "@/types/neuf";

const TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];
const RADII = [
  { label: "Commune uniquement", value: undefined },
  { label: "1 km", value: 1 },
  { label: "2 km", value: 2 },
  { label: "5 km", value: 5 },
];

type Props = {
  onSubmit: (input: NeufAnalysisInput) => void;
  loading: boolean;
};

export default function NeufAddressForm({ onSubmit, loading }: Props) {
  const [address, setAddress] = useState("");
  const [radiusKm, setRadiusKm] = useState<number | undefined>(undefined);
  const [includeBorderCities, setIncludeBorderCities] = useState(false);
  const [selectedTypologies, setSelectedTypologies] = useState<NeufTypology[]>([]);
  const [cityOnly, setCityOnly] = useState(true);

  function toggleTypology(t: NeufTypology) {
    setSelectedTypologies((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    onSubmit({
      address: address.trim(),
      radiusKm: cityOnly ? undefined : radiusKm,
      includeBorderCities: !cityOnly && includeBorderCities,
      typologies: selectedTypologies.length > 0 ? selectedTypologies : undefined,
      cityOnly,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md p-6 space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Adresse à analyser <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ex : 15 rue de la Paix, 75002 Paris"
          required
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="cityOnly"
          type="checkbox"
          checked={cityOnly}
          onChange={(e) => setCityOnly(e.target.checked)}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
        />
        <label htmlFor="cityOnly" className="text-sm text-gray-700">
          Analyser uniquement la commune de l'adresse
        </label>
      </div>

      {!cityOnly && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Rayon d'analyse</label>
            <select
              value={radiusKm ?? ""}
              onChange={(e) => setRadiusKm(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {RADII.map((r) => (
                <option key={r.label} value={r.value ?? ""}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBorderCities}
                onChange={(e) => setIncludeBorderCities(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              Inclure les communes limitrophes
            </label>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Typologies recherchées (optionnel — toutes si aucune sélectionnée)
        </label>
        <div className="flex flex-wrap gap-2">
          {TYPOLOGIES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTypology(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedTypologies.includes(t)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
        <strong>⚠️ Source unique :</strong> Cet outil analyse exclusivement les données de SeLoger Neuf.
        Les prix affichés sont des prix de commercialisation, non des transactions actées.
      </div>

      <button
        type="submit"
        disabled={loading || !address.trim()}
        className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors text-sm"
      >
        {loading ? "Analyse en cours…" : "Analyser l'offre neuve"}
      </button>
    </form>
  );
}
