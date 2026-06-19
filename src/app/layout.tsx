import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeLoger Neuf — Analyse offre neuve",
  description:
    "Outil d'analyse de l'offre de logements neufs à partir de SeLoger Neuf. Génère un fichier Excel professionnel par adresse.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-gray-50 font-sans antialiased">{children}</body>
    </html>
  );
}
