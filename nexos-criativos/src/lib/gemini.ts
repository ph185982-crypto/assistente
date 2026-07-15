import { put } from '@vercel/blob'
import { v4 as uuidv4 } from 'uuid'

async function fetchImageData(imagemPath: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (imagemPath.startsWith('http')) {
    const res = await fetch(imagemPath)
    const mimeType = res.headers.get('content-type') || 'image/jpeg'
    return { buffer: Buffer.from(await res.arrayBuffer()), mimeType }
  }
  const fs = await import('fs')
  const path = await import('path')
  const buffer = fs.readFileSync(imagemPath)
  const ext = path.extname(imagemPath).slice(1).toLowerCase()
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { buffer, mimeType }
}

export async function editarImagem(
  imagemPath: string,
  cena: string,
  subdir: string
): Promise<string> {
  const prompt = `Edit this photo for a professional advertising campaign. Keep the product/person EXACTLY as in the original image — same shape, colors, textures, proportions, face and details. Do not redraw, stylize or replace it. Only change the environment and composition: ${cena}. Photorealistic result, natural Brazilian daylight, professional advertising photography, no text, no watermarks, no logos in the scene.`

  const { buffer, mimeType } = await fetchImageData(imagemPath)

  const form = new FormData()
  form.append('model', 'gpt-image-1')
  form.append('size', '1024x1024')
  form.append('quality', 'high')
  form.append('prompt', prompt)
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
  form.append('image', new Blob([new Uint8Array(buffer)], { type: mimeType }), `foto.${ext}`)

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI images/edits falhou (${res.status})`)
  }

  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI não retornou imagem')

  const blob = await put(`${subdir}/${uuidv4()}.png`, Buffer.from(b64, 'base64'), {
    access: 'public',
    contentType: 'image/png',
  })

  return blob.url
}
