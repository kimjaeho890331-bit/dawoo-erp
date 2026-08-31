import { NextRequest } from 'next/server'
import { handleCreate, handleList } from '@/lib/credentials/handlers'

export async function GET() {
  return handleList('private')
}

export async function POST(request: NextRequest) {
  return handleCreate('private', request)
}
