import { NextResponse } from 'next/server';
import { getAdminCredentials, getExpectedSessionToken } from '../../../../lib/auth';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, password } = body;
    const { user: ADMIN_USER, pass: ADMIN_PASS } = getAdminCredentials();

    if (!ADMIN_PASS) {
      return NextResponse.json({
        success: false,
        error: 'Servidor não configurado. Por favor, defina ADMIN_PASS no arquivo .env ou nas variáveis de ambiente da Vercel.'
      }, { status: 500 });
    }

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const response = NextResponse.json({
        success: true,
        message: 'Login realizado com sucesso.',
        user: { username: ADMIN_USER }
      });

      // Define cookie HTTP-only seguro com validade de 7 dias
      response.cookies.set({
        name: 'xmcode_session',
        value: getExpectedSessionToken(),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 // 7 dias
      });

      return response;
    }

    return NextResponse.json({
      success: false,
      error: 'Usuário ou senha incorretos.'
    }, { status: 401 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erro no processamento da autenticação: ' + error.message
    }, { status: 500 });
  }
}
