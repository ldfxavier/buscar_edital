import { readStore, mergeAndSaveBids, setSyncingState } from './storage.js';

const PNCP_CONSULTA_BASE = 'https://pncp.gov.br/api/consulta/v1';

// Modalidades Oficiais de Contratação Pública no Brasil
const ALL_MODALITIES = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function formatPncpDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let isSyncInProgress = false;
let periodicIntervalId = null;

/**
 * Identifica o canal de origem do edital a partir dos metadados e link do sistema.
 */
function detectChannel(bid) {
  const link = (bid.linkSistemaOrigem || '').toLowerCase();
  const orgao = (bid.orgaoEntidade?.razaoSocial || '').toLowerCase();

  if (link.includes('comprasnet') || link.includes('serpro.gov.br') || link.includes('comprasgovernamentais')) {
    return 'Compras.gov.br';
  }
  if (link.includes('licitanet')) {
    return 'LicitaNet';
  }
  if (link.includes('bnccompras')) {
    return 'BNC Compras';
  }
  if (link.includes('portaldecompraspublicas')) {
    return 'Portal Compras Públicas';
  }
  if (link.includes('comprasbr')) {
    return 'Compras BR';
  }
  if (link.includes('bec.sp.gov.br')) {
    return 'BEC-SP';
  }
  if (bid.orgaoEntidade?.esferaId === 'F' || orgao.includes('federal') || orgao.includes('ministerio')) {
    return 'Compras.gov.br';
  }

  return 'Portal Nacional';
}

/**
 * Coletor Multicanal: busca de dados no PNCP e portais integrados.
 */
export async function syncWithPncp(options = {}) {
  if (isSyncInProgress) {
    console.log('[MULTICANAL] Sincronização já está em andamento...');
    return { success: false, message: 'Sincronização já está em andamento.' };
  }

  isSyncInProgress = true;
  await setSyncingState(true, 'Coletando dados de múltiplos canais e modalidades...');

  try {
    const end = new Date();
    let start;
    let periodDesc = '';

    // Se a opção currentMonthOnly for explicitamente true ou se não for informado daysBack, sincroniza apenas o mês atual
    const isCurrentMonth = options.currentMonthOnly !== undefined 
      ? Boolean(options.currentMonthOnly) 
      : (!options.daysBack);

    if (isCurrentMonth) {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
      const monthName = end.toLocaleString('pt-BR', { month: 'long' });
      const monthCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      periodDesc = `Mês Atual (${monthCapitalized}/${end.getFullYear()})`;
    } else {
      const daysBack = parseInt(options.daysBack, 10) || 45;
      start = new Date();
      start.setDate(end.getDate() - daysBack);
      periodDesc = `Últimos ${daysBack} dias`;
    }

    const dataInicial = formatPncpDate(start);
    const dataFinal = formatPncpDate(end);

    const fetchHeaders = {
      'User-Agent': 'busca-portal-multicanal/1.0',
      'Accept': 'application/json',
    };

    console.log(`[MULTICANAL] Iniciando coleta multicanal [${periodDesc}] de ${dataInicial} até ${dataFinal}...`);

    const fetchedBids = [];
    const channelCounts = {};
    let errorCount = 0;
    const modalities = options.modalities || ALL_MODALITIES;
    const maxPagesPerModality = options.maxPages || 2;

    const fetchPage = async (modalityId, page) => {
      const queryParams = new URLSearchParams({
        dataInicial,
        dataFinal,
        codigoModalidadeContratacao: modalityId.toString(),
        pagina: page.toString(),
        tamanhoPagina: '50',
      });

      const url = `${PNCP_CONSULTA_BASE}/contratacoes/publicacao?${queryParams.toString()}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const response = await fetch(url, { 
          headers: fetchHeaders,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          errorCount++;
          return [];
        }

        const json = await response.json();
        return json.data || [];
      } catch (err) {
        errorCount++;
        return [];
      }
    };

    // Dispara consultas em paralelo para garantir execução ultra-rápida na Vercel (< 3 segundos)
    const tasks = [];
    for (const modalityId of modalities) {
      for (let page = 1; page <= maxPagesPerModality; page++) {
        tasks.push(fetchPage(modalityId, page));
      }
    }

    console.log(`[MULTICANAL] Disparando ${tasks.length} requisições paralelas...`);
    const results = await Promise.all(tasks);

    for (const items of results) {
      for (const item of items) {
        if (item && item.numeroControlePNCP) {
          const channel = detectChannel(item);
          item.canalOrigem = channel;
          channelCounts[channel] = (channelCounts[channel] || 0) + 1;
          fetchedBids.push(item);
        }
      }
    }

    console.log(`[MULTICANAL] Coleta finalizada (${periodDesc}). Total obtido: ${fetchedBids.length}`, channelCounts);

    if (fetchedBids.length === 0 && errorCount > 0) {
      const msg = 'Não foi possível obter novos dados no momento (Servidor instável). Base mantida.';
      await setSyncingState(false, msg);
      isSyncInProgress = false;
      return { success: false, message: msg };
    }

    // Salvar e consolidar na base local
    const syncResult = await mergeAndSaveBids(
      fetchedBids,
      `Coleta Multicanal (${periodDesc}) concluída com sucesso! ${fetchedBids.length} editais processados de ${Object.keys(channelCounts).length} canais.`,
      'success'
    );

    isSyncInProgress = false;
    return {
      success: true,
      message: `Coleta Multicanal (${periodDesc}) concluída! Total na base: ${syncResult.totalBids} (${syncResult.addedCount} novos editais).`,
      meta: {
        ...syncResult,
        periodo: periodDesc,
        canais: channelCounts
      }
    };
  } catch (globalError) {
    console.error('[MULTICANAL] Erro fatal durante a coleta:', globalError);
    const errorMsg = `Erro na coleta multicanal: ${globalError.message}`;
    await setSyncingState(false, errorMsg);
    return { success: false, message: errorMsg };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Agendador desativado: a sincronização é disparada exclusivamente via Vercel Cron ou acionamento manual da URL.
 */
export function initPeriodicSync() {
  // Desativado por padrão
}
