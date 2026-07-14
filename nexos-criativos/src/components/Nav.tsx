'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  const links = [
    { href: '/', label: 'Início' },
    { href: '/clientes', label: 'Clientes' },
    { href: '/gerar', label: 'Gerar criativos' },
    { href: '/jobs', label: 'Jobs' },
  ]

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-sm">
            Nexos Criativos
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  pathname === l.href
                    ? 'bg-gray-100 font-medium'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          Sair
        </button>
      </div>
    </nav>
  )
}
