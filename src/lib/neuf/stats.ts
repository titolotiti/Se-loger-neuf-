import type { NeufListing, NeufProgram, NeufStats, NeufTypology } from "@/types/neuf";

const TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];

export function computeStats(programs: NeufProgram[]): NeufStats {
  const allListings = programs.flatMap((p) => p.listings);
  const included = allListings.filter((l) => !l.excludedFromStats);

  const pricePerM2ByTypology = {} as NeufStats["pricePerM2ByTypology"];
  const surfaceByTypology = {} as NeufStats["surfaceByTypology"];

  for (const typo of TYPOLOGIES) {
    const lots = included.filter((l) => l.typology === typo);
    const prices = lots.map((l) => l.pricePerM2).filter((v): v is number => v != null && isFinite(v));
    const surfaces = lots.map((l) => l.surfaceM2).filter((v): v is number => v != null && isFinite(v));

    pricePerM2ByTypology[typo] =
      prices.length > 0
        ? {
            avg: avg(prices),
            min: Math.min(...prices),
            max: Math.max(...prices),
            count: prices.length,
          }
        : null;

    surfaceByTypology[typo] =
      surfaces.length > 0
        ? {
            avg: avg(surfaces),
            min: Math.min(...surfaces),
            max: Math.max(...surfaces),
          }
        : null;
  }

  const allPrices = included
    .map((l) => l.pricePerM2)
    .filter((v): v is number => v != null && isFinite(v));

  return {
    totalPrograms: programs.length,
    totalListings: allListings.length,
    includedListings: included.length,
    pricePerM2ByTypology,
    surfaceByTypology,
    overallAvgPricePerM2: allPrices.length > 0 ? avg(allPrices) : null,
  };
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function groupProgramsByCity(programs: NeufProgram[]): Map<string, NeufProgram[]> {
  const map = new Map<string, NeufProgram[]>();
  for (const prog of programs) {
    const key = prog.city;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(prog);
  }
  return map;
}

/**
 * Calcule les warnings à inclure dans le rapport.
 */
export function buildWarnings(
  programs: NeufProgram[],
  totalListings: number,
  includedListings: number
): string[] {
  const warnings: string[] = [];

  warnings.push(
    "⚠️ Prix affichés / prix de commercialisation — données issues de SeLoger Neuf, à vérifier."
  );
  warnings.push(
    "Ces données ne constituent pas des transactions actées. Elles reflètent les prix de commercialisation au moment de l'extraction."
  );

  if (programs.length === 0) {
    warnings.push("Aucun programme neuf trouvé sur SeLoger Neuf pour cette commune.");
  }

  if (totalListings > 0 && includedListings === 0) {
    warnings.push(
      "Des annonces ont été trouvées mais aucune n'est exploitable (prix ou surface manquants)."
    );
  }

  const excluded = totalListings - includedListings;
  if (excluded > 0) {
    warnings.push(`${excluded} lot(s) exclu(s) des statistiques (prix/surface manquants ou score insuffisant).`);
  }

  return warnings;
}
