/**
 * 결재선 설정 모달의 후보 목록 정렬 순서.
 *
 * 실제 결재 순서(expense_report_lines.seq)와는 무관하다 — 그건 사용자가 오른쪽
 * 패널에 추가한 순서로 정해진다. 여기는 "고르기 쉬운 순서"일 뿐이다.
 *
 * 직원 12명 규모라 이름 배열로 둔다. 화면에서 순서를 조정하고 싶어지면 그때
 * staff에 정렬 컬럼을 두는 게 맞지만 지금은 과하다.
 */
const PRIORITY = ['송승란', '조혜진', '김용이', '김재호', '김지선']

/** 지정 순서 먼저, 그 외는 이름순. 원본 배열은 건드리지 않는다. */
export function sortStaffForApprovalLine<T extends { name: string }>(staff: T[]): T[] {
  const rank = (name: string) => {
    const i = PRIORITY.indexOf(name)
    return i === -1 ? PRIORITY.length : i
  }
  return [...staff].sort((a, b) => {
    const d = rank(a.name) - rank(b.name)
    return d !== 0 ? d : a.name.localeCompare(b.name, 'ko')
  })
}
