import { readStore, mergeAndSaveBids, setSyncingState } from './storage.js';

const PNCP_CONSULTA_BASE = 'https://pncp.gov.br/api/consulta/v1';
const DEFAULT_MODALITIES = [4, 6, 8, 9];

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
 * Executa a sincronização com a API do PNCP e atualiza a base local.
 */
export async function syncWithPncp(options = {}) {
  if (isSyncInProgress) {
    console.log('Sincronização com PNCP já está em andamento...');
    return { success: false, message: 'Sincronização já está em andamento.' };
  }

  isSyncInProgress = true;
  await setSyncingState(true, 'Buscando dados atualizados no PNCP...');

  try {
    const daysBack = options.daysBack || 45; // Padrão de 45 dias atrás
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);

    const dataInicial = formatPncpDate(start);
    const dataFinal = formatPncpDate(end);

    const fetchHeaders = {
      'User-Agent': 'busca-portal/1.0',
      'Accept': 'application/json',
    };

    console.log(`[SYNC] Iniciando busca no PNCP de ${dataInicial} até ${dataFinal}...`);

    const fetchedBids = [];
    let errorCount = 0;
    const modalities = options.modalities || DEFAULT_MODALITIES;
    const maxPagesPerModality = options.maxPages || 6; // Até 6 páginas de 50 itens = 300 por modalidade (até 1.200 brutos por ciclo)

    for (const modalityId of modalities) {
      console.log(`[SYNC] Consultando modalidade ${modalityId}...`);

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
          await delay(350); // Delay seguro entre requisições para evitar rate limit
          const response = await fetch(url, { headers: fetchHeaders });

          if (!response.ok) {
            console.warn(`[SYNC] Resposta não OK (${response.status}) para modalidade ${modalityId}, página ${page}`);
            errorCount++;
            if (response.status === 429 || response.status === 504) {
              // Pausa mais longa se houver rate limit ou timeout
              await delay(1500);
            }
            continue;
          }

          const json = await response.json();
          const items = json.data || [];

          if (items.length === 0) {
            // Não há mais resultados nesta modalidade
            break;
          }

          fetchedBids.push(...items);

          // Se a quantidade de páginas total for menor que a página atual, interrompe o loop dessa modalidade
          if (json.totalPaginas && page >= json.totalPaginas) {
            break;
          }
        } catch (err) {
          console.error(`[SYNC] Erro na consulta (modalidade ${modalityId}, página ${page}):`, err.message);
          errorCount++;
        }
      }
    }

    console.log(`[SYNC] Total de registros coletados do PNCP: ${fetchedBids.length}`);

    if (fetchedBids.length === 0 && errorCount > 0) {
      const msg = 'Não foi possível obter dados do PNCP (Portal instável). Mantendo base salva anterior.';
      await setSyncingState(false, msg);
      isSyncInProgress = false;
      return { success: false, message: msg };
    }

    // Salvar e fazer merge na base local
    const syncResult = await mergeAndSaveBids(
      fetchedBids,
      `Sincronização concluída com sucesso. Coletados ${fetchedBids.length} editais do PNCP.`,
      'success'
    );

    isSyncInProgress = false;
    return {
      success: true,
      message: `Sincronização realizada com sucesso! Total na base: ${syncResult.totalBids} (${syncResult.addedCount} novos editais).`,
      meta: syncResult
    };
  } catch (globalError) {
    console.error('[SYNC] Erro fatal durante a sincronização:', globalError);
    isSyncInProgress = false;
    const errorMsg = `Erro na sincronização: ${globalError.message}`;
    setSyncingState(false, errorMsg);
    return { success: false, message: errorMsg };
  }
}

/**
 * Inicia o agendador periódico de sincronização automática em background.
 */
export function initPeriodicSync(intervalMinutes = 30) {
  if (periodicIntervalId) return;

  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[SYNC] Inicializando agendador automático a cada ${intervalMinutes} minutos...`);

  // Executa uma checagem inicial se a base estiver vazia ou se a última sincronização foi há mais de 1 hora
  setTimeout(async () => {
    try {
      const store = await readStore();
      const now = new Date().getTime();
      const lastSyncTime = store.lastSync ? new Date(store.lastSync).getTime() : 0;
      const oneHour = 60 * 60 * 1000;

      if (store.totalBids === 0 || (now - lastSyncTime) > oneHour) {
        console.log('[SYNC] Executando sincronização inicial automática...');
        await syncWithPncp();
      }
    } catch (err) {
      console.error('[SYNC] Erro na checagem inicial:', err);
    }
  }, 1000);

  periodicIntervalId = setInterval(() => {
    console.log('[SYNC] Executando sincronização periódica programada...');
    syncWithPncp().catch(err => console.error('[SYNC] Erro na sincronização periódica:', err));
  }, intervalMs);
}
