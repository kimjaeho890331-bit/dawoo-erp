import { NextRequest } from 'next/server'
import { admin, resolveActor } from '@/lib/approval/guard'
import { canSeeLedger } from '@/lib/ledgerAccess'
import { isAutoCreatedStaff, isMissingTableOrColumn, replaceStaffId, STAFF_REFERENCES } from '@/lib/staff/ghost'

/**
 * 카카오 첫 로그인 때 자동으로 생긴 직원 행을 정리한다.
 *
 * - target_id가 있으면 "합치기": 그 사람이 남긴 기록(접수 담당, 일정, 결재, 지출 …)의 직원 id를
 *   실제 직원으로 옮기고, 로그인 이메일을 실제 직원에 연결(staff_emails)한 뒤 자동 생성 행을 지운다.
 * - target_id가 없으면 "지우기": 기록이 없는 행만 지울 수 있다(남은 기록이 있으면 409).
 *
 * 화면의 「현재 직원」이 대표·관리자·경리일 때만 허용한다. 자동 생성 행(직책 '사원')이 아니면 거절한다.
 */
export async function POST(request: NextRequest) {
  let body: { ghost_id?: string; target_id?: string | null; actor_staff_id?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  const actor = await resolveActor(body.actor_staff_id)
  if (actor instanceof Response) return actor
  if (!canSeeLedger(actor.staff.role)) {
    return Response.json({ error: '대표·관리자·경리만 정리할 수 있습니다' }, { status: 403 })
  }

  const ghostId = body.ghost_id
  const targetId = body.target_id || null
  if (!ghostId) return Response.json({ error: '정리할 직원을 골라 주세요' }, { status: 400 })
  if (targetId === ghostId) return Response.json({ error: '같은 직원끼리는 합칠 수 없습니다' }, { status: 400 })

  const { data: ghost } = await admin.from('staff').select('id, name, role, email').eq('id', ghostId).maybeSingle()
  if (!ghost) return Response.json({ error: '이미 정리된 직원입니다' }, { status: 404 })
  if (!isAutoCreatedStaff(ghost)) {
    return Response.json({ error: '카카오 로그인 때 자동으로 생긴 직원만 정리할 수 있습니다' }, { status: 409 })
  }

  let targetName: string | null = null
  if (targetId) {
    const { data: target } = await admin.from('staff').select('id, name, role').eq('id', targetId).maybeSingle()
    if (!target) return Response.json({ error: '합칠 직원을 찾지 못했습니다' }, { status: 404 })
    if (isAutoCreatedStaff(target)) {
      return Response.json({ error: '자동으로 생긴 직원끼리는 합칠 수 없습니다. 실제 직원을 골라 주세요' }, { status: 409 })
    }
    targetName = target.name

    // 1) 기록 옮기기. 표·칸이 없는 곳은 건너뛴다. 다른 오류면 멈춘다(다시 누르면 남은 것부터 이어서 옮긴다).
    for (const [table, column] of STAFF_REFERENCES) {
      const { error } = await admin.from(table).update({ [column]: targetId }).eq(column, ghostId)
      if (error && !isMissingTableOrColumn(error)) {
        // 같은 이메일이 양쪽에 연결돼 있는 등 겹침은 아래 이메일 연결 단계에서 정리된다
        if (table === 'staff_emails' && error.code === '23505') continue
        console.error(`[merge-ghost] ${table}.${column} 옮기기 실패:`, error.message)
        return Response.json({ error: `기록을 옮기다 멈췄습니다(${table}). 다시 눌러 주세요` }, { status: 500 })
      }
    }

    // 2) 일정의 여러 담당자(staff_ids) 배열
    const { data: multi, error: multiError } = await admin
      .from('schedules').select('id, staff_ids').contains('staff_ids', [ghostId])
    if (multiError && !isMissingTableOrColumn(multiError)) {
      console.error('[merge-ghost] 일정 담당자 조회 실패:', multiError.message)
      return Response.json({ error: '일정 담당자를 옮기다 멈췄습니다. 다시 눌러 주세요' }, { status: 500 })
    }
    for (const row of (multi ?? []) as { id: string; staff_ids: string[] | null }[]) {
      await admin.from('schedules').update({ staff_ids: replaceStaffId(row.staff_ids, ghostId, targetId) }).eq('id', row.id)
    }

    // 3) 그 사람의 로그인 이메일을 실제 직원에 연결 — 다음 로그인부터 실제 직원으로 들어온다
    if (ghost.email) {
      const { error } = await admin.from('staff_emails').upsert(
        { staff_id: targetId, email: ghost.email, linked_by_email: actor.authEmail, updated_at: new Date().toISOString() },
        { onConflict: 'email' },
      )
      if (error) {
        console.error('[merge-ghost] 이메일 연결 실패:', error.message)
        return Response.json({ error: '로그인 계정을 연결하지 못했습니다. 다시 눌러 주세요' }, { status: 500 })
      }
    }
  }

  if (!targetId) {
    // 그냥 지우기는 기록이 하나도 없을 때만. 외래키가 없는 표(일정 등)는 지워져도 막히지 않아,
    // 확인 없이 지우면 그 기록의 담당자 이름만 빈 채로 남는다.
    const ignore = new Set(['staff_emails', 'push_subscriptions'])
    for (const [table, column] of STAFF_REFERENCES) {
      if (ignore.has(table)) continue
      const { count, error } = await admin.from(table).select(column, { count: 'exact', head: true }).eq(column, ghostId)
      if (error && !isMissingTableOrColumn(error)) {
        console.error(`[merge-ghost] ${table}.${column} 확인 실패:`, error.message)
        return Response.json({ error: '남은 기록을 확인하지 못했습니다. 다시 눌러 주세요' }, { status: 500 })
      }
      if ((count ?? 0) > 0) {
        return Response.json(
          { error: '이 직원 이름으로 남은 기록이 있어 지울 수 없습니다. 기존 직원과 합치기를 써 주세요' },
          { status: 409 },
        )
      }
    }
  }

  // 4) 예전 로그인 콜백이 같이 만들어 둔 미사용 초대 코드(staff_invitations)는 지운다(행 삭제를 막지 않게)
  await admin.from('staff_invitations').delete().eq('used_by_staff_id', ghostId).is('used_at', null)

  const { error: deleteError } = await admin.from('staff').delete().eq('id', ghostId)
  if (deleteError) {
    console.error('[merge-ghost] 삭제 실패:', deleteError.message)
    return Response.json(
      {
        error: targetId
          ? '아직 옮기지 못한 기록이 있어 지우지 못했습니다. 관리자에게 알려 주세요'
          : '이 직원 이름으로 남은 기록이 있어 지울 수 없습니다. 기존 직원과 합치기를 써 주세요',
      },
      { status: 409 },
    )
  }

  return Response.json({ ok: true, merged_into: targetName })
}
