import ExcelJS from "exceljs";
import type { NeufAnalysisResult, NeufProgram, NeufListing, NeufTypology } from "@/types/neuf";

// ── Typologies ────────────────────────────────────────────────────────────────import ExcelJS from "exceljs";
import type { NeufAnalysisResult, NeufProgram, NeufListing, NeufTypology } from "@/types/neuf";

// ── Typologies ────────────────────────────────────────────────────────────────
const TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];
const TYPO_LETTER: Record<NeufTypology, string> = {
  "T1 / Studio": "a", "T2": "b", "T3": "c", "T4": "d", "T5+": "e",
};
const TYPO_LABEL: Record<NeufTypology, string> = {
  "T1 / Studio": "T1", "T2": "T2", "T3": "T3", "T4": "T4", "T5+": "T5+",
};

// ── Couleurs ──────────────────────────────────────────────────────────────────
const C_NAV = "1F3864"; // bleu foncé  : titres principaux
const C_BLU = "2E75B5"; // bleu moyen  : total ville, sous-en-têtes Offre neuve
const C_LBL = "BDD7EE"; // bleu clair  : titres ville Adresse, blocs typo Data
const C_GRY = "D9D9D9"; // gris        : header colonnes Data
const C_YLW = "FFF2CC"; // jaune clair : ligne moyenne Data
const C_WHT = "FFFFFF";

// ── Formats ───────────────────────────────────────────────────────────────────
const FMT_M2  = '0 "m²"';
const FMT_EUR = '#,##0 "€"';
const FMT_PM2 = '#,##0 "€/m²"';
const FMT_PCT = "0%";
const FMT_NB  = "#,##0";

// ── Colonnes Data (1-indexé, n = index programme 0-based) ─────────────────────
// Bloc de 6 col par programme : [num | sep | m² | prix | pm² | sep]
// n=0 → B:G, n=1 → H:M, n=2 → N:S, n=3 → T:Y …
const numCol  = (n: number) => 6 * n + 2;
const sep1Col = (n: number) => 6 * n + 3;
const m2Col   = (n: number) => 6 * n + 4;
const prixCol = (n: number) => 6 * n + 5;
const pm2Col  = (n: number) => 6 * n + 6;
const sep2Col = (n: number) => 6 * n + 7;

function cl(n: number): string {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

function progLots(prog: NeufProgram, typo: NeufTypology): NeufListing[] {
  return prog.listings.filter(l => l.typology === typo && !l.isPlaceholderLot);
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 1 — applyBorder
// ══════════════════════════════════════════════════════════════════════════════
function applyBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top:    { style: "thin" },
    bottom: { style: "thin" },
    left:   { style: "thin" },
    right:  { style: "thin" },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 2 — styleRange
// Parcourt TOUTES les cellules de la plage, même vides.
// ══════════════════════════════════════════════════════════════════════════════
type StyleOpts = {
  bg?: string;
  fc?: string;
  bold?: boolean;
  border?: boolean;
  numFmt?: string;
  wrap?: boolean;
  hAlign?: ExcelJS.Alignment["horizontal"];
  vAlign?: ExcelJS.Alignment["vertical"];
  fontSize?: number;
};

function styleRange(
  ws: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  o: StyleOpts
) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(r, c);

      if (o.bg !== undefined)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + o.bg } };

      if (o.bold !== undefined || o.fc !== undefined || o.fontSize !== undefined) {
        cell.font = {
          bold:  o.bold ?? false,
          color: o.fc       ? { argb: "FF" + o.fc } : undefined,
          size:  o.fontSize ?? undefined,
        } as ExcelJS.Font;
      }

      if (o.border) applyBorder(cell);
      if (o.numFmt) cell.numFmt = o.numFmt;

      if (o.wrap !== undefined || o.hAlign !== undefined || o.vAlign !== undefined) {
        cell.alignment = {
          wrapText:   o.wrap,
          horizontal: o.hAlign,
          vertical:   o.vAlign ?? "middle",
        };
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 3 — safeAddress
// Rejette les adresses qui sont des petits nombres (artefacts de scraping).
// ══════════════════════════════════════════════════════════════════════════════
function safeAddress(prog: NeufProgram): string {
  const addr = prog.address;
  if (addr == null) return "";
  const s = String(addr).trim();
  if (/^\d{1,3}$/.test(s)) return ""; // valeur numérique courte = probablement un index
  return s;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 4 — safeTotalUnits
// Ne jamais afficher un total < nb disponibles.
// ══════════════════════════════════════════════════════════════════════════════
function safeTotalUnits(prog: NeufProgram): number | null {
  const dispo = prog.availableUnitsDetected ?? prog.availableUnits ?? null;
  const total = prog.totalUnits ?? null;
  if (total == null) return null;
  if (dispo != null && total < dispo) return dispo;
  return total;
}

// ══════════════════════════════════════════════════════════════════════════════
// Layout de l'onglet Data
// ══════════════════════════════════════════════════════════════════════════════
const MIN_ROWS = 1; // au moins 1 ligne de données par bloc même sans lot

interface TypoRow {
  labelRow:  number;
  headerRow: number;
  dataStart: number;
  dataEnd:   number; // inclusif
  avgRow:    number;
  sepRow:    number;
}

function computeTypoLayout(programs: NeufProgram[]): Record<NeufTypology, TypoRow> {
  const layout = {} as Record<NeufTypology, TypoRow>;
  let row = 5; // R1=titre, R2-R3=vides, R4=en-têtes programmes

  for (const typo of TYPOLOGIES) {
    const maxRows = Math.max(MIN_ROWS, ...programs.map(p => progLots(p, typo).length));
    layout[typo] = {
      labelRow:  row,
      headerRow: row + 1,
      dataStart: row + 2,
      dataEnd:   row + 2 + maxRows - 1,
      avgRow:    row + 2 + maxRows,
      sepRow:    row + 2 + maxRows + 1,
    };
    row += 3 + maxRows + 2; // label + header + données + avg + sep
  }
  return layout;
}

// ══════════════════════════════════════════════════════════════════════════════
// ONGLET 1 — Adresse
// ══════════════════════════════════════════════════════════════════════════════
function buildAdresse(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[]
): Map<string, number> {
  const ws = wb.addWorksheet("Adresse");
  const rowMap = new Map<string, number>();

  // R1 : en-têtes
  ws.getCell(1, 1).value = "Adresse";
  ws.getCell(1, 2).value = "Nom";
  ws.getCell(1, 3).value = "Type";
  styleRange(ws, 1, 1, 1, 3, {
    bg: C_NAV, fc: C_WHT, bold: true, border: true,
    hAlign: "center", vAlign: "middle",
  });
  ws.getRow(1).height = 22;

  const cities = [...new Set(programs.map(p => p.city))];
  let idx = 1;
  let r = 2;

  for (const city of cities) {
    const cityProgs = programs.filter(p => p.city === city);

    // Ligne ville (A=nom, B+C vides mais bordés)
    ws.getCell(r, 1).value = city;
    styleRange(ws, r, 1, r, 3, {
      bg: C_LBL, bold: true, border: true, vAlign: "middle",
    });
    ws.getRow(r).height = 20;
    r++;

    for (const prog of cityProgs) {
      // Style complet A:C en premier (y compris cellules vides)
      styleRange(ws, r, 1, r, 3, {
        bg: C_WHT, border: true, wrap: true, vAlign: "middle",
      });
      ws.getCell(r, 1).value = safeAddress(prog);
      ws.getCell(r, 2).value = prog.programName;
      ws.getCell(r, 3).value = idx++;
      rowMap.set(prog.programId, r);
      ws.getRow(r).height = 22;
      r++;
    }
    r++; // séparateur vide
  }

  ws.getColumn(1).width = 45;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 10;

  return rowMap;
}

// ══════════════════════════════════════════════════════════════════════════════
// ONGLET 2 — Data
// ══════════════════════════════════════════════════════════════════════════════
function buildData(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[],
  layout: Record<NeufTypology, TypoRow>
) {
  const ws = wb.addWorksheet("Data");

  const lastDataRow = Math.max(4, ...Object.values(layout).map(tl => tl.sepRow));
  const lastDataCol = programs.length > 0 ? sep2Col(programs.length - 1) : 7;

  // R1 : titre "Calcul métrique" — fond navy sur toute la largeur
  ws.getCell(1, 2).value = "Calcul métrique";
  styleRange(ws, 1, 2, 1, lastDataCol, {
    bg: C_NAV, fc: C_WHT, bold: true, border: true,
    hAlign: "center", vAlign: "middle",
  });
  ws.getRow(1).height = 22;

  // R2-R3 : vides, bordés sur toute la largeur
  styleRange(ws, 2, 2, 3, lastDataCol, { bg: C_WHT, border: true });

  // R4 : en-têtes programmes (bordures sur les 6 colonnes de chaque bloc)
  for (let n = 0; n < programs.length; n++) {
    ws.getCell(4, numCol(n)).value = n + 1;
    ws.getCell(4, m2Col(n)).value  = programs[n].programName;
    styleRange(ws, 4, numCol(n), 4, sep2Col(n), {
      bg: C_LBL, bold: true, border: true, hAlign: "center", vAlign: "middle",
    });
  }
  ws.getRow(4).height = 20;

  // Blocs typologies — TOUJOURS les 5, même sans données
  for (const typo of TYPOLOGIES) {
    const tl = layout[typo];

    for (let n = 0; n < programs.length; n++) {
      const prog  = programs[n];
      const lots  = progLots(prog, typo);
      const cFrom = numCol(n);
      const cTo   = sep2Col(n);

      // ── Ligne titre (lettre + nom typo) ──────────────────────────────────
      ws.getCell(tl.labelRow, numCol(n)).value = TYPO_LETTER[typo];
      ws.getCell(tl.labelRow, m2Col(n)).value  = TYPO_LABEL[typo];
      styleRange(ws, tl.labelRow, cFrom, tl.labelRow, cTo, {
        bg: C_LBL, bold: true, border: true, vAlign: "middle",
      });

      // ── Ligne headers (m² | prix | prix/m²) ──────────────────────────────
      ws.getCell(tl.headerRow, m2Col(n)).value  = "m²";
      ws.getCell(tl.headerRow, prixCol(n)).value = "prix";
      ws.getCell(tl.headerRow, pm2Col(n)).value  = "prix/m²";
      styleRange(ws, tl.headerRow, cFrom, tl.headerRow, cTo, {
        bg: C_GRY, bold: true, border: true, hAlign: "center", vAlign: "middle",
      });

      // ── Lignes données : border+blanc sur TOUTE la plage, même vides ─────
      styleRange(ws, tl.dataStart, cFrom, tl.dataEnd, cTo, {
        bg: C_WHT, border: true, vAlign: "middle",
      });
      // Formats sur les colonnes de valeurs
      for (let row = tl.dataStart; row <= tl.dataEnd; row++) {
        ws.getCell(row, m2Col(n)).numFmt   = FMT_M2;
        ws.getCell(row, prixCol(n)).numFmt = FMT_EUR;
        ws.getCell(row, pm2Col(n)).numFmt  = FMT_PM2;
      }
      // Données réelles
      for (let i = 0; i < lots.length; i++) {
        const row = tl.dataStart + i;
        const lot = lots[i];
        if (lot.surfaceM2 != null) ws.getCell(row, m2Col(n)).value   = lot.surfaceM2;
        if (lot.priceEur  != null) ws.getCell(row, prixCol(n)).value = lot.priceEur;
        if (lot.surfaceM2 && lot.priceEur) {
          ws.getCell(row, pm2Col(n)).value = {
            formula: `+${cl(prixCol(n))}${row}/${cl(m2Col(n))}${row}`,
          };
        }
      }

      // ── Ligne moyenne — toujours présente ────────────────────────────────
      styleRange(ws, tl.avgRow, cFrom, tl.avgRow, cTo, {
        bg: C_YLW, bold: true, border: true, vAlign: "middle",
      });
      ws.getCell(tl.avgRow, m2Col(n)).numFmt  = FMT_M2;
      ws.getCell(tl.avgRow, pm2Col(n)).numFmt = FMT_PM2;
      if (lots.length > 0) {
        ws.getCell(tl.avgRow, m2Col(n)).value = {
          formula: `AVERAGE(${cl(m2Col(n))}${tl.dataStart}:${cl(m2Col(n))}${tl.dataEnd})`,
        };
        ws.getCell(tl.avgRow, pm2Col(n)).value = {
          formula: `AVERAGE(${cl(pm2Col(n))}${tl.dataStart}:${cl(pm2Col(n))}${tl.dataEnd})`,
        };
      }

      // ── Ligne séparateur ─────────────────────────────────────────────────
      styleRange(ws, tl.sepRow, cFrom, tl.sepRow, cTo, { bg: C_WHT, border: true });
    }
  }

  // Largeurs par programme
  for (let n = 0; n < programs.length; n++) {
    ws.getColumn(numCol(n)).width  = 8;
    ws.getColumn(sep1Col(n)).width = 4;
    ws.getColumn(m2Col(n)).width   = 12;
    ws.getColumn(prixCol(n)).width = 16;
    ws.getColumn(pm2Col(n)).width  = 16;
    ws.getColumn(sep2Col(n)).width = 4;
  }

  // Hauteur des lignes de données
  for (let row = 5; row <= lastDataRow; row++) ws.getRow(row).height = 18;
}

// ══════════════════════════════════════════════════════════════════════════════
// ONGLET 3 — Offre neuve {ville}
// Tableau principal D5:V   (colonnes 4-22)
// ══════════════════════════════════════════════════════════════════════════════
const SYNTH_TYPOS: [NeufTypology, number, number][] = [
  ["T1 / Studio", 12, 13],
  ["T2",          14, 15],
  ["T3",          16, 17],
  ["T4",          18, 19],
  ["T5+",         20, 21],
];
const D = 4;   // première colonne du tableau
const V = 22;  // dernière colonne du tableau

interface CityRange {
  city:     string;
  progRows: number[];
  totalRow: number;
}

function buildSynthese(
  wb: ExcelJS.Workbook,
  result: NeufAnalysisResult,
  adresseRowMap: Map<string, number>,
  layout: Record<NeufTypology, TypoRow>
) {
  const programs = result.programs;
  const ws = wb.addWorksheet(`Offre neuve ${result.geocodedAddress.city}`);

  // R1 : titre D1:V1
  ws.getCell(1, D).value = `Analyse de l'offre neuve — ${result.geocodedAddress.label}`;
  styleRange(ws, 1, D, 1, V, {
    bg: C_NAV, fc: C_WHT, bold: true, border: true,
    hAlign: "center", vAlign: "middle", fontSize: 13,
  });
  ws.getRow(1).height = 28;

  // R5 : en-têtes colonnes D5:V5
  const HDR: [number, string][] = [
    [4,  "Nom"],
    [5,  "Promoteur"],
    [6,  "Adresse"],
    [7,  "Téléphone"],
    [8,  "Nb logements"],
    [9,  "Nb disponibles"],
    [10, "% commercialisation"],
    [11, "Date de livraison"],
    [12, "Surface T1"], [13, "Prix/m² T1"],
    [14, "Surface T2"], [15, "Prix/m² T2"],
    [16, "Surface T3"], [17, "Prix/m² T3"],
    [18, "Surface T4"], [19, "Prix/m² T4"],
    [20, "Surface T5+"], [21, "Prix/m² T5+"],
    [22, "Prix moyen"],
  ];
  for (const [c, v] of HDR) ws.getCell(5, c).value = v;
  styleRange(ws, 5, D, 5, V, {
    bg: C_NAV, fc: C_WHT, bold: true, border: true,
    wrap: true, hAlign: "center", vAlign: "middle",
  });
  ws.getRow(5).height = 42;

  // Villes (ville principale en premier)
  const allCities     = [...new Set(programs.map(p => p.city))];
  const mainCity      = result.geocodedAddress.city;
  const orderedCities = [mainCity, ...allCities.filter(c => c !== mainCity)];

  const cityRanges: CityRange[] = [];
  let r = 7;

  for (const cityName of orderedCities) {
    const cityProgs = programs.filter(p => p.city === cityName);
    if (cityProgs.length === 0) continue;

    // Ligne titre ville D:V
    ws.getCell(r, D).value = cityName;
    styleRange(ws, r, D, r, V, {
      bg: C_LBL, bold: true, border: true, vAlign: "middle",
    });
    ws.getRow(r).height = 20;
    r++;

    const progRows: number[] = [];

    for (const prog of cityProgs) {
      const n     = programs.indexOf(prog);
      const adR   = adresseRowMap.get(prog.programId);
      const dispo = prog.availableUnitsDetected ?? prog.availableUnits ?? null;
      const total = safeTotalUnits(prog);

      // Style complet D:V en premier — TOUTES les cellules, même vides
      styleRange(ws, r, D, r, V, {
        bg: C_WHT, border: true, wrap: true, vAlign: "middle",
      });
      ws.getRow(r).height = 20;

      // D : Nom
      ws.getCell(r, 4).value = adR != null
        ? { formula: `Adresse!B${adR}` }
        : prog.programName;
      // E : Promoteur
      ws.getCell(r, 5).value = prog.developer ?? "";
      // F : Adresse
      ws.getCell(r, 6).value = adR != null
        ? { formula: `Adresse!A${adR}` }
        : safeAddress(prog);
      // G : Téléphone — vide
      // H : Nb logements
      if (total != null) {
        ws.getCell(r, 8).value  = total;
        ws.getCell(r, 8).numFmt = FMT_NB;
      }
      // I : Nb disponibles
      if (dispo != null && dispo >= 0) {
        ws.getCell(r, 9).value  = dispo;
        ws.getCell(r, 9).numFmt = FMT_NB;
      }
      // J : % commercialisation
      ws.getCell(r, 10).value  = { formula: `IFERROR(1-(I${r}/H${r}),"")` };
      ws.getCell(r, 10).numFmt = FMT_PCT;
      // K : Livraison
      ws.getCell(r, 11).value = prog.deliveryDate ?? prog.commercialStatus ?? "";

      // L-U : surface + prix/m² par typology — format appliqué même si vide
      for (const [typo, surfC, prixC] of SYNTH_TYPOS) {
        const tl = layout[typo];
        ws.getCell(r, surfC).numFmt = FMT_M2;
        ws.getCell(r, prixC).numFmt = FMT_PM2;
        if (progLots(prog, typo).length > 0) {
          ws.getCell(r, surfC).value = { formula: `Data!${cl(m2Col(n))}${tl.avgRow}` };
          ws.getCell(r, prixC).value = { formula: `Data!${cl(pm2Col(n))}${tl.avgRow}` };
        }
      }

      // V : Prix moyen pondéré
      ws.getCell(r, 22).value = {
        formula:
          `IFERROR((L${r}*M${r}+N${r}*O${r}+P${r}*Q${r}+R${r}*S${r}+T${r}*U${r})` +
          `/SUM(L${r},N${r},P${r},R${r},T${r}),"")`,
      };
      ws.getCell(r, 22).numFmt = FMT_PM2;

      progRows.push(r);
      r++;
    }

    // Ligne total ville D:V
    const totalRow = r;
    const firstPR  = progRows[0];
    const lastPR   = progRows[progRows.length - 1];

    styleRange(ws, totalRow, D, totalRow, V, {
      bg: C_BLU, fc: C_WHT, bold: true, border: true, vAlign: "middle",
    });
    ws.getRow(totalRow).height = 20;

    ws.getCell(totalRow, 4).value  = `Total ${cityName}`;
    ws.getCell(totalRow, 8).value  = { formula: `SUM(H${firstPR}:H${lastPR})` };
    ws.getCell(totalRow, 9).value  = { formula: `SUM(I${firstPR}:I${lastPR})` };
    ws.getCell(totalRow, 10).value = { formula: `IFERROR(1-(I${totalRow}/H${totalRow}),"")` };
    ws.getCell(totalRow, 8).numFmt  = FMT_NB;
    ws.getCell(totalRow, 9).numFmt  = FMT_NB;
    ws.getCell(totalRow, 10).numFmt = FMT_PCT;

    for (const [, surfC, prixC] of SYNTH_TYPOS) {
      ws.getCell(totalRow, surfC).value = {
        formula: `IFERROR(AVERAGE(${cl(surfC)}${firstPR}:${cl(surfC)}${lastPR}),"")`,
      };
      ws.getCell(totalRow, prixC).value = {
        formula: `IFERROR(AVERAGE(${cl(prixC)}${firstPR}:${cl(prixC)}${lastPR}),"")`,
      };
      ws.getCell(totalRow, surfC).numFmt = FMT_M2;
      ws.getCell(totalRow, prixC).numFmt = FMT_PM2;
    }
    ws.getCell(totalRow, 22).value  = { formula: `IFERROR(AVERAGE(V${firstPR}:V${lastPR}),"")` };
    ws.getCell(totalRow, 22).numFmt = FMT_PM2;

    cityRanges.push({ city: cityName, progRows, totalRow });
    r += 2;
  }

  // Total général (plusieurs villes)
  if (cityRanges.length > 1) {
    const gtRow = r;
    const tRefs = cityRanges.map(cr => cr.totalRow);

    styleRange(ws, gtRow, D, gtRow, V, {
      bg: C_NAV, fc: C_WHT, bold: true, border: true, vAlign: "middle",
    });
    ws.getRow(gtRow).height = 20;

    ws.getCell(gtRow, 4).value  = "Total général";
    ws.getCell(gtRow, 8).value  = { formula: tRefs.map(tr => `H${tr}`).join("+") };
    ws.getCell(gtRow, 9).value  = { formula: tRefs.map(tr => `I${tr}`).join("+") };
    ws.getCell(gtRow, 10).value = { formula: `IFERROR(1-(I${gtRow}/H${gtRow}),"")` };
    ws.getCell(gtRow, 8).numFmt  = FMT_NB;
    ws.getCell(gtRow, 9).numFmt  = FMT_NB;
    ws.getCell(gtRow, 10).numFmt = FMT_PCT;

    for (const [, surfC, prixC] of SYNTH_TYPOS) {
      ws.getCell(gtRow, surfC).value = {
        formula: `IFERROR(AVERAGE(${tRefs.map(tr => `${cl(surfC)}${tr}`).join(",")}),"")`,
      };
      ws.getCell(gtRow, prixC).value = {
        formula: `IFERROR(AVERAGE(${tRefs.map(tr => `${cl(prixC)}${tr}`).join(",")}),"")`,
      };
      ws.getCell(gtRow, surfC).numFmt = FMT_M2;
      ws.getCell(gtRow, prixC).numFmt = FMT_PM2;
    }
    ws.getCell(gtRow, 22).value = {
      formula: `IFERROR(AVERAGE(${tRefs.map(tr => `V${tr}`).join(",")}),"")`,
    };
    ws.getCell(gtRow, 22).numFmt = FMT_PM2;

    r += 2;
  }

  // Prix moyen global pondéré
  const allProgRows = cityRanges.flatMap(cr => cr.progRows);
  if (allProgRows.length > 0) {
    const fr = Math.min(...allProgRows);
    const lr = Math.max(...allProgRows);
    ws.getCell(r, 4).value = "Prix Moyen Global";
    ws.getCell(r, 4).font  = { bold: true };
    ws.getCell(r, 5).value = {
      formula:
        `IFERROR(` +
        `(SUMPRODUCT(L${fr}:L${lr},M${fr}:M${lr})+` +
        `SUMPRODUCT(N${fr}:N${lr},O${fr}:O${lr})+` +
        `SUMPRODUCT(P${fr}:P${lr},Q${fr}:Q${lr})+` +
        `SUMPRODUCT(R${fr}:R${lr},S${fr}:S${lr})+` +
        `SUMPRODUCT(T${fr}:T${lr},U${fr}:U${lr}))/` +
        `SUMPRODUCT((L${fr}:L${lr}<>"")*L${fr}:L${lr}+` +
        `(N${fr}:N${lr}<>"")*N${fr}:N${lr}+` +
        `(P${fr}:P${lr}<>"")*P${fr}:P${lr}+` +
        `(R${fr}:R${lr}<>"")*R${fr}:R${lr}+` +
        `(T${fr}:T${lr}<>"")*T${fr}:T${lr}),"")`,
    };
    ws.getCell(r, 5).numFmt = FMT_PM2;
    r += 2;
  }

  // Sous-tableaux High/Low par ville — complets ou absents
  for (const cr of cityRanges) {
    const first = cr.progRows[0];
    const last  = cr.progRows[cr.progRows.length - 1];

    ws.getCell(r, 4).value = cr.city;
    styleRange(ws, r, 4, r, 10, { bg: C_LBL, bold: true, border: true, vAlign: "middle" });
    r++;

    const subHdr: [number, string][] = [
      [4, "Typologie"], [5, ""], [6, "High Price"], [7, "Low Price"],
      [8, "Closing price"], [9, "Average"], [10, "Min"],
    ];
    for (const [c, v] of subHdr) ws.getCell(r, c).value = v;
    styleRange(ws, r, 4, r, 10, { bg: C_NAV, fc: C_WHT, bold: true, border: true, vAlign: "middle" });
    r++;

    for (const [typo, surfC, prixC] of SYNTH_TYPOS) {
      const pL    = cl(prixC);
      const sL    = cl(surfC);
      const range = `${pL}${first}:${pL}${last}`;

      ws.getCell(r, 4).value  = TYPO_LABEL[typo];
      ws.getCell(r, 6).value  = { formula: `IFERROR(MAX(${range}),"")` };
      ws.getCell(r, 7).value  = { formula: `IFERROR(MIN(${range}),"")` };
      ws.getCell(r, 8).value  = { formula: `IFERROR(${sL}${cr.totalRow},"")` };
      ws.getCell(r, 9).value  = { formula: `IFERROR(${pL}${cr.totalRow},"")` };
      ws.getCell(r, 10).value = { formula: `IFERROR(MIN(${range}),"")` };
      styleRange(ws, r, 4, r, 10, { bg: C_WHT, border: true, vAlign: "middle" });
      for (const c of [6, 7, 8, 9, 10]) ws.getCell(r, c).numFmt = FMT_PM2;
      r++;
    }
    r += 2;
  }

  // Largeurs colonnes Offre neuve
  ws.getColumn(4).width  = 28;
  ws.getColumn(5).width  = 24;
  ws.getColumn(6).width  = 45;
  ws.getColumn(7).width  = 18;
  ws.getColumn(8).width  = 14;
  ws.getColumn(9).width  = 14;
  ws.getColumn(10).width = 16;
  ws.getColumn(11).width = 20;
  for (let c = 12; c <= 22; c++) ws.getColumn(c).width = 14;
}

// ══════════════════════════════════════════════════════════════════════════════
// ONGLET 4 — Sheet1
// ══════════════════════════════════════════════════════════════════════════════
function buildSheet1(wb: ExcelJS.Workbook, result: NeufAnalysisResult) {
  const ws = wb.addWorksheet("Sheet1");

  ws.getCell(1, 1).value = `Backup ${result.geocodedAddress.city}`;
  ws.getCell(2, 1).value =
    `Date de création : ${new Date(result.extractedAt).toLocaleDateString("fr-FR")}`;

  styleRange(ws, 1, 1, 1, 2, { bg: C_LBL, bold: true, border: true, vAlign: "middle" });
  styleRange(ws, 2, 1, 2, 2, { bg: C_WHT, border: true, vAlign: "middle" });

  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 20;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 5 — formatAllUsedTables
// Passe finale : applique les bordures sur toutes les plages utilisées.
// ══════════════════════════════════════════════════════════════════════════════
function formatAllUsedTables(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[],
  layout: Record<NeufTypology, TypoRow>,
  adresseLastRow: number,
  syntheseLastRow: number
) {
  const lastDataRow = Math.max(4, ...Object.values(layout).map(tl => tl.sepRow));
  const lastDataCol = programs.length > 0 ? sep2Col(programs.length - 1) : 7;
  const cityName    = programs[0]?.city ?? "Ville";

  // Adresse A1:C{last}
  const wsA = wb.getWorksheet("Adresse");
  if (wsA) styleRange(wsA, 1, 1, adresseLastRow, 3, { border: true });

  // Data B1:{lastCol}{lastRow}
  const wsD = wb.getWorksheet("Data");
  if (wsD) styleRange(wsD, 1, 2, lastDataRow, lastDataCol, { border: true });

  // Offre neuve D5:V{last}
  const wsO = wb.getWorksheet(`Offre neuve ${cityName}`);
  if (wsO) styleRange(wsO, 5, D, syntheseLastRow, V, { border: true });

  // Sheet1 A1:B2
  const wsS = wb.getWorksheet("Sheet1");
  if (wsS) styleRange(wsS, 1, 1, 2, 2, { border: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// Export principal
// ══════════════════════════════════════════════════════════════════════════════
export async function exportToExcel(result: NeufAnalysisResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = "SeLoger Neuf Analyzer";
  wb.created  = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  const programs   = result.programs;
  const typoLayout = computeTypoLayout(programs);

  // Ordre des onglets : Adresse → Offre neuve → Data → Sheet1
  const adresseRowMap = buildAdresse(wb, programs);
  buildSynthese(wb, result, adresseRowMap, typoLayout);
  buildData(wb, programs, typoLayout);
  buildSheet1(wb, result);

  // Passe finale : bordures sur toutes les plages
  const adresseLastRow  = 2 + programs.length + [...new Set(programs.map(p => p.city))].length * 2;
  const syntheseLastRow = 10 + programs.length + [...new Set(programs.map(p => p.city))].length * 5;
  formatAllUsedTables(wb, programs, typoLayout, adresseLastRow, syntheseLastRow);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}


// ── Couleurs ──────────────────────────────────────────────────────────────────
const C_NAV = "1F3864"; // bleu foncé  : titres principaux
const C_BLU = "2E75B5"; // bleu moyen  : total ville, sous-en-têtes Offre neuve
const C_LBL = "BDD7EE"; // bleu clair  : titres ville Adresse, blocs typo Data
const C_GRY = "D9D9D9"; // gris        : header colonnes Data
const C_YLW = "FFF2CC"; // jaune clair : ligne moyenne Data
const C_WHT = "FFFFFF";

// ── Formats ───────────────────────────────────────────────────────────────────
const FMT_M2  = '0 "m²"';
const FMT_EUR = '#,##0 "€"';
const FMT_PM2 = '#,##0 "€/m²"';
const FMT_PCT = "0%";
const FMT_NB  = "#,##0";

// ── Colonnes Data (1-indexé, n = index programme 0-based) ─────────────────────
// Bloc de 6 col par programme : [num | sep | m² | prix | pm² | sep]
// n=0 → B:G, n=1 → H:M, n=2 → N:S, n=3 → T:Y …
const numCol  = (n: number) => 6 * n + 2;
const sep1Col = (n: number) => 6 * n + 3;
const m2Col   = (n: number) => 6 * n + 4;
const prixCol = (n: number) => 6 * n + 5;
const pm2Col  = (n: number) => 6 * n + 6;
const sep2Col = (n: number) => 6 * n + 7;

function cl(n: number): string {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

function progLots(prog: NeufProgram, typo: NeufTypology): NeufListing[] {
  return prog.listings.filter(l => l.typology === typo && !l.isPlaceholderLot);
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 1 — applyBorder
// ══════════════════════════════════════════════════════════════════════════════
function applyBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top:    { style: "thin" },
    bottom: { style: "thin" },
    left:   { style: "thin" },
    right:  { style: "thin" },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 2 — styleRange
// Parcourt TOUTES les cellules de la plage, même vides.
// ══════════════════════════════════════════════════════════════════════════════
type StyleOpts = {
  bg?: string;
  fc?: string;
  bold?: boolean;
  border?: boolean;
  numFmt?: string;
  wrap?: boolean;
  hAlign?: ExcelJS.Alignment["horizontal"];
  vAlign?: ExcelJS.Alignment["vertical"];
  fontSize?: number;
};

function styleRange(
  ws: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  o: StyleOpts
) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(r, c);

      if (o.bg !== undefined)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + o.bg } };

      if (o.bold !== undefined || o.fc !== undefined || o.fontSize !== undefined) {
        cell.font = {
          bold:  o.bold ?? false,
          color: o.fc       ? { argb: "FF" + o.fc } : undefined,
          size:  o.fontSize ?? undefined,
        } as ExcelJS.Font;
      }

      if (o.border) applyBorder(cell);
      if (o.numFmt) cell.numFmt = o.numFmt;

      if (o.wrap !== undefined || o.hAlign !== undefined || o.vAlign !== undefined) {
        cell.alignment = {
          wrapText:   o.wrap,
          horizontal: o.hAlign,
          vertical:   o.vAlign ?? "middle",
        };
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 3 — safeAddress
// Rejette les adresses qui sont des petits nombres (artefacts de scraping).
// ══════════════════════════════════════════════════════════════════════════════
function safeAddress(prog: NeufProgram): string {
  const addr = prog.address;
  if (addr == null) return "";
  const s = String(addr).trim();
  if (/^\d{1,3}$/.test(s)) return ""; // valeur numérique courte = probablement un index
  return s;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 4 — safeTotalUnits
// Ne jamais afficher un total < nb disponibles.
// ══════════════════════════════════════════════════════════════════════════════
function safeTotalUnits(prog: NeufProgram): number | null {
  const dispo = prog.availableUnitsDetected ?? prog.availableUnits ?? null;
  const total = prog.totalUnits ?? null;
  if (total == null) return null;
  if (dispo != null && total < dispo) return dispo;
  return total;
}

// ══════════════════════════════════════════════════════════════════════════════
// Layout de l'onglet Data
// ══════════════════════════════════════════════════════════════════════════════
const MIN_ROWS = 1; // au moins 1 ligne de données par bloc même sans lot

interface TypoRow {
  labelRow:  number;
  headerRow: number;
  dataStart: number;
  dataEnd:   number; // inclusif
  avgRow:    number;
  sepRow:    number;
}

function computeTypoLayout(programs: NeufProgram[]): Record<NeufTypology, TypoRow> {
  const layout = {} as Record<NeufTypology, TypoRow>;
  let row = 5; // R1=titre, R2-R3=vides, R4=en-têtes programmes

  for (const typo of TYPOLOGIES) {
    const maxRows = Math.max(MIN_ROWS, ...programs.map(p => progLots(p, typo).length));
    layout[typo] = {
      labelRow:  row,
      headerRow: row + 1,
      dataStart: row + 2,
      dataEnd:   row + 2 + maxRows - 1,
      avgRow:    row + 2 + maxRows,
      sepRow:    row + 2 + maxRows + 1,
    };
    row += 3 + maxRows + 2; // label + header + données + avg + sep
  }
  return layout;
}

// ══════════════════════════════════════════════════════════════════════════════
// ONGLET 1 — Adresse
// ══════════════════════════════════════════════════════════════════════════════
function buildAdresse(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[]
): Map<string, number> {
  const ws = wb.addWorksheet("Adresse");
  const rowMap = new Map<string, number>();

  // R1 : en-têtes
  ws.getCell(1, 1).value = "Adresse";
  ws.getCell(1, 2).value = "Nom";
  ws.getCell(1, 3).value = "Type";
  styleRange(ws, 1, 1, 1, 3, {
    bg: C_NAV, fc: C_WHT, bold: true, border: true,
    hAlign: "center", vAlign: "middle",
  });
  ws.getRow(1).height = 22;

  const cities = [...new Set(programs.map(p => p.city))];
  let idx = 1;
  let r = 2;

  for (const city of cities) {
    const cityProgs = programs.filter(p => p.city === city);

    // Ligne ville (A=nom, B+C vides mais bordés)
    ws.getCell(r, 1).value = city;
    styleRange(ws, r, 1, r, 3, {
      bg: C_LBL, bold: true, border: true, vAlign: "middle",
    });
    ws.getRow(r).height = 20;
    r++;

    for (const prog of cityProgs) {
      // Style complet A:C en premier (y compris cellules vides)
      styleRange(ws, r, 1, r, 3, {
        bg: C_WHT, border: true, wrap: true, vAlign: "middle",
      });
      ws.getCell(r, 1).value = safeAddress(prog);
      ws.getCell(r, 2).value = prog.programName;
      ws.getCell(r, 3).value = idx++;
      rowMap.set(prog.programId, r);
      ws.getRow(r).height = 22;
      r++;
    }
    r++; // séparateur vide
  }

  ws.getColumn(1).width = 45;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 10;

  return rowMap;
}

// ══════════════════════════════════════════════════════════════════════════════
// ONGLET 2 — Data
// ══════════════════════════════════════════════════════════════════════════════
function buildData(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[],
  layout: Record<NeufTypology, TypoRow>
) {
  const ws = wb.addWorksheet("Data");

  const lastDataRow = Math.max(4, ...Object.values(layout).map(tl => tl.sepRow));
  const lastDataCol = programs.length > 0 ? sep2Col(programs.length - 1) : 7;

  // R1 : titre "Calcul métrique" — fond navy sur toute la largeur
  ws.getCell(1, 2).value = "Calcul métrique";
  styleRange(ws, 1, 2, 1, lastDataCol, {
    bg: C_NAV, fc: C_WHT, bold: true, border: true,
    hAlign: "center", vAlign: "middle",
  });
  ws.getRow(1).height = 22;

  // R2-R3 : vides, bordés sur toute la largeur
  styleRange(ws, 2, 2, 3, lastDataCol, { bg: C_WHT, border: true });

  // R4 : en-têtes programmes (bordures sur les 6 colonnes de chaque bloc)
  for (let n = 0; n < programs.length; n++) {
    ws.getCell(4, numCol(n)).value = n + 1;
    ws.getCell(4, m2Col(n)).value  = programs[n].programName;
    styleRange(ws, 4, numCol(n), 4, sep2Col(n), {
      bg: C_LBL, bold: true, border: true, hAlign: "center", vAlign: "middle",
    });
  }
  ws.getRow(4).height = 20;

  // Blocs typologies — TOUJOURS les 5, même sans données
  for (const typo of TYPOLOGIES) {
    const tl = layout[typo];

    for (let n = 0; n < programs.length; n++) {
      const prog  = programs[n];
      const lots  = progLots(prog, typo);
      const cFrom = numCol(n);
      const cTo   = sep2Col(n);

      // ── Ligne titre (lettre + nom typo) ──────────────────────────────────
      ws.getCell(tl.labelRow, numCol(n)).value = TYPO_LETTER[typo];
      ws.getCell(tl.labelRow, m2Col(n)).value  = TYPO_LABEL[typo];
      styleRange(ws, tl.labelRow, cFrom, tl.labelRow, cTo, {
        bg: C_LBL, bold: true, border: true, vAlign: "middle",
      });

      // ── Ligne headers (m² | prix | prix/m²) ──────────────────────────────
      ws.getCell(tl.headerRow, m2Col(n)).value  = "m²";
      ws.getCell(tl.headerRow, prixCol(n)).value = "prix";
      ws.getCell(tl.headerRow, pm2Col(n)).value  = "prix/m²";
      styleRange(ws, tl.headerRow, cFrom, tl.headerRow, cTo, {
        bg: C_GRY, bold: true, border: true, hAlign: "center", vAlign: "middle",
      });

      // ── Lignes données : border+blanc sur TOUTE la plage, même vides ─────
      styleRange(ws, tl.dataStart, cFrom, tl.dataEnd, cTo, {
        bg: C_WHT, border: true, vAlign: "middle",
      });
      // Formats sur les colonnes de valeurs
      for (let row = tl.dataStart; row <= tl.dataEnd; row++) {
        ws.getCell(row, m2Col(n)).numFmt   = FMT_M2;
        ws.getCell(row, prixCol(n)).numFmt = FMT_EUR;
        ws.getCell(row, pm2Col(n)).numFmt  = FMT_PM2;
      }
      // Données réelles
      for (let i = 0; i < lots.length; i++) {
        const row = tl.dataStart + i;
        const lot = lots[i];
        if (lot.surfaceM2 != null) ws.getCell(row, m2Col(n)).value   = lot.surfaceM2;
        if (lot.priceEur  != null) ws.getCell(row, prixCol(n)).value = lot.priceEur;
        if (lot.surfaceM2 && lot.priceEur) {
          ws.getCell(row, pm2Col(n)).value = {
            formula: `+${cl(prixCol(n))}${row}/${cl(m2Col(n))}${row}`,
          };
        }
      }

      // ── Ligne moyenne — toujours présente ────────────────────────────────
      styleRange(ws, tl.avgRow, cFrom, tl.avgRow, cTo, {
        bg: C_YLW, bold: true, border: true, vAlign: "middle",
      });
      ws.getCell(tl.avgRow, m2Col(n)).numFmt  = FMT_M2;
      ws.getCell(tl.avgRow, pm2Col(n)).numFmt = FMT_PM2;
      if (lots.length > 0) {
        ws.getCell(tl.avgRow, m2Col(n)).value = {
          formula: `AVERAGE(${cl(m2Col(n))}${tl.dataStart}:${cl(m2Col(n))}${tl.dataEnd})`,
        };
        ws.getCell(tl.avgRow, pm2Col(n)).value = {
          formula: `AVERAGE(${cl(pm2Col(n))}${tl.dataStart}:${cl(pm2Col(n))}${tl.dataEnd})`,
        };
      }

      // ── Ligne séparateur ─────────────────────────────────────────────────
      styleRange(ws, tl.sepRow, cFrom, tl.sepRow, cTo, { bg: C_WHT, border: true });
    }
  }

  // Largeurs par programme
  for (let n = 0; n < programs.length; n++) {
    ws.getColumn(numCol(n)).width  = 8;
    ws.getColumn(sep1Col(n)).width = 4;
    ws.getColumn(m2Col(n)).width   = 12;
    ws.getColumn(prixCol(n)).width = 16;
    ws.getColumn(pm2Col(n)).width  = 16;
    ws.getColumn(sep2Col(n)).width = 4;
  }

  // Hauteur des lignes de données
  for (let row = 5; row <= lastDataRow; row++) ws.getRow(row).height = 18;
}

// ══════════════════════════════════════════════════════════════════════════════
// ONGLET 3 — Offre neuve {ville}
// Tableau principal D5:V   (colonnes 4-22)
// ══════════════════════════════════════════════════════════════════════════════
const SYNTH_TYPOS: [NeufTypology, number, number][] = [
  ["T1 / Studio", 12, 13],
  ["T2",          14, 15],
  ["T3",          16, 17],
  ["T4",          18, 19],
  ["T5+",         20, 21],
];
const D = 4;   // première colonne du tableau
const V = 22;  // dernière colonne du tableau

interface CityRange {
  city:     string;
  progRows: number[];
  totalRow: number;
}

function buildSynthese(
  wb: ExcelJS.Workbook,
  result: NeufAnalysisResult,
  adresseRowMap: Map<string, number>,
  layout: Record<NeufTypology, TypoRow>
) {
  const programs = result.programs;
  const ws = wb.addWorksheet(`Offre neuve ${result.geocodedAddress.city}`);

  // R1 : titre D1:V1
  ws.getCell(1, D).value = `Analyse de l'offre neuve — ${result.geocodedAddress.label}`;
  styleRange(ws, 1, D, 1, V, {
    bg: C_NAV, fc: C_WHT, bold: true, border: true,
    hAlign: "center", vAlign: "middle", fontSize: 13,
  });
  ws.getRow(1).height = 28;

  // R5 : en-têtes colonnes D5:V5
  const HDR: [number, string][] = [
    [4,  "Nom"],
    [5,  "Promoteur"],
    [6,  "Adresse"],
    [7,  "Téléphone"],
    [8,  "Nb logements"],
    [9,  "Nb disponibles"],
    [10, "% commercialisation"],
    [11, "Date de livraison"],
    [12, "Surface T1"], [13, "Prix/m² T1"],
    [14, "Surface T2"], [15, "Prix/m² T2"],
    [16, "Surface T3"], [17, "Prix/m² T3"],
    [18, "Surface T4"], [19, "Prix/m² T4"],
    [20, "Surface T5+"], [21, "Prix/m² T5+"],
    [22, "Prix moyen"],
  ];
  for (const [c, v] of HDR) ws.getCell(5, c).value = v;
  styleRange(ws, 5, D, 5, V, {
    bg: C_NAV, fc: C_WHT, bold: true, border: true,
    wrap: true, hAlign: "center", vAlign: "middle",
  });
  ws.getRow(5).height = 42;

  // Villes (ville principale en premier)
  const allCities     = [...new Set(programs.map(p => p.city))];
  const mainCity      = result.geocodedAddress.city;
  const orderedCities = [mainCity, ...allCities.filter(c => c !== mainCity)];

  const cityRanges: CityRange[] = [];
  let r = 7;

  for (const cityName of orderedCities) {
    const cityProgs = programs.filter(p => p.city === cityName);
    if (cityProgs.length === 0) continue;

    // Ligne titre ville D:V
    ws.getCell(r, D).value = cityName;
    styleRange(ws, r, D, r, V, {
      bg: C_LBL, bold: true, border: true, vAlign: "middle",
    });
    ws.getRow(r).height = 20;
    r++;

    const progRows: number[] = [];

    for (const prog of cityProgs) {
      const n     = programs.indexOf(prog);
      const adR   = adresseRowMap.get(prog.programId);
      const dispo = prog.availableUnitsDetected ?? prog.availableUnits ?? null;
      const total = safeTotalUnits(prog);

      // Style complet D:V en premier — TOUTES les cellules, même vides
      styleRange(ws, r, D, r, V, {
        bg: C_WHT, border: true, wrap: true, vAlign: "middle",
      });
      ws.getRow(r).height = 20;

      // D : Nom
      ws.getCell(r, 4).value = adR != null
        ? { formula: `Adresse!B${adR}` }
        : prog.programName;
      // E : Promoteur
      ws.getCell(r, 5).value = prog.developer ?? "";
      // F : Adresse
      ws.getCell(r, 6).value = adR != null
        ? { formula: `Adresse!A${adR}` }
        : safeAddress(prog);
      // G : Téléphone — vide
      // H : Nb logements
      if (total != null) {
        ws.getCell(r, 8).value  = total;
        ws.getCell(r, 8).numFmt = FMT_NB;
      }
      // I : Nb disponibles
      if (dispo != null && dispo >= 0) {
        ws.getCell(r, 9).value  = dispo;
        ws.getCell(r, 9).numFmt = FMT_NB;
      }
      // J : % commercialisation
      ws.getCell(r, 10).value  = { formula: `IFERROR(1-(I${r}/H${r}),"")` };
      ws.getCell(r, 10).numFmt = FMT_PCT;
      // K : Livraison
      ws.getCell(r, 11).value = prog.deliveryDate ?? prog.commercialStatus ?? "";

      // L-U : surface + prix/m² par typology — format appliqué même si vide
      for (const [typo, surfC, prixC] of SYNTH_TYPOS) {
        const tl = layout[typo];
        ws.getCell(r, surfC).numFmt = FMT_M2;
        ws.getCell(r, prixC).numFmt = FMT_PM2;
        if (progLots(prog, typo).length > 0) {
          ws.getCell(r, surfC).value = { formula: `Data!${cl(m2Col(n))}${tl.avgRow}` };
          ws.getCell(r, prixC).value = { formula: `Data!${cl(pm2Col(n))}${tl.avgRow}` };
        }
      }

      // V : Prix moyen pondéré
      ws.getCell(r, 22).value = {
        formula:
          `IFERROR((L${r}*M${r}+N${r}*O${r}+P${r}*Q${r}+R${r}*S${r}+T${r}*U${r})` +
          `/SUM(L${r},N${r},P${r},R${r},T${r}),"")`,
      };
      ws.getCell(r, 22).numFmt = FMT_PM2;

      progRows.push(r);
      r++;
    }

    // Ligne total ville D:V
    const totalRow = r;
    const firstPR  = progRows[0];
    const lastPR   = progRows[progRows.length - 1];

    styleRange(ws, totalRow, D, totalRow, V, {
      bg: C_BLU, fc: C_WHT, bold: true, border: true, vAlign: "middle",
    });
    ws.getRow(totalRow).height = 20;

    ws.getCell(totalRow, 4).value  = `Total ${cityName}`;
    ws.getCell(totalRow, 8).value  = { formula: `SUM(H${firstPR}:H${lastPR})` };
    ws.getCell(totalRow, 9).value  = { formula: `SUM(I${firstPR}:I${lastPR})` };
    ws.getCell(totalRow, 10).value = { formula: `IFERROR(1-(I${totalRow}/H${totalRow}),"")` };
    ws.getCell(totalRow, 8).numFmt  = FMT_NB;
    ws.getCell(totalRow, 9).numFmt  = FMT_NB;
    ws.getCell(totalRow, 10).numFmt = FMT_PCT;

    for (const [, surfC, prixC] of SYNTH_TYPOS) {
      ws.getCell(totalRow, surfC).value = {
        formula: `IFERROR(AVERAGE(${cl(surfC)}${firstPR}:${cl(surfC)}${lastPR}),"")`,
      };
      ws.getCell(totalRow, prixC).value = {
        formula: `IFERROR(AVERAGE(${cl(prixC)}${firstPR}:${cl(prixC)}${lastPR}),"")`,
      };
      ws.getCell(totalRow, surfC).numFmt = FMT_M2;
      ws.getCell(totalRow, prixC).numFmt = FMT_PM2;
    }
    ws.getCell(totalRow, 22).value  = { formula: `IFERROR(AVERAGE(V${firstPR}:V${lastPR}),"")` };
    ws.getCell(totalRow, 22).numFmt = FMT_PM2;

    cityRanges.push({ city: cityName, progRows, totalRow });
    r += 2;
  }

  // Total général (plusieurs villes)
  if (cityRanges.length > 1) {
    const gtRow = r;
    const tRefs = cityRanges.map(cr => cr.totalRow);

    styleRange(ws, gtRow, D, gtRow, V, {
      bg: C_NAV, fc: C_WHT, bold: true, border: true, vAlign: "middle",
    });
    ws.getRow(gtRow).height = 20;

    ws.getCell(gtRow, 4).value  = "Total général";
    ws.getCell(gtRow, 8).value  = { formula: tRefs.map(tr => `H${tr}`).join("+") };
    ws.getCell(gtRow, 9).value  = { formula: tRefs.map(tr => `I${tr}`).join("+") };
    ws.getCell(gtRow, 10).value = { formula: `IFERROR(1-(I${gtRow}/H${gtRow}),"")` };
    ws.getCell(gtRow, 8).numFmt  = FMT_NB;
    ws.getCell(gtRow, 9).numFmt  = FMT_NB;
    ws.getCell(gtRow, 10).numFmt = FMT_PCT;

    for (const [, surfC, prixC] of SYNTH_TYPOS) {
      ws.getCell(gtRow, surfC).value = {
        formula: `IFERROR(AVERAGE(${tRefs.map(tr => `${cl(surfC)}${tr}`).join(",")}),"")`,
      };
      ws.getCell(gtRow, prixC).value = {
        formula: `IFERROR(AVERAGE(${tRefs.map(tr => `${cl(prixC)}${tr}`).join(",")}),"")`,
      };
      ws.getCell(gtRow, surfC).numFmt = FMT_M2;
      ws.getCell(gtRow, prixC).numFmt = FMT_PM2;
    }
    ws.getCell(gtRow, 22).value = {
      formula: `IFERROR(AVERAGE(${tRefs.map(tr => `V${tr}`).join(",")}),"")`,
    };
    ws.getCell(gtRow, 22).numFmt = FMT_PM2;

    r += 2;
  }

  // Prix moyen global pondéré
  const allProgRows = cityRanges.flatMap(cr => cr.progRows);
  if (allProgRows.length > 0) {
    const fr = Math.min(...allProgRows);
    const lr = Math.max(...allProgRows);
    ws.getCell(r, 4).value = "Prix Moyen Global";
    ws.getCell(r, 4).font  = { bold: true };
    ws.getCell(r, 5).value = {
      formula:
        `IFERROR(` +
        `(SUMPRODUCT(L${fr}:L${lr},M${fr}:M${lr})+` +
        `SUMPRODUCT(N${fr}:N${lr},O${fr}:O${lr})+` +
        `SUMPRODUCT(P${fr}:P${lr},Q${fr}:Q${lr})+` +
        `SUMPRODUCT(R${fr}:R${lr},S${fr}:S${lr})+` +
        `SUMPRODUCT(T${fr}:T${lr},U${fr}:U${lr}))/` +
        `SUMPRODUCT((L${fr}:L${lr}<>"")*L${fr}:L${lr}+` +
        `(N${fr}:N${lr}<>"")*N${fr}:N${lr}+` +
        `(P${fr}:P${lr}<>"")*P${fr}:P${lr}+` +
        `(R${fr}:R${lr}<>"")*R${fr}:R${lr}+` +
        `(T${fr}:T${lr}<>"")*T${fr}:T${lr}),"")`,
    };
    ws.getCell(r, 5).numFmt = FMT_PM2;
    r += 2;
  }

  // Sous-tableaux High/Low par ville — complets ou absents
  for (const cr of cityRanges) {
    const first = cr.progRows[0];
    const last  = cr.progRows[cr.progRows.length - 1];

    ws.getCell(r, 4).value = cr.city;
    styleRange(ws, r, 4, r, 10, { bg: C_LBL, bold: true, border: true, vAlign: "middle" });
    r++;

    const subHdr: [number, string][] = [
      [4, "Typologie"], [5, ""], [6, "High Price"], [7, "Low Price"],
      [8, "Closing price"], [9, "Average"], [10, "Min"],
    ];
    for (const [c, v] of subHdr) ws.getCell(r, c).value = v;
    styleRange(ws, r, 4, r, 10, { bg: C_NAV, fc: C_WHT, bold: true, border: true, vAlign: "middle" });
    r++;

    for (const [typo, surfC, prixC] of SYNTH_TYPOS) {
      const pL    = cl(prixC);
      const sL    = cl(surfC);
      const range = `${pL}${first}:${pL}${last}`;

      ws.getCell(r, 4).value  = TYPO_LABEL[typo];
      ws.getCell(r, 6).value  = { formula: `IFERROR(MAX(${range}),"")` };
      ws.getCell(r, 7).value  = { formula: `IFERROR(MIN(${range}),"")` };
      ws.getCell(r, 8).value  = { formula: `IFERROR(${sL}${cr.totalRow},"")` };
      ws.getCell(r, 9).value  = { formula: `IFERROR(${pL}${cr.totalRow},"")` };
      ws.getCell(r, 10).value = { formula: `IFERROR(MIN(${range}),"")` };
      styleRange(ws, r, 4, r, 10, { bg: C_WHT, border: true, vAlign: "middle" });
      for (const c of [6, 7, 8, 9, 10]) ws.getCell(r, c).numFmt = FMT_PM2;
      r++;
    }
    r += 2;
  }

  // Largeurs colonnes Offre neuve
  ws.getColumn(4).width  = 28;
  ws.getColumn(5).width  = 24;
  ws.getColumn(6).width  = 45;
  ws.getColumn(7).width  = 18;
  ws.getColumn(8).width  = 14;
  ws.getColumn(9).width  = 14;
  ws.getColumn(10).width = 16;
  ws.getColumn(11).width = 20;
  for (let c = 12; c <= 22; c++) ws.getColumn(c).width = 14;
}

// ══════════════════════════════════════════════════════════════════════════════
// ONGLET 4 — Sheet1
// ══════════════════════════════════════════════════════════════════════════════
function buildSheet1(wb: ExcelJS.Workbook, result: NeufAnalysisResult) {
  const ws = wb.addWorksheet("Sheet1");

  ws.getCell(1, 1).value = `Backup ${result.geocodedAddress.city}`;
  ws.getCell(2, 1).value =
    `Date de création : ${new Date(result.extractedAt).toLocaleDateString("fr-FR")}`;

  styleRange(ws, 1, 1, 1, 2, { bg: C_LBL, bold: true, border: true, vAlign: "middle" });
  styleRange(ws, 2, 1, 2, 2, { bg: C_WHT, border: true, vAlign: "middle" });

  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 20;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER 5 — formatAllUsedTables
// Passe finale : applique les bordures sur toutes les plages utilisées.
// ══════════════════════════════════════════════════════════════════════════════
function formatAllUsedTables(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[],
  layout: Record<NeufTypology, TypoRow>,
  adresseLastRow: number,
  syntheseLastRow: number
) {
  const lastDataRow = Math.max(4, ...Object.values(layout).map(tl => tl.sepRow));
  const lastDataCol = programs.length > 0 ? sep2Col(programs.length - 1) : 7;
  const cityName    = programs[0]?.city ?? "Ville";

  // Adresse A1:C{last}
  const wsA = wb.getWorksheet("Adresse");
  if (wsA) styleRange(wsA, 1, 1, adresseLastRow, 3, { border: true });

  // Data B1:{lastCol}{lastRow}
  const wsD = wb.getWorksheet("Data");
  if (wsD) styleRange(wsD, 1, 2, lastDataRow, lastDataCol, { border: true });

  // Offre neuve D5:V{last}
  const wsO = wb.getWorksheet(`Offre neuve ${cityName}`);
  if (wsO) styleRange(wsO, 5, D, syntheseLastRow, V, { border: true });

  // Sheet1 A1:B2
  const wsS = wb.getWorksheet("Sheet1");
  if (wsS) styleRange(wsS, 1, 1, 2, 2, { border: true });
}

// ══════════════════════════════════════════════════════════════════════════════
// Export principal
// ══════════════════════════════════════════════════════════════════════════════
export async function exportToExcel(result: NeufAnalysisResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = "SeLoger Neuf Analyzer";
  wb.created  = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  const programs   = result.programs;
  const typoLayout = computeTypoLayout(programs);

  // Ordre des onglets : Adresse → Offre neuve → Data → Sheet1
  const adresseRowMap = buildAdresse(wb, programs);
  buildSynthese(wb, result, adresseRowMap, typoLayout);
  buildData(wb, programs, typoLayout);
  buildSheet1(wb, result);

  // Passe finale : bordures sur toutes les plages
  const adresseLastRow  = 2 + programs.length + [...new Set(programs.map(p => p.city))].length * 2;
  const syntheseLastRow = 10 + programs.length + [...new Set(programs.map(p => p.city))].length * 5;
  formatAllUsedTables(wb, programs, typoLayout, adresseLastRow, syntheseLastRow);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
