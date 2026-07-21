import { NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session'
];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Permite acesso livre a arquivos estáticos, _next, favicon e imagens
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // Verifica se o caminho atual é público
  const isPublicPath = PUBLIC_PATHS.some(path => pathname === path || pathname.startsWith(path + '/'));

  // Lê o cookie de sessão do usuário
  const sessionCookie = request.cookies.get('xmcode_session');
  const isAuthenticated = Boolean(sessionCookie && sessionCookie.value === 'xmcode_auth_token_active_admin');

  // Se o usuário está logado e tenta acessar /login, redireciona para a página principal
  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Se o caminho é público (como /login ou /api/auth/login), libera o acesso
  if (isPublicPath) {
    return NextResponse.next();
  }

  // Se NÃO está autenticado e tenta acessar qualquer outra rota ou API protegida:
  if (!isAuthenticated) {
    // Se for uma requisição de API, retorna erro 401 Unauthorized
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Acesso não autorizado. Por favor, faça login.' },
        { status: 401 }
      );
    }

    // Se for uma rota de página, redireciona obrigatoriamente para a tela de login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
