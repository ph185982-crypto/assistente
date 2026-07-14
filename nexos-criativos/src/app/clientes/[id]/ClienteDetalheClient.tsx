'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { ClienteFormModal } from '../ClientesClient'

interface Ativo {
  id: string
  tipo: string
  descricao: string | null
  path: string
}

interface Cliente {
  id: string
  nome: string
  nicho: string
  publicoAlvo: string
  tomDeVoz: string
  corPrimaria: string
  corSecundaria: string
  fonteTitulo: string
  ctaPadrao: string
  whatsapp: string | null
  logoPath: string | null
  diferenciais: string
  observacoes: string | null
  ativos: Ativo[]
}

function pathToUrl(p: string): string {
  if (!p) return ''
  if (p.startsWith('http')) return p
  const parts = p.replace(/\\/g, '/').split('/')
  const storageIdx = parts.lastIndexOf('storage')
  if (storageIdx !== -1) return '/api/storage/' + parts.slice(storageIdx + 1).join('/')
  return p
}

export default function ClienteDetalheClient({ id }: { id: string }) {
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadTipo, setUploadTipo] = useState('produto')
  const [uploadDesc, setUploadDesc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchCliente() }, [id])

  async function fetchCliente() {
    setLoading(true)
    const res = await fetch(`/api/clientes/${id}`)
    setCliente(await res.json())
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('clienteId', id)
    fd.append('tipo', uploadTipo)
    fd.append('descricao', uploadDesc)
    await fetch('/api/ativos', { method: 'POST', body: fd })
    setUploading(false)
    setUploadDesc('')
    fetchCliente()
  }

  async function deleteAtivo(ativoId: string) {
    if (!confirm('Remover este ativo?')) return
    await fetch(`/api/ativos/${ativoId}`, { method: 'DELETE' })
    fetchCliente()
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-8 text-gray-400 text-sm">Carregando...</div>
  if (!cliente) return <div className="max-w-4xl mx-auto px-4 py-8 text-red-500">Cliente não encontrado</div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/clientes" className="text-xs text-gray-400 hover:text-gray-700 mb-2 inline-block">← Clientes</Link>
          <h1 className="text-2xl font-bold">{cliente.nome}</h1>
          <p className="text-gray-500 text-sm">{cliente.nicho}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Editar
          </button>
          <Link
            href={`/gerar?clienteId=${id}`}
            className="px-3 py-1.5 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Gerar criativo
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Perfil de marca</h3>
          <div className="space-y-2 text-sm">
            <InfoRow label="Público" value={cliente.publicoAlvo} />
            <InfoRow label="Tom de voz" value={cliente.tomDeVoz} />
            <InfoRow label="CTA padrão" value={cliente.ctaPadrao} />
            {cliente.whatsapp && <InfoRow label="WhatsApp" value={cliente.whatsapp} />}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Visual</h3>
          <div className="flex gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg border border-gray-100" style={{ background: cliente.corPrimaria }} />
              <span className="text-xs text-gray-500">Primária</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg border border-gray-100" style={{ background: cliente.corSecundaria }} />
              <span className="text-xs text-gray-500">Secundária</span>
            </div>
          </div>
          <InfoRow label="Fonte" value={cliente.fonteTitulo} />
          {cliente.diferenciais && (
            <div className="mt-2">
              <span className="text-xs text-gray-500">Diferenciais</span>
              <p className="text-sm mt-0.5 whitespace-pre-line">{cliente.diferenciais}</p>
            </div>
          )}
        </div>

        {cliente.observacoes && (
          <div className="sm:col-span-2 bg-amber-50 rounded-xl border border-amber-100 p-4">
            <h3 className="text-xs font-semibold text-amber-700 uppercase mb-2">Aprendizados</h3>
            <p className="text-sm text-amber-900 whitespace-pre-line">{cliente.observacoes}</p>
          </div>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Ativos visuais</h2>

        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <h3 className="text-sm font-medium mb-3">Adicionar ativo</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo</label>
              <select
                value={uploadTipo}
                onChange={(e) => setUploadTipo(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="produto">Produto</option>
                <option value="modelo">Modelo</option>
                <option value="ambiente">Ambiente</option>
                <option value="logo">Logo</option>
              </select>
            </div>
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 mb-1">Descrição</label>
              <input
                type="text"
                placeholder="ex.: vestido midi floral, frente"
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm disabled:opacity-40 hover:bg-gray-800 transition-colors"
            >
              {uploading ? 'Enviando...' : 'Escolher arquivo'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </div>
        </div>

        {cliente.ativos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum ativo enviado ainda</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cliente.ativos.map((a) => (
              <div key={a.id} className="relative group">
                <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden">
                  <img
                    src={pathToUrl(a.path)}
                    alt={a.descricao || a.tipo}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="mt-1">
                  <span className="text-xs font-medium text-gray-700 capitalize">{a.tipo}</span>
                  {a.descricao && <p className="text-xs text-gray-400 truncate">{a.descricao}</p>}
                </div>
                <button
                  onClick={() => deleteAtivo(a.id)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEdit && (
        <ClienteFormModal
          clienteId={id}
          initial={cliente ? { ...cliente, whatsapp: cliente.whatsapp ?? '', observacoes: cliente.observacoes ?? '' } : undefined}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); fetchCliente() }}
        />
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-gray-500">{label}: </span>
      <span className="text-sm">{value}</span>
    </div>
  )
}
