/**
 * 지출결의서 화면들이 함께 쓰는 버튼 모양.
 *
 * 예전에는 같은 화면 안에서도 버튼 높이가 h-8·h-9·py-2·min-h-11로 제각각이었고,
 * 가장 중요한 "새 결의서" 버튼이 테두리만 있는 보조 모양이라 눈에 띄지 않았다.
 * 모양은 세 가지(주·보조·위험), 높이는 폰 44px / PC 36px 두 가지만 쓴다.
 */
const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] whitespace-nowrap ' +
  'transition-colors disabled:opacity-40 disabled:pointer-events-none min-h-11 md:min-h-9'

/** 화면에서 가장 중요한 동작 하나. 한 화면에 하나만 둔다. */
export const BTN_PRIMARY = `${BASE} bg-accent font-medium text-txt-inverse hover:bg-accent-hover`

/** 나머지 동작. */
export const BTN_SECONDARY = `${BASE} border border-border-primary bg-surface text-txt-primary hover:bg-surface-secondary`

/** 지우기·반려처럼 되돌리기 어려운 동작. */
export const BTN_DANGER = `${BASE} border border-danger/40 bg-surface text-danger hover:bg-danger-bg`
