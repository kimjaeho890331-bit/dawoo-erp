// 직원 초대 코드 생성 유틸
// 6자리 영숫자 대문자 (혼동 문자 제외: 0/O/I/1)

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(length: number = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return code
}
