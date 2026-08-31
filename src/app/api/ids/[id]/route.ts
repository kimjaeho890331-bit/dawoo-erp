import { NextRequest } from 'next/server'
import { handleDelete, handleGetOne, handleUpdate } from '@/lib/credentials/handlers'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  return handleGetOne('shared', id)
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  return handleUpdate('shared', id, request)
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  return handleDelete('shared', id)
}
