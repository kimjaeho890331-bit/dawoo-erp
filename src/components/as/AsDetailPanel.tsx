'use client'

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

import AsPhotoBox from './AsPhotoBox'
import { asCategoryLabel, type AsRecord, type AsStatus, AS_STATUS_LIST } from '@/lib/as/record'
import { contractTypeLabel } from '@/lib/siteContract'
import { isProjectCategory } from '@/lib/as/target'

/**
 * A/S 상세 — 목록에서 현장명을 누르면 오른쪽에서 밀려 나온다.
 *
 * 여기서 보는 것은 두 가지다.
 *  1) 접수할 때 고른 현장의 정보. A/S 기록에 베껴 둔 이름·주소만으로는 "그래서 누구한테
 *     연락하지"가 안 풀려서, 현장관리/접수대장의 원본을 그때그때 읽어 와 같이 보여 준다.
 *     원본이 지워졌으면 그 사실만 적고 A/S 기록은 그대로 둔다.
 *  2) A/S 전·후 사진. 사진은 고르는 즉시 저장한다 — 「수정」을 따로 누르게 하면
 *     현장에서 찍어 올리고 그냥 닫아 버린다.
 */

type SiteInfo = {
  id: string
  name: string | null
  address: string | null
  contract_type: string | null
  status: string | null
  site_manager: string | null
  client_manager: string | null
  client_phone: string | null
  start_date: string | null
  end_date: string | null
}

type ProjectInfo = {
  id: string
  building_name: string | null
  dong: string | null
  ho: string | null
  road_address: string | null
  jibun_address: string | null
  year: number | null
  status: string | null
  owner_name: string | null
  owner_phone: string | null
  tenant_phone: string | null
  construction_date: string | null
  total_cost: number | null
  staff: { name: string } | null
  cities: { name: string } | null
  work_types: { name: string } | null
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-[76px] shrink-0 text-[12px] text-txt-tertiary">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13px] text-txt-primary break-words">{value}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-border-primary bg-surface p-4">
      <h3 className="mb-2 text-[13px] font-semibold text-txt-primary">{title}</h3>
      {children}
    </section>
  )
}

export default function AsDetailPanel({
  record,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  onPhotosSaved,
}: {
  record: AsRecord
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (status: AsStatus) => void
  onPhotosSaved: (next: Pick<AsRecord, 'photos_before' | 'photos_after'>) => void
}) {
  // 읽어 온 원본은 "어느 A/S 기록의 것인지"와 함께 들고 있는다. 다른 기록으로 바로 넘어갔을 때
  // 앞 기록의 현장 정보가 잠깐 남아 보이지 않게 — 비우는 setState 를 따로 두지 않으려는 뜻도 있다.
  const [link, setLink] = useState<{ forId: string; site: SiteInfo | null; project: ProjectInfo | null } | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const linked = link?.forId === record.id ? link : null
  const hasTarget = Boolean(record.site_id || record.project_id)
  const loadingLink = hasTarget && !linked
  const site = linked?.site ?? null
  const project = linked?.project ?? null
  const linkGone = Boolean(linked) && hasTarget && !site && !project

  useEffect(() => {
    let cancelled = false
    if (!record.site_id && !record.project_id) return
    ;(async () => {
      if (record.site_id) {
        const { data } = await supabase
          .from('sites')
          .select('id, name, address, contract_type, status, site_manager, client_manager, client_phone, start_date, end_date')
          .eq('id', record.site_id)
          .maybeSingle()
        if (!cancelled) setLink({ forId: record.id, site: (data as SiteInfo) ?? null, project: null })
      } else if (record.project_id) {
        const { data } = await supabase
          .from('projects')
          .select('id, building_name, dong, ho, road_address, jibun_address, year, status, owner_name, owner_phone, tenant_phone, construction_date, total_cost, staff:staff_id ( name ), cities:city_id ( name ), work_types:work_type_id ( name )')
          .eq('id', record.project_id)
          .maybeSingle()
        if (!cancelled) setLink({ forId: record.id, site: null, project: (data as unknown as ProjectInfo) ?? null })
      }
    })()
    return () => { cancelled = true }
  }, [record.id, record.site_id, record.project_id])

  const savePhotos = useCallback(
    async (next: { photos_before?: string[]; photos_after?: string[] }) => {
      const merged = {
        photos_before: next.photos_before ?? record.photos_before,
        photos_after: next.photos_after ?? record.photos_after,
      }
      // 화면을 먼저 바꾸고 저장한다. 실패해도 되돌리지 않고 왜 안 됐는지만 띄운다 —
      // 방금 올린 사진이 소리 없이 사라지면 올린 사람은 올라갔다고 믿는다.
      onPhotosSaved(merged)
      const { error } = await supabase.from('as_records').update(merged).eq('id', record.id)
      setPhotoError(
        error
          ? /photos_before|photos_after|column/i.test(error.message)
            ? '사진 칸이 아직 데이터베이스에 없습니다 (034_as_records_photos.sql 적용 필요).'
            : `사진을 저장하지 못했습니다: ${error.message}`
          : null,
      )
    },
    [record.id, record.photos_before, record.photos_after, onPhotosSaved],
  )

  // 접수대장은 수도/소규모가 서로 다른 페이지라 A/S 구분을 그대로 따라간다
  const projectHref = project
    ? `/register/${record.category === '수도' ? 'water' : 'small'}?project=${project.id}`
    : null

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} />

      <div className="fixed right-0 top-0 z-40 flex h-full w-full flex-col overflow-hidden bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.12)] md:w-[560px]">
        {/* 헤더 */}
        <div className="flex items-start gap-3 border-b border-border-primary px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">
              {record.site_name || '(이름없음)'}
            </h2>
            <p className="mt-0.5 text-[12px] text-txt-tertiary">
              {asCategoryLabel(record.category)} · 접수 {record.reported_date}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={onEdit}
              className="inline-flex min-h-[32px] items-center rounded-lg px-3 text-[12px] font-medium text-accent-text transition-colors hover:bg-accent-light"
            >
              수정
            </button>
            <button
              onClick={onDelete}
              className="inline-flex min-h-[32px] items-center rounded-lg px-3 text-[12px] font-medium text-red-500 transition-colors hover:bg-red-50"
            >
              삭제
            </button>
            <button onClick={onClose} aria-label="닫기" className="p-1 text-txt-tertiary hover:text-txt-secondary">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 space-y-4 overflow-y-auto bg-surface-secondary/40 px-6 py-5">
          {/* 현장 정보 */}
          <Section title={isProjectCategory(record.category) ? '접수 현장 정보' : '현장 정보'}>
            {loadingLink ? (
              <p className="flex items-center gap-1.5 text-[12px] text-txt-tertiary">
                <Loader2 size={12} className="animate-spin" />
                불러오는 중...
              </p>
            ) : site ? (
              <dl className="divide-y divide-border-tertiary">
                <Row label="현장명" value={site.name} />
                <Row label="주소" value={site.address} />
                <Row label="계약구분" value={contractTypeLabel(site.contract_type)} />
                <Row label="진행단계" value={site.status} />
                <Row label="현장대리인" value={site.site_manager} />
                <Row label="발주처 담당" value={[site.client_manager, site.client_phone].filter(Boolean).join(' · ')} />
                <Row label="공사기간" value={[site.start_date, site.end_date].filter(Boolean).join(' ~ ')} />
              </dl>
            ) : project ? (
              <>
                <dl className="divide-y divide-border-tertiary">
                  <Row label="빌라명" value={[project.building_name, project.dong, project.ho ? `${project.ho}호` : ''].filter(Boolean).join(' ')} />
                  <Row label="주소" value={project.road_address || project.jibun_address} />
                  <Row label="진행연도" value={project.year ? `${project.year}년` : null} />
                  <Row label="공사종류" value={project.work_types?.name} />
                  <Row label="시" value={project.cities?.name} />
                  <Row label="담당자" value={project.staff?.name} />
                  <Row label="진행단계" value={project.status} />
                  <Row label="소유주" value={[project.owner_name, project.owner_phone].filter(Boolean).join(' · ')} />
                  <Row label="세입자" value={project.tenant_phone} />
                  <Row label="시공일" value={project.construction_date} />
                  <Row label="총공사비" value={project.total_cost ? `${project.total_cost.toLocaleString()}원` : null} />
                </dl>
                {projectHref && (
                  <a
                    href={projectHref}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] text-accent-text hover:underline"
                  >
                    접수대장에서 열기
                    <ExternalLink size={12} />
                  </a>
                )}
              </>
            ) : linkGone ? (
              <p className="text-[12px] text-txt-tertiary">
                연결된 원본을 찾지 못했습니다(지워졌을 수 있습니다). 아래 A/S 기록은 그대로 남습니다.
              </p>
            ) : (
              <dl className="divide-y divide-border-tertiary">
                <Row label="현장명" value={record.site_name} />
                <Row label="주소" value={record.address} />
                <Row
                  label=""
                  value={
                    <span className="text-[12px] text-txt-tertiary">
                      현장이 연결되어 있지 않습니다. 「수정」에서 현장을 고르면 원본 정보가 함께 보입니다.
                    </span>
                  }
                />
              </dl>
            )}
          </Section>

          {/* A/S 내용 */}
          <Section title="A/S 내용">
            <dl className="divide-y divide-border-tertiary">
              <Row label="하자유형" value={record.issue_type} />
              <Row
                label="상태"
                value={
                  <select
                    value={record.status}
                    onChange={e => onStatusChange(e.target.value as AsStatus)}
                    className="h-[28px] rounded-lg border border-border-primary bg-surface px-2 text-[12px] outline-none focus:border-accent"
                  >
                    {AS_STATUS_LIST.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                }
              />
              <Row label="처리일" value={record.resolved_date} />
              <Row label="담당업체" value={record.assigned_vendor_id} />
              <Row label="비용" value={record.cost != null ? `${record.cost.toLocaleString()}원` : null} />
              <Row label="하자접수 내용" value={<span className="whitespace-pre-wrap">{record.description}</span>} />
              <Row label="해결내용" value={record.resolution ? <span className="whitespace-pre-wrap">{record.resolution}</span> : null} />
              <Row label="메모" value={record.memo ? <span className="whitespace-pre-wrap">{record.memo}</span> : null} />
            </dl>
          </Section>

          {/* 사진 */}
          <Section title="사진">
            {photoError && (
              <p className="mb-2 rounded-lg bg-[#fef2f2] px-3 py-2 text-[12px] text-[#b91c1c]">{photoError}</p>
            )}
            <div className="space-y-4">
              <AsPhotoBox
                recordId={record.id}
                slot="before"
                label="A/S 전 사진"
                urls={record.photos_before}
                onChange={next => savePhotos({ photos_before: next })}
              />
              <AsPhotoBox
                recordId={record.id}
                slot="after"
                label="A/S 후 사진"
                urls={record.photos_after}
                onChange={next => savePhotos({ photos_after: next })}
              />
            </div>
          </Section>
        </div>
      </div>
    </>
  )
}
