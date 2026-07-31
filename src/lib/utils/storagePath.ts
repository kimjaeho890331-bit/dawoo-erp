/**
 * Supabase Storage 키로 안전한 경로를 만든다.
 *
 * Storage는 키에 ASCII 안전문자 밖의 글자가 있으면 400 InvalidKey로 거부한다.
 * (`Invalid key: approval/1785472217053_발주목록.xlsx`)
 * 한글 파일명이 그대로 들어가면 업로드가 실패하므로 밑줄로 치환한다.
 * 화면에 보여줄 원래 파일명은 따로 저장하므로 여기서 잃어도 된다.
 *
 * 상위 경로 이동(`..`)과 맨 앞 슬래시도 함께 제거한다 (Path Traversal 방지).
 */
export function safeStoragePath(path: string): string {
  return path
    .replace(/\.\./g, '')
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9._/-]/g, '_')
}
