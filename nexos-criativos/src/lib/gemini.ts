import { GoogleGenerativeAI } from '@google/generative-ai'
import { put } from '@vercel/blob'
import { v4 as uuidv4 } from 'uuid'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-preview-image-generation' })

  const prompt = `Edit this photo. Keep the product/person EXACTLY as in the original image — same shape, colors, textures, proportions, face and details. Do not redraw, stylize or replace it. Only change the environment and composition: ${cena}. Photorealistic result, natural Brazilian daylight, professional advertising photography, no text, no watermarks, no logos in the scene.`

  const { buffer: imageData, mimeType } = await fetchImageData(imagemPath)
  const base64Image = imageData.toString('base64')

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Image } },
        ],
      },
    ],
    generationConfig: {
      // @ts-expect-error - responseModalities not in types yet
      responseModalities: ['image'],
    },
  })

  const candidates = result.response.candidates
  if (!candidates || candidates.length === 0) throw new Error('Gemini não retornou candidatos')

  const parts = candidates[0].content?.parts
  if (!parts) throw new Error('Gemini não retornou partes')

  let imageBytes: string | null = null
  let responseMimeType = 'image/jpeg'
  for (const part of parts) {
    if (part.inlineData) {
      imageBytes = part.inlineData.data
      responseMimeType = part.inlineData.mimeType || 'image/jpeg'
      break
    }
  }

  if (!imageBytes) throw new Error('Gemini não retornou imagem nos dados inline')

  const outputExt = responseMimeType.includes('png') ? 'png' : 'jpg'
  const blob = await put(`${subdir}/${uuidv4()}.${outputExt}`, Buffer.from(imageBytes, 'base64'), {
    access: 'public',
    contentType: responseMimeType,
  })

  return blob.url
}
