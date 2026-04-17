/**
 * Google Drive API 클라이언트 (Service Account JWT 인증)
 * 외부 의존성 없이 Node.js 내장 crypto 사용
 */
import crypto from 'crypto'

const GOOGLE_SERVICE_EMAIL = process.env.GOOGLE_SERVICE_EMAIL || ''
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || ''

// Private Key 파싱: Vercel 환경변수의 다양한 포맷 대응
function parsePrivateKey(): string {
  let key = process.env.GOOGLE_PRIVATE_KEY || ''
  // 앞뒤 따옴표 제거
  key = key.replace(/^["']|["']$/g, '')
  // 리터럴 \n → 실제 줄바꿈
  key = key.replace(/\\n/g, '\n')
  // 혹시 \\n (이중 이스케이프)
  key = key.replace(/\\\\n/g, '\n')
  return key
}
const GOOGLE_PRIVATE_KEY = parsePrivateKey()

// --- JWT 생성 + Access Token 발급 ---
let cachedToken: { token: string; expires: number } | null = null

function createJWT(): string {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: GOOGLE_SERVICE_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const signInput = `${header}.${payload}`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signInput)
  const signature = sign.sign(GOOGLE_PRIVATE_KEY, 'base64url')
  return `${signInput}.${signature}`
}

async function getAccessToken(): Promise<string> {
  // 캐시 확인 (만료 5분 전까지 재사용)
  if (cachedToken && cachedToken.expires > Date.now() + 300000) {
    return cachedToken.token
  }

  const jwt = createJWT()
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google OAuth 실패: ${err}`)
  }

  const data = await res.json()
  cachedToken = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

// --- Drive API 함수들 ---

/** 폴더 생성 (상위 폴더 안에) */
export async function createFolder(name: string, parentId?: string): Promise<{ id: string; name: string; webViewLink: string }> {
  const token = await getAccessToken()
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId || GOOGLE_DRIVE_FOLDER_ID],
    }),
  })
  if (!res.ok) throw new Error(`폴더 생성 실패: ${await res.text()}`)
  return res.json()
}

/** 폴더 찾기 (이름으로, 상위 폴더 안에서) */
export async function findFolder(name: string, parentId?: string): Promise<{ id: string; name: string } | null> {
  const token = await getAccessToken()
  const parent = parentId || GOOGLE_DRIVE_FOLDER_ID
  const q = `name='${name}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.files?.[0] || null
}

/** 폴더 찾거나 없으면 생성 */
export async function findOrCreateFolder(name: string, parentId?: string): Promise<{ id: string; name: string }> {
  const existing = await findFolder(name, parentId)
  if (existing) return existing
  const created = await createFolder(name, parentId)
  return { id: created.id, name: created.name }
}

/** 중첩 폴더 경로 생성 (예: 지원사업/수원시/소규모/삼성빌리지) */
export async function ensureFolderPath(pathParts: string[]): Promise<string> {
  let currentParent = GOOGLE_DRIVE_FOLDER_ID
  for (const part of pathParts) {
    const folder = await findOrCreateFolder(part, currentParent)
    currentParent = folder.id
  }
  return currentParent
}

/** 파일 업로드 (multipart) */
export async function uploadFile(
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
  folderId?: string,
): Promise<{ id: string; name: string; webViewLink: string }> {
  const token = await getAccessToken()
  const metadata = {
    name: fileName,
    parents: [folderId || GOOGLE_DRIVE_FOLDER_ID],
  }

  const boundary = '===dawoo_boundary==='
  const body = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${mimeType}\r\n`,
    'Content-Transfer-Encoding: base64\r\n\r\n',
    fileBuffer.toString('base64'),
    `\r\n--${boundary}--`,
  ].join('')

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`파일 업로드 실패: ${await res.text()}`)
  return res.json()
}

/** 폴더 내 파일 목록 */
export async function listFiles(folderId?: string): Promise<{ id: string; name: string; mimeType: string; webViewLink: string }[]> {
  const token = await getAccessToken()
  const parent = folderId || GOOGLE_DRIVE_FOLDER_ID
  const q = `'${parent}' in parents and trashed=false`
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink)&orderBy=name`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.files || []
}

/** 프로젝트용 폴더 경로 생성 (지원사업/[시]/[소규모|수도]/[빌라명]/) */
export async function ensureProjectFolder(
  cityName: string,
  category: '소규모' | '수도',
  buildingName: string,
): Promise<string> {
  return ensureFolderPath(['지원사업', cityName, category, buildingName])
}

/** 현장용 폴더 경로 생성 (현장/[현장명]/) */
export async function ensureSiteFolder(siteName: string): Promise<string> {
  return ensureFolderPath(['현장', siteName])
}

/** 드라이브 연결 테스트 */
export async function testConnection(): Promise<{ success: boolean; rootFolderName?: string; error?: string; debug?: string }> {
  try {
    if (!GOOGLE_SERVICE_EMAIL) return { success: false, error: 'GOOGLE_SERVICE_EMAIL 환경변수 없음' }
    if (!GOOGLE_PRIVATE_KEY || !GOOGLE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY')) {
      return { success: false, error: 'GOOGLE_PRIVATE_KEY 환경변수 없음 또는 형식 오류', debug: `key_length=${GOOGLE_PRIVATE_KEY.length}, starts=${GOOGLE_PRIVATE_KEY.substring(0, 30)}` }
    }
    if (!GOOGLE_DRIVE_FOLDER_ID) return { success: false, error: 'GOOGLE_DRIVE_FOLDER_ID 환경변수 없음' }

    const token = await getAccessToken()
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${GOOGLE_DRIVE_FOLDER_ID}?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    return { success: true, rootFolderName: data.name }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
