import { NextResponse } from 'next/server';
import * as cache from '../../../../../../lib/cache';

const PNCP_CONSULTA_BASE = 'https://pncp.gov.br/api/consulta/v1';
const PNCP_BASE = 'https://pncp.gov.br/api/pncp/v1';

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const { cnpj, ano, sequencial } = resolvedParams;

  if (!cnpj || !ano || !sequencial) {
    return NextResponse.json({ error: 'Parâmetros cnpj, ano e sequencial são obrigatórios.' }, { status: 400 });
  }

  const cacheKey = `licitacao:detail:${cnpj}:${ano}:${sequencial}`;
  let detailData = cache.get(cacheKey);

  if (!detailData) {
    try {
      const headers = {
        'User-Agent': 'busca-portal/1.0',
        'Accept': 'application/json',
      };

      // Fazer as requisições em paralelo
      const detailPromise = fetch(`${PNCP_CONSULTA_BASE}/orgaos/${cnpj}/compras/${ano}/${sequencial}`, { headers })
        .then(async (res) => {
          if (!res.ok) throw new Error(`PNCP Detail error: ${res.status}`);
          return res.json();
        });

      const itensPromise = fetch(`${PNCP_BASE}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`, { headers })
        .then(async (res) => {
          if (!res.ok) {
            console.warn(`PNCP Itens returned status ${res.status}`);
            return [];
          }
          const data = await res.json();
          return Array.isArray(data) ? data : (data?.data || []);
        })
        .catch(err => {
          console.error('Error fetching items:', err);
          return [];
        });

      const arquivosPromise = fetch(`${PNCP_BASE}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`, { headers })
        .then(async (res) => {
          if (!res.ok) {
            console.warn(`PNCP Arquivos returned status ${res.status}`);
            return [];
          }
          const data = await res.json();
          return Array.isArray(data) ? data : (data?.data || []);
        })
        .catch(err => {
          console.error('Error fetching files:', err);
          return [];
        });

      const [detail, itens, arquivos] = await Promise.all([
        detailPromise,
        itensPromise,
        arquivosPromise,
      ]);

      detailData = {
        ...detail,
        itens: itens.map(item => ({
          numeroItem: item.numeroItem,
          descricao: item.descricao,
          materialOuServico: item.materialOuServico,
          materialOuServicoNome: item.materialOuServicoNome,
          valorUnitarioEstimado: item.valorUnitarioEstimado,
          valorTotal: item.valorTotal,
          quantidade: item.quantidade,
          unidadeMedida: item.unidadeMedida,
          situacaoCompraItemNome: item.situacaoCompraItemNome,
        })),
        arquivos: arquivos.map(file => ({
          sequencialDocumento: file.sequencialDocumento,
          titulo: file.titulo,
          tipoDocumentoNome: file.tipoDocumentoNome,
          url: file.url || file.uri,
          dataPublicacaoPncp: file.dataPublicacaoPncp,
        })),
      };

      // Salvar no cache por 30 minutos (1800 segundos)
      cache.set(cacheKey, detailData, 1800);
    } catch (error) {
      console.error(`Erro ao carregar detalhes para ${cnpj}/${ano}/${sequencial}:`, error);
      return NextResponse.json({ error: `Erro ao buscar detalhes da licitação no PNCP: ${error.message}` }, { status: 500 });
    }
  }

  return NextResponse.json(detailData);
}
