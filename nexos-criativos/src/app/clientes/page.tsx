import { requireAuth } from '@/lib/auth'
import Nav from '@/components/Nav'
import ClientesClient from './ClientesClient'

export default async function ClientesPage() {
  await requireAuth()
  return (
    <>
      <Nav />
      <ClientesClient />
    </>
  )
}
