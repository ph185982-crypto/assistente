// Rodar com:
// PLUGGY_CLIENT_ID=xxx PLUGGY_CLIENT_SECRET=xxx PLUGGY_ITEM_ID=xxx deno run --allow-net --allow-env scripts/registrar-webhook.ts

const CLIENT_ID     = Deno.env.get('PLUGGY_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('PLUGGY_CLIENT_SECRET')!;
const ITEM_ID       = Deno.env.get('PLUGGY_ITEM_ID')!;
const SUPABASE_URL  = 'https://dzkfwttquhjudsryqhyu.supabase.co/functions/v1/pluggy-webhook';

if (!CLIENT_ID || !CLIENT_SECRET || !ITEM_ID) {
  console.error('Erro: defina PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_ITEM_ID');
  Deno.exit(1);
}

// 1. Autentica na Pluggy
console.log('Autenticando na Pluggy...');
const authRes = await fetch('https://api.pluggy.ai/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
});
const { apiKey } = await authRes.json();
if (!apiKey) { console.error('Falha na autenticacao:', authRes.status); Deno.exit(1); }
console.log('Autenticado com sucesso.');

// 2. Lista webhooks existentes
const listRes = await fetch('https://api.pluggy.ai/webhooks', {
  headers: { 'X-API-KEY': apiKey },
});
const { results: existentes } = await listRes.json();
console.log(`Webhooks existentes: ${existentes?.length ?? 0}`);

// 3. Registra webhook para transactions/updated
console.log(`Registrando webhook -> ${SUPABASE_URL}`);
const webhookRes = await fetch('https://api.pluggy.ai/webhooks', {
  method: 'POST',
  headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: SUPABASE_URL,
    event: 'transactions/updated',
    itemId: ITEM_ID,
  }),
});
const webhook = await webhookRes.json();
console.log('Webhook registrado:', JSON.stringify(webhook, null, 2));

// 4. Registra para item/updated tambem
const webhookRes2 = await fetch('https://api.pluggy.ai/webhooks', {
  method: 'POST',
  headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: SUPABASE_URL,
    event: 'item/updated',
    itemId: ITEM_ID,
  }),
});
const webhook2 = await webhookRes2.json();
console.log('Webhook item/updated registrado:', JSON.stringify(webhook2, null, 2));
