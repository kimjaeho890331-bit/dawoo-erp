/**
 * 지출결의서 목록의 문서함.
 *
 * 카카오워크를 옮겨 올 때는 기안함·결재함·문서대장 세 묶음 8칸을 왼쪽에 따로 세웠는데,
 * 앱 메뉴 옆에 메뉴가 하나 더 생겨 화면이 좁아지고 어디를 눌러야 할지 헷갈렸다.
 * 이제는 위쪽 탭 셋 + 탭 안의 작은 칸으로 보여준다. 칸 key는 주소(?box=)에 그대로 남아
 * 예전 링크와 대시보드 바로가기가 계속 맞는다.
 *
 * "반려"는 내가 올린 문서 쪽에 둔다 — 되돌아온 문서를 고쳐 다시 올리는 사람은 작성자다.
 * 목록은 예전처럼 반려된 문서 중 내가 작성자이거나 결재선에 있는 것을 모두 보여준다.
 */
export type BoxKey =
  | 'draft' | 'submitted' | 'completed'
  | 'toApprove' | 'inProgress' | 'myRejected' | 'myCompleted'
  | 'ledger'

export interface BoxTab {
  key: string
  label: string
  items: { key: BoxKey; label: string }[]
}

export const BOX_TABS: BoxTab[] = [
  { key: 'approve', label: '결재할 문서', items: [
    { key: 'toApprove', label: '내 차례' },
    { key: 'inProgress', label: '다른 사람 차례' },
    { key: 'myCompleted', label: '완료' },
  ]},
  { key: 'mine', label: '내가 올린 문서', items: [
    { key: 'draft', label: '작성중' },
    { key: 'submitted', label: '결재중' },
    { key: 'myRejected', label: '반려' },
    { key: 'completed', label: '완료' },
  ]},
  { key: 'all', label: '전체 완료 문서', items: [
    { key: 'ledger', label: '전체' },
  ]},
]

export const BOX_META = BOX_TABS.flatMap(t => t.items.map(it => ({ ...it, tab: t })))

export const isBoxKey = (v: string | null): v is BoxKey => BOX_META.some(m => m.key === v)
