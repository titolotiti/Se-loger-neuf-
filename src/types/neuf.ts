export type NeufTypology = "T1 / Studio" | "T2" | "T3" | "T4" | "T5+";
export type LinkType = "program" | "category" | "promoter" | "navigation" | "unknown";
export type ParkingStatus = "Oui" | "Non" | "En option" | "Non communiqué";
export type ZoneType = "Commune principale" | "Commune limitrophe";
export type GeoPrecision = "exact_address" | "district" | "city_only" | "unknown";

export type ScrapeErrorType =
  | "invalid_url"
  | "http_403"
  | "http_404"
  | "http_429"
  | "http_error"
  | "network_error"
  | "timeout"
  | "anti_bot_cloudflare"
  | "js_only_page"
  | "empty_html";

export type ScrapeUrlResult = {
  url: string;
  status?: number;
  statusText?: string;
  errorType?: ScrapeErrorType;
  errorMessage?: string;
  linksFound: number;
  isCloudflarePage: boolean;
  isJsOnlyPage: boolean;
  hasNextData: boolean;
  htmlLength: number;
  htmlPreview: string;
};

export type ScrapeDiagnosisType =
  | "blocked"
  | "url_error"
  | "js_only"
  | "timeout"
  | "network"
  | "no_links";

export type ScrapeReport = {
  searchUrlsTested: number;
  urlResults: ScrapeUrlResult[];
  totalLinksFound: number;
  blocked403: number;
  blocked429: number;
  notFound404: number;
  networkErrors: number;
  timeouts: number;
  cloudflareBlocks: number;
  jsOnlyPages: number;
  successfulPages: number;
  diagnosisType?: ScrapeDiagnosisType;
  /** Cause probable expliquant 0 résultat */
  diagnosis?: string;
  /** Statistiques de classification des liens */
  categoryLinksSkipped?: number;
  promoterLinksSkipped?: number;
  programLinksRetained?: number;
  detailPagesFetched?: number;
  lotsExtracted?: number;
  duplicatesSkipped?: number;
  nextDataDebug?: {
    sampleItemKeys: string[][];
    rejectionSummary: Record<string, number>;
    programDebugInfos?: ProgramDebugInfo[];
  };
};

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
  isPlaceholderLot?: boolean;
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

export type ProgramDebugInfo = {
  programId: string;
  programName: string;
  url: string;
  rawKeys: string[];
  rawPreview: string;
  hasPromoter: boolean;
  hasDelivery: boolean;
  hasPrice: boolean;
  hasSurface: boolean;
  hasLots: boolean;
};

export type NeufAnalysisResult = {
  input: NeufAnalysisInput;
  geocodedAddress: GeocodedAddress;
  programs: NeufProgram[];
  listings: NeufListing[];
  warnings: string[];
  hasData: boolean;
  extractedAt: string;
  scrapeReport?: ScrapeReport;
};

export type NeufStats = {
  totalPrograms: number;
  totalListings: number;
  includedListings: number;
  pricePerM2ByTypology: Record<NeufTypology, { avg: number; min: number; max: number; count: number } | null>;
  surfaceByTypology: Record<NeufTypology, { avg: number; min: number; max: number } | null>;
  overallAvgPricePerM2: number | null;
};
