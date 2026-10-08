import { supabase } from '@/lib/supabase'
import { VIA_SERVER_MAX_SIZE } from './uploadRules'

/**
 * 파일을 documents 버킷에 올리고 공개 URL을 돌려준다. 실패하면 사용자에게 보여줄 문구를 담아 던진다.
 * 작은 파일은 기존처럼 /api/storage/upload 를 거치고, 큰 파일은 서명 URL로 저장소에 바로 올린다.
 */
export async function uploadToStorage(file: File, storagePath: string): Promise<{ url: string; path: string }> {
  if (file.size <= VIA_SERVER_MAX_SIZE) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('storagePath', storagePath)
    const res = await fetch('/api/storage/upload', { method: 'POST', body: fd })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.url) throw new Error(json?.error ?? failMessage(res.status))
    return { url: json.url, path: json.path }
  }

  const res = await fetch('/api/storage/sign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileType: file.type, size: file.size, storagePath }),
  })
  const signed = await res.json().catch(() => null)
  if (!res.ok || !signed?.token) throw new Error(signed?.error ?? failMessage(res.status))

  const { error } = await supabase.storage.from('documents')
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || 'application/octet-stream', upsert: true })
  if (error) throw new Error(`업로드 실패: ${error.message}`)
  return { url: signed.url, path: signed.path }
}

function failMessage(status: number): string {
  if (status === 413) return '파일이 너무 커서 서버가 받지 못했습니다'
  if (status === 401) return '로그인이 만료됐습니다. 새로고침 후 다시 시도해 주세요'
  return `업로드 실패 (${status})`
}
