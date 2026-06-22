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

// ── Constantes de style ───────────────────────────────────────────────────────
const C_NAV = "1F3864";   // marine foncé : en-têtes principaux, total général
const C_BLU = "2E75B5";   // bleu moyen  : titres ville, sous-en-têtes Data
const C_TOT = "BDD7EE";   // bleu clair  : lignes total ville
const C_AVG = "E2EFDA";   // vert clair  : ligne moyenne Data
const C_WHT = "FFFFFF";

type StyleOpts = {
  bg?:     string;
  fc?:     string;
  bold?:   boolean;
  border?: boolean;
  numFmt?: string;
  wrap?:   boolean;
  hAlign?: ExcelJS.Alignment["horizontal"];
};

function st(cell: ExcelJS.Cell, o: StyleOpts) {
  if (o.bg)
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + o.bg } };
  if (o.bold !== undefined || o.fc)
    cell.font = { bold: o.bold ?? false, color: o.fc ? { argb: "FF" + o.fc } : undefined };
  if (o.border)
    cell.border = {
      top:    { style: "thin" }, bottom: { style: "thin" },
      left:   { style: "thin" }, right:  { style: "thin" },
    };
  if (o.numFmt) cell.numFmt = o.numFmt;
  if (o.wrap || o.hAlign)
    cell.alignment = {
      ...(cell.alignment ?? {}),
      wrapText:   o.wrap,
      horizontal: o.hAlign,
      vertical:   "middle",
    };
}

function stRange(
  ws: ExcelJS.Worksheet,
  r1: number, r2: number,
  c1: number, c2: number,
  o: StyleOpts
) {
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      st(ws.getCell(r, c), o);
}

// ── Layout lignes de l'onglet Data ───────────────────────────────────────────
interface TypoRow {
  labelRow:  number;
  headerRow: number;
  dataStart: number;
  avgRow:    number;
}

function computeTypoLayout(
  programs: NeufProgram[]
): Partial<Record<NeufTypology, TypoRow>> {
  const layout: Partial<Record<NeufTypology, TypoRow>> = {};
  let row = 6;

  for (const typo of TYPOLOGIES) {
    const maxLots = Math.max(0, ...programs.map(p => progLots(p, typo).length));
    if (maxLots === 0) continue;
    layout[typo] = {
      labelRow:  row,
      headerRow: row + 1,
      dataStart: row + 2,
      avgRow:    row + 2 + maxLots,
    };
    row += 3 + maxLots + 1;
  }
  return layout;
}

// ── Onglet Adresse ────────────────────────────────────────────────────────────
function buildAdresse(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[]
): Map<string, number> {
  const ws = wb.addWorksheet("Adresse");
  const rowMap = new Map<string, number>();

  ws.getCell(1, 1).value = "Adresse";
  ws.getCell(1, 2).value = "Nom";
  ws.getCell(1, 3).value = "Type";
  stRange(ws, 1, 1, 1, 3, { bg: C_NAV, fc: C_WHT, bold: true, border: true });

  const cities = [...new Set(programs.map(p => p.city))];
  let globalIdx = 1;
  let r = 2;

  for (const city of cities) {
    const cityProgs = programs.filter(p => p.city === city);

    ws.getCell(r, 1).value = city;
    stRange(ws, r, r, 1, 3, { bg: C_BLU, fc: C_WHT, bold: true, border: true });
    r++;

    for (const prog of cityProgs) {
      ws.getCell(r, 1).value = prog.address ?? "";
      ws.getCell(r, 2).value = prog.programName;
      ws.getCell(r, 3).value = globalIdx++;
      rowMap.set(prog.programId, r);
      stRange(ws, r, r, 1, 3, { border: true });
      r++;
    }

    r++;
  }

  ws.getColumn(1).width = 52;
  ws.getColumn(2).width = 32;
  ws.getColumn(3).width = 8;

  return rowMap;
}

// ── Onglet Data (matrice horizontale) ─────────────────────────────────────────
function buildData(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[],
  layout: Partial<Record<NeufTypology, TypoRow>>
) {
  const ws = wb.addWorksheet("Data");

  ws.getCell(1, 3).value = "Calcul métrique";
  st(ws.getCell(1, 3), { bg: C_NAV, fc: C_WHT, bold: true });

  // R4 : indices et noms des programmes
  for (let n = 0; n < programs.length; n++) {
    ws.getCell(4, idxCol(n)).value = n + 1;
    ws.getCell(4, m2Col(n)).value  = programs[n].programName;
    stRange(ws, 4, 4, idxCol(n), pm2Col(n), { bg: C_NAV, fc: C_WHT, bold: true, border: true });
  }

  // Blocs par typologie
  for (const typo of TYPOLOGIES) {
    const tl = layout[typo];
    if (!tl) continue;

    for (let n = 0; n < programs.length; n++) {
      const prog  = programs[n];
      const lots  = progLots(prog, typo);
      const cFrom = idxCol(n);
      const cTo   = pm2Col(n);

      // Ligne label
      ws.getCell(tl.labelRow, idxCol(n)).value = TYPO_LETTER[typo];
      ws.getCell(tl.labelRow, m2Col(n)).value  = TYPO_LABEL[typo];
      stRange(ws, tl.labelRow, tl.labelRow, cFrom, cTo,
        { bg: C_NAV, fc: C_WHT, bold: true, border: true });

      // Ligne en-têtes colonnes
      ws.getCell(tl.headerRow, m2Col(n)).value  = "m²";
      ws.getCell(tl.headerRow, prixCol(n)).value = "prix";
      ws.getCell(tl.headerRow, pm2Col(n)).value  = "prix/m²";
      stRange(ws, tl.headerRow, tl.headerRow, cFrom, cTo,
        { bg: C_BLU, fc: C_WHT, bold: true, border: true });

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

        stRange(ws, row, row, cFrom, cTo, { border: true, bg: C_WHT });
        st(ws.getCell(row, m2Col(n)),   { numFmt: '#,##0.# "m²"' });
        st(ws.getCell(row, prixCol(n)), { numFmt: '#,##0 "€"' });
        st(ws.getCell(row, pm2Col(n)),  { numFmt: '#,##0 "€/m²"' });
      }

      // Ligne AVERAGE
      if (lots.length > 0) {
        const dataEnd = tl.dataStart + lots.length - 1;
        ws.getCell(tl.avgRow, m2Col(n)).value = {
          formula: `AVERAGE(${cl(m2Col(n))}${tl.dataStart}:${cl(m2Col(n))}${dataEnd})`,
        };
        ws.getCell(tl.avgRow, pm2Col(n)).value = {
          formula: `AVERAGE(${cl(pm2Col(n))}${tl.dataStart}:${cl(pm2Col(n))}${dataEnd})`,
        };
      }
      stRange(ws, tl.avgRow, tl.avgRow, cFrom, cTo,
        { bg: C_AVG, bold: true, border: true });
      st(ws.getCell(tl.avgRow, m2Col(n)),  { numFmt: '#,##0.# "m²"' });
      st(ws.getCell(tl.avgRow, pm2Col(n)), { numFmt: '#,##0 "€/m²"' });
    }
  }
}

// ── Onglet Offre neuve {ville} ────────────────────────────────────────────────
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
  stRange(ws, 1, 1, 3, 22, { bg: C_NAV, fc: C_WHT, bold: true });

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
  stRange(ws, 5, 5, 4, 22, { bg: C_NAV, fc: C_WHT, bold: true, border: true });

  // Villes : principale en premier
  const allCities     = [...new Set(programs.map(p => p.city))];
  const mainCity      = result.geocodedAddress.city;
  const orderedCities = [mainCity, ...allCities.filter(c => c !== mainCity)];

  const cityRanges: CityRange[] = [];
  let r = 7;

  for (const cityName of orderedCities) {
    const cityProgs = programs.filter(p => p.city === cityName);
    if (cityProgs.length === 0) continue;

    const titleRow = r;
    ws.getCell(r, 4).value = cityName;
    stRange(ws, r, r, 4, 22, { bg: C_BLU, fc: C_WHT, bold: true, border: true });
    r++;

    const progRows: number[] = [];

    for (const prog of cityProgs) {
      const n     = programs.indexOf(prog);
      const adR   = adresseRowMap.get(prog.programId)!;
      const dispo = prog.availableUnitsDetected ?? prog.availableUnits ?? null;

      ws.getCell(r, 4).value = { formula: `Adresse!B${adR}` };
      ws.getCell(r, 5).value = prog.developer ?? "";
      ws.getCell(r, 6).value = { formula: `Adresse!A${adR}` };
      if (prog.totalUnits != null) ws.getCell(r, 8).value = prog.totalUnits;
      if (dispo != null)           ws.getCell(r, 9).value = dispo;
      ws.getCell(r, 10).value  = { formula: `IFERROR(1-(I${r}/H${r}),"")` };
      ws.getCell(r, 10).numFmt = "0%";
      ws.getCell(r, 11).value  = prog.deliveryDate ?? prog.commercialStatus ?? "";

      for (const [typo, surfC, prixC] of SYNTH_TYPOS) {
        const tl = layout[typo];
        if (!tl) continue;
        if (progLots(prog, typo).length > 0) {
          ws.getCell(r, surfC).value  = { formula: `Data!${cl(m2Col(n))}${tl.avgRow}` };
          ws.getCell(r, prixC).value  = { formula: `Data!${cl(pm2Col(n))}${tl.avgRow}` };
          ws.getCell(r, surfC).numFmt = '#,##0.# "m²"';
          ws.getCell(r, prixC).numFmt = '#,##0 "€/m²"';
        }
      }

      ws.getCell(r, 22).value = {
        formula:
          `IFERROR((L${r}*M${r}+N${r}*O${r}+P${r}*Q${r}+R${r}*S${r}+T${r}*U${r})` +
          `/SUM(L${r},N${r},P${r},R${r},T${r}),"")`,
      };
      ws.getCell(r, 22).numFmt = '#,##0 "€/m²"';

      // Bordures + fond blanc sur toute la ligne D-V (pas de trous visuels)
      stRange(ws, r, r, 4, 22, { border: true, bg: C_WHT });

      progRows.push(r);
      r++;
    }

    // ── Total ville ─────────────────────────────────────────────────────────
    const totalRow = r;
    const firstPR  = progRows[0];
    const lastPR   = progRows[progRows.length - 1];

    ws.getCell(totalRow, 4).value = `Total ${cityName}`;
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

    stRange(ws, totalRow, totalRow, 4, 22, { bg: C_TOT, bold: true, border: true });

    cityRanges.push({ city: cityName, titleRow, progRows, totalRow });
    r += 2;
  }

  // ── Total général (si plusieurs villes) ─────────────────────────────────
  if (cityRanges.length > 1) {
    const gtRow = r;
    const tRefs = cityRanges.map(cr => cr.totalRow);

    ws.getCell(gtRow, 4).value = "Total";
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

    stRange(ws, gtRow, gtRow, 4, 22, { bg: C_NAV, fc: C_WHT, bold: true, border: true });

    r += 2;
  }

  // ── Prix moyen global pondéré ────────────────────────────────────────────
  const allProgRows = cityRanges.flatMap(cr => cr.progRows);
  if (allProgRows.length > 0) {
    const fr = Math.min(...allProgRows);
    const lr = Math.max(...allProgRows);

    ws.getCell(r, 11).value = "Prix Moyen";
    st(ws.getCell(r, 11), { bold: true });
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
    stRange(ws, r, r, 4, 10, { bg: C_BLU, fc: C_WHT, bold: true, border: true });
    r++;

    const subHdr: [number, string][] = [
      [4, "Typologie"], [6, "High Price"], [7, "Low Price"],
      [8, "Closing price"], [9, "Average"], [10, "Min"],
    ];
    for (const [c, v] of subHdr) ws.getCell(r, c).value = v;
    stRange(ws, r, r, 4, 10, { bg: C_NAV, fc: C_WHT, bold: true, border: true });
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
      stRange(ws, r, r, 4, 10, { border: true, bg: C_WHT });
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
