// Pluggy API helpers compartilhados

export async function pluggyAuth(): Promise<string> {
  const res = await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: Deno.env.get('PLUGGY_CLIENT_ID')!,
      clientSecret: Deno.env.get('PLUGGY_CLIENT_SECRET')!,
    }),
  });
  if (!res.ok) throw new Error(`Pluggy auth: ${res.status} ${await res.text()}`);
  const { apiKey } = await res.json();
  return apiKey;
}

export async function pluggyGet(path: string, apiKey: string) {
  const res = await fetch(`https://api.pluggy.ai${path}`, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(`Pluggy GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Pluggy categories → categorias do Max
const CAT_MAP: Record<string, string> = {
  'Food and Drink':  'Alimentação',
  'Supermarket':     'Alimentação',
  'Restaurants':     'Alimentação',
  'Transfer':        'Outros',
  'Payment':         'Dívidas/Parcelas',
  'Credit Card':     'Dívidas/Parcelas',
  'Shopping':        'Outros',
  'Travel':          'Transporte',
  'Transport':       'Transporte',
  'Health':          'Saúde',
  'Entertainment':   'Lazer',
  'Services':        'Assinaturas',
  'Education':       'Outros',
  'Taxes':           'Outros',
  'Income':          'Renda Variável',
  'Investment':      'Renda Variável',
  'Housing':         'Moradia',
  'Utilities':       'Moradia',
};

export function mapearCategoria(pluggyCategory: string | null): string {
  if (!pluggyCategory) return 'Outros';
  return CAT_MAP[pluggyCategory] ?? 'Outros';
}

export interface PluggyTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  name?: string;
  category?: string | null;
  date: string; // ISO
}

export function mapearTransacao(t: PluggyTransaction) {
  return {
    pluggy_transaction_id: t.id,
    tipo: t.type === 'CREDIT' ? 'receita' : 'despesa',
    valor: Math.abs(t.amount),
    descricao: t.description || t.name || 'Sem descricao',
    categoria: mapearCategoria(t.category ?? null),
    tipo_negocio: 'pessoal',
    data_transacao: t.date.split('T')[0],
    mes: t.date.slice(0, 7),
    confirmado: true,
  };
}
