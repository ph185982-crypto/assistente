import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ── Números ──────────────────────────────────────────────────

export function normalizarNumero(num: string): string {
  const d = num.replace(/\D/g, '');
  if (d.startsWith('55') && d.length === 12) return '55' + d.slice(2, 4) + '9' + d.slice(4);
  return d;
}

export function numerosIguais(a: string, b: string) {
  return normalizarNumero(a) === normalizarNumero(b);
}

// ── Conversa (memória) ───────────────────────────────────────

export async function salvarMensagem(numero: string, role: 'user' | 'assistant', content: string) {
  await supabase.from('conversas').insert([{ numero: normalizarNumero(numero), role, content }]);
}

export async function buscarHistorico(numero: string, limite = 20) {
  const { data } = await supabase
    .from('conversas')
    .select('role, content')
    .eq('numero', normalizarNumero(numero))
    .order('criado_em', { ascending: false })
    .limit(limite);
  return (data ?? []).reverse();
}

// ── Contexto / Memória sobre Pedro ───────────────────────────

export async function salvarContexto(chave: string, valor: string, categoria = 'geral') {
  await supabase.from('contexto_pedro').upsert([{
    chave, valor, categoria, atualizado_em: new Date().toISOString()
  }]);
}

export async function buscarTodoContexto() {
  const { data } = await supabase.from('contexto_pedro').select('*').order('categoria');
  return data ?? [];
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

export async function cancelarTransacao(id: string) {
  const { error } = await supabase.from('transacoes').delete().eq('id', id);
  if (error) throw error;
}

export async function buscarTransacoesPeriodo(inicio: string, fim: string, filtros?: { categoria?: string; tipo_negocio?: string }) {
  let q = supabase.from('transacoes').select('*').eq('confirmado', true)
    .gte('data_transacao', inicio).lte('data_transacao', fim)
    .order('data_transacao', { ascending: false });
  if (filtros?.categoria) q = q.eq('categoria', filtros.categoria);
  if (filtros?.tipo_negocio) q = q.eq('tipo_negocio', filtros.tipo_negocio);
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
  const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - hoje.getDay());
  return buscarTransacoesPeriodo(inicio.toISOString().slice(0, 10), hoje.toISOString().slice(0, 10));
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
  await supabase.from('pendentes_confirmacao')
    .upsert([{ numero: normalizarNumero(numero), transacao_id: transacaoId }]);
}

export async function getPendente(numero: string) {
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
  const { data } = await supabase.from('lembretes').select('*')
    .eq('enviado', false).lte('data_hora', new Date().toISOString());
  return data ?? [];
}

export async function marcarLembreteEnviado(id: string) {
  await supabase.from('lembretes').update({ enviado: true }).eq('id', id);
}

export async function buscarProximosLembretes() {
  const { data } = await supabase.from('lembretes').select('*')
    .eq('enviado', false).gte('data_hora', new Date().toISOString())
    .order('data_hora', { ascending: true }).limit(5);
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

// ── Receitas Previstas ────────────────────────────────────────

export async function inserirReceitaPrevista(dados: Record<string, unknown>) {
  const { data, error } = await supabase.from('receitas_previstas').insert([dados]).select().single();
  if (error) throw error;
  return data;
}

export async function consultarReceitasPrevistas(status = 'pendente', periodo?: string) {
  let q = supabase.from('receitas_previstas').select('*');
  if (status !== 'todas') q = q.eq('status', status);

  if (periodo) {
    const hoje = new Date();
    if (periodo === 'semana') {
      const fim = new Date(hoje); fim.setDate(hoje.getDate() + 7);
      q = q.gte('data_prevista', hoje.toISOString().slice(0, 10))
           .lte('data_prevista', fim.toISOString().slice(0, 10));
    } else if (periodo === 'mes') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fim    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      q = q.gte('data_prevista', inicio.toISOString().slice(0, 10))
           .lte('data_prevista', fim.toISOString().slice(0, 10));
    } else if (periodo === 'proximo_mes') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
      const fim    = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0);
      q = q.gte('data_prevista', inicio.toISOString().slice(0, 10))
           .lte('data_prevista', fim.toISOString().slice(0, 10));
    }
  }

  const { data, error } = await q.order('data_prevista', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function confirmarReceitaPrevista(id: string, valorReal?: number, dataRecebimento?: string) {
  const { data: prev, error: e1 } = await supabase.from('receitas_previstas').select('*').eq('id', id).single();
  if (e1) throw e1;

  const dataRec    = dataRecebimento ?? new Date().toISOString().slice(0, 10);
  const valorFinal = valorReal ?? Number(prev.valor);

  const { error: e2 } = await supabase.from('receitas_previstas').update({
    status: 'recebida',
    data_recebimento: new Date(dataRec + 'T12:00:00-03:00').toISOString(),
  }).eq('id', id);
  if (e2) throw e2;

  const tx = await inserirTransacao({
    tipo: 'receita',
    valor: valorFinal,
    descricao: prev.descricao,
    categoria: 'Renda Variável',
    tipo_negocio: prev.tipo_negocio ?? 'pessoal',
    empresa: prev.cliente ?? null,
    data_transacao: dataRec,
    confirmado: true,
  });

  return { receita_prevista_id: id, transacao_id: tx.id, valor: valorFinal };
}

export async function marcarReceitasAtrasadas() {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('receitas_previstas')
    .update({ status: 'atrasada' })
    .eq('status', 'pendente')
    .lt('data_prevista', hoje)
    .select();
  if (error) throw error;
  return data ?? [];
}

export async function buscarReceitasPrevistasPróximas(dias = 3) {
  const hoje  = new Date();
  const limite = new Date(hoje); limite.setDate(hoje.getDate() + dias);
  const { data } = await supabase.from('receitas_previstas')
    .select('*')
    .eq('status', 'pendente')
    .gte('data_prevista', hoje.toISOString().slice(0, 10))
    .lte('data_prevista', limite.toISOString().slice(0, 10))
    .order('data_prevista');
  return data ?? [];
}

export async function buscarReceitasPrevistasMes(mes?: string) {
  const ref    = mes ?? new Date().toISOString().slice(0, 7);
  const inicio = `${ref}-01`;
  const fim    = new Date(ref + '-01');
  fim.setMonth(fim.getMonth() + 1); fim.setDate(0);
  const { data } = await supabase.from('receitas_previstas')
    .select('*')
    .gte('data_prevista', inicio)
    .lte('data_prevista', fim.toISOString().slice(0, 10))
    .order('data_prevista');
  return data ?? [];
}

// ── Dívidas ──────────────────────────────────────────────────

export async function inserirDivida(dados: Record<string, unknown>) {
  const { data, error } = await supabase.from('dividas').insert([dados]).select().single();
  if (error) throw error;
  return data;
}

export async function consultarDividas(status = 'ativa') {
  let q = supabase.from('dividas').select('*');
  if (status !== 'todas') q = q.eq('status', status);
  const { data, error } = await q.order('criado_em', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function pagarParcelaDivida(id: string, valorPago: number) {
  const { data: div, error: e1 } = await supabase.from('dividas').select('*').eq('id', id).single();
  if (e1) throw e1;
  const novoPago  = Number(div.valor_pago) + valorPago;
  const novoStatus = novoPago >= Number(div.valor_total) ? 'quitada' : 'ativa';
  const { error: e2 } = await supabase.from('dividas').update({ valor_pago: novoPago, status: novoStatus }).eq('id', id);
  if (e2) throw e2;
  return { id, valor_pago_total: novoPago, status: novoStatus, saldo_restante: Number(div.valor_total) - novoPago };
}

export async function quitarDivida(id: string) {
  const { data: div, error: e1 } = await supabase.from('dividas').select('*').eq('id', id).single();
  if (e1) throw e1;
  const { error } = await supabase.from('dividas').update({ status: 'quitada', valor_pago: div.valor_total }).eq('id', id);
  if (error) throw error;
  return { id, status: 'quitada' };
}

export async function buscarDividasVencendoHoje() {
  const hoje = new Date().getDate();
  const { data } = await supabase.from('dividas').select('*').eq('status', 'ativa').eq('dia_vencimento', hoje);
  return data ?? [];
}

// ── Metas Financeiras ─────────────────────────────────────────

export async function buscarMetasAtivas() {
  const { data } = await supabase.from('metas_financeiras').select('*').eq('status', 'ativa');
  return data ?? [];
}

export async function atualizarMetaFinanceira(id: string, valorAtual: number) {
  const { error } = await supabase.from('metas_financeiras').update({ valor_atual: valorAtual }).eq('id', id);
  if (error) throw error;
}
