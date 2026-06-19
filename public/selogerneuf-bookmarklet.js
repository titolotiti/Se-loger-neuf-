/**
 * SeLoger Neuf — Extracteur de lots
 * Utilisation :
 *   1. Ouvrir la page d'un programme SeLoger Neuf dans le navigateur
 *   2. Ouvrir la console (F12 → Console)
 *   3. Coller ce script et appuyer sur Entrée
 *   4. Copier le JSON généré et le coller dans l'outil (bouton "Importer les lots")
 */
(async function extractSeLogerNeufLots() {
  'use strict';

  if (!window.location.href.includes('selogerneuf.com') && !window.location.href.includes('seloger.com')) {
    alert('⚠️ Ce script doit être exécuté sur une page SeLoger Neuf.\nURL actuelle : ' + window.location.href);
    return;
  }

  const result = {
    programName: document.title.replace(/\s*[-–|].*$/, '').trim() || '(inconnu)',
    sourceUrl: window.location.href,
    totalUnits: null,
    availableUnits: null,
    lots: [],
  };

  console.log('[SLN] Extraction des lots depuis :', result.sourceUrl);

  // ── Stratégie 1 : __NEXT_DATA__ (plus fiable) ────────────────────────────
  const nextEl = document.getElementById('__NEXT_DATA__');
  if (nextEl) {
    try {
      const nd = JSON.parse(nextEl.textContent || '{}');
      const ndResult = extractFromNextData(nd);
      if (ndResult.lots.length > 0) {
        Object.assign(result, ndResult);
        console.log('[SLN] ✓ Données extraites depuis __NEXT_DATA__ —', result.lots.length, 'type(s)');
      }
    } catch (e) {
      console.warn('[SLN] Erreur parsing __NEXT_DATA__ :', e.message);
    }
  }

  // ── Stratégie 2 : DOM ────────────────────────────────────────────────────
  if (result.lots.length === 0) {
    console.log('[SLN] Tentative extraction DOM...');
    await expandAccordions();
    const domResult = extractFromDOM();
    if (domResult.lots.length > 0) {
      Object.assign(result, domResult);
      console.log('[SLN] ✓ Données extraites depuis le DOM —', result.lots.length, 'type(s)');
    }
  }

  if (result.lots.length === 0) {
    alert('❌ Aucune donnée de lot détectée.\n\nEssayez :\n• D\'ouvrir manuellement les sections typologies (accordéons)\n• De vérifier que vous êtes sur la page d\'un programme SeLoger Neuf\n• D\'inspecter la console pour plus de détails');
    return;
  }

  // Calcul availableUnits si non trouvé
  if (!result.availableUnits) {
    result.availableUnits = result.lots.reduce((s, l) => s + (l.availableCount || 0), 0);
  }

  const json = JSON.stringify(result, null, 2);
  console.log('[SLN] Résultat final :', result);

  // ── Copie dans le presse-papiers ─────────────────────────────────────────
  try {
    await navigator.clipboard.writeText(json);
    alert(`✅ ${result.lots.length} typologie(s) extraite(s) pour « ${result.programName} »\n\nJSON copié dans le presse-papiers.\nCollez-le dans l'outil → bouton "Importer les lots".`);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = json;
    Object.assign(ta.style, { position: 'fixed', top: '10px', left: '10px', width: '80vw', height: '60vh', zIndex: '999999', fontFamily: 'monospace', fontSize: '12px', background: '#1e1e2e', color: '#cdd6f4', border: '2px solid #89b4fa', borderRadius: '8px', padding: '12px' });
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    const btn = document.createElement('button');
    btn.textContent = '✕ Fermer';
    Object.assign(btn.style, { position: 'fixed', top: '10px', right: '10px', zIndex: '1000000', padding: '8px 16px', background: '#f38ba8', color: '#1e1e2e', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' });
    btn.onclick = () => { ta.remove(); btn.remove(); };
    document.body.appendChild(btn);
    alert('✅ JSON généré. Copiez le contenu de la zone qui vient d\'apparaître et collez-le dans l\'outil.');
  }

  // ════════════════════════════════════════════════════════════════
  // Fonctions utilitaires
  // ════════════════════════════════════════════════════════════════

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

  function parseNum(v) {
    if (v == null) return null;
    const s = String(v).replace(/[^\d,.]/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) && n > 0 ? n : null;
  }

  // ── Extraction depuis __NEXT_DATA__ ──────────────────────────────────────

  function findLotsArray(data, depth) {
    depth = depth || 0;
    if (depth > 14 || !data || typeof data !== 'object') return null;

    if (Array.isArray(data)) {
      if (data.length > 0 && isLotLike(data[0])) return data;
      for (var i = 0; i < data.length; i++) {
        var r = findLotsArray(data[i], depth + 1);
        if (r) return r;
      }
      return null;
    }

    // Priority keys
    var prio = ['lots', 'logements', 'typologies', 'lotsTypes', 'typesList', 'units',
                'availableTypes', 'typelogements', 'lotsAvailable', 'lotsMatchingSearch',
                'properties', 'classifications', 'offerings'];
    for (var j = 0; j < prio.length; j++) {
      var arr = data[prio[j]];
      if (Array.isArray(arr) && arr.length > 0 && isLotLike(arr[0])) return arr;
    }

    var vals = Object.values(data);
    for (var k = 0; k < vals.length; k++) {
      var found = findLotsArray(vals[k], depth + 1);
      if (found) return found;
    }
    return null;
  }

  function isLotLike(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    var keys = Object.keys(item).map(function(k) { return k.toLowerCase(); });
    var hasPrice = keys.some(function(k) { return /price|prix|tarif|montant/.test(k); });
    var hasSurf = keys.some(function(k) { return /surface|area|m2|superficie/.test(k); });
    var hasType = keys.some(function(k) { return /typo|type|pieces|rooms|libelle|label/.test(k); });
    return hasPrice || (hasSurf && hasType);
  }

  function lotFromJson(item) {
    if (!item || typeof item !== 'object') return null;
    function get() {
      for (var i = 0; i < arguments.length; i++) {
        if (item[arguments[i]] != null) return item[arguments[i]];
      }
      return null;
    }
    var rawTypo = String(get('typology','type','typeName','libelle','label','typelogement','roomType') || '');
    var typo = normalizeTypo(rawTypo);
    if (!typo) {
      var pieces = parseNum(get('pieces','nbPieces','rooms','roomsCount','roomCount'));
      if (pieces) {
        if (pieces <= 1) typo = 'T1 / Studio';
        else if (pieces === 2) typo = 'T2';
        else if (pieces === 3) typo = 'T3';
        else if (pieces === 4) typo = 'T4';
        else typo = 'T5+';
      }
    }
    var price = parseNum(get('price','prix','prixMin','minPrice','fromPrice','tarif','montant'));
    var surface = parseNum(get('surface','surfaceMin','minSurface','surfaceHabitable','area','minArea','areaMin'));
    var ppm2 = parseNum(get('pricePerM2','prixM2','prixParM2','priceM2'));
    if (!ppm2 && price && surface) ppm2 = Math.round(price / surface);
    var count = parseNum(get('count','available','availableCount','nbBiens','quantity','disponible','nb')) || 1;
    return {
      typology: typo,
      rawTypology: rawTypo || typo,
      surfaceM2: surface,
      priceEur: price,
      pricePerM2: ppm2,
      availableCount: Math.round(count),
    };
  }

  function extractFromNextData(nd) {
    var r = { programName: null, totalUnits: null, availableUnits: null, lots: [] };

    // Try to get name from props
    try {
      var pp = nd && nd.props && nd.props.pageProps;
      if (pp) {
        r.programName = (pp.programName || pp.name || pp.title ||
          (pp.program && (pp.program.name || pp.program.title)) ||
          (pp.realEstate && (pp.realEstate.name || pp.realEstate.title)) ||
          (pp.classified && (pp.classified.name || pp.classified.title))) || null;
      }
    } catch(e) {}

    // Total units from text
    var bt = document.body.innerText || '';
    var tm = bt.match(/Programme\s+(.+?)\s+contient\s+(\d+)\s+logements/i);
    if (tm) {
      r.programName = r.programName || tm[1].trim();
      r.totalUnits = parseInt(tm[2]);
    }

    // Find lots
    var lotsArr = findLotsArray(nd);
    if (lotsArr) {
      r.lots = lotsArr.map(lotFromJson).filter(function(l) {
        return l && (l.typology || l.priceEur || l.surfaceM2);
      });
    }

    return r;
  }

  // ── Expansion des accordéons ──────────────────────────────────────────────

  async function expandAccordions() {
    var sels = [
      '[aria-expanded="false"]',
      '[data-accordion-trigger]',
      'button[class*="accordion"]',
      'button[class*="typology"]',
      'button[class*="lot"]',
      '[role="button"][aria-expanded="false"]',
    ];
    var clicked = 0;
    for (var s = 0; s < sels.length; s++) {
      try {
        var els = document.querySelectorAll(sels[s]);
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var txt = (el.textContent || '').toLowerCase();
          if (/studio|pi[eè]ces?|appartement|logement|bien/.test(txt)) {
            el.click();
            clicked++;
            await delay(150);
          }
        }
      } catch(e) {}
    }
    if (clicked > 0) await delay(1000);
  }

  // ── Extraction depuis le DOM / innerText ─────────────────────────────────

  function extractFromDOM() {
    var r = { programName: null, totalUnits: null, availableUnits: null, lots: [] };
    var bt = document.body.innerText || '';

    // Total units
    var tm = bt.match(/Programme\s+(.+?)\s+contient\s+(\d+)\s+logements/i);
    if (tm) { r.programName = tm[1].trim(); r.totalUnits = parseInt(tm[2]); }

    // Typology header pattern
    var typoRe = /^(studio|appartement\s+\d+\s*pi[eè]ces?|maison\s+\d+\s*pi[eè]ces?|t[1-7]\b)/i;
    var lines = bt.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    var lotMap = {};
    var cur = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      var tm2 = line.match(typoRe);
      if (tm2) {
        var rawT = tm2[0].trim();
        var typo = normalizeTypo(rawT);
        if (typo && !lotMap[typo]) {
          lotMap[typo] = { typology: typo, rawTypology: rawT, surfaceM2: null, priceEur: null, pricePerM2: null, availableCount: 0 };
        }
        cur = typo ? lotMap[typo] : null;
        continue;
      }

      if (!cur) continue;

      // Biens
      var bm = line.match(/(\d+)\s*bien/i);
      if (bm) cur.availableCount = parseInt(bm[1]);

      // Prix/m²
      var pm2 = line.match(/Soit\s+([\d\s]+(?:[\d]))\s*€\/m²/i) ||
                line.match(/([\d][\d\s]*)\s*€\/m²/);
      if (pm2) cur.pricePerM2 = parseNum(pm2[1]);

      // Surface
      var sm = line.match(/(\d+(?:[,.]\d+)?)\s*m²/);
      if (sm && !pm2) cur.surfaceM2 = parseNum(sm[1]);

      // Prix
      var prm = line.match(/^([\d][\d\s]*)\s*€\s*$/) ||
                line.match(/De\s+([\d\s]+)\s*€/i);
      if (prm && !pm2) {
        var price = parseNum(line.replace(/[^\d]/g, ''));
        if (price && price > 10000) cur.priceEur = cur.priceEur || price;
      }

      // Compute pricePerM2 if possible
      if (cur.priceEur && cur.surfaceM2 && !cur.pricePerM2) {
        cur.pricePerM2 = Math.round(cur.priceEur / cur.surfaceM2);
      }
    }

    r.lots = Object.values(lotMap).filter(function(l) { return l.typology; });
    return r;
  }

  function delay(ms) { return new Promise(function(res) { setTimeout(res, ms); }); }

})();
