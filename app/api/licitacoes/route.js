import { NextResponse } from 'next/server';
import * as cache from '../../../lib/cache';

const PNCP_CONSULTA_BASE = 'https://pncp.gov.br/api/consulta/v1';

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

function formatPncpDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
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
  
  // Modalidades (default standard modalides for technology)
  const modalidadesRaw = searchParams.get('modalidades');
  const modalidades = modalidadesRaw 
    ? modalidadesRaw.split(',').map(m => parseInt(m, 10)) 
    : [4, 6, 8, 9]; // Concorrência eletrônica, Pregão eletrônico, Dispensa, Inexigibilidade

  // Palavras-chave
  const palavrasChaveParam = searchParams.get('palavrasChave');
  const keywords = palavrasChaveParam 
    ? palavrasChaveParam.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_TECH_KEYWORDS;

  // Datas padrão (últimos 30 dias se não especificado)
  let dataInicial = dataInicialParam;
  let dataFinal = dataFinalParam;
  
  if (!dataInicial || !dataFinal) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30); // 30 dias atrás por padrão para capturar editais úteis
    
    if (!dataInicial) dataInicial = formatPncpDate(start);
    if (!dataFinal) dataFinal = formatPncpDate(end);
  }

  // Chave de cache para evitar requisições repetidas ao PNCP
  const cacheKey = `licitacoes:raw:${dataInicial}:${dataFinal}:${uf || 'ALL'}:${modalidades.join('-')}`;
  let rawBids = cache.get(cacheKey);

  if (!rawBids) {
    try {
      const fetchHeaders = {
        'User-Agent': 'busca-portal/1.0',
        'Accept': 'application/json',
      };

      // 1. Buscar a primeira página (tamanho 50) para cada modalidade sequencialmente com delay
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const firstPages = [];
      for (const modalityId of modalidades) {
        const queryParams = new URLSearchParams({
          dataInicial,
          dataFinal,
          codigoModalidadeContratacao: modalityId.toString(),
          pagina: '1',
          tamanhoPagina: '50',
        });
        if (uf) queryParams.append('ufSigla', uf);

        const url = `${PNCP_CONSULTA_BASE}/contratacoes/publicacao?${queryParams.toString()}`;
        try {
          const response = await fetch(url, { headers: fetchHeaders });
          if (!response.ok) {
            console.error(`PNCP API returned status ${response.status} for modality ${modalityId}`);
            firstPages.push({ data: [], totalPaginas: 0, failed: true, status: response.status });
          } else {
            const json = await response.json();
            firstPages.push({ ...json, failed: false });
          }
        } catch (err) {
          console.error(`Fetch error for modality ${modalityId}:`, err);
          firstPages.push({ data: [], totalPaginas: 0, failed: true, status: 500 });
        }
        await delay(300);
      }

      // Se todas as chamadas falharam ou retornaram status de erro (ex: 504 Gateway Timeout)
      const failures = firstPages.filter(p => p.failed);
      if (failures.length === firstPages.length && firstPages.length > 0) {
        const status = failures[0].status || 502;
        return NextResponse.json({ 
          error: `O portal do PNCP (governo) está indisponível ou instável no momento (Erro ${status}). Por favor, tente novamente em alguns instantes.` 
        }, { status: 502 });
      }
      
      // 2. Para cada modalidade, verificar se há mais páginas e buscar sequencialmente com delay (até a página 3)
      const secondaryPages = [];
      for (let index = 0; index < firstPages.length; index++) {
        const firstPageJson = firstPages[index];
        if (firstPageJson.failed) continue;

        const modalityId = modalidades[index];
        const totalPaginas = firstPageJson.totalPaginas || 1;
        const maxPagesToFetch = Math.min(totalPaginas, 3); // Limite reduzido de 6 para 3 para reduzir chances de 429
        
        for (let p = 2; p <= maxPagesToFetch; p++) {
          const queryParams = new URLSearchParams({
            dataInicial,
            dataFinal,
            codigoModalidadeContratacao: modalityId.toString(),
            pagina: p.toString(),
            tamanhoPagina: '50',
          });
          if (uf) queryParams.append('ufSigla', uf);

          const url = `${PNCP_CONSULTA_BASE}/contratacoes/publicacao?${queryParams.toString()}`;
          try {
            await delay(400);
            const res = await fetch(url, { headers: fetchHeaders });
            if (res.ok) {
              const json = await res.json();
              secondaryPages.push(json);
            } else {
              console.error(`PNCP API returned status ${res.status} for page ${p} of modality ${modalityId}`);
            }
          } catch (e) {
            console.error(`Error fetching page ${p} for modality ${modalityId}:`, e);
          }
        }
      }
      
      // 3. Juntar todos os resultados
      const allBids = [
        ...firstPages.flatMap(p => p.data || []),
        ...secondaryPages.flatMap(p => p.data || [])
      ];

      // Remover duplicatas por numeroControlePNCP
      const uniqueBidsMap = new Map();
      allBids.forEach(bid => {
        if (bid && bid.numeroControlePNCP) {
          uniqueBidsMap.set(bid.numeroControlePNCP, bid);
        }
      });
      rawBids = Array.from(uniqueBidsMap.values());
      
      // Armazena no cache por 5 minutos
      cache.set(cacheKey, rawBids, 300);
    } catch (error) {
      console.error('Erro ao buscar do PNCP:', error);
      return NextResponse.json({ error: 'Erro ao buscar dados do PNCP: ' + error.message }, { status: 500 });
    }
  }

  // Filtragem local
  const cleanText = (text) => {
    if (!text) return '';
    // Remove links para evitar falsos positivos
    return text.replace(/https?:\/\/\S+/gi, ' ');
  };

  const filteredBids = rawBids.filter(bid => {
    // Filtro de Valor
    const valor = bid.valorTotalEstimado ?? bid.valorTotalHomologado ?? 0;
    if (valorMinimo !== null && valor < valorMinimo) return false;
    if (valorMaximo !== null && valor > valorMaximo) return false;

    // Filtro de Exclusões (Palavras Negativas)
    const objeto = cleanText(bid.objetoCompra).toLowerCase();
    const info = cleanText(bid.informacaoComplementar).toLowerCase();
    
    const hasExclusion = DEFAULT_EXCLUSION_KEYWORDS.some(exc => 
      objeto.includes(exc) || info.includes(exc)
    );
    if (hasExclusion) return false;

    // Filtro de Palavra-chave
    const hasMatch = keywords.some(keyword => 
      matchKeyword(objeto, keyword) || 
      matchKeyword(info, keyword)
    );

    return hasMatch;
  });

  // Ordenar e classificar por IA se o toggle estiver ativo e a API key configurada
  let aiFilteredBids = filteredBids;
  const filtrarPorIA = searchParams.get('filtrarPorIA') === 'true';
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (filtrarPorIA && apiKey && filteredBids.length > 0) {
    try {
      // Preparar os itens pré-filtrados de forma leve para o prompt
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
- Shows artísticos, palcos, apresentações artísticas, bandas de música ou eventos festivos (mesmo se disser que foram pesquisados na internet).
- Locação de prédios, salas, casas ou imóveis comerciais (mesmo se o prédio for abrigar um departamento de TI).
- Obras civis, reformas, construção, pavimentação, cimento, concreto, esgoto ou encanamento (mesmo se chamarem de "implantação de sistema de esgoto").
- Equipamentos elétricos gerais (ar condicionado, geradores de energia comuns, lâmpadas, iluminação pública) ou projetos fotovoltaicos de painéis solares (mesmo se citarem "rede municipal" ou "sistema elétrico").
- Cursos, treinamentos, MBAs ou consultorias administrativas que não sejam específicas do uso ou aprendizagem direta de um software ou linguagem de programação.

Itens para classificar:
${JSON.stringify(itemsToClassify, null, 2)}

Responda estritamente em formato JSON estruturado com o seguinte schema exato:
{
  "classificacoes": [
    { "index": 0, "isTI": true },
    { "index": 1, "isTI": false }
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
            // Filtrar as licitações com base no retorno da IA
            aiFilteredBids = filteredBids.filter((bid, index) => {
              const classification = parsed.classificacoes.find(c => c.index === index);
              return classification ? classification.isTI : true; // Fallback para true caso não encontre
            });
            console.log(`IA classificou ${filteredBids.length} itens. Mantidos pós-IA: ${aiFilteredBids.length}`);
          }
        }
      } else {
        console.warn('Erro ao chamar a API do Gemini. Status:', response.status);
      }
    } catch (aiError) {
      console.error('Erro na classificação por IA (fallback para RegExp ativo):', aiError);
    }
  }

  // Ordenar mais recentes primeiro
  const sortedBids = aiFilteredBids.sort((a, b) => {
    const dateA = new Date(a.dataPublicacaoPncp || 0);
    const dateB = new Date(b.dataPublicacaoPncp || 0);
    return dateB - dateA;
  });

  // Paginar os resultados filtrados localmente
  const totalEncontrados = sortedBids.length;
  const startIndex = (pagina - 1) * tamanhoPagina;
  const paginatedBids = sortedBids.slice(startIndex, startIndex + tamanhoPagina);

  return NextResponse.json({
    meta: {
      dataInicial,
      dataFinal,
      uf: uf || 'Todos',
      modalidades,
      palavrasChaveUtilizadas: keywords,
      totalEncontrados: totalEncontrados,
      totalAntesFiltros: rawBids.length,
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
