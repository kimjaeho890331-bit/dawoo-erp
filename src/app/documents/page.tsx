import { redirect } from 'next/navigation'
import { hiddenPageRedirect, UI_HIDDEN } from '@/lib/uiHidden'
import DocumentsPage from '@/components/documents/DocumentsPage'

export default function Page() {
  const dest = hiddenPageRedirect(UI_HIDDEN.documents)
  if (dest) redirect(dest)
  return <DocumentsPage />
}
