import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { supabase } from '../_shared/supabase.ts';
import { pluggyAuth, pluggyGet, mapearTransacao, PluggyTransaction } from '../_shared/pluggy.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url    = new URL(req.url);
    const dias   = parseInt(url.searchParams.get('dias') ?? '90', 10);
    const itemId = Deno.env.get('PLUGGY_ITEM_ID');

    if (!itemId) {
      return new Response(JSON.stringify({ error: 'PLUGGY_ITEM_ID nao configurado' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = await pluggyAuth();

    // Busca contas do item
    const { results: accounts } = await pluggyGet(`/accounts?itemId=${itemId}`, apiKey);
    if (!accounts?.length) {
      return new Response(JSON.stringify({ error: 'Nenhuma conta encontrada', itemId }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - dias);
    const from = dataInicio.toISOString().slice(0, 10);

    let inseridas = 0;
    let duplicatas = 0;
    let erros = 0;

    for (const account of accounts) {
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const path = `/transactions?accountId=${account.id}&pageSize=500&from=${from}&page=${page}`;
        const { results: txs, totalPages: tp } = await pluggyGet(path, apiKey);
        totalPages = tp ?? 1;

        if (!txs?.length) break;

        const rows = (txs as PluggyTransaction[]).map(mapearTransacao);

        const { error, data } = await supabase
          .from('transacoes')
          .upsert(rows, { onConflict: 'pluggy_transaction_id', ignoreDuplicates: true })
          .select('id');

        if (error) {
          console.error('[pluggy-sync] upsert error:', error);
          erros += rows.length;
        } else {
          const novas = data?.length ?? 0;
          inseridas += novas;
          duplicatas += rows.length - novas;
        }

        page++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, inseridas, duplicatas, erros, periodo_dias: dias, contas: accounts.length }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[pluggy-sync]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
