import { NextRequest, NextResponse } from 'next/server';
import type { NeufExportRequest } from '@/lib/neuf/types';

export async function POST(req: NextRequest) {
  try {
    const body: NeufExportRequest = await req.json();

    if (!body.programmes || !Array.isArray(body.programmes) || body.programmes.length === 0) {
      return NextResponse.json(
        { error: 'Le champ "programmes" est requis et ne doit pas être vide.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      recu: {
        titre: body.titre ?? null,
        ville_principale: body.ville_principale ?? null,
        nb_programmes: body.programmes.length,
        programmes: body.programmes.map((p) => ({
          nom: p.nom ?? p.programName ?? p.name ?? null,
          ville: p.ville ?? p.city ?? null,
          nb_logements: p.nb_logements ?? p.totalUnits ?? null,
          nb_disponibles: p.nb_disponibles ?? p.availableUnits ?? null,
          nb_lots: p.lots?.length ?? 0,
        })),
      },
    });
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }
}
