'use client'

import { Component, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

type Props = {
  children: ReactNode
  onClose?: () => void
}

type State = {
  error: Error | null
}

/** 상세 패널만 잡고, 접수대장 목록은 유지한다. */
export default class DetailPanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <>
        <div className="fixed inset-0 bg-black/30 z-30" onClick={this.props.onClose} />
        <div className="fixed right-0 top-0 h-full w-full md:w-[600px] bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.12)] z-40 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
            <h2 className="text-[16px] font-semibold tracking-[-0.2px] text-txt-primary">
              상세를 열지 못했습니다
            </h2>
            <button
              type="button"
              onClick={this.props.onClose}
              className="px-3 py-1.5 text-[11px] font-medium text-txt-secondary border border-border-primary rounded-lg hover:bg-surface-tertiary"
            >
              닫기
            </button>
          </div>
          <div className="px-6 py-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-txt-tertiary mt-0.5 shrink-0" />
            <p className="text-[13px] text-danger whitespace-pre-wrap break-words">
              {error.message || String(error)}
            </p>
          </div>
        </div>
      </>
    )
  }
}
