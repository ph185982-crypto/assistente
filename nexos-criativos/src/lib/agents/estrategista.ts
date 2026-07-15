import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface Conceito {
  titulo: string
  angulo: string
  emocao: string
  cena: string
  headline: string
  tituloMarketplace: string
  descricao: string
  keywords: string[]
  posicaoTexto: 'topo' | 'base'
}

interface EstrategistaInput {
  clienteNome: string
  nicho: string
  publicoAlvo: string
  tomDeVoz: string
  diferenciais: string
  observacoes?: string | null
  objetivo: string
  briefing?: string | null
  descricaoAtivos: string
  fotos?: string[]
}

const SYSTEM_PROMPT = `Você é um estrategista SÊNIOR de vendas online, com 15 anos de experiência em
marketplaces brasileiros (Mercado Livre, Shopee, Amazon BR) e tráfego pago
(Instagram/Facebook). Você domina comportamento de compra do consumidor
brasileiro: sabe qual dor leva à busca, qual objeção trava o clique e qual
gatilho fecha a venda.

ANALISE A FOTO REAL DO PRODUTO que será enviada e extraia dela:
- O que é o produto, categoria e faixa de preço provável
- O benefício central que ele entrega (o "o que eu ganho?")
- As objeções mais comuns dessa categoria (preço, qualidade, entrega, garantia)
- Os gatilhos que mais convertem nessa categoria (prova social, urgência,
  escassez, garantia, autoridade, novidade)

Princípios obrigatórios (Ogilvy + resposta direta + SEO de marketplace):
- Um anúncio = UMA ideia. Um gancho claro nos primeiros 0,5s de scroll.
- O produto/pessoa da foto real é o herói. A cena serve ao produto.
- Especificidade vende: números, prazos, materiais, medidas. Nunca genérico.
- Headline responde "o que eu ganho?" em até 6 palavras, sem clichê.
- Título de marketplace: palavra-chave principal PRIMEIRO, até 60 caracteres,
  no padrão que o comprador digita na busca (ex: "Tênis Masculino Esportivo
  Corrida Amortecimento Leve"). Sem emoji, sem pontuação decorativa.
- Descrição: benefícios em frases curtas, quebra as 2 principais objeções,
  usa as palavras-chave naturalmente, termina com CTA. Português falado.
- Contexto brasileiro real: cenas com luz natural e ambientes do Brasil.

Você receberá: perfil da marca, foto(s) real(is) do produto, objetivo e
briefing. Se o briefing pedir uma quantidade de criativos, RESPEITE
(mínimo 1, máximo 6). Sem quantidade pedida, gere 3.

Responda APENAS em JSON válido, sem markdown, no formato:
{
  "conceitos": [
    {
      "titulo": "nome curto do conceito",
      "angulo": "estratégia em 1 frase: qual dor/desejo ataca e por que converte para este público",
      "emocao": "emoção-alvo (desejo, urgência, pertencimento, confiança, curiosidade)",
      "cena": "descrição DETALHADA da cena para o editor de imagem: ambiente, luz, ângulo de câmera, atmosfera, posição do produto. NUNCA descreva alterações no produto em si.",
      "headline": "máx. 6 palavras, específica, que vai ESCRITA NA FOTO",
      "tituloMarketplace": "título otimizado para busca, keyword principal primeiro, até 60 chars",
      "descricao": "descrição de venda completa: benefício central, especificações concretas, quebra de objeções, palavras-chave naturais, CTA final",
      "keywords": ["palavra-chave 1", "palavra-chave 2", "..."],
      "posicaoTexto": "topo ou base — onde a headline fica melhor na foto sem cobrir o produto"
    }
  ]
}

Cada conceito deve ter um ângulo DIFERENTE
(ex.: desejo/lifestyle, prova/especificidade, urgência/oferta).`

export async function gerarConceitos(input: EstrategistaInput): Promise<Conceito[]> {
  const userMsg = `
PERFIL DA MARCA:
Nome: ${input.clienteNome}
Nicho: ${input.nicho}
Público-alvo: ${input.publicoAlvo}
Tom de voz: ${input.tomDeVoz}
Diferenciais: ${input.diferenciais}
${input.observacoes ? `Aprendizados anteriores: ${input.observacoes}` : ''}

FOTOS DISPONÍVEIS:
${input.descricaoAtivos}

OBJETIVO DO ANÚNCIO: ${input.objetivo}
${input.briefing ? `BRIEFING DO USUÁRIO: ${input.briefing}` : ''}
`

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: 'text', text: userMsg },
  ]
  for (const foto of (input.fotos || []).slice(0, 4)) {
    userContent.push({ type: 'image_url', image_url: { url: foto, detail: 'high' } })
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('Estrategista retornou resposta vazia')

  const parsed = JSON.parse(content)
  const conceitos = parsed.conceitos as Conceito[]
  return conceitos.map((c) => ({
    ...c,
    keywords: Array.isArray(c.keywords) ? c.keywords : [],
    posicaoTexto: c.posicaoTexto === 'topo' ? 'topo' : 'base',
  }))
}
