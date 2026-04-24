import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureProjectFolder, findOrCreateFolder, uploadFile } from '@/lib/google-drive'

export const maxDuration = 60

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function checkCoworkAuth(request: NextRequest): { ok: boolean; error?: string } {
  const token = process.env.COWORK_API_TOKEN
  if (!token) return { ok: false, error: 'COWORK_API_TOKEN 미설정' }
  const auth = request.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return { ok: false, error: 'Bearer 토큰 필요' }
  if (auth.slice(7) !== token) return { ok: false, error: '토큰 불일치' }
  return { ok: true }
}

/**
 * POST /api/cowork/tasks/[id]/complete
 * Cowork가 작업 완료 보고.
 *
 * Content-Type: multipart/form-data
 *   - file: 완성 PDF 바이너리
 *   - file_name?: string (기본: {building_name}_건축물대장.pdf)
 *
 * OR
 *
 * Content-Type: application/json  (실패 보고용)
 *   - status: 'failed'
 *   - error_message: string
 *
 * 처리:
 *   1) 프로젝트 Drive 폴더 내 "건축물대장" 서브폴더 생성
 *   2) PDF 업로드
 *   3) cowork_tasks.status='done', result_drive_file_id/url 기록
 *   4) attachments 테이블에도 row INSERT (FileDropZone 자동 표시)
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = checkCoworkAuth(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 })

  const { id: taskId } = await ctx.params
  if (!taskId) return Response.json({ error: 'task id 필요' }, { status: 400 })

  try {
    // task 조회
    const { data: task, error: tErr } = await supabaseAdmin
      .from('cowork_tasks')
      .select(`
        id, project_id, task_type, payload, status,
        projects ( id, building_name, drive_folder_id, drive_folder_url,
                   cities ( name ),
                   work_types ( work_categories ( name ) ) )
      `)
      .eq('id', taskId)
      .single()
    if (tErr || !task) return Response.json({ error: 'task를 찾을 수 없습니다' }, { status: 404 })
    if (task.status === 'done') return Response.json({ error: '이미 완료된 task' }, { status: 400 })

    const contentType = request.headers.get('content-type') || ''

    // ===== 실패 보고 =====
    if (contentType.includes('application/json')) {
      const body = await request.json()
      if (body.status === 'failed') {
        await supabaseAdmin
          .from('cowork_tasks')
          .update({
            status: 'failed',
            error_message: body.error_message || '알 수 없는 오류',
            done_at: new Date().toISOString(),
          })
          .eq('id', taskId)
        return Response.json({ success: true, status: 'failed' })
      }
      return Response.json({ error: '유효한 요청이 아닙니다' }, { status: 400 })
    }

    // ===== PDF 업로드 =====
    if (!contentType.includes('multipart/form-data')) {
      return Response.json({ error: 'multipart/form-data 또는 application/json 필요' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return Response.json({ error: 'file 필드 필요' }, { status: 400 })

    // 프로젝트 정보
    const project = task.projects as unknown as {
      id: string
      building_name: string | null
      drive_folder_id: string | null
      drive_folder_url: string | null
      cities?: { name?: string } | null
      work_types?: { work_categories?: { name?: string } | null } | null
    } | null
    if (!project) return Response.json({ error: '프로젝트 정보 누락' }, { status: 500 })

    const cityName = project.cities?.name || '미지정'
    const categoryName = (project.work_types?.work_categories?.name as '소규모' | '수도') || '수도'
    const buildingName = project.building_name || '(이름없음)'

    // 프로젝트 폴더 확보
    let projFolderId = project.drive_folder_id
    if (!projFolderId) {
      projFolderId = await ensureProjectFolder(cityName, categoryName, buildingName)
      await supabaseAdmin.from('projects').update({
        drive_folder_id: projFolderId,
        drive_folder_url: `https://drive.google.com/drive/folders/${projFolderId}`,
      }).eq('id', project.id)
    }

    // "건축물대장" 서브폴더
    const certFolder = await findOrCreateFolder('건축물대장', projFolderId)

    // 파일명 결정
    const explicitName = formData.get('file_name') as string | null
    const today = new Date().toISOString().slice(0, 10)
    const fileName = explicitName || `${buildingName}_건축물대장_${today}.pdf`

    // Drive 업로드
    const buffer = Buffer.from(await file.arrayBuffer())
    const driveFile = await uploadFile(fileName, buffer, 'application/pdf', certFolder.id)

    // Supabase Storage에도 백업 저장
    const storagePath = `attachments/${project.id}/cert/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: sErr } = await supabaseAdmin.storage
      .from('documents')
      .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })
    if (sErr) console.warn('[Cert Complete] Storage 업로드 실패(무시):', sErr.message)

    // attachments 테이블 기록 (FileDropZone에 자동 표시)
    await supabaseAdmin.from('attachments').insert({
      project_id: project.id,
      name: fileName,
      file_path: storagePath,
      file_type: '건축물대장',
      drive_url: driveFile.webViewLink,
    })

    // cowork_tasks 완료 처리
    await supabaseAdmin
      .from('cowork_tasks')
      .update({
        status: 'done',
        result_drive_file_id: driveFile.id,
        result_drive_file_url: driveFile.webViewLink,
        done_at: new Date().toISOString(),
      })
      .eq('id', taskId)

    return Response.json({
      success: true,
      status: 'done',
      drive_file_id: driveFile.id,
      drive_file_url: driveFile.webViewLink,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Cowork Complete] error:', msg)
    // 실패 시 task 상태도 실패로
    try {
      await supabaseAdmin
        .from('cowork_tasks')
        .update({ status: 'failed', error_message: msg, done_at: new Date().toISOString() })
        .eq('id', taskId)
    } catch {}
    return Response.json({ error: msg }, { status: 500 })
  }
}
