import { describe, it, expect } from 'vitest'
import { safeStoragePath } from './storagePath'

describe('safeStoragePath', () => {
  // Supabase Storage는 키에 [A-Za-z0-9_/!-.*'() &$@=;:+,?] 밖의 문자가 있으면
  // 400 InvalidKey로 거부한다. 한글 파일명이 그대로 들어가면 첨부가 실패한다.
  it('한글 파일명을 밑줄로 치환한다', () => {
    expect(safeStoragePath('approval/1785472217053_발주목록.xlsx'))
      .toBe('approval/1785472217053_____.xlsx')
  })

  it('폴더 구분자와 확장자는 유지한다', () => {
    expect(safeStoragePath('attachments/abc-123/실측사진/1_a.png'))
      .toBe('attachments/abc-123/____/1_a.png')
  })

  it('ASCII 파일명은 그대로 둔다', () => {
    expect(safeStoragePath('approval/1785472217053_order-list.xlsx'))
      .toBe('approval/1785472217053_order-list.xlsx')
  })

  it('공백·괄호 등 성가신 문자도 밑줄로 바꾼다', () => {
    expect(safeStoragePath('approval/1_order list (final).pdf'))
      .toBe('approval/1_order_list__final_.pdf')
  })

  it('상위 경로 이동(..)을 제거해 지정한 폴더 밖으로 못 나가게 한다', () => {
    const result = safeStoragePath('approval/../../etc/passwd')
    expect(result).not.toContain('..')
    expect(result.startsWith('approval/')).toBe(true)
  })

  it('맨 앞 슬래시를 제거한다', () => {
    expect(safeStoragePath('/approval/a.pdf')).toBe('approval/a.pdf')
  })
})
