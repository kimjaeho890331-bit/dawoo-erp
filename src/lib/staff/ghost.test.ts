import { describe, expect, it } from 'vitest'
import { isAutoCreatedStaff, isMissingTableOrColumn, replaceStaffId, STAFF_REFERENCES } from './ghost'

describe('isAutoCreatedStaff', () => {
  it('직책 사원만 자동 생성 행으로 본다', () => {
    expect(isAutoCreatedStaff({ role: '사원' })).toBe(true)
    expect(isAutoCreatedStaff({ role: ' 사원 ' })).toBe(true)
    for (const role of ['대표', '관리자', '경리', '직원', '현장소장', '', null]) {
      expect(isAutoCreatedStaff({ role })).toBe(false)
    }
    expect(isAutoCreatedStaff(null)).toBe(false)
  })
})

describe('replaceStaffId', () => {
  it('바꾸고, 이미 있으면 겹치지 않게 뺀다', () => {
    expect(replaceStaffId(['g', 'a'], 'g', 'r')).toEqual(['r', 'a'])
    expect(replaceStaffId(['g', 'r'], 'g', 'r')).toEqual(['r'])
    expect(replaceStaffId(['a'], 'g', 'r')).toEqual(['a'])
    expect(replaceStaffId(null, 'g', 'r')).toBeNull()
  })
})

describe('isMissingTableOrColumn', () => {
  it('표·칸 없음만 건너뛴다', () => {
    expect(isMissingTableOrColumn({ code: '42P01' })).toBe(true)
    expect(isMissingTableOrColumn({ code: 'PGRST204', message: "Could not find the 'x' column" })).toBe(true)
    expect(isMissingTableOrColumn({ code: '23503', message: 'violates foreign key constraint' })).toBe(false)
    expect(isMissingTableOrColumn(null)).toBe(false)
  })
})

describe('STAFF_REFERENCES', () => {
  it('직원 id를 쓰는 주요 표가 빠지지 않았다', () => {
    const keys = STAFF_REFERENCES.map(([t, c]) => `${t}.${c}`)
    for (const k of ['projects.staff_id', 'expense_reports.drafter_staff_id', 'expense_report_lines.staff_id', 'schedules.staff_id', 'leave_requests.staff_id', 'tasks.assigned_to', 'staff_emails.staff_id']) {
      expect(keys).toContain(k)
    }
    expect(new Set(keys).size).toBe(keys.length)
  })
})
