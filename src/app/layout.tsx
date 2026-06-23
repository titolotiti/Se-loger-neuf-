import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neuf Analyzer — SeLoger Neuf",
  description:
    "Analyse de l'offre de logements neufs depuis SeLoger Neuf. Export Excel professionnel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-[#F7F8FA] font-sans antialiased">{children}</body>
    </html>
  );
}
