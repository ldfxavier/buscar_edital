import fs from 'fs';
import path from 'path';
import { Redis } from '@upstash/redis';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'licitacoes.json');
const TEMP_FILE = path.join(DATA_DIR, 'licitacoes.json.tmp');
const REDIS_KEY = 'licitacoes:store';

// Inicialização opcional do Redis do Upstash / Vercel KV
let redisClient = null;
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (redisUrl && redisToken) {
  try {
    redisClient = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    console.log('[STORAGE] Modo de armazenamento ativo: Upstash Redis / Vercel KV (Nuvem)');
  } catch (e) {
    console.warn('[STORAGE] Erro ao conectar no Redis, alternando para arquivo local:', e);
  }
} else {
  console.log('[STORAGE] Modo de armazenamento ativo: Arquivo JSON Local (Disco)');
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const DEFAULT_STORE = {
  lastSync: null,
  lastSyncStatus: 'never',
  lastSyncMessage: 'Nenhuma sincronização realizada ainda.',
  isSyncing: false,
  totalBids: 0,
  bids: []
};

/**
 * Lê a base de dados (Redis se configurado, ou Arquivo Local JSON).
 */
export async function readStore() {
  if (redisClient) {
    try {
      const data = await redisClient.get(REDIS_KEY);
      if (!data) return { ...DEFAULT_STORE };
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return {
        lastSync: parsed.lastSync || null,
        lastSyncStatus: parsed.lastSyncStatus || 'never',
        lastSyncMessage: parsed.lastSyncMessage || '',
        isSyncing: Boolean(parsed.isSyncing),
        totalBids: Array.isArray(parsed.bids) ? parsed.bids.length : 0,
        bids: Array.isArray(parsed.bids) ? parsed.bids : []
      };
    } catch (err) {
      console.error('[STORAGE] Erro ao ler do Upstash Redis:', err);
    }
  }

  // Fallback para Arquivo Local
  try {
    ensureDataDir();
    if (!fs.existsSync(STORE_FILE)) {
      return { ...DEFAULT_STORE };
    }
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return {
      lastSync: data.lastSync || null,
      lastSyncStatus: data.lastSyncStatus || 'never',
      lastSyncMessage: data.lastSyncMessage || '',
      isSyncing: Boolean(data.isSyncing),
      totalBids: Array.isArray(data.bids) ? data.bids.length : 0,
      bids: Array.isArray(data.bids) ? data.bids : []
    };
  } catch (err) {
    console.error('[STORAGE] Erro ao ler a base de dados local:', err);
    return { ...DEFAULT_STORE };
  }
}

/**
 * Grava na base de dados (Redis se configurado, ou Arquivo Local JSON).
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

  if (redisClient) {
    try {
      await redisClient.set(REDIS_KEY, JSON.stringify(payload));
      return;
    } catch (err) {
      console.error('[STORAGE] Erro ao salvar no Upstash Redis:', err);
    }
  }

  // Fallback para Arquivo Local
  try {
    ensureDataDir();
    const content = JSON.stringify(payload, null, 2);
    fs.writeFileSync(TEMP_FILE, content, 'utf-8');
    fs.renameSync(TEMP_FILE, STORE_FILE);
  } catch (err) {
    console.error('[STORAGE] Erro ao salvar base de dados local:', err);
    throw err;
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
 * Salva novos dados de licitações fazendo fusão e deduplicação por numeroControlePNCP.
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
  store.lastSyncMessage = syncMessage || `Sincronização concluída. ${countAdded} novos editais adicionados. Total: ${consolidatedBids.length}`;
  store.isSyncing = false;

  await writeStore(store);

  return {
    totalBids: store.totalBids,
    addedCount: countAdded,
    lastSync: store.lastSync
  };
}
