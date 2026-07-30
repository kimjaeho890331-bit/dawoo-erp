import { describe, it, expect } from 'vitest'
import { parseBankInfo } from './vendorBank'

describe('parseBankInfo', () => {
  it('슬래시 3분할(은행/계좌/예금주)에서 은행과 계좌만 뽑는다', () => {
    expect(parseBankInfo('국민은행/264401-04-370029/기원건설'))
      .toEqual({ bank: '국민은행', account: '264401-04-370029' })
  })

  it('슬래시 앞뒤 공백이 있어도 trim해서 뽑는다', () => {
    expect(parseBankInfo('기업은행/276-095008-04-011 / 두인건설'))
      .toEqual({ bank: '기업은행', account: '276-095008-04-011' })
  })

  it('예금주 없이 은행/계좌 2분할도 처리한다', () => {
    expect(parseBankInfo('국민은행/214901-04-354688/미가건축'))
      .toEqual({ bank: '국민은행', account: '214901-04-354688' })
  })

  it('국민은행/606037-01-004643/노나 형태를 처리한다', () => {
    expect(parseBankInfo('국민은행/606037-01-004643/노나'))
      .toEqual({ bank: '국민은행', account: '606037-01-004643' })
  })

  it('슬래시가 없으면 첫 공백 기준으로 은행/계좌를 나눈다', () => {
    expect(parseBankInfo('우리은행 1002-279-699247'))
      .toEqual({ bank: '우리은행', account: '1002-279-699247' })
  })

  it('빈 문자열은 null', () => {
    expect(parseBankInfo('')).toBeNull()
  })

  it('null은 null', () => {
    expect(parseBankInfo(null)).toBeNull()
  })

  it('undefined는 null', () => {
    expect(parseBankInfo(undefined)).toBeNull()
  })

  it('계좌 없이 은행명만 있으면 null (반쪽짜리로 채우지 않는다)', () => {
    expect(parseBankInfo('국민은행')).toBeNull()
  })

  it('슬래시만 있고 내용이 없으면 null', () => {
    expect(parseBankInfo('//')).toBeNull()
  })

  it('공백만 있는 문자열은 null', () => {
    expect(parseBankInfo('   ')).toBeNull()
  })
})
