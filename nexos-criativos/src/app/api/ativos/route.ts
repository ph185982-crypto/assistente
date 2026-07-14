import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const STORAGE = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage')

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
  const filename = `${uuidv4()}.${ext}`
  const uploadDir = path.join(STORAGE, 'uploads', clienteId)
  await mkdir(uploadDir, { recursive: true })

  const bytes = await file.arrayBuffer()
  const filepath = path.join(uploadDir, filename)
  await writeFile(filepath, Buffer.from(bytes))

  const ativo = await prisma.ativoVisual.create({
    data: {
      clienteId,
      tipo,
      path: filepath,
      descricao: descricao || null,
    },
  })

  return NextResponse.json(ativo, { status: 201 })
}
