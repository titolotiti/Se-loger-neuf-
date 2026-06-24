import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let rawData: string | null = null;
  const ct = req.headers.get("content-type") ?? "";

  try {
    if (ct.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      rawData = new URLSearchParams(text).get("data");
    } else if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const val = form.get("data");
      rawData = typeof val === "string" ? val : null;
    } else {
      rawData = await req.text();
    }
  } catch {
    return htmlRes(errorPage("Impossible de lire les données."), 400);
  }

  if (!rawData?.trim()) return htmlRes(errorPage("Données manquantes."), 400);

  let program: Record<string, unknown>;
  try {
    program = JSON.parse(rawData) as Record<string, unknown>;
  } catch {
    return htmlRes(errorPage("JSON invalide."), 400);
  }

  if (typeof program.programName !== "string" || !program.programName.trim()) {
    program.programName = typeof program.sourceUrl === "string" && program.sourceUrl
      ? program.sourceUrl
      : "Programme SeLoger Neuf";
  }

  if (!Array.isArray(program.lots)) {
    program.lots = [];
  }

  if (!program.sourceUrl) program.sourceUrl = program.pageUrl ?? "";
  if (!program.pageUrl) program.pageUrl = program.sourceUrl ?? "";
  program.importedAt = new Date().toISOString();

  const safeJson = JSON.stringify(program)
    .split("<").join("\\u003c")
    .split(">").join("\\u003e")
    .split("&").join("\\u0026");

  const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Collecteur SeLoger Neuf</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f5fb;
     display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:16px;padding:36px 32px;max-width:420px;width:90%;
      text-align:center;box-shadow:0 4px 28px rgba(0,0,0,.08)}
.ico{font-size:48px;margin-bottom:12px;line-height:1}
h1{font-size:18px;color:#111827;margin-bottom:6px;font-weight:700}
p{color:#6b7280;font-size:13px;margin-bottom:20px;line-height:1.5}
.actions{display:none;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;text-decoration:none;
     padding:9px 20px;border-radius:10px;font-size:13px;font-weight:600;
     cursor:pointer;border:none;transition:background .15s}
.btn-primary{background:#2563eb;color:#fff}.btn-primary:hover{background:#1d4ed8}
.btn-secondary{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb}
.btn-secondary:hover{background:#e5e7eb}
</style>
</head>
<body>
<div class="card">
  <div class="ico" id="ico">⏳</div>
  <h1 id="ttl">Enregistrement…</h1>
  <p id="msg">Ajout du programme au collecteur.</p>
  <div class="actions" id="actions">
    <a class="btn btn-primary" href="/">Retourner à l'analyse</a>
    <button class="btn btn-secondary" onclick="window.close()">Fermer l'onglet</button>
  </div>
</div>
<script>
(function(){
  var KEY="seloger_neuf_collected_programs";
  var BC="seloger_neuf_collecteur";
  try{
    var prog=${safeJson};
    var list=[];
    try{list=JSON.parse(localStorage.getItem(KEY)||"[]")||[];}catch(e){}
    if(!Array.isArray(list))list=[];
    var url=prog.sourceUrl||prog.pageUrl||"";
    var idx=list.findIndex(function(p){return p.sourceUrl===url||p.pageUrl===url;});
    if(idx>=0){list[idx]=prog;}else{list.push(prog);}
    localStorage.setItem(KEY,JSON.stringify(list));
    // Notify open tabs via BroadcastChannel
    try{new BroadcastChannel(BC).postMessage({type:"updated"});}catch(e){}
    document.getElementById("ico").textContent="✅";
    document.getElementById("ttl").textContent="Programme ajouté !";
    document.getElementById("msg").textContent=
      "« "+prog.programName+" » est dans le collecteur" + ((prog.lots||[]).length ? " avec "+prog.lots.length+" lot(s)." : " — aucun lot détecté.");
  }catch(e){
    document.getElementById("ico").textContent="❌";
    document.getElementById("ttl").textContent="Erreur";
    document.getElementById("msg").textContent="Impossible d'enregistrer : "+e.message;
  }
  document.getElementById("actions").style.display="flex";
  // Auto-close after 1.5 s (tab was opened by form submit)
  setTimeout(function(){
    try{window.close();}catch(e){}
    // Fallback: redirect to home if window.close() is blocked
    setTimeout(function(){window.location.replace("/");},400);
  },1500);
})();
</script>
</body>
</html>`;

  return htmlRes(page);
}

function htmlRes(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function errorPage(msg: string): string {
  const safe = msg
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;");
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Erreur</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;
justify-content:center;min-height:100vh;background:#fef2f2}
.c{background:#fff;border-radius:12px;padding:32px;max-width:420px;text-align:center;
   box-shadow:0 4px 20px rgba(0,0,0,.1)}
h1{color:#dc2626;margin-bottom:8px}p{color:#6b7280;margin-bottom:20px}
a{color:#2563eb}</style>
</head><body><div class="c">
<div style="font-size:48px;margin-bottom:12px">❌</div>
<h1>Erreur</h1><p>${safe}</p>
<a href="/">Retour à l'analyse</a>
</div></body></html>`;
}
