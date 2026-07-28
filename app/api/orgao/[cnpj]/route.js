import { NextResponse } from 'next/server';
import * as cache from '../../../../lib/cache';

const PNCP_BASE = 'https://pncp.gov.br/api/pncp/v1';

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const { cnpj } = resolvedParams;

  if (!cnpj || !/^\d{14}$/.test(cnpj)) {
    return NextResponse.json({ error: 'CNPJ inválido ou não fornecido. Deve conter 14 dígitos numéricos.' }, { status: 400 });
  }

  const cacheKey = `orgao:detail:${cnpj}`;
  let orgaoData = cache.get(cacheKey);

  if (!orgaoData) {
    const headers = {
      'User-Agent': 'busca-portal/1.0',
      'Accept': 'application/json',
    };

    try {
      // Tentar carregar do PNCP
      const response = await fetch(`${PNCP_BASE}/orgaos/${cnpj}`, { 
        headers,
        signal: AbortSignal.timeout(8000) // 8s timeout para resposta rápida
      });

      if (response.ok) {
        orgaoData = await response.json();
      } else {
        throw new Error(`PNCP status ${response.status}`);
      }
    } catch (error) {
      console.warn(`Falha ao obter órgão ${cnpj} do PNCP, tentando fallback BrasilAPI. Erro:`, error.message);
      
      // Fallback para BrasilAPI
      try {
        const fallbackRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
          headers,
          signal: AbortSignal.timeout(8000)
        });

        if (fallbackRes.ok) {
          const rawCnpj = await fallbackRes.json();
          orgaoData = {
            cnpj,
            razaoSocial: rawCnpj.razao_social,
            nomeFantasia: rawCnpj.nome_fantasia || rawCnpj.razao_social,
            situacaoCadastral: rawCnpj.descricao_situacao_cadastral,
            municipioNome: rawCnpj.municipio,
            ufSigla: rawCnpj.uf,
            poderId: null,
            esferaId: null,
            _source: 'brasilapi-fallback'
          };
        } else {
          throw new Error(`BrasilAPI status ${fallbackRes.status}`);
        }
      } catch (fallbackError) {
        console.error(`Erro crítico: Falha no PNCP e no Fallback do CNPJ para ${cnpj}:`, fallbackError);
        // Retornar um objeto básico se tudo falhar
        orgaoData = {
          cnpj,
          razaoSocial: 'Órgão não localizado (CNPJ: ' + cnpj + ')',
          nomeFantasia: 'Não localizado',
          ufSigla: '',
          municipioNome: '',
          _source: 'failure-placeholder'
        };
      }
    }

    if (orgaoData) {
      // Salvar no cache por 1 hora (3600 segundos)
      cache.set(cacheKey, orgaoData, 3600);
    }
  }

  return NextResponse.json(orgaoData);
}
