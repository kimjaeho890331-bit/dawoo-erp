import DraftForm from '@/components/approval/DraftForm'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DraftForm copyFromId={id} />
}
