import { NextResponse } from 'next/server';
import { readStore } from '../../../lib/storage';
import { syncWithPncp, initPeriodicSync } from '../../../lib/sync';

// Garante o agendador em background
initPeriodicSync(30);

const DEFAULT_TECH_KEYWORDS = [
  'software',
  'desenvolvimento de software', 'desenvolvimento de sistemas', 'desenvolvimento web', 'desenvolvimento de app', 'desenvolvimento de aplicativo',
  'aluguel de software', 'locação de software', 'licenciamento de software', 'licenciamento de uso', 'licença de uso', 'direito de uso de software', 'cessão de direito de uso',
  'instalação de software', 'implantação de software', 'customização de software', 'suporte de software', 'manutenção de software',
  'sistema informatizado', 'sistema de informação', 'sistema de gestão', 'sistema web', 'sistema de TI',
  'plataforma digital', 'plataforma web', 'plataforma saas', 'plataforma de software', 'plataforma virtual',
  'fábrica de software', 'aplicativo', 'app', 'mobile', 'banco de dados', 'cloud', 'nuvem', 'saas', 'erp', 'crm', 'chatbot',
  'tecnologia da informação', 'tecnologia de informação', 'ti', 'suporte de ti', 'consultoria em ti',
  'computador', 'notebook', 'ultrabook', 'chromebook', 'servidor de rede', 'servidores de rede', 'servidor de banco de dados', 'roteador', 'switch', 'conectividade',
  'link de internet', 'serviço de internet', 'conexão à internet', 'acesso à internet', 'provedor de internet', 'antena de internet',
  'link dedicado', 'link de dados', 'fibra óptica', 'telefonia voip', 'telefonia ip',
  'rede de computadores', 'rede de dados', 'rede lógica', 'rede wi-fi', 'rede sem fio', 'infraestrutura de rede'
];

const DEFAULT_EXCLUSION_KEYWORDS = [
  'drenagem pluvial', 'pavimentação', 'recapeamento', 'esgotamento sanitário',
  'obra de engenharia', 'obras de engenharia', 'reforma predial', 'reforma de prédio',
  'combate a incêndio', 'troca de telhas', 'pintura predial', 'sonorização',
  'concreto', 'cimento', 'abastecimento de água', 'areia', 'brita', 'tijolo',
  'calçada', 'asfalto', 'meio-fio', 'parada de ônibus',
  'locação de imóvel', 'aluguel de imóvel', 'locação de prédio', 'aluguel de prédio', 'locação de salas', 'aluguel de salas', 'locação de imóvel urbano'
];

function matchKeyword(text, keyword) {
  const cleanKeyword = keyword.trim().toLowerCase();
  if (!cleanKeyword) return false;

  let root = cleanKeyword;
  let suffix = '';
  const acronyms = ['saas', 'iaas', 'paas', 'erp', 'crm', 'ti', 'app'];

  if (acronyms.includes(cleanKeyword)) {
    root = cleanKeyword;
    suffix = 's?';
  } else if (cleanKeyword.endsWith('es') && cleanKeyword.length > 4) {
    root = cleanKeyword.slice(0, -2);
    suffix = '(es)?';
  } else if (cleanKeyword.endsWith('s') && cleanKeyword.length > 3) {
    root = cleanKeyword.slice(0, -1);
    suffix = 's?';
  } else {
    if (cleanKeyword.endsWith('r') || cleanKeyword.endsWith('z') || cleanKeyword.endsWith('l')) {
      suffix = '(es)?';
    } else {
      suffix = 's?';
    }
  }

  const wordBoundaryTerms = ['ti', 'app', 'saas', 'erp', 'crm', 'link', 'rede', 'computador', 'notebook', 'servidor', 'switch', 'hub', 'tv'];
  
  if (cleanKeyword.length <= 4 || wordBoundaryTerms.some(term => cleanKeyword.includes(term))) {
    const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedRoot}${suffix}\\b`, 'i');
    return regex.test(text);
  }

  return text.toLowerCase().includes(root);
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
  const tamanhoPagina = Math.min(Math.max(parseInt(searchParams.get('tamanhoPagina') || '20', 10), 10), 50);
  
  // Modalidades
  const modalidadesRaw = searchParams.get('modalidades');
  const modalidades = modalidadesRaw 
    ? modalidadesRaw.split(',').map(m => parseInt(m, 10)) 
    : [4, 6, 8, 9];

  // Palavras-chave
  const palavrasChaveParam = searchParams.get('palavrasChave');
  const keywords = palavrasChaveParam 
    ? palavrasChaveParam.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
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

  // Helper para limpar links e texto
  const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/https?:\/\/\S+/gi, ' ');
  };

  // Filtragem estritamente LOCAL sobre a base salva
  const filteredBids = rawBids.filter(bid => {
    // 1. Filtro de Modalidade
    if (modalidades.length > 0 && !modalidades.includes(bid.modalidadeId)) {
      return false;
    }

    // 2. Filtro de UF
    if (uf && uf !== 'TODOS') {
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

    // 5. Filtro de Exclusões (Palavras Negativas)
    const objeto = cleanText(bid.objetoCompra).toLowerCase();
    const info = cleanText(bid.informacaoComplementar).toLowerCase();
    
    const hasExclusion = DEFAULT_EXCLUSION_KEYWORDS.some(exc => 
      objeto.includes(exc) || info.includes(exc)
    );
    if (hasExclusion) return false;

    // 6. Filtro de Palavras-Chave de TI
    const hasMatch = keywords.some(keyword => 
      matchKeyword(objeto, keyword) || 
      matchKeyword(info, keyword)
    );

    return hasMatch;
  });

  // Classificação opcional por IA (Gemini) se solicitada pelo frontend
  let aiFilteredBids = filteredBids;
  const filtrarPorIA = searchParams.get('filtrarPorIA') === 'true';
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (filtrarPorIA && apiKey && filteredBids.length > 0) {
    try {
      const itemsToClassify = filteredBids.map((bid, index) => ({
        index,
        objeto: cleanText(bid.objetoCompra).substring(0, 500),
        informacao: cleanText(bid.informacaoComplementar).substring(0, 300)
      }));

      const prompt = `
Você é um classificador especializado em licitações públicas na área de Tecnologia da Informação (TI).
Analise cada um dos itens abaixo e determine se ele é diretamente da área de TI (true) ou não (false).

Critérios de inclusão (TI):
- Licenciamento, aluguel, assinatura, assinatura SaaS ou direito de uso de software/sistemas/plataformas.
- Desenvolvimento de software, desenvolvimento de sistemas, desenvolvimento web, aplicativos (mobile/web), sites, portais ou sistemas de informação.
- Serviços de suporte técnico de informática, consultoria em TI, manutenção de software/banco de dados, ou hospedagem em nuvem (SaaS/Cloud/VPS).
- Aquisição de computadores, notebooks, servidores de rede, roteadores, switches, ou cabeamento lógico/estruturado de redes (informática).
- Links de internet dedicada, serviços de conectividade ou telefonia IP/VoIP.

Critérios de exclusão (Não é TI):
- Shows artísticos, palcos, apresentações artísticas, bandas de música ou eventos festivos.
- Locação de prédios, salas, casas ou imóveis comerciais.
- Obras civis, reformas, construção, pavimentação, cimento, concreto, esgoto ou encanamento.
- Equipamentos elétricos gerais (ar condicionado, geradores) ou projetos fotovoltaicos de painéis solares.
- Cursos ou treinamentos administrativos gerais.

Itens para classificar:
${JSON.stringify(itemsToClassify, null, 2)}

Responda estritamente em formato JSON estruturado com o seguinte schema exato:
{
  "classificacoes": [
    { "index": 0, "isTI": true }
  ]
}
`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (response.ok) {
        const responseJson = await response.json();
        if (responseJson && responseJson.candidates && responseJson.candidates[0]?.content?.parts[0]?.text) {
          const text = responseJson.candidates[0].content.parts[0].text;
          const parsed = JSON.parse(text);
          if (parsed && Array.isArray(parsed.classificacoes)) {
            aiFilteredBids = filteredBids.filter((bid, index) => {
              const classification = parsed.classificacoes.find(c => c.index === index);
              return classification ? classification.isTI : true;
            });
          }
        }
      }
    } catch (aiError) {
      console.error('Erro na classificação por IA (fallback para base local ativo):', aiError);
    }
  }

  // Ordenar os mais recentes primeiro
  const sortedBids = aiFilteredBids.sort((a, b) => {
    const dateA = new Date(a.dataPublicacaoPncp || 0);
    const dateB = new Date(b.dataPublicacaoPncp || 0);
    return dateB - dateA;
  });

  // Paginação dos resultados locais
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
