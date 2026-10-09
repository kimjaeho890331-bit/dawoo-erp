'use client'

import { useState, DragEvent } from 'react'
import { Paperclip, X, Upload } from 'lucide-react'
import { uploadToStorage } from '@/lib/storage/uploadClient'

export interface AttachedFile {
  file_name: string
  file_url: string
  size: number
  /** 'manual' = 직접 올림, 'vendor' = 거래처DB에서 자동 첨부 */
  source: 'manual' | 'vendor'
}

// 자동 첨부(거래처 서류)도 이 상한을 지켜야 한다. 값을 두 곳에 따로 두면
// 하나만 고치고 다른 쪽을 잊어 상한이 무의미해지는 버그가 재발한다.
export const MAX_FILES = 10
const MAX_SIZE = 20 * 1024 * 1024
const IMAGE = /\.(jpe?g|png|gif)$/i
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf', 'hwp']

interface Props {
  files: AttachedFile[]
  onChange: (files: AttachedFile[]) => void
}

export default function FileAttach({ files, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (list: File[]) => {
    if (!list.length) return
    setError(null)

    if (files.length + list.length > MAX_FILES) {
      setError(`첨부는 최대 ${MAX_FILES}개까지입니다`)
      return
    }

    setBusy(true)
    const added: AttachedFile[] = []

    try {
      for (const file of list) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
        if (!ALLOWED_EXT.includes(ext)) {
          setError(`${file.name}: 허용되지 않는 형식입니다`)
          continue
        }
        if (file.size >= MAX_SIZE) {
          setError(`${file.name}: 20MB를 넘습니다`)
          continue
        }

        // 한 파일이 실패해도 나머지는 계속 올리고, 왜 실패했는지 그대로 보여 준다
        try {
          const { url } = await uploadToStorage(file, `approval/${Date.now()}_${file.name}`)
          added.push({ file_name: file.name, file_url: url, size: file.size, source: 'manual' })
        } catch (err) {
          const reason = err instanceof TypeError
            ? '파일을 읽거나 보내지 못했습니다. 파일을 다시 선택해 주세요'
            : err instanceof Error ? err.message : '업로드 실패'
          setError(`${file.name}: ${reason}`)
        }
      }

      onChange([...files, ...added])
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setOver(false)
    upload(Array.from(e.dataTransfer.files))
  }

  return (
    <div>
      {/*
        끌어놓는 자리가 눈에 보여야 한다. 예전에는 끌어놓기가 되긴 했지만 표시가 없어
        "추가" 버튼만 있는 줄 알았다. 칸 전체가 눌러서 고르는 버튼이기도 하다.
      */}
      <label
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        className={`flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed px-4 py-4 text-center transition-colors ${
          over ? 'border-accent bg-accent-light' : 'border-border-primary hover:border-accent'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <span className="flex items-center gap-1.5 text-[13px] text-txt-primary">
          <Upload size={15} className="text-txt-tertiary" />
          {busy ? '올리는 중…' : '견적서·세금계산서를 끌어다 놓거나 눌러서 고르세요'}
        </span>
        <span className="text-[12px] text-txt-tertiary">
          사진(jpg·png·gif) 또는 문서(pdf·hwp·엑셀·워드·파워포인트) · 20MB 미만 · 최대 {MAX_FILES}개
        </span>
        <input type="file" multiple className="hidden" onChange={e => {
          // 고른 파일을 먼저 배열로 옮긴 뒤 칸을 비운다. 칸을 비워야 같은 파일을 다시 고를 수 있고,
          // 먼저 옮겨 두지 않으면 브라우저에 따라 고른 목록까지 같이 비워진다.
          const picked = Array.from(e.target.files ?? [])
          e.target.value = ''
          upload(picked)
        }} />
      </label>

      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg bg-surface-secondary px-3 py-2 text-[13px]">
              {/* 사진은 작게라도 보여준다 — 어떤 영수증을 올렸는지 이름만으로는 알기 어렵다. */}
              {IMAGE.test(f.file_name) ? (
                <a href={f.file_url} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.file_url} alt="" className="h-10 w-10 rounded object-cover" />
                </a>
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface">
                  <Paperclip size={15} className="text-txt-tertiary" />
                </span>
              )}
              <a href={f.file_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-txt-primary hover:underline">
                {f.file_name}
              </a>
              {f.source === 'vendor' && (
                <span className="shrink-0 rounded bg-surface-tertiary px-1.5 text-[11px] text-txt-tertiary">거래처 서류</span>
              )}
              <button
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                aria-label={`${f.file_name} 빼기`}
                className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded hover:bg-surface-tertiary"
              >
                <X size={15} className="text-txt-tertiary" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  )
}
