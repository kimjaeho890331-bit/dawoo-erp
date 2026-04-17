import { NextRequest, NextResponse } from 'next/server'
import {
  testConnection,
  ensureProjectFolder,
  ensureSiteFolder,
  listFiles,
  uploadFile,
  ensureFolderPath,
} from '@/lib/google-drive'

// GET: 연결 테스트 또는 폴더 파일 목록
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  const folderId = req.nextUrl.searchParams.get('folderId')

  try {
    if (action === 'test') {
      const result = await testConnection()
      return NextResponse.json(result)
    }

    if (action === 'list') {
      const files = await listFiles(folderId || undefined)
      return NextResponse.json({ files })
    }

    return NextResponse.json({ error: 'action 파라미터 필요 (test | list)' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST: 폴더 생성 또는 파일 업로드
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''

    // JSON: 폴더 생성
    if (contentType.includes('application/json')) {
      const body = await req.json()
      const { action, cityName, category, buildingName, siteName, path } = body

      if (action === 'project-folder') {
        if (!cityName || !category || !buildingName) {
          return NextResponse.json({ error: 'cityName, category, buildingName 필수' }, { status: 400 })
        }
        const folderId = await ensureProjectFolder(cityName, category, buildingName)
        return NextResponse.json({ success: true, folderId })
      }

      if (action === 'site-folder') {
        if (!siteName) return NextResponse.json({ error: 'siteName 필수' }, { status: 400 })
        const folderId = await ensureSiteFolder(siteName)
        return NextResponse.json({ success: true, folderId })
      }

      if (action === 'folder' && path) {
        const folderId = await ensureFolderPath(path)
        return NextResponse.json({ success: true, folderId })
      }

      return NextResponse.json({ error: '지원하지 않는 action' }, { status: 400 })
    }

    // FormData: 파일 업로드
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File
      const folderId = formData.get('folderId') as string

      if (!file) return NextResponse.json({ error: '파일 필요' }, { status: 400 })

      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await uploadFile(file.name, buffer, file.type, folderId || undefined)
      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json({ error: '지원하지 않는 Content-Type' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
