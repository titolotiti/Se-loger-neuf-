import ExcelJS from "exceljs";
import type { NeufAnalysisResult, NeufProgram, NeufTypology } from "@/types/neuf";
import { groupProgramsByCity } from "./stats";

// ─── Couleurs ────────────────────────────────────────────────────────────────
const COLOR_HEADER_DARK = "1F3864";   // bleu très foncé (bandeau titre)
const COLOR_HEADER_BLUE = "2F75B6";  // bleu moyen (en-têtes colonnes)
const COLOR_HEADER_LIGHT = "BDD7EE"; // bleu clair (ligne sous-titre)
const COLOR_TOTAL_DARK = "1F3864";   // bandeau total
const COLOR_TOTAL_LIGHT = "D6E4F0";  // ligne total commune
const COLOR_WARNING = "FFF2CC";      // fond avertissement
const COLOR_WHITE = "FFFFFF";
const COLOR_BLACK = "000000";
const COLOR_EXCLUDED = "F2F2F2";     // gris clair pour lignes exclues

type CellRef = ExcelJS.Cell;

function darkFill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color}` } };
}

function thin(): Partial<ExcelJS.Borders> {
  const s: ExcelJS.Border = { style: "thin", color: { argb: `FF${COLOR_BLACK}` } };
  return { top: s, left: s, bottom: s, right: s };
}

function bold(cell: CellRef, color = COLOR_WHITE) {
  cell.font = { bold: true, color: { argb: `FF${color}` } };
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

  // Titre
  ws.mergeCells("A1:G1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `Analyse offre neuve — ${result.geocodedAddress.label}`;
  titleCell.fill = darkFill(COLOR_HEADER_DARK);
  titleCell.font = { bold: true, size: 14, color: { argb: `FF${COLOR_WHITE}` } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 30;

  // Sous-titre avertissement
  ws.mergeCells("A2:G2");
  const warningCell = ws.getCell("A2");
  warningCell.value =
    "⚠️ Prix affichés / prix de commercialisation — données issues de SeLoger Neuf, à vérifier.";
  warningCell.fill = darkFill(COLOR_WARNING.replace("#", ""));
  warningCell.font = { italic: true, size: 10, color: { argb: "FFCC7700" } };
  warningCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(2).height = 20;

  // En-têtes
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

  // Données
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
    urlCell.font = { color: { argb: "FF0563C1" }, underline: true, size: 10 };

    for (let c = 1; c <= 7; c++) {
      applyDataStyle(row.getCell(c));
    }
    // Réappliquer le style du lien (applyDataStyle écrase la font)
    urlCell.font = { color: { argb: "FF0563C1" }, underline: true, size: 10 };
    urlCell.alignment = { vertical: "middle", wrapText: true };

    row.height = 20;
    rowIdx++;
  }

  // Largeurs
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
// Une ligne par programme (surfaces et prix/lot non disponibles dans __NEXT_DATA__)
const DATA_COLS = [
  "ID Programme",                    // A  1
  "Nom du programme",                // B  2
  "Promoteur",                       // C  3
  "Commune",                         // D  4
  "Code postal",                     // E  5
  "URL source SeLoger Neuf",         // F  6
  "Prix à partir de (€)",            // G  7
  "Est prix minimum ?",              // H  8
  "Typologies disponibles",          // I  9
  "Livraison / Statut",              // J  10
  "Lots matchant la recherche",      // K  11
  "Description",                     // L  12
  "Données lots détaillées dispo.",  // M  13
  "Raison absence données détail",   // N  14
  "Date extraction",                 // O  15
];

function buildDataSheet(wb: ExcelJS.Workbook, result: NeufAnalysisResult) {
  const ws = wb.addWorksheet("Data");

  // Titre
  ws.mergeCells(`A1:${colLetter(DATA_COLS.length)}1`);
  const t = ws.getCell("A1");
  t.value = `Données programmes — ${result.geocodedAddress.label}`;
  t.fill = darkFill(COLOR_HEADER_DARK);
  t.font = { bold: true, size: 13, color: { argb: `FF${COLOR_WHITE}` } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 28;

  // Avertissement
  ws.mergeCells(`A2:${colLetter(DATA_COLS.length)}2`);
  const w = ws.getCell("A2");
  w.value =
    "⚠️ Prix de commercialisation affichés — SeLoger Neuf — non vérifiés. " +
    "Surfaces et prix par lot non disponibles dans __NEXT_DATA__ (pages détail bloquées HTTP 403).";
  w.fill = darkFill("FFF2CC");
  w.font = { italic: true, size: 10, color: { argb: "FFCC7700" } };
  w.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  ws.getRow(2).height = 28;

  // En-têtes
  const hRow = ws.getRow(3);
  DATA_COLS.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell, COLOR_HEADER_BLUE);
  });
  hRow.height = 40;

  // Données — une ligne par programme
  let rowIdx = 4;
  for (const prog of result.programs) {
    const row = ws.getRow(rowIdx);
    const extractedAt = prog.listings[0]?.extractedAt ?? new Date().toISOString();

    row.getCell(1).value = prog.programId;
    row.getCell(2).value = prog.programName;
    row.getCell(3).value = prog.developer ?? "Non communiqué";
    row.getCell(4).value = prog.city;
    row.getCell(5).value = prog.postalCode ?? "";

    const urlCell = row.getCell(6);
    urlCell.value = { text: prog.url, hyperlink: prog.url };

    row.getCell(7).value = prog.priceFromEur ?? null;
    row.getCell(8).value = prog.isPriceMin ? "Oui" : "Non";
    row.getCell(9).value =
      prog.typologies && prog.typologies.length > 0
        ? prog.typologies.join(", ")
        : prog.typologyRange ?? "Non communiqué";
    row.getCell(10).value = prog.deliveryDate ?? prog.commercialStatus ?? "Non communiqué";
    row.getCell(11).value = prog.availableUnitsDetected ?? prog.availableUnits ?? null;
    row.getCell(12).value = prog.description ?? "";
    row.getCell(13).value = "Non";
    row.getCell(14).value =
      "Surfaces et prix par lot non exposés dans __NEXT_DATA__ — pages détail bloquées HTTP 403 depuis Vercel";
    row.getCell(15).value = extractedAt;

    // Mise en forme
    for (let c = 1; c <= DATA_COLS.length; c++) {
      applyDataStyle(row.getCell(c));
    }
    urlCell.font = { color: { argb: "FF0563C1" }, underline: true, size: 10 };
    urlCell.alignment = { vertical: "middle", wrapText: true };
    row.getCell(7).numFmt = '#,##0 "€"';
    row.getCell(12).alignment = { vertical: "middle", wrapText: true };

    row.height = 20;
    rowIdx++;
  }

  // Largeurs colonnes
  ws.columns = [
    { width: 18 }, // A ID
    { width: 28 }, // B Nom
    { width: 22 }, // C Promoteur
    { width: 18 }, // D Commune
    { width: 12 }, // E CP
    { width: 45 }, // F URL
    { width: 16 }, // G Prix à partir de
    { width: 14 }, // H Est prix min
    { width: 26 }, // I Typologies
    { width: 28 }, // J Livraison
    { width: 14 }, // K Lots
    { width: 40 }, // L Description
    { width: 18 }, // M Données dispo
    { width: 50 }, // N Raison
    { width: 22 }, // O Date
  ];

  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.autoFilter = { from: "A3", to: `${colLetter(DATA_COLS.length)}3` };
}

// ─── ONGLET SYNTHÈSE ──────────────────────────────────────────────────────────
// Colonnes adaptées aux données disponibles dans __NEXT_DATA__ (pas de surfaces/lots)
const SYNTH_COLS = [
  "Nom du programme",        // A  1
  "Promoteur",               // B  2
  "Commune",                 // C  3
  "URL source SeLoger Neuf", // D  4
  "Livraison / Statut",      // E  5
  "Prix à partir de (€)",    // F  6
  "Prix minimum ?",          // G  7
  "Typologies disponibles",  // H  8
  "Lots détectés",           // I  9
  "Prix/m² T1/Studio",       // J  10  — vide, surface non disponible
  "Prix/m² T2",              // K  11
  "Prix/m² T3",              // L  12
  "Prix/m² T4",              // M  13
  "Prix/m² T5+",             // N  14
  "Prix/m² moyen",           // O  15
];

// Mapping colonne synthèse → colonne Data (pour les formules AVERAGEIFS)
// Data: B=Nom(2), C=Promoteur(3), D=Adresse(4), G=URL(7), H=Total(8), I=Dispo(9)
// J=Livraison(10), K=Parking(11), L=Typo(12), O=Surface(15), Q=Prix/m²(17), V=Exclu(22)

function buildSyntheseSheet(wb: ExcelJS.Workbook, result: NeufAnalysisResult) {
  const city = result.geocodedAddress.city;
  const ws = wb.addWorksheet(`Offre neuve ${city}`);

  // On a besoin du mapping programme → ligne dans l'onglet Adresse
  const adresseRows = buildAdresseRowIndex(result.programs);

  // ── Titre ──
  const ncols = SYNTH_COLS.length;
  ws.mergeCells(`A1:${colLetter(ncols)}1`);
  const t1 = ws.getCell("A1");
  t1.value = `Analyse de l'offre neuve — ${result.geocodedAddress.label} — ${city}`;
  t1.fill = darkFill(COLOR_HEADER_DARK);
  t1.font = { bold: true, size: 13, color: { argb: `FF${COLOR_WHITE}` } };
  t1.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 32;

  // ── Avertissement ──
  ws.mergeCells(`A2:${colLetter(ncols)}2`);
  const t2 = ws.getCell("A2");
  t2.value =
    "⚠️ Prix affichés / prix de commercialisation — données issues de SeLoger Neuf, à vérifier. Ces données ne sont pas des transactions actées.";
  t2.fill = darkFill("FFF2CC");
  t2.font = { italic: true, bold: false, size: 10, color: { argb: "FF7D4F00" } };
  t2.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  ws.getRow(2).height = 28;

  // ── En-têtes ──
  const hRow = ws.getRow(3);
  SYNTH_COLS.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell, COLOR_HEADER_BLUE);
  });
  hRow.height = 45;

  // ── Données groupées par commune ──
  let rowIdx = 4;
  const byCity = groupProgramsByCity(result.programs);

  // Commune principale en premier
  const mainCity = result.geocodedAddress.city;
  const orderedCities: string[] = [];
  if (byCity.has(mainCity)) orderedCities.push(mainCity);
  for (const c of byCity.keys()) {
    if (c !== mainCity) orderedCities.push(c);
  }

  for (const cityName of orderedCities) {
    const cityProgs = byCity.get(cityName)!;
    const zoneType = cityProgs[0]?.zoneType ?? "Commune principale";
    const isMain = zoneType === "Commune principale";

    // ── Séparateur de ville ──
    ws.mergeCells(`A${rowIdx}:${colLetter(ncols)}${rowIdx}`);
    const sepCell = ws.getCell(`A${rowIdx}`);
    sepCell.value = `${isMain ? "▶" : "▷"} ${zoneType} — ${cityName}`;
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

      // Formules pointant vers Adresse ou Data
      // A : Nom programme
      row.getCell(1).value = { formula: `Adresse!B${adresseRow}` };
      // B : Promoteur → Data col C
      row.getCell(2).value = {
        formula: `IFERROR(INDEX(Data!$C:$C,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // C : Commune → Adresse col D
      row.getCell(3).value = { formula: `Adresse!D${adresseRow}` };
      // D : URL → Adresse col G
      row.getCell(4).value = { formula: `Adresse!G${adresseRow}` };

      // E : Livraison / Statut → Data col J
      row.getCell(5).value = {
        formula: `IFERROR(INDEX(Data!$J:$J,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // F : Prix à partir de → Data col G
      row.getCell(6).value = {
        formula: `IFERROR(INDEX(Data!$G:$G,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // G : Est prix minimum ? → Data col H
      row.getCell(7).value = {
        formula: `IFERROR(INDEX(Data!$H:$H,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // H : Typologies → Data col I
      row.getCell(8).value = {
        formula: `IFERROR(INDEX(Data!$I:$I,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // I : Lots détectés → Data col K
      row.getCell(9).value = {
        formula: `IFERROR(INDEX(Data!$K:$K,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // J–O : Prix/m² par typologie — vide car surfaces non disponibles
      for (let c = 10; c <= 15; c++) {
        row.getCell(c).value = "";
      }

      // Mise en forme
      for (let c = 1; c <= ncols; c++) {
        applyDataStyle(row.getCell(c));
      }
      row.getCell(6).numFmt = '#,##0 "€"';
      row.getCell(10).numFmt = '#,##0 "€/m²"';
      row.getCell(11).numFmt = '#,##0 "€/m²"';
      row.getCell(12).numFmt = '#,##0 "€/m²"';
      row.getCell(13).numFmt = '#,##0 "€/m²"';
      row.getCell(14).numFmt = '#,##0 "€/m²"';
      row.getCell(15).numFmt = '#,##0 "€/m²"';

      row.height = 22;
      rowIdx++;
    }

    const groupEndRow = rowIdx - 1;

    // ── Ligne total commune ──
    if (groupEndRow >= groupStartRow) {
      const tr = ws.getRow(rowIdx);
      ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
      tr.getCell(1).value = `Total — ${cityName}`;
      tr.getCell(1).fill = darkFill(COLOR_TOTAL_LIGHT.replace("#", ""));
      tr.getCell(1).font = { bold: true, size: 11, color: { argb: `FF${COLOR_HEADER_DARK}` } };
      tr.getCell(1).alignment = { vertical: "middle", horizontal: "right" };

      // I : total lots détectés
      tr.getCell(9).value = { formula: `SUM(I${groupStartRow}:I${groupEndRow})` };
      // F : prix min de la commune
      tr.getCell(6).value = { formula: `IFERROR(MIN(F${groupStartRow}:F${groupEndRow}),"")` };

      for (let c = 1; c <= ncols; c++) {
        const cell = tr.getCell(c);
        cell.fill = darkFill(COLOR_TOTAL_LIGHT.replace("#", ""));
        cell.font = { bold: true, size: 10, color: { argb: `FF${COLOR_HEADER_DARK}` } };
        cell.border = thin();
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
      tr.getCell(6).numFmt = '#,##0 "€"';
      tr.height = 22;
      rowIdx++;
    }

    rowIdx++; // ligne vide entre communes
  }

  // ── Ligne Total général ──
  ws.mergeCells(`A${rowIdx}:D${rowIdx}`);
  const totalRow = ws.getRow(rowIdx);
  totalRow.getCell(1).value = "TOTAL GÉNÉRAL";

  // I : total lots détectés
  totalRow.getCell(9).value = { formula: `IFERROR(SUM(Data!$K:$K),"")` };
  // F : prix min global
  totalRow.getCell(6).value = { formula: `IFERROR(MIN(Data!$G:$G),"")` };

  for (let c = 1; c <= ncols; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = darkFill(COLOR_TOTAL_DARK);
    cell.font = { bold: true, size: 11, color: { argb: `FF${COLOR_WHITE}` } };
    cell.border = thin();
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  totalRow.getCell(6).numFmt = '#,##0 "€"';
  totalRow.height = 26;

  // ── Largeurs ──
  ws.columns = [
    { width: 30 }, // A Nom
    { width: 22 }, // B Promoteur
    { width: 20 }, // C Commune
    { width: 45 }, // D URL
    { width: 28 }, // E Livraison
    { width: 16 }, // F Prix à partir de
    { width: 14 }, // G Prix min
    { width: 26 }, // H Typologies
    { width: 12 }, // I Lots
    { width: 14 }, // J P/m² T1 (vide)
    { width: 14 }, // K P/m² T2 (vide)
    { width: 14 }, // L P/m² T3 (vide)
    { width: 14 }, // M P/m² T4 (vide)
    { width: 14 }, // N P/m² T5+ (vide)
    { width: 16 }, // O P/m² moy (vide)
  ];

  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.autoFilter = { from: "A3", to: `${colLetter(ncols)}3` };
}

/**
 * Retourne un map programId → ligne (1-based) dans l'onglet Adresse.
 * La ligne 3 est l'en-tête, donc les données commencent à la ligne 4.
 */
function buildAdresseRowIndex(programs: NeufProgram[]): Map<string, number> {
  const map = new Map<string, number>();
  programs.forEach((prog, i) => {
    map.set(prog.programId, 4 + i); // ligne 4 = première donnée dans Adresse
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
