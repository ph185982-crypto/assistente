import { requireAuth } from '@/lib/auth'
import Nav from '@/components/Nav'
import JobsClient from './JobsClient'

export default async function JobsPage() {
  await requireAuth()
  return (
    <>
      <Nav />
      <JobsClient />
    </>
  )
}
