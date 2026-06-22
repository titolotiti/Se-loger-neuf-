import ExcelJS from "exceljs";
import type { NeufAnalysisResult, NeufProgram, NeufListing, NeufTypology } from "@/types/neuf";

// ── Typologies ────────────────────────────────────────────────────────────────
const TYPOLOGIES: NeufTypology[] = ["T1 / Studio", "T2", "T3", "T4", "T5+"];

const TYPO_LETTER: Record<NeufTypology, string> = {
  "T1 / Studio": "a", "T2": "b", "T3": "c", "T4": "d", "T5+": "e",
};

const TYPO_LABEL: Record<NeufTypology, string> = {
  "T1 / Studio": "T1", "T2": "T2", "T3": "T3", "T4": "T4", "T5+": "T5+",
};

// ── Helpers colonnes (1-indexé) ───────────────────────────────────────────────
// Programme n (0-indexé) : idx=6n+2 | m²=6n+4 | prix=6n+5 | prix/m²=6n+6
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

function cleanAddress(value?: unknown): string {
  const s = String(value ?? "").trim();
  // Évite les faux champs du type "4" ou index/ID court utilisés par erreur comme adresse
  if (!s || /^\d{1,3}$/.test(s)) return "";
  return s;
}

function getProgramAddress(prog: NeufProgram): string {
  return (
    cleanAddress(prog.address) ||
    cleanAddress(prog.listings?.find(l => cleanAddress(l.address))?.address) ||
    ""
  );
}

// ── Constantes de style ───────────────────────────────────────────────────────
const C_NAV = "1F3864"; // marine : en-têtes principaux, total général
const C_BLU = "2E75B5"; // bleu   : titres ville, sous-en-têtes Data
const C_TOT = "BDD7EE"; // bleu clair : lignes total ville
const C_AVG = "E2EFDA"; // vert clair : ligne moyenne Data
const C_WHT = "FFFFFF";

// Formats nombres
const FMT_M2  = '0 "m²"';
const FMT_EUR = '#,##0 "€"';
const FMT_PM2 = '#,##0 "€/m²"';
const FMT_PCT = "0%";

type StyleOpts = {
  bg?: string;
  fc?: string;
  bold?: boolean;
  border?: boolean;
  numFmt?: string;
  wrap?: boolean;
  hAlign?: ExcelJS.Alignment["horizontal"];
};

function st(cell: ExcelJS.Cell, o: StyleOpts) {
  if (o.bg)
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + o.bg } };
  if (o.bold !== undefined || o.fc)
    cell.font = { bold: o.bold ?? false, color: o.fc ? { argb: "FF" + o.fc } : undefined };
  if (o.border)
    cell.border = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right:  { style: "thin" },
    };
  if (o.numFmt) cell.numFmt = o.numFmt;
  if (o.wrap || o.hAlign)
    cell.alignment = {
      ...(cell.alignment ?? {}),
      wrapText: o.wrap, horizontal: o.hAlign, vertical: "middle",
    };
}

/**
 * Applique le style à TOUTES les cellules de la plage, y compris les cellules vides.
 * C'est la fonction principale pour éviter les trous visuels.
 */
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

// ── Layout de l'onglet Data ───────────────────────────────────────────────────
// Les 5 typologies sont TOUJOURS présentes, même sans données.
const MIN_ROWS = 1; // au moins 1 ligne de données par bloc

interface TypoRow {
  labelRow:  number;
  headerRow: number;
  dataStart: number;
  dataEnd:   number; // inclus (dataStart + maxRows - 1)
  avgRow:    number;
}

function computeTypoLayout(programs: NeufProgram[]): Record<NeufTypology, TypoRow> {
  const layout = {} as Record<NeufTypology, TypoRow>;
  let row = 6; // lignes 1-5 = zone en-tête

  for (const typo of TYPOLOGIES) {
    const maxRows = Math.max(MIN_ROWS, ...programs.map(p => progLots(p, typo).length));
    layout[typo] = {
      labelRow:  row,
      headerRow: row + 1,
      dataStart: row + 2,
      dataEnd:   row + 2 + maxRows - 1,
      avgRow:    row + 2 + maxRows,
    };
    row += 3 + maxRows + 1; // label + header + données + avg + séparateur vide
  }
  return layout;
}

// ── Onglet Adresse ────────────────────────────────────────────────────────────
function buildAdresse(wb: ExcelJS.Workbook, programs: NeufProgram[]) {
  const ws = wb.addWorksheet("Adresse");

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
      ws.getCell(r, 1).value = getProgramAddress(prog);
      ws.getCell(r, 2).value = prog.programName;
      ws.getCell(r, 3).value = globalIdx++;
      stRange(ws, r, r, 1, 3, { border: true });
      r++;
    }
    r++; // séparateur vide
  }

  ws.getColumn(1).width = 52;
  ws.getColumn(2).width = 32;
  ws.getColumn(3).width = 12;
}

// ── Onglet Data ───────────────────────────────────────────────────────────────
// Les 5 blocs de typologie sont TOUJOURS générés pour chaque programme.
// Les cellules vides ont quand même bordure + fond.
function buildData(
  wb: ExcelJS.Workbook,
  programs: NeufProgram[],
  layout: Record<NeufTypology, TypoRow>
) {
  const ws = wb.addWorksheet("Data");

  ws.getCell(1, 3).value = "Calcul métrique";
  st(ws.getCell(1, 3), { bg: C_NAV, fc: C_WHT, bold: true });

  // R4 : indices et noms des programmes
  for (let n = 0; n < programs.length; n++) {
    ws.getCell(4, idxCol(n)).value = n + 1;
    ws.getCell(4, m2Col(n)).value  = programs[n].programName;
    stRange(ws, 4, 4, idxCol(n), pm2Col(n),
      { bg: C_NAV, fc: C_WHT, bold: true, border: true });
  }

  // 5 blocs typologie — toujours présents
  for (const typo of TYPOLOGIES) {
    const tl = layout[typo];

    for (let n = 0; n < programs.length; n++) {
      const prog  = programs[n];
      const lots  = progLots(prog, typo);
      const cFrom = idxCol(n);
      const cTo   = pm2Col(n);

      // Ligne label (lettre + nom typo)
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

      // Lignes de données : style complet sur toute la plage (même cellules vides)
      stRange(ws, tl.dataStart, tl.dataEnd, cFrom, cTo,
        { border: true, bg: C_WHT });
      // Appliquer les formats sur les colonnes de valeurs
      for (let row = tl.dataStart; row <= tl.dataEnd; row++) {
        st(ws.getCell(row, m2Col(n)),   { numFmt: FMT_M2 });
        st(ws.getCell(row, prixCol(n)), { numFmt: FMT_EUR });
        st(ws.getCell(row, pm2Col(n)),  { numFmt: FMT_PM2 });
      }
      // Remplir avec les données disponibles
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

      // Ligne AVERAGE : toujours présente et stylée
      stRange(ws, tl.avgRow, tl.avgRow, cFrom, cTo,
        { bg: C_AVG, bold: true, border: true });
      st(ws.getCell(tl.avgRow, m2Col(n)),  { numFmt: FMT_M2 });
      st(ws.getCell(tl.avgRow, pm2Col(n)), { numFmt: FMT_PM2 });
      // Formule AVERAGE uniquement si le programme a des lots
      if (lots.length > 0) {
        ws.getCell(tl.avgRow, m2Col(n)).value = {
          formula: `AVERAGE(${cl(m2Col(n))}${tl.dataStart}:${cl(m2Col(n))}${tl.dataEnd})`,
        };
        ws.getCell(tl.avgRow, pm2Col(n)).value = {
          formula: `AVERAGE(${cl(pm2Col(n))}${tl.dataStart}:${cl(pm2Col(n))}${tl.dataEnd})`,
        };
      }
    }
  }

  // Largeurs fixes pour éviter les valeurs coupées dans la matrice Data
  for (let n = 0; n < programs.length; n++) {
    ws.getColumn(idxCol(n)).width = 5;
    ws.getColumn(idxCol(n) + 1).width = 3;
    ws.getColumn(m2Col(n)).width = 12;
    ws.getColumn(prixCol(n)).width = 16;
    ws.getColumn(pm2Col(n)).width = 16;
    ws.getColumn(pm2Col(n) + 1).width = 3;
  }
  ws.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
}

// ── Onglet Offre neuve ────────────────────────────────────────────────────────
// D(4)=Nom  E(5)=Promoteur  F(6)=Adresse  G(7)=Téléphone
// H(8)=Nb log  I(9)=Nb dispo  J(10)=% commer  K(11)=Livraison
// L(12)/M(13)=T1  N(14)/O(15)=T2  P(16)/Q(17)=T3  R(18)/S(19)=T4  T(20)/U(21)=T5+
// V(22)=Prix moyen

const SYNTH_TYPOS: [NeufTypology, number, number][] = [
  ["T1 / Studio", 12, 13],
  ["T2",          14, 15],
  ["T3",          16, 17],
  ["T4",          18, 19],
  ["T5+",         20, 21],
];

const COL_FROM = 4;  // D
const COL_TO   = 22; // V

interface CityRange {
  city:     string;
  progRows: number[];
  totalRow: number;
}

function buildSynthese(
  wb: ExcelJS.Workbook,
  result: NeufAnalysisResult,
  layout: Record<NeufTypology, TypoRow>
) {
  const programs = result.programs;
  const ws = wb.addWorksheet(`Offre neuve ${result.geocodedAddress.city}`);

  // R1 : titre — toute la largeur du tableau
  ws.getCell(1, COL_FROM).value = `Analyse de l'offre neuve — ${result.geocodedAddress.label}`;
  stRange(ws, 1, 1, COL_FROM, COL_TO, { bg: C_NAV, fc: C_WHT, bold: true });

  // R5 : en-têtes colonnes
  const HDR: [number, string][] = [
    [4,  "Nom"],
    [5,  "Promoteur"],
    [6,  "Adresse"],
    [7,  "Téléphone"],
    [8,  "Nb de logements"],
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
  ws.getRow(5).height = 36;
  stRange(ws, 5, 5, COL_FROM, COL_TO,
    { bg: C_NAV, fc: C_WHT, bold: true, border: true, wrap: true, hAlign: "center" });

  // Villes : principale en premier
  const allCities     = [...new Set(programs.map(p => p.city))];
  const mainCity      = result.geocodedAddress.city;
  const orderedCities = [mainCity, ...allCities.filter(c => c !== mainCity)];

  const cityRanges: CityRange[] = [];
  let r = 7;

  for (const cityName of orderedCities) {
    const cityProgs = programs.filter(p => p.city === cityName);
    if (cityProgs.length === 0) continue;

    // Ligne titre ville — plage complète D-V
    ws.getCell(r, COL_FROM).value = cityName;
    stRange(ws, r, r, COL_FROM, COL_TO,
      { bg: C_BLU, fc: C_WHT, bold: true, border: true });
    r++;

    const progRows: number[] = [];

    for (const prog of cityProgs) {
      const n     = programs.indexOf(prog);
      const dispo = prog.availableUnitsDetected ?? prog.availableUnits ?? null;
      const total = prog.totalUnits ?? null;

      // Style complet D-V en premier (toutes cellules, même vides)
      stRange(ws, r, r, COL_FROM, COL_TO, { border: true, bg: C_WHT });

      // D : Nom (valeur directe — évite les problèmes de formules cross-sheet)
      ws.getCell(r, 4).value  = prog.programName;
      // E : Promoteur
      ws.getCell(r, 5).value  = prog.developer ?? "";
      // F : Adresse
      ws.getCell(r, 6).value  = getProgramAddress(prog);
      // G : Téléphone — non disponible dans le modèle de données
      // H : Nb logements (seulement si cohérent)
      if (total != null && total > 0) ws.getCell(r, 8).value = total;
      // I : Nb disponibles
      if (dispo != null && dispo >= 0) ws.getCell(r, 9).value = dispo;
      // J : % commercialisation (1 - disponibles/total)
      if (total != null && total > 0) {
        ws.getCell(r, 10).value = { formula: `IFERROR(1-(I${r}/H${r}),"")` };
        st(ws.getCell(r, 10), { numFmt: FMT_PCT });
      }
      // K : Date livraison
      ws.getCell(r, 11).value = prog.deliveryDate ?? prog.commercialStatus ?? "";

      // L-U : surface + prix/m² par typologie (formules → Data avgRow)
      for (const [typo, surfC, prixC] of SYNTH_TYPOS) {
        const tl = layout[typo];
        if (progLots(prog, typo).length > 0) {
          ws.getCell(r, surfC).value = { formula: `Data!${cl(m2Col(n))}${tl.avgRow}` };
          ws.getCell(r, prixC).value = { formula: `Data!${cl(pm2Col(n))}${tl.avgRow}` };
          st(ws.getCell(r, surfC), { numFmt: FMT_M2 });
          st(ws.getCell(r, prixC), { numFmt: FMT_PM2 });
        }
      }

      // V : Prix moyen pondéré (surface × prix/m² par typo)
      ws.getCell(r, 22).value = {
        formula:
          `IFERROR((L${r}*M${r}+N${r}*O${r}+P${r}*Q${r}+R${r}*S${r}+T${r}*U${r})` +
          `/SUM(L${r},N${r},P${r},R${r},T${r}),"")`,
      };
      st(ws.getCell(r, 22), { numFmt: FMT_PM2 });

      progRows.push(r);
      r++;
    }

    // Ligne Total ville — plage complète D-V
    const totalRow = r;
    const firstPR  = progRows[0];
    const lastPR   = progRows[progRows.length - 1];

    stRange(ws, totalRow, totalRow, COL_FROM, COL_TO,
      { bg: C_TOT, bold: true, border: true });

    ws.getCell(totalRow, 4).value  = `Total ${cityName}`;
    ws.getCell(totalRow, 8).value  = { formula: `SUM(H${firstPR}:H${lastPR})` };
    ws.getCell(totalRow, 9).value  = { formula: `SUM(I${firstPR}:I${lastPR})` };
    ws.getCell(totalRow, 10).value = {
      formula: `IFERROR(1-(I${totalRow}/H${totalRow}),"")`,
    };
    st(ws.getCell(totalRow, 10), { numFmt: FMT_PCT });

    for (const [, surfC, prixC] of SYNTH_TYPOS) {
      ws.getCell(totalRow, surfC).value = {
        formula: `IFERROR(AVERAGE(${cl(surfC)}${firstPR}:${cl(surfC)}${lastPR}),"")`,
      };
      ws.getCell(totalRow, prixC).value = {
        formula: `IFERROR(AVERAGE(${cl(prixC)}${firstPR}:${cl(prixC)}${lastPR}),"")`,
      };
      st(ws.getCell(totalRow, surfC), { numFmt: FMT_M2 });
      st(ws.getCell(totalRow, prixC), { numFmt: FMT_PM2 });
    }
    ws.getCell(totalRow, 22).value = {
      formula: `IFERROR(AVERAGE(V${firstPR}:V${lastPR}),"")`,
    };
    st(ws.getCell(totalRow, 22), { numFmt: FMT_PM2 });

    cityRanges.push({ city: cityName, progRows, totalRow });
    r += 2; // ligne vide avant prochaine ville
  }

  // Total général (plusieurs villes) — plage complète D-V
  if (cityRanges.length > 1) {
    const gtRow = r;
    const tRefs = cityRanges.map(cr => cr.totalRow);

    stRange(ws, gtRow, gtRow, COL_FROM, COL_TO,
      { bg: C_NAV, fc: C_WHT, bold: true, border: true });

    ws.getCell(gtRow, 4).value  = "Total général";
    ws.getCell(gtRow, 8).value  = { formula: tRefs.map(tr => `H${tr}`).join("+") };
    ws.getCell(gtRow, 9).value  = { formula: tRefs.map(tr => `I${tr}`).join("+") };
    ws.getCell(gtRow, 10).value = { formula: `IFERROR(1-(I${gtRow}/H${gtRow}),"")` };
    st(ws.getCell(gtRow, 10), { numFmt: FMT_PCT });

    for (const [, surfC, prixC] of SYNTH_TYPOS) {
      ws.getCell(gtRow, surfC).value = {
        formula: `IFERROR(AVERAGE(${tRefs.map(tr => `${cl(surfC)}${tr}`).join(",")}),"")`,
      };
      ws.getCell(gtRow, prixC).value = {
        formula: `IFERROR(AVERAGE(${tRefs.map(tr => `${cl(prixC)}${tr}`).join(",")}),"")`,
      };
      st(ws.getCell(gtRow, surfC), { numFmt: FMT_M2 });
      st(ws.getCell(gtRow, prixC), { numFmt: FMT_PM2 });
    }
    ws.getCell(gtRow, 22).value = {
      formula: `IFERROR(AVERAGE(${tRefs.map(tr => `V${tr}`).join(",")}),"")`,
    };
    st(ws.getCell(gtRow, 22), { numFmt: FMT_PM2 });

    r += 2;
  }

  // Prix moyen global pondéré
  const allProgRows = cityRanges.flatMap(cr => cr.progRows);
  if (allProgRows.length > 0) {
    const fr = Math.min(...allProgRows);
    const lr = Math.max(...allProgRows);
    ws.getCell(r, 4).value = "Prix Moyen Global";
    st(ws.getCell(r, 4), { bold: true });
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
    st(ws.getCell(r, 5), { numFmt: FMT_PM2 });
    r += 2;
  }

  // Sous-tableaux High / Low par ville — générés complets ou pas du tout
  for (const cr of cityRanges) {
    const first = cr.progRows[0];
    const last  = cr.progRows[cr.progRows.length - 1];

    // Titre ville
    ws.getCell(r, 4).value = cr.city;
    stRange(ws, r, r, 4, 10, { bg: C_BLU, fc: C_WHT, bold: true, border: true });
    r++;

    // En-têtes
    const subHdr: [number, string][] = [
      [4, "Typologie"], [5, ""], [6, "High Price"], [7, "Low Price"],
      [8, "Closing price"], [9, "Average"], [10, "Min"],
    ];
    for (const [c, v] of subHdr) ws.getCell(r, c).value = v;
    stRange(ws, r, r, 4, 10, { bg: C_NAV, fc: C_WHT, bold: true, border: true });
    r++;

    // 5 typologies — toujours toutes présentes, même si vides
    for (const [typo, surfC, prixC] of SYNTH_TYPOS) {
      const pL    = cl(prixC);
      const sL    = cl(surfC);
      const range = `${pL}${first}:${pL}${last}`;

      ws.getCell(r, 4).value  = TYPO_LABEL[typo];
      ws.getCell(r, 6).value  = { formula: `IFERROR(MAX(${range}),"")` };
      ws.getCell(r, 7).value  = { formula: `IFERROR(MIN(IF(${range}<>0,${range})),"")` };
      ws.getCell(r, 8).value  = { formula: `IFERROR(${sL}${cr.totalRow},"")` };
      ws.getCell(r, 9).value  = { formula: `IFERROR(${pL}${cr.totalRow},"")` };
      ws.getCell(r, 10).value = { formula: `IFERROR(MIN(IF(${range}<>0,${range})),"")` };
      stRange(ws, r, r, 4, 10, { border: true, bg: C_WHT });
      for (const c of [6, 7, 9, 10]) st(ws.getCell(r, c), { numFmt: FMT_PM2 });
      st(ws.getCell(r, 8), { numFmt: FMT_M2 });
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
  ws.getColumn(9).width  = 14;
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
  wb.calcProperties.fullCalcOnLoad = true;

  const programs   = result.programs;
  const typoLayout = computeTypoLayout(programs);

  // Ordre des onglets : Adresse → Offre neuve → Data → Sheet1
  buildAdresse(wb, programs);
  buildSynthese(wb, result, typoLayout);
  buildData(wb, programs, typoLayout);
  buildSheet1(wb, result);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
