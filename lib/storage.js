import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Redis } from '@upstash/redis';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'licitacoes.json');
const TEMP_FILE = path.join(DATA_DIR, 'licitacoes.json.tmp');
const REDIS_KEY = 'licitacoes:store';

function compressData(obj) {
  try {
    const jsonStr = JSON.stringify(obj);
    const buffer = zlib.gzipSync(jsonStr);
    return 'gz:' + buffer.toString('base64');
  } catch (err) {
    console.error('[STORAGE] Erro ao compactar dados com gzip:', err.message);
    return JSON.stringify(obj);
  }
}

function decompressData(data) {
  if (!data) return null;
  if (typeof data === 'string' && data.startsWith('gz:')) {
    try {
      const base64Str = data.slice(3);
      const buffer = Buffer.from(base64Str, 'base64');
      const decompressed = zlib.gunzipSync(buffer).toString('utf-8');
      return JSON.parse(decompressed);
    } catch (err) {
      console.error('[STORAGE] Erro ao descompactar dados do Redis:', err.message);
      return null;
    }
  }
  return typeof data === 'string' ? JSON.parse(data) : data;
}

function getModalidadeId(b) {
  if (!b) return null;
  if (b.modalidadeId != null) return Number(b.modalidadeId);
  if (b.codigoModalidadeContratacao != null) return Number(b.codigoModalidadeContratacao);
  if (b.modalidadeIdContratacao != null) return Number(b.modalidadeIdContratacao);
  if (b.numeroControlePNCP) {
    const parts = b.numeroControlePNCP.split('-');
    if (parts.length >= 2) {
      const code = parseInt(parts[1], 10);
      if (!isNaN(code)) return code;
    }
  }
  return null;
}

function pruneBid(b) {
  if (!b) return null;
  const modId = getModalidadeId(b);
  return {
    numeroControlePNCP: b.numeroControlePNCP,
    modalidadeId: modId,
    codigoModalidadeContratacao: modId,
    objetoCompra: b.objetoCompra,
    informacaoComplementar: b.informacaoComplementar,
    anoCompra: b.anoCompra,
    sequencialCompra: b.sequencialCompra,
    valorTotalEstimado: b.valorTotalEstimado,
    valorTotalHomologado: b.valorTotalHomologado,
    dataPublicacaoPncp: b.dataPublicacaoPncp,
    dataAberturaProposta: b.dataAberturaProposta,
    dataEncerramentoProposta: b.dataEncerramentoProposta,
    modalidadeNome: b.modalidadeNome,
    canalOrigem: b.canalOrigem,
    linkSistemaOrigem: b.linkSistemaOrigem,
    orgaoEntidade: b.orgaoEntidade ? {
      cnpj: b.orgaoEntidade.cnpj,
      razaoSocial: b.orgaoEntidade.razaoSocial,
      esferaId: b.orgaoEntidade.esferaId
    } : null,
    unidadeOrgao: b.unidadeOrgao ? {
      nomeUnidade: b.unidadeOrgao.nomeUnidade,
      ufSigla: b.unidadeOrgao.ufSigla,
      municipioNome: b.unidadeOrgao.municipioNome,
      codigoUnidade: b.unidadeOrgao.codigoUnidade
    } : null
  };
}

/**
 * Obtém dinamicamente o cliente Redis do Upstash a partir das variáveis de ambiente (com higienização de aspas).
 */
function getRedisClient() {
  let url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  let token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    try {
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const urlMatch = envContent.match(/UPSTASH_REDIS_REST_URL=["']?([^"'\r\n]+)["']?/);
        const tokenMatch = envContent.match(/UPSTASH_REDIS_REST_TOKEN=["']?([^"'\r\n]+)["']?/);
        if (urlMatch) url = urlMatch[1];
        if (tokenMatch) token = tokenMatch[1];
      }
    } catch (e) {
      // ignore
    }
  }

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

  const getNewerDateStr = (d1, d2) => {
    if (!d1) return d2;
    if (!d2) return d1;
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    if (isNaN(t1)) return d2;
    if (isNaN(t2)) return d1;
    return t1 >= t2 ? d1 : d2;
  };

  // 1. Tenta ler do Redis (Nuvem)
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      const rawData = await redisClient.get(REDIS_KEY);
      if (rawData) {
        const parsed = decompressData(rawData);
        if (parsed) {
          if (parsed.lastSync) lastSync = getNewerDateStr(lastSync, parsed.lastSync);
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
      if (data.lastSync) lastSync = getNewerDateStr(lastSync, data.lastSync);
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

  // Trava de segurança: Se isSyncing ficou marcado como true há mais de 3 minutos, reseta e salva automaticamente
  if (isSyncing && lastSync) {
    const lastSyncTime = new Date(lastSync).getTime();
    const now = Date.now();
    if (!isNaN(lastSyncTime) && (now - lastSyncTime) > 3 * 60 * 1000) {
      console.warn('[STORAGE] Detectado isSyncing expirado por timeout. Redefinindo e salvando false.');
      isSyncing = false;
      writeStore({
        lastSync,
        lastSyncStatus,
        lastSyncMessage: 'Sincronização concluída (Estado redefinido após timeout).',
        isSyncing: false,
        bids: consolidatedBids
      }).catch(err => console.error('[STORAGE] Erro ao persistir reset:', err.message));
    }
  }

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
  const rawBids = Array.isArray(storeData.bids) ? storeData.bids : [];
  const prunedBids = rawBids.map(pruneBid).filter(Boolean);

  const payload = {
    lastSync: storeData.lastSync,
    lastSyncStatus: storeData.lastSyncStatus,
    lastSyncMessage: storeData.lastSyncMessage,
    isSyncing: Boolean(storeData.isSyncing),
    totalBids: prunedBids.length,
    bids: prunedBids
  };

  const redisClient = getRedisClient();
  let savedToRedis = false;

  // 1. Gravar no Redis (Nuvem Upstash) com compactação Gzip
  if (redisClient) {
    try {
      const compressedPayload = compressData(payload);
      await redisClient.set(REDIS_KEY, compressedPayload);
      savedToRedis = true;
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
  if (!isSyncing) {
    store.lastSync = new Date().toISOString();
  }
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
