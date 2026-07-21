'use client';

import { useState, useEffect, useCallback } from 'react';

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

const UF_LIST = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const MODALIDADE_NAMES = {
  1: 'Leilão Eletrônico',
  2: 'Diálogo Competitivo',
  3: 'Concurso',
  4: 'Concorrência Eletrônica',
  5: 'Concorrência Presencial',
  6: 'Pregão Eletrônico',
  7: 'Pregão Presencial',
  8: 'Dispensa de Licitação',
  9: 'Inexigibilidade',
  10: 'Manifestação de Interesse',
  11: 'Pré-qualificação',
  12: 'Credenciamento',
  13: 'Cotação Eletrônica'
};

export default function Home() {
  // Navigation
  const [activeTab, setActiveTab] = useState('buscar'); // 'buscar' | 'favoritos' | 'config'

  // Search & Filter States
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [uf, setUf] = useState('');
  const [valorMinimo, setValorMinimo] = useState('');
  const [valorMaximo, setValorMaximo] = useState('');
  const [modalidades, setModalidades] = useState([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

  // Custom Keywords & Favorites
  const [keywords, setKeywords] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [filtrarPorIA, setFiltrarPorIA] = useState(false);
  const [ignorarPalavrasChave, setIgnorarPalavrasChave] = useState(false);

  // Sync / Base Local States
  const [syncMeta, setSyncMeta] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const handleIAToggle = (val) => {
    setFiltrarPorIA(val);
    localStorage.setItem('xmcode_filtrar_por_ia', val.toString());
  };

  const handleIgnorarKeywordsToggle = (val) => {
    setIgnorarPalavrasChave(val);
    localStorage.setItem('xmcode_ignorar_keywords', val.toString());
  };

  // Consultar Status da Base Local
  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = await res.json();
        if (data.meta) {
          setSyncMeta(data.meta);
          setSyncing(Boolean(data.meta.isSyncing));
          if (data.meta.lastSyncMessage) setSyncMessage(data.meta.lastSyncMessage);
        }
      }
    } catch (e) {
      console.error('Erro ao consultar status de sincronização:', e);
    }
  }, []);

  // Disparar Sincronização Manual com o PNCP
  const handleManualSync = async () => {
    setSyncing(true);
    setSyncMessage('Coletando novos editais em segundo plano...');
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 14, maxPages: 2 })
      });

      if (res.status === 401) {
        alert('Sessão expirada. Por favor, faça login novamente no portal.');
        window.location.href = '/login';
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        const errorText = data.message || data.error || `Erro HTTP ${res.status}`;
        setSyncMessage(`Erro: ${errorText}`);
        alert(`Erro na coleta: ${errorText}`);
        return;
      }

      if (data.message) setSyncMessage(data.message);
      await fetchSyncStatus();
      await fetchBids();
    } catch (e) {
      console.error('Erro ao disparar sincronização:', e);
      setSyncMessage('Erro na conexão para sincronização.');
      alert(`Erro na sincronização: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Monitorar periodicamente o status da sincronização
  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(() => {
      fetchSyncStatus();
    }, syncing ? 3000 : 15000);
    return () => clearInterval(interval);
  }, [fetchSyncStatus, syncing]);


  // API States
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);

  // Tender Detail Drawer
  const [selectedBid, setSelectedBid] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [bidDetails, setBidDetails] = useState(null);
  const [organDetails, setOrganDetails] = useState(null);
  const [organLoading, setOrganLoading] = useState(false);

  // Initialize Dates, Keywords & Favorites
  useEffect(() => {
    // Dates: Default to last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);

    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    setDataInicial(formatDate(start));
    setDataFinal(formatDate(end));

    // Load custom keywords from localStorage
    const savedKeywords = localStorage.getItem('licitatech_keywords');
    if (savedKeywords) {
      try {
        const parsed = JSON.parse(savedKeywords);
        const uniqueParsed = Array.from(new Set(parsed));

        // Migração automática se for alguma das listas antigas ou se tiver duplicatas
        if (
          (parsed.includes('tecnologia') && !parsed.includes('desenvolvimento de sistemas')) ||
          (parsed.includes('sistemas') && !parsed.includes('chatbot')) ||
          !parsed.includes('antena de internet') ||
          parsed.length !== uniqueParsed.length
        ) {
          setKeywords(DEFAULT_TECH_KEYWORDS);
          localStorage.setItem('licitatech_keywords', JSON.stringify(DEFAULT_TECH_KEYWORDS));
        } else {
          setKeywords(uniqueParsed);
        }
      } catch (e) {
        setKeywords(DEFAULT_TECH_KEYWORDS);
      }
    } else {
      setKeywords(DEFAULT_TECH_KEYWORDS);
      localStorage.setItem('licitatech_keywords', JSON.stringify(DEFAULT_TECH_KEYWORDS));
    }

    // Load favorites from localStorage
    const savedFavorites = localStorage.getItem('licitatech_favorites');
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch (e) {
        setFavorites([]);
      }
    }

    // Load IA preference from localStorage
    const savedIA = localStorage.getItem('xmcode_filtrar_por_ia');
    if (savedIA) {
      setFiltrarPorIA(savedIA === 'true');
    }

    // Load ignorar palavras-chave preference from localStorage
    const savedIgnorar = localStorage.getItem('xmcode_ignorar_keywords');
    if (savedIgnorar) {
      setIgnorarPalavrasChave(savedIgnorar === 'true');
    }
  }, []);

  // Fetch Bids from Next.js API Proxy
  const fetchBids = useCallback(async () => {
    if (!ignorarPalavrasChave && keywords.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const formatApiDate = (dateStr) => dateStr.replace(/-/g, '');

      const queryParams = new URLSearchParams({
        dataInicial: formatApiDate(dataInicial),
        dataFinal: formatApiDate(dataFinal),
        modalidades: modalidades.join(','),
        palavrasChave: keywords.join(','),
      });

      if (uf) queryParams.append('uf', uf);
      if (valorMinimo) queryParams.append('valorMinimo', valorMinimo);
      if (valorMaximo) queryParams.append('valorMaximo', valorMaximo);
      if (filtrarPorIA) queryParams.append('filtrarPorIA', 'true');
      if (ignorarPalavrasChave) queryParams.append('ignorarPalavrasChave', 'true');

      const response = await fetch(`/api/licitacoes?${queryParams.toString()}`);
      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Erro desconhecido ao carregar editais');
      }

      const data = await response.json();
      setBids(data.results || []);
      setMeta(data.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dataInicial, dataFinal, modalidades, keywords, uf, valorMinimo, valorMaximo, filtrarPorIA, ignorarPalavrasChave]);

  // Fetch on mount or when keywords are loaded
  useEffect(() => {
    if ((keywords.length > 0 || ignorarPalavrasChave) && dataInicial && dataFinal) {
      fetchBids();
    }
  }, [keywords, fetchBids, dataInicial, dataFinal, ignorarPalavrasChave]);

  // Handle Keyword Add / Remove / Reset
  const handleAddKeyword = (e) => {
    e.preventDefault();
    const cleanWord = newKeyword.trim().toLowerCase();
    if (cleanWord && !keywords.includes(cleanWord)) {
      const updated = [...keywords, cleanWord];
      setKeywords(updated);
      localStorage.setItem('licitatech_keywords', JSON.stringify(updated));
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (word) => {
    const updated = keywords.filter(w => w !== word);
    setKeywords(updated);
    localStorage.setItem('licitatech_keywords', JSON.stringify(updated));
  };

  const handleResetKeywords = () => {
    setKeywords(DEFAULT_TECH_KEYWORDS);
    localStorage.setItem('licitatech_keywords', JSON.stringify(DEFAULT_TECH_KEYWORDS));
  };

  // Toggle Favorite
  const toggleFavorite = (bid, event) => {
    if (event) event.stopPropagation();

    let updated;
    const isFav = favorites.some(f => f.numeroControlePNCP === bid.numeroControlePNCP);

    if (isFav) {
      updated = favorites.filter(f => f.numeroControlePNCP !== bid.numeroControlePNCP);
    } else {
      updated = [...favorites, bid];
    }

    setFavorites(updated);
    localStorage.setItem('licitatech_favorites', JSON.stringify(updated));
  };

  // Fetch Tender Details & Organ Data
  const openBidDetails = async (bid) => {
    setSelectedBid(bid);
    setDetailLoading(true);
    setDetailError(null);
    setBidDetails(null);
    setOrganDetails(null);

    try {
      // 1. Fetch details, items, files from PNCP API proxy
      const parts = bid.numeroControlePNCP.split('-');
      const cnpj = parts[0];
      const [seq, ano] = parts[2].split('/');
      const response = await fetch(`/api/licitacoes/${cnpj}/${ano}/${seq}`);

      if (!response.ok) {
        throw new Error('Falha ao obter detalhes do edital (Erro na API do PNCP).');
      }

      const details = await response.json();
      setBidDetails(details);

      // 2. Fetch organ details
      setOrganLoading(true);
      const organResponse = await fetch(`/api/orgao/${cnpj}`);
      if (organResponse.ok) {
        const organ = await organResponse.json();
        setOrganDetails(organ);
      }
    } catch (err) {
      console.error(err);
      setDetailError(err.message || 'Erro desconhecido ao carregar detalhes.');
    } finally {
      setDetailLoading(false);
      setOrganLoading(false);
    }
  };

  const closeBidDetails = () => {
    setSelectedBid(null);
    setBidDetails(null);
    setOrganDetails(null);
    setDetailError(null);
  };

  // Modality checkboxes handler
  const handleModalityChange = (code) => {
    if (modalidades.includes(code)) {
      if (modalidades.length > 1) {
        setModalidades(modalidades.filter(c => c !== code));
      }
    } else {
      setModalidades([...modalidades, code]);
    }
  };

  // Format Currency
  const formatCurrency = (val) => {
    if (val == null) return 'Sob Consulta';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Format Date
  const formatDateString = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('pt-BR');
    } catch (e) {
      return dateStr;
    }
  };

  // Render main tables/lists based on active tab
  const getDisplayBids = () => {
    if (activeTab === 'favoritos') return favorites;
    return bids;
  };

  const displayBids = getDisplayBids();

  return (
    <div className="dashboard-grid">

      {/* 1. SIDEBAR NAVIGATION */}
      <aside className="glass-panel" style={{ borderRadius: '0', borderLeft: 'none', borderTop: 'none', borderBottom: 'none', padding: '30px 20px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
        <div>
          <h1 className="display-title" style={{ fontSize: '1.7rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontWeight: '800',
              letterSpacing: '1.5px',
              background: 'linear-gradient(135deg, #6366f1 0%, #38bdf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: 'var(--font-display)'
            }}>
              XMCODE
            </span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.68rem', letterSpacing: '0.2px', fontWeight: 500 }}>
            Conectando ideias. Entregando soluções
          </p>
        </div>

        {/* Base Local & Sync Card */}
        <div className="sync-card">
          <div className="sync-header">
            <span className="sync-status-badge">
              <span className={syncing ? "spin-icon" : "pulse-dot"}>
                {syncing ? "⚙" : ""}
              </span>
              {syncing ? "Coletando Multicanal..." : "Coletor Multicanal Ativo"}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {syncMeta?.totalBids ?? meta?.totalSalvosLocal ?? 0} salvos
            </span>
          </div>

          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
            Última atualização PNCP:<br/>
            <strong style={{ color: 'var(--text-primary)' }}>
              {syncMeta?.lastSync ? new Date(syncMeta.lastSync).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Pendente'}
            </strong>
          </div>

          <button 
            className="btn-sync" 
            onClick={handleManualSync}
            disabled={syncing}
            title="Coletar novos editais em múltiplos canais do PNCP e atualizar base local"
          >
            <svg className={syncing ? "spin-icon" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            {syncing ? 'Atualizando...' : 'Coletar Agora'}
          </button>
        </div>

        {/* IA Toggle Switch */}
        <div className="switch-container">
          <div className="switch-label">
            <span className="switch-title">Filtro de IA</span>
            <span className="switch-desc">Precisão semântica por IA</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={filtrarPorIA}
              onChange={(e) => handleIAToggle(e.target.checked)}
              disabled={ignorarPalavrasChave}
            />
            <span className="slider"></span>
          </label>
        </div>

        {/* Ignorar Palavras-Chave Toggle Switch */}
        <div className="switch-container">
          <div className="switch-label">
            <span className="switch-title">Buscar Todos</span>
            <span className="switch-desc">Ignorar palavras-chave e IA</span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={ignorarPalavrasChave}
              onChange={(e) => handleIgnorarKeywordsToggle(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
          <button
            className={`btn-secondary ${activeTab === 'buscar' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('buscar')}
            style={{ width: '100%', justifyContent: 'flex-start', background: activeTab === 'buscar' ? 'rgba(99, 102, 241, 0.12)' : 'transparent', borderColor: activeTab === 'buscar' ? 'var(--color-primary)' : 'transparent' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Buscar Editais
          </button>

          <button
            className={`btn-secondary ${activeTab === 'favoritos' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('favoritos')}
            style={{ width: '100%', justifyContent: 'flex-start', background: activeTab === 'favoritos' ? 'rgba(99, 102, 241, 0.12)' : 'transparent', borderColor: activeTab === 'favoritos' ? 'var(--color-primary)' : 'transparent' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={activeTab === 'favoritos' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Favoritos ({favorites.length})
          </button>

          <button
            className={`btn-secondary ${activeTab === 'config' ? 'active-tab' : ''}`}
            onClick={() => setActiveTab('config')}
            style={{ width: '100%', justifyContent: 'flex-start', background: activeTab === 'config' ? 'rgba(99, 102, 241, 0.12)' : 'transparent', borderColor: activeTab === 'config' ? 'var(--color-primary)' : 'transparent' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M3 20v-8a2 2 0 0 1 2-2h4M3 12h18M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2" />
            </svg>
            Palavras-Chave ({keywords.length})
          </button>

          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                await fetch('/api/auth/logout', { method: 'POST' });
              } catch (e) {}
              window.location.href = '/login';
            }}
            style={{ width: '100%', justifyContent: 'flex-start', color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)', marginTop: 'auto' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sair do Sistema
          </button>
        </nav>

        {/* Stats Summary Panel */}
        {activeTab === 'buscar' && meta && (
          <div className="glass-panel" style={{ padding: '15px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.02)' }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>Estatísticas da Busca</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total na Base Local:</span>
                <span className="badge badge-cyan">{meta.totalSalvosLocal ?? meta.totalAntesFiltros ?? 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Relevantes p/ TI:</span>
                <span className="badge badge-success">{meta.totalEncontrados}</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* 2. MAIN APPLICATION PANEL */}
      <main className="main-content">

        {/* TABS 1: BUSCADOR PRINCIPAL */}
        {activeTab === 'buscar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }} className="animate-fade-in">
            <div></div>

            {/* ADVANCED FILTER PANEL */}
            <section className="glass-panel" style={{ padding: '25px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginBottom: '20px' }}>

                {/* Date range */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>DATA DE PUBLICAÇÃO INICIAL</label>
                  <input
                    type="date"
                    className="glass-input"
                    value={dataInicial}
                    onChange={(e) => setDataInicial(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>DATA DE PUBLICAÇÃO FINAL</label>
                  <input
                    type="date"
                    className="glass-input"
                    value={dataFinal}
                    onChange={(e) => setDataFinal(e.target.value)}
                  />
                </div>

                {/* State UF */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>ESTADO (UF)</label>
                  <select
                    className="glass-input"
                    value={uf}
                    onChange={(e) => setUf(e.target.value)}
                    style={{ appearance: 'none' }}
                  >
                    <option value="">Brasil (Todos)</option>
                    {UF_LIST.map(ufCode => (
                      <option key={ufCode} value={ufCode}>{ufCode}</option>
                    ))}
                  </select>
                </div>

                {/* Minimum value */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>VALOR TOTAL MÍNIMO (R$)</label>
                  <input
                    type="number"
                    placeholder="Min"
                    className="glass-input"
                    value={valorMinimo}
                    onChange={(e) => setValorMinimo(e.target.value)}
                  />
                </div>

                {/* Maximum value */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>VALOR TOTAL MÁXIMO (R$)</label>
                  <input
                    type="number"
                    placeholder="Max"
                    className="glass-input"
                    value={valorMaximo}
                    onChange={(e) => setValorMaximo(e.target.value)}
                  />
                </div>

              </div>

              {/* Modality Selector Checkboxes */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>MODALIDADES:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                  {Object.entries(MODALIDADE_NAMES).map(([code, name]) => {
                    const codeNum = parseInt(code, 10);
                    const isChecked = modalidades.includes(codeNum);
                    return (
                      <label key={code} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleModalityChange(codeNum)}
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        {name}
                      </label>
                    );
                  })}
                </div>

                {/* Search Button */}
                <button
                  onClick={fetchBids}
                  className="btn-primary search-button-responsive"
                  disabled={loading}
                >
                  {loading ? 'Buscando...' : 'Atualizar Busca'}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* TABS 2: FAVORITOS */}
        {activeTab === 'favoritos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }} className="animate-fade-in">
            <div>
              <h2 className="section-title" style={{ fontSize: '1.8rem', marginBottom: '5px' }}>Licitações Salvas</h2>
              <p style={{ color: 'var(--text-secondary)' }}>Acompanhe as oportunidades que você marcou como de maior interesse.</p>
            </div>
          </div>
        )}

        {/* TABS 3: CONFIGURAÇÃO DE PALAVRAS CHAVE */}
        {activeTab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }} className="animate-fade-in">
            <div>
              <h2 className="section-title" style={{ fontSize: '1.8rem', marginBottom: '5px' }}>Palavras-Chave de Tecnologia</h2>
              <p style={{ color: 'var(--text-secondary)' }}>Gerencie os termos de pesquisa. Somente editais contendo um ou mais destes termos no objeto serão exibidos.</p>
            </div>

            <section className="glass-panel" style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <form onSubmit={handleAddKeyword} style={{ display: 'flex', gap: '15px' }}>
                <input
                  type="text"
                  placeholder="Ex: licitação de computadores, suporte técnico, nuvem, etc..."
                  className="glass-input"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn-primary">Adicionar Termo</button>
              </form>

              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Termos Ativos ({keywords.length}):</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {keywords.map(word => (
                    <span
                      key={word}
                      className="badge badge-cyan"
                      style={{ fontSize: '0.85rem', padding: '6px 12px', borderRadius: '20px', gap: '6px', cursor: 'default' }}
                    >
                      {word}
                      <button
                        onClick={() => handleRemoveKeyword(word)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 'bold' }}
                        title="Remover"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '15px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleResetKeywords} className="btn-secondary" style={{ color: 'var(--color-danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                  Restaurar Termos Padrão
                </button>
              </div>
            </section>
          </div>
        )}

        {/* RENDER LIST OF TENDERS */}
        {(activeTab === 'buscar' || activeTab === 'favoritos') && (
          <section style={{ marginTop: '30px' }} className="animate-fade-in">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '15px' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid rgba(16, 185, 129, 0.1)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--text-secondary)' }}>Buscando editais oficiais no PNCP...</p>
                <style>{`
                  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                `}</style>
              </div>
            ) : error ? (
              <div className="glass-panel" style={{ padding: '30px', borderColor: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.05)', textAlign: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" style={{ margin: '0 auto 15px' }}>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <h3 style={{ marginBottom: '8px' }}>Erro ao Carregar Licitações</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{error}</p>
                <button onClick={fetchBids} className="btn-secondary" style={{ marginTop: '15px' }}>Tentar Novamente</button>
              </div>
            ) : displayBids.length === 0 ? (
              <div className="glass-panel" style={{ padding: '60px', textAlign: 'center' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ margin: '0 auto 20px' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                <h3>Nenhum edital encontrado</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '5px' }}>
                  {activeTab === 'favoritos'
                    ? 'Você ainda não salvou nenhuma licitação. Navegue pelos editais e adicione-os aos favoritos.'
                    : 'Nenhum edital recente corresponde aos filtros ou palavras-chave definidos.'}
                </p>
              </div>
            ) : (
              <div className="glass-panel" style={{ overflowX: 'auto', padding: '10px 20px' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}></th>
                      <th>OBJETO DA COMPRA</th>
                      <th style={{ width: '180px' }}>ÓRGÃO COMPRADOR</th>
                      <th style={{ width: '130px' }}>VALOR ESTIMADO</th>
                      <th style={{ width: '120px' }}>ABERTURA</th>
                      <th style={{ width: '120px' }}>MODALIDADE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayBids.map(bid => {
                      const isFav = favorites.some(f => f.numeroControlePNCP === bid.numeroControlePNCP);
                      const valor = bid.valorTotalEstimado ?? bid.valorTotalHomologado;
                      return (
                        <tr
                          key={bid.numeroControlePNCP}
                          onClick={() => openBidDetails(bid)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td onClick={(e) => toggleFavorite(bid, e)}>
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill={isFav ? 'var(--color-warning)' : 'none'}
                              stroke={isFav ? 'var(--color-warning)' : 'var(--text-muted)'}
                              strokeWidth="2"
                              style={{ transition: 'all 0.15s' }}
                            >
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {bid.objetoCompra}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Controle: {bid.numeroControlePNCP}</span>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{bid.orgaoEntidade?.razaoSocial}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bid.unidadeOrgao?.municipioNome} - {bid.unidadeOrgao?.ufSigla}</div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600, color: valor != null ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '0.9rem' }}>
                              {formatCurrency(valor)}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>
                            {bid.dataAberturaProposta ? formatDateString(bid.dataAberturaProposta) : 'Não informada'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>
                                {bid.modalidadeNome?.split(' ')[0] || 'Outra'}
                              </span>
                              <span className="badge badge-indigo" style={{ fontSize: '0.65rem' }}>
                                {bid.canalOrigem || 'PNCP Nacional'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

      </main>

      {/* 3. TENDER DETAILS DRAWER (SIDESLIDE MODAL) */}
      {selectedBid && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)' }} onClick={closeBidDetails}>
          <div
            className="glass-panel animate-slide-in"
            style={{ width: '100%', maxWidth: '650px', height: '100%', borderRadius: 0, borderRight: 'none', borderTop: 'none', borderBottom: 'none', display: 'flex', flexDirection: 'column', background: 'var(--bg-color)', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{ padding: '25px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="badge badge-cyan" style={{ marginBottom: '8px' }}>{selectedBid.modalidadeNome}</span>
                <h3 className="section-title" style={{ fontSize: '1.4rem' }}>Detalhes do Edital</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Controle: {selectedBid.numeroControlePNCP}</span>
              </div>
              <button
                onClick={closeBidDetails}
                className="btn-secondary"
                style={{ borderRadius: '50%', width: '36px', height: '36px', padding: 0, justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* Drawer Content */}
            <div style={{ padding: '25px', display: 'flex', flexDirection: 'column', gap: '25px', flex: 1 }}>

              {/* Star to Favorite */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Publicado em: {formatDateString(selectedBid.dataPublicacaoPncp)}</span>
                <button
                  onClick={() => toggleFavorite(selectedBid)}
                  className="btn-secondary"
                  style={{ gap: '8px', fontSize: '0.85rem' }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill={favorites.some(f => f.numeroControlePNCP === selectedBid.numeroControlePNCP) ? 'var(--color-warning)' : 'none'}
                    stroke={favorites.some(f => f.numeroControlePNCP === selectedBid.numeroControlePNCP) ? 'var(--color-warning)' : 'currentColor'}
                    strokeWidth="2"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  {favorites.some(f => f.numeroControlePNCP === selectedBid.numeroControlePNCP) ? 'Favoritado' : 'Favoritar'}
                </button>
              </div>

              {/* Erro de Instabilidade do Governo nos Detalhes */}
              {detailError && (
                <div className="glass-panel animate-fade-in" style={{ padding: '16px', borderColor: 'var(--color-danger)', background: 'rgba(239, 68, 68, 0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger)', fontWeight: 600, fontSize: '0.85rem' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Instabilidade no Portal do Governo
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    O servidor do PNCP (governo) está indisponível ou lento no momento. Não foi possível carregar a lista de itens/lotes e os arquivos originais deste edital.
                  </p>
                </div>
              )}

              {/* Objeto */}
              <div>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Objeto da Compra</h4>
                <div className="glass-panel" style={{ padding: '15px', background: 'rgba(255,255,255,0.01)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                  {selectedBid.objetoCompra}
                </div>
              </div>

              {/* Informações de Valores */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="glass-panel" style={{ padding: '15px', background: 'rgba(255,255,255,0.01)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>VALOR TOTAL ESTIMADO</span>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: '4px' }}>
                    {formatCurrency(selectedBid.valorTotalEstimado ?? selectedBid.valorTotalHomologado)}
                  </p>
                </div>

                <div className="glass-panel" style={{ padding: '15px', background: 'rgba(255,255,255,0.01)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ABERTURA DE PROPOSTAS</span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '7px' }}>
                    {selectedBid.dataAberturaProposta ? formatDateString(selectedBid.dataAberturaProposta) : 'Não informada'}
                  </p>
                </div>
              </div>

              {/* Dados do Órgão */}
              <div>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Órgão Comprador</h4>
                <div className="glass-panel" style={{ padding: '15px', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px' }}>{selectedBid.orgaoEntidade?.razaoSocial}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <div>CNPJ: <span style={{ fontFamily: 'monospace' }}>{selectedBid.orgaoEntidade?.cnpj}</span></div>
                    <div>Unidade: {selectedBid.unidadeOrgao?.nomeUnidade}</div>
                    <div>Localização: {selectedBid.unidadeOrgao?.municipioNome} - {selectedBid.unidadeOrgao?.ufSigla}</div>
                    {organLoading ? (
                      <span style={{ color: 'var(--color-primary)', fontSize: '0.8rem', marginTop: '5px' }}>Carregando dados cadastrais...</span>
                    ) : organDetails ? (
                      <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '8px', paddingTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <div>Situação Cadastral: <span style={{ color: 'var(--color-success)' }}>{organDetails.situacaoCadastral || 'Ativa'}</span></div>
                        {organDetails.naturezaJuridicaNome && <div>Natureza Jurídica: {organDetails.naturezaJuridicaNome}</div>}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Itens / Lotes */}
              <div>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Itens / Lotes da Licitação</h4>
                {detailLoading ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)' }}>Carregando itens...</p>
                ) : bidDetails?.itens && bidDetails.itens.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', paddingRight: '5px' }}>
                    {bidDetails.itens.map(item => (
                      <div key={item.numeroItem} className="glass-panel" style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '4px' }}>
                          <span>Item {item.numeroItem} - {item.materialOuServicoNome || (item.materialOuServico === 'S' ? 'Serviço' : 'Material')}</span>
                          <span style={{ color: 'var(--color-primary)' }}>{formatCurrency(item.valorTotal)}</span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>{item.descricao}</p>
                        <div style={{ display: 'flex', gap: '15px', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '6px' }}>
                          <span>Quant: {item.quantidade} {item.unidadeMedida}</span>
                          {item.valorUnitarioEstimado && <span>Unitário: {formatCurrency(item.valorUnitarioEstimado)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nenhum item cadastrado ou erro ao carregar.</p>
                )}
              </div>

              {/* Arquivos / Editais */}
              <div style={{ marginBottom: '30px' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Documentos Anexos</h4>
                {detailLoading ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-primary)' }}>Carregando documentos...</p>
                ) : bidDetails?.arquivos && bidDetails.arquivos.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {bidDetails.arquivos.map(file => (
                      <a
                        key={file.sequencialDocumento}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="glass-panel glass-panel-hover"
                        style={{ padding: '12px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit', fontSize: '0.85rem' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                          </svg>
                          <div>
                            <div style={{ fontWeight: 600 }}>{file.titulo || file.tipoDocumentoNome}</div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Publicado em: {formatDateString(file.dataPublicacaoPncp)}</span>
                          </div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nenhum documento anexado ou erro ao carregar.</p>
                )}
              </div>

              {/* Botões do Rodapé */}
              <div style={{ display: 'flex', gap: '15px', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                {selectedBid.linkSistemaOrigem && (
                  <a
                    href={selectedBid.linkSistemaOrigem}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{ flex: 1, textDecoration: 'none', justifyContent: 'center' }}
                  >
                    Ir para Portal de Origem
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
                <button onClick={closeBidDetails} className="btn-secondary" style={{ flex: selectedBid.linkSistemaOrigem ? 0.4 : 1, justifyContent: 'center' }}>
                  Fechar
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
