import ExcelJS from "exceljs";
import type { NeufAnalysisResult, NeufProgram, NeufListing, NeufTypology } from "@/types/neuf";

// ── Typologies (ordre référence) ──────────────────────────────────────────────
const TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];

const TYPO_LETTER: Record<NeufTypology, string> = {
  "T1 / Studio": "a", "T2": "b", "T3": "c", "T4": "d", "T5+": "e",
};

const TYPO_LABEL: Record<NeufTypology, string> = {
  "T1 / Studio": "T1", "T2": "T2", "T3": "T3", "T4": "T4", "T5+": "T5+",
};

// ── Helpers colonnes (1-indexé) ───────────────────────────────────────────────
// Programme n (0-indexé) : index=6n+2 | m²=6n+4 | prix=6n+5 | prix/m²=6n+6
const idxCol  = (n: number) => 6 * n + 2;
const m2Col   = (n: number) => 6 * n + 4;
const prixCol = (n: number) => 6 * n + 5;
const pm2Col  = (n: number) => 6 * n + 6;

function cl(n: number): string {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

function progLots(prog: NeufProgram, typo: NeufTypology): NeufListing[] {
  return prog.listings.filter(l => l.typology === typo && !l.isPlaceholderLot);
}

// ── Layout lignes de l'onglet Data ───────────────────────────────────────────
interface TypoRow {
  labelRow:  number; // lettre a/b/c + nom typo
  headerRow: number; // m² | prix | prix/m²
  dataStart: number; // première ligne de données
  avgRow:    number; // ligne AVERAGE
}

function computeTypoLayout(
  programs: NeufProgram[]
): Partial<Record<NeufTypology, TypoRow>> {
  const layout: Partial<Record<NeufTypology, TypoRow>> = {};
  let row = 6; // zone en-tête = lignes 1-5

  for (const typo of TYPOLOGIES) {
    const maxLots = Math.max(0, ...programs.map(p => progLots(p, typo).length));
    if (maxLots === 0) continue;
    layout[typo] = {
      labelRow:  row,
      headerRow: row + 1,
      dataStart: row + 2,
      avgRow:    row + 2 + maxLots,
    };
    // label + header + données + avg + séparateur vide
    row += 3 + maxLots + 1;
  }
  return layout;
}

// ── Onglet Adresse ────────────────────────────────────────────────────────────
// Structure : R1=en-têtes, puis pour chaque ville : titre ville + lignes programmes
function buildAdresse(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[]
): Map<string, number> {
  const ws = wb.addWorksheet("Adresse");
  const rowMap = new Map<string, number>(); // programId → numéro de ligne

  ws.getCell(1, 1).value = "Adresse";
  ws.getCell(1, 2).value = "Nom";
  ws.getCell(1, 3).value = "Type";

  const cities = [...new Set(programs.map(p => p.city))];
  let globalIdx = 1;
  let r = 2;

  for (const city of cities) {
    const cityProgs = programs.filter(p => p.city === city);

    // Ligne titre ville (col A uniquement)
    ws.getCell(r, 1).value = city;
    r++;

    for (const prog of cityProgs) {
      ws.getCell(r, 1).value = prog.address ?? "";
      ws.getCell(r, 2).value = prog.programName;
      ws.getCell(r, 3).value = globalIdx++;
      rowMap.set(prog.programId, r);
      r++;
    }

    r++; // ligne vide entre villes
  }

  ws.getColumn(1).width = 52;
  ws.getColumn(2).width = 32;
  ws.getColumn(3).width = 8;

  return rowMap;
}

// ── Onglet Data (matrice horizontale) ─────────────────────────────────────────
// 6 colonnes par programme ; blocs de typologies empilés verticalement
function buildData(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[],
  layout: Partial<Record<NeufTypology, TypoRow>>
) {
  const ws = wb.addWorksheet("Data");

  // R1 : titre
  ws.getCell(1, 3).value = "Calcul métrique";

  // R4 : indices et noms des programmes
  for (let n = 0; n < programs.length; n++) {
    ws.getCell(4, idxCol(n)).value = n + 1;
    ws.getCell(4, m2Col(n)).value = programs[n].programName;
  }

  // Blocs par typologie
  for (const typo of TYPOLOGIES) {
    const tl = layout[typo];
    if (!tl) continue;

    for (let n = 0; n < programs.length; n++) {
      const prog = programs[n];
      const lots = progLots(prog, typo);

      // Ligne label (lettre + nom)
      ws.getCell(tl.labelRow, idxCol(n)).value = TYPO_LETTER[typo];
      ws.getCell(tl.labelRow, m2Col(n)).value  = TYPO_LABEL[typo];

      // Ligne en-têtes colonnes
      ws.getCell(tl.headerRow, m2Col(n)).value  = "m²";
      ws.getCell(tl.headerRow, prixCol(n)).value = "prix";
      ws.getCell(tl.headerRow, pm2Col(n)).value  = "prix/m²";

      // Lignes de données
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

      // Ligne AVERAGE (si des données existent)
      if (lots.length > 0) {
        const dataEnd = tl.dataStart + lots.length - 1;
        ws.getCell(tl.avgRow, m2Col(n)).value = {
          formula: `AVERAGE(${cl(m2Col(n))}${tl.dataStart}:${cl(m2Col(n))}${dataEnd})`,
        };
        ws.getCell(tl.avgRow, pm2Col(n)).value = {
          formula: `AVERAGE(${cl(pm2Col(n))}${tl.dataStart}:${cl(pm2Col(n))}${dataEnd})`,
        };
      }
    }
  }
}

// ── Onglet Offre neuve {ville} ────────────────────────────────────────────────
// Colonnes D-V alimentées par formules depuis Adresse et Data
//
// D=Nom   E=Promoteur   F=Adresse   G=Téléphone
// H=Nb logements   I=Nb disponibles   J=% commer.   K=Livraison
// L/M=T1  N/O=T2  P/Q=T3  R/S=T4  T/U=T5+  V=Prix moyen

const SYNTH_TYPOS: [NeufTypology, number, number][] = [
  ["T1 / Studio", 12, 13],
  ["T2",          14, 15],
  ["T3",          16, 17],
  ["T4",          18, 19],
  ["T5+",         20, 21],
];

interface CityRange {
  city:     string;
  titleRow: number;
  progRows: number[];
  totalRow: number;
}

function buildSynthese(
  wb: ExcelJS.Workbook,
  result: NeufAnalysisResult,
  adresseRowMap: Map<string, number>,
  layout: Partial<Record<NeufTypology, TypoRow>>
) {
  const programs = result.programs;
  const ws = wb.addWorksheet(`Offre neuve ${result.geocodedAddress.city}`);

  // R1 : titre
  ws.getCell(1, 3).value = `Analyse de l'offre neuve — ${result.geocodedAddress.label}`;

  // R5 : en-têtes colonnes
  const HDR: [number, string][] = [
    [4,  "Nom"],
    [5,  "Promoteur"],
    [6,  "Adresse"],
    [7,  "Numéro de telephone"],
    [8,  "Nb de Logements"],
    [9,  "Nb de logements disponible"],
    [10, "% de commercialisation"],
    [11, "Date de livraison"],
    [12, "Superficie\n(T1)"], [13, "Prix/m² T1"],
    [14, "Superficie\n(T2)"], [15, "Prix/m² T2"],
    [16, "Superficie\n(T3)"], [17, "Prix/m² T3"],
    [18, "Superficie\n(T4)"], [19, "Prix/m² T4"],
    [20, "Superficie\n(T5+)"], [21, "Prix/m² T5+"],
    [22, "Prix moyen"],
  ];
  for (const [c, v] of HDR) {
    ws.getCell(5, c).value = v;
    ws.getCell(5, c).alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  }
  ws.getRow(5).height = 40;

  // Villes : principale en premier
  const allCities      = [...new Set(programs.map(p => p.city))];
  const mainCity       = result.geocodedAddress.city;
  const orderedCities  = [mainCity, ...allCities.filter(c => c !== mainCity)];

  const cityRanges: CityRange[] = [];
  let r = 7;

  for (const cityName of orderedCities) {
    const cityProgs = programs.filter(p => p.city === cityName);
    if (cityProgs.length === 0) continue;

    const titleRow = r;
    ws.getCell(r, 4).value = cityName;
    ws.getCell(r, 4).font  = { bold: true };
    r++;

    const progRows: number[] = [];

    for (const prog of cityProgs) {
      const n    = programs.indexOf(prog);
      const adR  = adresseRowMap.get(prog.programId)!;
      const dispo = prog.availableUnitsDetected ?? prog.availableUnits ?? null;

      // D : Nom (formule Adresse)
      ws.getCell(r, 4).value = { formula: `Adresse!B${adR}` };
      // E : Promoteur
      ws.getCell(r, 5).value = prog.developer ?? "";
      // F : Adresse (formule Adresse)
      ws.getCell(r, 6).value = { formula: `Adresse!A${adR}` };
      // G : Téléphone — non disponible dans le modèle de données
      // H : Nb logements
      if (prog.totalUnits != null) ws.getCell(r, 8).value = prog.totalUnits;
      // I : Nb disponibles
      if (dispo != null) ws.getCell(r, 9).value = dispo;
      // J : % commercialisation
      ws.getCell(r, 10).value  = { formula: `IFERROR(1-(I${r}/H${r}),"")` };
      ws.getCell(r, 10).numFmt = "0%";
      // K : Date livraison
      ws.getCell(r, 11).value = prog.deliveryDate ?? prog.commercialStatus ?? "";

      // L–U : surface + prix/m² par typologie (formules → Data)
      for (const [typo, surfC, prixC] of SYNTH_TYPOS) {
        const tl = layout[typo];
        if (!tl) continue;
        if (progLots(prog, typo).length > 0) {
          ws.getCell(r, surfC).value = { formula: `Data!${cl(m2Col(n))}${tl.avgRow}` };
          ws.getCell(r, prixC).value = { formula: `Data!${cl(pm2Col(n))}${tl.avgRow}` };
          ws.getCell(r, prixC).numFmt = '#,##0 "€/m²"';
          ws.getCell(r, surfC).numFmt = '#,##0.# "m²"';
        }
      }

      // V : Prix moyen pondéré (surface × prix/m² par typo)
      ws.getCell(r, 22).value = {
        formula:
          `IFERROR((L${r}*M${r}+N${r}*O${r}+P${r}*Q${r}+R${r}*S${r}+T${r}*U${r})` +
          `/SUM(L${r},N${r},P${r},R${r},T${r}),"")`,
      };
      ws.getCell(r, 22).numFmt = '#,##0 "€/m²"';

      progRows.push(r);
      r++;
    }

    // ── Total ville ─────────────────────────────────────────────────────────
    const totalRow = r;
    const firstPR  = progRows[0];
    const lastPR   = progRows[progRows.length - 1];

    ws.getCell(totalRow, 4).value = `Total ${cityName}`;
    ws.getCell(totalRow, 4).font  = { bold: true };
    ws.getCell(totalRow, 8).value = { formula: `SUM(H${firstPR}:H${lastPR})` };
    ws.getCell(totalRow, 9).value = { formula: `SUM(I${firstPR}:I${lastPR})` };
    ws.getCell(totalRow, 10).value  = { formula: `IFERROR(I${totalRow}/H${totalRow},"")` };
    ws.getCell(totalRow, 10).numFmt = "0%";

    for (const [, surfC, prixC] of SYNTH_TYPOS) {
      ws.getCell(totalRow, surfC).value = {
        formula: `IFERROR(AVERAGE(${cl(surfC)}${titleRow}:${cl(surfC)}${lastPR}),"")`,
      };
      ws.getCell(totalRow, prixC).value = {
        formula: `IFERROR(AVERAGE(${cl(prixC)}${titleRow}:${cl(prixC)}${lastPR}),"")`,
      };
      ws.getCell(totalRow, surfC).numFmt = '#,##0.# "m²"';
      ws.getCell(totalRow, prixC).numFmt = '#,##0 "€/m²"';
    }
    ws.getCell(totalRow, 22).value  = { formula: `IFERROR(AVERAGE(V${titleRow}:V${lastPR}),"")` };
    ws.getCell(totalRow, 22).numFmt = '#,##0 "€/m²"';

    cityRanges.push({ city: cityName, titleRow, progRows, totalRow });
    r += 2; // vide avant prochaine ville
  }

  // ── Total général (si plusieurs villes) ─────────────────────────────────
  if (cityRanges.length > 1) {
    const gtRow  = r;
    const tRefs  = cityRanges.map(cr => cr.totalRow);

    ws.getCell(gtRow, 4).value = "Total";
    ws.getCell(gtRow, 4).font  = { bold: true };
    ws.getCell(gtRow, 8).value = { formula: tRefs.map(tr => `H${tr}`).join("+") };
    ws.getCell(gtRow, 9).value = { formula: tRefs.map(tr => `I${tr}`).join("+") };
    ws.getCell(gtRow, 10).value  = { formula: `IFERROR(I${gtRow}/H${gtRow},"")` };
    ws.getCell(gtRow, 10).numFmt = "0%";

    for (const [, surfC, prixC] of SYNTH_TYPOS) {
      ws.getCell(gtRow, surfC).value = {
        formula: `IFERROR(AVERAGE(${tRefs.map(tr => `${cl(surfC)}${tr}`).join(",")}),"")`,
      };
      ws.getCell(gtRow, prixC).value = {
        formula: `IFERROR(AVERAGE(${tRefs.map(tr => `${cl(prixC)}${tr}`).join(",")}),"")`,
      };
      ws.getCell(gtRow, surfC).numFmt = '#,##0.# "m²"';
      ws.getCell(gtRow, prixC).numFmt = '#,##0 "€/m²"';
    }
    ws.getCell(gtRow, 22).value = {
      formula: `IFERROR(AVERAGE(${tRefs.map(tr => `V${tr}`).join(",")}),"")`,
    };
    ws.getCell(gtRow, 22).numFmt = '#,##0 "€/m²"';

    r += 2;
  }

  // ── Prix moyen global pondéré ────────────────────────────────────────────
  const allProgRows = cityRanges.flatMap(cr => cr.progRows);
  if (allProgRows.length > 0) {
    const fr = Math.min(...allProgRows);
    const lr = Math.max(...allProgRows);

    ws.getCell(r, 11).value = "Prix Moyen";
    ws.getCell(r, 11).font  = { bold: true };
    ws.getCell(r, 12).value = {
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
    ws.getCell(r, 12).numFmt = '#,##0 "€/m²"';
    r += 2;
  }

  // ── Sous-tableaux High / Low par ville ───────────────────────────────────
  for (const cr of cityRanges) {
    ws.getCell(r, 4).value = cr.city;
    ws.getCell(r, 4).font  = { bold: true };
    r++;

    // En-têtes sous-tableau
    const subHdr: [number, string][] = [
      [4, "Typologie"], [6, "High Price"], [7, "Low Price"],
      [8, "Closing price"], [9, "Average"], [10, "Min"],
    ];
    for (const [c, v] of subHdr) ws.getCell(r, c).value = v;
    r++;

    for (const [typo, surfC, prixC] of SYNTH_TYPOS) {
      const pL    = cl(prixC);
      const sL    = cl(surfC);
      const first = cr.progRows[0];
      const last  = cr.progRows[cr.progRows.length - 1];
      const range = `${pL}${first}:${pL}${last}`;

      ws.getCell(r, 4).value  = TYPO_LABEL[typo];
      ws.getCell(r, 6).value  = { formula: `IFERROR(SUMIF(${range},MAX(${range})),"")` };
      ws.getCell(r, 7).value  = { formula: `IFERROR(SUMIF(${range},MIN(${range})),"")` };
      ws.getCell(r, 8).value  = { formula: `IFERROR(${sL}${cr.totalRow},"")` };
      ws.getCell(r, 9).value  = { formula: `IFERROR(${pL}${cr.totalRow},"")` };
      ws.getCell(r, 10).value = { formula: `IFERROR(MIN(${range}),"")` };
      r++;
    }

    r += 2;
  }

  // Largeurs colonnes
  ws.getColumn(4).width  = 32;
  ws.getColumn(5).width  = 22;
  ws.getColumn(6).width  = 40;
  ws.getColumn(7).width  = 18;
  ws.getColumn(8).width  = 14;
  ws.getColumn(9).width  = 16;
  ws.getColumn(10).width = 16;
  ws.getColumn(11).width = 22;
  for (let c = 12; c <= 22; c++) ws.getColumn(c).width = 14;
}

// ── Onglet Sheet1 ─────────────────────────────────────────────────────────────
function buildSheet1(wb: ExcelJS.Workbook, result: NeufAnalysisResult) {
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell(1, 3).value = `Backup ${result.geocodedAddress.city}`;
  ws.getCell(2, 4).value = new Date(result.extractedAt);
}

// ── Export principal ──────────────────────────────────────────────────────────
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

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
