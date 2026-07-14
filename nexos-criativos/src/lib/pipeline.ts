import { prisma } from './prisma'
import { gerarConceitos } from './agents/estrategista'
import { gerarCopy } from './agents/copy'
import { editarImagem } from './gemini'
import { gerarFormatos } from './composicao'
import path from 'path'

export async function executarPipeline(jobId: string) {
  try {
    const job = await prisma.jobCriativo.findUniqueOrThrow({
      where: { id: jobId },
      include: { cliente: true },
    })

    const ativos = await prisma.ativoVisual.findMany({
      where: { id: { in: job.ativosUsados } },
    })

    if (ativos.length === 0) {
      await prisma.jobCriativo.update({
        where: { id: jobId },
        data: { status: 'erro', erroMsg: 'Nenhum ativo selecionado' },
      })
      return
    }

    const descricaoAtivos = ativos
      .map((a) => `- ${a.tipo}: ${a.descricao || 'sem descrição'} (${path.basename(a.path)})`)
      .join('\n')

    const cliente = job.cliente
    const subdir = `jobs/${jobId}`

    const conceitos = await gerarConceitos({
      clienteNome: cliente.nome,
      nicho: cliente.nicho,
      publicoAlvo: cliente.publicoAlvo,
      tomDeVoz: cliente.tomDeVoz,
      diferenciais: cliente.diferenciais,
      observacoes: cliente.observacoes,
      objetivo: job.objetivo,
      briefing: job.briefing,
      descricaoAtivos,
    })

    const fotoRef =
      ativos.find((a) => a.tipo === 'produto' || a.tipo === 'modelo') ?? ativos[0]

    for (const conceito of conceitos) {
      const copy = await gerarCopy({
        clienteNome: cliente.nome,
        nicho: cliente.nicho,
        tomDeVoz: cliente.tomDeVoz,
        ctaPadrao: cliente.ctaPadrao,
        whatsapp: cliente.whatsapp,
        conceito: {
          titulo: conceito.titulo,
          angulo: conceito.angulo,
          emocao: conceito.emocao,
          headline: conceito.headline,
        },
        objetivo: job.objetivo,
      })

      const dbConceito = await prisma.conceito.create({
        data: {
          jobId,
          titulo: conceito.titulo,
          angulo: conceito.angulo,
          headline: conceito.headline,
          legenda: copy.legenda,
          cta: copy.cta,
          promptImg: conceito.cena,
        },
      })

      for (let v = 0; v < 2; v++) {
        try {
          const imagemBase = await editarImagem(fotoRef.path, conceito.cena, subdir)

          const formatos = await gerarFormatos({
            imagemBasePath: imagemBase,
            headline: conceito.headline,
            cta: copy.cta,
            corPrimaria: cliente.corPrimaria,
            corSecundaria: cliente.corSecundaria,
            posicaoTexto: conceito.posicaoTexto,
            logoPath: cliente.logoPath,
            subdir,
          })

          await prisma.variacao.create({
            data: {
              conceitoId: dbConceito.id,
              pathBase: imagemBase,
              path1x1: formatos.path1x1,
              path4x5: formatos.path4x5,
              path9x16: formatos.path9x16,
            },
          })
        } catch (err) {
          console.error(`Erro na variação ${v + 1} do conceito ${conceito.titulo}:`, err)
        }
      }
    }

    await prisma.jobCriativo.update({
      where: { id: jobId },
      data: { status: 'pronto' },
    })
  } catch (err) {
    console.error('Pipeline error:', err)
    await prisma.jobCriativo.update({
      where: { id: jobId },
      data: {
        status: 'erro',
        erroMsg: err instanceof Error ? err.message : String(err),
      },
    })
  }
}
