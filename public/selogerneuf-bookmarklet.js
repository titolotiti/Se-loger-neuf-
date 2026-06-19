/**
 * SeLoger Neuf — Extracteur de lots
 * Version : v3-fixed-parsing
 *
 * Instructions :
 *   1. Ouvrir la page d'un programme SeLoger Neuf dans le navigateur
 *   2. Ouvrir la console (F12 → Console)
 *   3. Coller ce script et appuyer sur Entrée
 *   4. Copier le JSON et le coller dans l'outil (bouton "Importer les lots")
 */

const BOOKMARKLET_VERSION = "v3-fixed-parsing";

(async function extractSeLogerNeufLots() {
  'use strict';

  if (!window.location.href.includes('selogerneuf.com')) {
    alert('[' + BOOKMARKLET_VERSION + '] ⚠️ Exécuter sur SeLoger Neuf.\n' + window.location.href);
    return;
  }

  console.log('[SLN ' + BOOKMARKLET_VERSION + '] Démarrage :', window.location.href);

  // ════════════════════════════════════════════════════════════════
  // Utilitaires
  // ════════════════════════════════════════════════════════════════

  // Normaliser les espaces insécables AVANT tout traitement
  // (  = no-break space,   = narrow no-break space,   = thin space…)
  function normalizeText(text) {
    return text
      .replace(/[    ⁠​﻿]/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  // Après normalisation, les séparateurs milliers sont des espaces ordinaires
  // "556 000" → strip non-digits → "556000" → 556000
  function parseNum(v) {
    if (v == null) return null;
    const s = String(v).replace(/[^\d,]/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) && n > 0 ? n : null;
  }

  function normalizeTypo(raw) {
    if (!raw) return null;
    const s = String(raw).toLowerCase();
    if (/studio/.test(s) || /1\s*pi[eè]ce\b/.test(s) || /\bt1\b/.test(s)) return 'T1 / Studio';
    if (/2\s*pi[eè]ces?/.test(s) || /\bt2\b/.test(s)) return 'T2';
    if (/3\s*pi[eè]ces?/.test(s) || /\bt3\b/.test(s)) return 'T3';
    if (/4\s*pi[eè]ces?/.test(s) || /\bt4\b/.test(s)) return 'T4';
    if (/[5-9]\s*pi[eè]ces?/.test(s) || /t[5-9]/.test(s)) return 'T5+';
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  // Résultat
  // ════════════════════════════════════════════════════════════════

  const result = {
    bookmarkletVersion: BOOKMARKLET_VERSION,
    programName: '(inconnu)',
    pageUrl: window.location.href,
    totalUnits: null,
    availableUnits: null,
    bodyTextSample: '',
    rawTypologyBlocks: [],
    lots: [],
  };

  // ── Lire et normaliser le texte de la page ─────────────────────────────────
  const bt = normalizeText(document.body.innerText || '');

  // ── programName et totalUnits depuis le texte ──────────────────────────────
  const progM = bt.match(/Programme\s+(.+?)\s+contient\s+(\d+)\s+logements/i);
  if (progM) {
    result.programName = progM[1].trim();
    result.totalUnits  = parseInt(progM[2], 10);
  } else {
    // Fallback : titre de la page (avant le premier | ou -)
    const titleRaw = normalizeText(document.title || '');
    const parts    = titleRaw.split(/\s*[\|\-–]\s*/);
    const best     = parts.find(p => p.trim() && !/^detail$/i.test(p.trim()));
    if (best) result.programName = best.trim();
  }

  // ── Délimiteurs de section ─────────────────────────────────────────────────
  // On extrait uniquement le texte entre "Logements disponibles" et la fin de section
  const SECTION_START = /logements?\s+disponibles?/i;
  const SECTION_END   = [
    /certifications?\s+et\s+labels?\s+qualit/i,
    /Le\s+programme\b/,
    /informations?\s+compl[eé]mentaires?/i,
  ];

  function extractSection(text) {
    const startIdx = text.search(SECTION_START);
    let section = startIdx >= 0 ? text.slice(startIdx) : text;
    for (const ep of SECTION_END) {
      const eIdx = section.search(ep);
      if (eIdx > 300) { section = section.slice(0, eIdx); break; }
    }
    return { section, startIdx };
  }

  // ── Stratégie 1 : __NEXT_DATA__ ───────────────────────────────────────────
  // Utilisée seulement si les lots ont des données surface ET prix (pas juste des noms)
  const nextEl = document.getElementById('__NEXT_DATA__');
  if (nextEl) {
    try {
      const nd        = JSON.parse(nextEl.textContent || '{}');
      const ndResult  = extractFromNextData(nd);
      const hasReal   = ndResult.lots.some(l => l.surfaceM2 && l.priceEur);
      if (hasReal) {
        result.lots = ndResult.lots;
        if (ndResult.programName && !/^detail$/i.test(ndResult.programName)) {
          result.programName = ndResult.programName;
        }
        if (ndResult.totalUnits) result.totalUnits = ndResult.totalUnits;
        console.log('[SLN] ✓ __NEXT_DATA__ avec surface+prix —', result.lots.length, 'lot(s)');
      } else {
        console.log('[SLN] __NEXT_DATA__ sans surface/prix — stratégie DOM');
      }
    } catch(e) {
      console.warn('[SLN] __NEXT_DATA__ erreur :', e.message);
    }
  }

  // ── Stratégie 2 : DOM / innerText ─────────────────────────────────────────
  if (result.lots.length === 0) {
    // bodyTextSample depuis le texte AVANT expansion (pour diagnostic)
    const { section: sec0, startIdx: si0 } = extractSection(bt);
    result.bodyTextSample = si0 >= 0
      ? bt.slice(Math.max(0, si0 - 30), si0 + 1500)
      : bt.slice(0, 1500);

    console.log('[SLN] Expansion accordéons...');
    const nbClicked = await expandAccordions();
    console.log('[SLN]', nbClicked, 'clics — attente 2 s...');
    await delay(2000);

    // Re-lire le texte APRÈS expansion
    const bt2 = normalizeText(document.body.innerText || '');
    const { section: sec2, startIdx: si2 } = extractSection(bt2);

    // Mettre à jour le bodyTextSample avec le texte après expansion
    result.bodyTextSample = si2 >= 0
      ? bt2.slice(Math.max(0, si2 - 30), si2 + 1500)
      : bt2.slice(0, 1500);

    const domResult = extractFromSection(sec2);
    result.rawTypologyBlocks = domResult.rawTypologyBlocks;
    result.lots              = domResult.lots;
    if (!result.totalUnits && domResult.totalUnits) result.totalUnits = domResult.totalUnits;

    if (result.lots.length > 0) {
      console.log('[SLN] ✓ DOM —', result.lots.length, 'lot(s)');
    } else {
      console.warn('[SLN] ✗ DOM — aucun lot. Voir bodyTextSample dans le JSON.');
    }
  } else {
    // Stratégie 1 réussie — capturer bodyTextSample quand même
    const { section: sec0, startIdx: si0 } = extractSection(bt);
    result.bodyTextSample = si0 >= 0
      ? bt.slice(Math.max(0, si0 - 30), si0 + 1500)
      : bt.slice(0, 1500);
  }

  if (!result.availableUnits) {
    result.availableUnits = result.lots.reduce((s, l) => s + (l.availableCount || 0), 0);
  }

  const json = JSON.stringify(result, null, 2);
  console.log('[SLN] Résultat :', result);

  // ── Alerte + presse-papiers ────────────────────────────────────────────────
  const lotCount = result.lots.length;
  const alertMsg =
    (lotCount > 0 ? '✅' : '⚠️') + ' [' + BOOKMARKLET_VERSION + '] ' +
    lotCount + ' lot(s) — « ' + result.programName + ' »\n\n' +
    (lotCount > 0
      ? 'JSON copié dans le presse-papiers.\nCollez dans l\'outil → "Importer les lots".'
      : 'Aucun lot détecté. Collez le JSON — le diagnostic est inclus.');

  try {
    await navigator.clipboard.writeText(json);
    alert(alertMsg);
  } catch {
    showTextarea(json);
    alert(alertMsg);
  }

  // ════════════════════════════════════════════════════════════════
  // Extraction par blocs de typologies
  // ════════════════════════════════════════════════════════════════

  // Patterns de headers EN MAJUSCULES (sans flag i pour forcer les caps)
  // SeLoger Neuf affiche les titres de volets en MAJUSCULES.
  // Les répétitions intérieures sont en Title Case → exclues par la règle [a-z].
  const TYPO_HEADERS = [
    { re: /^STUDIO$/,                          typo: 'T1 / Studio' },
    { re: /^APPARTEMENT\s+1\s*PI[EÈ]CE?$/,     typo: 'T1 / Studio' },
    { re: /^APPARTEMENT\s+2\s*PI[EÈ]CES?$/,    typo: 'T2' },
    { re: /^APPARTEMENT\s+3\s*PI[EÈ]CES?$/,    typo: 'T3' },
    { re: /^APPARTEMENT\s+4\s*PI[EÈ]CES?$/,    typo: 'T4' },
    { re: /^APPARTEMENT\s+5\s*PI[EÈ]CES?$/,    typo: 'T5+' },
    { re: /^APPARTEMENT\s+6\s*PI[EÈ]CES?$/,    typo: 'T5+' },
    { re: /^APPARTEMENT\s+7\s*PI[EÈ]CES?$/,    typo: 'T5+' },
    { re: /^MAISON\s+\d+\s*PI[EÈ]CES?$/,       typo: null }, // normalizeTypo
  ];

  function matchTypoHeader(line) {
    const t = line.trim();
    if (!t || t.length > 80) return null;
    // Règle clé : exclure les lignes avec des minuscules ASCII (répétitions title-case)
    if (/[a-z]/.test(t)) return null;
    for (const h of TYPO_HEADERS) {
      if (h.re.test(t)) return { rawTypo: t, typo: h.typo || normalizeTypo(t) };
    }
    return null;
  }

  function extractFromSection(sectionText) {
    const r = { lots: [], totalUnits: null, rawTypologyBlocks: [] };
    const lines = sectionText.split('\n');

    // Identifier les headers
    const headerPositions = [];
    for (let i = 0; i < lines.length; i++) {
      const m = matchTypoHeader(lines[i]);
      if (m) headerPositions.push({ ...m, lineIndex: i });
    }

    console.log('[SLN] Headers ALL CAPS :', headerPositions.map(h => '"' + h.rawTypo + '"'));

    for (let hi = 0; hi < headerPositions.length; hi++) {
      const start      = headerPositions[hi].lineIndex;
      const end        = hi + 1 < headerPositions.length
        ? headerPositions[hi + 1].lineIndex
        : Math.min(start + 80, lines.length);

      const blockLines = lines.slice(start, end);
      const blockText  = blockLines.join('\n').trim();
      const rawTypo    = headerPositions[hi].rawTypo;
      const typo       = headerPositions[hi].typo;
      const warnings   = [];

      // ── Surface : "37 m²" ───────────────────────────────────────────────
      const surfM   = blockText.match(/(\d+(?:[,.]\d+)?)\s*m[²2]/);
      const surface = surfM ? parseNum(surfM[1]) : null;
      if (!surface) warnings.push('Surface non trouvée (cherché : X m²)');

      // ── Prix/m² : "Soit 15 158 €/m²" ────────────────────────────────────
      const pm2M        = blockText.match(/Soit\s+([\d ]+\d)\s*€\s*\/\s*m[²2]/i);
      const pricePerM2  = pm2M ? parseNum(pm2M[1]) : null;
      if (!pricePerM2) warnings.push('Prix/m² non trouvé via "Soit X €/m²"');

      // ── Prix total ────────────────────────────────────────────────────────
      // Collecter tous les montants en € (hors €/m²) et prendre le premier > 100 000
      // Regex : séquence de chiffres + espaces commençant par un chiffre, suivie de "€"
      let price = null;
      const euroRe = /([\d][\d ]*\d|[\d])\s*€/g;
      let em;
      while ((em = euroRe.exec(blockText)) !== null) {
        // Ignorer si suivi de / (prix/m²)
        const after = blockText.slice(em.index + em[0].length, em.index + em[0].length + 5);
        if (/^\s*\//.test(after)) continue;
        const v = parseNum(em[1]);
        if (v && v > 100000) { price = v; break; }
      }
      if (!price) warnings.push('Prix non trouvé (cherché : montant > 100 000 € hors /m²)');

      // ── Prix/m² calculé si non lu ─────────────────────────────────────────
      const finalPm2 = pricePerM2 ?? (price && surface ? Math.round(price / surface) : null);
      if (!pricePerM2 && finalPm2) warnings.push('Prix/m² calculé (non lu directement)');

      // ── Nb disponibles : "1 bien" ─────────────────────────────────────────
      const countM = blockText.match(/(\d+)\s*biens?/i)
                  || blockText.match(/(\d+)\s*logements?\s*disponibles?/i)
                  || blockText.match(/disponibles?\s*:\s*(\d+)/i);
      const count  = countM ? parseInt(countM[1], 10) : 1;
      if (!countM) warnings.push('Nb biens non trouvé, défaut = 1');

      const debug = {
        rawTypology: rawTypo,
        rawBlockText: blockText,
        parsedSurface: surface,
        parsedPrice: price,
        parsedPricePerM2: finalPm2,
        parsedAvailableCount: count,
        parsingWarnings: warnings,
      };

      r.rawTypologyBlocks.push(debug);
      r.lots.push({
        typology: typo,
        rawTypology: rawTypo,
        surfaceM2: surface,
        priceEur: price,
        pricePerM2: finalPm2,
        availableCount: count,
        debug: debug,
      });
    }

    return r;
  }

  // ════════════════════════════════════════════════════════════════
  // Expansion des accordéons
  // ════════════════════════════════════════════════════════════════

  async function expandAccordions() {
    let clicked = 0;
    const seen = new Set();

    for (let pass = 0; pass < 3; pass++) {
      let foundNew = false;

      document.querySelectorAll('[aria-expanded="false"]').forEach(el => {
        if (seen.has(el)) return;
        seen.add(el); el.click(); clicked++; foundNew = true;
      });

      const extraSels = [
        'button[class*="accordion"]', 'button[class*="Accordion"]',
        'button[class*="typology"]',  'button[class*="Typology"]',
        'button[class*="TypeCard"]',  'button[class*="lot"]',
        '[data-testid*="accordion"]', '[data-testid*="typology"]',
      ];
      for (const sel of extraSels) {
        try {
          document.querySelectorAll(sel).forEach(el => {
            if (seen.has(el) || el.getAttribute('aria-expanded') === 'true') return;
            seen.add(el); el.click(); clicked++; foundNew = true;
          });
        } catch(e) {}
      }

      if (!foundNew) break;
      await delay(600);
    }

    return clicked;
  }

  // ════════════════════════════════════════════════════════════════
  // __NEXT_DATA__
  // ════════════════════════════════════════════════════════════════

  function extractFromNextData(nd) {
    const r = { lots: [], programName: null, totalUnits: null };
    try {
      const pp = nd && nd.props && nd.props.pageProps;
      if (pp) r.programName = pp.programName || pp.name || pp.title ||
        (pp.program && (pp.program.name || pp.program.title)) || null;
    } catch(e) {}
    const lotsArr = findLotsArray(nd, 0);
    if (lotsArr) {
      r.lots = lotsArr.map(lotFromJson).filter(l => l && (l.typology || l.priceEur || l.surfaceM2));
    }
    return r;
  }

  function findLotsArray(data, depth) {
    if (depth > 14 || !data || typeof data !== 'object') return null;
    if (Array.isArray(data)) {
      if (data.length > 0 && isLotLike(data[0])) return data;
      for (const item of data) { const r = findLotsArray(item, depth + 1); if (r) return r; }
      return null;
    }
    const prio = ['lots','logements','typologies','lotsTypes','typesList','units','availableTypes','typelogements'];
    for (const key of prio) {
      const arr = data[key];
      if (Array.isArray(arr) && arr.length > 0 && isLotLike(arr[0])) return arr;
    }
    for (const val of Object.values(data)) { const r = findLotsArray(val, depth + 1); if (r) return r; }
    return null;
  }

  function isLotLike(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const keys = Object.keys(item).map(k => k.toLowerCase());
    const hasPrice = keys.some(k => /price|prix|tarif|montant/.test(k));
    const hasSurf  = keys.some(k => /surface|area|m2|superficie/.test(k));
    const hasType  = keys.some(k => /typo|type|pieces|rooms|libelle|label/.test(k));
    return hasPrice || (hasSurf && hasType);
  }

  function lotFromJson(item) {
    if (!item || typeof item !== 'object') return null;
    function get(...args) { for (const k of args) { if (item[k] != null) return item[k]; } return null; }
    const rawTypo = String(get('typology','type','typeName','libelle','label','typelogement','roomType') || '');
    let typo = normalizeTypo(rawTypo);
    if (!typo) {
      const pieces = parseNum(get('pieces','nbPieces','rooms','roomsCount','roomCount'));
      if (pieces) typo = pieces <= 1 ? 'T1 / Studio' : pieces === 2 ? 'T2' : pieces === 3 ? 'T3' : pieces === 4 ? 'T4' : 'T5+';
    }
    const price   = parseNum(get('price','prix','prixMin','minPrice','fromPrice','tarif','montant'));
    const surface = parseNum(get('surface','surfaceMin','minSurface','surfaceHabitable','area','minArea'));
    let ppm2      = parseNum(get('pricePerM2','prixM2','prixParM2','priceM2'));
    if (!ppm2 && price && surface) ppm2 = Math.round(price / surface);
    const count   = parseNum(get('count','available','availableCount','nbBiens','quantity','disponible','nb')) || 1;
    return { typology: typo, rawTypology: rawTypo || typo || '', surfaceM2: surface, priceEur: price, pricePerM2: ppm2, availableCount: Math.round(count) };
  }

  // ════════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════════

  function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

  function showTextarea(json) {
    const ta = document.createElement('textarea');
    ta.value = json;
    Object.assign(ta.style, {
      position:'fixed', top:'10px', left:'10px', width:'80vw', height:'60vh',
      zIndex:'999999', fontFamily:'monospace', fontSize:'11px',
      background:'#1e1e2e', color:'#cdd6f4', border:'2px solid #89b4fa',
      borderRadius:'8px', padding:'12px',
    });
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    const btn = document.createElement('button');
    btn.textContent = '✕ Fermer';
    Object.assign(btn.style, {
      position:'fixed', top:'10px', right:'10px', zIndex:'1000000',
      padding:'8px 16px', background:'#f38ba8', color:'#1e1e2e',
      border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold',
    });
    btn.onclick = () => { ta.remove(); btn.remove(); };
    document.body.appendChild(btn);
  }

})();
