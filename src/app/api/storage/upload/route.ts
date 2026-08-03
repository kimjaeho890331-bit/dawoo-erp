import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import { uploadFile, ensureProjectFolder, findOrCreateFolder } from '@/lib/google-drive'
import { safeStoragePath } from '@/lib/utils/storagePath'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const ALLOWED_PATH_PREFIXES = [
  'projects/', 'templates/', 'attachments/', 'sites/', 'approval/',
  'card-statements/', 'staff/', 'vendors/',
]

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) {
    return Response.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const storagePath = formData.get('storagePath') as string

    if (!file || !storagePath) {
      return Response.json({ error: '파일과 경로가 필요합니다' }, { status: 400 })
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: '파일 크기는 20MB 이하만 가능합니다' }, { status: 400 })
    }

    // 파일 타입 검증 — MIME 또는 확장자 중 하나만 맞아도 통과시킨다
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      return Response.json(
        { error: `허용되지 않는 파일 형식입니다 (${ext || '확장자 없음'})` },
        { status: 400 },
      )
    }

    // 경로 검증 (Path Traversal 방지 + Storage가 거부하는 문자 치환)
    const safePath = safeStoragePath(storagePath)
    if (!ALLOWED_PATH_PREFIXES.some(prefix => safePath.startsWith(prefix))) {
      return Response.json({ error: '허용되지 않는 저장 경로입니다' }, { status: 403 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const { data, error } = await supabaseAdmin.storage
      .from('documents')
      .upload(safePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (error) {
      console.error('[Upload] Storage error:', error)
      return Response.json({
        error: `Storage: ${error.message || JSON.stringify(error)}`,
        details: error,
        path: safePath,
      }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(data.path)

    // 구글드라이브 동시 업로드
    // Option 1: driveFolderId 직접 전달
    // Option 2: projectId + fileType → 자동 경로 생성 (지원사업/시/카테고리/빌라명/fileType)
    let driveFolderId = formData.get('driveFolderId') as string | null
    const projectId = formData.get('projectId') as string | null
    const fileType = formData.get('fileType') as string | null

    if (!driveFolderId && projectId && fileType) {
      try {
        // 프로젝트 정보 조회
        const { data: proj } = await supabaseAdmin
          .from('projects')
          .select('id, building_name, drive_folder_id, cities(name), work_types(work_categories(name))')
          .eq('id', projectId)
          .single()

        if (proj) {
          const cityName = (proj.cities as { name?: string } | null)?.name || '미지정'
          const category = (proj.work_types as { work_categories?: { name?: string } } | null)?.work_categories?.name || '소규모'
          const buildingName = (proj.building_name as string) || '(이름없음)'

          // 프로젝트 폴더 (drive_folder_id 없으면 생성)
          let projFolderId = proj.drive_folder_id as string | null
          if (!projFolderId) {
            projFolderId = await ensureProjectFolder(
              cityName,
              category as '소규모' | '수도',
              buildingName
            )
            await supabaseAdmin.from('projects').update({
              drive_folder_id: projFolderId,
              drive_folder_url: `https://drive.google.com/drive/folders/${projFolderId}`,
            }).eq('id', projectId)
          }

          // fileType 하위 폴더 (실측사진, 동의서, 통장사본, 시공전/중/후 등)
          const typeFolder = await findOrCreateFolder(fileType, projFolderId)
          driveFolderId = typeFolder.id
        }
      } catch (e) {
        console.error('Drive folder setup error (non-fatal):', e)
      }
    }

    let driveFile = null
    if (driveFolderId) {
      try {
        driveFile = await uploadFile(file.name, buffer, file.type, driveFolderId)
      } catch (e) {
        console.error('Drive upload error (non-fatal):', e)
      }
    }

    return Response.json({ url: urlData.publicUrl, path: data.path, drive: driveFile })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error('[Upload] API error:', msg, stack)
    return Response.json({ error: `서버 오류: ${msg}`, stack }, { status: 500 })
  }
}
