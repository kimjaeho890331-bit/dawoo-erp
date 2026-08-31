import { describe, expect, it } from 'vitest'
import { canSeeLedger } from './ledgerAccess'
import {
  canSeePrivateIds,
  PRIVATE_IDS_MENU,
  PRIVATE_IDS_PATH,
  SHARED_IDS_MENU,
  SHARED_IDS_PATH,
} from './credentialAccess'

describe('canSeePrivateIds', () => {
  it('관리자만 중요 ID/PW를 본다', () => {
    expect(canSeePrivateIds('관리자')).toBe(true)
    expect(canSeePrivateIds(' 관리자 ')).toBe(true)
    expect(canSeePrivateIds('대표')).toBe(false)
    expect(canSeePrivateIds('경리')).toBe(false)
    expect(canSeePrivateIds('직원')).toBe(false)
    expect(canSeePrivateIds('현장소장')).toBe(false)
    expect(canSeePrivateIds(null)).toBe(false)
    expect(canSeePrivateIds(undefined)).toBe(false)
    expect(canSeePrivateIds('')).toBe(false)
  })

  it('경리 메뉴보다 좁다 — 경리·대표는 중요 목록을 못 본다', () => {
    expect(canSeeLedger('경리')).toBe(true)
    expect(canSeeLedger('대표')).toBe(true)
    expect(canSeePrivateIds('경리')).toBe(false)
    expect(canSeePrivateIds('대표')).toBe(false)
    expect(canSeePrivateIds('관리자')).toBe(true)
  })

  it('사이드바 이름·경로가 고정이다', () => {
    expect(SHARED_IDS_MENU).toBe('공유 ID/PW')
    expect(PRIVATE_IDS_MENU).toBe('중요 ID/PW')
    expect(SHARED_IDS_PATH).toBe('/ids')
    expect(PRIVATE_IDS_PATH).toBe('/ids-private')
  })
})
