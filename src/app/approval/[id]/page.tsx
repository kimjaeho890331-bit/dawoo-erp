import ApprovalDetail from '@/components/approval/ApprovalDetail'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ApprovalDetail reportId={id} />
}
