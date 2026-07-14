import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cliente = await prisma.cliente.findUniqueOrThrow({
    where: { id },
    include: { ativos: true, jobs: { orderBy: { criadoEm: 'desc' }, take: 10 } },
  })
  return NextResponse.json(cliente)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const cliente = await prisma.cliente.update({ where: { id }, data: body })
  return NextResponse.json(cliente)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.cliente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
