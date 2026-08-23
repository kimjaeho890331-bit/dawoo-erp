/**
 * 수도 공용 접수대장 행 준비도 (신청서 만들자 신호).
 *
 * Live (etwpcaedbuubjzbfrjli): documents=0, estimates=0.
 * 파일은 attachments 행(file_path → storage bucket `documents`, drive_url)으로 붙는다.
 * FileDropZone file_type 실데이터: 통장사본 / 동의서 / 신청서. 견적서·건축물대장 첨부 행은 아직 없음.
 * 대장은 building_ledger_requests(issued|confirmed, drive_file_url)와
 * cowork_tasks.issue_certificate done + result_drive_file_url.
 * extra_fields 실키는 additional_cost / remark 뿐. sms_consent 없음 → 여기에만 둔다.
 *
 * 사람 입력 재사용: owner_name, owner_phone, bank_name+account_number+account_holder,
 * construction_date, construction_end_date, consent_date+consent_time, application_date
 */

export const WATER_PUBLIC_TYPE = '공용'

export const BANKBOOK_FILE_TYPE = '통장사본'
export const LEDGER_FILE_TYPE = '건축물대장'
export const ESTIMATE_FILE_TYPE = '견적서'
export const CERT_TASK_TYPE = 'issue_certificate'

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
export type ReadinessKey = HumanReadinessKey | SystemReadinessKey

export type WaterPublicReadinessChecks = Record<ReadinessKey, boolean>

export type WaterPublicEvidence = {
  attachmentFileTypes: readonly string[]
  ledgerStatuses: readonly string[]
  hasEstimateRow: boolean
  hasLedgerDriveFile: boolean
}

export const EMPTY_WATER_PUBLIC_EVIDENCE: WaterPublicEvidence = {
  attachmentFileTypes: [],
  ledgerStatuses: [],
  hasEstimateRow: false,
  hasLedgerDriveFile: false,
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

export function hasBankbookFile(fileTypes: readonly string[]): boolean {
  return fileTypes.includes(BANKBOOK_FILE_TYPE)
}

export function hasFilledPath(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

export function hasLedgerEvidence(input: {
  ledgerStatuses?: readonly string[]
  fileTypes?: readonly string[]
  hasLedgerDriveFile?: boolean
}): boolean {
  const readyStatus = (input.ledgerStatuses ?? []).some(
    (status) => status === 'issued' || status === 'confirmed'
  )
  const readyFile = (input.fileTypes ?? []).includes(LEDGER_FILE_TYPE)
  return readyStatus || readyFile || input.hasLedgerDriveFile === true
}

/** documents 테이블은 live 0행. 견적은 estimates 행 또는 attachments.file_type=견적서만. */
export function hasEstimateEvidence(input: {
  hasEstimateRow?: boolean
  fileTypes?: readonly string[]
}): boolean {
  if (input.hasEstimateRow) return true
  if ((input.fileTypes ?? []).includes(ESTIMATE_FILE_TYPE)) return true
  return false
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
    bankbook: hasBankbookFile(evidence.attachmentFileTypes),
    constructionStart: isFilledText(input.construction_date),
    constructionEnd: isFilledText(input.construction_end_date),
    meeting: isFilledText(input.consent_date) && isFilledText(input.consent_time),
    applicationDate: isFilledText(input.application_date),
    smsConsent: isSmsConsentGiven(input.extra_fields),
    ledger: hasLedgerEvidence({
      ledgerStatuses: evidence.ledgerStatuses,
      fileTypes: evidence.attachmentFileTypes,
      hasLedgerDriveFile: evidence.hasLedgerDriveFile,
    }),
    estimate: hasEstimateEvidence({
      hasEstimateRow: evidence.hasEstimateRow,
      fileTypes: evidence.attachmentFileTypes,
    }),
  }
}

/** 사람 칸 + 대장 + 견적이 모두 있어야 「신청서 만들자」가 켜진다. */
export function canLightApplicationReady(checks: WaterPublicReadinessChecks): boolean {
  return (Object.values(checks) as boolean[]).every(Boolean)
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
  attachments?: { project_id: string; file_type: string | null; file_path?: string | null; drive_url?: string | null }[] | null
  ledgerRequests?: { project_id: string; status: string | null; drive_file_url?: string | null }[] | null
  estimates?: { project_id: string }[] | null
  certTasks?: { project_id: string | null; status?: string | null; result_drive_file_url?: string | null }[] | null
}): Record<string, WaterPublicEvidence> {
  const byProject: Record<string, {
    attachmentFileTypes: string[]
    ledgerStatuses: string[]
    hasEstimateRow: boolean
    hasLedgerDriveFile: boolean
  }> = {}

  const bucket = (projectId: string) => {
    if (!byProject[projectId]) {
      byProject[projectId] = {
        attachmentFileTypes: [],
        ledgerStatuses: [],
        hasEstimateRow: false,
        hasLedgerDriveFile: false,
      }
    }
    return byProject[projectId]
  }

  for (const row of input.attachments ?? []) {
    const hasFile = hasFilledPath(row.file_path) || hasFilledPath(row.drive_url)
    if (row.file_type && hasFile) bucket(row.project_id).attachmentFileTypes.push(row.file_type)
  }
  for (const row of input.ledgerRequests ?? []) {
    if (row.status) bucket(row.project_id).ledgerStatuses.push(row.status)
    if (hasFilledPath(row.drive_file_url)) bucket(row.project_id).hasLedgerDriveFile = true
  }
  for (const row of input.estimates ?? []) {
    bucket(row.project_id).hasEstimateRow = true
  }
  for (const row of input.certTasks ?? []) {
    if (!row.project_id) continue
    if (row.status === 'done' && hasFilledPath(row.result_drive_file_url)) {
      bucket(row.project_id).hasLedgerDriveFile = true
    }
  }

  return byProject
}
