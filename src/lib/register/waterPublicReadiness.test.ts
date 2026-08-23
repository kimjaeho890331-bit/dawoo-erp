import { describe, expect, it } from 'vitest'
import {
  attachmentMarksBankbook,
  attachmentMarksLedger,
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
      hasBankbookAttachment: true,
      hasLedgerAttachment: false,
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
})

describe('attachment marks', () => {
  it('통장사본은 live file_type=통장사본 또는 이름 표시(통장사본/통장 사본/통장계좌)만 본다', () => {
    expect(attachmentMarksBankbook({ file_type: '통장사본', name: 'x.jpg' })).toBe(true)
    expect(attachmentMarksBankbook({ file_type: '신청서', name: '※ 원주빌라 7동 통장사본.jpg' })).toBe(true)
    expect(attachmentMarksBankbook({ file_type: '통장사본', name: '광일빌라 통장 사본.jpg' })).toBe(true)
    expect(attachmentMarksBankbook({ file_type: null, name: '화성파크타운 통장계좌.jpg' })).toBe(true)
    expect(attachmentMarksBankbook({ file_type: '동의서', name: '02. 경동빌라 동의서.pdf' })).toBe(false)
    expect(attachmentMarksBankbook({ file_type: '신청서', name: '신청서.pdf' })).toBe(false)
  })

  it('대장은 file_type/name 이 건축물대장으로 이미 표시된 경우만. 새 타입을 만들지 않는다', () => {
    expect(attachmentMarksLedger({ file_type: '건축물대장', name: 'x.pdf' })).toBe(true)
    expect(attachmentMarksLedger({ file_type: '통장사본', name: '빌라_건축물대장.pdf' })).toBe(true)
    expect(attachmentMarksLedger({ file_type: '통장사본', name: '통장사본.jpg' })).toBe(false)
    expect(attachmentMarksLedger({ file_type: '동의서', name: '동의서.pdf' })).toBe(false)
  })
})

describe('system fields', () => {
  it('대장은 issued/confirmed 또는 이미 표시된 대장 첨부/Drive', () => {
    expect(hasLedgerEvidence({ ledgerStatuses: ['requested'] })).toBe(false)
    expect(hasLedgerEvidence({ ledgerStatuses: ['issued'] })).toBe(true)
    expect(hasLedgerEvidence({ ledgerStatuses: ['confirmed'] })).toBe(true)
    expect(hasLedgerEvidence({ hasLedgerAttachment: true })).toBe(true)
    expect(hasLedgerEvidence({ hasLedgerDriveFile: true })).toBe(true)
    expect(hasLedgerEvidence({ hasLedgerAttachment: false, hasLedgerDriveFile: false })).toBe(false)
  })

  it('견적서 있음은 estimates 행 존재만. 빈 견적을 채우지 않는다', () => {
    expect(hasEstimateEvidence({})).toBe(false)
    expect(hasEstimateEvidence({ hasEstimateRow: false })).toBe(false)
    expect(hasEstimateEvidence({ hasEstimateRow: true })).toBe(true)
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
          hasBankbookAttachment: false,
          hasLedgerAttachment: false,
          ledgerStatuses: ['confirmed'],
          hasEstimateRow: true,
          hasLedgerDriveFile: false,
        },
      },
      {
        evidence: {
          hasBankbookAttachment: true,
          hasLedgerAttachment: false,
          ledgerStatuses: ['requested'],
          hasEstimateRow: true,
          hasLedgerDriveFile: false,
        },
      },
      {
        evidence: {
          hasBankbookAttachment: true,
          hasLedgerAttachment: false,
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

  it('준공은 입금 이후에만 보이고, DB에 준공 값은 없다', () => {
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
  it('이름에 통장사본이 있으면 file_type=신청서여도 통장으로 센다. 견적은 행 존재만', () => {
    const grouped = groupEvidence({
      attachments: [
        { project_id: 'a', file_type: '신청서', name: '※ 원주빌라 7동 통장사본.jpg', file_path: 'attachments/a/application/1.jpg' },
        { project_id: 'a', file_type: '동의서', name: '02. 동의서.pdf', file_path: 'attachments/a/consent/1.pdf' },
        { project_id: 'b', file_type: '통장사본', name: '통장사본.jpg', file_path: null, drive_url: null },
      ],
      ledgerRequests: [{ project_id: 'a', status: 'confirmed', drive_file_url: null }],
      estimates: [{ project_id: 'c' }],
    })
    expect(grouped.a.hasBankbookAttachment).toBe(true)
    expect(grouped.a.hasLedgerAttachment).toBe(false)
    expect(grouped.a.ledgerStatuses).toEqual(['confirmed'])
    expect(grouped.a.hasEstimateRow).toBe(false)
    expect(grouped.b).toBeUndefined()
    expect(grouped.c.hasEstimateRow).toBe(true)
    expect(grouped.c.hasBankbookAttachment).toBe(false)
  })
})
