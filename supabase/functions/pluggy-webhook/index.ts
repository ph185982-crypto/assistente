import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { supabase } from '../_shared/supabase.ts';
import { pluggyAuth, pluggyGet, mapearTransacao, PluggyTransaction } from '../_shared/pluggy.ts';
import { notificarPedro } from '../_shared/whatsapp.ts';
import { fmt } from '../_shared/supabase.ts';

const EVENTOS_RELEVANTES = ['transactions/updated', 'item/updated', 'item/created'];

serve(async (req) => {
  // Pluggy exige 200 rápido — processa em background
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  let payload: { event: string; itemId?: string; data?: { itemId?: string } };
  try {
    payload = await req.json();
  } catch {
    return new Response('ok', { status: 200 });
  }

  const event  = payload.event ?? '';
  const itemId = payload.itemId ?? payload.data?.itemId ?? Deno.env.get('PLUGGY_ITEM_ID');

  // Responde 200 imediatamente e processa async
  const response = new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!EVENTOS_RELEVANTES.includes(event)) {
    console.log(`[pluggy-webhook] evento ignorado: ${event}`);
    return response;
  }

  // Processa em background
  EdgeRuntime.waitUntil(processarWebhook(event, itemId));

  return response;
});

async function processarWebhook(event: string, itemId: string | undefined) {
  try {
    if (!itemId) {
      console.error('[pluggy-webhook] itemId ausente');
      return;
    }

    const apiKey = await pluggyAuth();

    // Busca contas do item
    const { results: accounts } = await pluggyGet(`/accounts?itemId=${itemId}`, apiKey);
    if (!accounts?.length) return;

    // Últimos 3 dias para pegar só novas transações
    const tresDiasAtras = new Date();
    tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
    const from = tresDiasAtras.toISOString().slice(0, 10);

    const novasTransacoes: ReturnType<typeof mapearTransacao>[] = [];

    for (const account of accounts) {
      const path = `/transactions?accountId=${account.id}&pageSize=50&from=${from}`;
      const { results: txs } = await pluggyGet(path, apiKey);
      if (!txs?.length) continue;

      const rows = (txs as PluggyTransaction[]).map(mapearTransacao);

      const { data, error } = await supabase
        .from('transacoes')
        .upsert(rows, { onConflict: 'pluggy_transaction_id', ignoreDuplicates: true })
        .select('descricao, valor, tipo');

      if (error) {
        console.error('[pluggy-webhook] upsert error:', error);
      } else if (data?.length) {
        novasTransacoes.push(...(data as ReturnType<typeof mapearTransacao>[]));
      }
    }

    // Notifica Pedro no WhatsApp se tiver transações novas
    if (novasTransacoes.length > 0) {
      const linhas = novasTransacoes.slice(0, 5).map(t =>
        `• ${t.descricao} — R$ ${fmt(Number(t.valor))} (${t.tipo})`
      ).join('\n');

      const restante = novasTransacoes.length > 5
        ? `\n...e mais ${novasTransacoes.length - 5} transacao(oes).`
        : '';

      await notificarPedro(
        `Peguei ${novasTransacoes.length} transacao(oes) nova(s) do Bradesco:\n${linhas}${restante}\nJa estao registradas.`
      );
    }

    console.log(`[pluggy-webhook] event=${event} novas=${novasTransacoes.length}`);
  } catch (err) {
    console.error('[pluggy-webhook] processarWebhook error:', err);
  }
}

// Deno Deploy / Supabase Edge Runtime global
declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void };
