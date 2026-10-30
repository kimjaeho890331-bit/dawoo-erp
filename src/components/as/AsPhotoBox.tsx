'use client'

import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import ImageViewer from '@/components/common/ImageViewer'
import { toast } from '@/lib/toast'

/**
 * A/S 전·후 사진 한 칸.
 *
 * 사진 주소는 as_records 의 photos_before / photos_after 에 그대로 담는다. 접수대장
 * 첨부(attachments 테이블)처럼 줄을 따로 두지 않은 이유는, A/S 사진은 기록 하나에
 * 딸린 것이라 기록을 지우면 같이 사라지는 편이 맞기 때문이다.
 *
 * 올리기는 반드시 /api/storage/upload(service_role) 를 거친다 — 화면이 쓰는 anon 키에는
 * Storage 쓰기 권한이 없어 직접 올리면 실패한다.
 */

const PUBLIC_MARK = '/storage/v1/object/public/documents/'

/** 공개 URL에서 버킷 안 경로를 되뽑는다. 못 뽑으면 저장소 파일은 두고 목록에서만 뺀다. */
export function storagePathFromUrl(url: string): string | null {
  const at = url.indexOf(PUBLIC_MARK)
  if (at < 0) return null
  const path = decodeURIComponent(url.slice(at + PUBLIC_MARK.length).split('?')[0])
  return path || null
}

export default function AsPhotoBox({
  recordId,
  slot,
  label,
  urls,
  onChange,
}: {
  recordId: string
  slot: 'before' | 'after'
  label: string
  urls: string[]
  onChange: (next: string[]) => void
}) {
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const uploadOne = async (file: File): Promise<string> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('storagePath', `attachments/as/${recordId}/${slot}/${Date.now()}_${safeName}`)
    const res = await fetch('/api/storage/upload', { method: 'POST', body: fd })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
    return json.url as string
  }

  const handleFiles = async (list: FileList | File[]) => {
    const files = Array.from(list)
    if (files.length === 0) return
    setUploading({ done: 0, total: files.length })
    const added: string[] = []
    const failed: string[] = []
    for (let i = 0; i < files.length; i++) {
      try {
        added.push(await uploadOne(files[i]))
      } catch (err) {
        failed.push(`${files[i].name}: ${err instanceof Error ? err.message : String(err)}`)
      }
      setUploading({ done: i + 1, total: files.length })
    }
    setUploading(null)
    if (added.length > 0) onChange([...urls, ...added])
    if (failed.length > 0) toast.error(`사진을 올리지 못했습니다 — ${failed.join(' / ')}`)
  }

  const handleRemove = async (url: string) => {
    if (!confirm('이 사진을 지울까요?')) return
    const path = storagePathFromUrl(url)
    if (path) {
      await fetch('/api/storage/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath: path }),
      }).catch(() => undefined)
    }
    onChange(urls.filter(u => u !== url))
  }

  return (
    <div>
      <label className="block text-sm font-medium text-txt-secondary mb-1.5">
        {label}
        {urls.length > 0 && <span className="ml-1.5 text-[11px] text-txt-tertiary">{urls.length}장</span>}
      </label>

      <div
        onDragEnter={e => { e.preventDefault(); dragDepth.current += 1; setDragOver(true) }}
        onDragLeave={e => { e.preventDefault(); dragDepth.current -= 1; if (dragDepth.current === 0) setDragOver(false) }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault()
          dragDepth.current = 0
          setDragOver(false)
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
        }}
        className={`rounded-lg border-2 border-dashed transition-colors ${
          dragOver
            ? 'border-accent bg-accent/10'
            : urls.length > 0
              ? 'border-border-primary bg-surface-secondary/30'
              : 'border-border-secondary hover:border-accent hover:bg-accent/5'
        }`}
      >
        {urls.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 p-2.5">
            {urls.map((url, idx) => (
              <div
                key={url}
                className="group relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-md border border-border-primary bg-surface"
              >
                <img
                  src={url}
                  alt={`${label} ${idx + 1}`}
                  loading="lazy"
                  onClick={() => setViewerIdx(idx)}
                  className="h-full w-full cursor-pointer object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemove(url)}
                  title="삭제"
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white transition-all hover:bg-black/90 pointer-coarse:h-7 pointer-coarse:w-7 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                >
                  <X size={11} strokeWidth={3} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => !uploading && inputRef.current?.click()}
              disabled={!!uploading}
              className="flex h-[64px] w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed border-border-secondary transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-50"
            >
              <Upload size={14} className={uploading ? 'animate-pulse text-accent-text' : 'text-txt-tertiary'} />
              <span className="text-[9px] text-txt-tertiary">추가</span>
            </button>
            {uploading && (
              <span className="ml-1 text-[11px] font-medium text-accent-text">
                {uploading.done}/{uploading.total}
              </span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => !uploading && inputRef.current?.click()}
            disabled={!!uploading}
            className="flex w-full flex-col items-center justify-center gap-1 p-5"
          >
            <Upload size={18} className={uploading ? 'animate-pulse text-accent-text' : 'text-txt-tertiary'} />
            <span className="text-[12px] text-txt-tertiary">
              {uploading ? `올리는 중 ${uploading.done}/${uploading.total}` : '사진을 끌어 놓거나 클릭'}
            </span>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {viewerIdx !== null && urls.length > 0 && (
        <ImageViewer
          images={urls.map((url, i) => ({ url, name: `${label} ${i + 1}` }))}
          initialIndex={viewerIdx}
          onClose={() => setViewerIdx(null)}
        />
      )}
    </div>
  )
}
