import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ativo = await prisma.ativoVisual.findUnique({ where: { id } })
  if (!ativo) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  try { await unlink(ativo.path) } catch { /* arquivo pode já não existir */ }
  await prisma.ativoVisual.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
