import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/auth'
import { uploadFile, ensureProjectFolder, findOrCreateFolder } from '@/lib/google-drive'
import { checkUpload } from '@/lib/storage/uploadRules'

export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


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

    // 크기·형식·경로 검증 (큰 파일용 /api/storage/sign-upload 와 같은 규칙)
    const check = checkUpload(file, storagePath)
    if (!check.ok) {
      return Response.json({ error: check.error }, { status: check.status })
    }
    const safePath = check.safePath

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
