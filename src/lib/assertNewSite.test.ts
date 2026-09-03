import { describe, expect, it } from 'vitest'
import { SITE_INFLOW_PATHS } from './siteInflow'
import { SITE_WORK_KINDS } from './siteWorkKind'
import { assertNewSiteInflowAndWorkKind } from './assertNewSite'

function refused(input: { inflow_path?: string | null; work_kind?: string | null }) {
  const result = assertNewSiteInflowAndWorkKind(input)
  expect('error' in result).toBe(true)
  if (!('error' in result)) throw new Error('expected refuse')
  expect(result.status).toBe(400)
  return result
}

describe('assertNewSiteInflowAndWorkKind (INSERT만)', () => {
  it('빈 문자열을 거절한다', () => {
    const both = refused({ inflow_path: '', work_kind: '' })
    expect(both.error).toBe('유입경로와 공종을 고르세요')
    expect(refused({ inflow_path: '', work_kind: '도장' }).error).toBe('유입경로를 고르세요')
    expect(refused({ inflow_path: '소개', work_kind: '' }).error).toBe('공종을 고르세요')
  })

  it('NULL을 거절한다', () => {
    const both = refused({ inflow_path: null, work_kind: null })
    expect(both.error).toBe('유입경로와 공종을 고르세요')
    expect(refused({ inflow_path: null, work_kind: '실내건축' }).error).toBe('유입경로를 고르세요')
    expect(refused({ inflow_path: '재계약', work_kind: null }).error).toBe('공종을 고르세요')
  })

  it('없는 키를 거절한다', () => {
    expect(refused({}).error).toBe('유입경로와 공종을 고르세요')
    expect(refused({ work_kind: '도장' }).error).toBe('유입경로를 고르세요')
    expect(refused({ inflow_path: '소개' }).error).toBe('공종을 고르세요')
  })

  it('허용 외 값을 추정하지 않고 거절한다', () => {
    expect(refused({ inflow_path: '입찰', work_kind: '도장' }).error).toBe('유입경로를 고르세요')
    expect(refused({ inflow_path: '소개', work_kind: '방수' }).error).toBe('공종을 고르세요')
    expect(refused({ inflow_path: ' 소개', work_kind: '도장' }).error).toBe('유입경로를 고르세요')
    expect(refused({ inflow_path: '소개', work_kind: '도장 ' }).error).toBe('공종을 고르세요')
  })

  it('허용 값만 통과하고 그 값을 그대로 돌려준다', () => {
    for (const inflow_path of SITE_INFLOW_PATHS) {
      for (const work_kind of SITE_WORK_KINDS) {
        const ok = assertNewSiteInflowAndWorkKind({ inflow_path, work_kind })
        expect(ok).toEqual({ inflow_path, work_kind })
      }
    }
  })
})

describe('UPDATE는 NULL 허용 (INSERT assert를 쓰지 않음)', () => {
  it('옛 행의 inflow_path/work_kind null은 UPDATE payload로 유지할 수 있다', () => {
    const updatePayload = { inflow_path: null as string | null, work_kind: null as string | null }
    expect(updatePayload.inflow_path).toBeNull()
    expect(updatePayload.work_kind).toBeNull()
    const insertRefuse = assertNewSiteInflowAndWorkKind(updatePayload)
    expect('error' in insertRefuse).toBe(true)
    if ('error' in insertRefuse) expect(insertRefuse.status).toBe(400)
  })
})
