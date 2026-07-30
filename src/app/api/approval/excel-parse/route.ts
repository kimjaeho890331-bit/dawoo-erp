import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { parseWorkbook } from '@/lib/approval/excel'

export const maxDuration = 30

// 파싱만 하고 DB에 쓰지 않으므로 행위자가 필요 없다. 로그인 여부만 확인한다.
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  const fd = await request.formData()
  const file = fd.get('file') as File | null
  if (!file) return Response.json({ error: '파일이 없습니다' }, { status: 400 })

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return Response.json({ error: 'xlsx 파일만 업로드할 수 있습니다' }, { status: 400 })
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const out = await parseWorkbook(buf)
    return Response.json(out)
  } catch (e) {
    return Response.json(
      { error: `엑셀을 읽지 못했습니다: ${e instanceof Error ? e.message : '알 수 없는 오류'}` },
      { status: 400 },
    )
  }
}
