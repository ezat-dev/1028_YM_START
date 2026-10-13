import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconX, IconChevronLeft, IconChevronRight, IconZoomIn, IconZoomOut, IconZoomReset, IconDownload,
} from '@tabler/icons-react';
import './ImageViewer.css';

const MIN_SCALE = 1;
const MAX_SCALE = 6;

/**
 * 이미지 크게 보기(라이트박스).
 *
 * images: [{ src, thumbSrc?, name?, downloadUrl? }]
 * - ← / → 또는 양옆 버튼으로 넘기기, 아래 썸네일 줄로 바로 이동
 * - 휠 · 더블클릭 · +/- 버튼으로 확대, 확대 중에는 끌어서 이동, 0 키로 원래 크기
 * - Esc 또는 바깥(어두운 곳) 클릭으로 닫기
 * 원본이 뜨기 전에는 썸네일을 흐리게 깔아 두어 빈 화면이 보이지 않게 한다.
 */
export default function ImageViewer({ images, startIndex = 0, title, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const stageRef = useRef(null);
  const dialogRef = useRef(null);

  const count = images.length;
  const current = images[index];

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const go = useCallback((delta) => {
    if (count < 2) return;
    setIndex((i) => (i + delta + count) % count);
  }, [count]);

  useEffect(() => {
    setLoaded(false);
    resetView();
  }, [index, resetView]);

  const zoomTo = useCallback((next, origin) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setScale((prev) => {
      if (clamped === 1) {
        setOffset({ x: 0, y: 0 });
      } else if (origin) {
        // 커서 위치가 확대 전후에 같은 곳을 가리키도록 이동량을 보정
        const ratio = clamped / prev;
        setOffset((o) => ({ x: origin.x - (origin.x - o.x) * ratio, y: origin.y - (origin.y - o.y) * ratio }));
      }
      return clamped;
    });
  }, []);

  // 키보드
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === '+' || e.key === '=') zoomTo(scale * 1.5);
      else if (e.key === '-') zoomTo(scale / 1.5);
      else if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, zoomTo, resetView, scale, onClose]);

  // 열려 있는 동안 뒤 페이지 스크롤 잠금 + 포커스 이동
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const lastFocused = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      lastFocused?.focus?.();
    };
  }, []);

  // 휠 확대 — React onWheel은 passive라 preventDefault가 안 되어 직접 붙인다
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const origin = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
      zoomTo(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), origin);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale, zoomTo]);

  const onPointerDown = (e) => {
    // 확대 상태에서만 끌기. 이전/다음 버튼 위에서 누른 건 끌기가 아니라 클릭이다
    if (scale === 1 || e.button !== 0 || e.target.closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    setDragging(true);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    setOffset({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const onDoubleClick = (e) => {
    const rect = stageRef.current.getBoundingClientRect();
    const origin = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
    if (scale > 1) resetView(); else zoomTo(2.5, origin);
  };

  if (!current) return null;

  return createPortal(
    <div
      className="iv-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} 이미지 보기` : '이미지 보기'}
      tabIndex={-1}
      ref={dialogRef}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="iv-topbar">
        <div className="iv-title">
          {title && <strong>{title}</strong>}
          <span className="iv-counter">{index + 1} / {count}</span>
          {current.name && <span className="iv-filename" title={current.name}>{current.name}</span>}
        </div>
        <div className="iv-tools">
          <button type="button" className="iv-tool" onClick={() => zoomTo(scale / 1.5)} disabled={scale <= MIN_SCALE} aria-label="축소">
            <IconZoomOut size={18} />
          </button>
          <button type="button" className="iv-zoom-label" onClick={resetView} title="원래 크기 (0)">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" className="iv-tool" onClick={() => zoomTo(scale * 1.5)} disabled={scale >= MAX_SCALE} aria-label="확대">
            <IconZoomIn size={18} />
          </button>
          <button type="button" className="iv-tool" onClick={resetView} disabled={scale === 1} aria-label="원래 크기">
            <IconZoomReset size={18} />
          </button>
          {current.downloadUrl && (
            <a className="iv-tool" href={current.downloadUrl} aria-label="원본 내려받기" title="원본 내려받기">
              <IconDownload size={18} />
            </a>
          )}
          <span className="iv-tools-sep" />
          <button type="button" className="iv-tool" onClick={onClose} aria-label="닫기 (Esc)" title="닫기 (Esc)">
            <IconX size={20} />
          </button>
        </div>
      </div>

      <div
        className={`iv-stage${scale > 1 ? ' is-zoomed' : ''}${dragging ? ' is-dragging' : ''}`}
        ref={stageRef}
        onMouseDown={(e) => {
          // 사진 바깥의 빈 곳을 누르면 닫는다(확대 중에는 끌기와 헷갈리지 않게 닫지 않음)
          const empty = e.target === e.currentTarget || e.target.classList.contains('iv-frame');
          if (empty && scale === 1) onClose();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="iv-frame"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          {!loaded && current.thumbSrc && (
            <img className="iv-placeholder" src={current.thumbSrc} alt="" aria-hidden="true" draggable={false} />
          )}
          <img
            key={current.src}
            className={`iv-image${loaded ? ' is-loaded' : ''}`}
            src={current.src}
            alt={current.name || `이미지 ${index + 1}`}
            draggable={false}
            onLoad={() => setLoaded(true)}
          />
        </div>

        {count > 1 && (
          <>
            <button type="button" className="iv-nav iv-nav-prev" onClick={() => go(-1)} aria-label="이전 이미지">
              <IconChevronLeft size={28} />
            </button>
            <button type="button" className="iv-nav iv-nav-next" onClick={() => go(1)} aria-label="다음 이미지">
              <IconChevronRight size={28} />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="iv-strip" role="tablist" aria-label="이미지 목록">
          {images.map((img, i) => (
            <button
              key={img.src}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`iv-strip-item${i === index ? ' is-active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}번 이미지`}
            >
              <img src={img.thumbSrc || img.src} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}

      <div className="iv-hint" aria-hidden="true">← → 넘기기 · 휠/더블클릭 확대 · Esc 닫기</div>
    </div>,
    document.body,
  );
}
