import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ISOLATED_ANON_DATA_STORAGE_KEY,
  createBrowserSupabaseClient,
  isIsolatedAnonDataClientAuth,
  resetBrowserSupabaseClientForTests,
  setBrowserClientFactoryForTests,
  staffSessionAccessToken,
} from './browser'

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

afterEach(() => {
  resetBrowserSupabaseClientForTests()
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL
  if (ORIGINAL_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY
})

describe('createBrowserSupabaseClient', () => {
  it('createBrowserClient를 URL/anon 키만으로 한 번 호출하고 같은 인스턴스를 재사용한다', () => {
    const created = { auth: { getSession: vi.fn() } }
    const factory = vi.fn(() => created)
    setBrowserClientFactoryForTests(factory as never)
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    const first = createBrowserSupabaseClient()
    const second = createBrowserSupabaseClient()

    expect(first).toBe(created)
    expect(second).toBe(created)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(factory).toHaveBeenCalledWith('https://proj.supabase.co', 'anon-key')
    expect(factory.mock.calls[0]).toHaveLength(2)
  })

  it('reset 후에는 팩토리를 다시 호출한다', () => {
    const firstClient = { id: 1 }
    const secondClient = { id: 2 }
    const factory = vi.fn()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient)
    setBrowserClientFactoryForTests(factory as never)
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    expect(createBrowserSupabaseClient()).toBe(firstClient)
    resetBrowserSupabaseClientForTests()
    setBrowserClientFactoryForTests(factory as never)
    expect(createBrowserSupabaseClient()).toBe(secondClient)
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('실제 ssr 클라이언트는 로그아웃이면 staff 세션 JWT가 없다', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    const client = createBrowserSupabaseClient()
    const { data } = await client.auth.getSession()
    expect(data.session).toBeNull()
    expect(staffSessionAccessToken(data.session)).toBeNull()
  })
})

describe('isIsolatedAnonDataClientAuth', () => {
  it('예전 persistSession:false + 분리 storageKey 는 세션을 안 싣는 설정이다', () => {
    expect(
      isIsolatedAnonDataClientAuth({
        persistSession: false,
        storageKey: ISOLATED_ANON_DATA_STORAGE_KEY,
      }),
    ).toBe(true)
    expect(isIsolatedAnonDataClientAuth({ persistSession: false })).toBe(true)
    expect(isIsolatedAnonDataClientAuth({ storageKey: ISOLATED_ANON_DATA_STORAGE_KEY })).toBe(true)
  })

  it('createBrowserClient 기본값(옵션 없음)은 세션을 싣는다', () => {
    expect(isIsolatedAnonDataClientAuth(undefined)).toBe(false)
    expect(isIsolatedAnonDataClientAuth(null)).toBe(false)
    expect(isIsolatedAnonDataClientAuth({})).toBe(false)
  })
})

describe('staffSessionAccessToken', () => {
  it('로그아웃이거나 user가 없으면 staff JWT가 없다', () => {
    expect(staffSessionAccessToken(null)).toBeNull()
    expect(staffSessionAccessToken(undefined)).toBeNull()
    expect(staffSessionAccessToken({ access_token: 'tok' })).toBeNull()
    expect(staffSessionAccessToken({ access_token: '', user: { id: 'u1' } })).toBeNull()
    expect(staffSessionAccessToken({ user: { id: 'u1' } })).toBeNull()
  })

  it('로그인 세션만 access_token을 돌려준다', () => {
    expect(staffSessionAccessToken({ access_token: 'jwt-staff', user: { id: 'u1' } })).toBe(
      'jwt-staff',
    )
  })
})
