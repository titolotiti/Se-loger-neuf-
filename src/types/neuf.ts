export type NeufTypology = "T1 / Studio" | "T2" | "T3" | "T4" | "T5+";
export type ParkingStatus = "Oui" | "Non" | "En option" | "Non communiqué";
export type ZoneType = "Commune principale" | "Commune limitrophe";
export type GeoPrecision = "exact_address" | "district" | "city_only" | "unknown";

export type NeufListing = {
  id: string;
  programId: string;
  source: "SeLogerNeuf";
  url: string;
  extractedAt: string;

  programName?: string;
  developer?: string;

  city: string;
  postalCode?: string;
  address?: string;

  geoPrecision: GeoPrecision;
  lat?: number;
  lng?: number;
  distanceMeters?: number;

  typology?: NeufTypology;
  rooms?: number;
  bedrooms?: number;

  surfaceM2?: number;
  priceEur?: number;
  pricePerM2?: number;

  floor?: string;
  outdoorSpace?: string;
  parking?: ParkingStatus;

  deliveryDate?: string;
  specialStatus?: string[];

  description?: string;

  reliabilityScore: number;
  excludedFromStats: boolean;
  exclusionReason?: string;
};

export type NeufProgram = {
  programId: string;
  source: "SeLogerNeuf";
  programName: string;
  developer?: string;
  address?: string;
  city: string;
  postalCode?: string;
  zoneType: ZoneType;
  url: string;
  totalUnits?: number;
  availableUnits?: number;
  deliveryDate?: string;
  parking?: ParkingStatus;
  listings: NeufListing[];
};

export type NeufAnalysisInput = {
  address: string;
  radiusKm?: number;
  includeBorderCities?: boolean;
  typologies?: NeufTypology[];
  cityOnly?: boolean;
};

export type GeocodedAddress = {
  label: string;
  city: string;
  postalCode: string;
  inseeCode?: string;
  lat: number;
  lng: number;
  department?: string;
  region?: string;
};

export type NeufAnalysisResult = {
  input: NeufAnalysisInput;
  geocodedAddress: GeocodedAddress;
  programs: NeufProgram[];
  listings: NeufListing[];
  warnings: string[];
  hasData: boolean;
  extractedAt: string;
};

export type NeufStats = {
  totalPrograms: number;
  totalListings: number;
  includedListings: number;
  pricePerM2ByTypology: Record<NeufTypology, { avg: number; min: number; max: number; count: number } | null>;
  surfaceByTypology: Record<NeufTypology, { avg: number; min: number; max: number } | null>;
  overallAvgPricePerM2: number | null;
};
