import { safeStoragePath } from '@/lib/utils/storagePath'

// 업로드 허용 규칙. 서버를 거치는 업로드(/api/storage/upload)와
// 큰 파일용 직접 업로드(/api/storage/sign-upload)가 같은 규칙을 쓴다.

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',  // .xls
  'application/msword',        // .doc
  'application/haansofthwp',   // .hwp
  'application/x-hwp',         // .hwp (alternative)
  'application/vnd.ms-powerpoint',  // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',  // .pptx
  'application/octet-stream',  // 브라우저가 타입 모를 때 (hwp, heic 등)
  'text/csv', 'text/plain',
]
/**
 * MIME 타입만으로는 막을 수 없어서 확장자 허용목록을 함께 둔다.
 * 브라우저가 알려주는 file.type은 PC의 확장자 연결에 따라 달라진다 —
 * xlsx·docx·pptx는 실제로 zip이라, 압축 프로그램이 확장자를 잡고 있는 PC에서는
 * `application/x-zip-compressed`로 넘어와 정상 파일이 거부됐다.
 * 어느 한쪽만 통과해도 허용한다(둘 다 검사하면 같은 문제가 재발한다).
 */
const ALLOWED_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx',
  'csv', 'txt',
]
export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_PATH_PREFIXES = [
  'projects/', 'templates/', 'attachments/', 'sites/', 'approval/',
  'card-statements/', 'staff/', 'vendors/',
]

/**
 * 이 크기까지만 우리 서버를 거쳐 올린다. Vercel은 요청 본문을 약 4.5MB에서 자르는데,
 * 잘리면 우리 코드에 닿기도 전에 실패해 이유 없는 "업로드 오류"로 보인다.
 * 그보다 큰 파일은 서명 URL로 저장소에 바로 올린다.
 */
export const VIA_SERVER_MAX_SIZE = 4 * 1024 * 1024

export type UploadCheck =
  | { ok: true; safePath: string }
  | { ok: false; status: number; error: string }

export function checkUpload(file: { name: string; type: string; size: number }, storagePath: string): UploadCheck {
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, status: 400, error: '파일 크기는 20MB 이하만 가능합니다' }
  }

  // 파일 타입 검증 — MIME 또는 확장자 중 하나만 맞아도 통과시킨다
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_MIME_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, status: 400, error: `허용되지 않는 파일 형식입니다 (${ext || '확장자 없음'})` }
  }

  // 경로 검증 (Path Traversal 방지 + Storage가 거부하는 문자 치환)
  const safePath = safeStoragePath(storagePath)
  if (!ALLOWED_PATH_PREFIXES.some(prefix => safePath.startsWith(prefix))) {
    return { ok: false, status: 403, error: '허용되지 않는 저장 경로입니다' }
  }

  return { ok: true, safePath }
}
