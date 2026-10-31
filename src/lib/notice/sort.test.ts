import { describe, expect, it } from 'vitest'
import { noticeDate, sortNotices } from './sort'

const notice = (over: Partial<Parameters<typeof noticeDate>[0]> & { id?: string; pinned?: boolean }) => ({
  id: 'n',
  content: '본문',
  created_at: '2026-10-31T01:50:30.000+00:00',
  pinned: false,
  ...over,
})

describe('noticeDate', () => {
  it('본문 첫 줄의 업데이트 일시를 날짜로 쓴다', () => {
    expect(noticeDate(notice({ content: '업데이트 일시 : 2026. 09. 01.\n\n내용' }))).toBe('2026-09-01')
  })

  it('월·일이 한 자리여도 두 자리로 맞춘다', () => {
    expect(noticeDate(notice({ content: '업데이트 일시 : 2026. 9. 1.' }))).toBe('2026-09-01')
  })

  it('업데이트 일시가 없으면 등록일을 쓴다', () => {
    expect(noticeDate(notice({ content: '일반 공지입니다' }))).toBe('2026-10-31')
  })

  it('첫 줄이 아닌 곳의 날짜는 보지 않는다', () => {
    expect(noticeDate(notice({ content: '안내\n업데이트 일시 : 2026. 09. 01.' }))).toBe('2026-10-31')
  })

  it('없는 날짜를 적었으면 등록일을 쓴다', () => {
    expect(noticeDate(notice({ content: '업데이트 일시 : 2026. 13. 40.' }))).toBe('2026-10-31')
    expect(noticeDate(notice({ content: '업데이트 일시 : 2026. 02. 30.' }))).toBe('2026-10-31')
  })
})

describe('sortNotices', () => {
  const sep = notice({ id: 'sep', content: '업데이트 일시 : 2026. 09. 01.', created_at: '2026-11-01T00:00:00.000+00:00' })
  const oct = notice({ id: 'oct', content: '업데이트 일시 : 2026. 10. 30.', created_at: '2026-10-31T00:00:00.000+00:00' })
  const plain = notice({ id: 'plain', content: '일반 공지', created_at: '2026-10-05T00:00:00.000+00:00' })
  const ids = (list: { id: string }[]) => list.map(n => n.id)

  it('최신순은 등록 순서와 상관없이 업데이트 일시가 늦은 글이 위다', () => {
    expect(ids(sortNotices([sep, oct, plain], 'desc'))).toEqual(['oct', 'plain', 'sep'])
  })

  it('오래된순은 업데이트 일시가 이른 글이 위다', () => {
    expect(ids(sortNotices([oct, plain, sep], 'asc'))).toEqual(['sep', 'plain', 'oct'])
  })

  it('고정 글은 어느 방향이든 맨 위다', () => {
    const pinned = notice({ id: 'pin', pinned: true, content: '업데이트 일시 : 2026. 10. 01.' })
    expect(ids(sortNotices([sep, oct, pinned], 'desc'))).toEqual(['pin', 'oct', 'sep'])
    expect(ids(sortNotices([sep, oct, pinned], 'asc'))).toEqual(['pin', 'sep', 'oct'])
  })

  it('날짜가 같으면 먼저 등록한 글이 오래된 쪽이다', () => {
    const first = notice({ id: 'first', content: '업데이트 일시 : 2026. 10. 22.', created_at: '2026-10-31T01:00:00.000+00:00' })
    const second = notice({ id: 'second', content: '업데이트 일시 : 2026. 10. 22.', created_at: '2026-10-31T01:00:01.000+00:00' })
    expect(ids(sortNotices([first, second], 'desc'))).toEqual(['second', 'first'])
    expect(ids(sortNotices([second, first], 'asc'))).toEqual(['first', 'second'])
  })

  it('받은 목록을 건드리지 않는다', () => {
    const list = [sep, oct]
    sortNotices(list, 'desc')
    expect(ids(list)).toEqual(['sep', 'oct'])
  })
})
