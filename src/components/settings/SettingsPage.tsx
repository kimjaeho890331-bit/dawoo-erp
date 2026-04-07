'use client'

import { useState } from 'react'
import { Building2, Users, Bell, Shield, Database, Save, Check } from 'lucide-react'

// --- 타입 ---
interface CompanyInfo {
  name: string
  ceo: string
  bizNumber: string
  address: string
  phone: string
  fax: string
  email: string
  constructionTypes: string
}

interface NotificationSetting {
  key: string
  label: string
  description: string
  enabled: boolean
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'company' | 'notification' | 'system'>('company')
  const [saved, setSaved] = useState(false)

  // 회사 정보 (추후 DB)
  const [company, setCompany] = useState<CompanyInfo>({
    name: '다우건설',
    ceo: '김재호',
    bizNumber: '',
    address: '경기도 수원시',
    phone: '',
    fax: '',
    email: '',
    constructionTypes: '실내건축공사업, 수도시설공사업',
  })

  // 알림 설정
  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { key: 'deadline', label: '마감 알림', description: '서류 제출 D-3일 전 알림', enabled: true },
    { key: 'payment', label: '미수금 알림', description: '완료 후 30일 경과 미수금 알림', enabled: true },
    { key: 'stale', label: '정체 알림', description: '30일 이상 진행 없는 건 알림', enabled: true },
    { key: 'schedule', label: '일정 알림', description: '캘린더 일정 당일 알림', enabled: true },
    { key: 'report', label: '보고서 생성', description: '일일/주간/월간 보고서 자동 생성', enabled: true },
    { key: 'tax', label: '세무 알림', description: '회계달력 세무 일정 D-3일 전 알림', enabled: true },
    { key: 'as', label: 'A/S 알림', description: 'A/S 미완료 3건 이상 누적 시 알림', enabled: false },
    { key: 'expense', label: '이상지출 알림', description: '기준 초과 지출 감지 시 알림', enabled: true },
  ])

  // 시스템 설정
  const [systemSettings, setSystemSettings] = useState({
    defaultYear: new Date().getFullYear(),
    itemsPerPage: 50,
    autoSaveInterval: 30,
    reportTime: '08:00',
  })

  const toggleNotif = (key: string) => {
    setNotifications(prev => prev.map(n => n.key === key ? { ...n, enabled: !n.enabled } : n))
  }

  const handleSave = () => {
    // 추후 Supabase 저장
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateCompany = (field: keyof CompanyInfo, value: string) => {
    setCompany(prev => ({ ...prev, [field]: value }))
  }

  const tabs = [
    { key: 'company' as const, label: '회사 정보', icon: Building2 },
    { key: 'notification' as const, label: '알림 설정', icon: Bell },
    { key: 'system' as const, label: '시스템', icon: Database },
  ]

  return (
    <div className="max-w-[900px] mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-txt-primary">설정</h1>
        <button onClick={handleSave}
          className="h-[36px] px-5 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-medium transition flex items-center gap-1.5">
          {saved ? <><Check size={14} /> 저장됨</> : <><Save size={14} /> 저장</>}
        </button>
      </div>

      <div className="flex gap-5">
        {/* 사이드 탭 */}
        <div className="w-[200px] space-y-1">
          {tabs.map(t => {
            const Icon = t.icon
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] transition text-left ${
                  tab === t.key
                    ? 'bg-accent-light text-accent-text font-semibold'
                    : 'text-txt-secondary hover:bg-surface-tertiary'
                }`}>
                <Icon size={16} className={tab === t.key ? 'text-accent-text' : 'text-txt-tertiary'} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1">
          {/* 회사 정보 */}
          {tab === 'company' && (
            <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
              <div className="px-6 py-4 border-b border-border-tertiary">
                <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">회사 정보</h2>
                <p className="text-[12px] text-txt-tertiary mt-0.5">서류 자동 생성 시 사용됩니다</p>
              </div>
              <div className="px-6 py-5 space-y-4">
                {([
                  { key: 'name', label: '상호명', placeholder: '다우건설' },
                  { key: 'ceo', label: '대표자', placeholder: '김재호' },
                  { key: 'bizNumber', label: '사업자등록번호', placeholder: '000-00-00000' },
                  { key: 'address', label: '주소', placeholder: '경기도 수원시...' },
                  { key: 'phone', label: '전화', placeholder: '031-000-0000' },
                  { key: 'fax', label: '팩스', placeholder: '031-000-0000' },
                  { key: 'email', label: '이메일', placeholder: 'dawoo@example.com' },
                  { key: 'constructionTypes', label: '업종', placeholder: '실내건축공사업, 수도시설공사업' },
                ] as const).map(field => (
                  <div key={field.key} className="flex items-center gap-4">
                    <label className="w-[120px] text-[13px] text-txt-secondary shrink-0">{field.label}</label>
                    <input
                      value={company[field.key]}
                      onChange={e => updateCompany(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="flex-1 h-[36px] border border-border-primary rounded-lg px-3 text-[13px] text-txt-primary bg-surface focus:border-accent focus:ring-2 focus:ring-accent-light outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 알림 설정 */}
          {tab === 'notification' && (
            <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
              <div className="px-6 py-4 border-b border-border-tertiary">
                <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">알림 설정</h2>
                <p className="text-[12px] text-txt-tertiary mt-0.5">AI 보고서 및 자동 알림 기준</p>
              </div>
              <div className="divide-y divide-border-tertiary">
                {notifications.map(n => (
                  <div key={n.key} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="text-[13px] font-medium text-txt-primary">{n.label}</p>
                      <p className="text-[12px] text-txt-tertiary mt-0.5">{n.description}</p>
                    </div>
                    <button
                      onClick={() => toggleNotif(n.key)}
                      className={`w-11 h-6 rounded-full transition-colors relative ${n.enabled ? 'bg-accent' : 'bg-surface-tertiary'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${n.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 시스템 설정 */}
          {tab === 'system' && (
            <div className="space-y-4">
              <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
                <div className="px-6 py-4 border-b border-border-tertiary">
                  <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">시스템 설정</h2>
                </div>
                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-center gap-4">
                    <label className="w-[160px] text-[13px] text-txt-secondary shrink-0">기본 연도</label>
                    <select value={systemSettings.defaultYear}
                      onChange={e => setSystemSettings(prev => ({ ...prev, defaultYear: Number(e.target.value) }))}
                      className="h-[36px] border border-border-primary rounded-lg px-3 text-[13px] text-txt-primary bg-surface focus:border-accent outline-none">
                      {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}년</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="w-[160px] text-[13px] text-txt-secondary shrink-0">페이지당 표시 건수</label>
                    <select value={systemSettings.itemsPerPage}
                      onChange={e => setSystemSettings(prev => ({ ...prev, itemsPerPage: Number(e.target.value) }))}
                      className="h-[36px] border border-border-primary rounded-lg px-3 text-[13px] text-txt-primary bg-surface focus:border-accent outline-none">
                      {[20, 30, 50, 100].map(n => <option key={n} value={n}>{n}건</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="w-[160px] text-[13px] text-txt-secondary shrink-0">보고서 생성 시각</label>
                    <input type="time" value={systemSettings.reportTime}
                      onChange={e => setSystemSettings(prev => ({ ...prev, reportTime: e.target.value }))}
                      className="h-[36px] border border-border-primary rounded-lg px-3 text-[13px] text-txt-primary bg-surface focus:border-accent outline-none" />
                  </div>
                </div>
              </div>

              {/* DB 정보 */}
              <div className="bg-surface rounded-[10px] border border-border-primary overflow-hidden">
                <div className="px-6 py-4 border-b border-border-tertiary">
                  <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary flex items-center gap-2">
                    <Shield size={16} className="text-txt-tertiary" /> 연결 정보
                  </h2>
                </div>
                <div className="px-6 py-4 space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[13px] text-txt-secondary">Supabase</span>
                    <span className="text-[12px] text-txt-tertiary">etwpcaedbuubjzbfrjli.supabase.co</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[13px] text-txt-secondary">AI 모델</span>
                    <span className="text-[12px] text-txt-tertiary">claude-sonnet-4-20250514</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[13px] text-txt-secondary">배포</span>
                    <span className="text-[12px] text-txt-tertiary">Vercel</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[13px] text-txt-secondary">버전</span>
                    <span className="text-[12px] text-txt-tertiary">DAWOO ERP v1.0.0</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
