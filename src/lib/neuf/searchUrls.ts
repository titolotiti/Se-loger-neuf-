export type SearchUrlParams = {
  city: string;
  postalCode: string;
  radiusKm?: number;
  page?: number;
};

/**
 * Format réel SeLoger Neuf (confirmé) :
 * https://www.selogerneuf.com/immobilier/neuf/immo-{citySlug}-{dept}/bien-programme/
 *
 * Exemples :
 *   Neuilly-sur-Seine (92200) → /immobilier/neuf/immo-neuilly-sur-seine-92/bien-programme/
 *   Paris 15e (75015)         → /immobilier/neuf/immo-paris-75/bien-programme/
 *   Lyon (69001)              → /immobilier/neuf/immo-lyon-69/bien-programme/
 */
export function buildSearchUrls(params: SearchUrlParams): string[] {
  const { city, postalCode, page = 1 } = params;

  const citySlug = slugify(city);
  const dept = extractDept(postalCode);
  const cityDeptSlug = `immo-${citySlug}-${dept}`;

  const base = `https://www.selogerneuf.com/immobilier/neuf/${cityDeptSlug}/bien-programme/`;
  const pageParam = page > 1 ? `?p=${page}` : "";

  const urls: string[] = [];

  // URL principale avec pagination
  urls.push(`${base}${pageParam}`);

  // Variantes par nombre de pièces (page 1 seulement)
  if (page === 1) {
    for (const n of [2, 3, 4, 5]) {
      urls.push(`${base}${n}-pieces/`);
    }
  }

  return [...new Set(urls)];
}

/**
 * Extrait le numéro de département à partir du code postal.
 * Gère les cas standard (92, 75, 69…) et les DOM (971-976 → 97x).
 */
function extractDept(postalCode: string): string {
  const cp = postalCode.replace(/\s/g, "");
  if (cp.startsWith("97")) return cp.substring(0, 3);
  return cp.substring(0, 2);
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildAllSearchUrls(
  params: Omit<SearchUrlParams, "page">,
  maxPages = 3
): string[] {
  const allUrls: string[] = [];
  for (let p = 1; p <= maxPages; p++) {
    allUrls.push(...buildSearchUrls({ ...params, page: p }));
  }
  return [...new Set(allUrls)];
}
