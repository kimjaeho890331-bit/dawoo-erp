import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_PATH_PREFIXES = ['projects/', 'templates/', 'attachments/', 'sites/']

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  try {
    const { storagePath } = await request.json()

    if (!storagePath) {
      return Response.json({ error: '경로가 필요합니다' }, { status: 400 })
    }

    // 경로 검증 (Path Traversal 방지)
    const safePath = storagePath.replace(/\.\./g, '').replace(/^\//, '')
    if (!ALLOWED_PATH_PREFIXES.some((prefix: string) => safePath.startsWith(prefix))) {
      return Response.json({ error: '허용되지 않는 경로입니다' }, { status: 403 })
    }

    const { error } = await supabaseAdmin.storage
      .from('documents')
      .remove([safePath])

    if (error) {
      console.error('Storage delete error:', error)
      return Response.json({ error: '삭제 실패' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Delete API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
