import { NextResponse } from 'next/server';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'xm@1324';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, password } = body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const response = NextResponse.json({
        success: true,
        message: 'Login realizado com sucesso.',
        user: { username: ADMIN_USER }
      });

      // Define cookie HTTP-only seguro com validade de 7 dias
      response.cookies.set({
        name: 'xmcode_session',
        value: 'xmcode_auth_token_active_admin',
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
