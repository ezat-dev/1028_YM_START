import { useEffect, useRef, useState } from 'react';
import { IconCheck } from '@tabler/icons-react';
import { NUM_OK, cleanNum, isNumMark, isOutOfRange, rangeText } from './equipCheckShared';

/** 수치 기록 — 숫자 3자리까지, 항목에 범위가 있으면 벗어날 때 빨간색 */
export default function NumEntry({ item, current, disabled, autoFocus, onSave, extra }) {
  const [text, setText] = useState(isNumMark(current) ? String(current) : '');
  const ref = useRef(null);
  useEffect(() => { setText(isNumMark(current) ? String(current) : ''); }, [current]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const ok = NUM_OK.test(text);
  const out = ok && isOutOfRange(item, text);
  const range = rangeText(item);
  const save = () => { if (ok && !disabled && text !== String(current ?? '')) onSave(String(Number(text))); };
  return (
    <div className={`ec-num${out ? ' is-out' : ''}`}>
      <label>
        <span>수치</span>
        <input
          ref={ref}
          value={text}
          inputMode="decimal"
          maxLength={4}
          placeholder="000"
          disabled={disabled}
          onChange={(e) => setText(cleanNum(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } e.stopPropagation(); }}
          aria-label="수치 입력(숫자 3자리까지)"
        />
      </label>
      <button type="button" onClick={save} disabled={disabled || !ok} aria-label="수치 저장"><IconCheck size={15} /></button>
      <small className="ec-num-hint">
        {out ? `범위(${range}) 밖` : range ? `범위 ${range}` : '숫자 3자리까지'}
      </small>
      {extra}
    </div>
  );
}
