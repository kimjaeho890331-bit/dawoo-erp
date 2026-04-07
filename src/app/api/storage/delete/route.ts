import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  try {
    const { storagePath } = await request.json()

    if (!storagePath) {
      return Response.json({ error: '경로가 필요합니다' }, { status: 400 })
    }

    const { error } = await supabaseAdmin.storage
      .from('documents')
      .remove([storagePath])

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
