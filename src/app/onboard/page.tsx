'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Loader2, ShieldCheck, UserCheck, ArrowRight, Check } from 'lucide-react'

interface StaffOption {
  id: string
  name: string
  role: string
  phone: string | null
}

export default function OnboardPage() {
  const router = useRouter()
  const [step, setStep] = useState<'code' | 'select'>('code')
  const [inviteCode, setInviteCode] = useState('')
  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserEmail(user.email || '')
    }
    checkAuth()
  }, [supabase, router])

  const handleVerifyCode = async () => {
    if (!inviteCode.trim()) {
      setError('초대코드를 입력해주세요')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/verify-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim() }),
      })

      const data = await res.json()

      if (!data.valid) {
        setError(data.error || '초대코드가 일치하지 않습니다')
        setLoading(false)
        return
      }

      // 코드 맞음 → 미연결 직원 목록 조회
      const { data: staff } = await supabase
        .from('staff')
        .select('id, name, role, phone')
        .or('email.is.null,email.eq.')
        .order('name')

      setStaffList(staff || [])
      setStep('select')
    } catch {
      setError('서버 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleLinkStaff = async () => {
    if (!selectedStaffId) {
      setError('직원을 선택해주세요')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/link-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: selectedStaffId }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || '연결에 실패했습니다')
        setLoading(false)
        return
      }

      router.push('/dashboard')
    } catch {
      setError('서버 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && step === 'code') {
      handleVerifyCode()
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-page relative overflow-hidden">
      {/* 배경 장식 */}
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

      <div className="relative z-10 w-full max-w-[440px] mx-4">
        <div className="bg-surface border border-border-primary rounded-2xl shadow-sm p-10">
          {/* 단계 표시 */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className={`flex items-center gap-1.5 text-[12px] font-medium ${
              step === 'code' ? 'text-accent' : 'text-txt-tertiary'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                step === 'code' ? 'bg-accent text-white' : 'bg-green-100 text-green-700'
              }`}>
                {step === 'select' ? <Check className="w-3.5 h-3.5" /> : '1'}
              </div>
              초대코드
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-txt-quaternary" />
            <div className={`flex items-center gap-1.5 text-[12px] font-medium ${
              step === 'select' ? 'text-accent' : 'text-txt-quaternary'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                step === 'select' ? 'bg-accent text-white' : 'bg-surface-secondary text-txt-quaternary'
              }`}>
                2
              </div>
              직원 확인
            </div>
          </div>

          {step === 'code' ? (
            <>
              {/* Step 1: 초대코드 입력 */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent-light mb-4">
                  <ShieldCheck className="w-6 h-6 text-accent" />
                </div>
                <h2 className="text-[18px] font-semibold text-txt-primary tracking-tight">
                  직원 인증
                </h2>
                <p className="text-[13px] text-txt-tertiary mt-1.5">
                  관리자에게 받은 초대코드를 입력해주세요
                </p>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="input-field w-full text-center text-[15px] tracking-widest"
                  placeholder="초대코드 입력"
                  autoFocus
                />
                <button
                  onClick={handleVerifyCode}
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? '확인 중...' : '확인'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Step 2: 직원 선택 */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent-light mb-4">
                  <UserCheck className="w-6 h-6 text-accent" />
                </div>
                <h2 className="text-[18px] font-semibold text-txt-primary tracking-tight">
                  본인 확인
                </h2>
                <p className="text-[13px] text-txt-tertiary mt-1.5">
                  본인의 이름을 선택해주세요
                </p>
                {userEmail && (
                  <p className="text-[11px] text-txt-quaternary mt-1">
                    {userEmail}
                  </p>
                )}
              </div>

              <div className="space-y-2 mb-5 max-h-[240px] overflow-y-auto">
                {staffList.length === 0 ? (
                  <div className="text-center py-6 text-[13px] text-txt-tertiary">
                    연결 가능한 직원이 없습니다.
                    <br />
                    <span className="text-[12px]">관리자에게 문의해주세요.</span>
                  </div>
                ) : (
                  staffList.map((staff) => (
                    <button
                      key={staff.id}
                      onClick={() => setSelectedStaffId(staff.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                        selectedStaffId === staff.id
                          ? 'border-accent bg-accent-light'
                          : 'border-border-primary hover:border-border-secondary hover:bg-surface-secondary'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[14px] font-medium text-txt-primary">
                            {staff.name}
                          </span>
                          <span className="ml-2 text-[11px] text-txt-tertiary">
                            {staff.role}
                          </span>
                        </div>
                        {selectedStaffId === staff.id && (
                          <Check className="w-4 h-4 text-accent" />
                        )}
                      </div>
                      {staff.phone && (
                        <p className="text-[12px] text-txt-tertiary mt-0.5">{staff.phone}</p>
                      )}
                    </button>
                  ))
                )}
              </div>

              <button
                onClick={handleLinkStaff}
                disabled={loading || !selectedStaffId}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? '연결 중...' : '완료'}
              </button>
            </>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
              {error}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-txt-quaternary mt-5">
          다우건설 직원 전용 시스템입니다
        </p>
      </div>
    </div>
  )
}
