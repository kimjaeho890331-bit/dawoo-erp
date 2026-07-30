// vendors.bank_info 파싱
// 운영 데이터의 실제 형태: "국민은행/264401-04-370029/기원건설" (구분자·예금주 유무가 제각각)
// vendors.bank_name / account_number 정식 칼럼이 채워지면 이 파서를 거치지 않는다 — 폴백 전용.

export interface ParsedBank {
  bank: string
  account: string
}

export function parseBankInfo(raw: string | null | undefined): ParsedBank | null {
  if (!raw) return null

  const trimmed = raw.trim()
  if (!trimmed) return null

  let bank: string
  let account: string

  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').map(p => p.trim())
    bank = parts[0] ?? ''
    account = parts[1] ?? ''
  } else {
    const spaceIdx = trimmed.indexOf(' ')
    if (spaceIdx === -1) return null
    bank = trimmed.slice(0, spaceIdx).trim()
    account = trimmed.slice(spaceIdx + 1).trim()
  }

  if (!bank || !account) return null

  return { bank, account }
}
