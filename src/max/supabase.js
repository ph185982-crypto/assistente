'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Transações ──────────────────────────────────────────────

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
  let query = supabase
    .from('transacoes')
    .select('*')
    .eq('confirmado', true)
    .gte('data_transacao', inicio)
    .lte('data_transacao', fim)
    .order('data_transacao', { ascending: false });

  if (categoria) query = query.eq('categoria', categoria);

  const { data, error } = await query;
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
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const d = ontem.toISOString().slice(0, 10);
  return buscarTransacoesPeriodo(d, d);
}

async function buscarTransacoesSemanaPassada() {
  const hoje = new Date();
  const fimSemana = new Date(hoje);
  fimSemana.setDate(hoje.getDate() - hoje.getDay() - 1);
  const inicioSemana = new Date(fimSemana);
  inicioSemana.setDate(fimSemana.getDate() - 6);
  return buscarTransacoesPeriodo(
    inicioSemana.toISOString().slice(0, 10),
    fimSemana.toISOString().slice(0, 10)
  );
}

async function buscarTransacoesMesPassado() {
  const hoje = new Date();
  const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return buscarTransacoesMes(mesPassado.toISOString().slice(0, 7));
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

// ── Helpers de cálculo ───────────────────────────────────────

function calcularResumo(transacoes) {
  const receitas = transacoes
    .filter(t => t.tipo === 'receita')
    .reduce((s, t) => s + Number(t.valor), 0);

  const despesas = transacoes
    .filter(t => t.tipo === 'despesa')
    .reduce((s, t) => s + Number(t.valor), 0);

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
  inserirTransacao,
  confirmarTransacao,
  buscarTransacoesPeriodo,
  buscarTransacoesHoje,
  buscarTransacoesSemana,
  buscarTransacoesMes,
  buscarTransacoesOntem,
  buscarTransacoesSemanaPassada,
  buscarTransacoesMesPassado,
  inserirLembrete,
  buscarLembretesVencidos,
  marcarLembreteEnviado,
  buscarProximosLembretes,
  calcularResumo,
  calcularPorCategoria,
};
