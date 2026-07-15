import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mensagem = await prisma.mensagem.findUnique({ where: { id } })
  if (!mensagem) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })
  return NextResponse.json(mensagem)
}
