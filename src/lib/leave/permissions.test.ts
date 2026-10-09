import { describe, it, expect } from 'vitest'
import { canDecideLeave, canChangeLeave, isLeaveApprover } from './permissions'

const 대표 = { id: 'ceo', role: '대표' }
const 관리자 = { id: 'mgr', role: '관리자' }
const 직원 = { id: 'emp', role: '직원' }
const 경리 = { id: 'acc', role: '경리' }

describe('isLeaveApprover', () => {
  it('대표·관리자·경리만 승인자다', () => {
    expect(isLeaveApprover('대표')).toBe(true)
    expect(isLeaveApprover(' 관리자 ')).toBe(true)
    expect(isLeaveApprover('경리')).toBe(true)
    expect(isLeaveApprover('직원')).toBe(false)
    expect(isLeaveApprover('현장소장')).toBe(false)
    expect(isLeaveApprover(null)).toBe(false)
  })
})

describe('canDecideLeave', () => {
  it('직원은 남의 연차도 본인 연차도 승인할 수 없다', () => {
    expect(canDecideLeave(직원, 'other')).toBe(false)
    expect(canDecideLeave(직원, 'emp')).toBe(false)
  })
  it('관리자는 남의 연차만 승인한다', () => {
    expect(canDecideLeave(관리자, 'emp')).toBe(true)
    expect(canDecideLeave(관리자, 'mgr')).toBe(false)
  })
  it('경리는 남의 연차만 승인한다', () => {
    expect(canDecideLeave(경리, 'emp')).toBe(true)
    expect(canDecideLeave(경리, 'acc')).toBe(false)
  })
  it('대표는 본인 연차도 승인한다', () => {
    expect(canDecideLeave(대표, 'ceo')).toBe(true)
  })
  it('현재 직원을 고르지 않았으면 아무도 승인할 수 없다', () => {
    expect(canDecideLeave({ id: null, role: '대표' }, 'emp')).toBe(false)
  })
})

describe('canChangeLeave', () => {
  it('대기 중인 본인 신청은 고칠 수 있다', () => {
    expect(canChangeLeave(직원, { staff_id: 'emp', status: '대기' })).toBe(true)
  })
  it('승인된 본인 신청은 직원이 고칠 수 없다', () => {
    expect(canChangeLeave(직원, { staff_id: 'emp', status: '승인' })).toBe(false)
    expect(canChangeLeave(직원, { staff_id: 'emp', status: '반려' })).toBe(false)
  })
  it('남의 신청은 직원이 고칠 수 없다', () => {
    expect(canChangeLeave(직원, { staff_id: 'other', status: '대기' })).toBe(false)
  })
  it('승인자는 승인된 신청도 고칠 수 있다', () => {
    expect(canChangeLeave(관리자, { staff_id: 'emp', status: '승인' })).toBe(true)
  })
})
