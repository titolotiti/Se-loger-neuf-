"use client";

import { useState } from "react";
import type { NeufAnalysisInput, NeufTypology } from "@/types/neuf";

const TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];

type Props = {
  onSubmit: (input: NeufAnalysisInput) => void;
  loading: boolean;
};

export default function NeufAddressForm({ onSubmit, loading }: Props) {
  const [address, setAddress] = useState("");
  const [selectedTypologies, setSelectedTypologies] = useState<NeufTypology[]>([]);
  const [cityOnly, setCityOnly] = useState(true);
  const [radiusKm, setRadiusKm] = useState<number | undefined>(undefined);
  const [includeBorderCities, setIncludeBorderCities] = useState(false);

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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Adresse */}
      <div>
        <label className="block text-sm font-medium text-[#374151] mb-1.5">
          Adresse à analyser
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Ex : 15 rue de la Paix, Paris 75002"
          required
          className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-colors"
        />
      </div>

      {/* Périmètre */}
      <div className="flex items-center gap-2.5">
        <input
          id="cityOnly"
          type="checkbox"
          checked={cityOnly}
          onChange={(e) => setCityOnly(e.target.checked)}
          className="h-4 w-4 text-[#2563EB] border-[#D1D5DB] rounded"
        />
        <label htmlFor="cityOnly" className="text-sm text-[#374151] select-none cursor-pointer">
          Analyser uniquement la commune
        </label>
      </div>

      {!cityOnly && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl">
          <div>
            <label className="block text-xs font-medium text-[#6B7280] mb-1.5">Rayon</label>
            <select
              value={radiusKm ?? ""}
              onChange={(e) => setRadiusKm(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB]"
            >
              <option value="">Commune uniquement</option>
              <option value="1">1 km</option>
              <option value="2">2 km</option>
              <option value="5">5 km</option>
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-[#374151] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeBorderCities}
                onChange={(e) => setIncludeBorderCities(e.target.checked)}
                className="h-4 w-4 text-[#2563EB] border-[#D1D5DB] rounded"
              />
              Communes limitrophes
            </label>
          </div>
        </div>
      )}

      {/* Typologies */}
      <div>
        <label className="block text-xs font-medium text-[#6B7280] mb-2">
          Typologies (optionnel — toutes si vide)
        </label>
        <div className="flex flex-wrap gap-2">
          {TYPOLOGIES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTypology(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedTypologies.includes(t)
                  ? "bg-[#2563EB] text-white border-[#2563EB]"
                  : "bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#2563EB] hover:text-[#2563EB]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <button
        type="submit"
        disabled={loading || !address.trim()}
        className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-white disabled:cursor-not-allowed font-semibold py-3 rounded-xl transition-colors text-sm"
      >
        {loading ? "Analyse en cours…" : "Analyser l'offre neuve"}
      </button>
    </form>
  );
}
