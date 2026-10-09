import { describe, expect, it } from 'vitest'
import { fetchAllPages, fetchAllPagesResult } from './fetchAllPages'

const source = (n: number) => Array.from({ length: n }, (_, i) => i)

function pager(rows: number[], calls: [number, number][] = []) {
  return (from: number, to: number) => {
    calls.push([from, to])
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
  }
}

describe('fetchAllPages', () => {
  it('한 페이지보다 적으면 한 번만 읽는다', async () => {
    const calls: [number, number][] = []
    expect(await fetchAllPages(pager(source(3), calls), 5)).toEqual([0, 1, 2])
    expect(calls).toEqual([[0, 4]])
  })

  it('여러 페이지를 이어 붙인다', async () => {
    const calls: [number, number][] = []
    expect(await fetchAllPages(pager(source(12), calls), 5)).toEqual(source(12))
    expect(calls).toEqual([[0, 4], [5, 9], [10, 14]])
  })

  it('딱 맞게 끝나면 빈 페이지를 한 번 더 확인하고 멈춘다', async () => {
    const calls: [number, number][] = []
    expect(await fetchAllPages(pager(source(10), calls), 5)).toEqual(source(10))
    expect(calls.length).toBe(3)
  })

  it('기본은 1000줄씩 — 1000건 넘는 표도 잘리지 않는다', async () => {
    expect((await fetchAllPages(pager(source(2345)))).length).toBe(2345)
  })

  it('오류가 나면 던진다 (반쯤 읽은 목록을 보여 주지 않는다)', async () => {
    const page = (from: number) =>
      Promise.resolve(from === 0 ? { data: source(5), error: null } : { data: null, error: new Error('x') })
    await expect(fetchAllPages(page, 5)).rejects.toThrow('x')
  })

  it('data가 null이면 빈 목록', async () => {
    expect(await fetchAllPages(() => Promise.resolve({ data: null, error: null }))).toEqual([])
  })
})

describe('fetchAllPagesResult', () => {
  it('성공은 { data, error: null }', async () => {
    expect(await fetchAllPagesResult(pager(source(3)))).toEqual({ data: [0, 1, 2], error: null })
  })
  it('실패는 { data: null, error }', async () => {
    const err = new Error('x')
    expect(await fetchAllPagesResult(() => Promise.resolve({ data: null, error: err }))).toEqual({ data: null, error: err })
  })
})
