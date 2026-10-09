import type { LineRole } from '@/types/approval'

/**
 * 자주 쓰는 결재선을 한 번에 세우는 프리셋.
 *
 * 이름 배열로 둔다 — staff.id는 환경마다 다르고 화면에서 확인할 수 없어서,
 * 이름이 사람이 읽고 고칠 수 있는 유일한 키다. 이름이 바뀌거나 퇴사하면
 * 그 사람만 빠지고 나머지는 그대로 세워진다(missing으로 알려준다).
 *
 * 순서는 결재 순서 그대로다 — 배열 앞이 먼저 결재하고, 마지막이 최종 결재자다.
 * 전부 '결재' 역할로 만든다. 협조가 필요한 결재선은 프리셋으로 만들 만큼
 * 반복되지 않아 손으로 세운다.
 */
export interface LinePreset {
  label: string
  names: string[]
}

export const LINE_PRESETS: LinePreset[] = [
  { label: '송승란 → 조혜진', names: ['송승란', '조혜진'] },
]

export interface PresetLine {
  staff_id: string
  name: string
  role: LineRole
}

/**
 * 프리셋의 이름들을 실제 결재선으로 바꾼다.
 *
 * 직원 목록에 없는 이름은 건너뛰고 missing에 담아 돌려준다 — 조용히 빠뜨리면
 * 결재선이 한 명 모자란 채로 상신될 수 있다. 호출부가 사용자에게 알려야 한다.
 * 동명이인은 먼저 찾은 사람을 쓴다(직원 12명 규모에서 발생하지 않는다).
 */
export function presetToLines(
  preset: LinePreset,
  staff: { id: string; name: string }[],
): { lines: PresetLine[]; missing: string[] } {
  const lines: PresetLine[] = []
  const missing: string[] = []

  for (const name of preset.names) {
    const found = staff.find(s => s.name === name)
    if (found) lines.push({ staff_id: found.id, name: found.name, role: 'approval' })
    else missing.push(name)
  }

  return { lines, missing }
}

/**
 * 새 결의서를 열 때 미리 채워 둘 결재선. 첫 번째 프리셋을 쓴다.
 *
 * 거의 모든 결의서가 같은 결재선으로 올라가는데, 예전에는 매번 빈칸에서 시작해
 * 결재선 설정 창을 열고 프리셋을 눌러야 했다.
 *
 * 그대로 올릴 수 없는 결재선은 채우지 않는다 — 작성자가 프리셋 안에 있거나
 * (본인은 결재자가 될 수 없다) 프리셋의 누군가를 직원 목록에서 못 찾으면 빈 결재선을
 * 돌려준다. 한 명 빠진 결재선이 기본값으로 깔리면 모르고 올리게 된다.
 */
export function defaultLines(
  staff: { id: string; name: string }[],
  drafterStaffId: string,
): PresetLine[] {
  const preset = LINE_PRESETS[0]
  if (!preset) return []
  const { lines, missing } = presetToLines(preset, staff)
  if (missing.length > 0) return []
  if (lines.some(l => l.staff_id === drafterStaffId)) return []
  return lines
}
