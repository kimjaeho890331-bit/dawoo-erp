import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const storagePath = formData.get('storagePath') as string

    if (!file || !storagePath) {
      return Response.json({ error: '파일과 경로가 필요합니다' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const { data, error } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return Response.json({ error: '업로드 실패: ' + error.message }, { status: 500 })
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
