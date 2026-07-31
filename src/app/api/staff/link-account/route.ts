import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { admin } from '@/lib/approval/guard'

/**
 * 로그인 계정(세션 이메일)을 staff 행에 연결한다.
 *
 * 이메일은 절대 요청 본문에서 받지 않는다 — 클라이언트가 보낸 이메일을 믿으면
 * 아무나 남의 계정을 남에게 붙일 수 있다. 반드시 getAuthUser()로 얻은
 * "지금 로그인된 세션"의 이메일만 사용한다. staff_id만 body로 받아 "이 세션 이메일을
 * 어느 직원에게 연결할지"만 고른다.
 *
 * email은 staff_emails.email UNIQUE 제약을 upsert로 활용한다 — 같은 이메일로
 * 다시 연결 요청이 오면(계정 주인이 바뀐 경우 등) 최신 연결로 덮어쓴다. 덮어쓰기
 * 전 기존 연결이 다른 사람이었다면 응답에 previous_staff_name을 담아 화면이
 * 사용자에게 알릴 수 있게 한다.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }
  if (!user.email) {
    return Response.json({ error: '로그인 계정에 이메일 정보가 없습니다' }, { status: 400 })
  }
  const sessionEmail = user.email

  let body: { staff_id?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const { staff_id } = body
  if (!staff_id) {
    return Response.json({ error: '연결할 직원을 선택해 주세요' }, { status: 400 })
  }

  // staff_id가 실제 staff 행인지 확인
  const { data: staffRow, error: staffError } = await admin
    .from('staff')
    .select('id, name')
    .eq('id', staff_id)
    .maybeSingle()

  if (staffError) {
    console.error('[link-account] staff 조회 실패:', staffError.message)
    return Response.json({ error: '직원 정보를 확인하지 못했습니다' }, { status: 500 })
  }
  if (!staffRow) {
    return Response.json({ error: '등록되지 않은 직원입니다' }, { status: 403 })
  }

  // 이 이메일이 이미 다른 직원에게 연결돼 있었는지 확인 (덮어쓰기 전 기존 소유자 기록용)
  const { data: existing, error: existingError } = await admin
    .from('staff_emails')
    .select('staff_id, staff:staff_id(name)')
    .eq('email', sessionEmail)
    .maybeSingle()

  if (existingError) {
    console.error('[link-account] 기존 연결 조회 실패:', existingError.message)
    return Response.json({ error: '기존 연결 정보를 확인하지 못했습니다' }, { status: 500 })
  }

  let previousStaffName: string | undefined
  if (existing && existing.staff_id !== staff_id) {
    const prevStaff = existing.staff as unknown as { name: string } | null
    previousStaffName = prevStaff?.name
  }

  const { error: upsertError } = await admin
    .from('staff_emails')
    .upsert({ staff_id, email: sessionEmail }, { onConflict: 'email' })

  if (upsertError) {
    console.error('[link-account] 연결 저장 실패:', upsertError.message)
    return Response.json({ error: '계정 연결에 실패했습니다' }, { status: 500 })
  }

  return Response.json({
    ok: true,
    staff_name: staffRow.name,
    ...(previousStaffName ? { previous_staff_name: previousStaffName } : {}),
  })
}
