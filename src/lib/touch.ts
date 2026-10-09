/**
 * 마우스 없이 손가락으로만 쓰는 기기(폰·태블릿)인가.
 *
 * 더블클릭·마우스 올리기로만 열리던 기능을 폰에서는 한 번 누르기로 열 때 쓴다.
 * 화면 폭이 아니라 입력 방식으로 판단한다 — 큰 태블릿도 마우스가 없다.
 */
export function isTouchOnly(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
}
