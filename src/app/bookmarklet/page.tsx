"use client";

import { useEffect, useState } from "react";

export default function BookmarkletPage() {
  const [href, setHref] = useState<string>("#");
  const [collectUrl, setCollectUrl] = useState<string>("");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const origin = window.location.origin;
    const url = origin + "/api/neuf/collect";
    setCollectUrl(url);

    fetch("/selogerneuf-bookmarklet-collect.js")
      .then((r) => r.text())
      .then((code) => {
        const filled = code.replace("'__COLLECT_URL__'", JSON.stringify(url));
        setHref("javascript:" + encodeURIComponent(filled));
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(collectUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-700 rounded-lg p-2">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Bookmarklet SeLoger Neuf</h1>
              <p className="text-blue-300 text-xs">Collecteur automatique — sans installation</p>
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <a href="/collecteur" className="text-blue-200 hover:text-white underline">
              Mes programmes →
            </a>
            <a href="/" className="text-blue-200 hover:text-white underline">
              Analyse →
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Main CTA */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm space-y-5">
          <div className="text-5xl">⭐</div>
          <h2 className="text-xl font-bold text-gray-900">
            Glissez ce lien dans votre barre de favoris
          </h2>
          <p className="text-gray-500 text-sm max-w-lg mx-auto">
            Faites glisser le bouton ci-dessous vers votre barre de favoris Chrome. Ensuite, depuis
            n&apos;importe quelle page programme SeLoger Neuf, cliquez dessus pour envoyer
            automatiquement le programme dans votre collecteur.
          </p>

          {!ready ? (
            <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 rounded-xl text-gray-500 text-sm">
              <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />
              Chargement…
            </div>
          ) : href === "#" ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              Impossible de charger le bookmarklet. Rechargez la page.
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {/* The drag-to-bookmark link */}
              <a
                href={href}
                draggable
                onClick={(e) => {
                  e.preventDefault();
                  alert(
                    "Glissez ce bouton vers votre barre de favoris plutôt que de cliquer.\n\n" +
                    "Si la barre n'est pas visible : Ctrl+Maj+B (Chrome)."
                  );
                }}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white font-bold text-base rounded-xl shadow-md cursor-grab active:cursor-grabbing select-none transition-colors"
              >
                <span>★</span>
                <span>SeLoger Neuf → Collecteur</span>
              </a>
              <p className="text-xs text-gray-400">
                Cliquez et maintenez · Faites glisser vers la barre de favoris
              </p>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-2xl border border-gray-200 p-7 space-y-5 shadow-sm">
          <h3 className="font-bold text-gray-900 text-base">Comment utiliser</h3>
          <ol className="space-y-4 text-sm text-gray-700">
            {[
              {
                n: "1",
                title: "Installez le bookmarklet",
                desc: "Glissez le bouton ⭐ ci-dessus vers votre barre de favoris Chrome. Si elle n'est pas visible : Ctrl+Maj+B.",
              },
              {
                n: "2",
                title: "Ouvrez une page programme SeLoger Neuf",
                desc: "Naviguez jusqu'à la page détail d'un programme sur selogerneuf.com.",
              },
              {
                n: "3",
                title: "Cliquez sur le bookmarklet",
                desc: "Cliquez sur « SeLoger Neuf → Collecteur » dans vos favoris. Un overlay apparaît brièvement sur la page, puis un nouvel onglet s'ouvre pour confirmer l'import.",
              },
              {
                n: "4",
                title: "Répétez pour chaque programme",
                desc: "Ouvrez autant de pages que nécessaire et cliquez le bookmarklet sur chacune.",
              },
              {
                n: "5",
                title: "Exportez l'Excel",
                desc: "Rendez-vous dans le Collecteur pour voir tous vos programmes et télécharger l'analyse Excel.",
              },
            ].map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="shrink-0 w-7 h-7 bg-blue-700 text-white rounded-full flex items-center justify-center text-xs font-bold">
                  {s.n}
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{s.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Technical info */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm">Informations techniques</h3>
          <div className="space-y-2 text-xs text-gray-600">
            <div className="flex items-start gap-2">
              <span className="font-medium text-gray-700 shrink-0">URL de collecte :</span>
              <div className="flex items-center gap-2 min-w-0">
                <code className="bg-gray-100 px-2 py-0.5 rounded font-mono break-all">
                  {collectUrl || "—"}
                </code>
                {collectUrl && (
                  <button
                    onClick={copyUrl}
                    className="shrink-0 text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {copied ? "✓" : "Copier"}
                  </button>
                )}
              </div>
            </div>
            <p className="text-gray-500">
              Le bookmarklet envoie les données via un formulaire POST vers cette URL. Les programmes
              sont stockés dans le <code className="bg-gray-100 px-1 rounded font-mono">localStorage</code>{" "}
              de votre navigateur — aucune base de données, aucune donnée envoyée à un tiers.
            </p>
            <p className="text-gray-500">
              Compatible Chrome, Edge, Firefox. Fonctionne uniquement sur les pages
              <code className="bg-gray-100 px-1 rounded font-mono">selogerneuf.com</code>.
            </p>
          </div>
        </div>

        {/* Backward compat note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="font-semibold text-amber-900 text-sm mb-2">
            Ancien workflow toujours disponible
          </h3>
          <p className="text-xs text-amber-800">
            L&apos;import manuel par copier-coller de JSON reste disponible dans la page d&apos;analyse
            principale (bouton &laquo;&nbsp;Importer les lots&nbsp;&raquo; sur chaque programme). Le nouveau
            bookmarklet est un complément, pas un remplacement.
          </p>
        </div>
      </div>
    </main>
  );
}
