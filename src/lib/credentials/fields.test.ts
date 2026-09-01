import { describe, expect, it } from 'vitest'
import { CREDENTIAL_LIST_COLUMNS, omitPassword, parseCreateInput, parseUpdateInput } from './fields'
import { SHARED_MEMO_REJECT_ERROR } from './sharedMemo'

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

describe('공유 메모 비밀 숫자', () => {
  it('shared 생성 시 메모 비밀 줄을 거절하고 비밀번호로 옮기지 않는다', () => {
    const created = parseCreateInput({
      name: '세움터',
      memo: '이체 비번 1234',
    }, 'shared')
    expect(created).toEqual({ error: SHARED_MEMO_REJECT_ERROR })
    expect(created).not.toHaveProperty('password')
  })

  it('shared 수정 시 메모 비밀 줄을 거절한다', () => {
    expect(parseUpdateInput({ memo: 'OTP 567890' }, 'shared')).toEqual({
      error: SHARED_MEMO_REJECT_ERROR,
    })
  })

  it('shared 일반 메모는 저장한다', () => {
    expect(parseCreateInput({ name: '세움터', memo: '현장 공용, 만료 26년' }, 'shared')).toMatchObject({
      memo: '현장 공용, 만료 26년',
    })
    expect(parseUpdateInput({ memo: '현장 공용' }, 'shared')).toEqual({ memo: '현장 공용' })
  })

  it('private 메모는 거르지 않는다', () => {
    expect(parseCreateInput({ name: '중요', memo: '이체 비번 1234' }, 'private')).toMatchObject({
      memo: '이체 비번 1234',
    })
    expect(parseUpdateInput({ memo: 'OTP 567890' }, 'private')).toEqual({ memo: 'OTP 567890' })
  })
})
