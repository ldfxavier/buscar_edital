import fs from 'fs';
import path from 'path';
import { Redis } from '@upstash/redis';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'licitacoes.json');
const TEMP_FILE = path.join(DATA_DIR, 'licitacoes.json.tmp');
const REDIS_KEY = 'licitacoes:store';

/**
 * Obtém dinamicamente o cliente Redis do Upstash a partir das variáveis de ambiente (com higienização de aspas).
 */
function getRedisClient() {
  let url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  let token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (url) url = url.replace(/^["']|["']$/g, '').trim();
  if (token) token = token.replace(/^["']|["']$/g, '').trim();

  if (url && token) {
    try {
      return new Redis({ url, token });
    } catch (e) {
      console.warn('[STORAGE] Erro ao instanciar cliente Redis:', e.message);
      return null;
    }
  }
  return null;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Lê a base de dados combinando Redis (Nuvem) E Arquivo JSON Local (para GARANTIR acúmulo total e NUNCA perder editais).
 */
export async function readStore() {
  const existingMap = new Map();
  let lastSync = null;
  let lastSyncStatus = 'never';
  let lastSyncMessage = 'Nenhuma sincronização realizada ainda.';
  let isSyncing = false;

  // 1. Tenta ler do Redis (Nuvem)
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const data = await redisClient.get(REDIS_KEY);
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (parsed.lastSync) lastSync = parsed.lastSync;
        if (parsed.lastSyncStatus) lastSyncStatus = parsed.lastSyncStatus;
        if (parsed.lastSyncMessage) lastSyncMessage = parsed.lastSyncMessage;
        if (parsed.isSyncing !== undefined) isSyncing = Boolean(parsed.isSyncing);
        if (Array.isArray(parsed.bids)) {
          for (const bid of parsed.bids) {
            if (bid && bid.numeroControlePNCP) {
              existingMap.set(bid.numeroControlePNCP, bid);
            }
          }
        }
      }
    } catch (err) {
      console.error('[STORAGE] Erro ao ler do Upstash Redis:', err.message);
    }
  }

  // 2. Tenta ler do Arquivo Local JSON (combina com os dados do Redis para que NUNCA haja perda)
  try {
    ensureDataDir();
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (!lastSync && data.lastSync) lastSync = data.lastSync;
      if (lastSyncStatus === 'never' && data.lastSyncStatus) lastSyncStatus = data.lastSyncStatus;
      if (!lastSyncMessage && data.lastSyncMessage) lastSyncMessage = data.lastSyncMessage;
      if (Array.isArray(data.bids)) {
        for (const bid of data.bids) {
          if (bid && bid.numeroControlePNCP) {
            if (!existingMap.has(bid.numeroControlePNCP)) {
              existingMap.set(bid.numeroControlePNCP, bid);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[STORAGE] Erro ao ler arquivo local licitacoes.json:', err.message);
  }

  const consolidatedBids = Array.from(existingMap.values()).sort((a, b) => {
    const dateA = new Date(a.dataPublicacaoPncp || 0);
    const dateB = new Date(b.dataPublicacaoPncp || 0);
    return dateB - dateA;
  });

  return {
    lastSync,
    lastSyncStatus,
    lastSyncMessage,
    isSyncing,
    totalBids: consolidatedBids.length,
    bids: consolidatedBids
  };
}

/**
 * Grava na base de dados (Salva no Upstash Redis E no Arquivo Local JSON quando em localhost).
 */
export async function writeStore(storeData) {
  const payload = {
    lastSync: storeData.lastSync,
    lastSyncStatus: storeData.lastSyncStatus,
    lastSyncMessage: storeData.lastSyncMessage,
    isSyncing: Boolean(storeData.isSyncing),
    totalBids: Array.isArray(storeData.bids) ? storeData.bids.length : 0,
    bids: Array.isArray(storeData.bids) ? storeData.bids : []
  };

  const redisClient = getRedisClient();
  let savedToRedis = false;

  // 1. Gravar no Redis (Nuvem Upstash)
  if (redisClient) {
    try {
      await redisClient.set(REDIS_KEY, JSON.stringify(payload));
      savedToRedis = true;
      console.log(`[STORAGE] Dados salvos com SUCESSO no Upstash Redis (${payload.totalBids} editais acumulados).`);
    } catch (err) {
      console.error('[STORAGE] Erro ao salvar no Upstash Redis:', err.message);
      if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        throw new Error('Falha ao gravar no Redis da Vercel: ' + err.message);
      }
    }
  }

  // Se estamos na Vercel e não foi possível gravar no Redis, lançar erro
  if ((process.env.VERCEL || process.env.NODE_ENV === 'production') && !savedToRedis) {
    throw new Error('Credenciais do Upstash Redis (UPSTASH_REDIS_REST_URL) ausentes ou inválidas na Vercel.');
  }

  // 2. Gravar no Arquivo Local JSON (Apenas quando não estamos na Vercel / ambiente local)
  if (!process.env.VERCEL) {
    try {
      ensureDataDir();
      const content = JSON.stringify(payload, null, 2);
      fs.writeFileSync(TEMP_FILE, content, 'utf-8');
      fs.renameSync(TEMP_FILE, STORE_FILE);
      console.log(`[STORAGE] Dados também salvos no arquivo local licitacoes.json (${payload.totalBids} editais acumulados).`);
    } catch (err) {
      console.error('[STORAGE] Erro ao salvar cópia local em licitacoes.json:', err.message);
    }
  }
}

/**
 * Retorna os metadados da base.
 */
export async function getStoreMetaData() {
  const store = await readStore();
  return {
    lastSync: store.lastSync,
    lastSyncStatus: store.lastSyncStatus,
    lastSyncMessage: store.lastSyncMessage,
    isSyncing: store.isSyncing,
    totalBids: store.totalBids
  };
}

/**
 * Atualiza o sinalizador de sincronização em andamento.
 */
export async function setSyncingState(isSyncing, message = '') {
  const store = await readStore();
  store.isSyncing = isSyncing;
  if (message) store.lastSyncMessage = message;
  await writeStore(store);
}

/**
 * Salva novos dados de licitações fazendo fusão cumulativa e deduplicação por numeroControlePNCP.
 */
export async function mergeAndSaveBids(newBids, syncMessage = '', status = 'success') {
  const store = await readStore();
  const existingMap = new Map();

  for (const bid of store.bids) {
    if (bid && bid.numeroControlePNCP) {
      existingMap.set(bid.numeroControlePNCP, bid);
    }
  }

  let countAdded = 0;
  for (const bid of newBids) {
    if (bid && bid.numeroControlePNCP) {
      if (!existingMap.has(bid.numeroControlePNCP)) {
        countAdded++;
      }
      existingMap.set(bid.numeroControlePNCP, bid);
    }
  }

  const consolidatedBids = Array.from(existingMap.values()).sort((a, b) => {
    const dateA = new Date(a.dataPublicacaoPncp || 0);
    const dateB = new Date(b.dataPublicacaoPncp || 0);
    return dateB - dateA;
  });

  store.bids = consolidatedBids;
  store.totalBids = consolidatedBids.length;
  store.lastSync = new Date().toISOString();
  store.lastSyncStatus = status;
  store.lastSyncMessage = syncMessage || `Sincronização concluída. ${countAdded} novos editais adicionados. Total acumulado: ${consolidatedBids.length}`;
  store.isSyncing = false;

  await writeStore(store);

  return {
    totalBids: store.totalBids,
    addedCount: countAdded,
    lastSync: store.lastSync
  };
}
