import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { feedback } = await req.json()

  const variacao = await prisma.variacao.update({
    where: { id },
    data: { feedback },
    include: {
      conceito: {
        include: { job: { include: { cliente: true } } },
      },
    },
  })

  if (feedback === 'performou_bem') {
    const job = variacao.conceito.job
    const cliente = job.cliente
    const conceito = variacao.conceito
    const nota = `[${new Date().toLocaleDateString('pt-BR')}] ${conceito.titulo}: "${conceito.headline}" funcionou bem (obj: ${job.objetivo}).`
    const obsAtual = cliente.observacoes || ''
    await prisma.cliente.update({
      where: { id: cliente.id },
      data: { observacoes: obsAtual ? obsAtual + '\n' + nota : nota },
    })
  }

  return NextResponse.json(variacao)
}
