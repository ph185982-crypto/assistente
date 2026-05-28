const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;
const MODEL = 'gpt-4o';

export const SYSTEM_PROMPT = `Você é Max, assistente financeiro pessoal do Pedro.
Personalidade: direto, objetivo, sem enrolação.
Tom de coach financeiro — aponta problemas, sugere soluções.

Contexto do Pedro:
- Empreendedor em Goiânia/GO
- Negócios: Vendedoria (loja ferramentas WA) e LuKaizen Games
- Meta: R$8.000/mês de renda
- Está quitando dívidas (~R$90.000 total)
- Renda atual: ~R$4.550/mês fixo
- Déficit mensal atual: ~R$6.900

Regras:
1. Respostas curtas e diretas no WhatsApp
2. Emojis com moderação
3. Alertar gastos fora do planejado
4. Sempre confirmar antes de salvar
5. Nunca inventar valores
6. Se não entender, perguntar de forma simples`;

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | unknown[];
}

export async function callOpenAI(messages: Message[]): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 512, messages }),
  });
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? '';
}

export async function callAI(userMsg: string, system = SYSTEM_PROMPT): Promise<string> {
  return callOpenAI([
    { role: 'system', content: system },
    { role: 'user', content: userMsg },
  ]);
}

export function extrairJSON(texto: string): Record<string, unknown> | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
