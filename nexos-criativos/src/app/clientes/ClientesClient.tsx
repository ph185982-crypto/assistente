'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Cliente {
  id: string
  nome: string
  nicho: string
  _count: { jobs: number; ativos: number }
}

export default function ClientesClient() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { fetchClientes() }, [])

  async function fetchClientes() {
    setLoading(true)
    const res = await fetch('/api/clientes')
    setClientes(await res.json())
    setLoading(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-black text-white text-sm rounded-xl hover:bg-gray-800 transition-colors"
        >
          + Novo cliente
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : clientes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">Nenhum cliente cadastrado</p>
          <p className="text-sm">Adicione o primeiro cliente para começar</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {clientes.map((c) => (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-300 transition-colors"
            >
              <div>
                <p className="font-medium">{c.nome}</p>
                <p className="text-sm text-gray-500">{c.nicho}</p>
              </div>
              <div className="text-right text-xs text-gray-400">
                <p>{c._count.jobs} jobs</p>
                <p>{c._count.ativos} ativos</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showForm && (
        <ClienteFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchClientes() }}
        />
      )}
    </div>
  )
}

interface ClienteFormModalProps {
  onClose: () => void
  onSaved: () => void
  initial?: Partial<ClienteForm>
  clienteId?: string
}

interface ClienteForm {
  nome: string
  nicho: string
  publicoAlvo: string
  tomDeVoz: string
  corPrimaria: string
  corSecundaria: string
  fonteTitulo: string
  ctaPadrao: string
  whatsapp: string
  diferenciais: string
  observacoes: string
}

export function ClienteFormModal({ onClose, onSaved, initial, clienteId }: ClienteFormModalProps) {
  const [form, setForm] = useState<ClienteForm>({
    nome: initial?.nome || '',
    nicho: initial?.nicho || '',
    publicoAlvo: initial?.publicoAlvo || '',
    tomDeVoz: initial?.tomDeVoz || '',
    corPrimaria: initial?.corPrimaria || '#000000',
    corSecundaria: initial?.corSecundaria || '#C8A96E',
    fonteTitulo: initial?.fonteTitulo || 'DM Sans',
    ctaPadrao: initial?.ctaPadrao || 'Chama no WhatsApp',
    whatsapp: initial?.whatsapp || '',
    diferenciais: initial?.diferenciais || '',
    observacoes: initial?.observacoes || '',
  })
  const [saving, setSaving] = useState(false)

  function set(field: keyof ClienteForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const url = clienteId ? `/api/clientes/${clienteId}` : '/api/clientes'
    const method = clienteId ? 'PATCH' : 'POST'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    onSaved()
  }

  const field = (label: string, key: keyof ClienteForm, type = 'text', multiline = false) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
        />
      ) : (
        <input
          type={type}
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">{clienteId ? 'Editar cliente' : 'Novo cliente'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {field('Nome', 'nome')}
            {field('Nicho', 'nicho')}
            {field('Público-alvo', 'publicoAlvo', 'text', true)}
            {field('Tom de voz', 'tomDeVoz', 'text', true)}
            {field('Diferenciais (um por linha)', 'diferenciais', 'text', true)}
            {field('CTA padrão', 'ctaPadrao')}
            {field('WhatsApp (apenas números, com DDI)', 'whatsapp')}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Cor primária</label>
                <input
                  type="color"
                  value={form.corPrimaria}
                  onChange={(e) => set('corPrimaria', e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Cor secundária</label>
                <input
                  type="color"
                  value={form.corSecundaria}
                  onChange={(e) => set('corSecundaria', e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 cursor-pointer"
                />
              </div>
            </div>
            {field('Fonte do título', 'fonteTitulo')}
            {field('Observações / aprendizados', 'observacoes', 'text', true)}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-black text-white rounded-xl text-sm disabled:opacity-40 hover:bg-gray-800 transition-colors"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
