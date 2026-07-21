import { NextResponse } from 'next/server';
import { getStoreMetaData } from '../../../lib/storage';
import { syncWithPncp, initPeriodicSync } from '../../../lib/sync';

// Garante a inicialização do agendador em background
initPeriodicSync(30);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const shouldSync = searchParams.get('sync') === 'true' || searchParams.get('force') === 'true';

    if (shouldSync) {
      // Coleta otimizada para Serverless (tempo < 5s)
      const result = await syncWithPncp({ daysBack: 14, maxPages: 2, modalities: [4, 6, 8, 9] });
      return NextResponse.json(result);
    }

    const meta = await getStoreMetaData();
    return NextResponse.json({
      success: true,
      meta
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro ao consultar status da base local: ' + error.message
    }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const daysBack = body.daysBack ? parseInt(body.daysBack, 10) : 14;
    const maxPages = body.maxPages ? parseInt(body.maxPages, 10) : 2;
    const modalities = body.modalities || [4, 6, 8, 9];

    // Dispara a sincronização rápida otimizada para limites da Vercel (Serverless < 5s)
    const result = await syncWithPncp({ daysBack, maxPages, modalities });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Erro ao executar sincronização manual: ' + error.message
    }, { status: 500 });
  }
}
