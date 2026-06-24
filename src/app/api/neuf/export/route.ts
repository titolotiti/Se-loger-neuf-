import { NextRequest, NextResponse } from "next/server";
import { exportToExcel, exportCollectedToExcel } from "@/lib/neuf/exportExcel";
import type { NeufAnalysisResult } from "@/types/neuf";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide (JSON attendu)" }, { status: 400 });
  }

  try {
    // ── Format 1 : ExportCollectedPayload { label, programs: CollectedProgram[] }
    if (
      body &&
      typeof body === "object" &&
      "label" in (body as object) &&
      Array.isArray((body as { programs?: unknown }).programs)
    ) {
      const payload = body as { label: string; programs: unknown[] };
      if (!payload.programs.length) {
        return NextResponse.json({ error: "Aucun programme à exporter" }, { status: 422 });
      }
      const buffer = await exportCollectedToExcel(payload as any);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `seloger_neuf_collecte_${date}.xlsx`;
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": buffer.length.toString(),
        },
      });
    }

    // ── Format 2 : NeufAnalysisResult { geocodedAddress, programs, ... }
    const result = body as NeufAnalysisResult;
    if (!result?.geocodedAddress || !result?.programs) {
      return NextResponse.json(
        { error: "Données d'analyse manquantes ou invalides" },
        { status: 422 }
      );
    }

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
