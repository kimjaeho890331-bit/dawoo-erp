'use client'
import { useState } from 'react'

export default function AISidebar() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'ai', text: '안녕하세요! 다우건설 AI 비서입니다.' }
  ])

  const send = () => {
    if (!input.trim()) return
    setMessages(prev => [...prev, { role: 'user', text: input }])
    setInput('')
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'ai', text: '아직 AI 연동 전입니다.' }])
    }, 500)
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-5 bottom-5 w-12 h-12 bg-accent text-white rounded-full flex items-center justify-center z-40 hover:bg-accent-hover transition-colors"
          style={{ boxShadow: '0 4px 20px rgba(94,106,210,0.35)' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed right-0 top-0 w-80 h-screen bg-surface border-l border-border-primary flex flex-col z-40"
          style={{ boxShadow: '-4px 0 20px rgba(0,0,0,0.06)' }}>
          {/* Header */}
          <div className="h-14 px-5 flex items-center justify-between border-b border-border-primary">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                <span className="text-[10px] text-white font-bold">AI</span>
              </div>
              <span className="text-[14px] font-semibold text-txt-primary tracking-[-0.1px]">AI 비서</span>
            </div>
            <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-tertiary transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-accent text-white'
                    : 'bg-surface-secondary text-txt-primary'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-border-primary">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                placeholder="메시지 입력..."
                className="input-field flex-1"
              />
              <button onClick={send} className="btn-primary px-3 py-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
