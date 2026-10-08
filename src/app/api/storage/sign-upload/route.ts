import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import { checkUpload } from '@/lib/storage/uploadRules'

// 큰 파일용 업로드 허가. 파일 자체는 받지 않고, 브라우저가 저장소로 바로 올릴 수 있는
// 일회용 서명 URL만 내준다 (Vercel 요청 본문 한도 약 4.5MB를 피하기 위함).
// 허용 규칙은 /api/storage/upload 와 같다.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as
    { fileName?: unknown; fileType?: unknown; size?: unknown; storagePath?: unknown } | null
  const fileName = typeof body?.fileName === 'string' ? body.fileName : ''
  const fileType = typeof body?.fileType === 'string' ? body.fileType : ''
  const size = typeof body?.size === 'number' ? body.size : NaN
  const storagePath = typeof body?.storagePath === 'string' ? body.storagePath : ''

  if (!fileName || !storagePath || !Number.isFinite(size) || size <= 0) {
    return Response.json({ error: '파일과 경로가 필요합니다' }, { status: 400 })
  }

  const check = checkUpload({ name: fileName, type: fileType, size }, storagePath)
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: check.status })
  }

  const { data, error } = await supabaseAdmin.storage
    .from('documents')
    .createSignedUploadUrl(check.safePath, { upsert: true })

  if (error || !data) {
    console.error('[SignUpload] Storage error:', error)
    return Response.json({ error: `Storage: ${error?.message || '서명 URL 생성 실패'}` }, { status: 500 })
  }

  const { data: urlData } = supabaseAdmin.storage.from('documents').getPublicUrl(data.path)
  return Response.json({ path: data.path, token: data.token, url: urlData.publicUrl })
}
