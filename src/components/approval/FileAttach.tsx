'use client'

import { useState, DragEvent } from 'react'
import { Paperclip, X, Plus } from 'lucide-react'

export interface AttachedFile {
  file_name: string
  file_url: string
  size: number
}

const MAX_FILES = 10
const MAX_SIZE = 20 * 1024 * 1024
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf', 'hwp']

interface Props {
  files: AttachedFile[]
  onChange: (files: AttachedFile[]) => void
}

export default function FileAttach({ files, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setError(null)

    if (files.length + list.length > MAX_FILES) {
      setError(`첨부는 최대 ${MAX_FILES}개까지 가능합니다`)
      return
    }

    setBusy(true)
    const added: AttachedFile[] = []

    try {
      for (const file of Array.from(list)) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
        if (!ALLOWED_EXT.includes(ext)) {
          setError(`${file.name}: 허용되지 않는 형식입니다`)
          continue
        }
        if (file.size >= MAX_SIZE) {
          setError(`${file.name}: 20MB를 넘습니다`)
          continue
        }

        const fd = new FormData()
        fd.append('file', file)
        fd.append('storagePath', `approval/${Date.now()}_${file.name}`)

        const res = await fetch('/api/storage/upload', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? '업로드 실패'); continue }

        added.push({ file_name: file.name, file_url: json.url, size: file.size })
      }

      onChange([...files, ...added])
    } catch {
      setError('업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    upload(e.dataTransfer.files)
  }

  return (
    <div onDrop={onDrop} onDragOver={e => e.preventDefault()}>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <span key={i} className="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-secondary rounded">
            <Paperclip size={12} className="text-txt-tertiary" />
            {f.file_name}
            <button onClick={() => onChange(files.filter((_, idx) => idx !== i))} aria-label={`${f.file_name} 삭제`}>
              <X size={12} className="text-txt-tertiary" />
            </button>
          </span>
        ))}
        <label className="flex items-center gap-1 px-2.5 py-1 text-xs border border-border-primary rounded cursor-pointer">
          <Plus size={12} /> {busy ? '올리는 중' : '추가'}
          <input type="file" multiple className="hidden" onChange={e => upload(e.target.files)} />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-txt-tertiary">
        20MB 미만 이미지(jpg, jpeg, png, gif) 또는 문서(doc, docx, ppt, pptx, xls, xlsx, pdf, hwp), 최대 10개.
        드래그해서 놓아도 됩니다.
      </p>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}
