import { prisma } from './prisma'
import { gerarConceitos } from './agents/estrategista'
import { gerarCopy } from './agents/copy'
import { editarImagem } from './gemini'
import { gerarFormatos } from './composicao'

export async function executarPipelineChat(
  projetoId: string,
  mensagemId: string,
  briefing: string,
  anexos: string[]
) {
  try {
    const projeto = await prisma.projeto.findUniqueOrThrow({
      where: { id: projetoId },
    })

    if (anexos.length === 0) {
      await prisma.mensagem.update({
        where: { id: mensagemId },
        data: {
          content: 'Envie pelo menos uma foto para eu criar os anúncios.',
          status: 'erro',
        },
      })
      return
    }

    const descricaoAtivos = anexos
      .map((_, i) => `- foto ${i + 1}: imagem enviada pelo usuário`)
      .join('\n')

    const subdir = `chat/${projetoId}/${mensagemId}`

    await prisma.mensagem.update({
      where: { id: mensagemId },
      data: { content: 'Analisando o briefing e gerando conceitos...' },
    })

    const conceitos = await gerarConceitos({
      clienteNome: projeto.nome,
      nicho: projeto.nicho || 'geral',
      publicoAlvo: projeto.publicoAlvo || 'público geral',
      tomDeVoz: projeto.tomDeVoz || 'profissional e direto',
      diferenciais: projeto.diferenciais || '',
      observacoes: null,
      objetivo: 'venda_direta',
      briefing,
      descricaoAtivos,
      fotos: anexos,
    })

    const fotoRef = anexos[0]
    const resultados: string[] = []
    const partes: string[] = []

    for (const conceito of conceitos) {
      await prisma.mensagem.update({
        where: { id: mensagemId },
        data: { content: `Criando visual para "${conceito.titulo}"...` },
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

      try {
        const imagemBase = await editarImagem(fotoRef, conceito.cena, subdir)

        const formatos = await gerarFormatos({
          imagemBasePath: imagemBase,
          headline: conceito.headline,
          cta: copy.cta,
          corPrimaria: projeto.corPrimaria || '#000000',
          corSecundaria: projeto.corSecundaria || '#ffffff',
          posicaoTexto: conceito.posicaoTexto,
          logoPath: projeto.logoPath,
          subdir,
        })

        resultados.push(formatos.path1x1)
        if (formatos.path4x5) resultados.push(formatos.path4x5)
        if (formatos.path9x16) resultados.push(formatos.path9x16)

        partes.push(
          `**${conceito.titulo}**\n` +
          `${conceito.angulo}\n\n` +
          `**Headline (na foto):** ${conceito.headline}\n` +
          (conceito.tituloMarketplace ? `**Título p/ marketplace:** ${conceito.tituloMarketplace}\n` : '') +
          (conceito.descricao ? `**Descrição de venda:**\n${conceito.descricao}\n` : '') +
          (conceito.keywords?.length ? `**Palavras-chave:** ${conceito.keywords.join(', ')}\n` : '') +
          `**Legenda (social):** ${copy.legenda}\n` +
          (copy.cta ? `**CTA:** ${copy.cta}` : '')
        )
      } catch (err) {
        console.error(`Erro no conceito ${conceito.titulo}:`, err)
        const motivo = err instanceof Error ? err.message : String(err)
        partes.push(`**${conceito.titulo}** — erro ao gerar imagem (${motivo})`)
      }
    }

    const conteudoFinal =
      `Pronto! Criei ${conceitos.length} conceitos para você:\n\n` +
      partes.join('\n\n---\n\n')

    await prisma.mensagem.update({
      where: { id: mensagemId },
      data: {
        content: conteudoFinal,
        resultados,
        status: 'concluida',
      },
    })
  } catch (err) {
    console.error('Pipeline chat error:', err)
    await prisma.mensagem.update({
      where: { id: mensagemId },
      data: {
        content: `Erro ao processar: ${err instanceof Error ? err.message : String(err)}`,
        status: 'erro',
      },
    })
  }
}
