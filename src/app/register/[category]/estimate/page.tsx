import EstimatePage from '@/components/estimate/EstimatePage'

interface Props {
  params: Promise<{ category: string }>
  searchParams: Promise<{ projectId?: string }>
}

export default async function EstimateRoute({ params, searchParams }: Props) {
  const { category } = await params
  const { projectId } = await searchParams

  return (
    <EstimatePage
      category={category}
      projectId={projectId ?? null}
    />
  )
}
