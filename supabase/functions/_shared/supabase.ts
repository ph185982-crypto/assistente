import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ── Normaliza número BR (lida com 12 e 13 dígitos) ──────────
export function normalizarNumero(num: string): string {
  // Remove não-dígitos
  const d = num.replace(/\D/g, '');
  // Brasil: 55 + DDD(2) + 9 + 8 dígitos = 13 dígitos
  // Versão antiga: 55 + DDD(2) + 8 dígitos = 12 dígitos
  // Normaliza para 13 dígitos adicionando o 9 se necessário
  if (d.startsWith('55') && d.length === 12) {
    return '55' + d.slice(2, 4) + '9' + d.slice(4);
  }
  return d;
}

export function numerosIguais(a: string, b: string): boolean {
  return normalizarNumero(a) === normalizarNumero(b);
}

// ── Transações ───────────────────────────────────────────────

export async function inserirTransacao(dados: Record<string, unknown>) {
  const mes = (dados.data_transacao as string)?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const { data, error } = await supabase.from('transacoes').insert([{ ...dados, mes }]).select().single();
  if (error) throw error;
  return data;
}

export async function confirmarTransacao(id: string) {
  const { error } = await supabase.from('transacoes').update({ confirmado: true }).eq('id', id);
  if (error) throw error;
}

export async function buscarTransacoesPeriodo(inicio: string, fim: string, categoria?: string) {
  let q = supabase.from('transacoes').select('*').eq('confirmado', true)
    .gte('data_transacao', inicio).lte('data_transacao', fim)
    .order('data_transacao', { ascending: false });
  if (categoria) q = q.eq('categoria', categoria);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function buscarTransacoesHoje() {
  const h = new Date().toISOString().slice(0, 10);
  return buscarTransacoesPeriodo(h, h);
}

export async function buscarTransacoesSemana() {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - hoje.getDay());
  return buscarTransacoesPeriodo(
    inicio.toISOString().slice(0, 10),
    hoje.toISOString().slice(0, 10)
  );
}

export async function buscarTransacoesMes(mes?: string) {
  const ref = mes ?? new Date().toISOString().slice(0, 7);
  const inicio = `${ref}-01`;
  const fim = new Date(ref + '-01');
  fim.setMonth(fim.getMonth() + 1); fim.setDate(0);
  return buscarTransacoesPeriodo(inicio, fim.toISOString().slice(0, 10));
}

export async function buscarTransacoesOntem() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const s = d.toISOString().slice(0, 10);
  return buscarTransacoesPeriodo(s, s);
}

export async function buscarTransacoesSemanaPassada() {
  const hoje = new Date();
  const fim = new Date(hoje); fim.setDate(hoje.getDate() - hoje.getDay() - 1);
  const inicio = new Date(fim); inicio.setDate(fim.getDate() - 6);
  return buscarTransacoesPeriodo(inicio.toISOString().slice(0, 10), fim.toISOString().slice(0, 10));
}

export async function buscarTransacoesMesPassado() {
  const hoje = new Date();
  const mp = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return buscarTransacoesMes(mp.toISOString().slice(0, 7));
}

// ── Pendentes ────────────────────────────────────────────────

export async function setPendente(numero: string, transacaoId: string) {
  const { error } = await supabase.from('pendentes_confirmacao')
    .upsert([{ numero: normalizarNumero(numero), transacao_id: transacaoId }]);
  if (error) throw error;
}

export async function getPendente(numero: string): Promise<string | null> {
  const { data } = await supabase.from('pendentes_confirmacao')
    .select('transacao_id').eq('numero', normalizarNumero(numero)).single();
  return data?.transacao_id ?? null;
}

export async function deletePendente(numero: string) {
  await supabase.from('pendentes_confirmacao').delete().eq('numero', normalizarNumero(numero));
}

// ── Lembretes ────────────────────────────────────────────────

export async function inserirLembrete(dados: Record<string, unknown>) {
  const { data, error } = await supabase.from('lembretes').insert([dados]).select().single();
  if (error) throw error;
  return data;
}

export async function buscarLembretesVencidos() {
  const { data, error } = await supabase.from('lembretes').select('*')
    .eq('enviado', false).lte('data_hora', new Date().toISOString());
  if (error) throw error;
  return data ?? [];
}

export async function marcarLembreteEnviado(id: string) {
  const { error } = await supabase.from('lembretes').update({ enviado: true }).eq('id', id);
  if (error) throw error;
}

export async function buscarProximosLembretes() {
  const { data, error } = await supabase.from('lembretes').select('*')
    .eq('enviado', false).gte('data_hora', new Date().toISOString())
    .order('data_hora', { ascending: true }).limit(5);
  if (error) throw error;
  return data ?? [];
}

// ── Helpers ──────────────────────────────────────────────────

export function calcularResumo(t: Record<string, unknown>[]) {
  const receitas = t.filter(x => x.tipo === 'receita').reduce((s, x) => s + Number(x.valor), 0);
  const despesas = t.filter(x => x.tipo === 'despesa').reduce((s, x) => s + Number(x.valor), 0);
  return { receitas, despesas, saldo: receitas - despesas };
}

export function calcularPorCategoria(t: Record<string, unknown>[]) {
  return t.reduce((acc: Record<string, { despesas: number; receitas: number }>, x) => {
    const cat = (x.categoria as string) ?? 'Outros';
    if (!acc[cat]) acc[cat] = { receitas: 0, despesas: 0 };
    if (x.tipo === 'receita') acc[cat].receitas += Number(x.valor);
    else acc[cat].despesas += Number(x.valor);
    return acc;
  }, {});
}

export function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
