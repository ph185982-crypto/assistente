import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const projeto = await prisma.projeto.findUnique({
    where: { id },
    include: {
      mensagens: { orderBy: { criadoEm: 'asc' } },
    },
  })
  if (!projeto) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(projeto)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const projeto = await prisma.projeto.update({
    where: { id },
    data: body,
  })
  return NextResponse.json(projeto)
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.projeto.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
