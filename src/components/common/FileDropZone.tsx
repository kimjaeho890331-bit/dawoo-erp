'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { FileText, Upload, AlertCircle, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ImageViewer from '@/components/common/ImageViewer'

interface Attachment {
  id: string
  name: string
  file_path: string
  file_type: string
  created_at: string
}

interface Props {
  projectId: string
  fileType: string          // 실측사진, 동의서, 통장사본, 시공전, 시공중, 시공후, 완료보고서 등
  accept?: string           // image/*, application/pdf 등
  multiple?: boolean
  label?: string
  compact?: boolean         // true면 작은 사이즈
}

// Storage 경로용 한글 → ASCII 매핑 (Supabase는 경로에 non-ASCII 거부)
const FILE_TYPE_SLUGS: Record<string, string> = {
  '실측사진': 'survey_photo',
  '동의서': 'consent',
  '통장사본': 'bankbook',
  '신청서': 'application',
  '시공전': 'before',
  '시공중': 'during',
  '시공후': 'after',
  '완료보고서': 'completion',
  '공문': 'notice',
  '기타': 'etc',
}
const slugifyFileType = (type: string): string => {
  return FILE_TYPE_SLUGS[type] || type.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_') || 'etc'
}

export default function FileDropZone({ projectId, fileType, accept = 'image/*', multiple = false, label, compact = false }: Props) {
  const [files, setFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)

  const loadFiles = useCallback(async () => {
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .eq('project_id', projectId)
      .eq('file_type', fileType)
      .order('created_at', { ascending: true })
    setFiles(data || [])
  }, [projectId, fileType])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  // Realtime: 다른 사용자 업로드도 즉시 반영
  useEffect(() => {
    const ch = supabase
      .channel(`attachments-${projectId}-${fileType}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'attachments',
        filter: `project_id=eq.${projectId}`,
      }, () => loadFiles())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [projectId, fileType, loadFiles])

  const uploadFile = async (file: File) => {
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const typeSlug = slugifyFileType(fileType)
    const storagePath = `attachments/${projectId}/${typeSlug}/${timestamp}_${safeName}`

    const formData = new FormData()
    formData.append('file', file)
    formData.append('storagePath', storagePath)
    formData.append('projectId', projectId)
    formData.append('fileType', fileType)

    const res = await fetch('/api/storage/upload', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const reason = errBody?.error || `HTTP ${res.status}`
      throw new Error(reason)
    }
    const data = await res.json()

    const insertData: Record<string, unknown> = {
      project_id: projectId,
      name: file.name,
      file_path: data.path,
      file_type: fileType,
    }
    if (data.drive?.webViewLink) {
      insertData.drive_url = data.drive.webViewLink
    }
    const { error } = await supabase.from('attachments').insert(insertData)
    if (error) throw new Error('DB 저장 실패: ' + error.message)
  }

  const handleFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList)
    if (arr.length === 0) return
    if (!multiple && arr.length > 1) arr.splice(1)

    setError(null)
    setUploading(true)
    setUploadProgress({ current: 0, total: arr.length })

    const failures: string[] = []
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i]
      setUploadProgress({ current: i + 1, total: arr.length })
      try {
        await uploadFile(file)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[FileDropZone] ${file.name} 업로드 실패:`, err)
        failures.push(`${file.name}: ${msg}`)
      }
    }

    await loadFiles()
    setUploading(false)
    setUploadProgress(null)
    if (failures.length > 0) {
      setError(failures.join('\n'))
    }
  }

  const handleDelete = async (attachment: Attachment) => {
    if (!confirm(`"${attachment.name}" 파일을 삭제할까요?`)) return
    try {
      await fetch('/api/storage/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: attachment.file_path }),
      })
      await supabase.from('attachments').delete().eq('id', attachment.id)
      await loadFiles()
    } catch (err) {
      console.error('삭제 실패:', err)
      setError('삭제 실패')
    }
  }

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path)
    return data.publicUrl
  }

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(name)
  const isPdf = (name: string) => /\.pdf$/i.test(name)
  const imageFiles = files.filter(f => isImage(f.name))

  // 드래그 counter 패턴: 자식 요소 위로 올라가도 dragLeave 오작동 방지
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) setDragOver(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setDragOver(false)
    if (e.dataTransfer.files?.length) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const hasFiles = files.length > 0
  const nonImageFiles = files.filter(f => !isImage(f.name))

  return (
    <div>
      {/* 드래그앤드롭 + 파일 통합 영역 */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg transition-colors ${
          dragOver
            ? 'border-[#c96442] bg-[#c96442]/10'
            : hasFiles
              ? 'border-border-primary bg-surface-secondary/30'
              : 'border-border-secondary hover:border-[#c96442] hover:bg-[#c96442]/5'
        }`}
      >
        {hasFiles ? (
          /* 파일이 있을 때: 썸네일/아이콘 inline + "+ 추가" 버튼 */
          <div className={`flex flex-wrap items-center gap-2 ${compact ? 'p-2' : 'p-2.5'}`}>
            {/* 이미지 썸네일 (48px 고정) */}
            {imageFiles.map((file, idx) => (
              <div
                key={file.id}
                className="relative group w-[56px] h-[56px] rounded-md overflow-hidden border border-border-primary bg-surface flex-shrink-0"
              >
                <img
                  src={getPublicUrl(file.file_path)}
                  alt={file.name}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setViewerIdx(idx)}
                  loading="lazy"
                />
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(file) }}
                  className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 hover:bg-black/90 transition-all"
                  title="삭제"
                >
                  <X size={10} strokeWidth={3} />
                </button>
              </div>
            ))}

            {/* PDF/HWP 등 문서 아이콘 */}
            {nonImageFiles.map(file => (
              <a
                key={file.id}
                href={getPublicUrl(file.file_path)}
                target="_blank"
                rel="noreferrer"
                className="relative group w-[56px] h-[56px] rounded-md border border-border-primary bg-surface flex flex-col items-center justify-center gap-0.5 flex-shrink-0 hover:border-[#c96442] transition-colors"
                title={file.name}
              >
                <FileText size={16} className={isPdf(file.name) ? 'text-[#dc2626]' : 'text-txt-tertiary'} />
                <span className="text-[8px] text-txt-tertiary px-1 truncate max-w-full">
                  {isPdf(file.name) ? 'PDF' : file.name.split('.').pop()?.toUpperCase()}
                </span>
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); handleDelete(file) }}
                  className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 hover:bg-black/90 transition-all"
                  title="삭제"
                >
                  <X size={10} strokeWidth={3} />
                </button>
              </a>
            ))}

            {/* + 추가 버튼 */}
            {(multiple || files.length === 0) && (
              <button
                onClick={() => !uploading && inputRef.current?.click()}
                disabled={uploading}
                className="w-[56px] h-[56px] rounded-md border-2 border-dashed border-border-secondary hover:border-[#c96442] hover:bg-[#c96442]/5 flex flex-col items-center justify-center gap-0.5 flex-shrink-0 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Upload size={14} className="text-[#c96442] animate-pulse" />
                ) : (
                  <>
                    <Upload size={14} className="text-txt-tertiary" />
                    <span className="text-[9px] text-txt-tertiary">추가</span>
                  </>
                )}
              </button>
            )}

            {uploading && uploadProgress && (
              <span className="text-[11px] text-[#c96442] font-medium ml-1">
                {uploadProgress.current}/{uploadProgress.total}
              </span>
            )}
          </div>
        ) : (
          /* 파일 없을 때: 기존 큰 드롭존 */
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-1 ${compact ? 'p-3' : 'p-5'} ${uploading ? 'cursor-wait' : 'cursor-pointer'}`}
          >
            {uploading ? (
              <>
                <Upload size={compact ? 14 : 18} className="text-[#c96442] animate-pulse" />
                <p className="text-[12px] text-[#c96442] font-medium">
                  {uploadProgress ? `업로드 중 ${uploadProgress.current}/${uploadProgress.total}` : '업로드 중...'}
                </p>
              </>
            ) : (
              <>
                <Upload size={compact ? 14 : 18} className={dragOver ? 'text-[#c96442]' : 'text-txt-tertiary'} />
                <p className={`text-center ${dragOver ? 'text-[#c96442] font-medium' : 'text-txt-tertiary'} ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
                  {label || `${fileType} 파일을 드래그하거나 클릭`}
                </p>
                {multiple && (
                  <p className="text-[10px] text-txt-quaternary">여러 파일 업로드 가능</p>
                )}
              </>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="mt-2 p-2 bg-[#fef2f2] border border-[#fecaca] rounded-lg flex items-start gap-2">
          <AlertCircle size={14} className="text-[#b91c1c] flex-shrink-0 mt-0.5" />
          <pre className="flex-1 text-[11px] text-[#b91c1c] whitespace-pre-wrap font-sans">{error}</pre>
          <button onClick={() => setError(null)} className="text-[#b91c1c]/70 hover:text-[#b91c1c]">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 이미지 뷰어 */}
      {viewerIdx !== null && imageFiles.length > 0 && (
        <ImageViewer
          images={imageFiles.map(f => ({ url: getPublicUrl(f.file_path), name: f.name }))}
          initialIndex={viewerIdx}
          onClose={() => setViewerIdx(null)}
        />
      )}
    </div>
  )
}
