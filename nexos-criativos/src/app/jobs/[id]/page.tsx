import { requireAuth } from '@/lib/auth'
import Nav from '@/components/Nav'
import JobDetalheClient from './JobDetalheClient'

export default async function JobDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  return (
    <>
      <Nav />
      <JobDetalheClient id={id} />
    </>
  )
}
