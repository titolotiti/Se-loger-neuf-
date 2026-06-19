export type SearchUrlParams = {
  city: string;
  postalCode: string;
  radiusKm?: number;
  page?: number;
};

const BASE = "https://www.seloger.com/immobilier/achat/immeuble/";

/**
 * Génère les URLs de recherche SeLoger Neuf pour une commune.
 * SeLoger Neuf est intégré dans le domaine seloger.com avec le filtre "programme neuf".
 */
export function buildSearchUrls(params: SearchUrlParams): string[] {
  const { city, postalCode, radiusKm, page = 1 } = params;

  const citySlug = slugify(city);
  const dept = postalCode.substring(0, 2);

  const urls: string[] = [];

  // URL principale SeLoger Neuf par commune
  const slnBase = `https://www.selogerneuf.com/immobilier/achat/`;
  const cityPath = `${citySlug}-${postalCode}/`;

  // Page de liste des programmes neufs
  const listUrl = `${slnBase}${cityPath}?idtypebien=2&naturebien=3${radiusKm ? `&rad=${radiusKm * 1000}` : ""}${page > 1 ? `&p=${page}` : ""}`;
  urls.push(listUrl);

  // URL alternative avec le département
  const deptUrl = `https://www.selogerneuf.com/immobilier/achat/${dept}/`;
  if (page === 1) urls.push(deptUrl);

  // URL de recherche par ville (format slug + code postal)
  const searchUrl = `https://www.selogerneuf.com/recherche/?idtypebien=2&naturebien=3&cp=${postalCode}&ville=${encodeURIComponent(city)}${radiusKm ? `&rad=${radiusKm * 1000}` : ""}&p=${page}`;
  urls.push(searchUrl);

  return urls;
}

/**
 * URL directe vers la page d'un programme SeLoger Neuf.
 */
export function buildProgramUrl(programId: string): string {
  return `https://www.selogerneuf.com/annonces/${programId}/`;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Génère les URLs de recherche pour plusieurs rayons et pages.
 */
export function buildAllSearchUrls(params: Omit<SearchUrlParams, "page">, maxPages = 3): string[] {
  const allUrls: string[] = [];
  for (let p = 1; p <= maxPages; p++) {
    allUrls.push(...buildSearchUrls({ ...params, page: p }));
  }
  return [...new Set(allUrls)];
}
