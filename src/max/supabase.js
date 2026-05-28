'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Transações ───────────────────────────────────────────────

async function inserirTransacao(dados) {
  const mes = dados.data_transacao
    ? dados.data_transacao.slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase
    .from('transacoes')
    .insert([{ ...dados, mes }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function confirmarTransacao(id) {
  const { error } = await supabase
    .from('transacoes')
    .update({ confirmado: true })
    .eq('id', id);
  if (error) throw error;
}

async function buscarTransacoesPeriodo(inicio, fim, categoria = null) {
  let q = supabase
    .from('transacoes')
    .select('*')
    .eq('confirmado', true)
    .gte('data_transacao', inicio)
    .lte('data_transacao', fim)
    .order('data_transacao', { ascending: false });

  if (categoria) q = q.eq('categoria', categoria);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function buscarTransacoesHoje() {
  const hoje = new Date().toISOString().slice(0, 10);
  return buscarTransacoesPeriodo(hoje, hoje);
}

async function buscarTransacoesSemana() {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - hoje.getDay());
  return buscarTransacoesPeriodo(
    inicio.toISOString().slice(0, 10),
    hoje.toISOString().slice(0, 10)
  );
}

async function buscarTransacoesMes(mes = null) {
  const ref = mes || new Date().toISOString().slice(0, 7);
  const inicio = `${ref}-01`;
  const fim = new Date(ref + '-01');
  fim.setMonth(fim.getMonth() + 1);
  fim.setDate(0);
  return buscarTransacoesPeriodo(inicio, fim.toISOString().slice(0, 10));
}

async function buscarTransacoesOntem() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const s = d.toISOString().slice(0, 10);
  return buscarTransacoesPeriodo(s, s);
}

async function buscarTransacoesSemanaPassada() {
  const hoje = new Date();
  const fim = new Date(hoje);
  fim.setDate(hoje.getDate() - hoje.getDay() - 1);
  const inicio = new Date(fim);
  inicio.setDate(fim.getDate() - 6);
  return buscarTransacoesPeriodo(
    inicio.toISOString().slice(0, 10),
    fim.toISOString().slice(0, 10)
  );
}

async function buscarTransacoesMesPassado() {
  const hoje = new Date();
  const mp = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return buscarTransacoesMes(mp.toISOString().slice(0, 7));
}

// ── Pendentes de confirmação (substitui o Map em memória) ────

async function setPendente(numero, transacaoId) {
  const { error } = await supabase
    .from('pendentes_confirmacao')
    .upsert([{ numero, transacao_id: transacaoId }]);
  if (error) throw error;
}

async function getPendente(numero) {
  const { data, error } = await supabase
    .from('pendentes_confirmacao')
    .select('transacao_id')
    .eq('numero', numero)
    .single();
  if (error) return null;
  return data?.transacao_id || null;
}

async function deletePendente(numero) {
  await supabase
    .from('pendentes_confirmacao')
    .delete()
    .eq('numero', numero);
}

// ── Lembretes ────────────────────────────────────────────────

async function inserirLembrete(dados) {
  const { data, error } = await supabase
    .from('lembretes')
    .insert([dados])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function buscarLembretesVencidos() {
  const { data, error } = await supabase
    .from('lembretes')
    .select('*')
    .eq('enviado', false)
    .lte('data_hora', new Date().toISOString());
  if (error) throw error;
  return data;
}

async function marcarLembreteEnviado(id) {
  const { error } = await supabase
    .from('lembretes')
    .update({ enviado: true })
    .eq('id', id);
  if (error) throw error;
}

async function buscarProximosLembretes() {
  const { data, error } = await supabase
    .from('lembretes')
    .select('*')
    .eq('enviado', false)
    .gte('data_hora', new Date().toISOString())
    .order('data_hora', { ascending: true })
    .limit(5);
  if (error) throw error;
  return data;
}

// ── Helpers ──────────────────────────────────────────────────

function calcularResumo(transacoes) {
  const receitas = transacoes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
  const despesas = transacoes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
  return { receitas, despesas, saldo: receitas - despesas };
}

function calcularPorCategoria(transacoes) {
  return transacoes.reduce((acc, t) => {
    const cat = t.categoria || 'Outros';
    if (!acc[cat]) acc[cat] = { receitas: 0, despesas: 0 };
    if (t.tipo === 'receita') acc[cat].receitas += Number(t.valor);
    else acc[cat].despesas += Number(t.valor);
    return acc;
  }, {});
}

module.exports = {
  supabase,
  inserirTransacao, confirmarTransacao,
  buscarTransacoesPeriodo, buscarTransacoesHoje, buscarTransacoesSemana,
  buscarTransacoesMes, buscarTransacoesOntem, buscarTransacoesSemanaPassada,
  buscarTransacoesMesPassado,
  setPendente, getPendente, deletePendente,
  inserirLembrete, buscarLembretesVencidos, marcarLembreteEnviado, buscarProximosLembretes,
  calcularResumo, calcularPorCategoria,
};
