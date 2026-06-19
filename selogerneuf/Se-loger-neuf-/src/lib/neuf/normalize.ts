import type { NeufListing, NeufProgram, NeufTypology } from "@/types/neuf";
import { isSeLogerNeufUrl } from "./scraper";

/**
 * Normalise et nettoie les programmes et lots extraits.
 */
export function normalizePrograms(programs: NeufProgram[]): NeufProgram[] {
  const seenProgramIds = new Set<string>();
  const seenListingKeys = new Set<string>();

  return programs
    .filter((prog) => {
      if (!prog.url || !isSeLogerNeufUrl(prog.url)) return false;
      if (seenProgramIds.has(prog.programId)) return false;
      seenProgramIds.add(prog.programId);
      return true;
    })
    .map((prog) => ({
      ...prog,
      programName: prog.programName?.trim() || "Programme inconnu",
      developer: prog.developer?.trim() || undefined,
      address: prog.address?.trim() || undefined,
      city: normCity(prog.city),
      postalCode: prog.postalCode?.replace(/\s/g, "") || undefined,
      listings: normalizeListings(prog.listings, seenListingKeys),
    }));
}

function normalizeListings(listings: NeufListing[], seenKeys: Set<string>): NeufListing[] {
  return listings
    .filter((l) => {
      if (!isSeLogerNeufUrl(l.url)) return false;

      // Clé de déduplication : programme + typologie + surface + prix
      const key = `${l.programId}|${l.typology}|${l.surfaceM2}|${l.priceEur}`;
      if (seenKeys.has(key)) {
        // Marquer comme doublon mais garder avec raison
        return false;
      }
      seenKeys.add(key);
      return true;
    })
    .map((l) => {
      const pricePerM2 =
        l.priceEur && l.surfaceM2 ? l.priceEur / l.surfaceM2 : undefined;

      const excluded = shouldExclude(l);

      return {
        ...l,
        pricePerM2,
        excludedFromStats: excluded.excluded,
        exclusionReason: excluded.reason,
      };
    });
}

function shouldExclude(l: NeufListing): { excluded: boolean; reason?: string } {
  if (!l.priceEur) return { excluded: true, reason: "Prix absent" };
  if (!l.surfaceM2) return { excluded: true, reason: "Surface absente" };
  if (!l.typology) return { excluded: true, reason: "Typologie non identifiée" };
  if (l.reliabilityScore < 60) return { excluded: true, reason: "Score de fiabilité insuffisant" };

  const ratio = l.priceEur / l.surfaceM2;
  if (ratio < 1000 || ratio > 30000) {
    return { excluded: true, reason: `Prix/m² incohérent (${Math.round(ratio)} €/m²)` };
  }

  return { excluded: false };
}

function normCity(city: string): string {
  return city
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Retourne tous les lots exploitables (non exclus, score >= 60).
 */
export function getIncludedListings(programs: NeufProgram[]): NeufListing[] {
  return programs.flatMap((p) => p.listings.filter((l) => !l.excludedFromStats));
}

/**
 * Retourne tous les lots, y compris exclus.
 */
export function getAllListings(programs: NeufProgram[]): NeufListing[] {
  return programs.flatMap((p) => p.listings);
}

/**
 * Filtre les programmes par typologies si spécifié.
 */
export function filterByTypologies(
  programs: NeufProgram[],
  typologies?: NeufTypology[]
): NeufProgram[] {
  if (!typologies || typologies.length === 0) return programs;

  return programs
    .map((prog) => ({
      ...prog,
      listings: prog.listings.filter(
        (l) => !l.typology || typologies.includes(l.typology)
      ),
    }))
    .filter((prog) => prog.listings.length > 0);
}
