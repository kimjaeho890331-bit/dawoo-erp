import { describe, expect, it } from 'vitest'
import {
  activityLogStaffRefuseReason,
  attachStaffNames,
  isRealStaffId,
  processorLabel,
} from './activityLog'

const STAFF = 'a1b2c3d4-e5f6-47a8-9abc-def012345678'

describe('isRealStaffId', () => {
  it('빈 값과 가짜 문자열은 거부한다', () => {
    expect(isRealStaffId(null)).toBe(false)
    expect(isRealStaffId('')).toBe(false)
    expect(isRealStaffId('  ')).toBe(false)
    expect(isRealStaffId('김재호')).toBe(false)
    expect(isRealStaffId('not-a-uuid')).toBe(false)
  })

  it('실제 uuid만 통과한다', () => {
    expect(isRealStaffId(STAFF)).toBe(true)
  })
})

describe('activityLogStaffRefuseReason', () => {
  it('staff_id 없으면 insert를 거부한다', () => {
    expect(activityLogStaffRefuseReason(null)).toBe('처리자를 선택해 주세요')
    expect(activityLogStaffRefuseReason(undefined)).toBe('처리자를 선택해 주세요')
    expect(activityLogStaffRefuseReason('')).toBe('처리자를 선택해 주세요')
  })

  it('실제 staff id면 통과한다', () => {
    expect(activityLogStaffRefuseReason(STAFF)).toBeNull()
  })
})

describe('processorLabel', () => {
  it('옛 행(staff_id null)은 빈칸으로 두고 이름을 추측하지 않는다', () => {
    expect(processorLabel(null, '김재호')).toBe('—')
    expect(processorLabel(null, null)).toBe('—')
  })

  it('staff_id가 있고 이름이 있으면 그 이름만 보여준다', () => {
    expect(processorLabel(STAFF, '김재호')).toBe('김재호')
  })

  it('staff_id는 있는데 이름이 없으면 빈칸이다', () => {
    expect(processorLabel(STAFF, null)).toBe('—')
    expect(processorLabel(STAFF, '  ')).toBe('—')
  })
})

describe('attachStaffNames', () => {
  it('한 번의 staff 맵으로 붙이고 null 행은 staff를 비운다', () => {
    const rows = [
      { id: '1', staff_id: STAFF, action: 'site_create' },
      { id: '2', staff_id: null, action: 'site_create' },
    ]
    const out = attachStaffNames(rows, new Map([[STAFF, '김재호']]))
    expect(out[0].staff).toEqual({ name: '김재호' })
    expect(out[1].staff).toBeNull()
  })
})
