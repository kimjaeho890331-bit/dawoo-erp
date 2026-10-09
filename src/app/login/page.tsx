'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Loader2, Building2, ChevronDown, ChevronUp } from 'lucide-react'

/** 로그인 오류를 직원이 알아들을 말로. 예전에는 "Invalid login credentials" 같은 영어 원문이 그대로 나왔다. */
function loginErrorMessage(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않습니다.'
  if (m.includes('email not confirmed')) return '이메일 인증이 아직 끝나지 않았습니다. 받은 메일함을 확인해 주세요.'
  if (m.includes('rate limit') || m.includes('too many')) return '잠시 후 다시 시도해 주세요. (시도가 너무 많았습니다)'
  if (m.includes('network') || m.includes('fetch')) return '인터넷 연결을 확인하고 다시 시도해 주세요.'
  return `로그인하지 못했습니다. 잠시 후 다시 시도해 주세요. (${raw})`
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [kakaoLoading, setKakaoLoading] = useState(false)
  const [showEmailLogin, setShowEmailLogin] = useState(false)

  // 카카오 로그인에서 돌아오다 실패하면 콜백이 ?error=…를 붙여 보낸다. 예전에는 아무 말 없이
  // 로그인 화면만 다시 떠서 왜 안 되는지 알 수 없었다. (서버 렌더에서는 주소를 모르므로 빈 값)
  const callbackError = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get('error') ?? '',
    () => '',
  )
  const callbackMessage =
    callbackError === 'no_email' ? '카카오 계정의 이메일 제공에 동의해야 로그인할 수 있습니다. 다시 로그인하면서 이메일 항목에 동의해 주세요.'
    : callbackError === 'auth' ? '카카오 로그인을 마치지 못했습니다. 다시 시도해 주세요.'
    : ''

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleKakaoLogin = async () => {
    setError('')
    setKakaoLoading(true)

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      setError(loginErrorMessage(authError.message))
      setKakaoLoading(false)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(loginErrorMessage(authError.message))
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-page relative overflow-hidden">
      {/* 배경 장식 — 은은한 그리드 패턴 */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(94,106,210,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(94,106,210,0.5) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* 메인 카드 */}
      <div className="relative z-10 w-full max-w-[400px] mx-4">
        <div className="bg-surface border border-border-primary rounded-2xl shadow-sm p-10">
          {/* 로고 영역 */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-sidebar mb-5">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-[22px] font-semibold text-txt-primary tracking-tight leading-tight">
              다우건설
            </h1>
            <p className="text-[13px] text-txt-tertiary mt-1.5 tracking-wide">
              DAWOO ERP
            </p>
          </div>

          {/* 카카오 로그인 버튼 */}
          <button
            onClick={handleKakaoLogin}
            disabled={kakaoLoading}
            className="w-full h-[48px] rounded-xl font-medium text-[15px] flex items-center justify-center gap-2 transition-colors"
            style={{
              backgroundColor: '#FEE500',
              color: 'rgba(0, 0, 0, 0.85)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F5DC00' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#FEE500' }}
          >
            {kakaoLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M9 0.6C4.03 0.6 0 3.713 0 7.55C0 9.944 1.558 12.078 3.931 13.32L2.933 16.844C2.845 17.148 3.192 17.39 3.46 17.214L7.617 14.452C8.073 14.495 8.533 14.5 9 14.5C13.97 14.5 18 11.387 18 7.55C18 3.713 13.97 0.6 9 0.6Z"
                  fill="rgba(0, 0, 0, 0.9)"
                />
              </svg>
            )}
            {kakaoLoading ? '로그인 중...' : '카카오로 로그인'}
          </button>

          {/* 구분선 + 이메일 로그인 토글 */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-primary" />
              </div>
              <div className="relative flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowEmailLogin(!showEmailLogin)}
                  className="bg-surface px-3 text-[12px] text-txt-tertiary hover:text-txt-secondary transition-colors flex items-center gap-1"
                >
                  이메일로 로그인
                  {showEmailLogin ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>

            {/* 이메일 로그인 폼 (접기/펼치기) */}
            {showEmailLogin && (
              <form onSubmit={handleEmailLogin} className="mt-5 space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field w-full"
                  placeholder="이메일"
                  required
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field w-full"
                  placeholder="비밀번호"
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? '로그인 중...' : '로그인'}
                </button>
              </form>
            )}
          </div>

          {/* 에러 메시지 */}
          {(error || callbackMessage) && (
            <div className="mt-4 p-3 rounded-lg bg-danger-bg border border-danger/30 text-[12px] text-danger">
              {error || callbackMessage}
            </div>
          )}
        </div>

        {/* 하단 안내 */}
        <p className="text-center text-[11px] text-txt-quaternary mt-5">
          다우건설 직원 전용 시스템입니다
        </p>
      </div>
    </div>
  )
}
