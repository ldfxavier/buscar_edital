import { NextResponse } from 'next/server';
import { getStoreMetaData } from '../../../lib/storage';
import { syncWithPncp } from '../../../lib/sync';

// Configura tempo limite máximo de execução de Serverless na Vercel (60s)
export const maxDuration = 60;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';
    const isVercelCron = userAgent.includes('vercel-cron') || request.headers.has('x-vercel-cron');
    const shouldSync = isVercelCron || searchParams.get('sync') === 'true' || searchParams.get('force') === 'true' || searchParams.get('run') === 'true';

    if (shouldSync) {
      const currentMonthOnly = searchParams.get('currentMonthOnly') !== 'false';
      const daysBack = searchParams.get('daysBack') ? parseInt(searchParams.get('daysBack'), 10) : null;
      // Coleta otimizada para o mês atual
      const result = await syncWithPncp({ 
        currentMonthOnly: daysBack ? false : currentMonthOnly, 
        daysBack, 
        maxPages: 3, 
        modalities: [4, 6, 8, 9] 
      });
      return NextResponse.json({
        ...result,
        triggeredBy: isVercelCron ? 'Vercel Cron (07:00 AM BRT)' : 'Manual URL Request'
      });
    }

    const meta = await getStoreMetaData();

    const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    return NextResponse.json({
      success: true,
      meta,
      manualSyncUrl: '/api/sync?sync=true',
      cronSchedule: 'Daily at 07:00 AM BRT (10:00 UTC)',
      envCheck: {
        hasRedisUrl: Boolean(redisUrl),
        hasRedisToken: Boolean(redisToken),
        isVercel: Boolean(process.env.VERCEL)
      }
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
    const currentMonthOnly = body.currentMonthOnly !== undefined 
      ? Boolean(body.currentMonthOnly) 
      : (!body.daysBack);
    const daysBack = body.daysBack ? parseInt(body.daysBack, 10) : null;
    const maxPages = body.maxPages ? parseInt(body.maxPages, 10) : 3;
    const modalities = body.modalities || [4, 6, 8, 9];

    // Dispara a sincronização rápida otimizada
    const result = await syncWithPncp({ currentMonthOnly, daysBack, maxPages, modalities });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Erro ao executar sincronização manual: ' + error.message
    }, { status: 500 });
  }
}
