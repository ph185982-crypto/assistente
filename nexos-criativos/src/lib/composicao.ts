import sharp from 'sharp'
import { put } from '@vercel/blob'
import { v4 as uuidv4 } from 'uuid'

interface ComposicaoInput {
  imagemBasePath: string
  headline: string
  cta: string
  corPrimaria: string
  corSecundaria: string
  posicaoTexto: 'topo' | 'base'
  logoPath?: string | null
  subdir: string
}

interface ComposicaoOutput {
  path1x1: string
  path4x5: string
  path9x16: string
}

const FORMATOS = {
  '1x1': { width: 1080, height: 1080 },
  '4x5': { width: 1080, height: 1350 },
  '9x16': { width: 1080, height: 1920, zonaSegurao: 250 },
} as const

async function fetchBuffer(source: string): Promise<Buffer> {
  if (source.startsWith('http')) {
    const res = await fetch(source)
    return Buffer.from(await res.arrayBuffer())
  }
  const fs = await import('fs')
  return fs.readFileSync(source)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  }
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = (current + ' ' + word).trim()
    }
  }
  if (current) lines.push(current.trim())
  return lines
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildOverlaySvg(
  width: number,
  height: number,
  headline: string,
  cta: string,
  corPrimaria: string,
  corSecundaria: string,
  posicao: 'topo' | 'base',
  zonaSegurao = 0
): Buffer {
  const rgb = hexToRgb(corPrimaria)
  const rgbSec = hexToRgb(corSecundaria)
  const faixaAltura = Math.round(height * 0.22)
  const faixaY = posicao === 'topo' ? zonaSegurao : height - faixaAltura - zonaSegurao
  const maxChars = Math.floor(width / 28)
  const headlineLines = wrapText(headline.toUpperCase(), maxChars)
  const lineHeight = Math.round(faixaAltura * 0.3)
  const fontSize = Math.round(lineHeight * 0.8)
  const headlineStartY = faixaY + Math.round(faixaAltura * 0.12) + fontSize

  const headlineSvgLines = headlineLines
    .map((line, i) => {
      const y = headlineStartY + i * lineHeight
      return `<text x="${width / 2}" y="${y}" font-family="DM Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="auto">${escapeXml(line)}</text>`
    })
    .join('\n')

  const ctaY = faixaY + faixaAltura - Math.round(faixaAltura * 0.08)
  const ctaFontSize = Math.round(fontSize * 0.5)
  const ctaPadH = 24
  const ctaPadV = 10
  const ctaW = Math.min(cta.length * ctaFontSize * 0.6 + ctaPadH * 2, width * 0.7)
  const ctaH = ctaFontSize + ctaPadV * 2
  const ctaX = width / 2 - ctaW / 2
  const ctaRY = ctaY - ctaH

  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0" y1="${posicao === 'topo' ? '0' : '1'}" x2="0" y2="${posicao === 'topo' ? '1' : '0'}">
      <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${faixaY}" width="${width}" height="${faixaAltura}" fill="url(#grad)"/>
  ${headlineSvgLines}
  <rect x="${ctaX}" y="${ctaRY}" width="${ctaW}" height="${ctaH}" rx="6" fill="rgb(${rgbSec.r},${rgbSec.g},${rgbSec.b})"/>
  <text x="${width / 2}" y="${ctaRY + ctaH / 2}" font-family="DM Sans, Arial, sans-serif" font-size="${ctaFontSize}" font-weight="600" fill="white" text-anchor="middle" dominant-baseline="middle">${escapeXml(cta)}</text>
</svg>`)
}

async function compor(
  imagemSource: string,
  width: number,
  height: number,
  headline: string,
  cta: string,
  corPrimaria: string,
  corSecundaria: string,
  posicaoTexto: 'topo' | 'base',
  logoPath: string | null | undefined,
  zonaSegurao = 0
): Promise<Buffer> {
  const imageBuffer = await fetchBuffer(imagemSource)
  const overlaySvg = buildOverlaySvg(width, height, headline, cta, corPrimaria, corSecundaria, posicaoTexto, zonaSegurao)

  const composites: sharp.OverlayOptions[] = [{ input: overlaySvg, top: 0, left: 0 }]

  if (logoPath) {
    try {
      const logoBuffer = await fetchBuffer(logoPath)
      const logoSize = Math.round(width * 0.12)
      const logoResized = await sharp(logoBuffer).resize(logoSize, logoSize, { fit: 'inside' }).toBuffer()
      const margin = Math.round(width * 0.03)
      composites.push({
        input: logoResized,
        top: margin + (posicaoTexto === 'topo' ? Math.round(height * 0.22) + zonaSegurao : 0),
        left: margin,
      })
    } catch { /* logo opcional */ }
  }

  return sharp(imageBuffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer()
}

export async function gerarFormatos(input: ComposicaoInput): Promise<ComposicaoOutput> {
  const base = uuidv4()

  const [buf1x1, buf4x5, buf9x16] = await Promise.all([
    compor(input.imagemBasePath, FORMATOS['1x1'].width, FORMATOS['1x1'].height,
      input.headline, input.cta, input.corPrimaria, input.corSecundaria, input.posicaoTexto, input.logoPath, 0),
    compor(input.imagemBasePath, FORMATOS['4x5'].width, FORMATOS['4x5'].height,
      input.headline, input.cta, input.corPrimaria, input.corSecundaria, input.posicaoTexto, input.logoPath, 0),
    compor(input.imagemBasePath, FORMATOS['9x16'].width, FORMATOS['9x16'].height,
      input.headline, input.cta, input.corPrimaria, input.corSecundaria, input.posicaoTexto, input.logoPath, FORMATOS['9x16'].zonaSegurao),
  ])

  const [blob1x1, blob4x5, blob9x16] = await Promise.all([
    put(`${input.subdir}/${base}_1x1.jpg`, buf1x1, { access: 'public', contentType: 'image/jpeg' }),
    put(`${input.subdir}/${base}_4x5.jpg`, buf4x5, { access: 'public', contentType: 'image/jpeg' }),
    put(`${input.subdir}/${base}_9x16.jpg`, buf9x16, { access: 'public', contentType: 'image/jpeg' }),
  ])

  return { path1x1: blob1x1.url, path4x5: blob4x5.url, path9x16: blob9x16.url }
}

export async function recompor(
  imagemBasePath: string,
  novaHeadline: string,
  cta: string,
  corPrimaria: string,
  corSecundaria: string,
  posicaoTexto: 'topo' | 'base',
  logoPath: string | null | undefined,
  subdir: string
): Promise<ComposicaoOutput> {
  return gerarFormatos({ imagemBasePath, headline: novaHeadline, cta, corPrimaria, corSecundaria, posicaoTexto, logoPath, subdir })
}
