import {NextResponse, type NextRequest} from 'next/server';
import {COOKIE, lerToken} from './lib/sessao';

export async function middleware(req: NextRequest) {
  if (await lerToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {matcher: ['/((?!login|_next/|favicon|icon).*)']};
