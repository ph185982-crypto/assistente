import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { processarMensagem } from '../_shared/assistente.ts';
import { numerosIguais } from '../_shared/supabase.ts';

const MEU_NUMERO   = Deno.env.get('MEU_NUMERO') ?? '5562984465388';
const VERIFY_TOKEN = Deno.env.get('VERIFY_TOKEN') ?? 'max_webhook_2025';

serve(async (req) => {
  const url = new URL(req.url);

  // GET — verificação Meta
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const body = await req.json().catch(() => ({}));
  const msg  = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (msg && numerosIguais(msg.from, MEU_NUMERO)) {
    const tipo    = msg.type as string;
    const texto   = tipo === 'text'  ? (msg.text?.body as string)  : null;
    const mediaId = tipo === 'image' ? (msg.image?.id as string)   :
                    tipo === 'document' ? (msg.document?.id as string) : null;

    await processarMensagem(msg.from, texto, tipo, mediaId);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
