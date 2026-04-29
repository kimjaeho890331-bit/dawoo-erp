export default function DashboardLoading() {
  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4 bg-page min-h-screen">
      {/* 헤더 스켈레톤 */}
      <div className="bg-surface rounded-[10px] border border-border-primary px-6 py-5 border-l-4 border-l-accent">
        <div className="h-7 w-40 bg-surface-tertiary rounded animate-pulse" />
        <div className="h-4 w-64 bg-surface-tertiary rounded animate-pulse mt-2" />
      </div>

      {/* 메인 그리드 스켈레톤 */}
      <div className="grid grid-cols-5 gap-4 min-h-[640px]">
        <div className="col-span-2 flex flex-col gap-4">
          <div className="bg-surface rounded-[10px] border border-border-primary p-5 h-[220px] animate-pulse">
            <div className="h-5 w-24 bg-surface-tertiary rounded mb-4" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-surface-tertiary rounded" />
              <div className="h-4 w-3/4 bg-surface-tertiary rounded" />
              <div className="h-4 w-5/6 bg-surface-tertiary rounded" />
            </div>
          </div>
          <div className="bg-surface rounded-[10px] border border-border-primary p-5 h-[200px] animate-pulse">
            <div className="h-5 w-20 bg-surface-tertiary rounded mb-4" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-surface-tertiary rounded" />
              <div className="h-4 w-2/3 bg-surface-tertiary rounded" />
            </div>
          </div>
          <div className="bg-surface rounded-[10px] border border-border-primary p-5 flex-1 animate-pulse">
            <div className="h-5 w-16 bg-surface-tertiary rounded" />
          </div>
        </div>
        <div className="col-span-3">
          <div className="bg-surface rounded-[10px] border border-border-primary p-5 h-full animate-pulse">
            <div className="h-5 w-28 bg-surface-tertiary rounded mb-4" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-surface-tertiary rounded" />
              <div className="h-4 w-5/6 bg-surface-tertiary rounded" />
              <div className="h-4 w-4/5 bg-surface-tertiary rounded" />
              <div className="h-4 w-full bg-surface-tertiary rounded" />
              <div className="h-4 w-3/4 bg-surface-tertiary rounded" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
