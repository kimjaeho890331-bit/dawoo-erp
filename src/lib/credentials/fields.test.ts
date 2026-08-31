import { describe, expect, it } from 'vitest'
import { CREDENTIAL_LIST_COLUMNS, omitPassword, parseCreateInput, parseUpdateInput } from './fields'

describe('parseCreateInput', () => {
  it('이름은 필수다', () => {
    expect(parseCreateInput({})).toEqual({ error: '사이트/서비스 이름을 입력해 주세요' })
    expect(parseCreateInput({ name: '   ' })).toEqual({ error: '사이트/서비스 이름을 입력해 주세요' })
  })

  it('빈 문자열은 null로 정리한다', () => {
    expect(parseCreateInput({
      name: ' 세움터 ',
      url: '  ',
      login_id: 'admin',
      password: 'secret',
      memo: '',
    })).toEqual({
      name: '세움터',
      url: null,
      login_id: 'admin',
      password: 'secret',
      memo: null,
    })
  })
})

describe('CREDENTIAL_LIST_COLUMNS', () => {
  it('목록 select에 password가 없다', () => {
    const cols = CREDENTIAL_LIST_COLUMNS.split(',').map((s) => s.trim())
    expect(cols).not.toContain('password')
    expect(cols).toEqual([
      'id',
      'kind',
      'name',
      'url',
      'login_id',
      'memo',
      'created_by',
      'updated_at',
    ])
  })
})

describe('omitPassword', () => {
  it('목록·단건 GET·저장 응답에서 비밀번호를 뺀다', () => {
    expect(omitPassword({
      id: '1',
      name: '세움터',
      password: 'secret-plain',
      memo: '현장',
    })).toEqual({
      id: '1',
      name: '세움터',
      memo: '현장',
    })
  })
})

describe('parseUpdateInput', () => {
  it('이름만 비우면 거절한다', () => {
    expect(parseUpdateInput({ name: '' })).toEqual({ error: '사이트/서비스 이름을 입력해 주세요' })
  })

  it('보낸 필드만 패치한다', () => {
    expect(parseUpdateInput({ memo: '현장 공용' })).toEqual({ memo: '현장 공용' })
    expect(parseUpdateInput({ url: '  ' })).toEqual({ url: null })
  })

  it('빈 비밀번호는 패치에서 빼서 기존 값을 유지한다', () => {
    expect(parseUpdateInput({ name: '세움터', password: '' })).toEqual({ name: '세움터' })
    expect(parseUpdateInput({ password: '   ' })).toEqual({})
    expect(parseUpdateInput({ password: 'new-secret' })).toEqual({ password: 'new-secret' })
  })
})
