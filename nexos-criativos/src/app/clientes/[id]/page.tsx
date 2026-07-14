import { requireAuth } from '@/lib/auth'
import Nav from '@/components/Nav'
import ClienteDetalheClient from './ClienteDetalheClient'

export default async function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  return (
    <>
      <Nav />
      <ClienteDetalheClient id={id} />
    </>
  )
}
