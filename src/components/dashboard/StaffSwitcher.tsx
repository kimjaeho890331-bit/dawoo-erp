'use client'

import { User } from 'lucide-react'

interface StaffOption {
  id: string
  name: string
}

interface Props {
  value: string | null
  options: StaffOption[]
  onChange: (id: string | null) => void
}

export default function StaffSwitcher({ value, options, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[12px]">
      <User size={13} className="text-txt-tertiary" />
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="text-[12px] font-medium text-txt-primary bg-surface border border-border-primary rounded-md px-2 py-1 focus:ring-1 focus:ring-accent focus:outline-none"
      >
        <option value="">전체 (팀 브리핑)</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </div>
  )
}
