/**
 * 왼쪽 메뉴 정의 — 사이드바와 모바일 대시보드 즐겨찾기가 함께 쓴다.
 *
 * 즐겨찾기는 경로만 저장하고 이름·아이콘은 여기서 찾아 쓴다.
 * 정의가 두 벌이면 메뉴 이름을 바꿨을 때 한쪽만 바뀌어 어긋난다.
 */
import {
  PRIVATE_IDS_MENU,
  PRIVATE_IDS_PATH,
  SHARED_IDS_MENU,
  SHARED_IDS_PATH,
} from '@/lib/credentialAccess'

export interface MenuItem {
  name: string
  path: string
  icon: string
}

export interface MenuGroup {
  name: string
  hideHeading?: boolean
  items: MenuItem[]
}

export const MENU_GROUPS: {
  name: string
  hideHeading?: boolean
  items: { name: string; path: string; icon: string }[]
}[] = [
  {
    name: '지원사업',
    items: [
      { name: '소규모 접수대장', path: '/register/small', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { name: '수도공사 접수대장', path: '/register/water', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { name: '건축물대장 발급', path: '/register/building-ledger', icon: 'M3 21h18M9 8h1m-1 4h1m-1 4h1m4-8h1m-1 4h1m-1 4h1M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16' }, // UI_HIDDEN.buildingLedger===false 이면 이 메뉴가 보인다
    ]
  },
  {
    name: '현장',
    items: [
      { name: '현장관리', path: '/sites', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    ]
  },
  {
    name: '업무',
    items: [
      { name: '업무 캘린더', path: '/calendar/work', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { name: '지출결의서', path: '/approval', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { name: '지출관리', path: '/expenses', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
      { name: '일용직 근무관리', path: '/labor', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { name: '연차신청', path: '/leave', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    ]
  },
  {
    name: '데이터',
    items: [
      { name: '거래처 DB', path: '/vendors', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
      { name: 'A/S 관리', path: '/as', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    ]
  },
  {
    name: '세무/회계',
    items: [
      { name: '회계달력', path: '/accounting-cal', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
      { name: '경리', path: '/ledger', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    ]
  },
  {
    name: '관리',
    items: [
      { name: '서류함', path: '/documents', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { name: '직원관리', path: '/staff', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { name: SHARED_IDS_MENU, path: SHARED_IDS_PATH, icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
      { name: PRIVATE_IDS_MENU, path: PRIVATE_IDS_PATH, icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    ]
  },
  {
    name: '',
    hideHeading: true,
    items: [
      { name: '.', path: '/my-sites', icon: '' },
    ],
  },
]

export const BOTTOM_ITEMS: MenuItem[] = [
  { name: '공지사항', path: '/notice', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
  { name: '설정', path: '/settings', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
]

/** 즐겨찾기에 올릴 수 있는 메뉴 전체 (하단 공지·설정 포함). */
export const FAVORITABLE_ITEMS: MenuItem[] = [
  ...MENU_GROUPS.flatMap(g => g.items),
  ...BOTTOM_ITEMS,
  // 이름이 '.'인 항목은 숨은 메뉴라 즐겨찾기 대상이 아니다.
].filter(item => item.name !== '.')

/** 경로로 메뉴 하나 찾기. 즐겨찾기가 이름·아이콘을 가져올 때 쓴다. */
export function findMenuItem(path: string): MenuItem | undefined {
  return FAVORITABLE_ITEMS.find(item => item.path === path)
}
