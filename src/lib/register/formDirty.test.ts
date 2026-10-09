import { describe, expect, it } from 'vitest'
import { hasUnsavedInput } from './formDirty'

describe('hasUnsavedInput', () => {
  const baseline = { building_name: '', note: '', staff_id: 'staff-1' }

  it('기본값 그대로면 입력 없음', () => {
    expect(hasUnsavedInput({ ...baseline }, baseline)).toBe(false)
  })

  it('한 칸이라도 바뀌면 입력 있음', () => {
    expect(hasUnsavedInput({ ...baseline, note: '옥상 누수' }, baseline)).toBe(true)
    expect(hasUnsavedInput({ ...baseline, staff_id: 'staff-2' }, baseline)).toBe(true)
  })

  it('수정 창에서 기존 값을 지워도 입력 있음', () => {
    const edit = { building_name: '행복빌라', note: '방수' }
    expect(hasUnsavedInput({ building_name: '', note: '방수' }, edit)).toBe(true)
  })

  it('앞뒤 공백만 친 것은 입력으로 보지 않는다', () => {
    expect(hasUnsavedInput({ ...baseline, note: '   ' }, baseline)).toBe(false)
  })

  it('기준에 없는 칸(주소 검색어 등)은 빈 값과 비교한다', () => {
    expect(hasUnsavedInput({ ...baseline, address_keyword: '' }, baseline)).toBe(false)
    expect(hasUnsavedInput({ ...baseline, address_keyword: '효원로' }, baseline)).toBe(true)
  })
})
