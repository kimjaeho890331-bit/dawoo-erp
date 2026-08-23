/**
 * 수도 공용 접수대장 행 준비도 (신청서 만들자 신호).
 *
 * 견적서 있음 = estimates 행 존재 또는 attachments.file_type='견적서'.
 * 빈 견적·견적 번호를 만들지 않는다.
 * 파일은 기존 attachments(name, file_path, file_type, drive_url)만 쓴다.
 * 새 문자열: 신분증사본, 견적서. 테이블/컬럼/RLS 변경 없음. 백필 없음.
 * 통장사본은 live file_type 또는 이름 표시. 대장은 건축물대장 표시 또는 issued/confirmed.
 * extra_fields 실키는 additional_cost / remark 뿐. sms_consent 없음 → 여기에만 둔다.
 *
 * 사람 입력 재사용: owner_name, owner_phone, bank_name+account_number+account_holder,
 * construction_date, construction_end_date, consent_date+consent_time, application_date
 */

export const WATER_PUBLIC_TYPE = '공용'

/** Live attachments.file_type: 통장사본 / 동의서 / 신청서. */
export const BANKBOOK_FILE_TYPE = '통장사본'
/** 기존 attachments.file_type 문자열만 추가. 새 테이블/컬럼 없음. live 0건. */
export const ID_CARD_FILE_TYPE = '신분증사본'
export const ESTIMATE_FILE_TYPE = '견적서'
/** cowork complete 가 이미 쓰는 표시. live attachments 에는 아직 없음. */
export const LEDGER_FILE_TYPE = '건축물대장'
export const CERT_TASK_TYPE = 'issue_certificate'

/** Live name 표시: 통장사본, 통장 사본, 통장계좌. file_type=신청서인데 이름이 통장사본인 행이 있다. */
const BANKBOOK_NAME_MARKS = ['통장사본', '통장 사본', '통장계좌'] as const

export const LEDGER_READY_STATUSES = ['issued', 'confirmed'] as const

export const SMS_CONSENT_KEY = 'sms_consent'
export const APPLICATION_READY_KEY = 'application_ready'
export const APPLICATION_READY_AT_KEY = 'application_ready_at'

export const HUMAN_READINESS_ITEMS = [
  { key: 'owner', label: '대표자' },
  { key: 'phone', label: '전화' },
  { key: 'bank', label: '은행·계좌·예금주' },
  { key: 'bankbook', label: '통장사본' },
  { key: 'constructionStart', label: '공사 시작일' },
  { key: 'constructionEnd', label: '공사 종료일' },
  { key: 'meeting', label: '회의 일시' },
  { key: 'applicationDate', label: '신청일' },
  { key: 'smsConsent', label: '문자 동의' },
] as const

export const SYSTEM_READINESS_ITEMS = [
  { key: 'ledger', label: '대장 있음' },
  { key: 'estimate', label: '견적서 있음' },
] as const

export type HumanReadinessKey = (typeof HUMAN_READINESS_ITEMS)[number]['key']
export type SystemReadinessKey = (typeof SYSTEM_READINESS_ITEMS)[number]['key']
/** 첨부 슬롯. 집계에는 넣고 신청서 만들자는 막지 않는다. */
export type OptionalReadinessKey = 'idCard'
export type ReadinessKey = HumanReadinessKey | SystemReadinessKey | OptionalReadinessKey

export type WaterPublicReadinessChecks = Record<ReadinessKey, boolean>

export const ATTACHMENT_PILL_ITEMS = [
  { key: 'bankbook', label: '통장사본' },
  { key: 'idCard', label: '신분증' },
  { key: 'ledger', label: '대장' },
  { key: 'estimate', label: '견적' },
] as const satisfies ReadonlyArray<{ key: ReadinessKey; label: string }>

export const WRITE_PILL_ITEMS = [
  { key: 'owner', label: '대표자' },
  { key: 'phone', label: '전화' },
  { key: 'bank', label: '통장' },
  { key: 'meeting', label: '회의' },
  { key: 'applicationDate', label: '신청일' },
  { key: 'smsConsent', label: '문자' },
] as const satisfies ReadonlyArray<{ key: ReadinessKey; label: string }>

/** 준비 블록 필. 첨부 + 작성. 계산 키는 evaluateWaterPublicReadiness 와 같다. */
export const READINESS_PILL_ITEMS = [
  ...ATTACHMENT_PILL_ITEMS,
  ...WRITE_PILL_ITEMS,
] as const satisfies ReadonlyArray<{ key: ReadinessKey; label: string }>

export type AttachmentPillKey = (typeof ATTACHMENT_PILL_ITEMS)[number]['key']
export type WritePillKey = (typeof WRITE_PILL_ITEMS)[number]['key']
export type ReadinessPillKey = (typeof READINESS_PILL_ITEMS)[number]['key']

export function isAttachmentPillKey(key: string): key is AttachmentPillKey {
  return ATTACHMENT_PILL_ITEMS.some((item) => item.key === key)
}

/** 사람 칸 + 대장 + 견적. 신분증은 필·집계만 하고 신청서 만들자를 막지 않는다. */
export const APPLICATION_READY_KEYS: readonly ReadinessKey[] = [
  ...HUMAN_READINESS_ITEMS.map((item) => item.key),
  ...SYSTEM_READINESS_ITEMS.map((item) => item.key),
]

/** 사람 칸만. 목록 레거시 집계용. 시스템(대장/견적)은 세지 않는다. */
export function countEmptyHumanReadiness(checks: WaterPublicReadinessChecks): number {
  let empty = 0
  for (const item of HUMAN_READINESS_ITEMS) {
    if (!checks[item.key]) empty += 1
  }
  return empty
}

export type ReadinessSummary = {
  filled: number
  total: number
  remaining: number
  remainingLabels: string[]
}

/** 준비 블록·목록 「남 N」용. 필 칸(신분증 포함)만 센다. */
export function summarizeReadiness(checks: WaterPublicReadinessChecks): ReadinessSummary {
  let filled = 0
  const remainingLabels: string[] = []
  for (const item of READINESS_PILL_ITEMS) {
    if (checks[item.key]) filled += 1
    else remainingLabels.push(item.label)
  }
  return {
    filled,
    total: READINESS_PILL_ITEMS.length,
    remaining: remainingLabels.length,
    remainingLabels,
  }
}

export function countEmptyReadiness(checks: WaterPublicReadinessChecks): number {
  return summarizeReadiness(checks).remaining
}

/** 이전 필 9칸(신분증 제외). 준비 블록 「신청서 만들자」 점등. */
export function areRequiredPillsReady(checks: WaterPublicReadinessChecks): boolean {
  return READINESS_PILL_ITEMS.every((item) => item.key === 'idCard' || checks[item.key])
}

export function formatReadinessSummary(summary: ReadinessSummary): string {
  return `준비 ${summary.filled}/${summary.total} · 남음 ${summary.remaining}`
}

export function formatRemainingLine(labels: readonly string[]): string {
  if (labels.length === 0) return ''
  return `남은 것: ${labels.join(', ')}`
}

export type WaterPublicEvidence = {
  hasBankbookAttachment: boolean
  hasLedgerAttachment: boolean
  ledgerStatuses: readonly string[]
  hasEstimateRow: boolean
  hasLedgerDriveFile: boolean
  hasIdCardAttachment?: boolean
  hasEstimateAttachment?: boolean
  ledgerPreviewUrl?: string | null
}

export const EMPTY_WATER_PUBLIC_EVIDENCE: WaterPublicEvidence = {
  hasBankbookAttachment: false,
  hasIdCardAttachment: false,
  hasLedgerAttachment: false,
  ledgerStatuses: [],
  hasEstimateRow: false,
  hasEstimateAttachment: false,
  hasLedgerDriveFile: false,
  ledgerPreviewUrl: null,
}

/** 문의→…→입금. Live DB 값만 이름 그대로. 준공은 입금 뒤에만 UI에 붙인다. */
export const WATER_PUBLIC_STATUS_FLOW = [
  '문의',
  '실측',
  '견적전달',
  '동의서',
  '신청서제출',
  '승인',
  '공사',
  '입금',
] as const

export type WaterPublicStatusStep = (typeof WATER_PUBLIC_STATUS_FLOW)[number]

export const WATER_PUBLIC_JUNGGONG_LABEL = '준공'

/** Live status 값. 문의(예약)·취소는 흐름 밖(기존 문자열 유지). */
const DB_STATUS_TO_FLOW: Record<string, WaterPublicStatusStep> = {
  문의: '문의',
  실측: '실측',
  견적전달: '견적전달',
  동의서: '동의서',
  신청서제출: '신청서제출',
  승인: '승인',
  공사: '공사',
  입금: '입금',
}

export function isWaterPublicRow(input: {
  category?: string | null
  water_work_type?: string | null
}): boolean {
  if (input.category != null && input.category !== '수도') return false
  return input.water_work_type === WATER_PUBLIC_TYPE
}

export function isFilledText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

export function getExtraField(extraFields: unknown, key: string): unknown {
  if (!extraFields || typeof extraFields !== 'object' || Array.isArray(extraFields)) return undefined
  return (extraFields as Record<string, unknown>)[key]
}

/** 기존 sms_consent 키가 없어 extra_fields.sms_consent 만 본다. true / 'true' / 'Y' / '동의'. */
export function isSmsConsentGiven(extraFields: unknown): boolean {
  const value = getExtraField(extraFields, SMS_CONSENT_KEY)
  return value === true || value === 'true' || value === 'Y' || value === '동의'
}

export function isApplicationReadyFlagged(extraFields: unknown): boolean {
  return getExtraField(extraFields, APPLICATION_READY_KEY) === true
}

export function hasFilledPath(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

export function attachmentMarksBankbook(row: {
  file_type?: string | null
  name?: string | null
}): boolean {
  if (row.file_type === BANKBOOK_FILE_TYPE) return true
  const name = row.name ?? ''
  return BANKBOOK_NAME_MARKS.some((mark) => name.includes(mark))
}

export function attachmentMarksLedger(row: {
  file_type?: string | null
  name?: string | null
}): boolean {
  if (row.file_type === LEDGER_FILE_TYPE) return true
  return (row.name ?? '').includes(LEDGER_FILE_TYPE)
}

/** file_type='신분증사본'만. 이름 추정·백필 없음. */
export function attachmentMarksIdCard(row: { file_type?: string | null }): boolean {
  return row.file_type === ID_CARD_FILE_TYPE
}

/** file_type='견적서'만. 견적 번호·빈 행을 만들지 않는다. */
export function attachmentMarksEstimate(row: { file_type?: string | null }): boolean {
  return row.file_type === ESTIMATE_FILE_TYPE
}

export function hasLedgerEvidence(input: {
  ledgerStatuses?: readonly string[]
  hasLedgerAttachment?: boolean
  hasLedgerDriveFile?: boolean
}): boolean {
  const readyStatus = (input.ledgerStatuses ?? []).some(
    (status) => status === 'issued' || status === 'confirmed'
  )
  return readyStatus || input.hasLedgerAttachment === true || input.hasLedgerDriveFile === true
}

/** 견적서 있음 = estimates 행 또는 file_type='견적서' 첨부. 빈 견적을 만들지 않는다. */
export function hasEstimateEvidence(input: {
  hasEstimateRow?: boolean
  hasEstimateAttachment?: boolean
}): boolean {
  return input.hasEstimateRow === true || input.hasEstimateAttachment === true
}

export type WaterPublicReadinessInput = {
  owner_name?: string | null
  owner_phone?: string | null
  bank_name?: string | null
  account_number?: string | null
  account_holder?: string | null
  construction_date?: string | null
  construction_end_date?: string | null
  consent_date?: string | null
  consent_time?: string | null
  application_date?: string | null
  extra_fields?: unknown
  evidence?: WaterPublicEvidence
}

export function evaluateWaterPublicReadiness(
  input: WaterPublicReadinessInput
): WaterPublicReadinessChecks {
  const evidence = input.evidence ?? EMPTY_WATER_PUBLIC_EVIDENCE
  return {
    owner: isFilledText(input.owner_name),
    phone: isFilledText(input.owner_phone),
    bank:
      isFilledText(input.bank_name)
      && isFilledText(input.account_number)
      && isFilledText(input.account_holder),
    bankbook: evidence.hasBankbookAttachment,
    idCard: evidence.hasIdCardAttachment === true,
    constructionStart: isFilledText(input.construction_date),
    constructionEnd: isFilledText(input.construction_end_date),
    meeting: isFilledText(input.consent_date) && isFilledText(input.consent_time),
    applicationDate: isFilledText(input.application_date),
    smsConsent: isSmsConsentGiven(input.extra_fields),
    ledger: hasLedgerEvidence({
      ledgerStatuses: evidence.ledgerStatuses,
      hasLedgerAttachment: evidence.hasLedgerAttachment,
      hasLedgerDriveFile: evidence.hasLedgerDriveFile,
    }),
    estimate: hasEstimateEvidence({
      hasEstimateRow: evidence.hasEstimateRow,
      hasEstimateAttachment: evidence.hasEstimateAttachment,
    }),
  }
}

/** 사람 칸 + 대장 + 견적. 신분증은 켜짐을 막지 않는다. */
export function canLightApplicationReady(checks: WaterPublicReadinessChecks): boolean {
  return APPLICATION_READY_KEYS.every((key) => checks[key])
}

export function mapWaterPublicStatus(status: string | null | undefined): {
  flowIndex: number
  displayStep: string | null
  showJunggong: boolean
  inFlow: boolean
} {
  if (!status) {
    return { flowIndex: -1, displayStep: null, showJunggong: false, inFlow: false }
  }
  const displayStep = DB_STATUS_TO_FLOW[status]
  if (!displayStep) {
    return { flowIndex: -1, displayStep: status, showJunggong: false, inFlow: false }
  }
  return {
    flowIndex: WATER_PUBLIC_STATUS_FLOW.indexOf(displayStep),
    displayStep,
    showJunggong: status === '입금',
    inFlow: true,
  }
}

export function mergeExtraFields(
  current: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {}
  return { ...base, ...patch }
}

export function buildSmsConsentPatch(current: unknown, consented: boolean): Record<string, unknown> {
  return mergeExtraFields(current, { [SMS_CONSENT_KEY]: consented })
}

export function buildApplicationReadyPatch(
  current: unknown,
  atIso: string
): Record<string, unknown> {
  return mergeExtraFields(current, {
    [APPLICATION_READY_KEY]: true,
    [APPLICATION_READY_AT_KEY]: atIso,
  })
}

export function groupEvidence(input: {
  attachments?: { project_id: string; file_type: string | null; name?: string | null; file_path?: string | null; drive_url?: string | null }[] | null
  ledgerRequests?: { project_id: string; status: string | null; drive_file_url?: string | null }[] | null
  estimates?: { project_id: string }[] | null
  certTasks?: { project_id: string | null; status?: string | null; result_drive_file_url?: string | null }[] | null
}): Record<string, WaterPublicEvidence> {
  const byProject: Record<string, {
    hasBankbookAttachment: boolean
    hasIdCardAttachment: boolean
    hasLedgerAttachment: boolean
    ledgerStatuses: string[]
    hasEstimateRow: boolean
    hasEstimateAttachment: boolean
    hasLedgerDriveFile: boolean
    ledgerPreviewUrl: string | null
  }> = {}

  const bucket = (projectId: string) => {
    if (!byProject[projectId]) {
      byProject[projectId] = {
        hasBankbookAttachment: false,
        hasIdCardAttachment: false,
        hasLedgerAttachment: false,
        ledgerStatuses: [],
        hasEstimateRow: false,
        hasEstimateAttachment: false,
        hasLedgerDriveFile: false,
        ledgerPreviewUrl: null,
      }
    }
    return byProject[projectId]
  }

  const rememberLedgerUrl = (dest: { ledgerPreviewUrl: string | null }, url?: string | null) => {
    if (!dest.ledgerPreviewUrl && hasFilledPath(url)) dest.ledgerPreviewUrl = url as string
  }

  for (const row of input.attachments ?? []) {
    const hasFile = hasFilledPath(row.file_path) || hasFilledPath(row.drive_url)
    if (!hasFile) continue
    const dest = bucket(row.project_id)
    if (attachmentMarksBankbook(row)) dest.hasBankbookAttachment = true
    if (attachmentMarksIdCard(row)) dest.hasIdCardAttachment = true
    if (attachmentMarksEstimate(row)) dest.hasEstimateAttachment = true
    if (attachmentMarksLedger(row)) {
      dest.hasLedgerAttachment = true
      rememberLedgerUrl(dest, row.drive_url)
    }
  }
  for (const row of input.ledgerRequests ?? []) {
    if (row.status) bucket(row.project_id).ledgerStatuses.push(row.status)
    if (hasFilledPath(row.drive_file_url)) {
      const dest = bucket(row.project_id)
      dest.hasLedgerDriveFile = true
      rememberLedgerUrl(dest, row.drive_file_url)
    }
  }
  for (const row of input.estimates ?? []) {
    bucket(row.project_id).hasEstimateRow = true
  }
  for (const row of input.certTasks ?? []) {
    if (!row.project_id) continue
    if (row.status === 'done' && hasFilledPath(row.result_drive_file_url)) {
      const dest = bucket(row.project_id)
      dest.hasLedgerDriveFile = true
      rememberLedgerUrl(dest, row.result_drive_file_url)
    }
  }

  return byProject
}
