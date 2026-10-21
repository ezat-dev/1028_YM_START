import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { IconSignature, IconCursorText, IconEraser, IconCheck } from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';
import { stampName } from './equipCheckShared';

const OUT_MAX_W = 360; // 저장하는 서명 이미지 최대 크기(px)
const OUT_MAX_H = 140;

/**
 * 결재·관리책임자 확인 팝업 — 마우스/터치로 서명하거나 이름을 입력한다.
 * current가 있으면(이미 서명됨) 서명을 보여 주고, 본인이면 취소할 수 있다.
 */
export default function SignModal({ title, subtitle, defaultName, current, canCancel, onSubmit, onCancelSign, onClose }) {
  const [mode, setMode] = useState('draw');
  const [name, setName] = useState(defaultName ?? '');
  const [drawn, setDrawn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const padRef = useRef(null);

  const submit = async () => {
    setError('');
    let body;
    if (mode === 'draw') {
      if (!drawn) { setError('서명란에 서명해주세요.'); return; }
      body = { signName: defaultName ?? '', signImg: padRef.current.toDataUrl() };
    } else {
      if (!name.trim()) { setError('이름을 입력해주세요.'); return; }
      body = { signName: name.trim(), signImg: '' };
    }
    setSaving(true);
    try {
      await onSubmit(body);
    } catch (err) {
      setError(err?.response?.data?.message ?? '저장하지 못했습니다.');
      setSaving(false);
    }
  };

  const cancelSign = async () => {
    setSaving(true);
    try {
      await onCancelSign();
    } catch (err) {
      setError(err?.response?.data?.message ?? '취소하지 못했습니다.');
      setSaving(false);
    }
  };

  if (current) {
    return (
      <Modal
        title={title}
        onClose={onClose}
        className="ec-sign-modal"
        footer={(
          <>
            <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>닫기</button>
            {canCancel && (
              <button type="button" className="mes-btn mes-btn-secondary ec-btn-danger" onClick={cancelSign} disabled={saving}>
                서명 취소
              </button>
            )}
          </>
        )}
      >
        {subtitle && <p className="ec-sign-sub">{subtitle}</p>}
        <div className="ec-sign-view">
          {current.img
            ? <img src={current.img} alt={`${current.name} 서명`} />
            : <span className="ec-stamp is-big">{stampName(current.name)}</span>}
        </div>
        <p className="ec-sign-who">
          <b>{current.name}</b> · {String(current.dt ?? '').replace('T', ' ').slice(0, 16)}
          {!canCancel && <span> · 서명한 본인만 취소할 수 있습니다.</span>}
        </p>
        {error && <p className="ec-error">{error}</p>}
      </Modal>
    );
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      className="ec-sign-modal"
      footer={(
        <>
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button>
          <button
            type="button"
            className="mes-btn mes-btn-primary"
            onClick={submit}
            disabled={saving || (mode === 'draw' ? !drawn : !name.trim())}
          >
            <IconCheck size={15} /> 서명 완료
          </button>
        </>
      )}
    >
      {subtitle && <p className="ec-sign-sub">{subtitle}</p>}
      <div className="ec-sign-tabs" role="tablist" aria-label="서명 방법">
        <button type="button" role="tab" aria-selected={mode === 'draw'} className={mode === 'draw' ? 'is-on' : ''} onClick={() => setMode('draw')}>
          <IconSignature size={16} /> 직접 서명
        </button>
        <button type="button" role="tab" aria-selected={mode === 'name'} className={mode === 'name' ? 'is-on' : ''} onClick={() => setMode('name')}>
          <IconCursorText size={16} /> 이름 입력
        </button>
      </div>

      {mode === 'draw' ? (
        <div className="ec-sign-draw">
          <SignaturePad ref={padRef} onChange={setDrawn} />
          <div className="ec-sign-draw-foot">
            <span>마우스나 손가락으로 서명하세요. 서명자: <b>{defaultName || '-'}</b></span>
            <button type="button" onClick={() => padRef.current?.clear()} disabled={!drawn}>
              <IconEraser size={15} /> 다시 쓰기
            </button>
          </div>
        </div>
      ) : (
        <label className="mes-field ec-sign-name-field">
          <span>이름</span>
          <input
            className="dtm-input"
            value={name}
            maxLength={50}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          {name.trim() && <span className="ec-sign-preview"><span className="ec-stamp is-big">{stampName(name)}</span> 이렇게 표시됩니다</span>}
        </label>
      )}
      {error && <p className="ec-error">{error}</p>}
    </Modal>
  );
}

/** 서명 패드 — 포인터(마우스·터치·펜) 입력, 곡선으로 부드럽게. toDataUrl()은 서명 부분만 잘라 PNG로 */
const SignaturePad = forwardRef(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef(null);
  const state = useRef({ drawing: false, pts: [], box: null, dpr: 1 });
  const [has, setHas] = useState(false);

  const setup = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#1b2440';
    state.current = { drawing: false, pts: [], box: null, dpr };
    setHas(false);
    onChange(false);
  }, [onChange]);

  useEffect(() => { setup(); }, [setup]);

  useImperativeHandle(ref, () => ({
    clear: setup,
    toDataUrl: () => {
      const c = canvasRef.current;
      const { box, dpr } = state.current;
      if (!box) return '';
      const pad = 6;
      const x = Math.max(0, box.x1 - pad);
      const y = Math.max(0, box.y1 - pad);
      const w = Math.min(c.width / dpr - x, box.x2 - box.x1 + pad * 2);
      const h = Math.min(c.height / dpr - y, box.y2 - box.y1 + pad * 2);
      const k = Math.min(1, OUT_MAX_W / w, OUT_MAX_H / h);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * k));
      out.height = Math.max(1, Math.round(h * k));
      out.getContext('2d').drawImage(c, x * dpr, y * dpr, w * dpr, h * dpr, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  }), [setup]);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5 };
  };
  const grow = (p) => {
    const s = state.current;
    s.box = s.box
      ? { x1: Math.min(s.box.x1, p.x), y1: Math.min(s.box.y1, p.y), x2: Math.max(s.box.x2, p.x), y2: Math.max(s.box.y2, p.y) }
      : { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  };

  const down = (e) => {
    e.preventDefault();
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* 캡처를 못 해도 그리기는 된다 */ }
    const p = pos(e);
    const s = state.current;
    s.drawing = true;
    s.pts = [p];
    grow(p);
    const g = canvasRef.current.getContext('2d');
    g.beginPath();
    g.fillStyle = '#1b2440';
    g.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
    g.fill();
  };
  const move = (e) => {
    const s = state.current;
    if (!s.drawing) return;
    e.preventDefault();
    const p = pos(e);
    const pts = s.pts;
    pts.push(p);
    grow(p);
    const g = canvasRef.current.getContext('2d');
    g.lineWidth = 1.6 + p.p * 2;
    if (pts.length < 3) {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      g.lineTo(p.x, p.y);
      g.stroke();
      return;
    }
    // 이전 두 점의 중간점끼리 이어 곡선으로
    const a = pts[pts.length - 3];
    const b = pts[pts.length - 2];
    const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const m2 = { x: (b.x + p.x) / 2, y: (b.y + p.y) / 2 };
    g.beginPath();
    g.moveTo(m1.x, m1.y);
    g.quadraticCurveTo(b.x, b.y, m2.x, m2.y);
    g.stroke();
  };
  const up = () => {
    const s = state.current;
    if (!s.drawing) return;
    s.drawing = false;
    setHas(true);
    onChange(true);
  };

  return (
    <div className={`ec-pad${has ? ' has-sign' : ''}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        aria-label="서명란"
      />
      <span className="ec-pad-line" aria-hidden="true" />
      <span className="ec-pad-hint" aria-hidden="true">여기에 서명</span>
    </div>
  );
});
