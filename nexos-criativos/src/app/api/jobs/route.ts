import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { executarPipeline } from '@/lib/pipeline'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clienteId = searchParams.get('clienteId')

  const jobs = await prisma.jobCriativo.findMany({
    where: clienteId ? { clienteId } : {},
    orderBy: { criadoEm: 'desc' },
    include: { cliente: { select: { nome: true } } },
  })
  return NextResponse.json(jobs)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { clienteId, objetivo, briefing, ativosUsados } = body

  if (!clienteId || !objetivo || !ativosUsados?.length) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
  }

  const job = await prisma.jobCriativo.create({
    data: { clienteId, objetivo, briefing: briefing || null, ativosUsados, status: 'processando' },
  })

  executarPipeline(job.id).catch((err) => console.error('Pipeline falhou:', err))

  return NextResponse.json(job, { status: 201 })
}
