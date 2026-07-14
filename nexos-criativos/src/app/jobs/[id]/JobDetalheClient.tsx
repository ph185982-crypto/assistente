'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

interface Variacao {
  id: string
  pathBase: string
  path1x1: string | null
  path4x5: string | null
  path9x16: string | null
  aprovada: boolean
  feedback: string | null
}

interface Conceito {
  id: string
  titulo: string
  angulo: string
  headline: string
  legenda: string
  cta: string | null
  variacoes: Variacao[]
}

interface Job {
  id: string
  objetivo: string
  status: string
  erroMsg: string | null
  briefing: string | null
  criadoEm: string
  cliente: {
    nome: string
    corPrimaria: string
    corSecundaria: string
  }
  conceitos: Conceito[]
}

function pathToUrl(p: string | null): string {
  if (!p) return ''
  const parts = p.replace(/\\/g, '/').split('/')
  const storageIdx = parts.lastIndexOf('storage')
  if (storageIdx !== -1) {
    return '/api/storage/' + parts.slice(storageIdx + 1).join('/')
  }
  return p
}

export default function JobDetalheClient({ id }: { id: string }) {
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [formato, setFormato] = useState<'1x1' | '4x5' | '9x16'>('1x1')
  const [editandoHeadline, setEditandoHeadline] = useState<string | null>(null)
  const [novaHeadline, setNovaHeadline] = useState('')
  const [recompondo, setRecompondo] = useState(false)

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${id}`)
    const data = await res.json()
    setJob(data)
    setLoading(false)
    return data.status
  }, [id])

  useEffect(() => {
    fetchJob().then((status) => {
      if (status === 'processando') {
        const interval = setInterval(async () => {
          const s = await fetchJob()
          if (s !== 'processando') clearInterval(interval)
        }, 8000)
        return () => clearInterval(interval)
      }
    })
  }, [fetchJob])

  async function aprovar(variacaoId: string) {
    await fetch(`/api/variacoes/${variacaoId}/aprovar`, { method: 'POST' })
    fetchJob()
  }

  async function darFeedback(variacaoId: string, feedback: string) {
    await fetch(`/api/variacoes/${variacaoId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback }),
    })
    fetchJob()
  }

  async function handleRecompor(variacaoId: string) {
    if (!novaHeadline.trim()) return
    setRecompondo(true)
    await fetch(`/api/variacoes/${variacaoId}/recompor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headline: novaHeadline }),
    })
    setEditandoHeadline(null)
    setNovaHeadline('')
    setRecompondo(false)
    fetchJob()
  }

  function download(variacaoId: string, path1x1: string | null, path4x5: string | null, path9x16: string | null) {
    const paths = { '1x1': path1x1, '4x5': path4x5, '9x16': path9x16 }
    const url = pathToUrl(paths[formato])
    if (!url) { alert('Formato não disponível'); return }
    const a = document.createElement('a')
    a.href = url
    a.download = `criativo_${formato}_${variacaoId}.jpg`
    a.click()
  }

  if (loading) return <div className="max-w-6xl mx-auto px-4 py-8 text-gray-400 text-sm">Carregando...</div>
  if (!job) return <div className="max-w-6xl mx-auto px-4 py-8 text-red-500">Job não encontrado</div>

  const isProcessando = job.status === 'processando'
  const isErro = job.status === 'erro'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/jobs" className="text-xs text-gray-400 hover:text-gray-700 mb-2 inline-block">← Jobs</Link>
          <h1 className="text-2xl font-bold">{job.cliente.nome}</h1>
          <p className="text-gray-500 text-sm capitalize">{job.objetivo.replace('_', ' ')}</p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {isProcessando && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
          Pipeline em execução... Esta página atualiza automaticamente a cada 8 segundos.
        </div>
      )}

      {isErro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-red-800 mb-1">Erro no pipeline</p>
          <p className="text-xs text-red-600">{job.erroMsg}</p>
        </div>
      )}

      {job.conceitos.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-gray-500">Formato:</span>
            {(['1x1', '4x5', '9x16'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormato(f)}
                className={`px-3 py-1 rounded-lg text-sm transition-all ${
                  formato === f ? 'bg-black text-white' : 'border border-gray-200 hover:border-gray-400'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="space-y-10">
            {job.conceitos.map((conceito, ci) => (
              <div key={conceito.id}>
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Conceito {ci + 1}</span>
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{conceito.titulo}</span>
                  </div>
                  <p className="text-sm text-gray-600">{conceito.angulo}</p>
                  <div className="mt-2 p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500 mb-0.5">Headline</p>
                    <p className="font-semibold">{conceito.headline}</p>
                    <p className="text-xs text-gray-500 mt-2 mb-0.5">Legenda</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{conceito.legenda}</p>
                    {conceito.cta && (
                      <>
                        <p className="text-xs text-gray-500 mt-2 mb-0.5">CTA</p>
                        <p className="text-sm">{conceito.cta}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {conceito.variacoes.map((v, vi) => {
                    const imgUrl = pathToUrl(
                      formato === '1x1' ? v.path1x1 : formato === '4x5' ? v.path4x5 : v.path9x16
                    )
                    return (
                      <div
                        key={v.id}
                        className={`bg-white rounded-2xl border p-4 ${v.aprovada ? 'border-green-300' : 'border-gray-100'}`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs text-gray-500">Variação {vi + 1}</span>
                          {v.aprovada && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Aprovada</span>
                          )}
                        </div>

                        {imgUrl ? (
                          <div className="bg-gray-100 rounded-xl overflow-hidden mb-3">
                            <img src={imgUrl} alt={`Variação ${vi + 1}`} className="w-full object-contain max-h-80" />
                          </div>
                        ) : (
                          <div className="bg-gray-100 rounded-xl h-40 flex items-center justify-center mb-3 text-gray-400 text-xs">
                            Imagem não disponível neste formato
                          </div>
                        )}

                        {editandoHeadline === v.id ? (
                          <div className="mb-3">
                            <input
                              value={novaHeadline}
                              onChange={(e) => setNovaHeadline(e.target.value)}
                              placeholder="Nova headline (máx. 6 palavras)"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-black"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleRecompor(v.id)}
                                disabled={recompondo}
                                className="flex-1 py-1.5 bg-black text-white text-xs rounded-lg disabled:opacity-40 hover:bg-gray-800 transition-colors"
                              >
                                {recompondo ? 'Recompondo...' : 'Aplicar'}
                              </button>
                              <button
                                onClick={() => setEditandoHeadline(null)}
                                className="py-1.5 px-3 border border-gray-200 text-xs rounded-lg hover:bg-gray-50 transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                          {!v.aprovada && (
                            <button
                              onClick={() => aprovar(v.id)}
                              className="flex-1 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors"
                            >
                              Aprovar
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditandoHeadline(v.id)
                              setNovaHeadline(conceito.headline)
                            }}
                            className="py-1.5 px-3 border border-gray-200 text-xs rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Editar headline
                          </button>
                          <button
                            onClick={() => download(v.id, v.path1x1, v.path4x5, v.path9x16)}
                            className="py-1.5 px-3 border border-gray-200 text-xs rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Download
                          </button>
                        </div>

                        {v.aprovada && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => darFeedback(v.id, 'performou_bem')}
                              className={`flex-1 py-1 text-xs rounded-lg transition-colors ${v.feedback === 'performou_bem' ? 'bg-green-100 text-green-700' : 'border border-gray-200 hover:bg-gray-50'}`}
                            >
                              Performou bem
                            </button>
                            <button
                              onClick={() => darFeedback(v.id, 'descartada')}
                              className={`flex-1 py-1 text-xs rounded-lg transition-colors ${v.feedback === 'descartada' ? 'bg-red-100 text-red-700' : 'border border-gray-200 hover:bg-gray-50'}`}
                            >
                              Descartar
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    processando: 'bg-yellow-100 text-yellow-800',
    pronto: 'bg-green-100 text-green-800',
    erro: 'bg-red-100 text-red-800',
  }
  const labels: Record<string, string> = {
    processando: 'Processando',
    pronto: 'Pronto',
    erro: 'Erro',
  }
  return (
    <span className={`text-sm px-3 py-1 rounded-full font-medium ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  )
}
