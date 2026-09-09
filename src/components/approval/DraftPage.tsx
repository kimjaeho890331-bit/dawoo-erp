'use client'

import { useActor } from './ActorPicker'
import ApprovalSidebar from './ApprovalSidebar'
import { usePendingCount } from './usePendingCount'
import DraftForm from './DraftForm'

/**
 * 기안작성 화면. 목록과 같은 문서함 사이드바를 그대로 두고 오른쪽만 작성 폼으로 바꾼다.
 *
 * 사이드바가 사라지면 어느 문서함에 있었는지 잃어버리고, 돌아가려면 뒤로가기밖에 없다.
 * 여기서는 바꿀 목록이 없으므로 사이드바 항목은 링크로 동작해 목록으로 이동한다.
 */
export default function DraftPage({ reportId, copyFromId }: { reportId?: string; copyFromId?: string }) {
  const { actor, actorId, setActorId, staffList, loading: actorLoading } = useActor()
  const pendingCount = usePendingCount(actor)

  return (
    <div className="-mx-4 -my-4 flex min-h-[calc(100vh-2rem)] md:-mx-8 md:-my-6 md:min-h-[calc(100vh-3rem)]">
      <ApprovalSidebar
        actorId={actorId}
        staffList={staffList}
        onActorChange={setActorId}
        actorLoading={actorLoading}
        pendingCount={pendingCount}
      />
      <main className="min-w-0 flex-1">
        <DraftForm reportId={reportId} copyFromId={copyFromId} />
      </main>
    </div>
  )
}
