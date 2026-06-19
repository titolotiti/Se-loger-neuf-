import type { GeocodedAddress } from "@/types/neuf";

const BAN_API = "https://api-adresse.data.gouv.fr/search/";

export async function geocodeAddress(address: string): Promise<GeocodedAddress> {
  const params = new URLSearchParams({ q: address, limit: "1" });
  const url = `${BAN_API}?${params}`;

  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 3600 } });
  } catch {
    throw new Error(`Géocodage impossible : réseau indisponible (${address})`);
  }

  if (!res.ok) {
    throw new Error(`Géocodage BAN a retourné HTTP ${res.status}`);
  }

  const data = await res.json();

  if (!data?.features?.length) {
    throw new Error(`Aucun résultat de géocodage pour l'adresse : "${address}"`);
  }

  const feat = data.features[0];
  const props = feat.properties;
  const [lng, lat] = feat.geometry.coordinates;

  return {
    label: props.label ?? address,
    city: props.city ?? props.municipality ?? "",
    postalCode: props.postcode ?? "",
    inseeCode: props.citycode ?? undefined,
    lat,
    lng,
    department: props.context?.split(",")[0]?.trim() ?? undefined,
    region: props.context?.split(",")[2]?.trim() ?? undefined,
  };
}
