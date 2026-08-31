import { describe, expect, it } from 'vitest'
import {
  collapseDisplayWhitespace,
  credentialMatchesSearch,
  displayCredentialUrl,
  filterCredentials,
  hrefForCredentialUrl,
  normalizeSearchQuery,
  usesMonoIdFont,
} from './display'

describe('collapseDisplayWhitespace', () => {
  it('개행과 연속 공백을 한 칸으로 줄인다', () => {
    expect(collapseDisplayWhitespace('세움터\n현장  공용')).toBe('세움터 현장 공용')
    expect(collapseDisplayWhitespace('  다우  \t 건설  ')).toBe('다우 건설')
    expect(collapseDisplayWhitespace('한줄')).toBe('한줄')
  })
})

describe('usesMonoIdFont', () => {
  it('ASCII 아이디는 mono를 쓴다', () => {
    expect(usesMonoIdFont('admin')).toBe(true)
    expect(usesMonoIdFont('user-01')).toBe(true)
    expect(usesMonoIdFont('ABCxyz123')).toBe(true)
    expect(usesMonoIdFont('p@ss_w0rd!')).toBe(true)
  })

  it('한글이나 비-ASCII 문자가 있으면 본문 폰트를 쓴다', () => {
    expect(usesMonoIdFont('김재호')).toBe(false)
    expect(usesMonoIdFont('다우건설')).toBe(false)
    expect(usesMonoIdFont('admin김')).toBe(false)
    expect(usesMonoIdFont('관리자01')).toBe(false)
    expect(usesMonoIdFont('café')).toBe(false)
  })

  it('빈 값은 mono가 아니다', () => {
    expect(usesMonoIdFont('')).toBe(false)
  })
})

describe('credentialMatchesSearch / filterCredentials', () => {
  const rows = [
    { name: '세움터\n현장', login_id: 'admin' },
    { name: '위택스', login_id: 'dawoo-01' },
    { name: '한글아이디', login_id: '김재호' },
  ]

  it('이름과 아이디를 모두 본다', () => {
    expect(credentialMatchesSearch(rows[0], '세움')).toBe(true)
    expect(credentialMatchesSearch(rows[0], 'admin')).toBe(true)
    expect(credentialMatchesSearch(rows[1], '위택')).toBe(true)
    expect(credentialMatchesSearch(rows[2], '김재')).toBe(true)
    expect(credentialMatchesSearch(rows[1], '세움')).toBe(false)
  })

  it('이름 공백을 접어서 검색한다', () => {
    expect(credentialMatchesSearch(rows[0], '세움터 현장')).toBe(true)
    expect(credentialMatchesSearch(rows[0], '  세움터   현장  ')).toBe(true)
  })

  it('빈 검색어는 전부 통과한다', () => {
    expect(filterCredentials(rows, '')).toHaveLength(3)
    expect(filterCredentials(rows, '   ')).toHaveLength(3)
    expect(normalizeSearchQuery('  위택스  ')).toBe('위택스')
  })

  it('대소문자를 구분하지 않는다', () => {
    expect(credentialMatchesSearch(rows[0], 'ADMIN')).toBe(true)
    expect(filterCredentials(rows, 'DAWOO')).toEqual([rows[1]])
  })
})

describe('credential url helpers', () => {
  it('표시는 프로토콜을 뺀다', () => {
    expect(displayCredentialUrl('https://www.seumteo.go.kr')).toBe('www.seumteo.go.kr')
    expect(displayCredentialUrl('http://example.com/path')).toBe('example.com/path')
  })

  it('링크는 http가 없으면 https를 붙인다', () => {
    expect(hrefForCredentialUrl('www.seumteo.go.kr')).toBe('https://www.seumteo.go.kr')
    expect(hrefForCredentialUrl('https://www.seumteo.go.kr')).toBe('https://www.seumteo.go.kr')
  })
})
