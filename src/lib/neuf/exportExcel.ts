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
const DATA_COLS = [
  "ID Programme",        // A  1
  "Nom du programme",    // B  2
  "Promoteur",           // C  3
  "Adresse",             // D  4
  "Commune",             // E  5
  "Code postal",         // F  6
  "URL source",          // G  7
  "Total logements",     // H  8
  "Logements dispo.",    // I  9
  "Date de livraison",   // J  10
  "Parking",             // K  11
  "Typologie",           // L  12
  "Pièces",              // M  13
  "Chambres",            // N  14
  "Surface (m²)",        // O  15
  "Prix (€)",            // P  16
  "Prix/m²",             // Q  17
  "Étage",               // R  18
  "Extérieur",           // S  19
  "Statut spécial",      // T  20
  "Score fiabilité",     // U  21
  "Exclu des stats ?",   // V  22
  "Raison exclusion",    // W  23
  "Date extraction",     // X  24
];

function buildDataSheet(wb: ExcelJS.Workbook, result: NeufAnalysisResult) {
  const ws = wb.addWorksheet("Data");

  // Titre
  ws.mergeCells(`A1:${colLetter(DATA_COLS.length)}1`);
  const t = ws.getCell("A1");
  t.value = `Données brutes — ${result.geocodedAddress.label}`;
  t.fill = darkFill(COLOR_HEADER_DARK);
  t.font = { bold: true, size: 13, color: { argb: `FF${COLOR_WHITE}` } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 28;

  // Avertissement
  ws.mergeCells(`A2:${colLetter(DATA_COLS.length)}2`);
  const w = ws.getCell("A2");
  w.value = "⚠️ Prix de commercialisation affichés — SeLoger Neuf — non vérifiés";
  w.fill = darkFill("FFF2CC");
  w.font = { italic: true, size: 10, color: { argb: "FFCC7700" } };
  w.alignment = { vertical: "middle", horizontal: "center" };

  // En-têtes
  const hRow = ws.getRow(3);
  DATA_COLS.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    applyHeaderStyle(cell, COLOR_HEADER_BLUE);
  });
  hRow.height = 30;

  // Données
  let rowIdx = 4;
  for (const prog of result.programs) {
    for (const lot of prog.listings) {
      const row = ws.getRow(rowIdx);

      row.getCell(1).value = prog.programId;
      row.getCell(2).value = prog.programName;
      row.getCell(3).value = prog.developer ?? "Non communiqué";
      row.getCell(4).value = prog.address ?? "Non communiqué";
      row.getCell(5).value = prog.city;
      row.getCell(6).value = prog.postalCode ?? "";
      const urlCell = row.getCell(7);
      urlCell.value = { text: lot.url, hyperlink: lot.url };

      row.getCell(8).value = prog.totalUnits ?? null;
      row.getCell(9).value = prog.availableUnits ?? null;
      row.getCell(10).value = prog.deliveryDate ?? "Non communiqué";
      row.getCell(11).value = prog.parking ?? "Non communiqué";
      row.getCell(12).value = lot.typology ?? "Non communiqué";
      row.getCell(13).value = lot.rooms ?? null;
      row.getCell(14).value = lot.bedrooms ?? null;
      row.getCell(15).value = lot.surfaceM2 ?? null;
      row.getCell(16).value = lot.priceEur ?? null;

      // Q = Prix/m² via formule Excel
      const qCell = row.getCell(17);
      if (lot.surfaceM2 && lot.priceEur) {
        qCell.value = { formula: `IFERROR(P${rowIdx}/O${rowIdx},"")` };
      } else {
        qCell.value = "";
      }

      row.getCell(18).value = lot.floor ?? "";
      row.getCell(19).value = lot.outdoorSpace ?? "";
      row.getCell(20).value = lot.specialStatus?.join(", ") ?? "";
      row.getCell(21).value = lot.reliabilityScore;
      row.getCell(22).value = lot.excludedFromStats ? "Oui" : "Non";
      row.getCell(23).value = lot.exclusionReason ?? "";
      row.getCell(24).value = lot.extractedAt;

      // Mise en forme par ligne
      const bg = lot.excludedFromStats ? COLOR_EXCLUDED : COLOR_WHITE;
      for (let c = 1; c <= DATA_COLS.length; c++) {
        const cell = row.getCell(c);
        applyDataStyle(cell, bg);
      }

      // Réappliquer lien
      urlCell.font = { color: { argb: "FF0563C1" }, underline: true, size: 10 };
      urlCell.alignment = { vertical: "middle", wrapText: true };

      // Formats numériques
      row.getCell(15).numFmt = '#,##0.0 "m²"';
      row.getCell(16).numFmt = '#,##0 "€"';
      row.getCell(17).numFmt = '#,##0 "€/m²"';

      row.height = 18;
      rowIdx++;
    }
  }

  // Largeurs colonnes
  ws.columns = [
    { width: 18 }, // A ID
    { width: 28 }, // B Nom
    { width: 22 }, // C Promoteur
    { width: 28 }, // D Adresse
    { width: 18 }, // E Commune
    { width: 12 }, // F CP
    { width: 45 }, // G URL
    { width: 12 }, // H Total log.
    { width: 12 }, // I Dispo.
    { width: 18 }, // J Livraison
    { width: 14 }, // K Parking
    { width: 14 }, // L Typologie
    { width: 10 }, // M Pièces
    { width: 12 }, // N Chambres
    { width: 13 }, // O Surface
    { width: 14 }, // P Prix
    { width: 14 }, // Q Prix/m²
    { width: 10 }, // R Étage
    { width: 18 }, // S Extérieur
    { width: 18 }, // T Statut
    { width: 12 }, // U Score
    { width: 14 }, // V Exclu
    { width: 28 }, // W Raison
    { width: 22 }, // X Date extract.
  ];

  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.autoFilter = { from: "A3", to: `${colLetter(DATA_COLS.length)}3` };
}

// ─── ONGLET SYNTHÈSE ──────────────────────────────────────────────────────────
const SYNTH_COLS = [
  "Nom du programme",        // A  1
  "Promoteur",               // B  2
  "Adresse",                 // C  3
  "URL source SeLoger Neuf", // D  4
  "Total logements",         // E  5
  "Logements disponibles",   // F  6
  "% commercialisation",     // G  7
  "Date de livraison",       // H  8
  "Parking",                 // I  9
  "Surf. moy. T1/Studio",    // J  10
  "Prix/m² T1/Studio",       // K  11
  "Surf. moy. T2",           // L  12
  "Prix/m² T2",              // M  13
  "Surf. moy. T3",           // N  14
  "Prix/m² T3",              // O  15
  "Surf. moy. T4",           // P  16
  "Prix/m² T4",              // Q  17
  "Surf. moy. T5+",          // R  18
  "Prix/m² T5+",             // S  19
  "Prix/m² moyen programme", // T  20
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

      // Toutes les cellules = formules pointant vers Adresse ou Data
      // A : Nom programme
      row.getCell(1).value = { formula: `Adresse!B${adresseRow}` };
      // B : Promoteur
      row.getCell(2).value = {
        formula: `IFERROR(INDEX(Data!$C:$C,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // C : Adresse
      row.getCell(3).value = { formula: `Adresse!C${adresseRow}` };
      // D : URL
      const dCell = row.getCell(4);
      dCell.value = { formula: `Adresse!G${adresseRow}` };

      // E : Total logements
      row.getCell(5).value = {
        formula: `IFERROR(INDEX(Data!$H:$H,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // F : Dispo
      row.getCell(6).value = {
        formula: `IFERROR(INDEX(Data!$I:$I,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // G : % commercialisation
      row.getCell(7).value = { formula: `IFERROR(1-(F${r}/E${r}),"")` };

      // H : Livraison
      row.getCell(8).value = {
        formula: `IFERROR(INDEX(Data!$J:$J,MATCH($A${r},Data!$B:$B,0)),"")`,
      };
      // I : Parking
      row.getCell(9).value = {
        formula: `IFERROR(INDEX(Data!$K:$K,MATCH($A${r},Data!$B:$B,0)),"")`,
      };

      // J : Surf. T1/Studio
      row.getCell(10).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$O:$O,Data!$B:$B,$A${r},Data!$L:$L,"T1 / Studio",Data!$V:$V,"Non"),"")`,
      };
      // K : Prix/m² T1/Studio
      row.getCell(11).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$B:$B,$A${r},Data!$L:$L,"T1 / Studio",Data!$V:$V,"Non"),"")`,
      };
      // L : Surf. T2
      row.getCell(12).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$O:$O,Data!$B:$B,$A${r},Data!$L:$L,"T2",Data!$V:$V,"Non"),"")`,
      };
      // M : Prix/m² T2
      row.getCell(13).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$B:$B,$A${r},Data!$L:$L,"T2",Data!$V:$V,"Non"),"")`,
      };
      // N : Surf. T3
      row.getCell(14).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$O:$O,Data!$B:$B,$A${r},Data!$L:$L,"T3",Data!$V:$V,"Non"),"")`,
      };
      // O : Prix/m² T3
      row.getCell(15).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$B:$B,$A${r},Data!$L:$L,"T3",Data!$V:$V,"Non"),"")`,
      };
      // P : Surf. T4
      row.getCell(16).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$O:$O,Data!$B:$B,$A${r},Data!$L:$L,"T4",Data!$V:$V,"Non"),"")`,
      };
      // Q : Prix/m² T4
      row.getCell(17).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$B:$B,$A${r},Data!$L:$L,"T4",Data!$V:$V,"Non"),"")`,
      };
      // R : Surf. T5+
      row.getCell(18).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$O:$O,Data!$B:$B,$A${r},Data!$L:$L,"T5+",Data!$V:$V,"Non"),"")`,
      };
      // S : Prix/m² T5+
      row.getCell(19).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$B:$B,$A${r},Data!$L:$L,"T5+",Data!$V:$V,"Non"),"")`,
      };
      // T : Prix/m² moyen
      row.getCell(20).value = {
        formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$B:$B,$A${r},Data!$V:$V,"Non"),"")`,
      };

      // Mise en forme
      for (let c = 1; c <= ncols; c++) {
        applyDataStyle(row.getCell(c));
      }
      row.getCell(7).numFmt = "0.0%";
      row.getCell(10).numFmt = '#,##0.0 "m²"';
      row.getCell(11).numFmt = '#,##0 "€/m²"';
      row.getCell(12).numFmt = '#,##0.0 "m²"';
      row.getCell(13).numFmt = '#,##0 "€/m²"';
      row.getCell(14).numFmt = '#,##0.0 "m²"';
      row.getCell(15).numFmt = '#,##0 "€/m²"';
      row.getCell(16).numFmt = '#,##0.0 "m²"';
      row.getCell(17).numFmt = '#,##0 "€/m²"';
      row.getCell(18).numFmt = '#,##0.0 "m²"';
      row.getCell(19).numFmt = '#,##0 "€/m²"';
      row.getCell(20).numFmt = '#,##0 "€/m²"';

      row.height = 22;
      rowIdx++;
    }

    const groupEndRow = rowIdx - 1;

    // ── Ligne total commune ──
    if (groupEndRow >= groupStartRow) {
      const tr = ws.getRow(rowIdx);
      ws.mergeCells(`A${rowIdx}:C${rowIdx}`);
      tr.getCell(1).value = `Total — ${cityName}`;
      tr.getCell(1).fill = darkFill(COLOR_TOTAL_LIGHT.replace("#", ""));
      tr.getCell(1).font = { bold: true, size: 11, color: { argb: `FF${COLOR_HEADER_DARK}` } };
      tr.getCell(1).alignment = { vertical: "middle", horizontal: "right" };

      // E : total logements
      tr.getCell(5).value = { formula: `SUM(E${groupStartRow}:E${groupEndRow})` };
      // F : total dispo
      tr.getCell(6).value = { formula: `SUM(F${groupStartRow}:F${groupEndRow})` };
      // G : % commercialisation total
      tr.getCell(7).value = { formula: `IFERROR(1-(F${rowIdx}/E${rowIdx}),"")` };
      // K : moy prix/m² T1
      tr.getCell(11).value = { formula: `IFERROR(AVERAGE(K${groupStartRow}:K${groupEndRow}),"")` };
      tr.getCell(13).value = { formula: `IFERROR(AVERAGE(M${groupStartRow}:M${groupEndRow}),"")` };
      tr.getCell(15).value = { formula: `IFERROR(AVERAGE(O${groupStartRow}:O${groupEndRow}),"")` };
      tr.getCell(17).value = { formula: `IFERROR(AVERAGE(Q${groupStartRow}:Q${groupEndRow}),"")` };
      tr.getCell(19).value = { formula: `IFERROR(AVERAGE(S${groupStartRow}:S${groupEndRow}),"")` };
      tr.getCell(20).value = { formula: `IFERROR(AVERAGE(T${groupStartRow}:T${groupEndRow}),"")` };

      for (let c = 1; c <= ncols; c++) {
        const cell = tr.getCell(c);
        cell.fill = darkFill(COLOR_TOTAL_LIGHT.replace("#", ""));
        cell.font = { bold: true, size: 10, color: { argb: `FF${COLOR_HEADER_DARK}` } };
        cell.border = thin();
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
      tr.getCell(7).numFmt = "0.0%";
      tr.getCell(11).numFmt = '#,##0 "€/m²"';
      tr.getCell(13).numFmt = '#,##0 "€/m²"';
      tr.getCell(15).numFmt = '#,##0 "€/m²"';
      tr.getCell(17).numFmt = '#,##0 "€/m²"';
      tr.getCell(19).numFmt = '#,##0 "€/m²"';
      tr.getCell(20).numFmt = '#,##0 "€/m²"';
      tr.height = 22;
      rowIdx++;
    }

    rowIdx++; // ligne vide entre communes
  }

  // ── Ligne Total général ──
  const lastDataRow = rowIdx - 2;
  const firstDataRow = 4;

  ws.mergeCells(`A${rowIdx}:C${rowIdx}`);
  const totalRow = ws.getRow(rowIdx);
  totalRow.getCell(1).value = "TOTAL GÉNÉRAL";

  totalRow.getCell(5).value = {
    formula: `IFERROR(SUMIF(Data!$V:$V,"Non",Data!$H:$H),"")`,
  };
  totalRow.getCell(6).value = {
    formula: `IFERROR(SUMIF(Data!$V:$V,"Non",Data!$I:$I),"")`,
  };
  totalRow.getCell(7).value = { formula: `IFERROR(1-(F${rowIdx}/E${rowIdx}),"")` };
  totalRow.getCell(11).value = {
    formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$L:$L,"T1 / Studio",Data!$V:$V,"Non"),"")`,
  };
  totalRow.getCell(13).value = {
    formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$L:$L,"T2",Data!$V:$V,"Non"),"")`,
  };
  totalRow.getCell(15).value = {
    formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$L:$L,"T3",Data!$V:$V,"Non"),"")`,
  };
  totalRow.getCell(17).value = {
    formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$L:$L,"T4",Data!$V:$V,"Non"),"")`,
  };
  totalRow.getCell(19).value = {
    formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$L:$L,"T5+",Data!$V:$V,"Non"),"")`,
  };
  totalRow.getCell(20).value = {
    formula: `IFERROR(AVERAGEIFS(Data!$Q:$Q,Data!$V:$V,"Non"),"")`,
  };

  for (let c = 1; c <= ncols; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = darkFill(COLOR_TOTAL_DARK);
    cell.font = { bold: true, size: 11, color: { argb: `FF${COLOR_WHITE}` } };
    cell.border = thin();
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
  totalRow.getCell(7).numFmt = "0.0%";
  totalRow.getCell(11).numFmt = '#,##0 "€/m²"';
  totalRow.getCell(13).numFmt = '#,##0 "€/m²"';
  totalRow.getCell(15).numFmt = '#,##0 "€/m²"';
  totalRow.getCell(17).numFmt = '#,##0 "€/m²"';
  totalRow.getCell(19).numFmt = '#,##0 "€/m²"';
  totalRow.getCell(20).numFmt = '#,##0 "€/m²"';
  totalRow.height = 26;

  // ── Largeurs ──
  ws.columns = [
    { width: 30 }, // A Nom
    { width: 22 }, // B Promoteur
    { width: 30 }, // C Adresse
    { width: 45 }, // D URL
    { width: 14 }, // E Total log.
    { width: 14 }, // F Dispo
    { width: 16 }, // G % comm.
    { width: 18 }, // H Livraison
    { width: 16 }, // I Parking
    { width: 14 }, // J Surf T1
    { width: 14 }, // K P/m² T1
    { width: 14 }, // L Surf T2
    { width: 14 }, // M P/m² T2
    { width: 14 }, // N Surf T3
    { width: 14 }, // O P/m² T3
    { width: 14 }, // P Surf T4
    { width: 14 }, // Q P/m² T4
    { width: 14 }, // R Surf T5+
    { width: 14 }, // S P/m² T5+
    { width: 18 }, // T Moy prog.
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
