import { beforeEach, describe, expect, it, vi } from 'vitest'

const from = vi.fn()

vi.mock('@/lib/approval/guard', () => ({
  admin: { from: (...args: unknown[]) => from(...args) },
}))

import { insertNewSite } from './insert'

function mockInsert() {
  const single = vi.fn().mockResolvedValue({ data: { id: 'site-1' }, error: null })
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  from.mockReturnValue({ insert })
  return { insert }
}

describe('insertNewSite', () => {
  beforeEach(() => {
    from.mockReset()
  })

  it('빈값/NULL INSERT는 400이 아니고 미확인으로 insert한다', async () => {
    const { insert } = mockInsert()

    await expect(insertNewSite({ name: '테스트현장', inflow_path: '', work_kind: '도장' }))
      .resolves.toEqual({ id: 'site-1' })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      inflow_path: '미확인',
      work_kind: '도장',
    }))

    await expect(insertNewSite({ name: '테스트현장', inflow_path: null, work_kind: null }))
      .resolves.toEqual({ id: 'site-1' })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      inflow_path: '미확인',
      work_kind: '미확인',
    }))

    await expect(insertNewSite({ name: '테스트현장' }))
      .resolves.toEqual({ id: 'site-1' })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      inflow_path: '미확인',
      work_kind: '미확인',
    }))
  })

  it('허용 외 값이면 DB insert를 하지 않는다', async () => {
    await expect(insertNewSite({ name: '테스트현장', inflow_path: '소개', work_kind: '방수' }))
      .resolves.toEqual({ error: '공종을 고르세요', status: 400 })
    expect(from).not.toHaveBeenCalled()
  })

  it('허용 값이면 sites insert를 호출한다', async () => {
    const { insert } = mockInsert()

    await expect(insertNewSite({
      name: '테스트현장',
      inflow_path: '소개',
      work_kind: '도장',
    })).resolves.toEqual({ id: 'site-1' })

    expect(from).toHaveBeenCalledWith('sites')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      name: '테스트현장',
      inflow_path: '소개',
      work_kind: '도장',
    }))
  })

  it('미확인은 허용값으로 insert한다', async () => {
    const { insert } = mockInsert()

    await expect(insertNewSite({
      name: '테스트현장',
      inflow_path: '미확인',
      work_kind: '미확인',
    })).resolves.toEqual({ id: 'site-1' })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      inflow_path: '미확인',
      work_kind: '미확인',
    }))
  })
})
