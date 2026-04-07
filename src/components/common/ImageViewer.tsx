'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface Props {
  images: { url: string; name: string }[]
  initialIndex: number
  onClose: () => void
}

export default function ImageViewer({ images, initialIndex, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const thumbnailRef = useRef<HTMLDivElement>(null)

  const goTo = useCallback(
    (idx: number) => {
      if (idx >= 0 && idx < images.length) setCurrentIndex(idx)
    },
    [images.length],
  )

  const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo])
  const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, goPrev, goNext])

  // 썸네일 자동 스크롤
  useEffect(() => {
    if (thumbnailRef.current) {
      const thumb = thumbnailRef.current.children[currentIndex] as HTMLElement | undefined
      if (thumb) {
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [currentIndex])

  if (images.length === 0) return null

  const current = images[currentIndex]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-6 py-3 text-white">
        <div className="text-sm">
          <span className="font-medium">{current.name}</span>
          <span className="ml-3 text-white/60">
            {currentIndex + 1} / {images.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-[10px] hover:bg-white/10 text-white/70 hover:text-white transition-colors text-lg"
        >
          &#x2715;
        </button>
      </div>

      {/* 메인 이미지 영역 */}
      <div className="flex-1 relative flex items-center justify-center min-h-0 px-16">
        {/* 좌측 클릭 영역 */}
        {currentIndex > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-0 top-0 bottom-0 w-16 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors z-10"
          >
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* 이미지 */}
        <img
          src={current.url}
          alt={current.name}
          className="max-h-full max-w-full object-contain transition-opacity duration-200"
          draggable={false}
        />

        {/* 우측 클릭 영역 */}
        {currentIndex < images.length - 1 && (
          <button
            onClick={goNext}
            className="absolute right-0 top-0 bottom-0 w-16 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-colors z-10"
          >
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* 하단 썸네일 스트립 */}
      {images.length > 1 && (
        <div className="py-3 px-6">
          <div
            ref={thumbnailRef}
            className="flex gap-2 overflow-x-auto justify-center scrollbar-thin"
          >
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => goTo(idx)}
                className={`flex-shrink-0 w-16 h-16 rounded-[10px] overflow-hidden border-2 transition-all ${
                  idx === currentIndex
                    ? 'border-white opacity-100 scale-105'
                    : 'border-transparent opacity-50 hover:opacity-80'
                }`}
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
