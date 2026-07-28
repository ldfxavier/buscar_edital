'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor, informe o usuário e a senha.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Usuário ou senha incorretos.');
      }

      // Login bem-sucedido -> Redireciona para o painel principal
      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'Erro ao realizar login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      backgroundColor: 'var(--bg-color)',
      backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(99, 102, 241, 0.08) 0%, transparent 60%)'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '40px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: '25px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
      }}>

        {/* Header / Logo */}
        <div style={{ textAlign: 'center' }}>
          <h1 className="display-title" style={{ fontSize: '2.2rem', marginBottom: '6px' }}>
            <span style={{
              fontWeight: '800',
              letterSpacing: '1.5px',
              background: 'linear-gradient(135deg, #10b981 0%, #05ffd1 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: 'var(--font-display)'
            }}>
              XMCODE
            </span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', letterSpacing: '0.02em', fontWeight: 500 }}>
            Acesso Restrito ao Portal de Licitações
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="glass-panel" style={{
            padding: '12px 16px',
            borderColor: 'var(--color-danger)',
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--color-danger)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
              USUÁRIO
            </label>
            <input
              type="text"
              className="glass-input"
              placeholder="Digite seu usuário..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>
              SENHA
            </label>
            <input
              type="password"
              className="glass-input"
              placeholder="Digite sua senha..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '10px', fontSize: '0.95rem' }}
          >
            {loading ? (
              <>
                <svg className="spin-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                Autenticando...
              </>
            ) : 'Entrar no Sistema'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '15px' }}>
          Sistema protegido por autenticação contínua.
        </div>
      </div>
    </div>
  );
}
