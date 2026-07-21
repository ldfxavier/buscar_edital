import { NextResponse } from 'next/server';
import { readStore } from '../../../lib/storage';
import { syncWithPncp, initPeriodicSync } from '../../../lib/sync';

// Garante o agendador em background
initPeriodicSync(30);

// Palavras-chave mestre para busca de TI (Cobrem software, hardware, peças, redes, suporte, licenças e serviços)
const DEFAULT_TECH_KEYWORDS = [
  'software', 'softwares',
  'desenvolvimento de software', 'desenvolvimento de sistemas', 'desenvolvimento de sistema', 'desenvolvimento web',
  'desenvolvimento de app', 'desenvolvimento de aplicativo', 'criação de software', 'criacao de software', 'desenvolvimento de portal', 'desenvolvimento de site',
  'aluguel de software', 'locação de software', 'licenciamento de software', 'licenciamento de uso', 'licença de uso', 'licenca de uso', 'direito de uso de software', 'cessão de direito de uso',
  'instalação de software', 'instalacao de software', 'instalação de sistema', 'instalacao de sistema', 'instalação de equipamentos de informática',
  'implantação de software', 'implantacao de software', 'customização de software', 'suporte de software', 'manutenção de software',
  'manutenção de computadores', 'manutencao de computadores', 'manutenção de equipamentos de informática', 'assistência técnica em informática', 'assistencia tecnica em informatica',
  'sistema informatizado', 'sistema de informação', 'sistema de informacao', 'sistema de gestão', 'sistema de gestao', 'sistema web', 'sistema de ti',
  'plataforma digital', 'plataforma web', 'plataforma saas', 'plataforma de software', 'plataforma virtual',
  'fábrica de software', 'fabrica de software', 'aplicativo', 'app', 'mobile', 'banco de dados', 'cloud', 'nuvem', 'saas', 'erp', 'crm', 'chatbot',
  'tecnologia da informação', 'tecnologia da informacao', 'tecnologia de informação', 'tecnologia de informacao', 'ti', 'suporte de ti', 'consultoria em ti', 'infraestrutura de ti',
  'computador', 'computadores', 'microcomputador', 'microcomputadores', 'notebook', 'notebooks', 'ultrabook', 'chromebook', 'desktop', 'gabinete', 'processador', 'memoria ram', 'memória ram', 'disco ssd', 'hd externo', 'placa mae', 'placa mãe', 'fonte de alimentação', 'periféricos', 'peças de computador', 'pecas de computador', 'equipamento de informática', 'equipamentos de informática', 'equipamento de informatica', 'equipamentos de informatica', 'impressora', 'impressoras', 'multifuncional', 'nobreak', 'nobreaks', 'estabilizador', 'teclado', 'mouse', 'monitor', 'monitores',
  'servidor de rede', 'servidores de rede', 'servidor de banco de dados', 'roteador', 'switch', 'conectividade', 'rack de ti', 'patch panel',
  'link de internet', 'serviço de internet', 'conexão à internet', 'acesso à internet', 'provedor de internet', 'antena de internet',
  'link dedicado', 'link de dados', 'fibra óptica', 'fibra optica', 'telefonia voip', 'telefonia ip',
  'rede de computadores', 'rede de dados', 'rede lógica', 'rede wi-fi', 'rede sem fio', 'infraestrutura de rede', 'cabeamento estruturado'
];

// Palavras de exclusão específicas (Apenas obras civis ou eventos sem TI)
const DEFAULT_EXCLUSION_KEYWORDS = [
  'drenagem pluvial', 'pavimentação de asfalto', 'recapeamento asfáltico', 'esgotamento sanitário',
  'obras de terraplanagem', 'combate a incêndio predial', 'troca de telhas', 'pintura predial',
  'abastecimento de água tratada', 'parada de ônibus', 'locação de imóvel urbano', 'aluguel de prédio administrativo',
  'show do cantor', 'cantor e seus teclados', 'revisão mecânica de veículo'
];

// Helper para normalizar acentos e caixa de texto
const normalizeText = (str) => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Limpa formatação e tags de metadados dos portais
const cleanText = (text) => {
  if (!text) return '';
  return text
    .replace(/\[portal de compras públicas\]/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ');
};

function matchKeyword(text, keyword) {
  const normText = normalizeText(text);
  const normKw = normalizeText(keyword);
  if (!normKw || !normText) return false;

  // Palavras curtas (ex: ti, app, pc) usam regex de limites de palavra inteira
  if (normKw.length <= 3) {
    const reg = new RegExp(`\\b${normKw}\\b`, 'i');
    return reg.test(normText);
  }

  // Desconsidera falsos positivos isolados como "gabinete do prefeito" ou "conselho regional de medicina (crm)"
  if (normKw === 'gabinete' && normText.includes('gabinete do prefeito') && !normText.includes('computador')) return false;
  if (normKw === 'crm' && normText.includes('crm-') && !normText.includes('software')) return false;
  if (normKw === 'teclado' && (normText.includes('cantor') || normText.includes('show')) && !normText.includes('computador')) return false;

  return normText.includes(normKw);
}

function parseYmdDate(dateStr) {
  if (!dateStr) return null;
  const clean = dateStr.replace(/-/g, '');
  if (clean.length === 8) {
    const y = parseInt(clean.substring(0, 4), 10);
    const m = parseInt(clean.substring(4, 6), 10) - 1;
    const d = parseInt(clean.substring(6, 8), 10);
    return new Date(y, m, d);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  // Params
  const dataInicialParam = searchParams.get('dataInicial');
  const dataFinalParam = searchParams.get('dataFinal');
  const uf = searchParams.get('uf')?.toUpperCase();
  const valorMinimo = searchParams.get('valorMinimo') ? parseFloat(searchParams.get('valorMinimo')) : null;
  const valorMaximo = searchParams.get('valorMaximo') ? parseFloat(searchParams.get('valorMaximo')) : null;
  const pagina = parseInt(searchParams.get('pagina') || '1', 10);
  const tamanhoPagina = Math.min(Math.max(parseInt(searchParams.get('tamanhoPagina') || '20', 10), 10), 100);
  
  // Modalidades (Se nenhuma for especificada, engloba TODAS as 13 modalidades por padrão)
  const modalidadesRaw = searchParams.get('modalidades');
  const modalidades = modalidadesRaw 
    ? modalidadesRaw.split(',').map(m => parseInt(m, 10)) 
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

  // Palavras-chave
  const palavrasChaveParam = searchParams.get('palavrasChave');
  const keywords = palavrasChaveParam 
    ? palavrasChaveParam.split(',').map(k => k.trim()).filter(Boolean)
    : DEFAULT_TECH_KEYWORDS;

  // Ler a base de dados (Redis em nuvem ou Arquivo JSON Local)
  const storeData = await readStore();
  const rawBids = storeData.bids || [];

  // Se a base local estiver vazia, dispara sincronização inicial em background
  if (rawBids.length === 0 && !storeData.isSyncing) {
    console.log('[API] Base local vazia. Disparando sincronização inicial em background...');
    syncWithPncp().catch(e => console.error('Erro na sincronização inicial:', e));
  }

  // Intervalo de datas para filtragem
  const startDate = parseYmdDate(dataInicialParam);
  if (startDate) startDate.setHours(0, 0, 0, 0);

  const endDate = parseYmdDate(dataFinalParam);
  if (endDate) endDate.setHours(23, 59, 59, 999);

  // Parâmetro para ignorar palavras-chave (buscar em todos os editais brutos)
  const ignorarPalavrasChave = searchParams.get('ignorarPalavrasChave') === 'true';

  // Filtragem estritamente LOCAL sobre a base salva
  const filteredBids = rawBids.filter(bid => {
    // 1. Filtro de Modalidade
    if (modalidades.length > 0 && !modalidades.includes(bid.modalidadeId)) {
      return false;
    }

    // 2. Filtro de UF
    if (uf && uf !== 'TODOS' && uf !== 'BRASIL (TODOS)') {
      const bidUf = bid.unidadeOrgao?.ufSigla?.toUpperCase();
      if (bidUf !== uf) return false;
    }

    // 3. Filtro de Data (Publicação PNCP)
    if (startDate || endDate) {
      const pubDate = bid.dataPublicacaoPncp ? new Date(bid.dataPublicacaoPncp) : null;
      if (pubDate && !isNaN(pubDate.getTime())) {
        if (startDate && pubDate < startDate) return false;
        if (endDate && pubDate > endDate) return false;
      }
    }

    // 4. Filtro de Valor
    const valor = bid.valorTotalEstimado ?? bid.valorTotalHomologado ?? 0;
    if (valorMinimo !== null && valor < valorMinimo) return false;
    if (valorMaximo !== null && valor > valorMaximo) return false;

    // Se a opção de ignorar palavras-chave estiver ativa, retorna todos os editais que baterem com os filtros básicos acima
    if (ignorarPalavrasChave) {
      return true;
    }

    // 5. Filtro de Exclusões (Palavras Negativas Específicas)
    const objeto = cleanText(bid.objetoCompra);
    const info = cleanText(bid.informacaoComplementar);
    const fullText = objeto + ' ' + info;
    
    const hasExclusion = DEFAULT_EXCLUSION_KEYWORDS.some(exc => 
      matchKeyword(fullText, exc)
    );
    if (hasExclusion) return false;

    // 6. Filtro de Palavras-Chave de TI (Normalizado e Tolerante)
    const hasMatch = keywords.some(keyword => 
      matchKeyword(fullText, keyword)
    );

    return hasMatch;
  });

  const sortedBids = [...filteredBids].sort((a, b) => {
    const dateA = new Date(a.dataPublicacaoPncp || 0);
    const dateB = new Date(b.dataPublicacaoPncp || 0);
    return dateB - dateA;
  });

  const totalEncontrados = sortedBids.length;
  const startIndex = (pagina - 1) * tamanhoPagina;
  const paginatedBids = sortedBids.slice(startIndex, startIndex + tamanhoPagina);

  return NextResponse.json({
    meta: {
      dataInicial: dataInicialParam,
      dataFinal: dataFinalParam,
      uf: uf || 'Todos',
      modalidades,
      palavrasChaveUtilizadas: keywords,
      totalEncontrados: totalEncontrados,
      totalSalvosLocal: storeData.totalBids,
      totalAntesFiltros: storeData.totalBids,
      lastSync: storeData.lastSync,
      lastSyncStatus: storeData.lastSyncStatus,
      lastSyncMessage: storeData.lastSyncMessage,
      isSyncing: storeData.isSyncing,
      pagina,
      tamanhoPagina,
      totalPaginas: Math.ceil(totalEncontrados / tamanhoPagina)
    },
    results: paginatedBids.map(bid => ({
      numeroControlePNCP: bid.numeroControlePNCP,
      canalOrigem: bid.canalOrigem || 'PNCP Nacional',
      anoCompra: bid.anoCompra,
      sequencialCompra: bid.sequencialCompra,
      modalidadeId: bid.modalidadeId,
      modalidadeNome: bid.modalidadeNome,
      objetoCompra: bid.objetoCompra,
      informacaoComplementar: bid.informacaoComplementar,
      valorTotalEstimado: bid.valorTotalEstimado,
      valorTotalHomologado: bid.valorTotalHomologado,
      situacaoCompraNome: bid.situacaoCompraNome,
      dataPublicacaoPncp: bid.dataPublicacaoPncp,
      dataAberturaProposta: bid.dataAberturaProposta,
      dataEncerramentoProposta: bid.dataEncerramentoProposta,
      linkSistemaOrigem: bid.linkSistemaOrigem,
      orgaoEntidade: {
        cnpj: bid.orgaoEntidade?.cnpj,
        razaoSocial: bid.orgaoEntidade?.razaoSocial,
        esferaId: bid.orgaoEntidade?.esferaId
      },
      unidadeOrgao: {
        nomeUnidade: bid.unidadeOrgao?.nomeUnidade,
        ufSigla: bid.unidadeOrgao?.ufSigla,
        municipioNome: bid.unidadeOrgao?.municipioNome
      }
    }))
  });
}
