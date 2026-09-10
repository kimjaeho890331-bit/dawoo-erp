/**
 * 퇴사자를 뺀 "지금 고를 수 있는 직원".
 *
 * 퇴사 여부는 staff.resign_date로 판단한다 — 날짜가 채워져 있으면 퇴사자다.
 *
 * 조회 단계에서 거르지 말고 반드시 "고르는 칸"을 그릴 때만 쓸 것.
 * 화면들이 같은 staffList로 선택지도 그리고 기존 기록의 이름도 찾는다
 * (연차 신청자, 캘린더 일정 담당자, 접수 담당자 …). 목록을 통째로 거르면
 * 퇴사한 사람이 남긴 옛 기록에서 이름이 빈칸으로 바뀐다.
 */
export interface StaffResignField {
  resign_date?: string | null
}

export function selectableStaff<T extends StaffResignField>(list: T[]): T[] {
  return list.filter(s => !s.resign_date)
}

/** 퇴사 처리 전에 보여줄 안내. 무엇이 남고 무엇이 사라지는지 미리 알린다. */
export const RESIGN_CONFIRM_MESSAGE =
  '기존 저장되어 있는 캘린더, 지출결의서, 접수대장 등은 삭제되지 않으며\n' +
  '연차관리, 이름 선택란, 결재선 설정 등에는 없어집니다.\n\n' +
  '퇴사자로 처리할까요?'
