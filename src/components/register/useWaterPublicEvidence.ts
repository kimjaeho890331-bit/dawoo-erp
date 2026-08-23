'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BANKBOOK_FILE_TYPE,
  CERT_TASK_TYPE,
  EMPTY_WATER_PUBLIC_EVIDENCE,
  ESTIMATE_FILE_TYPE,
  LEDGER_FILE_TYPE,
  groupEvidence,
  isWaterPublicRow,
  type WaterPublicEvidence,
} from '@/lib/register/waterPublicReadiness'
import type { DBProject } from '@/components/register/RegisterPage'

const ATTACHMENT_TYPES = [BANKBOOK_FILE_TYPE, LEDGER_FILE_TYPE, ESTIMATE_FILE_TYPE] as const

export function useWaterPublicEvidence(projects: DBProject[], category: '소규모' | '수도') {
  const [evidenceById, setEvidenceById] = useState<Record<string, WaterPublicEvidence>>({})

  const loadEvidence = useCallback(async () => {
    if (category !== '수도') {
      setEvidenceById({})
      return
    }
    const ids = projects.filter((p) => isWaterPublicRow({ category, water_work_type: p.water_work_type })).map((p) => p.id)
    if (ids.length === 0) {
      setEvidenceById({})
      return
    }

    const [attachments, ledgerRequests, estimates, certTasks] = await Promise.all([
      supabase
        .from('attachments')
        .select('project_id, file_type, file_path, drive_url')
        .in('project_id', ids)
        .in('file_type', [...ATTACHMENT_TYPES]),
      supabase
        .from('building_ledger_requests')
        .select('project_id, status, drive_file_url')
        .in('project_id', ids),
      supabase
        .from('estimates')
        .select('project_id')
        .in('project_id', ids),
      supabase
        .from('cowork_tasks')
        .select('project_id, status, result_drive_file_url')
        .in('project_id', ids)
        .eq('task_type', CERT_TASK_TYPE),
    ])

    setEvidenceById(groupEvidence({
      attachments: attachments.error ? null : attachments.data,
      ledgerRequests: ledgerRequests.error ? null : ledgerRequests.data,
      estimates: estimates.error ? null : estimates.data,
      certTasks: certTasks.error ? null : certTasks.data,
    }))
  }, [category, projects])

  useEffect(() => {
    loadEvidence()
  }, [loadEvidence])

  useEffect(() => {
    if (category !== '수도') return
    const channel = supabase
      .channel('water-public-readiness-evidence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments' }, () => { loadEvidence() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimates' }, () => { loadEvidence() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'building_ledger_requests' }, () => { loadEvidence() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cowork_tasks' }, () => { loadEvidence() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [category, loadEvidence])

  const getEvidence = useCallback(
    (projectId: string): WaterPublicEvidence => evidenceById[projectId] ?? EMPTY_WATER_PUBLIC_EVIDENCE,
    [evidenceById]
  )

  return { getEvidence, reloadEvidence: loadEvidence }
}
