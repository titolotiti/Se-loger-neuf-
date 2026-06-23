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

  if (typeof program.programName !== "string" || !Array.isArray(program.lots)) {
    return htmlRes(errorPage("Format invalide (programName ou lots manquants)."), 400);
  }

  // Normalize sourceUrl from bookmarklet's pageUrl field
  if (!program.sourceUrl) program.sourceUrl = program.pageUrl ?? "";
  program.importedAt = new Date().toISOString();

  // Embed program as safe JS object literal.
  // Escape < > & so </script> cannot appear inside the script block.
  const safeJson = JSON.stringify(program)
    .split("<").join("\\u003c")
    .split(">").join("\\u003e")
    .split("&").join("\\u0026");

  const page = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Import — SeLoger Neuf</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f0f5fb;
     display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#fff;border-radius:14px;padding:36px 32px;max-width:440px;width:90%;
      text-align:center;box-shadow:0 4px 28px rgba(0,0,0,.10)}
.ico{font-size:52px;margin-bottom:14px;line-height:1}
h1{font-size:20px;color:#1e3a5f;margin-bottom:8px}
p{color:#64748b;font-size:14px;margin-bottom:22px;line-height:1.5}
a.btn{display:inline-block;background:#1e40af;color:#fff;text-decoration:none;
      padding:11px 26px;border-radius:8px;font-size:14px;font-weight:600}
a.btn:hover{background:#1d3483}
</style>
</head>
<body>
<div class="card">
  <div class="ico" id="ico">⏳</div>
  <h1 id="ttl">Enregistrement…</h1>
  <p id="msg">Ajout du programme au collecteur.</p>
  <a class="btn" href="/collecteur" id="lnk" style="display:none">Voir mes programmes →</a>
</div>
<script>
(function(){
  var KEY="seloger_neuf_collected_programs";
  try{
    var prog=${safeJson};
    var list=[];
    try{list=JSON.parse(localStorage.getItem(KEY)||"[]")||[];}catch(e){}
    if(!Array.isArray(list))list=[];
    var url=prog.sourceUrl||prog.pageUrl||"";
    var idx=list.findIndex(function(p){return p.sourceUrl===url||p.pageUrl===url;});
    if(idx>=0){list[idx]=prog;}else{list.push(prog);}
    localStorage.setItem(KEY,JSON.stringify(list));
    document.getElementById("ico").textContent="✅";
    document.getElementById("ttl").textContent="Programme importé !";
    document.getElementById("msg").textContent=
      "« "+prog.programName+" » ajouté ("+prog.lots.length+" lot(s)).";
  }catch(e){
    document.getElementById("ico").textContent="❌";
    document.getElementById("ttl").textContent="Erreur";
    document.getElementById("msg").textContent="Impossible d'enregistrer : "+e.message;
  }
  document.getElementById("lnk").style.display="inline-block";
  setTimeout(function(){window.location.replace("/collecteur");},1800);
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
a{color:#1e40af}</style>
</head><body><div class="c">
<div style="font-size:48px;margin-bottom:12px">❌</div>
<h1>Erreur</h1><p>${safe}</p>
<a href="/collecteur">Retour au collecteur</a>
</div></body></html>`;
}
