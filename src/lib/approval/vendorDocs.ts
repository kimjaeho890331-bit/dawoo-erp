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
    .map(c => ({
      file_name: `${vendor.name} ${c.label}`,
      file_url: c.url,
      size: 0,
      source: 'vendor' as const,
    }))
}
