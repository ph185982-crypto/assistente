'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

interface Mensagem {
  id: string
  role: string
  content: string
  anexos: string[]
  resultados: string[]
  status: string
  criadoEm: string
}

interface Projeto {
  id: string
  nome: string
  nicho: string
  criadoEm: string
  mensagens?: Mensagem[]
}

export default function ChatApp() {
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [projetoAtivo, setProjetoAtivo] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [editandoProjeto, setEditandoProjeto] = useState(false)
  const [nomeProjeto, setNomeProjeto] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchProjetos()
  }, [])

  async function fetchProjetos() {
    const res = await fetch('/api/projetos')
    const data = await res.json()
    setProjetos(data)
  }

  const fetchMensagens = useCallback(async (pid: string) => {
    const res = await fetch(`/api/projetos/${pid}`)
    const data = await res.json()
    setMensagens(data.mensagens || [])
    setNomeProjeto(data.nome)
    return data.mensagens || []
  }, [])

  useEffect(() => {
    if (!projetoAtivo) return
    fetchMensagens(projetoAtivo).then((msgs: Mensagem[]) => {
      const hasProcessing = msgs.some((m: Mensagem) => m.status === 'processando')
      if (hasProcessing) startPolling(projetoAtivo)
    })
    return () => stopPolling()
  }, [projetoAtivo, fetchMensagens])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  function startPolling(pid: string) {
    stopPolling()
    pollingRef.current = setInterval(async () => {
      const msgs = await fetchMensagens(pid)
      const stillProcessing = msgs.some((m: Mensagem) => m.status === 'processando')
      if (!stillProcessing) stopPolling()
    }, 3000)
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  async function criarProjeto() {
    const res = await fetch('/api/projetos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Novo projeto' }),
    })
    const projeto = await res.json()
    await fetchProjetos()
    setProjetoAtivo(projeto.id)
    setMensagens([])
    setEditandoProjeto(true)
    setNomeProjeto('Novo projeto')
  }

  async function renomearProjeto(nome: string) {
    if (!projetoAtivo || !nome.trim()) return
    await fetch(`/api/projetos/${projetoAtivo}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome }),
    })
    setEditandoProjeto(false)
    fetchProjetos()
  }

  async function deletarProjeto(pid: string) {
    await fetch(`/api/projetos/${pid}`, { method: 'DELETE' })
    if (projetoAtivo === pid) {
      setProjetoAtivo(null)
      setMensagens([])
    }
    fetchProjetos()
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return
    const newFiles = Array.from(fileList)
    setFiles((prev) => [...prev, ...newFiles])
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f))
    setPreviews((prev) => [...prev, ...newPreviews])
  }

  function removeFile(idx: number) {
    URL.revokeObjectURL(previews[idx])
    setFiles((prev) => prev.filter((_, i) => i !== idx))
    setPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  async function enviarMensagem() {
    if (!projetoAtivo || (!input.trim() && files.length === 0)) return
    setEnviando(true)

    const formData = new FormData()
    formData.append('projetoId', projetoAtivo)
    formData.append('content', input.trim() || 'Criar anúncios com essas imagens')
    files.forEach((f) => formData.append('files', f))

    const currentInput = input
    setInput('')
    setFiles([])
    previews.forEach((p) => URL.revokeObjectURL(p))
    setPreviews([])

    try {
      const res = await fetch('/api/chat', { method: 'POST', body: formData })
      const data = await res.json()
      await fetchMensagens(projetoAtivo)
      fetchProjetos()

      if (data.conceitos && data.conceitos.length > 0 && data.anexos?.length > 0) {
        for (let i = 0; i < data.conceitos.length; i++) {
          try {
            await fetch('/api/chat/gerar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projetoId: projetoAtivo,
                mensagemId: data.assistantMsg.id,
                fotoUrl: data.anexos[0],
                conceito: data.conceitos[i],
                conceitoIndex: i,
                totalConceitos: data.conceitos.length,
              }),
            })
            await fetchMensagens(projetoAtivo)
          } catch (err) {
            console.error(`Erro no conceito ${i}:`, err)
          }
        }
        await fetchMensagens(projetoAtivo)
      }
    } catch (err) {
      console.error('Erro ao enviar:', err)
    } finally {
      setEnviando(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviarMensagem()
    }
  }

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const projetoSelecionado = projetos.find((p) => p.id === projetoAtivo)

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } bg-[#1a1a1a] text-white flex flex-col transition-all duration-200 overflow-hidden flex-shrink-0`}
      >
        <div className="p-3 flex items-center justify-between border-b border-white/10">
          <span className="text-sm font-semibold tracking-wide text-white/80">Nexos Criativos</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-white/40 hover:text-white/80 p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <button
          onClick={criarProjeto}
          className="mx-3 mt-3 mb-2 py-2.5 px-3 bg-white/10 hover:bg-white/15 rounded-lg text-sm text-left flex items-center gap-2 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Novo projeto
        </button>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {projetos.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center rounded-lg px-3 py-2 mb-0.5 cursor-pointer transition-colors ${
                projetoAtivo === p.id
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90'
              }`}
              onClick={() => setProjetoAtivo(p.id)}
            >
              <span className="flex-1 text-sm truncate">{p.nome}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deletarProjeto(p.id)
                }}
                className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 p-0.5 transition-opacity"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-12 border-b border-gray-100 flex items-center px-4 gap-3 flex-shrink-0 bg-white">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-400 hover:text-gray-700 p-1"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          )}
          {projetoAtivo && (
            editandoProjeto ? (
              <input
                value={nomeProjeto}
                onChange={(e) => setNomeProjeto(e.target.value)}
                onBlur={() => renomearProjeto(nomeProjeto)}
                onKeyDown={(e) => e.key === 'Enter' && renomearProjeto(nomeProjeto)}
                className="text-sm font-medium bg-transparent border-b border-gray-300 outline-none px-1 py-0.5"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setEditandoProjeto(true)}
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                {projetoSelecionado?.nome || 'Projeto'}
              </button>
            )
          )}
        </div>

        {/* Chat area */}
        {!projetoAtivo ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-100 rounded-2xl flex items-center justify-center mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b8895c" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-800 mb-2">Nexos Criativos</h1>
            <p className="text-gray-400 text-sm max-w-md mb-8">
              Crie anúncios profissionais com IA. Selecione um projeto ou crie um novo para começar.
            </p>
            <button
              onClick={criarProjeto}
              className="px-6 py-3 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-[#333] transition-colors"
            >
              Criar novo projeto
            </button>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
              {mensagens.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm mb-1">Envie fotos e descreva o que precisa</p>
                  <p className="text-gray-400 text-xs max-w-sm">
                    Ex: &quot;Crie 3 anúncios de venda com essas fotos do produto, foco no preço de R$79&quot;
                  </p>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto px-4 py-6">
                  {mensagens.map((msg) => (
                    <div
                      key={msg.id}
                      className={`mb-6 ${msg.role === 'user' ? '' : ''}`}
                    >
                      {/* Avatar + content */}
                      <div className="flex gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            msg.role === 'user'
                              ? 'bg-gray-200 text-gray-600'
                              : 'bg-gradient-to-br from-amber-100 to-orange-100 text-amber-700'
                          }`}
                        >
                          {msg.role === 'user' ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                            </svg>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-500 mb-1">
                            {msg.role === 'user' ? 'Você' : 'Nexos IA'}
                          </div>

                          {/* Attachments */}
                          {msg.anexos && msg.anexos.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {msg.anexos.map((url, i) => (
                                <img
                                  key={i}
                                  src={url}
                                  alt={`Anexo ${i + 1}`}
                                  className="h-24 w-24 object-cover rounded-lg border border-gray-100"
                                />
                              ))}
                            </div>
                          )}

                          {/* Message content */}
                          <div className={`text-sm leading-relaxed ${
                            msg.status === 'processando' ? 'text-gray-400' : 'text-gray-800'
                          }`}>
                            {msg.status === 'processando' && (
                              <span className="inline-flex items-center gap-2">
                                <span className="flex gap-0.5">
                                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </span>
                                {msg.content}
                              </span>
                            )}
                            {msg.status !== 'processando' && (
                              <div className="markdown-content whitespace-pre-line">{msg.content}</div>
                            )}
                          </div>

                          {/* Results gallery */}
                          {msg.resultados && msg.resultados.length > 0 && (
                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {msg.resultados.map((url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group relative rounded-lg overflow-hidden border border-gray-100 hover:border-gray-300 transition-colors"
                                >
                                  <img
                                    src={url}
                                    alt={`Criativo ${i + 1}`}
                                    className="w-full aspect-square object-cover"
                                  />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <svg
                                      width="20"
                                      height="20"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="white"
                                      strokeWidth="2"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                                    </svg>
                                  </div>
                                </a>
                              ))}
                            </div>
                          )}

                          {msg.status === 'erro' && msg.role === 'assistant' && (
                            <div className="mt-2 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg inline-block">
                              Erro no processamento
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-gray-100 bg-white px-4 py-3">
              <div className="max-w-3xl mx-auto">
                {/* File previews */}
                {previews.length > 0 && (
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {previews.map((p, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={p}
                          alt=""
                          className="h-16 w-16 object-cover rounded-lg border border-gray-200"
                        />
                        <button
                          onClick={() => removeFile(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 px-3 py-2 focus-within:border-gray-400 transition-colors">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                    title="Anexar imagens"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleFiles(e.target.files)}
                    className="hidden"
                  />

                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value)
                      autoResize()
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Descreva o que precisa... (anexe fotos com o clipe)"
                    rows={1}
                    className="flex-1 bg-transparent text-sm resize-none outline-none max-h-[200px] py-1.5 placeholder:text-gray-400"
                  />

                  <button
                    onClick={enviarMensagem}
                    disabled={enviando || (!input.trim() && files.length === 0)}
                    className="p-2 rounded-xl bg-[#1a1a1a] text-white disabled:opacity-30 hover:bg-[#333] transition-colors flex-shrink-0"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>

                <p className="text-[10px] text-gray-400 text-center mt-2">
                  Anexe fotos do produto/modelo e descreva o objetivo do anúncio
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
