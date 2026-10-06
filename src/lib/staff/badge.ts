/**
 * 캘린더 일정 바에 올리는 담당자 배지 라벨.
 *
 * 일정 바는 가로 폭이 좁아 이름을 다 넣을 수 없다. 그래서 한 글자로 줄이되,
 * 여러 명이 붙은 일정은 "몇 명인지"가 한눈에 보여야 한다.
 *
 *   1명    →  태        (김태정)
 *   2명    →  태/덕     (김태정, 김덕민 — 두 사람임이 바로 보이게 /로 끊는다)
 *   3명 이상 → 태+2     (첫 사람 + 나머지 인원수)
 *
 * 전체 이름은 바의 title(마우스 올림)에서 따로 보여준다.
 */

/**
 * 이름에서 배지에 쓸 한 글자.
 *
 * 한글 이름은 성이 겹치는 경우가 많아(김·이·박) 성을 쓰면 구분이 안 된다.
 * 그래서 두 글자 이상이면 이름 첫 글자를 쓴다. 한 글자 이름은 그대로.
 */
export function staffInitial(name: string): string {
  return name.length >= 2 ? name.charAt(1) : name.charAt(0)
}

/** 담당자 목록 → 배지에 찍을 라벨. 비어 있으면 빈 문자열. */
export function staffBadgeLabel(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return staffInitial(names[0])
  if (names.length === 2) return `${staffInitial(names[0])}/${staffInitial(names[1])}`
  return `${staffInitial(names[0])}+${names.length - 1}`
}
