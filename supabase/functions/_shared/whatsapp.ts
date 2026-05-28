const TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!;
const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
const MEU_NUM  = Deno.env.get('MEU_NUMERO')!;

export async function sendMessage(to: string, texto: string) {
  await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: texto },
    }),
  });
}

export function notificarPedro(texto: string) {
  return sendMessage(MEU_NUM, texto);
}
