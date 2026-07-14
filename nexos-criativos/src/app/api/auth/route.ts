import { NextRequest, NextResponse } from 'next/server'
import { checkPassword, getAuthCookieOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { password } = await req.json()

  if (!checkPassword(password)) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
  }

  const opts = getAuthCookieOptions()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(opts.name, opts.value, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    maxAge: opts.maxAge,
    path: opts.path,
  })
  return res
}

export async function DELETE() {
  const opts = getAuthCookieOptions()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(opts.name, '', { maxAge: 0, path: opts.path })
  return res
}
