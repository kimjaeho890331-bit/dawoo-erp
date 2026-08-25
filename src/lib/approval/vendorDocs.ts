export interface VendorDocSource {
  name: string
  biz_license_url: string | null
  bankbook_url: string | null
}

/**
 * FileAttach의 AttachedFile과 구조가 같다. 여기서 따로 정의하는 이유는
 * src/lib이 컴포넌트를 import하면 의존 방향이 뒤집히기 때문이다 —
 * 이 파일은 순수 함수만 두고 vitest에서 컴포넌트 없이 돌아가야 한다.
 */
export interface VendorAttachment {
  file_name: string
  file_url: string
  size: number
  source: 'vendor'
}

/**
 * URL에서 확장자만 뽑아낸다(소문자, 점 없이).
 *
 * 쿼리스트링(`?token=...`)이 붙어 있으면 먼저 잘라내고, 경로의 마지막 조각에서만
 * 찾는다 — 그렇지 않으면 `/1.2/vendors/biz` 같은 경로 중간의 점을 확장자로 착각한다.
 * 못 찾으면 빈 문자열을 돌려준다 — 호출부가 억지로 확장자를 붙이지 않게 한다.
 */
function extractExtension(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0]
  const lastSegment = withoutQuery.split('/').pop() ?? ''
  const match = lastSegment.match(/\.([a-zA-Z0-9]+)$/)
  return match ? match[1].toLowerCase() : ''
}

/**
 * 거래처DB에 등록된 결제 서류를 첨부 목록에 붙일 형태로 바꾼다.
 *
 * 파일을 복사하지 않고 거래처DB의 URL을 그대로 가리킨다. size는 알 수 없어 0으로
 * 둔다(표시용일 뿐 계산에 쓰이지 않는다).
 * 신분증·안전교육증은 결제 서류가 아니라 넣지 않는다.
 *
 * 이미 붙어 있는 URL은 걸러낸다 — 거래처를 다시 고르거나 지급정보 행을 여러 개
 * 쓸 때 같은 파일이 쌓이면 안 된다.
 */
export function vendorDocsToAttachments(
  vendor: VendorDocSource,
  existing: { file_url: string }[],
): VendorAttachment[] {
  const already = new Set(existing.map(f => f.file_url))
  const candidates: { label: string; url: string | null }[] = [
    { label: '사업자등록증', url: vendor.biz_license_url },
    { label: '통장사본', url: vendor.bankbook_url },
  ]
  return candidates
    .filter((c): c is { label: string; url: string } => !!c.url && !already.has(c.url))
    .map(c => {
      // 확장자가 없으면 ApprovalDetail.tsx의 미리보기 판정(PREVIEWABLE 정규식)이
      // 실패해 무조건 ?download=로 빠진다 — 결재자가 눌러도 바로 확인이 안 된다.
      const ext = extractExtension(c.url)
      return {
        file_name: ext ? `${vendor.name} ${c.label}.${ext}` : `${vendor.name} ${c.label}`,
        file_url: c.url,
        size: 0,
        source: 'vendor' as const,
      }
    })
}
