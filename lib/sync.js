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

  return 'PNCP Nacional';
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
    const daysBack = options.daysBack || 45;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);

    const dataInicial = formatPncpDate(start);
    const dataFinal = formatPncpDate(end);

    const fetchHeaders = {
      'User-Agent': 'busca-portal-multicanal/1.0',
      'Accept': 'application/json',
    };

    console.log(`[MULTICANAL] Iniciando coleta multicanal de ${dataInicial} até ${dataFinal}...`);

    const fetchedBids = [];
    const channelCounts = {};
    let errorCount = 0;
    const modalities = options.modalities || ALL_MODALITIES;
    const maxPagesPerModality = options.maxPages || 5;

    for (const modalityId of modalities) {
      console.log(`[MULTICANAL] Consultando modalidade ${modalityId}...`);

      for (let page = 1; page <= maxPagesPerModality; page++) {
        const queryParams = new URLSearchParams({
          dataInicial,
          dataFinal,
          codigoModalidadeContratacao: modalityId.toString(),
          pagina: page.toString(),
          tamanhoPagina: '50',
        });

        const url = `${PNCP_CONSULTA_BASE}/contratacoes/publicacao?${queryParams.toString()}`;

        try {
          await delay(350); // Delay seguro entre requisições
          const response = await fetch(url, { headers: fetchHeaders });

          if (!response.ok) {
            console.warn(`[MULTICANAL] Resposta ${response.status} para modalidade ${modalityId}, página ${page}`);
            errorCount++;
            if (response.status === 429 || response.status === 504) {
              await delay(1500);
            }
            continue;
          }

          const json = await response.json();
          const items = json.data || [];

          if (items.length === 0) {
            break;
          }

          // Enriquecimento com canal de origem
          for (const item of items) {
            const channel = detectChannel(item);
            item.canalOrigem = channel;
            channelCounts[channel] = (channelCounts[channel] || 0) + 1;
            fetchedBids.push(item);
          }

          if (json.totalPaginas && page >= json.totalPaginas) {
            break;
          }
        } catch (err) {
          console.error(`[MULTICANAL] Erro na consulta (modalidade ${modalityId}, página ${page}):`, err.message);
          errorCount++;
        }
      }
    }

    console.log(`[MULTICANAL] Coleta finalizada. Total obtido: ${fetchedBids.length}`, channelCounts);

    if (fetchedBids.length === 0 && errorCount > 0) {
      const msg = 'Não foi possível obter novos dados no momento (Servidor instável). Base mantida.';
      await setSyncingState(false, msg);
      isSyncInProgress = false;
      return { success: false, message: msg };
    }

    // Salvar e consolidar na base local
    const syncResult = await mergeAndSaveBids(
      fetchedBids,
      `Coleta Multicanal concluída com sucesso! ${fetchedBids.length} editais processados de ${Object.keys(channelCounts).length} canais.`,
      'success'
    );

    isSyncInProgress = false;
    return {
      success: true,
      message: `Coleta Multicanal concluída! Total na base: ${syncResult.totalBids} (${syncResult.addedCount} novos editais).`,
      meta: {
        ...syncResult,
        canais: channelCounts
      }
    };
  } catch (globalError) {
    console.error('[MULTICANAL] Erro fatal durante a coleta:', globalError);
    isSyncInProgress = false;
    const errorMsg = `Erro na coleta multicanal: ${globalError.message}`;
    await setSyncingState(false, errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Inicia o agendador periódico do Coletor Multicanal em background.
 */
export function initPeriodicSync(intervalMinutes = 30) {
  if (periodicIntervalId) return;

  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[MULTICANAL] Agendador multicanal ativo a cada ${intervalMinutes} minutos...`);

  setTimeout(async () => {
    try {
      const store = await readStore();
      const now = new Date().getTime();
      const lastSyncTime = store.lastSync ? new Date(store.lastSync).getTime() : 0;
      const oneHour = 60 * 60 * 1000;

      if (store.totalBids === 0 || (now - lastSyncTime) > oneHour) {
        console.log('[MULTICANAL] Executando coleta inicial automática...');
        await syncWithPncp();
      }
    } catch (err) {
      console.error('[MULTICANAL] Erro na checagem inicial:', err);
    }
  }, 1000);

  periodicIntervalId = setInterval(() => {
    console.log('[MULTICANAL] Executando coleta periódica programada...');
    syncWithPncp().catch(err => console.error('[MULTICANAL] Erro na coleta periódica:', err));
  }, intervalMs);
}
