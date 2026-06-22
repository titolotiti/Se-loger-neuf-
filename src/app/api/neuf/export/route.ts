import { NextRequest, NextResponse } from 'next/server';
import type { NeufAnalysisResult } from '@/types/neuf';
import { exportToExcel } from '@/lib/neuf/exportExcel';

export async function POST(req: NextRequest) {
  try {
    const body: NeufAnalysisResult = await req.json();

    if (!body.programs || !Array.isArray(body.programs) || body.programs.length === 0) {
      return NextResponse.json(
        { error: 'Aucun programme à exporter.' },
        { status: 400 }
      );
    }

    const buffer = await exportToExcel(body);

    const city = (body.geocodedAddress?.city ?? 'offre-neuve')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');
    const date = new Date().toISOString().slice(0, 10);
    const filename = `seloger_neuf_${city}_${date}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[export/neuf] Erreur génération Excel :', err);
    return NextResponse.json(
      { error: 'Erreur lors de la génération du fichier Excel.' },
      { status: 500 }
    );
  }
}
