import { describe, it, expect } from 'vitest'
import { isTaskNotifyEvent, planTaskNotice, type TaskNoticeRow } from './task'

const staff = [
  { id: 'ceo', name: '김재호' },
  { id: 'emp', name: '김태정' },
  { id: 'old', name: '정퇴사', resign_date: '2026-08-31' },
]

const row = (over: Partial<TaskNoticeRow> = {}): TaskNoticeRow => ({
  id: 'T1',
  content: '수원 현장 도면 출력',
  assigned_to: 'emp',
  assigned_by: 'ceo',
  deadline: null,
  done: false,
  ...over,
})

describe('isTaskNotifyEvent', () => {
  it('assigned·done만 받는다', () => {
    expect(isTaskNotifyEvent('assigned')).toBe(true)
    expect(isTaskNotifyEvent('done')).toBe(true)
    expect(isTaskNotifyEvent('deleted')).toBe(false)
  })
})

describe('planTaskNotice — assigned', () => {
  it('받은 사람에게 "새 지시"를 시킨 사람 이름과 함께', () => {
    const plan = planTaskNotice('assigned', row(), staff)
    expect(plan).toEqual({
      ok: true,
      recipients: ['emp'],
      payload: { title: '새 지시', body: '김재호: 수원 현장 도면 출력', url: '/dashboard', tag: 'task-T1' },
    })
  })

  it('마감이 있으면 덧붙인다', () => {
    const plan = planTaskNotice('assigned', row({ deadline: '2026-10-15' }), staff)
    expect(plan.ok && plan.payload.body).toBe('김재호: 수원 현장 도면 출력 · 마감 10/15')
  })

  it('긴 내용은 40자로 자른다', () => {
    const plan = planTaskNotice('assigned', row({ content: '가'.repeat(60) }), staff)
    expect(plan.ok && plan.payload.body).toBe(`김재호: ${'가'.repeat(40)}…`)
  })

  it('나에게 적은 할 일이면 보내지 않는다', () => {
    const plan = planTaskNotice('assigned', row({ assigned_to: 'ceo' }), staff)
    expect(plan.ok && plan.recipients).toEqual([])
  })

  it('받은 사람이 비었거나 퇴사자면 보내지 않는다', () => {
    expect(planTaskNotice('assigned', row({ assigned_to: null }), staff)).toMatchObject({ ok: true, recipients: [] })
    expect(planTaskNotice('assigned', row({ assigned_to: 'old' }), staff)).toMatchObject({ ok: true, recipients: [] })
  })

  it('이미 끝난 일이면 409', () => {
    expect(planTaskNotice('assigned', row({ done: true }), staff)).toMatchObject({ ok: false, status: 409 })
  })
})

describe('planTaskNotice — done', () => {
  it('시킨 사람에게 "지시 완료"를 한 사람 이름과 함께', () => {
    const plan = planTaskNotice('done', row({ done: true }), staff)
    expect(plan).toEqual({
      ok: true,
      recipients: ['ceo'],
      payload: { title: '지시 완료', body: '김태정: 수원 현장 도면 출력', url: '/dashboard', tag: 'task-T1' },
    })
  })

  it('나에게 적은 할 일을 끝낸 것이면 보내지 않는다', () => {
    const plan = planTaskNotice('done', row({ done: true, assigned_to: 'ceo' }), staff)
    expect(plan.ok && plan.recipients).toEqual([])
  })

  it('시킨 사람이 지워졌으면(null) 보내지 않는다', () => {
    const plan = planTaskNotice('done', row({ done: true, assigned_by: null }), staff)
    expect(plan.ok && plan.recipients).toEqual([])
    expect(plan.ok && plan.payload.body).toBe('김태정: 수원 현장 도면 출력')
  })

  it('아직 끝나지 않았으면 409', () => {
    expect(planTaskNotice('done', row(), staff)).toMatchObject({ ok: false, status: 409 })
  })
})
