import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const projetos = await prisma.projeto.findMany({
    orderBy: { atualizadoEm: 'desc' },
    include: {
      mensagens: {
        orderBy: { criadoEm: 'desc' },
        take: 1,
        select: { content: true, criadoEm: true },
      },
    },
  })
  return NextResponse.json(projetos)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const projeto = await prisma.projeto.create({
    data: {
      nome: body.nome || 'Novo projeto',
      nicho: body.nicho || '',
      publicoAlvo: body.publicoAlvo || '',
      tomDeVoz: body.tomDeVoz || '',
      corPrimaria: body.corPrimaria || '#000000',
      corSecundaria: body.corSecundaria || '#ffffff',
      ctaPadrao: body.ctaPadrao || '',
      diferenciais: body.diferenciais || '',
    },
  })
  return NextResponse.json(projeto, { status: 201 })
}
