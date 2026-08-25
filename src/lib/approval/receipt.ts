/**
 * 지출 영수증으로 쓸 첨부를 고른다.
 *
 * 거래처DB에서 자동으로 붙은 서류(사업자등록증·통장사본)는 영수증이 아니다.
 * 기안자가 직접 올린 것(전자세금계산서·거래명세서·견적서) 중 첫 번째를 쓴다.
 * 직접 올린 게 없으면 비운다 — 잘못된 영수증보다 빈 영수증이 낫다.
 *
 * 입력은 uploaded_at 오름차순으로 정렬돼 있다고 가정한다(호출부 책임).
 */
export function pickReceiptUrl(
  files: { file_url: string; source: string }[],
): string | null {
  const manual = files.find(f => f.source !== 'vendor')
  return manual?.file_url ?? null
}
