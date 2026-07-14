import { requireAuth } from '@/lib/auth'
import Nav from '@/components/Nav'
import GerarClient from './GerarClient'
import { Suspense } from 'react'

export default async function GerarPage() {
  await requireAuth()
  return (
    <>
      <Nav />
      <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-8 text-gray-400 text-sm">Carregando...</div>}>
        <GerarClient />
      </Suspense>
    </>
  )
}
