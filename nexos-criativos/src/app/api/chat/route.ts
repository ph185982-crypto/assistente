import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { put } from '@vercel/blob'
import { v4 as uuidv4 } from 'uuid'
import { executarPipelineChat } from '@/lib/pipeline-chat'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const projetoId = formData.get('projetoId') as string
  const content = formData.get('content') as string
  const files = formData.getAll('files') as File[]

  if (!projetoId || !content) {
    return NextResponse.json({ error: 'projetoId e content são obrigatórios' }, { status: 400 })
  }

  const anexos: string[] = []
  for (const file of files) {
    const ext = file.name.split('.').pop() || 'jpg'
    const blob = await put(`chat/${projetoId}/${uuidv4()}.${ext}`, file, {
      access: 'public',
      contentType: file.type,
    })
    anexos.push(blob.url)
  }

  const userMsg = await prisma.mensagem.create({
    data: {
      projetoId,
      role: 'user',
      content,
      anexos,
      status: 'enviada',
    },
  })

  const assistantMsg = await prisma.mensagem.create({
    data: {
      projetoId,
      role: 'assistant',
      content: 'Processando seus criativos...',
      status: 'processando',
    },
  })

  await prisma.projeto.update({
    where: { id: projetoId },
    data: { atualizadoEm: new Date() },
  })

  executarPipelineChat(projetoId, assistantMsg.id, content, anexos).catch((err) =>
    console.error('Pipeline chat falhou:', err)
  )

  return NextResponse.json({ userMsg, assistantMsg }, { status: 201 })
}
