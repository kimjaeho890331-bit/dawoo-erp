'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, Send, X, Trash2, Loader2, ImagePlus } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  images?: string[] // base64 이미지 데이터
}

export default function AISidebar() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  // 이미지 파일 처리 공통
  const addImageFiles = (files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return
      if (file.size > 5 * 1024 * 1024) { setError('이미지 크기는 5MB 이하만 가능합니다'); return }
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setPendingImages(prev => [...prev, base64])
      }
      reader.readAsDataURL(file)
    })
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addImageFiles(e.target.files)
    e.target.value = ''
  }

  // 드래그앤드롭
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    if (e.dataTransfer.files.length > 0) addImageFiles(e.dataTransfer.files)
  }

  const send = async () => {
    const trimmed = input.trim()
    if ((!trimmed && pendingImages.length === 0) || isStreaming) return

    setError(null)
    const userMessage: Message = { role: 'user', content: trimmed || '(사진 첨부)', images: pendingImages.length > 0 ? [...pendingImages] : undefined }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setPendingImages([])
    setIsStreaming(true)

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.slice(-20),
        }),
      })

      if (!response.ok) {
        throw new Error('API request failed')
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + parsed.text,
                    }
                  }
                  return updated
                })
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }
      }
    } catch {
      // Remove the empty assistant message on error
      setMessages(prev => {
        const updated = [...prev]
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && updated[updated.length - 1].content === '') {
          updated.pop()
        }
        return updated
      })
      setError('AI 연결에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsStreaming(false)
    }
  }

  const clearHistory = () => {
    setMessages([])
    setError(null)
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-5 bottom-5 w-12 h-12 bg-accent text-white rounded-full flex items-center justify-center z-40 hover:bg-accent-hover transition-colors cursor-pointer"
          style={{ boxShadow: '0 4px 20px rgba(94,106,210,0.35)' }}
        >
          <MessageCircle className="w-5 h-5" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className={`fixed right-0 top-0 w-full md:w-[400px] h-screen bg-surface border-l border-border-primary flex flex-col z-40 ${isDragging ? 'ring-2 ring-accent ring-inset' : ''}`}
          style={{ boxShadow: '-4px 0 20px rgba(0,0,0,0.06)' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 드래그 오버레이 */}
          {isDragging && (
            <div className="absolute inset-0 bg-accent/10 z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-surface rounded-xl px-6 py-4 shadow-lg border-2 border-dashed border-accent text-center">
                <ImagePlus className="w-8 h-8 text-accent mx-auto mb-2" />
                <p className="text-[13px] font-medium text-accent">사진을 놓으세요</p>
              </div>
            </div>
          )}
          {/* Header */}
          <div className="h-14 px-5 flex items-center justify-between border-b border-border-primary">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                <span className="text-[10px] text-white font-bold">AI</span>
              </div>
              <span className="text-[14px] font-semibold text-txt-primary tracking-[-0.1px]">
                AI 비서
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                className="w-7 h-7 flex items-center justify-center rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-tertiary transition-colors cursor-pointer"
                title="대화 초기화"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-tertiary transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mb-3">
                  <MessageCircle className="w-5 h-5 text-accent" />
                </div>
                <p className="text-[13px] text-txt-secondary leading-relaxed">
                  안녕하세요! 다우건설 AI 비서입니다.
                  <br />
                  접수 현황, 일정, 업무 관련 질문을 해주세요.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#5e6ad2] text-white'
                      : 'bg-surface-secondary text-txt-primary'
                  }`}
                >
                  {msg.images && msg.images.length > 0 && (
                    <div className="flex gap-1 mb-1.5 flex-wrap">
                      {msg.images.map((img, j) => (
                        <img key={j} src={`data:image/jpeg;base64,${img}`} alt="" className="w-16 h-16 rounded-md object-cover" />
                      ))}
                    </div>
                  )}
                  {msg.content}
                  {/* Typing cursor for streaming */}
                  {isStreaming &&
                    i === messages.length - 1 &&
                    msg.role === 'assistant' && (
                      <span className="inline-block w-1.5 h-4 bg-txt-tertiary ml-0.5 animate-pulse align-text-bottom" />
                    )}
                </div>
              </div>
            ))}

            {/* Error message */}
            {error && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed bg-[#fee2e2] text-[#dc2626]">
                  {error}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-border-primary">
            {/* 첨부 이미지 미리보기 */}
            {pendingImages.length > 0 && (
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {pendingImages.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={`data:image/jpeg;base64,${img}`} alt="" className="w-14 h-14 rounded-lg object-cover border border-border-primary" />
                    <button
                      onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
                className="w-9 h-9 flex items-center justify-center rounded-lg border border-border-primary text-txt-tertiary hover:text-accent hover:border-accent transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                title="사진 첨부"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
                }}
                placeholder="메시지 입력..."
                className="input-field flex-1"
                disabled={isStreaming}
              />
              <button
                onClick={send}
                disabled={isStreaming || (!input.trim() && pendingImages.length === 0)}
                className="btn-primary px-3 py-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
