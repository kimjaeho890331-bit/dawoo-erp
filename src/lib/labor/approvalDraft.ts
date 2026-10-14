/**
 * 일용직 근무관리에서 체크한 근무자들로 지출결의서 초안을 만든다.
 *
 * 예전에는 "노무비 결재" 버튼이 결재 없이 지출에 바로 저장했다. 대표 결정(2026-10-09)으로
 * 노무비도 지출결의서 결재를 거친다 — 여기서 만든 초안을 작성중 문서로 저장하고 수정 화면을
 * 열어, 작성자가 확인한 뒤 결재를 올린다. 결재가 끝나야 지출이 생긴다.
 *
 * 근무자 한 명 = 지급정보 한 줄. 지급요청일은 근무표의 지급일, 없으면 오늘.
 */
export interface LaborPayLine {
  worker_name: string
  /** 실지급액 (총지급액 − 공제) */
  netPay: number
  bank_name: string | null
  account_number: string | null
  /** 근무표의 지급일 (YYYY-MM-DD) */
  payment_date: string | null
  /** 메모에 남길 계산 내역 한 줄 */
  detail: string
}

export interface LaborDraft {
  title: string
  body_html: string
  payments: {
    vendor_name: string
    amount: number
    pay_request_date: string
    bank: string
    account_no: string
    business_no: string
  }[]
}

const TITLE_MAX = 50

/**
 * 제목은 쓰던 관행을 따른다 — `26년 9월 상암오수펌프장 노무비[김창식,김수만] 집행 요청의 건`.
 * 공사건이 제목에 들어가야 공사건별 1장이 서로 구분되고, 중복 제목 경고도 제 일을 한다.
 * 50자를 넘으면 이름을 인원수로, 그래도 넘으면 공사건명을 자른다.
 */
function laborDraftTitle(input: { year: number; month: number; workTargetName: string; names: string[] }): string {
  const { year, month, names } = input
  const target = input.workTargetName.trim()
  const yy = String(year % 100).padStart(2, '0')
  const build = (t: string, who: string) => `${yy}년 ${month}월 ${t} 노무비${who} 집행 요청의 건`

  const withNames = build(target, `[${names.join(',')}]`)
  if (withNames.length <= TITLE_MAX) return withNames

  const withCount = build(target, `(${names.length}명)`)
  if (withCount.length <= TITLE_MAX) return withCount

  // 공사건명이 길어 인원수로도 안 줄면 공사건명을 잘라 맞춘다 ('…' 한 글자 자리를 남긴다)
  const cut = Math.max(1, target.length - (withCount.length - TITLE_MAX) - 1)
  return build(`${target.slice(0, cut)}…`, `(${names.length}명)`)
}

export function laborApprovalDraft(input: {
  year: number
  month: number
  lines: LaborPayLine[]
  /** 지급일이 비어 있을 때 쓸 날짜 (YYYY-MM-DD) */
  today: string
  /** 공사건(현장/접수건) 이름. 결의서 한 장 = 공사건 하나 */
  workTargetName: string
}): { ok: true; draft: LaborDraft } | { ok: false; error: string } {
  const { year, month, lines, today, workTargetName } = input
  if (lines.length === 0) return { ok: false, error: '결재 올릴 근무자를 체크해 주세요.' }

  const unnamed = lines.filter(l => !l.worker_name.trim()).length
  if (unnamed > 0) return { ok: false, error: `이름이 비어 있는 근무자가 ${unnamed}명 있습니다. 이름을 넣어 주세요.` }

  const unpaid = lines.filter(l => !(l.netPay > 0)).map(l => l.worker_name.trim())
  if (unpaid.length > 0) {
    return { ok: false, error: `실지급액이 0원인 근무자가 있습니다: ${unpaid.join(', ')} — 근무일·일급을 넣거나 체크를 빼 주세요.` }
  }

  const names = lines.map(l => l.worker_name.trim())
  const title = laborDraftTitle({ year, month, workTargetName, names })

  return {
    ok: true,
    draft: {
      title,
      body_html: ['일용직 근무관리에서 만든 결의서입니다.', ...lines.map(l => l.detail)].join('\n'),
      payments: lines.map(l => ({
        vendor_name: l.worker_name.trim(),
        amount: l.netPay,
        pay_request_date: l.payment_date || today,
        bank: l.bank_name ?? '',
        account_no: l.account_number ?? '',
        business_no: '',
      })),
    },
  }
}
