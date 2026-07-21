import { NextResponse } from 'next/server';

export async function GET(request) {
  const sessionCookie = request.cookies.get('xmcode_session');

  if (sessionCookie && sessionCookie.value === 'xmcode_auth_token_active_admin') {
    return NextResponse.json({
      authenticated: true,
      user: { username: 'admin' }
    });
  }

  return NextResponse.json({
    authenticated: false
  }, { status: 401 });
}
