import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface Conceito {
  titulo: string
  angulo: string
  emocao: string
  cena: string
  headline: string
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
}

const SYSTEM_PROMPT = `Você é diretor de criação sênior de uma agência de performance. Sua função é
gerar CONCEITOS de anúncio de imagem estática para tráfego pago local
(Instagram/Facebook), com base no perfil da marca e na foto real disponível.

Princípios obrigatórios (fundamentos de David Ogilvy e resposta direta):
- Um anúncio = UMA ideia. Um gancho claro nos primeiros 0,5s de scroll.
- O produto/pessoa da foto real é o herói. A cena serve ao produto, nunca compete.
- Especificidade vende: "corte + barba em 40min" > "qualidade e agilidade".
- Contexto local e realista > cenário fantasioso. O público é de Goiânia/Brasil:
  cenas devem parecer fotografadas aqui (luz natural, ambientes brasileiros).
- Emoção antes de informação: cada conceito declara a emoção-alvo
  (desejo, urgência, pertencimento, confiança, curiosidade).

Você receberá: perfil do cliente, descrição da(s) foto(s) real(is), objetivo
do anúncio e briefing opcional.

Responda APENAS em JSON válido, sem markdown, no formato:
{
  "conceitos": [
    {
      "titulo": "nome curto do conceito",
      "angulo": "estratégia em 1 frase (por que isso converte para este público)",
      "emocao": "emoção-alvo",
      "cena": "descrição DETALHADA da cena para o editor de imagem: ambiente, luz, ângulo de câmera, atmosfera, posição do produto/modelo. NUNCA descreva alterações no produto/pessoa em si.",
      "headline": "máx. 6 palavras, específica, sem clichê",
      "posicaoTexto": "topo"
    }
  ]
}

Gere exatamente 3 conceitos com ângulos DIFERENTES entre si
(ex.: desejo/lifestyle, prova/especificidade, urgência/oferta).`

export async function gerarConceitos(input: EstrategistaInput): Promise<Conceito[]> {
  const userMsg = `
PERFIL DO CLIENTE:
Nome: ${input.clienteNome}
Nicho: ${input.nicho}
Público-alvo: ${input.publicoAlvo}
Tom de voz: ${input.tomDeVoz}
Diferenciais: ${input.diferenciais}
${input.observacoes ? `Aprendizados anteriores: ${input.observacoes}` : ''}

FOTOS DISPONÍVEIS:
${input.descricaoAtivos}

OBJETIVO DO ANÚNCI: ${input.objetivo}
${input.briefing ? `BRIEFING ADICIONAL: ${input.briefing}` : ''}
`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('Estrategista retornou resposta vazia')

  const parsed = JSON.parse(content)
  return parsed.conceitos as Conceito[]
}
