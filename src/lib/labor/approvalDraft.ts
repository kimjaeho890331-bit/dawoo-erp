/**
 * 일용직 근무관리에서 체크한 근무자들로 지출결의서 초안을 만든다.
 *
 * 예전에는 "노무비 결재" 버튼이 결재 없이 지출에 바로 저장했다. 대표 결정(2026-10-09)으로
 * 노무비도 지출결의서 결재를 거친다 — 여기서 만든 초안을 작성중 문서로 저장하고 수정 화면을
 * 열어, 작성자가 확인한 뒤 결재를 올린다. 결재가 끝나야 지출이 생긴다.
 *
 * 공사건이 여러 개여도 문서는 한 장이다(2026-10-15 결정). 지급줄마다 공사건을 달고(029)
 * 작성 화면이 공사건별로 묶어 보여준다. 승인 시 지출은 그 줄의 공사건으로 등록되므로
 * 현장별 원가는 줄 단위로 갈린다. 문서 자체의 공사건은 첫 묶음을 대표로 쓴다(026 제약).
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
  /** 이 줄의 공사건 이름 */
  workTargetName: string
  site_id: string | null
  project_id: string | null
}

export interface LaborDraftPayment {
  vendor_name: string
  amount: number
  pay_request_date: string
  bank: string
  account_no: string
  business_no: string
  site_id: string | null
  project_id: string | null
  work_target_label: string
}

export interface LaborDraft {
  title: string
  body_html: string
  /** 문서 대표 공사건 — 026 제약을 채운다. 줄별 공사건이 실제 귀속이다 */
  site_id: string | null
  project_id: string | null
  payments: LaborDraftPayment[]
}

const TITLE_MAX = 50

/**
 * 제목은 쓰던 관행을 따른다 — `26년 9월 상암오수펌프장 노무비[김창식,김수만] 집행 요청의 건`.
 * 공사건이 여럿이면 쉼표로 잇고, 길면 「외 N건」으로, 이름은 인원수로 줄인다.
 */
function laborDraftTitle(input: { year: number; month: number; targets: string[]; names: string[] }): string {
  const { year, month, targets, names } = input
  const yy = String(year % 100).padStart(2, '0')
  const build = (t: string, who: string) => `${yy}년 ${month}월 ${t} 노무비${who} 집행 요청의 건`

  const all = targets.join(',')
  const short = targets.length > 1 ? `${targets[0]} 외 ${targets.length - 1}건` : (targets[0] ?? '')
  const withNames = `[${names.join(',')}]`
  const withCount = `(${names.length}명)`

  for (const t of [build(all, withNames), build(all, withCount), build(short, withNames), build(short, withCount)]) {
    if (t.length <= TITLE_MAX) return t
  }

  // 그래도 넘으면 공사건 쪽을 잘라 맞춘다 ('…' 한 글자 자리를 남긴다)
  const last = build(short, withCount)
  const cut = Math.max(1, short.length - (last.length - TITLE_MAX) - 1)
  return build(`${short.slice(0, cut)}…`, withCount)
}

export function laborApprovalDraft(input: {
  year: number
  month: number
  lines: LaborPayLine[]
  /** 지급일이 비어 있을 때 쓸 날짜 (YYYY-MM-DD) */
  today: string
}): { ok: true; draft: LaborDraft } | { ok: false; error: string } {
  const { year, month, lines, today } = input
  if (lines.length === 0) return { ok: false, error: '결재 올릴 근무자를 체크해 주세요.' }

  const unnamed = lines.filter(l => !l.worker_name.trim()).length
  if (unnamed > 0) return { ok: false, error: `이름이 비어 있는 근무자가 ${unnamed}명 있습니다. 이름을 넣어 주세요.` }

  const unpaid = lines.filter(l => !(l.netPay > 0)).map(l => l.worker_name.trim())
  if (unpaid.length > 0) {
    return { ok: false, error: `실지급액이 0원인 근무자가 있습니다: ${unpaid.join(', ')} — 근무일·일급을 넣거나 체크를 빼 주세요.` }
  }

  const names = lines.map(l => l.worker_name.trim())
  const targets: string[] = []
  for (const l of lines) {
    const t = l.workTargetName.trim()
    if (t && !targets.includes(t)) targets.push(t)
  }

  // 메모는 공사건이 여럿일 때만 묶음 제목을 끼운다 — 한 건이면 군더더기가 된다
  const body: string[] = ['일용직 근무관리에서 만든 결의서입니다.']
  if (targets.length > 1) {
    for (const t of targets) {
      body.push(`[${t}]`)
      body.push(...lines.filter(l => l.workTargetName.trim() === t).map(l => l.detail))
    }
  } else {
    body.push(...lines.map(l => l.detail))
  }

  return {
    ok: true,
    draft: {
      title: laborDraftTitle({ year, month, targets, names }),
      body_html: body.join('\n'),
      site_id: lines[0].site_id,
      project_id: lines[0].project_id,
      payments: lines.map(l => ({
        vendor_name: l.worker_name.trim(),
        amount: l.netPay,
        pay_request_date: l.payment_date || today,
        bank: l.bank_name ?? '',
        account_no: l.account_number ?? '',
        business_no: '',
        site_id: l.site_id,
        project_id: l.project_id,
        work_target_label: l.workTargetName.trim(),
      })),
    },
  }
}
