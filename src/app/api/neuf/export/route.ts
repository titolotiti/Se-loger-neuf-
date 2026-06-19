import { NextRequest, NextResponse } from "next/server";
import { exportToExcel } from "@/lib/neuf/exportExcel";
import type { NeufAnalysisResult } from "@/types/neuf";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let result: NeufAnalysisResult;

  try {
    result = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide (JSON attendu)" }, { status: 400 });
  }

  if (!result?.geocodedAddress || !result?.programs) {
    return NextResponse.json(
      { error: "Données d'analyse manquantes ou invalides" },
      { status: 422 }
    );
  }

  try {
    const buffer = await exportToExcel(result);

    const city = result.geocodedAddress.city
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_");
    const date = new Date().toISOString().slice(0, 10);
    const filename = `seloger_neuf_${city}_${date}.xlsx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("[export] Erreur génération Excel:", err);
    return NextResponse.json(
      { error: "Erreur lors de la génération du fichier Excel" },
      { status: 500 }
    );
  }
}
