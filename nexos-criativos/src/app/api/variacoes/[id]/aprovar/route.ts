import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const variacao = await prisma.variacao.update({
    where: { id },
    data: { aprovada: true },
  })
  return NextResponse.json(variacao)
}
