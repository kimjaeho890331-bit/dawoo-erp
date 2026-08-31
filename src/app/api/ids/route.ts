import { NextRequest } from 'next/server'
import { handleCreate, handleList } from '@/lib/credentials/handlers'

export async function GET() {
  return handleList('shared')
}

export async function POST(request: NextRequest) {
  return handleCreate('shared', request)
}
