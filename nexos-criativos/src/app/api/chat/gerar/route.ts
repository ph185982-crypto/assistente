import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { gerarCopy } from '@/lib/agents/copy'
import { editarImagem } from '@/lib/gemini'
import { gerarFormatos } from '@/lib/composicao'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { projetoId, mensagemId, fotoUrl, conceito, conceitoIndex, totalConceitos } = body

  if (!projetoId || !mensagemId || !fotoUrl || !conceito) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const projeto = await prisma.projeto.findUniqueOrThrow({ where: { id: projetoId } })
  const subdir = `chat/${projetoId}/${mensagemId}`

  await prisma.mensagem.update({
    where: { id: mensagemId },
    data: { content: `Criando visual ${conceitoIndex + 1}/${totalConceitos}: "${conceito.titulo}"...` },
  })

  const copy = await gerarCopy({
    clienteNome: projeto.nome,
    nicho: projeto.nicho || 'geral',
    tomDeVoz: projeto.tomDeVoz || 'profissional e direto',
    ctaPadrao: projeto.ctaPadrao || '',
    whatsapp: projeto.whatsapp,
    conceito: {
      titulo: conceito.titulo,
      angulo: conceito.angulo,
      emocao: conceito.emocao,
      headline: conceito.headline,
    },
    objetivo: 'venda_direta',
  })

  const imagemBase = await editarImagem(fotoUrl, conceito.cena, subdir)

  const formatos = await gerarFormatos({
    imagemBasePath: imagemBase,
    headline: conceito.headline,
    cta: copy.cta,
    corPrimaria: projeto.corPrimaria || '#000000',
    corSecundaria: projeto.corSecundaria || '#ffffff',
    posicaoTexto: conceito.posicaoTexto || 'base',
    logoPath: projeto.logoPath,
    subdir,
  })

  const novasUrls = [formatos.path1x1, formatos.path4x5, formatos.path9x16].filter(Boolean)

  const msgAtual = await prisma.mensagem.findUniqueOrThrow({ where: { id: mensagemId } })
  const resultadosAtuais = msgAtual.resultados || []
  const todosResultados = [...resultadosAtuais, ...novasUrls]

  const parteTexto =
    `**${conceito.titulo}**\n` +
    `${conceito.angulo}\n\n` +
    `**Headline (na foto):** ${conceito.headline}\n` +
    (conceito.tituloMarketplace ? `**Título p/ marketplace:** ${conceito.tituloMarketplace}\n` : '') +
    (conceito.descricao ? `**Descrição de venda:**\n${conceito.descricao}\n` : '') +
    (conceito.keywords?.length ? `**Palavras-chave:** ${conceito.keywords.join(', ')}\n` : '') +
    `**Legenda (social):** ${copy.legenda}\n` +
    (copy.cta ? `**CTA:** ${copy.cta}` : '')

  const isLast = conceitoIndex === totalConceitos - 1

  if (isLast) {
    const partesAnteriores = msgAtual.content.includes('---\n\n')
      ? msgAtual.content.split('---\n\n').slice(1).join('---\n\n')
      : ''

    const conteudoFinal = partesAnteriores
      ? `Pronto! Criei ${totalConceitos} conceitos para você:\n\n${partesAnteriores}---\n\n${parteTexto}`
      : `Pronto! Criei ${totalConceitos} conceitos para você:\n\n${parteTexto}`

    await prisma.mensagem.update({
      where: { id: mensagemId },
      data: { content: conteudoFinal, resultados: todosResultados, status: 'concluida' },
    })
  } else {
    const contentSoFar = msgAtual.content.includes('---\n\n')
      ? `${msgAtual.content}---\n\n${parteTexto}\n\n`
      : `Gerando criativos...\n\n${parteTexto}\n\n`

    await prisma.mensagem.update({
      where: { id: mensagemId },
      data: { content: contentSoFar, resultados: todosResultados },
    })
  }

  return NextResponse.json({ success: true, resultados: novasUrls, parteTexto })
}
