'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface Cliente {
  id: string
  nome: string
  nicho: string
  ativos: { id: string; tipo: string; descricao: string | null }[]
}

interface Ativo {
  id: string
  tipo: string
  descricao: string | null
}

const OBJETIVOS = [
  { value: 'venda_direta', label: 'Venda direta' },
  { value: 'promocao', label: 'Promoção / oferta' },
  { value: 'branding', label: 'Branding' },
  { value: 'lancamento', label: 'Lançamento' },
]

export default function GerarClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const preClienteId = searchParams.get('clienteId') || ''

  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([])
  const [clienteId, setClienteId] = useState(preClienteId)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [ativosSelecionados, setAtivosSelecionados] = useState<string[]>([])
  const [objetivo, setObjetivo] = useState('venda_direta')
  const [briefing, setBriefing] = useState('')
  const [gerando, setGerando] = useState(false)
  const [passo, setPasso] = useState(1)

  useEffect(() => {
    fetch('/api/clientes').then((r) => r.json()).then(setClientes)
  }, [])

  useEffect(() => {
    if (!clienteId) { setCliente(null); return }
    fetch(`/api/clientes/${clienteId}`).then((r) => r.json()).then((c) => {
      setCliente(c)
      setAtivosSelecionados([])
    })
  }, [clienteId])

  function toggleAtivo(id: string) {
    setAtivosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleGerar() {
    if (!clienteId || !ativosSelecionados.length) return
    setGerando(true)
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId, objetivo, briefing: briefing || null, ativosUsados: ativosSelecionados }),
    })
    const job = await res.json()
    router.push(`/jobs/${job.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Gerar criativos</h1>
      <p className="text-gray-500 text-sm mb-8">Pipeline completo: estratégia → imagem → copy → composição</p>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${passo >= 1 ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
          <h2 className="font-semibold">Selecionar cliente</h2>
        </div>
        <select
          value={clienteId}
          onChange={(e) => { setClienteId(e.target.value); setPasso(e.target.value ? 2 : 1) }}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        >
          <option value="">Selecione um cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      {cliente && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${passo >= 2 ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
            <h2 className="font-semibold">Fotos e objetivo</h2>
          </div>

          {cliente.ativos.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              Este cliente não tem ativos. <a href={`/clientes/${clienteId}`} className="underline">Adicionar fotos</a>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-2">Selecione as fotos de referência:</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(cliente.ativos as Ativo[]).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { toggleAtivo(a.id); setPasso(2) }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      ativosSelecionados.includes(a.id)
                        ? 'border-black bg-black/5 ring-2 ring-black'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <p className="text-xs font-medium capitalize">{a.tipo}</p>
                    {a.descricao && <p className="text-xs text-gray-500 truncate mt-0.5">{a.descricao}</p>}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Objetivo do anúncio</label>
            <div className="grid grid-cols-2 gap-2">
              {OBJETIVOS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setObjetivo(o.value)}
                  className={`py-2 px-3 rounded-lg border text-sm transition-all ${
                    objetivo === o.value
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-medium text-gray-600 mb-1">Briefing adicional (opcional)</label>
            <textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              placeholder="Ex.: focar no preço especial de R$79, prazo até sexta-feira, cliente quer algo mais jovem..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <button
            onClick={handleGerar}
            disabled={gerando || ativosSelecionados.length === 0}
            className="w-full py-4 bg-black text-white rounded-xl font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
          >
            {gerando ? 'Iniciando pipeline...' : 'Gerar 6 criativos'}
          </button>

          {ativosSelecionados.length === 0 && (
            <p className="text-xs text-center text-gray-400 mt-2">Selecione pelo menos uma foto para continuar</p>
          )}
        </div>
      )}
    </div>
  )
}
