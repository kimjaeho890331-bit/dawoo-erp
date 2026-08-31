import { NextRequest } from 'next/server'
import { handleReveal } from '@/lib/credentials/handlers'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  return handleReveal('private', id)
}
