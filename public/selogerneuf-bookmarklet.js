/**
 * SeLoger Neuf — Extracteur de lots v4 (Auto-Collecteur)
 * Ce fichier contient __COLLECT_URL__ qui est remplacé par /bookmarklet avant usage.
 */

(async function extractSeLogerNeufLots() {
  'use strict';

  var COLLECT_URL = '__COLLECT_URL__';
  var BOOKMARKLET_VERSION = 'v4-auto-collect';

  if (!window.location.href.includes('selogerneuf.com')) {
    alert('[' + BOOKMARKLET_VERSION + '] Exécuter sur une page SeLoger Neuf.\n' + window.location.href);
    return;
  }

  // ════════════════════════════════════════════════════════════════
  // Utilitaires
  // ════════════════════════════════════════════════════════════════

  function normalizeText(text) {
    return text
      .replace(/[   ⁠​﻿]/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  function parseNum(v) {
    if (v == null) return null;
    var s = String(v).replace(/[^\d,]/g, '').replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) && n > 0 ? n : null;
  }

  function normalizeTypo(raw) {
    if (!raw) return null;
    var s = String(raw).toLowerCase();
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

  var result = {
    bookmarkletVersion: BOOKMARKLET_VERSION,
    programName: '(inconnu)',
    pageUrl: window.location.href,
    sourceUrl: window.location.href,
    totalUnits: null,
    availableUnits: null,
    bodyTextSample: '',
    rawTypologyBlocks: [],
    lots: [],
  };

  var bt = normalizeText(document.body.innerText || '');

  var progM = bt.match(/Programme\s+(.+?)\s+contient\s+(\d+)\s+logements/i);
  if (progM) {
    result.programName = progM[1].trim();
    result.totalUnits  = parseInt(progM[2], 10);
  } else {
    var titleRaw = normalizeText(document.title || '');
    var parts    = titleRaw.split(/\s*[\|\-–]\s*/);
    var best     = parts.find(function(p) { return p.trim() && !/^detail$/i.test(p.trim()); });
    if (best) result.programName = best.trim();
  }

  // ── Délimiteurs de section ─────────────────────────────────────────────────
  var SECTION_START = /logements?\s+disponibles?/i;
  var SECTION_END   = [
    /certifications?\s+et\s+labels?\s+qualit/i,
    /Le\s+programme\b/,
    /informations?\s+compl[eé]mentaires?/i,
  ];

  function extractSection(text) {
    var startIdx = text.search(SECTION_START);
    var section = startIdx >= 0 ? text.slice(startIdx) : text;
    for (var i = 0; i < SECTION_END.length; i++) {
      var eIdx = section.search(SECTION_END[i]);
      if (eIdx > 300) { section = section.slice(0, eIdx); break; }
    }
    return { section: section, startIdx: startIdx };
  }

  // ════════════════════════════════════════════════════════════════
  // Extraction par blocs de typologies
  // ════════════════════════════════════════════════════════════════

  var TYPO_HEADERS = [
    { re: /^STUDIO$/,                          typo: 'T1 / Studio' },
    { re: /^APPARTEMENT\s+1\s*PI[EÈ]CE?$/,    typo: 'T1 / Studio' },
    { re: /^APPARTEMENT\s+2\s*PI[EÈ]CES?$/,   typo: 'T2' },
    { re: /^APPARTEMENT\s+3\s*PI[EÈ]CES?$/,   typo: 'T3' },
    { re: /^APPARTEMENT\s+4\s*PI[EÈ]CES?$/,   typo: 'T4' },
    { re: /^APPARTEMENT\s+5\s*PI[EÈ]CES?$/,   typo: 'T5+' },
    { re: /^APPARTEMENT\s+6\s*PI[EÈ]CES?$/,   typo: 'T5+' },
    { re: /^APPARTEMENT\s+7\s*PI[EÈ]CES?$/,   typo: 'T5+' },
    { re: /^MAISON\s+\d+\s*PI[EÈ]CES?$/,      typo: null },
  ];

  function matchTypoHeader(line) {
    var t = line.trim();
    if (!t || t.length > 80) return null;
    if (/[a-z]/.test(t)) return null;
    for (var i = 0; i < TYPO_HEADERS.length; i++) {
      var h = TYPO_HEADERS[i];
      if (h.re.test(t)) return { rawTypo: t, typo: h.typo || normalizeTypo(t) };
    }
    return null;
  }

  function extractFromSection(sectionText) {
    var r = { lots: [], totalUnits: null, rawTypologyBlocks: [] };
    var lines = sectionText.split('\n');
    var headerPositions = [];
    for (var i = 0; i < lines.length; i++) {
      var m = matchTypoHeader(lines[i]);
      if (m) headerPositions.push({ rawTypo: m.rawTypo, typo: m.typo, lineIndex: i });
    }

    for (var hi = 0; hi < headerPositions.length; hi++) {
      var start      = headerPositions[hi].lineIndex;
      var end        = hi + 1 < headerPositions.length
        ? headerPositions[hi + 1].lineIndex
        : Math.min(start + 80, lines.length);
      var blockLines = lines.slice(start, end);
      var blockText  = blockLines.join('\n').trim();
      var rawTypo    = headerPositions[hi].rawTypo;
      var typo       = headerPositions[hi].typo;
      var warnings   = [];

      var surfM   = blockText.match(/(\d+(?:[,.]\d+)?)\s*m[²2]/);
      var surface = surfM ? parseNum(surfM[1]) : null;
      if (!surface) warnings.push('Surface non trouvée');

      var pm2M       = blockText.match(/Soit\s+([\d ]+\d)\s*€\s*\/\s*m[²2]/i);
      var pricePerM2 = pm2M ? parseNum(pm2M[1]) : null;
      if (!pricePerM2) warnings.push('Prix/m² non trouvé');

      var price = null;
      var euroRe = /([\d][\d ]*\d|[\d])\s*€/g;
      var em;
      while ((em = euroRe.exec(blockText)) !== null) {
        var after = blockText.slice(em.index + em[0].length, em.index + em[0].length + 5);
        if (/^\s*\//.test(after)) continue;
        var v = parseNum(em[1]);
        if (v && v > 100000) { price = v; break; }
      }
      if (!price) warnings.push('Prix non trouvé');

      var finalPm2 = pricePerM2 || (price && surface ? Math.round(price / surface) : null);

      var countM = blockText.match(/(\d+)\s*biens?/i)
                || blockText.match(/(\d+)\s*logements?\s*disponibles?/i)
                || blockText.match(/disponibles?\s*:\s*(\d+)/i);
      var count  = countM ? parseInt(countM[1], 10) : 1;
      if (!countM) warnings.push('Nb biens non trouvé, défaut = 1');

      var debug = {
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
    var clicked = 0;
    var seen = new Set();
    for (var pass = 0; pass < 3; pass++) {
      var foundNew = false;
      document.querySelectorAll('[aria-expanded="false"]').forEach(function(el) {
        if (seen.has(el)) return;
        seen.add(el); el.click(); clicked++; foundNew = true;
      });
      var extraSels = [
        'button[class*="accordion"]','button[class*="Accordion"]',
        'button[class*="typology"]','button[class*="Typology"]',
        'button[class*="TypeCard"]','button[class*="lot"]',
        '[data-testid*="accordion"]','[data-testid*="typology"]',
      ];
      for (var si = 0; si < extraSels.length; si++) {
        try {
          document.querySelectorAll(extraSels[si]).forEach(function(el) {
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
    var r = { lots: [], programName: null, totalUnits: null };
    try {
      var pp = nd && nd.props && nd.props.pageProps;
      if (pp) r.programName = pp.programName || pp.name || pp.title ||
        (pp.program && (pp.program.name || pp.program.title)) || null;
    } catch(e) {}
    var lotsArr = findLotsArray(nd, 0);
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
      for (var i = 0; i < data.length; i++) { var r = findLotsArray(data[i], depth + 1); if (r) return r; }
      return null;
    }
    var prio = ['lots','logements','typologies','lotsTypes','typesList','units','availableTypes','typelogements'];
    for (var j = 0; j < prio.length; j++) {
      var arr = data[prio[j]];
      if (Array.isArray(arr) && arr.length > 0 && isLotLike(arr[0])) return arr;
    }
    var vals = Object.values(data);
    for (var k = 0; k < vals.length; k++) { var r2 = findLotsArray(vals[k], depth + 1); if (r2) return r2; }
    return null;
  }

  function isLotLike(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    var keys = Object.keys(item).map(function(k) { return k.toLowerCase(); });
    var hasPrice = keys.some(function(k) { return /price|prix|tarif|montant/.test(k); });
    var hasSurf  = keys.some(function(k) { return /surface|area|m2|superficie/.test(k); });
    var hasType  = keys.some(function(k) { return /typo|type|pieces|rooms|libelle|label/.test(k); });
    return hasPrice || (hasSurf && hasType);
  }

  function lotFromJson(item) {
    if (!item || typeof item !== 'object') return null;
    function get() {
      for (var i = 0; i < arguments.length; i++) { if (item[arguments[i]] != null) return item[arguments[i]]; }
      return null;
    }
    var rawTypo = String(get('typology','type','typeName','libelle','label','typelogement','roomType') || '');
    var typo = normalizeTypo(rawTypo);
    if (!typo) {
      var pieces = parseNum(get('pieces','nbPieces','rooms','roomsCount','roomCount'));
      if (pieces) typo = pieces <= 1 ? 'T1 / Studio' : pieces === 2 ? 'T2' : pieces === 3 ? 'T3' : pieces === 4 ? 'T4' : 'T5+';
    }
    var price   = parseNum(get('price','prix','prixMin','minPrice','fromPrice','tarif','montant'));
    var surface = parseNum(get('surface','surfaceMin','minSurface','surfaceHabitable','area','minArea'));
    var ppm2    = parseNum(get('pricePerM2','prixM2','prixParM2','priceM2'));
    if (!ppm2 && price && surface) ppm2 = Math.round(price / surface);
    var count   = parseNum(get('count','available','availableCount','nbBiens','quantity','disponible','nb')) || 1;
    return { typology: typo, rawTypology: rawTypo || typo || '', surfaceM2: surface, priceEur: price, pricePerM2: ppm2, availableCount: Math.round(count) };
  }

  // ── Stratégie 1 : __NEXT_DATA__ ───────────────────────────────────────────
  var nextEl = document.getElementById('__NEXT_DATA__');
  if (nextEl) {
    try {
      var nd        = JSON.parse(nextEl.textContent || '{}');
      var ndResult  = extractFromNextData(nd);
      var hasReal   = ndResult.lots.some(function(l) { return l.surfaceM2 && l.priceEur; });
      if (hasReal) {
        result.lots = ndResult.lots;
        if (ndResult.programName && !/^detail$/i.test(ndResult.programName)) {
          result.programName = ndResult.programName;
        }
        if (ndResult.totalUnits) result.totalUnits = ndResult.totalUnits;
      }
    } catch(e) {}
  }

  // ── Stratégie 2 : DOM / innerText ─────────────────────────────────────────
  if (result.lots.length === 0) {
    var secPre = extractSection(bt);
    result.bodyTextSample = secPre.startIdx >= 0
      ? bt.slice(Math.max(0, secPre.startIdx - 30), secPre.startIdx + 1500)
      : bt.slice(0, 1500);

    var nbClicked = await expandAccordions();
    await delay(2000);

    var bt2 = normalizeText(document.body.innerText || '');
    var sec2 = extractSection(bt2);
    result.bodyTextSample = sec2.startIdx >= 0
      ? bt2.slice(Math.max(0, sec2.startIdx - 30), sec2.startIdx + 1500)
      : bt2.slice(0, 1500);

    var domResult = extractFromSection(sec2.section);
    result.rawTypologyBlocks = domResult.rawTypologyBlocks;
    result.lots              = domResult.lots;
    if (!result.totalUnits && domResult.totalUnits) result.totalUnits = domResult.totalUnits;
  } else {
    var secFb = extractSection(bt);
    result.bodyTextSample = secFb.startIdx >= 0
      ? bt.slice(Math.max(0, secFb.startIdx - 30), secFb.startIdx + 1500)
      : bt.slice(0, 1500);
  }

  if (!result.availableUnits) {
    result.availableUnits = result.lots.reduce(function(s, l) { return s + (l.availableCount || 0); }, 0);
  }

  var lotCount = result.lots.length;

  // ════════════════════════════════════════════════════════════════
  // Envoi vers l'app via formulaire POST
  // ════════════════════════════════════════════════════════════════

  // Overlay sur la page courante
  var overlay = document.createElement('div');
  overlay.id = '__sln_collect_overlay__';
  Object.assign(overlay.style, {
    position: 'fixed', top: '16px', right: '16px', zIndex: '9999999',
    background: '#1e3a5f', color: '#fff',
    borderRadius: '10px', padding: '14px 20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px', fontWeight: '600',
    boxShadow: '0 4px 20px rgba(0,0,0,.35)', maxWidth: '340px',
    lineHeight: '1.5', transition: 'opacity .4s',
  });
  overlay.textContent = (lotCount > 0 ? '⏳ Envoi de « ' : '⚠️ ') +
    result.programName + (lotCount > 0 ? ' »…' : ' — aucun lot');
  document.body.appendChild(overlay);

  // Soumission du formulaire
  var form = document.createElement('form');
  form.method = 'POST';
  form.action = COLLECT_URL;
  form.target = '_blank';
  var inp = document.createElement('input');
  inp.type = 'hidden';
  inp.name = 'data';
  inp.value = JSON.stringify(result);
  form.appendChild(inp);
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);

  setTimeout(function() {
    overlay.textContent = lotCount > 0
      ? '✅ « ' + result.programName + ' » envoyé au collecteur (' + lotCount + ' lot(s))'
      : '⚠️ Aucun lot détecté — diagnostic envoyé';
  }, 1000);

  setTimeout(function() {
    overlay.style.opacity = '0';
    setTimeout(function() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 400);
  }, 4000);

  // ════════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════════

  function delay(ms) { return new Promise(function(res) { setTimeout(res, ms); }); }

})();
