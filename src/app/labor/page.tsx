import { redirect } from 'next/navigation'
import { UI_HIDDEN } from '@/lib/uiHidden'
import LaborPage from '@/components/labor/LaborPage'

export default function Page() {
  if (UI_HIDDEN.labor) redirect('/dashboard')
  return <LaborPage />
}
