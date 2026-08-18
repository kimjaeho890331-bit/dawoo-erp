import { redirect } from 'next/navigation'
import { UI_HIDDEN } from '@/lib/uiHidden'
import DocumentsPage from '@/components/documents/DocumentsPage'

export default function Page() {
  if (UI_HIDDEN.documents) redirect('/dashboard')
  return <DocumentsPage />
}
