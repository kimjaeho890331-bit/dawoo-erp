import { describe, expect, it } from 'vitest'
import { SITE_INFLOW_PATHS, SITE_INFLOW_UNCONFIRMED } from './siteInflow'
import { SITE_WORK_KINDS, SITE_WORK_KIND_UNCONFIRMED } from './siteWorkKind'
import { assertNewSiteInflowAndWorkKind } from './assertNewSite'

function refused(input: { inflow_path?: string | null; work_kind?: string | null }) {
  const result = assertNewSiteInflowAndWorkKind(input)
  expect('error' in result).toBe(true)
  if (!('error' in result)) throw new Error('expected refuse')
  expect(result.status).toBe(400)
  return result
}

describe('assertNewSiteInflowAndWorkKind (INSERT만)', () => {
  it('빈 문자열은 400이 아니고 미확인으로 넣는다', () => {
    expect(assertNewSiteInflowAndWorkKind({ inflow_path: '', work_kind: '' })).toEqual({
      inflow_path: SITE_INFLOW_UNCONFIRMED,
      work_kind: SITE_WORK_KIND_UNCONFIRMED,
    })
    expect(assertNewSiteInflowAndWorkKind({ inflow_path: '', work_kind: '도장' })).toEqual({
      inflow_path: SITE_INFLOW_UNCONFIRMED,
      work_kind: '도장',
    })
    expect(assertNewSiteInflowAndWorkKind({ inflow_path: '소개', work_kind: '' })).toEqual({
      inflow_path: '소개',
      work_kind: SITE_WORK_KIND_UNCONFIRMED,
    })
  })

  it('NULL은 400이 아니고 미확인으로 넣는다', () => {
    expect(assertNewSiteInflowAndWorkKind({ inflow_path: null, work_kind: null })).toEqual({
      inflow_path: SITE_INFLOW_UNCONFIRMED,
      work_kind: SITE_WORK_KIND_UNCONFIRMED,
    })
    expect(assertNewSiteInflowAndWorkKind({ inflow_path: null, work_kind: '실내건축' })).toEqual({
      inflow_path: SITE_INFLOW_UNCONFIRMED,
      work_kind: '실내건축',
    })
    expect(assertNewSiteInflowAndWorkKind({ inflow_path: '재계약', work_kind: null })).toEqual({
      inflow_path: '재계약',
      work_kind: SITE_WORK_KIND_UNCONFIRMED,
    })
  })

  it('없는 키는 400이 아니고 미확인으로 넣는다', () => {
    expect(assertNewSiteInflowAndWorkKind({})).toEqual({
      inflow_path: SITE_INFLOW_UNCONFIRMED,
      work_kind: SITE_WORK_KIND_UNCONFIRMED,
    })
    expect(assertNewSiteInflowAndWorkKind({ work_kind: '도장' })).toEqual({
      inflow_path: SITE_INFLOW_UNCONFIRMED,
      work_kind: '도장',
    })
    expect(assertNewSiteInflowAndWorkKind({ inflow_path: '소개' })).toEqual({
      inflow_path: '소개',
      work_kind: SITE_WORK_KIND_UNCONFIRMED,
    })
  })

  it('미확인은 허용값이다', () => {
    expect(assertNewSiteInflowAndWorkKind({
      inflow_path: SITE_INFLOW_UNCONFIRMED,
      work_kind: SITE_WORK_KIND_UNCONFIRMED,
    })).toEqual({
      inflow_path: SITE_INFLOW_UNCONFIRMED,
      work_kind: SITE_WORK_KIND_UNCONFIRMED,
    })
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
    const insertResolved = assertNewSiteInflowAndWorkKind(updatePayload)
    expect(insertResolved).toEqual({
      inflow_path: SITE_INFLOW_UNCONFIRMED,
      work_kind: SITE_WORK_KIND_UNCONFIRMED,
    })
  })
})
