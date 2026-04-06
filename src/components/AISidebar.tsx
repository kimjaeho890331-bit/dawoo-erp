'use client'
import { useState } from 'react'

export default function AISidebar() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    { role: 'ai', text: '안녕하세요! 다우건설 AI 비서입니다.' }
  ])

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 flex items-center justify-center text-xl z-40"
        >
          AI
        </button>
      )}

      {open && (
        <div className="fixed right-0 top-0 w-80 h-screen bg-white border-l border-gray-200 shadow-xl flex flex-col z-40">
          <div className="p-4 border-b flex items-center justify-between bg-gray-50">
            <span className="font-bold text-sm">AI 비서</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">X</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && input.trim()) {
                    setMessages([...messages, { role: 'user', text: input }])
                    setInput('')
                    setTimeout(() => {
                      setMessages(prev => [...prev, { role: 'ai', text: '아직 AI 연동 전입니다.' }])
                    }, 500)
                  }
                }}
                placeholder="메시지 입력..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => {
                  if (input.trim()) {
                    setMessages([...messages, { role: 'user', text: input }])
                    setInput('')
                    setTimeout(() => {
                      setMessages(prev => [...prev, { role: 'ai', text: '아직 AI 연동 전입니다.' }])
                    }, 500)
                  }
                }}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
              >
                전송
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}