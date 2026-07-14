import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const clientes = await prisma.cliente.findMany({
    orderBy: { criadoEm: 'desc' },
    include: { _count: { select: { jobs: true, ativos: true } } },
  })
  return NextResponse.json(clientes)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const cliente = await prisma.cliente.create({ data: body })
  return NextResponse.json(cliente, { status: 201 })
}
