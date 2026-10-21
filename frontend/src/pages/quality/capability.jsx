import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconSearch, IconChevronDown, IconCheck, IconArrowsMaximize, IconInfoCircle } from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';
import Highcharts from 'highcharts/esm/highcharts';
import HighchartsReact from 'highcharts-react-official';
import { getSpecList } from '../../api/quality/hardnessApi';

/*
 * 경도 공정능력(CPK·PPK) 공통 — 규격 고르기, 판정 색, 숫자 표시, 차트(X̄·R 관리도, 히스토그램, 측정값 추이).
 * 계산은 서버(/api/quality/hardness/capability)가 한다:
 *  - 부분군 = 완료된 측정의 세트(초물·중물·종물) 하나, 크기 n = 규격의 '세트당 측정 개수'
 *  - CPK: 부분군 안 σ = R̄ / d₂  /  PPK: 전체 값의 표준편차(n−1)
 */

export const TARGET = { cpk: 1.33, ppk: 1.67 };

/** 설비 → '2호기' (설비명에 'N호기'가 있으면 그걸, 없으면 코드 끝 숫자) */
export function equipLabel(code, name) {
  const m = String(name ?? '').match(/(\d+)\s*호기/);
  if (m) return `${m[1]}호기`;
  const c = String(code ?? '').match(/(\d+)$/);
  return c ? `${Number(c[1])}호기` : (code ?? '');
}

/** 부분군 크기 — CHECK SHEET는 행마다 1~5개라 범위로 */
export const subgroupText = (cap) => (cap?.subgroupSizeMin != null && cap.subgroupSizeMin !== cap.subgroupSizeMax
  ? `n ${cap.subgroupSizeMin}~${cap.subgroupSizeMax}` : `n ${cap?.subgroupSize ?? '-'}`);

/** 세트 구분 → 색 이름 */
export function setTone(t) {
  return t === '초물' ? 'first' : t === '종물' ? 'last' : 'mid';
}

export const fmt = (v, dec = 2) => (v == null || Number.isNaN(v) ? '-' : Number(v).toFixed(dec));
export const fmtSpecRange = (s) => {
  if (!s) return '';
  const d = s.decimals ?? 1;
  const lo = s.lsl == null ? '' : Number(s.lsl).toFixed(d);
  const hi = s.usl == null ? '' : Number(s.usl).toFixed(d);
  if (lo && hi) return `${lo} ~ ${hi} ${s.unit}`;
  if (lo) return `${lo} ${s.unit} 이상`;
  if (hi) return `${hi} ${s.unit} 이하`;
  return '';
};

/** 지수 판정 — kind: 'cpk' | 'ppk' */
export function verdict(value, kind) {
  if (value == null) return { tone: 'none', label: '계산 불가' };
  const t = TARGET[kind];
  if (value >= t) return { tone: 'good', label: `기준 충족 (≥ ${t})` };
  if (value >= 1.0) return { tone: 'warn', label: `기준 미달 (< ${t})` };
  return { tone: 'bad', label: '공정 능력 부족 (< 1.00)' };
}

/** 규격 목록 — useYn 'Y'면 사용 중인 것만(새 측정), ''면 전부(지난 측정 분석). 불러오기 전에는 null */
export function useSpecs(useYn = 'Y') {
  const [specs, setSpecs] = useState(null);
  useEffect(() => {
    getSpecList('', useYn).then((res) => setSpecs(res.data ?? [])).catch(() => setSpecs([]));
  }, [useYn]);
  return specs;
}

export function SpecSelect({ specs, value, onChange, id, className = 'mes-field-inline hd-spec-select' }) {
  // 호기별로 묶어서 보여 준다(같은 품번도 호기마다 규격이 다르다)
  const groups = useMemo(() => {
    const m = new Map();
    (specs ?? []).forEach((s) => {
      const k = `${equipLabel(s.equipCode, s.equipName)} (${s.equipCode})`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    });
    return [...m.entries()];
  }, [specs]);
  return (
    <select id={id} className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label="경도 규격">
      <option value="">호기 · 품번 · 검사 항목 선택</option>
      {groups.map(([label, list]) => (
        <optgroup key={label} label={label}>
          {list.map((s) => <option key={s.specId} value={s.specId}>{equipLabel(s.equipCode, s.equipName)} · {s.partNo}{s.productName ? ` ${s.productName}` : ''} · {s.itemName} ({fmtSpecRange(s)}){s.useYn === 'N' ? ' · 미사용' : ''}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

const lastMeasText = (v) => {
  if (!v) return '측정 없음';
  const t = String(v).replace('T', ' ');
  const sameYear = t.slice(0, 4) === String(new Date().getFullYear());
  return `최근 측정 ${sameYear ? t.slice(5, 16) : t.slice(0, 10)}`;
};

/**
 * 검색되는 규격 고르기 — 최근에 측정한 규격이 위로. 품번·품명·검사 항목으로 거른다.
 * 키보드: ↑↓ 이동, Enter 선택, Esc 닫기.
 */
export function SpecCombo({ specs, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const sorted = useMemo(() => [...(specs ?? [])].sort((a, b) => (
    String(b.lastMeasDt ?? '').localeCompare(String(a.lastMeasDt ?? ''))
    || a.partNo.localeCompare(b.partNo) || a.itemName.localeCompare(b.itemName)
  )), [specs]);
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return sorted;
    return sorted.filter((s) => [s.partNo, s.productName, s.itemName, s.unit, s.equipCode, s.equipName, equipLabel(s.equipCode, s.equipName)]
      .some((x) => String(x ?? '').toLowerCase().includes(k)));
  }, [sorted, q]);
  const cur = (specs ?? []).find((s) => s.specId === value);

  useEffect(() => {
    if (!open) return undefined;
    setQ('');
    setActive(Math.max(0, sorted.findIndex((s) => s.specId === value)));
    setTimeout(() => inputRef.current?.focus(), 0);
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (s) => { onChange(s.specId); setOpen(false); };

  return (
    <div className="hd-combo" ref={boxRef}>
      <button type="button" className={`hd-combo-btn${open ? ' is-open' : ''}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {cur ? (
          <span className="hd-combo-cur">
            <span className="hd-combo-eq">{equipLabel(cur.equipCode, cur.equipName)}</span>
            <b>{cur.partNo}</b>
            <span>{cur.itemName}</span>
            <em>{fmtSpecRange(cur)}</em>
          </span>
        ) : <span className="hd-combo-ph">호기 · 품번 · 검사 항목 선택</span>}
        <IconChevronDown size={15} className="hd-combo-caret" />
      </button>
      {open && (
        <div className="hd-combo-pop">
          <div className="hd-combo-search">
            <IconSearch size={14} />
            <input
              ref={inputRef}
              value={q}
              placeholder="호기 · 품번 · 품명 · 검사 항목 검색"
              role="combobox"
              aria-expanded="true"
              aria-controls="hd-combo-list"
              aria-activedescendant={filtered[active] ? `hd-combo-opt-${filtered[active].specId}` : undefined}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
                else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
                else if (e.key === 'Escape') setOpen(false);
              }}
            />
            <span className="hd-combo-count">{filtered.length}건</span>
          </div>
          <ul className="hd-combo-list" id="hd-combo-list" role="listbox" ref={listRef}>
            {filtered.length === 0 && <li className="hd-combo-empty">검색 결과가 없습니다.</li>}
            {filtered.map((s, i) => (
              <li
                key={s.specId}
                id={`hd-combo-opt-${s.specId}`}
                data-i={i}
                role="option"
                aria-selected={s.specId === value}
                className={`hd-combo-opt${i === active ? ' is-active' : ''}${s.specId === value ? ' is-cur' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              >
                <span className="hd-combo-l1">
                  <span className="hd-combo-eq">{equipLabel(s.equipCode, s.equipName)}</span>
                  <b>{s.partNo}</b>
                  {s.productName && <span className="hd-combo-name">{s.productName}</span>}
                  <span className="hd-combo-item">{s.itemName}</span>
                  {s.useYn === 'N' && <span className="hd-combo-off">미사용</span>}
                  {s.specId === value && <IconCheck size={14} className="hd-combo-check" />}
                </span>
                <span className="hd-combo-l2">
                  <span>{fmtSpecRange(s)}</span>
                  <span className={s.lastMeasDt ? '' : 'is-none'}>{lastMeasText(s.lastMeasDt)}{s.measCount ? ` · ${s.measCount}건` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const GAUGE_MAX = 2.5;
const SHORT = { good: '기준 충족', warn: '기준 미달', bad: '능력 부족', none: '계산 불가' };

/** 지수 카드(CPK 또는 PPK) — 숫자 + 0~2.5 막대(1.00 / 기준선) 위 현재 위치 */
const INDEX_HELP = {
  cpk: { formula: 'min(CPU, CPL)', text: '평균이 치우친 것까지 반영한 실제 공정능력(단기). CPU·CPL 중 작은 값입니다. σ는 부분군(한 세트) 안의 흩어짐 R̄ ÷ d₂로 구합니다. 1.33 이상이면 양호, 1.00 미만이면 불량이 나올 수 있는 공정입니다.' },
  ppk: { formula: 'min(PPU, PPL)', text: '전체 측정값의 흩어짐(LOT·날짜 차이 포함)으로 본 장기 공정능력. PPU·PPL 중 작은 값입니다. 초기 공정이나 고객 제출용은 보통 1.67 이상을 요구합니다.' },
};

export function IndexCard({ kind, value, sub, compact }) {
  const v = verdict(value, kind);
  const t = TARGET[kind];
  const pct = (x) => `${Math.max(0, Math.min(100, (x / GAUGE_MAX) * 100))}%`;
  const help = INDEX_HELP[kind];
  const tip = useTip(compact ? null : help?.text);
  return (
    <div className={`hd-index is-${v.tone}${compact ? ' is-compact' : ''}`}>
      <div className="hd-index-top">
        <span className="hd-index-name" {...tip.bind}>
          {kind.toUpperCase()}
          {!compact && help && <em className="hd-stat-formula">{help.formula}</em>}
          {!compact && <IconInfoCircle size={13} className="hd-stat-i" />}
          {tip.node}
        </span>
        <span className="hd-index-pill">{SHORT[v.tone]}</span>
      </div>
      <b className="hd-index-value">{fmt(value)}</b>
      <div className="hd-gauge" role="img" aria-label={`${kind.toUpperCase()} ${fmt(value)} · 기준 ${t}`}>
        <div className="hd-gauge-track">
          <span className="z-bad" style={{ left: 0, width: pct(1) }} />
          <span className="z-warn" style={{ left: pct(1), width: `calc(${pct(t)} - ${pct(1)})` }} />
          <span className="z-good" style={{ left: pct(t), right: 0 }} />
          {value != null && <i style={{ left: pct(value) }} />}
        </div>
        <div className="hd-gauge-ticks">
          <span className="t-low" style={{ left: pct(1) }}>1.00</span>
          <span className="t-target" style={{ left: pct(t) }}>기준 {t}</span>
        </div>
      </div>
      {sub && <span className="hd-index-sub">{sub}</span>}
    </div>
  );
}

/** 요소 높이 재기 — ResizeObserver + 창 크기 변경(숨은 탭에서 RO가 늦을 때 대비) */
export function useBoxHeight(enabled = true) {
  const [h, setH] = useState(0);
  const roRef = useRef(null);
  const ref = useCallback((el) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el || !enabled) return;
    const measure = () => setH(Math.floor(el.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    roRef.current = { disconnect: () => { ro.disconnect(); window.removeEventListener('resize', measure); } };
  }, [enabled]); // 떼어낼 때는 ref(null)이 불려 위에서 정리된다
  return [ref, h];
}

/**
 * 차트 카드 — 오른쪽 위 '크게 보기'로 같은 차트를 큰 팝업에.
 * render(height, isBig). fill이면 카드에 남는 높이를 재서 채운다.
 */
export function ChartCard({ title, sub, height = 260, render, plain = false, fill = false }) {
  const [big, setBig] = useState(false);
  const [fillRef, fillH] = useBoxHeight(fill);
  const bigHeight = Math.max(420, Math.round((typeof window !== 'undefined' ? window.innerHeight : 900) * 0.8) - 150);
  return (
    <section className={`${plain ? 'hd-chart-card is-plain' : 'mes-card hd-card hd-chart-card'}${fill ? ' is-fill' : ''}`}>
      <div className="hd-chart-head">
        <h4 className="hd-card-title">{title}{sub && <small>{sub}</small>}</h4>
        <button type="button" className="hd-expand-btn" onClick={() => setBig(true)} title="크게 보기" aria-label={`${title} 크게 보기`}>
          <IconArrowsMaximize size={14} /> <span>크게 보기</span>
        </button>
      </div>
      {fill
        ? <div className="hd-chart-fill" ref={fillRef}>{fillH > 0 && <div>{render(fillH, false)}</div>}</div>
        : render(height, false)}
      {big && (
        <Modal title={sub ? `${title} — ${sub}` : title} onClose={() => setBig(false)} xl className="hd-chart-modal">
          <div className="hd-chart-big">{render(bigHeight, true)}</div>
        </Modal>
      )}
    </section>
  );
}

/** 마우스를 올리면 뜨는 설명 — 카드의 overflow에 잘리지 않게 body에 띄운다 */
export function useTip(text) {
  const [pos, setPos] = useState(null);
  const open = (e) => {
    if (!text) return;
    const r = e.currentTarget.getBoundingClientRect();
    const half = 150;
    setPos({ x: Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8), y: r.bottom + 8 });
  };
  const close = () => setPos(null);
  const node = pos && text ? createPortal(<div className="hd-tip" role="tooltip" style={{ left: pos.x, top: pos.y }}>{text}</div>, document.body) : null;
  return { node, bind: text ? { onMouseEnter: open, onMouseLeave: close, onFocus: open, onBlur: close, tabIndex: 0 } : {} };
}

/** 숫자 칸 — label 옆 formula(계산식), 올리면 hint(쉬운 설명) + why(값이 안 나오는 이유) */
export function Stat({ label, formula, value, unit, hint, why }) {
  const tip = useTip(hint ? <>{hint}{why && <span className="hd-tip-why">{why}</span>}</> : null);
  return (
    <div className={`hd-stat${hint ? ' has-tip' : ''}`} {...tip.bind}>
      <span className="hd-stat-label">
        {label}
        {formula && <em className="hd-stat-formula">{formula}</em>}
        {hint && <IconInfoCircle size={12} className="hd-stat-i" />}
      </span>
      <b>{value}{unit && <small>{unit}</small>}</b>
      {tip.node}
    </div>
  );
}

/** 부분군이 모자라면 알림 */
export function SampleNote({ cap }) {
  if (!cap) return null;
  if (cap.subgroupCount === 0) return <div className="hd-note is-warn">완료된 측정이 없어 분석할 수 없습니다. 경도측정에서 측정을 완료하면 자동으로 계산됩니다.</div>;
  if (cap.subgroupCount < cap.minSubgroups) {
    return <div className="hd-note is-warn">부분군 {cap.subgroupCount}개 — 신뢰할 수 있는 판단에는 {cap.minSubgroups}개 이상이 필요합니다. 지금 값은 참고용입니다.</div>;
  }
  return null;
}

// ── 차트 ──

const AXIS = { lineColor: '#d5d9de', tickColor: '#d5d9de', labels: { style: { fontSize: '11px', color: '#7d858f' } } };
const BASE_CHART = {
  chart: { animation: false, backgroundColor: 'transparent', style: { fontFamily: "'Pretendard','Malgun Gothic',sans-serif" }, spacing: [12, 8, 6, 4] },
  title: { text: null },
  credits: { enabled: false },
  exporting: { enabled: false },
  legend: { enabled: false },
};
/*
 * 차트 보기 설정 — 대형 모니터링 화면은 글자·선을 키우고(scale) 어두운 배경(dark)으로 그린다.
 * 차트마다 옵션을 따로 만들지 않고, 만든 옵션을 마지막에 한 번 바꾼다.
 */
export const ChartViewContext = createContext({ scale: 1, dark: false });
const SCALE_KEYS = new Set(['fontSize', 'radius', 'lineWidth', 'tickLength']);

function scaleOptions(o, k) {
  if (Array.isArray(o)) return o.map((v) => scaleOptions(v, k));
  if (!o || typeof o !== 'object' || typeof o === 'function') return o;
  const out = {};
  Object.entries(o).forEach(([key, v]) => {
    if (SCALE_KEYS.has(key) && typeof v === 'number') out[key] = Math.round(v * k * 10) / 10;
    else if (key === 'fontSize' && typeof v === 'string' && v.endsWith('px')) out[key] = `${Math.round(parseFloat(v) * k * 10) / 10}px`;
    else out[key] = scaleOptions(v, k);
  });
  return out;
}

const DARK_AXIS = (a) => a && ({
  ...a,
  lineColor: 'rgba(255,255,255,.18)',
  tickColor: 'rgba(255,255,255,.18)',
  gridLineColor: 'rgba(255,255,255,.07)',
  labels: { ...a.labels, style: { ...a.labels?.style, color: '#9fb0c8' } },
  title: a.title && { ...a.title, style: { ...a.title?.style, color: '#7f90a8' } },
});

function useViewOptions(opts) {
  const { scale, dark } = useContext(ChartViewContext);
  let o = opts;
  if (dark) {
    o = {
      ...o,
      // 대형 모니터링: 화면이 바뀔 때마다 그리는 애니메이션 없이 바로(표시 장치에 따라 멈춰 보이는 일 방지)
      plotOptions: { ...o.plotOptions, series: { ...o.plotOptions?.series, animation: false } },
      xAxis: Array.isArray(o.xAxis) ? o.xAxis.map(DARK_AXIS) : DARK_AXIS(o.xAxis),
      yAxis: Array.isArray(o.yAxis) ? o.yAxis.map(DARK_AXIS) : DARK_AXIS(o.yAxis),
    };
  }
  return scale !== 1 ? scaleOptions(o, scale) : o;
}

const SPEC_LINE = '#e57373';
const CL_LINE = '#35ad9c';
const LIMIT_LINE = '#e6a35a';
const BLUE = '#5f80c6';

const plotLine = (value, color, text, dash = 'Dash', align = 'right') => (value == null ? null : {
  value, color, width: 1.5, dashStyle: dash, zIndex: 4,
  label: { text, align, x: align === 'right' ? -4 : 4, y: -4, style: { fontSize: '11px', fontWeight: '600', color } },
});
// 세로 선(가로축 기준) — 글자를 눕혀 위쪽에 둔다. row로 겹치지 않게 줄을 바꾼다
const vLine = (value, color, text, dash = 'Dash', side = 'right', row = 0) => (value == null ? null : {
  value, color, width: 1.5, dashStyle: dash, zIndex: 4,
  label: {
    text, rotation: 0, verticalAlign: 'top', align: 'left', textAlign: side === 'right' ? 'left' : 'right',
    x: side === 'right' ? 4 : -4, y: 12 + row * 14, style: { fontSize: '11px', fontWeight: '600', color },
  },
});

const subgroupTip = (cap) => function tip() {
  const d = cap.spec?.decimals ?? 1;
  const g = cap.subgroups[this.point.index];
  return `<b>${g.measNo}</b> · ${g.setType}<br/>LOT ${g.lotNo || '-'}${g.equipCode ? ` · ${g.equipCode}` : ''}<br/>`
    + `값 ${g.values.map((v) => v.toFixed(d)).join(', ')}<br/>평균 <b>${g.mean.toFixed(d + 1)}</b> · 범위 <b>${g.range.toFixed(d)}</b>`;
};
const TIP_STYLE = { useHTML: true, backgroundColor: '#fff', borderColor: '#dfe3e8', borderRadius: 8, style: { fontSize: '12px' } };

/** X̄ 관리도 — 부분군 평균 */
export function XbarChart({ cap, height = 260 }) {
  const d = cap.spec?.decimals ?? 1;
  const out = (g) => g.mean > cap.uclX || g.mean < cap.lclX;
  const opts = {
    ...BASE_CHART,
    chart: { ...BASE_CHART.chart, height },
    xAxis: { ...AXIS, categories: cap.subgroups.map((g, i) => `${i + 1}`), title: { text: '부분군', style: { fontSize: '11px', color: '#9aa1ab' } } },
    yAxis: {
      ...AXIS, title: { text: null }, gridLineColor: '#eef0f3',
      plotLines: [
        plotLine(cap.uclX, LIMIT_LINE, `UCL ${fmt(cap.uclX, d + 1)}`),
        plotLine(cap.mean, CL_LINE, `X̄̄ ${fmt(cap.mean, d + 1)}`, 'Solid'),
        plotLine(cap.lclX, LIMIT_LINE, `LCL ${fmt(cap.lclX, d + 1)}`),
      ].filter(Boolean),
      softMin: cap.lclX, softMax: cap.uclX,
    },
    tooltip: { ...TIP_STYLE, formatter: subgroupTip(cap) },
    series: [{
      type: 'line', name: '평균',
      data: cap.subgroups.map((g) => ({ y: g.mean, color: out(g) ? SPEC_LINE : BLUE, marker: { fillColor: out(g) ? SPEC_LINE : '#fff', lineColor: out(g) ? SPEC_LINE : BLUE } })),
      color: BLUE, lineWidth: 2, marker: { enabled: true, radius: 3.5, lineWidth: 2, symbol: 'circle' },
    }],
  };
  return <HighchartsReact highcharts={Highcharts} options={useViewOptions(opts)} />;
}

/** R 관리도 — 부분군 범위 */
export function RChart({ cap, height = 260 }) {
  const d = cap.spec?.decimals ?? 1;
  const opts = {
    ...BASE_CHART,
    chart: { ...BASE_CHART.chart, height },
    xAxis: { ...AXIS, categories: cap.subgroups.map((g, i) => `${i + 1}`), title: { text: '부분군', style: { fontSize: '11px', color: '#9aa1ab' } } },
    yAxis: {
      ...AXIS, title: { text: null }, gridLineColor: '#eef0f3', min: 0,
      plotLines: [
        plotLine(cap.uclR, LIMIT_LINE, `UCL ${fmt(cap.uclR, d + 1)}`),
        plotLine(cap.rangeBar, CL_LINE, `R̄ ${fmt(cap.rangeBar, d + 1)}`, 'Solid'),
      ].filter(Boolean),
      softMax: cap.uclR,
    },
    tooltip: { ...TIP_STYLE, formatter: subgroupTip(cap) },
    series: [{
      type: 'line', name: '범위', data: cap.subgroups.map((g) => ({ y: g.range, color: g.range > cap.uclR ? SPEC_LINE : '#9a85db' })),
      color: '#9a85db', lineWidth: 2, marker: { enabled: true, radius: 3.5, lineWidth: 2, fillColor: '#fff', lineColor: '#9a85db' },
    }],
  };
  return <HighchartsReact highcharts={Highcharts} options={useViewOptions(opts)} />;
}

/**
 * 최근 LOT 평균 추이 — 측정(LOT)마다 평균 점 + 최소~최대 세로선, 규격선.
 * current: 지금 보고 있는 측정의 값들(아직 분석에 안 들어간 측정이면 '현재'로 끝에 붙인다)
 */
export function LotTrendChart({ cap, current, height = 220, last = 15 }) {
  const d = cap.spec?.decimals ?? 1;
  const lsl = cap.spec?.lsl;
  const usl = cap.spec?.usl;
  const map = new Map();
  cap.subgroups.forEach((g) => {
    if (!map.has(g.measId)) map.set(g.measId, { measId: g.measId, measNo: g.measNo, lotNo: g.lotNo, vals: [] });
    map.get(g.measId).vals.push(...g.values);
  });
  let lots = [...map.values()].slice(-last);
  if (current?.vals?.length && !map.has(current.measId)) lots = [...lots.slice(-(last - 1)), { ...current, isCurrent: true }];
  else if (current) lots = lots.map((l) => (l.measId === current.measId ? { ...l, isCurrent: true } : l));
  const stat = lots.map((l) => {
    const mean = l.vals.reduce((a, b) => a + b, 0) / l.vals.length;
    return { ...l, mean, min: Math.min(...l.vals), max: Math.max(...l.vals) };
  });
  const out = (v) => (lsl != null && v < lsl) || (usl != null && v > usl);
  const opts = {
    ...BASE_CHART,
    chart: { ...BASE_CHART.chart, height },
    xAxis: { ...AXIS, categories: stat.map((l) => (l.isCurrent ? '이번' : (l.lotNo || l.measNo).slice(-4))), labels: { ...AXIS.labels, rotation: 0 } },
    yAxis: {
      ...AXIS, title: { text: null }, gridLineColor: '#eef0f3',
      softMin: lsl ?? undefined, softMax: usl ?? undefined,
      plotLines: [
        plotLine(usl, SPEC_LINE, `USL ${usl != null ? Number(usl).toFixed(d) : ''}`, 'Solid'),
        plotLine(cap.mean, CL_LINE, '', 'Dash'),
        plotLine(lsl, SPEC_LINE, `LSL ${lsl != null ? Number(lsl).toFixed(d) : ''}`, 'Solid'),
      ].filter(Boolean),
    },
    tooltip: {
      ...TIP_STYLE,
      formatter() {
        const l = stat[this.point.x ?? this.point.index];
        if (!l) return false;
        return `<b>${l.isCurrent ? '이번 측정' : l.measNo}</b><br/>LOT ${l.lotNo || '-'}<br/>평균 <b>${l.mean.toFixed(d + 1)}</b> · ${l.min.toFixed(d)} ~ ${l.max.toFixed(d)} (${l.vals.length}개)`;
      },
    },
    plotOptions: { series: { animation: false } },
    series: [
      {
        type: 'line', name: '범위', enableMouseTracking: false, color: 'rgba(95,128,198,.35)', lineWidth: 3, marker: { enabled: false },
        data: stat.flatMap((l, i) => [{ x: i, y: l.min }, { x: i, y: l.max }, null]),
      },
      {
        type: 'line', name: '평균', color: 'rgba(95,128,198,.5)', lineWidth: 1.5,
        data: stat.map((l, i) => ({
          x: i, y: l.mean,
          marker: {
            radius: l.isCurrent ? 6 : 4.5, lineWidth: 2,
            fillColor: out(l.mean) ? SPEC_LINE : l.isCurrent ? '#35ad9c' : '#fff',
            lineColor: out(l.mean) ? SPEC_LINE : l.isCurrent ? '#2b8f81' : BLUE,
          },
        })),
        marker: { enabled: true, symbol: 'circle' },
      },
    ],
  };
  return <HighchartsReact highcharts={Highcharts} options={useViewOptions(opts)} />;
}

/** X̄ 관리도 + R 관리도 (크게 보기 포함) */
export function XbarRCharts({ cap }) {
  return (
    <div className="hd-xr">
      <ChartCard title="X̄ 관리도" sub="부분군 평균" height={260} render={(h) => <XbarChart cap={cap} height={h} />} />
      <ChartCard title="R 관리도" sub="부분군 범위(최대 − 최소)" height={260} render={(h) => <RChart cap={cap} height={h} />} />
    </div>
  );
}

/** 히스토그램 + 정규분포 곡선 + 규격선 */
export function HistogramChart({ cap, sigma, height = 300 }) {
  const all = cap.subgroups.flatMap((g) => g.values);
  const d = cap.spec?.decimals ?? 1;
  const lsl = cap.spec?.lsl;
  const usl = cap.spec?.usl;
  const lo = Math.min(cap.min, lsl ?? cap.min, cap.mean - 3.5 * sigma);
  const hi = Math.max(cap.max, usl ?? cap.max, cap.mean + 3.5 * sigma);
  const bins = Math.min(20, Math.max(6, Math.ceil(Math.sqrt(all.length))));
  const w = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  all.forEach((v) => { counts[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)))] += 1; });
  const bars = counts.map((c, i) => ({ x: lo + w * (i + 0.5), y: c, color: (lsl != null && lo + w * (i + 1) <= lsl) || (usl != null && lo + w * i >= usl) ? SPEC_LINE : '#9fb4e3' }));
  const curve = [];
  for (let i = 0; i <= 80; i += 1) {
    const x = lo + ((hi - lo) * i) / 80;
    const pdf = sigma > 0 ? Math.exp(-0.5 * ((x - cap.mean) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI)) : 0;
    curve.push([x, pdf * all.length * w]);
  }
  const opts = {
    ...BASE_CHART,
    chart: { ...BASE_CHART.chart, height },
    xAxis: {
      ...AXIS, min: lo, max: hi, tickLength: 4,
      labels: { ...AXIS.labels, formatter() { return Number(this.value).toFixed(d); } },
      plotLines: [
        vLine(lsl, SPEC_LINE, `LSL ${lsl != null ? Number(lsl).toFixed(d) : ''}`, 'Solid', 'right'),
        vLine(usl, SPEC_LINE, `USL ${usl != null ? Number(usl).toFixed(d) : ''}`, 'Solid', 'left'),
        vLine(cap.mean, CL_LINE, `평균 ${fmt(cap.mean, d + 1)}`, 'Dash', 'right'),
        vLine(cap.spec?.target, '#7d858f', `목표 ${cap.spec?.target != null ? Number(cap.spec.target).toFixed(d) : ''}`, 'ShortDot', 'left', 1),
      ].filter(Boolean),
    },
    yAxis: { ...AXIS, title: { text: '개수', style: { fontSize: '11px', color: '#9aa1ab' } }, gridLineColor: '#eef0f3', allowDecimals: false },
    tooltip: {
      backgroundColor: '#fff', borderColor: '#dfe3e8', borderRadius: 8, style: { fontSize: '12px' },
      formatter() {
        if (this.series.type === 'spline') return false;
        return `${(this.x - w / 2).toFixed(d)} ~ ${(this.x + w / 2).toFixed(d)}<br/><b>${this.y}개</b>`;
      },
    },
    plotOptions: { column: { pointPadding: 0, groupPadding: 0, borderWidth: 1, borderColor: '#fff', pointRange: w, borderRadius: 2 } },
    series: [
      { type: 'column', name: '개수', data: bars },
      { type: 'spline', name: '정규분포', data: curve, color: '#4a68ad', lineWidth: 2, marker: { enabled: false }, enableMouseTracking: false },
    ],
  };
  return <HighchartsReact highcharts={Highcharts} options={useViewOptions(opts)} />;
}

/** 측정값 추이(측정 순서대로 모든 값) + 규격선 */
export function RunChart({ cap, height = 240 }) {
  const d = cap.spec?.decimals ?? 1;
  const lsl = cap.spec?.lsl;
  const usl = cap.spec?.usl;
  const pts = [];
  cap.subgroups.forEach((g) => g.values.forEach((v, i) => pts.push({ y: v, g, i })));
  const out = (v) => (lsl != null && v < lsl) || (usl != null && v > usl);
  const opts = {
    ...BASE_CHART,
    chart: { ...BASE_CHART.chart, height },
    xAxis: { ...AXIS, title: { text: '측정 순서', style: { fontSize: '11px', color: '#9aa1ab' } }, allowDecimals: false },
    yAxis: {
      ...AXIS, title: { text: null }, gridLineColor: '#eef0f3',
      softMin: lsl ?? undefined, softMax: usl ?? undefined,
      plotLines: [
        plotLine(usl, SPEC_LINE, `USL ${usl != null ? Number(usl).toFixed(d) : ''}`, 'Solid'),
        plotLine(cap.mean, CL_LINE, '', 'Dash'),
        plotLine(lsl, SPEC_LINE, `LSL ${lsl != null ? Number(lsl).toFixed(d) : ''}`, 'Solid'),
      ].filter(Boolean),
    },
    tooltip: {
      useHTML: true, backgroundColor: '#fff', borderColor: '#dfe3e8', borderRadius: 8, style: { fontSize: '12px' },
      formatter() {
        const p = pts[this.point.index];
        return `<b>${p.g.measNo}</b> · ${p.g.setType} 경도${p.i + 1}<br/>LOT ${p.g.lotNo || '-'}<br/><b>${this.y.toFixed(d)}</b> ${cap.spec?.unit ?? ''}`;
      },
    },
    series: [{
      type: 'line', data: pts.map((p) => ({ y: p.y, color: out(p.y) ? SPEC_LINE : BLUE })),
      color: 'rgba(95,128,198,.35)', lineWidth: 1, marker: { enabled: true, radius: 2.6, symbol: 'circle' },
    }],
  };
  return <HighchartsReact highcharts={Highcharts} options={useViewOptions(opts)} />;
}
