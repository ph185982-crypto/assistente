import { requireAuth } from '@/lib/auth'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default async function Home() {
  await requireAuth()

  return (
    <>
      <Nav />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Nexos Criativos</h1>
        <p className="text-gray-500 mb-10">Ferramenta interna de criação de anúncios com IA</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/clientes"
            className="p-6 bg-white rounded-2xl border border-gray-100 hover:border-gray-300 transition-colors"
          >
            <div className="text-2xl mb-3">👥</div>
            <h2 className="font-semibold text-lg mb-1">Clientes</h2>
            <p className="text-sm text-gray-500">Cadastrar e editar perfis de marca</p>
          </Link>

          <Link
            href="/gerar"
            className="p-6 bg-black text-white rounded-2xl hover:bg-gray-800 transition-colors"
          >
            <div className="text-2xl mb-3">✨</div>
            <h2 className="font-semibold text-lg mb-1">Gerar criativos</h2>
            <p className="text-sm text-gray-400">Pipeline completo: estratégia + imagem + copy</p>
          </Link>

          <Link
            href="/jobs"
            className="p-6 bg-white rounded-2xl border border-gray-100 hover:border-gray-300 transition-colors"
          >
            <div className="text-2xl mb-3">📋</div>
            <h2 className="font-semibold text-lg mb-1">Jobs</h2>
            <p className="text-sm text-gray-500">Fila de aprovação e downloads</p>
          </Link>
        </div>
      </main>
    </>
  )
}
