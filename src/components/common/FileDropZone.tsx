'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Trash2, FileText, Image as ImageIcon } from 'lucide-react'
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

export default function FileDropZone({ projectId, fileType, accept = 'image/*', multiple = false, label, compact = false }: Props) {
  const [files, setFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const uploadFile = async (file: File) => {
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `attachments/${projectId}/${fileType}/${timestamp}_${safeName}`

    const formData = new FormData()
    formData.append('file', file)
    formData.append('storagePath', storagePath)

    const res = await fetch('/api/storage/upload', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) throw new Error('업로드 실패')
    const data = await res.json()

    // attachments 테이블에 레코드 삽입
    const { error } = await supabase.from('attachments').insert({
      project_id: projectId,
      name: file.name,
      file_path: data.path,
      file_type: fileType,
    })
    if (error) throw error
  }

  const handleFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList)
    if (!multiple && arr.length > 1) arr.splice(1)

    setUploading(true)
    try {
      for (const file of arr) {
        await uploadFile(file)
      }
      await loadFiles()
    } catch (err) {
      console.error('파일 업로드 실패:', err)
      alert('파일 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (attachment: Attachment) => {
    try {
      // Storage 삭제
      await fetch('/api/storage/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: attachment.file_path }),
      })
      // DB 삭제
      await supabase.from('attachments').delete().eq('id', attachment.id)
      await loadFiles()
    } catch (err) {
      console.error('삭제 실패:', err)
    }
  }

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path)
    return data.publicUrl
  }

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name)
  const imageFiles = files.filter(f => isImage(f.name))

  return (
    <div>
      {/* 드래그앤드롭 영역 */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          compact ? 'p-2' : 'p-4'
        } ${
          dragOver
            ? 'border-accent bg-accent/5'
            : 'border-border-secondary hover:border-accent hover:bg-accent/5'
        }`}
      >
        {uploading ? (
          <p className="text-[12px] text-accent text-center">업로드 중...</p>
        ) : (
          <p className={`text-txt-tertiary text-center ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
            {label || `${fileType} 파일을 드래그하거나 클릭`}
            {multiple && <span className="block text-[10px] text-txt-quaternary mt-0.5">여러 파일 업로드 가능</span>}
          </p>
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

      {/* 파일 목록 */}
      {files.length > 0 && (
        <div className={`mt-2 ${compact ? 'space-y-1' : 'space-y-1.5'}`}>
          {files.map((file, idx) => (
            <div key={file.id} className="flex items-center gap-2 px-2 py-1.5 bg-surface-secondary rounded-lg group">
              {isImage(file.name) ? (
                <img
                  src={getPublicUrl(file.file_path)}
                  alt={file.name}
                  className="w-8 h-8 rounded object-cover cursor-pointer border border-border-primary"
                  onClick={() => setViewerIdx(imageFiles.findIndex(f => f.id === file.id))}
                />
              ) : (
                <div className="w-8 h-8 rounded bg-surface-tertiary flex items-center justify-center">
                  <FileText size={14} className="text-txt-tertiary" />
                </div>
              )}
              <span className="flex-1 text-[11px] text-txt-secondary truncate">{file.name}</span>
              <button
                onClick={() => handleDelete(file)}
                className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-danger-bg text-txt-tertiary hover:text-danger transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
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
