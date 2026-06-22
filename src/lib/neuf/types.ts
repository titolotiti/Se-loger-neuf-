export type NeufTypologie = 'T1 / Studio' | 'T1' | 'Studio' | 'T2' | 'T3' | 'T4' | 'T5' | 'T5+';

export interface NeufLot {
  // Format normalisé attendu par l'export Excel
  typologie?: NeufTypologie;
  surface_m2?: number | null;
  prix_euros?: number | null;
  prix_m2?: number | null;

  // Alias compatibles avec le JSON du bookmarklet
  typology?: NeufTypologie;
  rawTypology?: string;
  surfaceM2?: number | null;
  priceEur?: number | null;
  pricePerM2?: number | null;
  availableCount?: number;
}

export interface NeufProgramme {
  // Format normalisé attendu par l'export Excel
  nom?: string;
  adresse?: string;
  ville?: string;
  promoteur?: string;
  telephone?: string;
  nb_logements?: number | null;
  nb_disponibles?: number | null;
  date_livraison?: string | null;
  lots?: NeufLot[];

  // Alias compatibles avec le JSON du bookmarklet / front
  programName?: string;
  name?: string;
  pageUrl?: string;
  url?: string;
  city?: string;
  totalUnits?: number | null;
  availableUnits?: number | null;
  delivery?: string | null;
}

export interface NeufExportRequest {
  titre?: string;
  ville_principale?: string;
  programmes: NeufProgramme[];
}
