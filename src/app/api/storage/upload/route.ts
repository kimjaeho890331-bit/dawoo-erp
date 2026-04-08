import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_PATH_PREFIXES = ['projects/', 'templates/', 'attachments/', 'sites/']

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const storagePath = formData.get('storagePath') as string

    if (!file || !storagePath) {
      return Response.json({ error: '파일과 경로가 필요합니다' }, { status: 400 })
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: '파일 크기는 10MB 이하만 가능합니다' }, { status: 400 })
    }

    // 파일 타입 검증
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return Response.json({ error: '허용되지 않는 파일 형식입니다' }, { status: 400 })
    }

    // 경로 검증 (Path Traversal 방지)
    const safePath = storagePath.replace(/\.\./g, '').replace(/^\//, '')
    if (!ALLOWED_PATH_PREFIXES.some(prefix => safePath.startsWith(prefix))) {
      return Response.json({ error: '허용되지 않는 저장 경로입니다' }, { status: 403 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const { data, error } = await supabaseAdmin.storage
      .from('documents')
      .upload(safePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return Response.json({ error: '업로드 실패' }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(data.path)

    return Response.json({ url: urlData.publicUrl, path: data.path })
  } catch (error) {
    console.error('Upload API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
