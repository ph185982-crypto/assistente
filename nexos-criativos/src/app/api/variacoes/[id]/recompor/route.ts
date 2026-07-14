import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recompor } from '@/lib/composicao'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { headline } = await req.json()

  if (!headline?.trim()) {
    return NextResponse.json({ error: 'Headline obrigatória' }, { status: 400 })
  }

  const variacao = await prisma.variacao.findUniqueOrThrow({
    where: { id },
    include: {
      conceito: {
        include: { job: { include: { cliente: true } } },
      },
    },
  })

  const conceito = variacao.conceito
  const cliente = conceito.job.cliente
  const jobId = conceito.job.id

  const formatos = await recompor(
    variacao.pathBase,
    headline,
    conceito.cta || cliente.ctaPadrao,
    cliente.corPrimaria,
    cliente.corSecundaria,
    'base',
    cliente.logoPath,
    `jobs/${jobId}`
  )

  const updated = await prisma.variacao.update({
    where: { id },
    data: formatos,
  })

  await prisma.conceito.update({
    where: { id: conceito.id },
    data: { headline },
  })

  return NextResponse.json(updated)
}
