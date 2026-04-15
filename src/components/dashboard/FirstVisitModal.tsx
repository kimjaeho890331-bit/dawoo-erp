'use client'

import { useState } from 'react'
import { User } from 'lucide-react'

interface StaffOption {
  id: string
  name: string
}

interface Props {
  options: StaffOption[]
  onSelect: (id: string) => void
}

export default function FirstVisitModal({ options, onSelect }: Props) {
  const [selected, setSelected] = useState<string>('')

  const confirm = () => {
    if (!selected) return
    onSelect(selected)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-[12px] shadow-2xl border border-border-primary w-full max-w-[400px] p-6">
        <div className="flex items-center gap-2 mb-1">
          <User size={18} className="text-[#2563eb]" />
          <h2 className="text-[16px] font-semibold text-txt-primary">누구세요?</h2>
        </div>
        <p className="text-[12px] text-txt-secondary mb-4 leading-relaxed">
          이 컴퓨터를 쓰는 본인 이름을 한 번만 선택해주세요. 이후로는 다시 묻지 않습니다.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {options.map(o => (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              className={`px-3 py-2.5 rounded-lg border text-[13px] font-medium transition-all ${
                selected === o.id
                  ? 'border-[#2563eb] bg-[#eff6ff] text-[#1e40af]'
                  : 'border-border-primary text-txt-primary hover:bg-surface-tertiary'
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>

        <button
          onClick={confirm}
          disabled={!selected}
          className="w-full py-2.5 rounded-lg bg-accent text-white text-[13px] font-medium disabled:bg-txt-quaternary disabled:cursor-not-allowed hover:bg-accent-hover"
        >
          {selected ? `${options.find(o => o.id === selected)?.name}으로 시작` : '이름을 선택하세요'}
        </button>
      </div>
    </div>
  )
}
