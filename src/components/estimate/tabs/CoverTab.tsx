'use client'

import type { CustomerInfo, CostSummary, WorkType } from '../estimateTypes'
import { COMPANY_INFO, WORK_TYPE_LABELS, WORK_TYPE_ORDER } from '../estimateTypes'
import { formatNumber } from '../estimateCalc'

// ── Props ──

interface Props {
  customerInfo: CustomerInfo
  costSummary: CostSummary
  checkedWorks: WorkType[]
}

// ── 오늘 날짜 한글 포맷 ──

function formatKoreanDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}년 ${m}월 ${d}일`
}

// ── 메인 컴포넌트 ──

export default function CoverTab({
  customerInfo,
  costSummary,
  checkedWorks,
}: Props) {
  // 공종 순서대로 정렬
  const sortedWorks = checkedWorks
    .filter(wt => WORK_TYPE_ORDER.includes(wt))
    .sort((a, b) => WORK_TYPE_ORDER.indexOf(a) - WORK_TYPE_ORDER.indexOf(b))

  // 각 공종별 금액은 개별 집계가 없으므로 총 공사비만 표시
  // (원가계산서에서 합산된 값 사용)
  const buildingName = customerInfo.buildingName || '[빌라명]'
  const constructionDesc = customerInfo.constructionDesc || `${buildingName} 소규모 주택개보수`

  return (
    <div className="flex justify-center print:block">
      {/* A4 가로 비율 용지 */}
      <div className="w-full max-w-[900px] bg-white border border-border-primary shadow-sm print:shadow-none print:border-none rounded-lg print:rounded-none">
        <div className="px-16 py-14 print:px-12 print:py-10">

          {/* ── 상단: 회사 정보 ── */}
          <div className="mb-6">
            <h2 className="text-[20px] font-bold text-txt-primary tracking-[-0.3px] mb-2">
              {COMPANY_INFO.name}
            </h2>
            <div className="space-y-0.5 text-[12px] text-txt-secondary leading-[1.8]">
              <p>
                <span className="text-txt-tertiary">사업자:</span> {COMPANY_INFO.bizNumber}
                <span className="mx-2 text-border-primary">|</span>
                <span className="text-txt-tertiary">법인:</span> {COMPANY_INFO.corpNumber}
              </p>
              <p>{COMPANY_INFO.address}</p>
              <p>
                <span className="text-txt-tertiary">대표:</span> {COMPANY_INFO.representative}
                <span className="mx-2 text-border-primary">|</span>
                <span className="text-txt-tertiary">담당:</span> {COMPANY_INFO.contact}
              </p>
              <p>
                <span className="text-txt-tertiary">업태:</span> {COMPANY_INFO.businessType}
                <span className="mx-2 text-border-primary">|</span>
                <span className="text-txt-tertiary">종목:</span> {COMPANY_INFO.businessItems}
              </p>
            </div>
          </div>

          {/* ── 구분선 ── */}
          <div className="border-t-2 border-txt-primary mb-10" />

          {/* ── 제목 ── */}
          <div className="text-center mb-10">
            <h1
              className="text-[28px] font-bold text-txt-primary"
              style={{ letterSpacing: '0.5em' }}
            >
              견 적 서
            </h1>
          </div>

          {/* ── 수신 / 공사명 ── */}
          <div className="mb-8 space-y-2 text-[14px] text-txt-primary">
            <div className="flex items-baseline gap-2">
              <span className="font-medium min-w-[100px]">{customerInfo.ownerName || buildingName}님</span>
              <span className="text-txt-secondary">귀하</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-txt-tertiary min-w-[100px]">건설공사명:</span>
              <span className="font-medium">{buildingName} 소규모 주택개보수</span>
            </div>
          </div>

          {/* ── 금액 테이블 ── */}
          <div className="mb-10">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="border border-border-primary px-3 py-2.5 text-center w-[60px]">번호</th>
                  <th className="border border-border-primary px-3 py-2.5 text-left">공사명</th>
                  <th className="border border-border-primary px-3 py-2.5 text-right w-[180px]">금액 (원)</th>
                  <th className="border border-border-primary px-3 py-2.5 text-center w-[120px]">비고</th>
                </tr>
              </thead>
              <tbody>
                {sortedWorks.length <= 1 ? (
                  /* 공종 1개 이하: 공사명 단일행 + 합계 */
                  <>
                    <tr>
                      <td className="border border-border-primary px-3 py-2.5 text-center tabular-nums">1</td>
                      <td className="border border-border-primary px-3 py-2.5">
                        {constructionDesc}
                      </td>
                      <td className="border border-border-primary px-3 py-2.5 text-right tabular-nums font-medium">
                        {formatNumber(costSummary.totalCost)}
                      </td>
                      <td className="border border-border-primary px-3 py-2.5 text-center text-txt-tertiary" />
                    </tr>
                    <tr className="bg-surface-secondary font-semibold">
                      <td className="border border-border-primary px-3 py-2.5 text-center" />
                      <td className="border border-border-primary px-3 py-2.5 text-center">합 계</td>
                      <td className="border border-border-primary px-3 py-2.5 text-right tabular-nums">
                        {formatNumber(costSummary.totalCost)}
                      </td>
                      <td className="border border-border-primary px-3 py-2.5" />
                    </tr>
                  </>
                ) : (
                  /* 공종 2개 이상: 개별 행 + 합계 */
                  <>
                    {sortedWorks.map((wt, i) => (
                      <tr key={wt}>
                        <td className="border border-border-primary px-3 py-2.5 text-center tabular-nums">
                          {i + 1}
                        </td>
                        <td className="border border-border-primary px-3 py-2.5">
                          {WORK_TYPE_LABELS[wt]}
                        </td>
                        <td className="border border-border-primary px-3 py-2.5 text-right tabular-nums text-txt-tertiary">
                          -
                        </td>
                        <td className="border border-border-primary px-3 py-2.5 text-center text-txt-tertiary" />
                      </tr>
                    ))}
                    <tr className="bg-surface-secondary font-semibold">
                      <td className="border border-border-primary px-3 py-2.5 text-center" />
                      <td className="border border-border-primary px-3 py-2.5 text-center">합 계</td>
                      <td className="border border-border-primary px-3 py-2.5 text-right tabular-nums">
                        {formatNumber(costSummary.totalCost)}
                      </td>
                      <td className="border border-border-primary px-3 py-2.5" />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* ── 날짜 ── */}
          <div className="text-center text-[14px] text-txt-secondary">
            {formatKoreanDate()}
          </div>

        </div>
      </div>
    </div>
  )
}
