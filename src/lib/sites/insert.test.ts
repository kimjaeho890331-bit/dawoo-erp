import { beforeEach, describe, expect, it, vi } from 'vitest'

const from = vi.fn()

vi.mock('@/lib/approval/guard', () => ({
  admin: { from: (...args: unknown[]) => from(...args) },
}))

import { insertNewSite } from './insert'

describe('insertNewSite', () => {
  beforeEach(() => {
    from.mockReset()
  })

  it('빈값/NULL/잘못된 값이면 DB insert를 하지 않는다', async () => {
    await expect(insertNewSite({ name: '테스트현장', inflow_path: '', work_kind: '도장' }))
      .resolves.toEqual({ error: '유입경로를 고르세요', status: 400 })
    await expect(insertNewSite({ name: '테스트현장', inflow_path: null, work_kind: '도장' }))
      .resolves.toEqual({ error: '유입경로를 고르세요', status: 400 })
    await expect(insertNewSite({ name: '테스트현장', inflow_path: '소개', work_kind: '방수' }))
      .resolves.toEqual({ error: '공종을 고르세요', status: 400 })
    expect(from).not.toHaveBeenCalled()
  })

  it('허용 값이면 sites insert를 호출한다', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'site-1' }, error: null })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    from.mockReturnValue({ insert })

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
})
