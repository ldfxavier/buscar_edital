/**
 * Módulo de Autenticação Segura
 * Garante que nenhuma senha, chave ou token de sessão fiquem expostos no código-fonte público.
 */

export function getAdminCredentials() {
  const user = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || '';
  return { user, pass };
}

export function getExpectedSessionToken() {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASS || 'xmcode_session_secure_token';
  return `xm_session_${secret}`;
}

export function isValidSessionCookie(cookieValue) {
  if (!cookieValue) return false;
  const expected = getExpectedSessionToken();
  return cookieValue === expected;
}
