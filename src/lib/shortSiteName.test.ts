import { describe, expect, it } from 'vitest'
import { shortSiteName } from './shortSiteName'

describe('shortSiteName', () => {
  it('실제 진행 현장 이름을 짧게만 줄인다', () => {
    expect(shortSiteName('수원 정자1동 헹정복지센터 시설개선공사 (건축+기계)')).toBe('정자')
    expect(shortSiteName('아름학교 인방보수공사')).toBe('아름학교')
    expect(shortSiteName('매향여고 경천관 과학실 및 화장실 설비공사')).toBe('매향여고')
    expect(shortSiteName('경기도의회 사무처 의장실 냉난방기 설치공사')).toBe('경기도의회')
    expect(shortSiteName('상암오수펌프장 조세목제진기 철거 및 설치공사')).toBe('상암오수')
    expect(shortSiteName('연무초 지붕홈통 및 외부안전시설 개선공사')).toBe('연무초')
    expect(shortSiteName('영동중학교 교직원 휴게실 칸막이 공사')).toBe('영동중')
    expect(shortSiteName('한수중학교 옥상 방수공사')).toBe('한수중')
  })

  it('빈 값은 비워 두고 원문을 새로 만들지 않는다', () => {
    expect(shortSiteName('')).toBe('')
    expect(shortSiteName(null)).toBe('')
  })
})
