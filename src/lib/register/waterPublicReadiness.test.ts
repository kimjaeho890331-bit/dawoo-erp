import { describe, expect, it } from 'vitest'
import {
  buildApplicationReadyPatch,
  buildSmsConsentPatch,
  canLightApplicationReady,
  evaluateWaterPublicReadiness,
  groupEvidence,
  hasEstimateEvidence,
  hasLedgerEvidence,
  isApplicationReadyFlagged,
  isFilledText,
  isSmsConsentGiven,
  isWaterPublicRow,
  mapWaterPublicStatus,
  mergeExtraFields,
} from './waterPublicReadiness'

function allReadyOverrides() {
  return {
    owner_name: '김대표',
    owner_phone: '010-1111-2222',
    bank_name: '국민은행',
    account_number: '123-45-67890',
    account_holder: '김대표',
    construction_date: '2026-08-01',
    construction_end_date: '2026-08-10',
    consent_date: '2026-07-20',
    consent_time: '14:00',
    application_date: '2026-07-21',
    extra_fields: { sms_consent: true },
    evidence: {
      attachmentFileTypes: ['통장사본'],
      ledgerStatuses: ['confirmed'] as string[],
      hasEstimateRow: true,
      hasLedgerDriveFile: false,
    },
  }
}

describe('isWaterPublicRow', () => {
  it('수도 + water_work_type=공용만 준비도 대상이다', () => {
    expect(isWaterPublicRow({ category: '수도', water_work_type: '공용' })).toBe(true)
    expect(isWaterPublicRow({ water_work_type: '공용' })).toBe(true)
  })

  it('옥내·단독·null·junk·소규모는 숨긴다', () => {
    expect(isWaterPublicRow({ category: '수도', water_work_type: '옥내' })).toBe(false)
    expect(isWaterPublicRow({ category: '수도', water_work_type: '단독' })).toBe(false)
    expect(isWaterPublicRow({ category: '소규모', water_work_type: '공용' })).toBe(false)
    expect(isWaterPublicRow({ category: '수도', water_work_type: null })).toBe(false)
    expect(isWaterPublicRow({ category: '수도', water_work_type: '' })).toBe(false)
    expect(isWaterPublicRow({ category: '수도', water_work_type: '000' })).toBe(false)
  })
})

describe('filled field rules', () => {
  it('공백·null은 비어 있고, 글자가 있으면 채워진 것이다', () => {
    expect(isFilledText(null)).toBe(false)
    expect(isFilledText(undefined)).toBe(false)
    expect(isFilledText('')).toBe(false)
    expect(isFilledText('   ')).toBe(false)
    expect(isFilledText('박대표')).toBe(true)
  })

  it('은행 체크는 은행·계좌·예금주 세 칸이 모두 있어야 한다', () => {
    const base = allReadyOverrides()
    expect(evaluateWaterPublicReadiness({ ...base, bank_name: null }).bank).toBe(false)
    expect(evaluateWaterPublicReadiness({ ...base, account_number: '  ' }).bank).toBe(false)
    expect(evaluateWaterPublicReadiness({ ...base, account_holder: '' }).bank).toBe(false)
    expect(evaluateWaterPublicReadiness(base).bank).toBe(true)
  })

  it('회의 일시는 날짜와 시간이 둘 다 있어야 한다', () => {
    const base = allReadyOverrides()
    expect(evaluateWaterPublicReadiness({ ...base, consent_time: null }).meeting).toBe(false)
    expect(evaluateWaterPublicReadiness({ ...base, consent_date: null }).meeting).toBe(false)
    expect(evaluateWaterPublicReadiness(base).meeting).toBe(true)
  })

  it('문자 동의는 extra_fields.sms_consent 만 본다', () => {
    expect(isSmsConsentGiven(undefined)).toBe(false)
    expect(isSmsConsentGiven({})).toBe(false)
    expect(isSmsConsentGiven({ additional_cost: 1, remark: 'x' })).toBe(false)
    expect(isSmsConsentGiven({ sms_consent: false })).toBe(false)
    expect(isSmsConsentGiven({ sms_consent: 'yes' })).toBe(false)
    expect(isSmsConsentGiven({ sms_consent: true })).toBe(true)
    expect(isSmsConsentGiven({ sms_consent: 'true' })).toBe(true)
    expect(isSmsConsentGiven({ sms_consent: 'Y' })).toBe(true)
    expect(isSmsConsentGiven({ sms_consent: '동의' })).toBe(true)
  })

  it('통장사본은 attachments.file_type=통장사본이 있을 때만 체크된다', () => {
    const base = allReadyOverrides()
    expect(
      evaluateWaterPublicReadiness({
        ...base,
        evidence: { ...base.evidence, attachmentFileTypes: [] },
      }).bankbook
    ).toBe(false)
    expect(evaluateWaterPublicReadiness(base).bankbook).toBe(true)
  })
})

describe('system fields', () => {
  it('대장은 issued/confirmed, 건축물대장 첨부, 또는 Drive 링크가 있으면 있다', () => {
    expect(hasLedgerEvidence({ ledgerStatuses: ['requested'], fileTypes: [] })).toBe(false)
    expect(hasLedgerEvidence({ ledgerStatuses: ['issued'], fileTypes: [] })).toBe(true)
    expect(hasLedgerEvidence({ ledgerStatuses: ['confirmed'], fileTypes: [] })).toBe(true)
    expect(hasLedgerEvidence({ ledgerStatuses: [], fileTypes: ['건축물대장'] })).toBe(true)
    expect(hasLedgerEvidence({ ledgerStatuses: [], fileTypes: ['통장사본'] })).toBe(false)
    expect(hasLedgerEvidence({ hasLedgerDriveFile: true })).toBe(true)
    expect(hasLedgerEvidence({ hasLedgerDriveFile: false })).toBe(false)
  })

  it('견적은 estimates 행 또는 attachments.file_type=견적서만. documents 0행은 쓰지 않는다', () => {
    expect(hasEstimateEvidence({})).toBe(false)
    expect(hasEstimateEvidence({ hasEstimateRow: false, fileTypes: [] })).toBe(false)
    expect(hasEstimateEvidence({ hasEstimateRow: true })).toBe(true)
    expect(hasEstimateEvidence({ fileTypes: ['견적서'] })).toBe(true)
    expect(hasEstimateEvidence({ fileTypes: ['통장사본', '신청서'] })).toBe(false)
  })
})

describe('신청서 만들자', () => {
  it('사람 칸 + 대장 + 견적이 모두 있어야 켜진다', () => {
    const checks = evaluateWaterPublicReadiness(allReadyOverrides())
    expect(canLightApplicationReady(checks)).toBe(true)
  })

  it('하나라도 비면 켜지지 않는다', () => {
    const cases = [
      { owner_name: null },
      { owner_phone: '' },
      { bank_name: null },
      { construction_date: null },
      { construction_end_date: null },
      { consent_time: null },
      { application_date: null },
      { extra_fields: {} },
      {
        evidence: {
          attachmentFileTypes: [],
          ledgerStatuses: ['confirmed'],
          hasEstimateRow: true,
          hasLedgerDriveFile: false,
        },
      },
      {
        evidence: {
          attachmentFileTypes: ['통장사본'],
          ledgerStatuses: ['requested'],
          hasEstimateRow: true,
          hasLedgerDriveFile: false,
        },
      },
      {
        evidence: {
          attachmentFileTypes: ['통장사본'],
          ledgerStatuses: ['confirmed'],
          hasEstimateRow: false,
          hasLedgerDriveFile: false,
        },
      },
    ]

    for (const partial of cases) {
      const checks = evaluateWaterPublicReadiness({ ...allReadyOverrides(), ...partial })
      expect(canLightApplicationReady(checks)).toBe(false)
    }
  })

  it('플래그는 extra_fields.application_ready === true 일 때만 이미 신호된 것이다', () => {
    expect(isApplicationReadyFlagged({})).toBe(false)
    expect(isApplicationReadyFlagged({ application_ready: true })).toBe(true)
    expect(isApplicationReadyFlagged({ application_ready: 'true' })).toBe(false)
  })
})

describe('status flow mapping', () => {
  it('live DB 상태 문자열을 문의-실측-견적전달-동의서-신청서제출-승인-공사-입금에 그대로 쓴다', () => {
    expect(mapWaterPublicStatus('문의').displayStep).toBe('문의')
    expect(mapWaterPublicStatus('실측').flowIndex).toBe(1)
    expect(mapWaterPublicStatus('견적전달').displayStep).toBe('견적전달')
    expect(mapWaterPublicStatus('동의서').displayStep).toBe('동의서')
    expect(mapWaterPublicStatus('신청서제출').displayStep).toBe('신청서제출')
    expect(mapWaterPublicStatus('승인').displayStep).toBe('승인')
    expect(mapWaterPublicStatus('공사').displayStep).toBe('공사')
    expect(mapWaterPublicStatus('입금').displayStep).toBe('입금')
  })

  it('준공은 입금 이후에만 보이고, 빈 값·취소·예약은 흐름에 넣지 않는다', () => {
    expect(mapWaterPublicStatus('입금').showJunggong).toBe(true)
    expect(mapWaterPublicStatus('공사').showJunggong).toBe(false)
    expect(mapWaterPublicStatus(null).inFlow).toBe(false)
    expect(mapWaterPublicStatus('').inFlow).toBe(false)
    expect(mapWaterPublicStatus('취소').inFlow).toBe(false)
    expect(mapWaterPublicStatus('문의(예약)').inFlow).toBe(false)
    expect(mapWaterPublicStatus('취소').displayStep).toBe('취소')
    expect(mapWaterPublicStatus('문의(예약)').displayStep).toBe('문의(예약)')
    expect(mapWaterPublicStatus('준공').inFlow).toBe(false)
  })
})

describe('extra_fields merge', () => {
  it('sms_consent 와 application_ready 만 덧씌우고 기존 키는 남긴다', () => {
    expect(mergeExtraFields({ additional_cost: 1, remark: 'x' }, { sms_consent: true })).toEqual({
      additional_cost: 1,
      remark: 'x',
      sms_consent: true,
    })
    expect(buildSmsConsentPatch(null, true)).toEqual({ sms_consent: true })
    expect(buildSmsConsentPatch({ sms_consent: true }, false)).toEqual({ sms_consent: false })
    expect(buildApplicationReadyPatch({ sms_consent: true }, '2026-08-23T00:00:00.000Z')).toEqual({
      sms_consent: true,
      application_ready: true,
      application_ready_at: '2026-08-23T00:00:00.000Z',
    })
  })
})

describe('groupEvidence', () => {
  it('attachments 는 file_path 또는 drive_url 이 있을 때만 센다. documents 는 쓰지 않는다', () => {
    const grouped = groupEvidence({
      attachments: [
        { project_id: 'a', file_type: '통장사본', file_path: 'attachments/a/bankbook/1.jpg' },
        { project_id: 'a', file_type: '건축물대장', drive_url: 'https://drive.google.com/file/d/x' },
        { project_id: 'b', file_type: '통장사본', file_path: null, drive_url: null },
      ],
      ledgerRequests: [{ project_id: 'a', status: 'confirmed', drive_file_url: null }],
      estimates: [{ project_id: 'c' }],
      certTasks: [
        { project_id: 'd', status: 'done', result_drive_file_url: 'https://drive.google.com/file/d/y' },
        { project_id: 'e', status: 'pending', result_drive_file_url: null },
      ],
    })
    expect(grouped.a.attachmentFileTypes).toEqual(['통장사본', '건축물대장'])
    expect(grouped.a.ledgerStatuses).toEqual(['confirmed'])
    expect(grouped.a.hasEstimateRow).toBe(false)
    expect(grouped.b).toBeUndefined()
    expect(grouped.c.hasEstimateRow).toBe(true)
    expect(grouped.d.hasLedgerDriveFile).toBe(true)
    expect(grouped.e).toBeUndefined()
    expect(grouped.missing).toBeUndefined()
  })
})
