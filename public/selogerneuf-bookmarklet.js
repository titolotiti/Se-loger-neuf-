/**
 * SeLoger Neuf — Extracteur de lots
 * Version : v2-accordion-debug
 *
 * Instructions :
 *   1. Ouvrir la page d'un programme SeLoger Neuf dans le navigateur
 *   2. Ouvrir la console (F12 → Console)
 *   3. Coller ce script et appuyer sur Entrée
 *   4. Copier le JSON généré et le coller dans l'outil (bouton "Importer les lots")
 */

const BOOKMARKLET_VERSION = "v2-accordion-debug";

(async function extractSeLogerNeufLots() {
  'use strict';

  if (!window.location.href.includes('selogerneuf.com')) {
    alert('[' + BOOKMARKLET_VERSION + '] ⚠️ Ce script doit être exécuté sur une page SeLoger Neuf.\nURL actuelle : ' + window.location.href);
    return;
  }

  console.log('[SLN ' + BOOKMARKLET_VERSION + '] Démarrage sur :', window.location.href);

  const result = {
    bookmarkletVersion: BOOKMARKLET_VERSION,
    programName: document.title.replace(/\s*[-–|].*$/, '').trim() || '(inconnu)',
    pageUrl: window.location.href,
    totalUnits: null,
    availableUnits: null,
    bodyTextSample: '',
    rawTypologyBlocks: [],
    lots: [],
  };

  // ── Stratégie 1 : __NEXT_DATA__ (JSON embarqué dans la page) ─────────────
  const nextEl = document.getElementById('__NEXT_DATA__');
  if (nextEl) {
    try {
      const nd = JSON.parse(nextEl.textContent || '{}');
      const ndResult = extractFromNextData(nd);
      if (ndResult.lots.length > 0) {
        result.lots = ndResult.lots;
        if (ndResult.programName) result.programName = ndResult.programName;
        result.totalUnits = ndResult.totalUnits;
        result.availableUnits = ndResult.availableUnits;
        console.log('[SLN] ✓ __NEXT_DATA__ — ' + result.lots.length + ' lot(s)');
      } else {
        console.log('[SLN] __NEXT_DATA__ présent mais aucun lot — passage stratégie DOM');
      }
    } catch (e) {
      console.warn('[SLN] Erreur __NEXT_DATA__ :', e.message);
    }
  }

  // ── Stratégie 2 : accordéons + lecture innerText ──────────────────────────
  if (result.lots.length === 0) {
    console.log('[SLN] Expansion des accordéons...');
    const nbClicked = await expandAccordions();
    console.log('[SLN] ' + nbClicked + ' élément(s) cliqué(s). Attente 2 s...');
    await delay(2000);

    const domResult = extractFromDOM();
    result.bodyTextSample    = domResult.bodyTextSample;
    result.rawTypologyBlocks = domResult.rawTypologyBlocks;

    if (domResult.lots.length > 0) {
      result.lots       = domResult.lots;
      result.totalUnits = domResult.totalUnits;
      console.log('[SLN] ✓ DOM — ' + result.lots.length + ' lot(s)');
    } else {
      console.warn('[SLN] ✗ DOM — aucun lot. Voir bodyTextSample dans le JSON pour diagnostic.');
    }
  } else {
    // Stratégie 1 réussie — capturer quand même bodyTextSample pour contexte
    const bt = document.body.innerText || '';
    const idx = bt.search(/logements?\s+disponibles?/i);
    result.bodyTextSample = idx >= 0
      ? bt.slice(Math.max(0, idx - 50), idx + 1200)
      : bt.slice(0, 1200);
  }

  // Fallback totalUnits
  if (!result.totalUnits) {
    const bt = document.body.innerText || '';
    const m = bt.match(/(\d+)\s+logements?\s+(?:au\s*total|dont)/i)
           || bt.match(/Programme\s+.+?\s+contient\s+(\d+)\s+logements/i)
           || bt.match(/(\d+)\s+logements?\s+neufs?/i);
    if (m) result.totalUnits = parseInt(m[1], 10);
  }

  if (!result.availableUnits) {
    result.availableUnits = result.lots.reduce(function(s, l) { return s + (l.availableCount || 0); }, 0);
  }

  const json = JSON.stringify(result, null, 2);
  console.log('[SLN] Résultat :', result);

  // ── Alerte + presse-papiers ───────────────────────────────────────────────
  const lotCount = result.lots.length;
  const alertMsg =
    (lotCount > 0 ? '✅' : '⚠️') + ' [' + BOOKMARKLET_VERSION + '] ' +
    lotCount + ' lot(s) détecté(s) pour « ' + result.programName + ' »\n\n' +
    (lotCount > 0
      ? 'JSON copié dans le presse-papiers.\nCollez-le dans l\'outil → "Importer les lots".'
      : 'Aucun lot détecté.\nCollez quand même le JSON — le diagnostic (bodyTextSample) est inclus.');

  try {
    await navigator.clipboard.writeText(json);
    alert(alertMsg);
  } catch {
    showTextarea(json);
    alert(alertMsg);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Fonctions
  // ═══════════════════════════════════════════════════════════════════════════

  function parseNum(v) {
    if (v == null) return null;
    // Supprimer tout sauf chiffres et virgule/point, normaliser décimale
    const s = String(v).replace(/[^\d,]/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) && n > 0 ? n : null;
  }

  function normalizeTypo(raw) {
    if (!raw) return null;
    const s = String(raw).toLowerCase();
    if (/studio|t1\b|f1\b|1\s*pi[eè]ce\b/.test(s)) return 'T1 / Studio';
    if (/\bt2\b|f2\b|2\s*pi[eè]ces?/.test(s)) return 'T2';
    if (/\bt3\b|f3\b|3\s*pi[eè]ces?/.test(s)) return 'T3';
    if (/\bt4\b|f4\b|4\s*pi[eè]ces?/.test(s)) return 'T4';
    if (/t5|f5|t6|f6|t7|[5-9]\s*pi[eè]ces?/.test(s)) return 'T5+';
    return null;
  }

  // ── __NEXT_DATA__ ──────────────────────────────────────────────────────────

  function extractFromNextData(nd) {
    const r = { lots: [], programName: null, totalUnits: null, availableUnits: null };
    try {
      const pp = nd && nd.props && nd.props.pageProps;
      if (pp) {
        r.programName = (pp.programName || pp.name || pp.title ||
          (pp.program && (pp.program.name || pp.program.title)) ||
          (pp.realEstate && (pp.realEstate.name || pp.realEstate.title))) || null;
      }
    } catch(e) {}
    const lotsArr = findLotsArray(nd, 0);
    if (lotsArr) {
      r.lots = lotsArr.map(lotFromJson).filter(function(l) {
        return l && (l.typology || l.priceEur || l.surfaceM2);
      });
    }
    return r;
  }

  function findLotsArray(data, depth) {
    if (depth > 14 || !data || typeof data !== 'object') return null;
    if (Array.isArray(data)) {
      if (data.length > 0 && isLotLike(data[0])) return data;
      for (let i = 0; i < data.length; i++) {
        const r = findLotsArray(data[i], depth + 1);
        if (r) return r;
      }
      return null;
    }
    const prio = ['lots','logements','typologies','lotsTypes','typesList','units',
                  'availableTypes','typelogements','lotsAvailable','lotsMatchingSearch'];
    for (let j = 0; j < prio.length; j++) {
      const arr = data[prio[j]];
      if (Array.isArray(arr) && arr.length > 0 && isLotLike(arr[0])) return arr;
    }
    for (const val of Object.values(data)) {
      const found = findLotsArray(val, depth + 1);
      if (found) return found;
    }
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
    function get(...args) {
      for (const k of args) { if (item[k] != null) return item[k]; }
      return null;
    }
    const rawTypo = String(get('typology','type','typeName','libelle','label','typelogement','roomType') || '');
    let typo = normalizeTypo(rawTypo);
    if (!typo) {
      const pieces = parseNum(get('pieces','nbPieces','rooms','roomsCount','roomCount'));
      if (pieces) {
        if (pieces <= 1) typo = 'T1 / Studio';
        else if (pieces === 2) typo = 'T2';
        else if (pieces === 3) typo = 'T3';
        else if (pieces === 4) typo = 'T4';
        else typo = 'T5+';
      }
    }
    const price   = parseNum(get('price','prix','prixMin','minPrice','fromPrice','tarif','montant'));
    const surface = parseNum(get('surface','surfaceMin','minSurface','surfaceHabitable','area','minArea'));
    let ppm2      = parseNum(get('pricePerM2','prixM2','prixParM2','priceM2'));
    if (!ppm2 && price && surface) ppm2 = Math.round(price / surface);
    const count   = parseNum(get('count','available','availableCount','nbBiens','quantity','disponible','nb')) || 1;
    return { typology: typo, rawTypology: rawTypo || typo || '', surfaceM2: surface, priceEur: price, pricePerM2: ppm2, availableCount: Math.round(count) };
  }

  // ── Expansion accordéons ───────────────────────────────────────────────────

  async function expandAccordions() {
    let clicked = 0;
    const seen = new Set();

    // 3 passes — pour capturer les accordéons révélés de façon lazy après les premiers clics
    for (let pass = 0; pass < 3; pass++) {
      let foundNew = false;

      // aria-expanded="false" = accordéon fermé standard
      document.querySelectorAll('[aria-expanded="false"]').forEach(el => {
        if (seen.has(el)) return;
        seen.add(el); el.click(); clicked++; foundNew = true;
      });

      // Classes spécifiques SeLoger Neuf (à adapter si la structure change)
      const extraSels = [
        'button[class*="accordion"]', 'button[class*="Accordion"]',
        'button[class*="typology"]',  'button[class*="Typology"]',
        'button[class*="TypeCard"]',  'button[class*="lot"]',
        '[data-testid*="accordion"]', '[data-testid*="typology"]',
        '[data-testid*="type"]',
      ];
      for (const sel of extraSels) {
        try {
          document.querySelectorAll(sel).forEach(el => {
            if (seen.has(el)) return;
            if (el.getAttribute('aria-expanded') === 'true') return;
            seen.add(el); el.click(); clicked++; foundNew = true;
          });
        } catch(e) {}
      }

      if (!foundNew) break;
      await delay(600);
    }

    return clicked;
  }

  // ── Extraction DOM / innerText ─────────────────────────────────────────────
  //
  // 1. Localiser la section "Logements disponibles" dans innerText
  // 2. Découper par headers de typologies (STUDIO, APPARTEMENT N PIÈCES, …)
  // 3. Pour chaque bloc : extraire surface, prix, prix/m², nb disponibles
  // 4. Retourner rawBlockText et parsingWarnings pour diagnostic

  function extractFromDOM() {
    const r = {
      lots: [], totalUnits: null, availableUnits: null,
      bodyTextSample: '', rawTypologyBlocks: [],
    };

    const bt = document.body.innerText || '';

    // Localiser "Logements disponibles"
    const sectionIdx = bt.search(/logements?\s+disponibles?/i);
    const searchText = sectionIdx >= 0 ? bt.slice(sectionIdx) : bt;
    r.bodyTextSample = sectionIdx >= 0
      ? bt.slice(Math.max(0, sectionIdx - 50), sectionIdx + 1200)
      : bt.slice(0, 1200);

    // Total logements
    const tm = bt.match(/(\d+)\s+logements?\s+(?:au\s*total|dont)/i)
            || bt.match(/Programme\s+.+?\s+contient\s+(\d+)\s+logements/i)
            || bt.match(/(\d+)\s+logements?\s+neufs?/i);
    if (tm) r.totalUnits = parseInt(tm[1], 10);

    // ── Identification des headers de typologies ───────────────────────────
    // Patterns correspondant aux titres des volets SeLoger Neuf
    const TYPO_HEADER_PATTERNS = [
      /^STUDIO$/i,
      /^APPARTEMENT\s+\d+\s*PI[EÈ]CES?$/i,
      /^MAISON\s+\d+\s*PI[EÈ]CES?$/i,
      /^T[1-7]$/i,
      /^F[1-7]$/i,
      /^\d\s*PI[EÈ]CES?$/i,
    ];

    function isTypoHeader(line) {
      const t = line.trim();
      if (!t || t.length > 80) return false;
      return TYPO_HEADER_PATTERNS.some(pat => pat.test(t));
    }

    const lines = searchText.split('\n');
    const headerPositions = [];
    for (let i = 0; i < lines.length; i++) {
      if (isTypoHeader(lines[i])) {
        headerPositions.push({ header: lines[i].trim(), lineIndex: i });
      }
    }

    console.log('[SLN] Headers typologies :', headerPositions.map(h => '"' + h.header + '"'));

    // ── Extraction par bloc ────────────────────────────────────────────────
    for (let hi = 0; hi < headerPositions.length; hi++) {
      const startLine = headerPositions[hi].lineIndex;
      const endLine   = hi + 1 < headerPositions.length
        ? headerPositions[hi + 1].lineIndex
        : Math.min(startLine + 80, lines.length);

      const blockLines = lines.slice(startLine, endLine);
      const blockText  = blockLines.join('\n').trim();
      const rawTypo    = headerPositions[hi].header;
      const typo       = normalizeTypo(rawTypo);
      const warnings   = [];

      // Surface : "37 m²" ou "37m²"
      const surfM   = blockText.match(/(\d+(?:[,.]\d+)?)\s*m[²2]/);
      const surface = surfM ? parseNum(surfM[1]) : null;
      if (!surface) warnings.push('Surface non trouvée (cherché : X m²)');

      // Prix/m² : "Soit 15 158 €/m²" ou "15 158 €/m²"
      const pm2M = blockText.match(/Soit\s+([\d\s]+\d)\s*€\s*\/\s*m[²2]/i)
                || blockText.match(/([\d][\d\s]*\d)\s*€\s*\/\s*m[²2]/);
      const pricePerM2raw = pm2M ? parseNum(pm2M[1]) : null;

      // Prix total : ligne "X €" sans "€/m²"
      let price = null;
      for (const bl of blockLines) {
        const t = bl.trim();
        if (/€\s*\/\s*m[²2]/.test(t) || /^Soit\b/i.test(t)) continue;
        const prM = t.match(/(\d[\d\s]{3,}\d)\s*€\s*$/)
                 || t.match(/De\s+([\d\s]+)\s*€\s*$/i)
                 || t.match(/partir\s+de\s+([\d\s]+)\s*€/i);
        if (prM) {
          const v = parseNum(prM[1]);
          if (v && v > 10000) { price = v; break; }
        }
      }
      // Fallback large (pattern souple)
      if (!price) {
        const wideM = blockText.match(/([\d][\d\s]{4,}[\d])\s*€(?!\s*\/)/);
        if (wideM) {
          const v = parseNum(wideM[1]);
          if (v && v > 10000) { price = v; warnings.push('Prix trouvé par pattern large — à vérifier'); }
        }
      }
      if (!price) warnings.push('Prix non trouvé (cherché : X €)');

      const finalPm2 = pricePerM2raw ?? (price && surface ? Math.round(price / surface) : null);
      if (!pricePerM2raw && price && surface) warnings.push('Prix/m² calculé (non lu sur la page)');

      // Nb disponibles
      const countM = blockText.match(/(\d+)\s*biens?\s*disponibles?/i)
                  || blockText.match(/(\d+)\s*logements?\s*disponibles?/i)
                  || blockText.match(/disponibles?\s*:\s*(\d+)/i)
                  || blockText.match(/(\d+)\s*disponibles?/i);
      const count = countM ? parseInt(countM[1], 10) : 1;
      if (!countM) warnings.push('Nb disponibles non trouvé, défaut = 1');

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

  function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

  function showTextarea(json) {
    const ta = document.createElement('textarea');
    ta.value = json;
    Object.assign(ta.style, {
      position: 'fixed', top: '10px', left: '10px', width: '80vw', height: '60vh',
      zIndex: '999999', fontFamily: 'monospace', fontSize: '11px',
      background: '#1e1e2e', color: '#cdd6f4',
      border: '2px solid #89b4fa', borderRadius: '8px', padding: '12px',
    });
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    const btn = document.createElement('button');
    btn.textContent = '✕ Fermer';
    Object.assign(btn.style, {
      position: 'fixed', top: '10px', right: '10px', zIndex: '1000000',
      padding: '8px 16px', background: '#f38ba8', color: '#1e1e2e',
      border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
    });
    btn.onclick = () => { ta.remove(); btn.remove(); };
    document.body.appendChild(btn);
  }

})();
