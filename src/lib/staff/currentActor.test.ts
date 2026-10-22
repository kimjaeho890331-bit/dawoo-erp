import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { applyLoginActor, readCurrentActor, writeCurrentActor, CURRENT_STAFF_KEY } from './currentActor'

// 이 모듈은 localStorage만 읽고 쓴다. 테스트 환경이 node라 직접 흉내 낸다.
function fakeStorage(opts: { blocked?: boolean } = {}) {
  const box = new Map<string, string>()
  return {
    box,
    getItem(k: string) {
      if (opts.blocked) throw new Error('storage blocked')
      return box.has(k) ? box.get(k)! : null
    },
    setItem(k: string, v: string) {
      if (opts.blocked) throw new Error('storage blocked')
      box.set(k, v)
    },
  }
}

const 나 = 'staff-me'
const 남 = 'staff-other'

let saved: unknown

beforeEach(() => {
  saved = (globalThis as Record<string, unknown>).localStorage
})
afterEach(() => {
  ;(globalThis as Record<string, unknown>).localStorage = saved
})

function use(store: ReturnType<typeof fakeStorage>) {
  ;(globalThis as Record<string, unknown>).localStorage = store
}

describe('applyLoginActor', () => {
  it('아무도 고른 적 없으면 로그인한 사람으로 맞춘다', () => {
    const s = fakeStorage()
    use(s)
    expect(applyLoginActor(나)).toBe(나)
    expect(s.box.get(CURRENT_STAFF_KEY)).toBe(나)
  })

  it('남의 이름이 남아 있어도 처음 로그인하면 본인으로 바꾼다', () => {
    const s = fakeStorage()
    s.box.set(CURRENT_STAFF_KEY, 남) // 공용 PC에 남아 있던 값
    use(s)
    expect(applyLoginActor(나)).toBe(나)
  })

  it('같은 계정으로 다시 불러도 손으로 바꾼 선택은 덮어쓰지 않는다', () => {
    const s = fakeStorage()
    use(s)
    applyLoginActor(나) // 첫 로그인 — 본인으로 맞춰짐
    writeCurrentActor(남) // 경리가 남의 몫을 대신 기안하려고 바꿈
    expect(applyLoginActor(나)).toBe(남)
    expect(readCurrentActor()).toBe(남)
  })

  it('다른 사람이 로그인하면 그 사람으로 바뀐다', () => {
    const s = fakeStorage()
    use(s)
    applyLoginActor(나)
    writeCurrentActor('staff-third') // 손으로 바꿔둔 상태
    expect(applyLoginActor(남)).toBe(남) // 계정이 바뀌었으니 다시 맞춘다
  })

  it('로그아웃으로 현재 직원이 지워졌으면 같은 계정이라도 다시 맞춘다', () => {
    const s = fakeStorage()
    use(s)
    applyLoginActor(나)
    s.box.delete(CURRENT_STAFF_KEY) // signOut이 지움
    expect(applyLoginActor(나)).toBe(나)
  })

  it('저장소가 막혀 있어도 예외를 내지 않고 로그인한 사람을 돌려준다', () => {
    use(fakeStorage({ blocked: true }))
    expect(() => applyLoginActor(나)).not.toThrow()
    expect(applyLoginActor(나)).toBe(나)
  })
})
