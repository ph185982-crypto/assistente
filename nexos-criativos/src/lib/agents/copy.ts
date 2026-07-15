import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface CopyInput {
  clienteNome: string
  nicho: string
  tomDeVoz: string
  ctaPadrao: string
  whatsapp?: string | null
  conceito: {
    titulo: string
    angulo: string
    emocao: string
    headline: string
  }
  objetivo: string
}

interface CopyOutput {
  legenda: string
  cta: string
}

const SYSTEM_PROMPT = `Você é um copywriter sênior de resposta direta para negócios brasileiros.
Escreve como um vendedor bom de papo escreve no WhatsApp — não como uma IA.
Estrutura mental: dor → solução → prova concreta → CTA.

PROIBIDO (cara de IA):
- "Descubra", "Desperte", "Eleve", "Transforme sua experiência", "Não perca"
- Emojis em excesso (máx. 2 por legenda, nunca no início de frase)
- Pontos de exclamação em sequência; travões decorativos; listas com ✨🔥
- Perguntas retóricas genéricas ("Cansado de...?")
- Qualquer palavra que ningúem fala em voz alta numa conversa

OBRIGATÓRIO:
- Frases curtas. Português falado. Especificidade (números, prazos, nomes).
- Estrutura: gancho (1 linha) → benefício concreto (1-2 linhas) → CTA com o WhatsApp do cliente.
- Tom conforme o perfil do cliente fornecido.

Responda APENAS em JSON: { "legenda": "...", "cta": "..." }`

export async function gerarCopy(input: CopyInput): Promise<CopyOutput> {
  const userMsg = `
CLIENTE: ${input.clienteNome} (${input.nicho})
TOM: ${input.tomDeVoz}
CTA PADRÃO: ${input.ctaPadrao}
${input.whatsapp ? `WHATSAPP: https://wa.me/${input.whatsapp}` : ''}

CONCEITO DO ANÚNCI:
- Título: ${input.conceito.titulo}
- Ângulo: ${input.conceito.angulo}
- Emoção-alvo: ${input.conceito.emocao}
- Headline já definida: "${input.conceito.headline}"

OBJETIVO: ${input.objetivo}

Escreva a legenda do post e o CTA para este anúncio.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })

  const content = response.choices[0].message.content
  if (!content) throw new Error('Agente copy retornou resposta vazia')

  return JSON.parse(content) as CopyOutput
}
