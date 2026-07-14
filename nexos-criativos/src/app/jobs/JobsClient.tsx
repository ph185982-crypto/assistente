'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Job {
  id: string
  objetivo: string
  status: string
  criadoEm: string
  cliente: { nome: string }
}

const STATUS_LABEL: Record<string, string> = {
  processando: 'Processando',
  pronto: 'Pronto',
  erro: 'Erro',
}

const STATUS_COLOR: Record<string, string> = {
  processando: 'bg-yellow-100 text-yellow-800',
  pronto: 'bg-green-100 text-green-800',
  erro: 'bg-red-100 text-red-800',
}

export default function JobsClient() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 10000)
    return () => clearInterval(interval)
  }, [])

  async function fetchJobs() {
    const res = await fetch('/api/jobs')
    setJobs(await res.json())
    setLoading(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Jobs</h1>
        <Link
          href="/gerar"
          className="px-4 py-2 bg-black text-white text-sm rounded-xl hover:bg-gray-800 transition-colors"
        >
          + Novo job
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">Nenhum job ainda</p>
          <Link href="/gerar" className="text-sm text-black underline">Gerar primeiro criativo</Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/jobs/${j.id}`}
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-300 transition-colors"
            >
              <div>
                <p className="font-medium">{j.cliente.nome}</p>
                <p className="text-sm text-gray-500 capitalize">{j.objetivo.replace('_', ' ')}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(j.criadoEm).toLocaleString('pt-BR')}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLOR[j.status] || 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABEL[j.status] || j.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
