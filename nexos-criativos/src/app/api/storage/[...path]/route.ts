import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, existsSync, statSync } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { ReadableStream } from 'stream/web'

const STORAGE = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage')

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params
  const filePath = path.join(STORAGE, ...pathParts)

  if (!filePath.startsWith(path.resolve(STORAGE))) {
    return new NextResponse('Proibido', { status: 403 })
  }

  if (!existsSync(filePath)) {
    return new NextResponse('Não encontrado', { status: 404 })
  }

  const stat = statSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const contentType =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'

  const nodeStream = createReadStream(filePath)
  const webStream = Readable.toWeb(nodeStream) as ReadableStream

  return new NextResponse(webStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'public, max-age=31536000',
    },
  })
}
