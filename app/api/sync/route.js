import { NextResponse } from 'next/server';
import { getStoreMetaData } from '../../../lib/storage';
import { syncWithPncp, initPeriodicSync } from '../../../lib/sync';

// Garante a inicialização do agendador em background ao primeiro acesso à rota
initPeriodicSync(30);

export async function GET() {
  try {
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
    const daysBack = body.daysBack ? parseInt(body.daysBack, 10) : 45;

    // Dispara a sincronização
    const result = await syncWithPncp({ daysBack });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Erro ao executar sincronização manual: ' + error.message
    }, { status: 500 });
  }
}
