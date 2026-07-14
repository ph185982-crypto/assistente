import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const COOKIE_NAME = 'nc_auth'
const COOKIE_VALUE = 'authenticated'

export async function requireAuth() {
  const cookieStore = await cookies()
  const auth = cookieStore.get(COOKIE_NAME)
  if (auth?.value !== COOKIE_VALUE) {
    redirect('/login')
  }
}

export function checkPassword(password: string): boolean {
  return password === process.env.TEAM_PASSWORD
}

export function getAuthCookieOptions() {
  return {
    name: COOKIE_NAME,
    value: COOKIE_VALUE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  }
}
