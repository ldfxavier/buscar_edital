import { NextResponse } from 'next/server';
import { isValidSessionCookie, getAdminCredentials } from '../../../../lib/auth';

export async function GET(request) {
  const sessionCookie = request.cookies.get('xmcode_session');

  if (sessionCookie && isValidSessionCookie(sessionCookie.value)) {
    const { user } = getAdminCredentials();
    return NextResponse.json({
      authenticated: true,
      user: { username: user }
    });
  }

  return NextResponse.json({
    authenticated: false
  }, { status: 401 });
}
