export type SearchUrlParams = {
  city: string;
  postalCode: string;
  radiusKm?: number;
  page?: number;
};

export function buildSearchUrls(params: SearchUrlParams): string[] {
  const { city, postalCode, radiusKm, page = 1 } = params;

  const citySlug = slugify(city);
  const dept = postalCode.substring(0, 2);
  const pageParam = page > 1 ? `&p=${page}` : "";
  const radParam = radiusKm ? `&rad=${radiusKm * 1000}` : "";

  const urls: string[] = [];

  // Format 1 — SeLoger Neuf : /achat/ville-cp/
  urls.push(
    `https://www.selogerneuf.com/achat/${citySlug}-${postalCode}/${page > 1 ? `?p=${page}` : ""}`
  );

  // Format 2 — SeLoger Neuf : /immobilier/achat/ville-cp/?naturebien=3 (neuf)
  urls.push(
    `https://www.selogerneuf.com/immobilier/achat/${citySlug}-${postalCode}/?naturebien=3${radParam}${pageParam}`
  );

  // Format 3 — SeLoger Neuf : /recherche/ avec cp et naturebien
  urls.push(
    `https://www.selogerneuf.com/recherche/?naturebien=3&cp=${postalCode}&ville=${encodeURIComponent(city)}${radParam}${pageParam}`
  );

  // Format 4 — SeLoger Neuf : page département
  if (page === 1) {
    urls.push(`https://www.selogerneuf.com/achat/${dept}/`);
    urls.push(`https://www.selogerneuf.com/immobilier/achat/${dept}/`);
  }

  return [...new Set(urls.filter(Boolean))];
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
