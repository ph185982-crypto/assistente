import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { put } from '@vercel/blob'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const clienteId = formData.get('clienteId') as string
  const tipo = formData.get('tipo') as string
  const descricao = formData.get('descricao') as string | null

  if (!file || !clienteId || !tipo) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const filename = `uploads/${clienteId}/${uuidv4()}.${ext}`

  const blob = await put(filename, file, { access: 'public' })

  const ativo = await prisma.ativoVisual.create({
    data: {
      clienteId,
      tipo,
      path: blob.url,
      descricao: descricao || null,
    },
  })

  // Se for logo, atualizar o campo logoPath do cliente
  if (tipo === 'logo') {
    await prisma.cliente.update({ where: { id: clienteId }, data: { logoPath: blob.url } })
  }

  return NextResponse.json(ativo, { status: 201 })
}
