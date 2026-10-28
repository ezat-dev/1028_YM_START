import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SERIES_COLORS, tempAt } from './mbf1Data';
import { QUENCH_ZONES } from './mbf1Layout';

/*
 * MBF1호기 온도 — 현재 온도와 최근 3시간 추이를 한 칸에.
 *  - 묶음(가열로 → 소려로 → 유조·세정)이 10초마다 차례로 — 지금 차례인 묶음의 실시간 온도 칸과 3시간 그래프만 보인다
 *    (마우스를 올리면 멈춤, 위 묶음 이름을 누르면 그 묶음으로)
 *  - 가열로: 1존 · 2존 · 3·4존 · CP — 값 아래 관리 범위 게이지(범위 밖이면 빨강). 나머지는 SP · 편차(10℃ 넘게 벌어지면 주황)
 *  - 이름 앞 색 점 = 그래프 선 색(범례 겸). 값에 마우스를 올리면 그 선만 진하게 + 관리 범위 띠/SP 점선
 * 그래프 숫자는 정수, 칸 숫자는 소수 한 자리. 선은 1분 값을 앞뒤 ±4분으로 고르게(3초 흔들림이 톱니처럼 보이지 않게).
 * 값은 mbf1Data(시각으로 계산, 칸과 그래프의 마지막 점이 같음). PLC 연결 후 tempAt 대신 실제 현재값 · 이력으로.
 */

const HOURS = 3;
const SLIDE_MS = 10000;
const ORDER = ['quench', 'temper', 'aux'];
const MIN_SPAN = 12; // 세로 눈금 최소 폭 ℃ — 몇 ℃ 흔들림이 크게 출렁이는 것처럼 보이지 않게
const SMOOTH = 4; // 앞뒤 ±4분 평균
const WARN_GAP = 10;
const PAD = { l: 38, r: 12, t: 8, b: 20 };
const pad2 = (n) => String(n).padStart(2, '0');
const hm = (t) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fmt1 = (v) => (v == null ? '-' : Number(v).toFixed(1)); // 877 → 877.0 (자릿수가 들쭉날쭉하지 않게)

/** 한 채널 — 3시간 점(1분 간격 + 지금, 고르게) */
function buildLine(ch, color, now) {
  const minute = Math.floor(now / 60000) * 60000;
  const ts = [];
  for (let k = HOURS * 60; k >= 1; k -= 1) ts.push(minute - k * 60000);
  ts.push(now);
  const raw = ts.map((t) => tempAt(ch.target, ch.seed, t));
  const pts = ts.map((t, i) => {
    const a = Math.max(0, i - SMOOTH);
    const b = Math.min(ts.length - 1, i + SMOOTH);
    let sum = 0;
    for (let j = a; j <= b; j += 1) sum += raw[j];
    return [t, sum / (b - a + 1)];
  });
  return { ch, color, pts };
}

/** 세로 눈금 — 보기 좋은 간격(1 · 2 · 5 · 10 …)으로 4~5칸 */
function niceScale(lines) {
  let lo = Infinity;
  let hi = -Infinity;
  lines.forEach((l) => l.pts.forEach(([, v]) => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
  if (hi - lo < MIN_SPAN) { const m = (hi + lo) / 2; lo = m - MIN_SPAN / 2; hi = m + MIN_SPAN / 2; }
  const raw = (hi - lo) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v));
  return { min, max, ticks };
}

function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** 묶음 하나의 3시간 그래프 — 칸 크기를 재서 SVG로(글자 · 선이 늘어나지 않게) */
function Chart({ lines, now, focus, active }) {
  const boxRef = useRef(null);
  const { w, h } = useSize(boxRef);
  const [hover, setHover] = useState(null); // 점 번호
  const t0 = now - HOURS * 3600000;
  const scale = useMemo(() => niceScale(lines), [lines]);
  const iw = Math.max(0, w - PAD.l - PAD.r);
  const ih = Math.max(0, h - PAD.t - PAD.b);
  const X = (t) => PAD.l + ((t - t0) / (now - t0)) * iw;
  const Y = (v) => PAD.t + (1 - (v - scale.min) / (scale.max - scale.min)) * ih;
  const n = lines[0]?.pts.length ?? 0;

  useEffect(() => { if (!active) setHover(null); }, [active]);

  const move = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    const f = (e.clientX - r.left - PAD.l) / iw;
    setHover(f < 0 || f > 1 ? null : Math.round(f * (n - 1)));
  };

  const focused = focus ? lines.find((l) => l.ch.key === focus) : null;
  const xTicks = [];
  for (let t = Math.ceil(t0 / 1800000) * 1800000; t <= now; t += 1800000) xTicks.push(t);
  const ht = hover != null ? lines[0].pts[hover][0] : null;
  const tipLeft = hover != null && X(ht) > PAD.l + iw * 0.62;

  return (
    <div className="mbc-chart" ref={boxRef} onMouseMove={move} onMouseLeave={() => setHover(null)}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} className="mbc-svg" aria-hidden="true">
          {scale.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={w - PAD.r} y1={Y(v)} y2={Y(v)} className="mbc-grid" />
              <text x={PAD.l - 6} y={Y(v) + 3.5} className="mbc-ylab">{v}</text>
            </g>
          ))}
          {xTicks.map((t) => <text key={t} x={X(t)} y={h - 5} className="mbc-xlab">{hm(t)}</text>)}

          {/* 칸에 올린 채널의 기준 — 관리 범위 띠 또는 SP 점선 */}
          {focused?.ch.range && (() => {
            const top = Math.max(PAD.t, Y(focused.ch.range.max));
            const bot = Math.min(PAD.t + ih, Y(focused.ch.range.min));
            return bot > top ? <rect x={PAD.l} width={iw} y={top} height={bot - top} className="mbc-band" style={{ fill: focused.color }} /> : null;
          })()}
          {focused && !focused.ch.range && focused.ch.sp != null && (
            <line x1={PAD.l} x2={w - PAD.r} y1={Y(focused.ch.sp)} y2={Y(focused.ch.sp)} className="mbc-sp" style={{ stroke: focused.color }} />
          )}

          {lines.map((l) => {
            const d = l.pts.map(([t, v], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
            const dim = focus && focus !== l.ch.key;
            return (
              <g key={l.ch.key} className={`mbc-series${dim ? ' is-dim' : ''}${focus === l.ch.key ? ' is-focus' : ''}`}>
                <path d={d} className="mbc-line" style={{ stroke: l.color }} />
                <circle cx={X(now)} cy={Y(l.pts[n - 1][1])} r={4} className="mbc-end" style={{ fill: l.color }} />
              </g>
            );
          })}

          {hover != null && (
            <g>
              <line x1={X(ht)} x2={X(ht)} y1={PAD.t} y2={PAD.t + ih} className="mbc-cross" />
              {lines.map((l) => <circle key={l.ch.key} cx={X(ht)} cy={Y(l.pts[hover][1])} r={4} className="mbc-hdot" style={{ fill: l.color }} />)}
            </g>
          )}
        </svg>
      )}
      {hover != null && (
        <div className={`mbc-tip${tipLeft ? ' is-left' : ''}`} style={{ left: X(ht) }}>
          <b>{hm(ht)}</b>
          {lines.map((l) => (
            <span key={l.ch.key}><i style={{ background: l.color }} />{l.ch.name}<em>{Math.round(l.pts[hover][1])}℃</em></span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 관리 범위 안 어디쯤인지 — 가는 막대(범위 전체) 위에 존마다 색 점 */
function Gauge({ range, items }) {
  const at = (v) => `${Math.min(100, Math.max(0, ((v - range.min) / (range.max - range.min)) * 100))}%`;
  return (
    <div className="mtt-gauge" aria-hidden="true">
      <span className="mtt-gauge-track">
        {items.map((it) => <i key={it.key} className={it.out ? 'is-out' : ''} style={{ left: at(it.pv), background: it.color }} />)}
      </span>
      <small>{range.min}</small>
      <small>{range.max}</small>
    </div>
  );
}

const devText = (pv, sp) => { const d = Math.round((pv - sp) * 10) / 10; return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d).toFixed(1)}`; };

/**
 * 온도 한 칸 — [● 이름] / 현재값 / 가열로는 관리 범위 게이지, 나머지는 SP · 편차.
 * 3·4존처럼 관리 범위가 같은 존 여러 개는 한 칸에 값을 나란히, 게이지 하나에 점 여러 개.
 * 가열로는 관리 범위 밖이면 빨강, 나머지는 SP와 10℃ 넘게 벌어지면 주황. 마우스를 올리면 그래프에서 그 선만 진하게.
 */
function Stat({ name, items, range, sp, focus, onFocus }) {
  const outs = items.map((it) => (range ? it.pv < range.min || it.pv > range.max : false));
  const warn = !range && sp != null && items.some((it) => Math.abs(it.pv - sp) > WARN_GAP);
  const multi = items.length > 1;
  const title = `${name} · ${items.map((it) => `${multi ? `${it.name} ` : ''}${fmt1(it.pv)}℃`).join(' / ')} · ${range ? `관리 범위 ${range.min}~${range.max}℃` : `설정 ${sp}℃`}${outs.some(Boolean) ? ' — 범위 밖' : ''}`;
  return (
    <div className={`mtt-stat${outs.some(Boolean) ? ' is-out' : ''}${warn ? ' is-warn' : ''}${multi ? ' is-multi' : ''}`} style={multi ? { gridColumn: `span ${items.length}` } : undefined} title={title}>
      <div className="mtt-stat-vals">
        {items.map((it, i) => (
          <div key={it.key} className={`mtt-stat-val${outs[i] ? ' is-bad' : ''}${focus === it.key ? ' is-focus' : ''}`}
            onMouseEnter={() => onFocus(it.key)} onMouseLeave={() => onFocus(null)}>
            <span><i style={{ background: it.color }} />{multi ? it.name : name}</span>
            <b>{fmt1(it.pv)}<small>℃</small></b>
          </div>
        ))}
      </div>
      {range
        ? <Gauge range={range} items={items.map((it, i) => ({ ...it, out: outs[i] }))} />
        : <em className="mtt-stat-sub">SP {sp}<span>{devText(items[0].pv, sp)}</span></em>}
    </div>
  );
}

export default function Mbf1TempTrend({ data }) {
  const { pattern, groups, now } = data;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focus, setFocus] = useState(null);
  const [cycle, setCycle] = useState(0); // 진행 막대 애니메이션을 처음부터 다시

  const slides = useMemo(() => {
    if (!groups) return [];
    return ORDER.map((k) => ({
      key: k,
      name: groups[k].name,
      channels: groups[k].channels,
      lines: groups[k].channels.map((ch, i) => buildLine(ch, SERIES_COLORS[i % SERIES_COLORS.length], now)),
    }));
  }, [groups, now]);

  const go = useCallback((i) => { setIdx(i); setFocus(null); setCycle((c) => c + 1); }, []);

  // 10초마다 다음 묶음(마우스를 올려 두면 멈춤)
  useEffect(() => {
    if (paused || !slides.length) return undefined;
    const t = setTimeout(() => go((idx + 1) % ORDER.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [idx, paused, cycle, slides.length, go]);

  if (!slides.length) return <div className="mtt" />;

  const pv = (ch) => tempAt(ch.target, ch.seed, now);
  const colorOf = (i) => SERIES_COLORS[i % SERIES_COLORS.length];

  const cellsOf = (s) => {
    const item = (c, i) => ({ key: c.key, name: c.name, pv: pv(c), color: colorOf(i) });
    if (s.key !== 'quench') {
      return s.channels.map((c, i) => <Stat key={c.key} name={c.name} items={[item(c, i)]} sp={c.sp} focus={focus} onFocus={setFocus} />);
    }
    const byKey = new Map(s.channels.map((c, i) => [c.key, item(c, i)]));
    const cells = QUENCH_ZONES.map((g) => (
      <Stat key={g.name} name={g.name} items={g.zones.map((z) => byKey.get(`q${z}`))} range={g} focus={focus} onFocus={setFocus} />
    ));
    if (pattern?.cp != null) {
      const cp = (Math.round((pattern.cp + Math.sin(now / 12000) * 0.01) * 100) / 100).toFixed(2);
      cells.push(
        <div key="cp" className="mtt-stat is-cp" title={`CP · 현재 ${cp}% / 설정 ${pattern.cp}%`}>
          <div className="mtt-stat-vals">
            <div className="mtt-stat-val"><span>CP</span><b>{cp}<small>%</small></b></div>
          </div>
          <em className="mtt-stat-sub">SP {pattern.cp}</em>
        </div>,
      );
    }
    return cells;
  };

  return (
    <div className="mtt" onMouseEnter={() => setPaused(true)} onMouseLeave={() => { setPaused(false); setFocus(null); setCycle((c) => c + 1); }}>
      <div className="mtt-head">
        <b>온도</b>
        {/* 묶음 차례 — 10초마다 넘어가고, 누르면 그 묶음으로 */}
        <div className="mtt-tabs" role="tablist" aria-label="온도 묶음 — 10초마다 넘어감">
          {slides.map((s, i) => {
            const on = i === idx;
            return (
              <button key={s.key} type="button" role="tab" aria-selected={on} className={`mtt-tab is-${s.key}${on ? ' is-on' : ''}`} onClick={() => go(i)}>
                {s.name}
                {on && <i key={cycle} className={`mtt-progress${paused ? ' is-paused' : ''}`} style={{ animationDuration: `${SLIDE_MS}ms` }} />}
              </button>
            );
          })}
        </div>
        <small className="mtt-badge">{pattern?.partNo ? `${pattern.partNo} 패턴 · ` : ''}예시 값</small>
      </div>

      {/* 지금 차례인 묶음의 실시간 온도만 — 칸 위 색 막대 = 아래 그래프 선 색 */}
      <div key={slides[idx].key} className={`mtt-now is-${slides[idx].key}`} aria-live="polite">{cellsOf(slides[idx])}</div>

      <div className="mbs-view">
        <div className="mbs-track" style={{ transform: `translateX(${-idx * (100 / slides.length)}%)`, width: `${slides.length * 100}%` }}>
          {slides.map((s, i) => (
            <div key={s.key} className="mbs-page" style={{ width: `${100 / slides.length}%` }} aria-hidden={i !== idx}>
              <Chart lines={s.lines} now={now} focus={i === idx ? focus : null} active={i === idx} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
