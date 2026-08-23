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
      attachmentFileTypes: ['통장사본', '건축물대장'],
      ledgerStatuses: ['issued'] as string[],
      hasEstimateRow: true,
      documentDocTypes: [] as string[],
    },
  }
}

describe('isWaterPublicRow', () => {
  it('수도 + 공용만 준비도 대상이다', () => {
    expect(isWaterPublicRow({ category: '수도', water_work_type: '공용' })).toBe(true)
    expect(isWaterPublicRow({ water_work_type: '공용' })).toBe(true)
  })

  it('옥내·단독·소규모·빈 종류는 숨긴다', () => {
    expect(isWaterPublicRow({ category: '수도', water_work_type: '옥내' })).toBe(false)
    expect(isWaterPublicRow({ category: '수도', water_work_type: '단독' })).toBe(false)
    expect(isWaterPublicRow({ category: '소규모', water_work_type: '공용' })).toBe(false)
    expect(isWaterPublicRow({ category: '수도', water_work_type: null })).toBe(false)
    expect(isWaterPublicRow({ category: '수도', water_work_type: '' })).toBe(false)
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
        evidence: { ...base.evidence, attachmentFileTypes: ['건축물대장'] },
      }).bankbook
    ).toBe(false)
    expect(evaluateWaterPublicReadiness(base).bankbook).toBe(true)
  })
})

describe('system fields', () => {
  it('대장은 issued/confirmed 또는 건축물대장 첨부가 있으면 있다', () => {
    expect(hasLedgerEvidence({ ledgerStatuses: ['requested'], fileTypes: [] })).toBe(false)
    expect(hasLedgerEvidence({ ledgerStatuses: ['issued'], fileTypes: [] })).toBe(true)
    expect(hasLedgerEvidence({ ledgerStatuses: ['confirmed'], fileTypes: [] })).toBe(true)
    expect(hasLedgerEvidence({ ledgerStatuses: [], fileTypes: ['건축물대장'] })).toBe(true)
    expect(hasLedgerEvidence({ ledgerStatuses: [], fileTypes: ['통장사본'] })).toBe(false)
  })

  it('견적은 estimates 행 또는 견적서 첨부/서류가 있을 때만 있다. 추측 채움 없음', () => {
    expect(hasEstimateEvidence({})).toBe(false)
    expect(hasEstimateEvidence({ hasEstimateRow: false, fileTypes: [], docTypes: [] })).toBe(false)
    expect(hasEstimateEvidence({ hasEstimateRow: true })).toBe(true)
    expect(hasEstimateEvidence({ fileTypes: ['견적서'] })).toBe(true)
    expect(hasEstimateEvidence({ docTypes: ['견적서'] })).toBe(true)
    expect(hasEstimateEvidence({ fileTypes: ['통장사본'], docTypes: ['신청서'] })).toBe(false)
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
          attachmentFileTypes: ['건축물대장'],
          ledgerStatuses: ['issued'],
          hasEstimateRow: true,
          documentDocTypes: [],
        },
      },
      {
        evidence: {
          attachmentFileTypes: ['통장사본'],
          ledgerStatuses: ['requested'],
          hasEstimateRow: true,
          documentDocTypes: [],
        },
      },
      {
        evidence: {
          attachmentFileTypes: ['통장사본', '건축물대장'],
          ledgerStatuses: ['issued'],
          hasEstimateRow: false,
          documentDocTypes: [],
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
  it('기존 DB 상태를 문의-실측-견적전달-동의서-신청서제출-승인-공사-입금에 접는다', () => {
    expect(mapWaterPublicStatus('문의').displayStep).toBe('문의')
    expect(mapWaterPublicStatus('실측').flowIndex).toBe(1)
    expect(mapWaterPublicStatus('견적전달').displayStep).toBe('견적전달')
    expect(mapWaterPublicStatus('동의서').displayStep).toBe('동의서')
    expect(mapWaterPublicStatus('신청서제출').displayStep).toBe('신청서제출')
    expect(mapWaterPublicStatus('승인').displayStep).toBe('승인')
    expect(mapWaterPublicStatus('착공계').displayStep).toBe('공사')
    expect(mapWaterPublicStatus('공사').displayStep).toBe('공사')
    expect(mapWaterPublicStatus('완료서류제출').displayStep).toBe('공사')
    expect(mapWaterPublicStatus('입금').displayStep).toBe('입금')
  })

  it('준공은 입금 이후에만 보이고, 빈 값·취소·예약은 흐름에 넣지 않는다', () => {
    expect(mapWaterPublicStatus('입금').showJunggong).toBe(true)
    expect(mapWaterPublicStatus('공사').showJunggong).toBe(false)
    expect(mapWaterPublicStatus('완료서류제출').showJunggong).toBe(false)
    expect(mapWaterPublicStatus(null).inFlow).toBe(false)
    expect(mapWaterPublicStatus('').inFlow).toBe(false)
    expect(mapWaterPublicStatus('취소').inFlow).toBe(false)
    expect(mapWaterPublicStatus('문의(예약)').inFlow).toBe(false)
    expect(mapWaterPublicStatus('취소').displayStep).toBe('취소')
  })
})

describe('extra_fields merge', () => {
  it('sms_consent 와 application_ready 만 덧씌우고 기존 키는 남긴다', () => {
    expect(mergeExtraFields({ keep: 1 }, { sms_consent: true })).toEqual({
      keep: 1,
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
  it('프로젝트별로 첨부·대장·견적 증거를 모은다. 없는 프로젝트는 만들지 않는다', () => {
    const grouped = groupEvidence({
      attachments: [
        { project_id: 'a', file_type: '통장사본' },
        { project_id: 'a', file_type: '건축물대장' },
        { project_id: 'b', file_type: null },
      ],
      ledgerRequests: [{ project_id: 'a', status: 'issued' }],
      estimates: [{ project_id: 'c' }],
      documents: [{ project_id: 'c', doc_type: '견적서' }],
    })
    expect(grouped.a.attachmentFileTypes).toEqual(['통장사본', '건축물대장'])
    expect(grouped.a.ledgerStatuses).toEqual(['issued'])
    expect(grouped.a.hasEstimateRow).toBe(false)
    expect(grouped.c.hasEstimateRow).toBe(true)
    expect(grouped.c.documentDocTypes).toEqual(['견적서'])
    expect(grouped.missing).toBeUndefined()
  })
})
