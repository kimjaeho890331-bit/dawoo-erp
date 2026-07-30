import { getAuthUser } from '@/lib/auth'
import { buildTemplate } from '@/lib/approval/excel'

// 양식 다운로드는 행위자를 알 필요가 없다. 로그인 여부만 확인한다.
export async function GET() {
  const user = await getAuthUser()
  if (!user) return Response.json({ error: '인증이 필요합니다' }, { status: 401 })

  const buf = await buildTemplate()

  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="expense-report-template.xlsx"',
    },
  })
}
