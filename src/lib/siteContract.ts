/** sites.contract_type 표시용. 빈 값은 비워 두고, 추정해서 채우지 않는다. */
export const CONTRACT_TYPE_BID = '입찰'
export const CONTRACT_TYPE_PRIVATE = '수의계약'

export type ContractTypeKind = 'bid' | 'private' | 'empty' | 'other'

export function contractTypeKind(value: string | null | undefined): ContractTypeKind {
  const v = (value ?? '').trim()
  if (!v) return 'empty'
  if (v === CONTRACT_TYPE_BID) return 'bid'
  if (v === CONTRACT_TYPE_PRIVATE || v === '수의') return 'private'
  return 'other'
}

/** 목록/뱃지 라벨. 빈 값은 빈 문자열. 알 수 없는 값은 원문 그대로. */
export function contractTypeLabel(value: string | null | undefined): string {
  const kind = contractTypeKind(value)
  if (kind === 'empty') return ''
  if (kind === 'bid') return '입찰'
  if (kind === 'private') return '수의'
  return (value ?? '').trim()
}

export function isContractTypeChosen(value: string | null | undefined): boolean {
  return contractTypeKind(value) === 'bid' || contractTypeKind(value) === 'private'
}
