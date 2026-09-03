import { describe, expect, it } from 'vitest'
import { isRealStaffId, processorLabel, statusLogStaffRefuseReason } from './statusLog'

const STAFF = 'a1b2c3d4-e5f6-47a8-9abc-def012345678'

describe('statusLogStaffRefuseReason', () => {
  it('staff_id 없으면 insert를 거부한다', () => {
    expect(statusLogStaffRefuseReason(null)).toBe('처리자를 선택해 주세요')
    expect(statusLogStaffRefuseReason('')).toBe('처리자를 선택해 주세요')
    expect(isRealStaffId('김재호')).toBe(false)
  })

  it('실제 staff id면 통과한다', () => {
    expect(statusLogStaffRefuseReason(STAFF)).toBeNull()
  })
})

describe('processorLabel for status_logs', () => {
  it('옛 행(staff_id null)은 — 로 두고 이름을 추측하지 않는다', () => {
    expect(processorLabel(null, '김재호')).toBe('—')
    expect(processorLabel(STAFF, '김재호')).toBe('김재호')
  })
})
