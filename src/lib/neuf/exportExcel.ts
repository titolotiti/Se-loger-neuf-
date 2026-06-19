import ExcelJS from "exceljs";
import type { NeufAnalysisResult, NeufProgram, NeufTypology } from "@/types/neuf";
import { groupProgramsByCity } from "./stats";

// ─── Couleurs ────────────────────────────────────────────────────────────────
const COLOR_HEADER_DARK = "1F3864";
const COLOR_HEADER_BLUE = "2F75B6";
const COLOR_TOTAL_DARK = "1F3864";
const COLOR_TOTAL_LIGHT = "D6E4F0";
const COLOR_WARNING = "FFF2CC";
const COLOR_WHITE = "FFFFFF";
const COLOR_BLACK = "000000";

type CellRef = ExcelJS.Cell;

function darkFill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color}` } };
}

function thin(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.Border = { style: "thin", color: { argb: `FF${COLOR_BLACK}` } };
  return { top: s, left: s, bottom: s, right: s };
}

function applyHeaderStyle(cell: CellRef, bg: string = COLOR_HEADER_BLUE) {
  cell.fill = darkFill(bg);
  cell.font = { bold: true, color: { argb: `FF${COLOR_WHITE}` }, size: 10 };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = thin();
}

function applyDataStyle(cell: CellRef, bg?: string) {
  if (bg) cell.fill = darkFill(bg);
  cell.alignment = { vertical: "middle", wrapText: true };
  cell.border = thin();
  cell.font = { size: 10 };
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

// ─── ONGLET ADRESSE ───────────────────────────────────────────────────────────
function buildAdresseSheet(wb: ExcelJS.Workbook, result: NeufAnalysisResult) {
  const ws = wb.addWorksheet("Adresse");

  ws.mergeCells("A1:G1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `Analyse offre neuve — ${result.geocodedAddress.label}`;
  titleCell.fill = darkFill(COLOR_HEADER_DARK);
  titleCell.font = { bold: true, size: 14, color: { argb: `FF${COLOR_WHITE}` } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 30;

  ws.mergeCells("A2:G2");
  const warningCell = ws.getCell("A2");
  warningCell.value =
    "⚠️ Prix affichés / prix de commercialisation — données issues de SeLoger Neuf, à vérifier.";
  warningCell.fill = darkFill("FFF2CC");
  warningCell.font = { italic: true, size: 10, color: { argb: "FFCC7700" } };
  warningCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(2).height = 20;

  const headers = [
    "ID Programme",
    "Nom du programme",
    "Adresse",
    "Commune",
    "Code postal",
    "Type de zone",
    "URL source SeLoger Neuf",
  ];
  const hRow = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell, COLOR_HEADER_BLUE);
  });
  hRow.height = 25;

  let rowIdx = 4;
  for (const prog of result.programs) {
    const row = ws.getRow(rowIdx);
    row.getCell(1).value = prog.programId;
    row.getCell(2).value = prog.programName;
    row.getCell(3).value = prog.address ?? "Non communiqué";
    row.getCell(4).value = prog.city;
    row.getCell(5).value = prog.postalCode ?? "";
    row.getCell(6).value = prog.zoneType;
    const urlCell = row.getCell(7);
    urlCell.value = { text: prog.url, hyperlink: prog.url };
    for (let c = 1; c <= 7; c++) applyDataStyle(row.getCell(c));
    urlCell.font = { color: { argb: "FF0563C1" }, underline: true, size: 10 };
    urlCell.alignment = { vertical: "middle", wrapText: true };
    row.height = 20;
    rowIdx++;
  }

  ws.columns = [
    { width: 18 },
    { width: 30 },
    { width: 35 },
    { width: 20 },
    { width: 12 },
    { width: 22 },
    { width: 50 },
  ];
  ws.views = [{ state: "frozen", ySplit: 3 }];
}

// ─── ONGLET DATA ──────────────────────────────────────────────────────────────
// Une ligne par lot/typologie par programme
// A=ID prog, B=Nom, C=Promoteur, D=Commune, E=URL, F=Total log., G=Dispo,
// H=Livraison, I=Parking, J=Typologie, K=Surface, L=Prix, M=Prix/m² (formule),
// N=Exclu, O=Raison

const DATA_COLS = [
  "ID Programme",            // A  1
  "Nom du programme",        // B  2
  "Promoteur",               // C  3
  "Commune",                 // D  4
  "URL source SeLoger Neuf", // E  5
  "Total logements",         // F  6
  "Nb disponibles",          // G  7
  "Livraison / Statut",      // H  8
  "Parking",                 // I  9
  "Typologie",               // J  10
  "Surface (m²)",            // K  11
  "Prix (€)",                // L  12
  "Prix/m² (formule)",       // M  13
  "Exclu des stats",         // N  14
  "Raison exclusion",        // O  15
];

function buildDataSheet(wb: ExcelJS.Workbook, result: NeufAnalysisResult) {
  const ws = wb.addWorksheet("Data");
  const ncols = DATA_COLS.length;

  ws.mergeCells(`A1:${colLetter(ncols)}1`);
  const t = ws.getCell("A1");
  t.value = `Données lots — ${result.geocodedAddress.label}`;
  t.fill = darkFill(COLOR_HEADER_DARK);
  t.font = { bold: true, size: 13, color: { argb: `FF${COLOR_WHITE}` } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${colLetter(ncols)}2`);
  const w = ws.getCell("A2");
  w.value =
    "⚠️ Prix de commercialisation — SeLoger Neuf. " +
    "Lots sans surface/prix importés via le bookmarklet sont exclus des statistiques.";
  w.fill = darkFill("FFF2CC");
  w.font = { italic: true, size: 10, color: { argb: "FFCC7700" } };
  w.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  ws.getRow(2).height = 28;

  const hRow = ws.getRow(3);
  DATA_COLS.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell, COLOR_HEADER_BLUE);
  });
  hRow.height = 40;

  let rowIdx = 4;
  for (const prog of result.programs) {
    for (const listing of prog.listings) {
      const row = ws.getRow(rowIdx);

      row.getCell(1).value = prog.programId;
      row.getCell(2).value = prog.programName;
      row.getCell(3).value = prog.developer ?? "Non communiqué";
      row.getCell(4).value = prog.city;

      const urlCell = row.getCell(5);
      urlCell.value = { text: prog.url, hyperlink: prog.url };

      row.getCell(6).value = prog.totalUnits ?? null;
      row.getCell(7).value = listing.availableCount ?? null;
      row.getCell(8).value = prog.deliveryDate ?? prog.commercialStatus ?? "Non communiqué";
      row.getCell(9).value = prog.parking ?? "Non communiqué";

      if (listing.isPlaceholderLot) {
        row.getCell(10).value = "";
        row.getCell(11).value = null;
        row.getCell(12).value = prog.priceFromEur ?? null;
        row.getCell(13).value = null;
      } else {
        row.getCell(10).value = listing.typology ?? "";
        row.getCell(11).value = listing.surfaceM2 ?? null;
        row.getCell(12).value = listing.priceEur ?? null;
        if (listing.surfaceM2 && listing.priceEur) {
          row.getCell(13).value = {
            formula: `IF(AND(K${rowIdx}>0,L${rowIdx}>0),ROUND(L${rowIdx}/K${rowIdx},0),"")`,
          };
        } else {
          row.getCell(13).value = null;
        }
      }

      row.getCell(14).value = listing.excludedFromStats ? "Oui" : "Non";
      row.getCell(15).value = listing.exclusionReason ?? "";

      for (let c = 1; c <= ncols; c++) applyDataStyle(row.getCell(c));
      urlCell.font = { color: { argb: "FF0563C1" }, underline: true, size: 10 };
      urlCell.alignment = { vertical: "middle", wrapText: true };
      row.getCell(6).numFmt = '#,##0';
      row.getCell(11).numFmt = '#,##0.## "m²"';
      row.getCell(12).numFmt = '#,##0 "€"';
      row.getCell(13).numFmt = '#,##0 "€/m²"';
      if (listing.isPlaceholderLot) {
        for (let c = 1; c <= ncols; c++) {
          row.getCell(c).fill = darkFill("F2F2F2");
        }
      }
      row.height = 20;
      rowIdx++;
    }
  }

  ws.columns = [
    { width: 18 }, // A ID
    { width: 28 }, // B Nom
    { width: 22 }, // C Promoteur
    { width: 18 }, // D Commune
    { width: 45 }, // E URL
    { width: 13 }, // F Total log.
    { width: 12 }, // G Dispo
    { width: 26 }, // H Livraison
    { width: 14 }, // I Parking
    { width: 14 }, // J Typologie
    { width: 13 }, // K Surface
    { width: 16 }, // L Prix
    { width: 16 }, // M Prix/m²
    { width: 13 }, // N Exclu
    { width: 50 }, // O Raison
  ];

  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.autoFilter = { from: "A3", to: `${colLetter(ncols)}3` };
}

// ─── ONGLET SYNTHÈSE ──────────────────────────────────────────────────────────
// 20 colonnes : 5 info + (surf moy + prix/m²) × 5 typologies + nb lots × 5 typologies
//
// A: Nom programme     B: Promoteur    C: Commune       D: URL            E: Livraison
// F: Surf T1  G: €/m² T1  H: Surf T2  I: €/m² T2  J: Surf T3  K: €/m² T3
// L: Surf T4  M: €/m² T4  N: Surf T5+  O: €/m² T5+
// P: Nb T1  Q: Nb T2  R: Nb T3  S: Nb T4  T: Nb T5+

const TYPOS: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];

const SYNTH_COLS = [
  "Nom du programme",        // A 1
  "Promoteur",               // B 2
  "Commune",                 // C 3
  "URL source SeLoger Neuf", // D 4
  "Livraison / Statut",      // E 5
  "Surf. moy. T1/Studio",    // F 6
  "Prix/m² T1/Studio",       // G 7
  "Surf. moy. T2",           // H 8
  "Prix/m² T2",              // I 9
  "Surf. moy. T3",           // J 10
  "Prix/m² T3",              // K 11
  "Surf. moy. T4",           // L 12
  "Prix/m² T4",              // M 13
  "Surf. moy. T5+",          // N 14
  "Prix/m² T5+",             // O 15
  "Nb lots T1/Studio",       // P 16
  "Nb lots T2",              // Q 17
  "Nb lots T3",              // R 18
  "Nb lots T4",              // S 19
  "Nb lots T5+",             // T 20
];

function avgFormula(
  dataCol: string,   // K or M (surface or prix/m²)
  matchBCol: string, // Data!$B:$B (prog name)
  nameRef: string,   // $A{r}
  typo: string       // "T2"
): ExcelJS.CellFormulaValue {
  return {
    formula:
      `IFERROR(AVERAGEIFS(Data!$${dataCol}:$${dataCol},` +
      `Data!$B:$B,${nameRef},` +
      `Data!$J:$J,"${typo}",` +
      `Data!$N:$N,"Non"),"")`,
  };
}

function sumFormula(
  nameRef: string,
  typo: string
): ExcelJS.CellFormulaValue {
  return {
    formula:
      `IFERROR(SUMIFS(Data!$G:$G,Data!$B:$B,${nameRef},Data!$J:$J,"${typo}",Data!$N:$N,"Non"),"")`,
  };
}

function avgGlobalFormula(dataCol: string, cityName?: string): ExcelJS.CellFormulaValue {
  if (cityName) {
    return {
      formula:
        `IFERROR(AVERAGEIFS(Data!$${dataCol}:$${dataCol},` +
        `Data!$D:$D,"${cityName}",Data!$N:$N,"Non"),"")`,
    };
  }
  return {
    formula: `IFERROR(AVERAGEIFS(Data!$${dataCol}:$${dataCol},Data!$N:$N,"Non"),"")`,
  };
}

function sumGlobalFormula(typo: string, cityName?: string): ExcelJS.CellFormulaValue {
  if (cityName) {
    return {
      formula:
        `IFERROR(SUMIFS(Data!$G:$G,Data!$D:$D,"${cityName}",Data!$J:$J,"${typo}",Data!$N:$N,"Non"),"")`,
    };
  }
  return {
    formula: `IFERROR(SUMIFS(Data!$G:$G,Data!$J:$J,"${typo}",Data!$N:$N,"Non"),"")`,
  };
}

function applyPriceFormats(row: ExcelJS.Row) {
  const surfCols = [6, 8, 10, 12, 14];
  const priceCols = [7, 9, 11, 13, 15];
  surfCols.forEach((c) => { row.getCell(c).numFmt = '#,##0.# "m²"'; });
  priceCols.forEach((c) => { row.getCell(c).numFmt = '#,##0 "€/m²"'; });
}

function buildSyntheseSheet(wb: ExcelJS.Workbook, result: NeufAnalysisResult) {
  const city = result.geocodedAddress.city;
  const ws = wb.addWorksheet(`Offre neuve ${city}`);
  const adresseRows = buildAdresseRowIndex(result.programs);
  const ncols = SYNTH_COLS.length; // 20

  // ── Titre ──
  ws.mergeCells(`A1:${colLetter(ncols)}1`);
  const t1 = ws.getCell("A1");
  t1.value = `Analyse de l'offre neuve — ${result.geocodedAddress.label}`;
  t1.fill = darkFill(COLOR_HEADER_DARK);
  t1.font = { bold: true, size: 13, color: { argb: `FF${COLOR_WHITE}` } };
  t1.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 32;

  // ── Avertissement ──
  ws.mergeCells(`A2:${colLetter(ncols)}2`);
  const t2 = ws.getCell("A2");
  t2.value =
    "⚠️ Prix affichés / prix de commercialisation — données issues de SeLoger Neuf, à vérifier. " +
    "Surfaces et prix/m² issus des lots importés via le bookmarklet.";
  t2.fill = darkFill(COLOR_WARNING);
  t2.font = { italic: true, size: 10, color: { argb: "FF7D4F00" } };
  t2.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  ws.getRow(2).height = 28;

  // ── En-têtes ──
  const hRow = ws.getRow(3);
  SYNTH_COLS.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell, COLOR_HEADER_BLUE);
  });
  hRow.height = 50;

  // ── Données groupées par commune ──
  let rowIdx = 4;
  const byCity = groupProgramsByCity(result.programs);

  const mainCity = result.geocodedAddress.city;
  const orderedCities: string[] = [];
  if (byCity.has(mainCity)) orderedCities.push(mainCity);
  for (const c of byCity.keys()) {
    if (c !== mainCity) orderedCities.push(c);
  }

  for (const cityName of orderedCities) {
    const cityProgs = byCity.get(cityName)!;
    const isMain = (cityProgs[0]?.zoneType ?? "Commune principale") === "Commune principale";

    // ── Séparateur de ville ──
    ws.mergeCells(`A${rowIdx}:${colLetter(ncols)}${rowIdx}`);
    const sepCell = ws.getCell(`A${rowIdx}`);
    sepCell.value = `${isMain ? "▶" : "▷"} ${isMain ? "Commune principale" : "Commune limitrophe"} — ${cityName}`;
    sepCell.fill = darkFill(isMain ? COLOR_HEADER_DARK : "4472C4");
    sepCell.font = { bold: true, size: 11, color: { argb: `FF${COLOR_WHITE}` } };
    sepCell.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(rowIdx).height = 22;
    rowIdx++;

    const groupStartRow = rowIdx;

    for (const prog of cityProgs) {
      const adresseRow = adresseRows.get(prog.programId);
      if (!adresseRow) continue;

      const r = rowIdx;
      const row = ws.getRow(r);
      const nameRef = `$A${r}`;

      // A: Nom → Adresse col B
      row.getCell(1).value = { formula: `Adresse!B${adresseRow}` };
      // B: Promoteur → Data col C (first match)
      row.getCell(2).value = {
        formula: `IFERROR(INDEX(Data!$C:$C,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // C: Commune → Adresse col D
      row.getCell(3).value = { formula: `Adresse!D${adresseRow}` };
      // D: URL → Adresse col G
      row.getCell(4).value = { formula: `Adresse!G${adresseRow}` };
      // E: Livraison → Data col H (first match)
      row.getCell(5).value = {
        formula: `IFERROR(INDEX(Data!$H:$H,MATCH($A${r},Data!$B:$B,0)),"")`,
      };

      // F–O: Surface et Prix/m² par typologie (AVERAGEIFS sur Data)
      TYPOS.forEach((typo, ti) => {
        const surfCol = 6 + ti * 2;      // F, H, J, L, N
        const priceCol = 7 + ti * 2;     // G, I, K, M, O
        row.getCell(surfCol).value = avgFormula("K", "Data!$B:$B", nameRef, typo);
        row.getCell(priceCol).value = avgFormula("M", "Data!$B:$B", nameRef, typo);
      });

      // P–T: Nb lots disponibles par typologie (SUMIFS sur Data col G)
      TYPOS.forEach((typo, ti) => {
        row.getCell(16 + ti).value = sumFormula(nameRef, typo);
      });

      // Mise en forme
      for (let c = 1; c <= ncols; c++) applyDataStyle(row.getCell(c));
      applyPriceFormats(row);
      row.height = 22;
      rowIdx++;
    }

    const groupEndRow = rowIdx - 1;

    // ── Total commune ──
    if (groupEndRow >= groupStartRow) {
      const tr = ws.getRow(rowIdx);
      ws.mergeCells(`A${rowIdx}:E${rowIdx}`);
      tr.getCell(1).value = `Moyenne — ${cityName}`;

      // F–O: AVERAGEIFS sur toute la ville
      TYPOS.forEach((typo, ti) => {
        const surfCol = 6 + ti * 2;
        const priceCol = 7 + ti * 2;
        tr.getCell(surfCol).value = avgGlobalFormula("K", cityName);
        tr.getCell(priceCol).value = avgGlobalFormula("M", cityName);
        // Nb lots ville
        tr.getCell(16 + ti).value = sumGlobalFormula(typo, cityName);
      });

      for (let c = 1; c <= ncols; c++) {
        const cell = tr.getCell(c);
        cell.fill = darkFill(COLOR_TOTAL_LIGHT);
        cell.font = { bold: true, size: 10, color: { argb: `FF${COLOR_HEADER_DARK}` } };
        cell.border = thin();
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
      applyPriceFormats(tr);
      tr.height = 22;
      rowIdx++;
    }

    rowIdx++; // ligne vide entre communes
  }

  // ── Total général ──
  const totalRow = ws.getRow(rowIdx);
  ws.mergeCells(`A${rowIdx}:E${rowIdx}`);
  totalRow.getCell(1).value = "TOTAL GÉNÉRAL";

  TYPOS.forEach((typo, ti) => {
    const surfCol = 6 + ti * 2;
    const priceCol = 7 + ti * 2;
    totalRow.getCell(surfCol).value = avgGlobalFormula("K");
    totalRow.getCell(priceCol).value = avgGlobalFormula("M");
    totalRow.getCell(16 + ti).value = sumGlobalFormula(typo);
  });

  for (let c = 1; c <= ncols; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = darkFill(COLOR_TOTAL_DARK);
    cell.font = { bold: true, size: 11, color: { argb: `FF${COLOR_WHITE}` } };
    cell.border = thin();
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  applyPriceFormats(totalRow);
  totalRow.height = 26;

  // ── Largeurs ──
  ws.columns = [
    { width: 30 }, // A Nom
    { width: 22 }, // B Promoteur
    { width: 18 }, // C Commune
    { width: 45 }, // D URL
    { width: 26 }, // E Livraison
    { width: 13 }, // F Surf T1
    { width: 14 }, // G €/m² T1
    { width: 13 }, // H Surf T2
    { width: 14 }, // I €/m² T2
    { width: 13 }, // J Surf T3
    { width: 14 }, // K €/m² T3
    { width: 13 }, // L Surf T4
    { width: 14 }, // M €/m² T4
    { width: 13 }, // N Surf T5+
    { width: 14 }, // O €/m² T5+
    { width: 11 }, // P Nb T1
    { width: 11 }, // Q Nb T2
    { width: 11 }, // R Nb T3
    { width: 11 }, // S Nb T4
    { width: 11 }, // T Nb T5+
  ];

  ws.views = [{ state: "frozen", ySplit: 3, xSplit: 5 }];
  ws.autoFilter = { from: "A3", to: `${colLetter(ncols)}3` };
}

function buildAdresseRowIndex(programs: NeufProgram[]): Map<string, number> {
  const map = new Map<string, number>();
  programs.forEach((prog, i) => {
    map.set(prog.programId, 4 + i);
  });
  return map;
}

// ─── EXPORT PRINCIPAL ─────────────────────────────────────────────────────────
export async function exportToExcel(result: NeufAnalysisResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SeLoger Neuf Analyzer";
  wb.created = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  buildAdresseSheet(wb, result);
  buildDataSheet(wb, result);
  buildSyntheseSheet(wb, result);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
