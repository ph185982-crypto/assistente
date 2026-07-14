import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = await prisma.jobCriativo.findUniqueOrThrow({
    where: { id },
    include: {
      cliente: true,
      conceitos: {
        include: { variacoes: true },
      },
    },
  })
  return NextResponse.json(job)
}
