import type { ReactNode } from 'react'

/**
 * 모바일에서 표의 한 칸을 대신하는 "라벨 / 값" 한 줄.
 *
 * 데스크톱 표는 칸 제목이 위에 한 번만 나오지만, 폰에서는 표를 세로로 풀기 때문에
 * 값마다 무엇인지 함께 적어줘야 한다.
 *
 * 빈 값은 줄 자체를 그리지 않는다 — 사업자번호처럼 선택 항목이 비어 있을 때
 * 빈 줄이 남으면 카드가 헐거워 보인다. 비어 있어도 반드시 자리를 지켜야 하는
 * 항목은 호출부에서 '-' 같은 값을 넘긴다.
 */
export default function MobileField({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex justify-between gap-3 py-1 text-[13px]">
      <span className="shrink-0 text-txt-secondary">{label}</span>
      <span className="text-right text-txt-primary break-all">{value}</span>
    </div>
  )
}

/** 모바일에서 표의 한 행을 대신하는 카드. */
export function MobileCard({ children }: { children: ReactNode }) {
  return (
    <div className="border border-border-primary rounded-lg px-3 py-2.5 mb-2 last:mb-0">{children}</div>
  )
}
