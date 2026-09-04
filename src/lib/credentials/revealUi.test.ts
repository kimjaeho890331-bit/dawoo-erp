import { describe, expect, it } from 'vitest'
import {
  decideRevealClick,
  rememberRevealPassword,
  revealErrorMessage,
  type RevealCacheEntry,
} from './revealUi'

function cacheWith(id: string, password: string, expiresAt: number) {
  const cache = new Map<string, RevealCacheEntry>()
  cache.set(id, { password, expiresAt })
  return cache
}

describe('decideRevealClick', () => {
  it('같은 id가 열려 있으면 재요청 없이 숨긴다', () => {
    expect(
      decideRevealClick({
        rowId: 'c1',
        current: { id: 'c1', status: 'open', password: 'secret' },
        cache: cacheWith('c1', 'secret', 10_000),
        now: 1_000,
      }),
    ).toEqual({ action: 'toggle-hide' })
  })

  it('pending 중 같은 행을 다시 누르면 무시한다', () => {
    expect(
      decideRevealClick({
        rowId: 'c1',
        current: { id: 'c1', status: 'pending' },
        cache: new Map(),
        now: 1_000,
      }),
    ).toEqual({ action: 'ignore' })
  })

  it('타이머가 끝난 뒤에도 캐시가 있으면 재요청 없이 다시 연다', () => {
    expect(
      decideRevealClick({
        rowId: 'c1',
        current: null,
        cache: cacheWith('c1', 'secret', 50_000),
        now: 20_000,
      }),
    ).toEqual({ action: 'show-cached', password: 'secret' })
  })

  it('캐시가 만료되면 POST를 다시 보낸다', () => {
    expect(
      decideRevealClick({
        rowId: 'c1',
        current: null,
        cache: cacheWith('c1', 'secret', 1_000),
        now: 2_000,
      }),
    ).toEqual({ action: 'fetch' })
  })

  it('다른 행은 캐시가 없으면 fetch 한다', () => {
    expect(
      decideRevealClick({
        rowId: 'c2',
        current: { id: 'c1', status: 'open', password: 'a' },
        cache: new Map(),
        now: 1_000,
      }),
    ).toEqual({ action: 'fetch' })
  })
})

describe('rememberRevealPassword', () => {
  it('성공한 비밀번호만 수십 초 메모리에 둔다', () => {
    const cache = new Map<string, RevealCacheEntry>()
    rememberRevealPassword(cache, 'c1', 'secret', 1_000, 45_000)
    expect(cache.get('c1')).toEqual({ password: 'secret', expiresAt: 46_000 })
  })
})

describe('revealErrorMessage', () => {
  it('짧은 실패 문구를 돌려준다', () => {
    expect(revealErrorMessage('항목을 찾을 수 없습니다')).toBe('항목을 찾을 수 없습니다')
    expect(revealErrorMessage('')).toBe('조회 실패')
    expect(revealErrorMessage(null)).toBe('조회 실패')
  })
})
