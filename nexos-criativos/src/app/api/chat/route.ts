import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { put } from '@vercel/blob'
import { v4 as uuidv4 } from 'uuid'
import { gerarConceitos } from '@/lib/agents/estrategista'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const projetoId = formData.get('projetoId') as string
  const content = formData.get('content') as string
  const files = formData.getAll('files') as File[]

  if (!projetoId || !content) {
    return NextResponse.json({ error: 'projetoId e content são obrigatórios' }, { status: 400 })
  }

  const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: projetoId } })

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
    data: { projetoId, role: 'user', content, anexos, status: 'enviada' },
  })

  const assistantMsg = await prisma.mensagem.create({
    data: { projetoId, role: 'assistant', content: 'Analisando o produto e criando estratégia...', status: 'processando' },
  })

  await prisma.projeto.update({ where: { id: projetoId }, data: { atualizadoEm: new Date() } })

  if (anexos.length === 0) {
    await prisma.mensagem.update({
      where: { id: assistantMsg.id },
      data: { content: 'Envie pelo menos uma foto para eu criar os anúncios.', status: 'erro' },
    })
    return NextResponse.json({ userMsg, assistantMsg, conceitos: [], anexos }, { status: 201 })
  }

  const descricaoAtivos = anexos.map((_, i) => `- foto ${i + 1}: imagem do produto`).join('\n')

  const conceitos = await gerarConceitos({
    clienteNome: projeto.nome,
    nicho: projeto.nicho || 'geral',
    publicoAlvo: projeto.publicoAlvo || 'público geral',
    tomDeVoz: projeto.tomDeVoz || 'profissional e direto',
    diferenciais: projeto.diferenciais || '',
    observacoes: null,
    objetivo: 'venda_direta',
    briefing: content,
    descricaoAtivos,
    fotos: anexos,
  })

  await prisma.mensagem.update({
    where: { id: assistantMsg.id },
    data: { content: `Estratégia pronta! Gerando ${conceitos.length} criativos...` },
  })

  return NextResponse.json({
    userMsg,
    assistantMsg,
    conceitos,
    anexos,
  }, { status: 201 })
}
