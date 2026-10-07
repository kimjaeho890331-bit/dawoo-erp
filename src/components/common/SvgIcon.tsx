/**
 * 메뉴 아이콘 — 사이드바와 모바일 대시보드 즐겨찾기가 함께 쓴다.
 * 아이콘은 menuItems.ts가 path 문자열로 들고 있다.
 */
export default function SvgIcon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className || 'w-[18px] h-[18px]'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}
