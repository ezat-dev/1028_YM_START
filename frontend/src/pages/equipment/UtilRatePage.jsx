import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconGauge, IconRefresh, IconLock, IconTarget, IconClockHour4, IconPlayerPause, IconAlertTriangleFilled, IconTool,
} from '@tabler/icons-react';
import Highcharts from 'highcharts/esm/highcharts';
import HighchartsReact from 'highcharts-react-official';
import { usePermission } from '../../hooks/usePermission';
import { FURNACES, STATUS_LABEL } from '../../mocks/furnaceMock';
import { createUtilMock } from '../../mocks/utilRateMock';
import { getUtilDays } from '../../api/equipment/utilRateApi';
import { EQUIP_COLORS, STATE_COLORS, STATE_LABEL, LINE_BLUE } from '../../constants/equipColors';
import './UtilRatePage.css';

/*
 * 설비관리 > 설비가동률분석 — 설비 6대의 가동/계획정지/고장정지/대기 시간으로 가동률을 본다.
 *  - 요약 5칸, 설비별 가동 현황표(가동률·시간 구성 막대·7일 추이), 비가동 사유 TOP, 오늘 가동 타임라인, 가동률 추이
 *  - 가동률 = 가동 시간 ÷ 지난 시간(오늘은 지금까지)
 * 지금은 목업(USE_MOCK) — DB API가 준비되면 false로 바꾸면 된다(형식은 mocks/utilRateMock.js 주석).
 */
const USE_MOCK = true;
const POLL_MS = 60000;
const TARGET = 0.85;      // 가동률 목표
const HISTORY_DAYS = 60;  // 한 번에 받아 두는 기간(현재·직전 기간·추이 모두 이 안에서 계산)
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const STATES = ['run', 'plan', 'fail', 'wait'];

const RANGES = [
  { key: 'today', label: '오늘', days: 1, prevLabel: '어제' },
  { key: '7d', label: '최근 7일', days: 7, prevLabel: '직전 7일' },
  { key: '30d', label: '최근 30일', days: 30, prevLabel: '직전 30일' },
];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hms = (ms) => { const d = new Date(ms); return `${hm(ms)}:${pad(d.getSeconds())}`; };

/** 분 → '22.6h' (1시간 미만은 '35분') */
function fmtH(min) {
  if (min < 60) return `${Math.round(min)}분`;
  const h = min / 60;
  return h >= 100 ? `${Math.round(h).toLocaleString()}h` : `${h.toFixed(1)}h`;
}
const pct = (v, d = 1) => (v == null ? '-' : `${(v * 100).toFixed(d)}`);

function tone(rate) {
  if (rate == null) return 'none';
  if (rate >= 0.9) return 'good';
  if (rate >= TARGET) return 'ok';
  if (rate >= 0.75) return 'warn';
  return 'bad';
}

/** 설비·기간별 합계 */
function sumRows(rows) {
  const s = { span: 0, run: 0, plan: 0, fail: 0, wait: 0, failCount: 0 };
  rows.forEach((r) => {
    s.span += r.span; s.run += r.run; s.plan += r.plan; s.fail += r.fail; s.wait += r.wait;
    s.failCount += r.stops.filter((x) => x.type === 'fail').length;
  });
  s.rate = s.span > 0 ? s.run / s.span : null;
  s.down = s.plan + s.fail + s.wait;
  return s;
}

export default function UtilRatePage() {
  const permission = usePermission('/equipment/utilRate');
  const [source] = useState(() => (USE_MOCK ? createUtilMock() : { getUtilDays }));
  const [rangeKey, setRangeKey] = useState('today');
  const [rows, setRows] = useState(null);
  const [loadedAt, setLoadedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return source.getUtilDays({ from: ymd(daysAgo(HISTORY_DAYS - 1)), to: ymd(daysAgo(0)) })
      .then((list) => { setRows(list); setLoadedAt(Date.now()); setError(false); })
      .catch(() => setError(true))
      .finally(() => setTimeout(() => setLoading(false), 300));
  }, [source]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const range = RANGES.find((r) => r.key === rangeKey);
  const view = useMemo(() => (rows ? buildView(rows, range) : null), [rows, range]);

  if (!permission.loading && !permission.canRead) {
    return (
      <div className="mes-page">
        <div className="mes-card ut-empty"><IconLock size={20} /><span>이 화면을 볼 권한이 없습니다.</span></div>
      </div>
    );
  }

  return (
    <div className="mes-page ut-page">
      <div className="ut-header">
        <div className="ut-title">
          <div className="mes-page-icon"><IconGauge size={20} /></div>
          <div>
            <h2 className="mes-page-title">설비가동률분석</h2>
            <span className="ut-sub">연속열처리로 {FURNACES.length}대 · 목표 가동률 {TARGET * 100}%{USE_MOCK && <em className="ut-mock">화면 예시 · MOCK</em>}</span>
          </div>
        </div>
        <div className="ut-seg" role="tablist" aria-label="조회 기간">
          {RANGES.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={rangeKey === r.key} className={rangeKey === r.key ? 'is-on' : ''} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="ut-head-right">
          <span className={`ut-updated${error ? ' is-error' : ''}`}>{error ? '조회 실패' : '갱신'} <b>{loadedAt ? hms(loadedAt) : '-'}</b></span>
          <button type="button" className={`mes-btn mes-btn-secondary ut-icon-btn${loading ? ' is-spinning' : ''}`} onClick={load} title="새로고침" aria-label="새로고침">
            <IconRefresh size={15} />
          </button>
        </div>
      </div>

      {!view ? (
        <div className="mes-card ut-empty">{error ? '가동 데이터를 불러오지 못했습니다.' : '가동률을 불러오는 중…'}</div>
      ) : (
        <>
          <KpiRow view={view} range={range} />

          <div className="ut-row">
            <Scoreboard view={view} range={range} />
            <CauseCard view={view} range={range} />
          </div>

          <Timeline view={view} />

          <TrendChart view={view} />
        </>
      )}
    </div>
  );
}

/** 받아 둔 일자 데이터 → 화면용 묶음 */
function buildView(rows, range) {
  const today = ymd(daysAgo(0));
  const curFrom = ymd(daysAgo(range.days - 1));
  const prevFrom = ymd(daysAgo(range.days * 2 - 1));
  const prevTo = ymd(daysAgo(range.days));
  const trendDays = Math.max(7, range.days);
  const trendFrom = ymd(daysAgo(trendDays - 1));

  const inCur = rows.filter((r) => r.date >= curFrom && r.date <= today);
  const inPrev = rows.filter((r) => r.date >= prevFrom && r.date <= prevTo);

  const equips = FURNACES.map((f) => {
    const cur = sumRows(inCur.filter((r) => r.code === f.code));
    const prev = sumRows(inPrev.filter((r) => r.code === f.code));
    const spark = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = ymd(daysAgo(i));
      const r = rows.find((x) => x.code === f.code && x.date === d);
      spark.push(r && r.span > 0 ? r.run / r.span : null);
    }
    return { ...f, color: EQUIP_COLORS[f.code], cur, prev, spark };
  });

  const fleet = sumRows(inCur);
  const fleetPrev = sumRows(inPrev);

  // 비가동 사유 — 사유별 시간·횟수
  const causeMap = new Map();
  inCur.forEach((r) => r.stops.forEach((st) => {
    const key = `${st.type}|${st.cause}`;
    const c = causeMap.get(key) ?? { type: st.type, cause: st.cause, min: 0, count: 0, codes: new Set() };
    c.min += (st.end - st.start) / 60000;
    c.count += 1;
    c.codes.add(r.code);
    causeMap.set(key, c);
  }));
  const causes = [...causeMap.values()].sort((a, b) => b.min - a.min);

  // 추이 — 날짜별 설비 가동률
  const trendDates = [];
  for (let i = trendDays - 1; i >= 0; i -= 1) trendDates.push(daysAgo(i));
  const trend = FURNACES.map((f) => ({
    code: f.code,
    color: EQUIP_COLORS[f.code],
    data: trendDates.map((d) => {
      const r = rows.find((x) => x.code === f.code && x.date === ymd(d));
      return [d.getTime(), r && r.span > 0 ? Math.round((r.run / r.span) * 1000) / 10 : null];
    }),
  }));
  const fleetTrend = trendDates.map((d) => {
    const s = sumRows(rows.filter((x) => x.date === ymd(d)));
    return [d.getTime(), s.rate == null ? null : Math.round(s.rate * 1000) / 10];
  });

  return {
    equips,
    fleet,
    fleetPrev,
    causes,
    today: rows.filter((r) => r.date === today),
    trend,
    fleetTrend,
    trendFrom,
    trendDays,
  };
}

function Delta({ cur, prev }) {
  if (cur == null || prev == null) return <span className="ut-delta">비교 없음</span>;
  const d = (cur - prev) * 100;
  if (Math.abs(d) < 0.05) return <span className="ut-delta">변동 없음</span>;
  return <span className={`ut-delta ${d > 0 ? 'is-up' : 'is-down'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%p</span>;
}

function KpiRow({ view, range }) {
  const f = view.fleet;
  const achieved = view.equips.filter((e) => e.cur.rate != null && e.cur.rate >= TARGET).length;
  const t = tone(f.rate);
  return (
    <div className="ut-kpis">
      <div className={`mes-card ut-kpi is-main is-${t}`}>
        <span className="ut-kpi-label">평균 가동률</span>
        <span className="ut-kpi-value">{pct(f.rate)}<small>%</small></span>
        <span className="ut-kpi-sub"><Delta cur={f.rate} prev={view.fleetPrev.rate} /> {range.prevLabel} 대비</span>
        <span className="ut-kpi-meter" aria-hidden="true">
          <i style={{ width: `${(f.rate ?? 0) * 100}%`, background: LINE_BLUE }} />
          <b style={{ left: `${TARGET * 100}%` }} />
        </span>
      </div>
      <div className="mes-card ut-kpi">
        <span className="ut-kpi-label"><IconTarget size={13} />목표 달성 설비</span>
        <span className="ut-kpi-value">{achieved}<small>/ {view.equips.length}대</small></span>
        <span className="ut-kpi-dots" aria-label={`목표 ${TARGET * 100}% 이상 ${achieved}대`}>
          {view.equips.map((e) => (
            <i key={e.code} className={e.cur.rate != null && e.cur.rate >= TARGET ? 'is-on' : ''} title={`${e.code} ${pct(e.cur.rate)}%`}>{e.code.slice(-1)}</i>
          ))}
        </span>
      </div>
      <div className="mes-card ut-kpi">
        <span className="ut-kpi-label"><IconClockHour4 size={13} />가동 시간</span>
        <span className="ut-kpi-value">{(f.run / 60).toFixed(1)}<small>h</small></span>
        <span className="ut-kpi-sub">가능 {(f.span / 60).toFixed(1)}h 중</span>
      </div>
      <div className="mes-card ut-kpi">
        <span className="ut-kpi-label"><IconPlayerPause size={13} />비가동 시간</span>
        <span className="ut-kpi-value">{(f.down / 60).toFixed(1)}<small>h</small></span>
        <span className="ut-kpi-split">
          {['plan', 'fail', 'wait'].map((k) => (
            <span key={k}><i style={{ background: STATE_COLORS[k] }} />{STATE_LABEL[k].replace('정지', '')} {fmtH(f[k])}</span>
          ))}
        </span>
      </div>
      <div className={`mes-card ut-kpi${f.failCount ? ' is-alert' : ''}`}>
        <span className="ut-kpi-label"><IconAlertTriangleFilled size={13} />고장 정지</span>
        <span className="ut-kpi-value">{f.failCount}<small>건</small></span>
        <span className="ut-kpi-sub">합계 {fmtH(f.fail)} · 건당 평균 {f.failCount ? fmtH(f.fail / f.failCount) : '-'}</span>
      </div>
    </div>
  );
}

/** 작은 7일 추이 — SVG 꺾은선(목표선 포함) */
function Spark({ values, color }) {
  const W = 96;
  const H = 30;
  const lo = 0.6;
  const pts = values.map((v, i) => (v == null ? null : [(i / (values.length - 1)) * W, H - ((Math.max(lo, v) - lo) / (1 - lo)) * H]));
  const path = pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = [...pts].reverse().find(Boolean);
  const ty = H - ((TARGET - lo) / (1 - lo)) * H;
  return (
    <svg className="ut-spark" viewBox={`-3 -3 ${W + 6} ${H + 6}`} aria-hidden="true">
      <line x1="0" x2={W} y1={ty} y2={ty} stroke="#cfd4da" strokeDasharray="2 3" strokeWidth="1" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="2.8" fill={color} stroke="#fff" strokeWidth="1.5" />}
    </svg>
  );
}

/** 설비별 가동 현황 — 한 줄에 가동률, 시간 구성 막대(목표 눈금), 시간 내역, 7일 추이 */
function Scoreboard({ view, range }) {
  return (
    <section className="mes-card ut-card ut-board">
      <header className="ut-card-head">
        <div>
          <h3>설비별 가동 현황</h3>
          <p>{range.label} · 막대 = 시간 구성(가동/계획정지/고장정지/대기) · 눈금 = 목표 {TARGET * 100}%</p>
        </div>
        <div className="ut-legend">
          {STATES.map((k) => <span key={k}><i style={{ background: STATE_COLORS[k] }} />{STATE_LABEL[k]}</span>)}
        </div>
      </header>

      <div className="ut-board-head" aria-hidden="true">
        <span>설비</span><span>가동률</span><span>시간 구성</span><span>최근 7일</span>
      </div>
      <ul className="ut-board-list">
        {view.equips.map((e) => {
          const c = e.cur;
          const t = tone(c.rate);
          return (
            <li key={e.code} className="ut-board-row" style={{ '--c': e.color }}>
              <div className="ut-eq">
                <i className="ut-eq-dot" aria-hidden="true" />
                <div>
                  <strong>{e.code}</strong>
                  <span className={`ut-state is-${e.status}`}>
                    {e.status === 'alarm' && <IconAlertTriangleFilled size={10} />}
                    {e.status === 'idle' && <IconTool size={10} />}
                    {e.status === 'idle' ? (e.idleReason ?? STATUS_LABEL.idle) : STATUS_LABEL[e.status]}
                  </span>
                </div>
              </div>

              <div className="ut-rate">
                <span className={`ut-rate-v is-${t}`}>{pct(c.rate)}<small>%</small></span>
                <Delta cur={c.rate} prev={e.prev.rate} />
              </div>

              <div className="ut-comp">
                <div className="ut-comp-bar" role="img" aria-label={`${e.code} 가동 ${fmtH(c.run)}, 계획정지 ${fmtH(c.plan)}, 고장정지 ${fmtH(c.fail)}, 대기 ${fmtH(c.wait)}`}>
                  {STATES.map((k) => (c[k] > 0 ? (
                    <i key={k} style={{ width: `${(c[k] / c.span) * 100}%`, background: STATE_COLORS[k] }} title={`${STATE_LABEL[k]} ${fmtH(c[k])}`} />
                  ) : null))}
                  <b style={{ left: `${TARGET * 100}%` }} title={`목표 ${TARGET * 100}%`} />
                </div>
                <div className="ut-comp-text">
                  <span>가동 <b>{fmtH(c.run)}</b></span>
                  {c.plan > 0 && <span>계획 <b>{fmtH(c.plan)}</b></span>}
                  {c.fail > 0 && <span className="is-fail">고장 <b>{fmtH(c.fail)}</b></span>}
                  {c.wait > 0 && <span>대기 <b>{fmtH(c.wait)}</b></span>}
                </div>
              </div>

              <Spark values={e.spark} color={e.color} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** 비가동 사유 TOP — 사유별 시간(종류 색) */
function CauseCard({ view, range }) {
  const top = view.causes.slice(0, 8);
  const max = top[0]?.min ?? 1;
  const total = view.causes.reduce((a, c) => a + c.min, 0);
  return (
    <section className="mes-card ut-card ut-causes">
      <header className="ut-card-head">
        <div>
          <h3>비가동 사유 TOP</h3>
          <p>{range.label} · 합계 {fmtH(total)} · {view.causes.reduce((a, c) => a + c.count, 0)}건</p>
        </div>
      </header>
      {top.length === 0 ? (
        <div className="ut-causes-empty">비가동 기록이 없습니다.</div>
      ) : (
        <ol className="ut-cause-list">
          {top.map((c, i) => (
            <li key={`${c.type}-${c.cause}`}>
              <span className="ut-cause-rank">{i + 1}</span>
              <div className="ut-cause-main">
                <div className="ut-cause-top">
                  <span className="ut-cause-name">{c.cause}</span>
                  <span className={`ut-cause-type is-${c.type}`}>{STATE_LABEL[c.type]}</span>
                  <span className="ut-cause-val"><b>{fmtH(c.min)}</b> · {c.count}건</span>
                </div>
                <div className="ut-cause-bar"><i style={{ width: `${(c.min / max) * 100}%`, background: STATE_COLORS[c.type] }} /></div>
                <div className="ut-cause-codes">{[...c.codes].sort().join(' · ')}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** 오늘 가동 타임라인 — 설비 6줄 × 0~24시, 정지 구간을 색 띠로 */
function Timeline({ view }) {
  const day0 = daysAgo(0).getTime();
  const now = Date.now();
  const nowPct = ((now - day0) / (24 * 3600000)) * 100;
  return (
    <section className="mes-card ut-card ut-timeline">
      <header className="ut-card-head">
        <div>
          <h3>오늘 가동 타임라인</h3>
          <p>0시 ~ 지금 · 정지 구간에 마우스를 올리면 사유와 시간이 나옵니다</p>
        </div>
        <div className="ut-legend">
          {STATES.map((k) => <span key={k}><i style={{ background: STATE_COLORS[k] }} />{STATE_LABEL[k]}</span>)}
        </div>
      </header>
      <div className="ut-tl">
        <div className="ut-tl-axis" aria-hidden="true">
          <span />
          <div>
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => <em key={h} style={{ left: `${(h / 24) * 100}%` }}>{h}시</em>)}
          </div>
        </div>
        {FURNACES.map((f) => {
          const r = view.today.find((x) => x.code === f.code);
          const runPct = r ? (r.span / (24 * 60)) * 100 : 0;
          return (
            <div key={f.code} className="ut-tl-row">
              <span className="ut-tl-code" style={{ '--c': EQUIP_COLORS[f.code] }}><i />{f.code}</span>
              <div className="ut-tl-track">
                <i className="ut-tl-run" style={{ width: `${runPct}%`, background: STATE_COLORS.run }} />
                {r?.stops.map((st) => (
                  <i
                    key={`${st.start}-${st.type}`}
                    className="ut-tl-stop"
                    style={{ left: `${((st.start - day0) / 864e5) * 100}%`, width: `${Math.max(0.35, ((st.end - st.start) / 864e5) * 100)}%`, background: STATE_COLORS[st.type] }}
                    title={`${STATE_LABEL[st.type]} · ${st.cause}\n${hm(st.start)} ~ ${hm(st.end)} (${fmtH((st.end - st.start) / 60000)})`}
                  />
                ))}
                <span className="ut-tl-rate">{r && r.span ? `${pct(r.run / r.span)}%` : '-'}</span>
              </div>
            </div>
          );
        })}
        <div className="ut-tl-now" style={{ '--xr': nowPct / 100 }} aria-hidden="true"><span>지금 {hm(now)}</span></div>
      </div>
    </section>
  );
}

/** 가동률 추이 — 전력량 화면과 같은 Highcharts 곡선(목표선, 전체 평균은 굵은 점선) */
function TrendChart({ view }) {
  const [hidden, setHidden] = useState(() => new Set());
  const visibleKey = FURNACES.filter((f) => !hidden.has(f.code)).map((f) => f.code).join(',');

  const options = useMemo(() => {
    const codes = visibleKey.split(',');
    const vals = view.trend.flatMap((s) => s.data.map((d) => d[1])).filter((v) => v != null);
    const lo = Math.max(0, Math.floor((Math.min(TARGET * 100, ...vals) - 5) / 5) * 5);
    return {
      chart: { type: 'spline', animation: false, backgroundColor: 'transparent', spacing: [16, 8, 6, 0], style: { fontFamily: 'inherit' } },
      time: { timezone: LOCAL_TZ },
      title: { text: null },
      credits: { enabled: false },
      exporting: { enabled: false },
      legend: { enabled: false },
      xAxis: {
        type: 'datetime',
        lineWidth: 0,
        tickLength: 0,
        tickInterval: view.trendDays > 10 ? 3 * 864e5 : 864e5,
        crosshair: { color: '#c3cbd6', width: 1 },
        labels: { format: '{value:%m/%d}', y: 20, style: { fontSize: '11px', color: '#8a929c' } },
      },
      yAxis: {
        min: lo,
        max: 100,
        title: { text: null },
        gridLineColor: '#eef0f3',
        gridLineDashStyle: 'Dash',
        labels: { align: 'left', x: 0, y: -4, format: '{value}%', style: { fontSize: '10.5px', color: '#9aa3ad' } },
        plotLines: [{
          value: TARGET * 100, color: '#7cc3a0', width: 1.5, dashStyle: 'ShortDash', zIndex: 3,
          label: { text: `목표 ${TARGET * 100}%`, align: 'right', x: -4, y: -6, style: { fontSize: '11px', fontWeight: '700', color: '#2e8a5f' } },
        }],
      },
      tooltip: {
        shared: true,
        useHTML: true,
        outside: true,
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderColor: '#e1e4e8',
        borderRadius: 10,
        shadow: { color: 'rgba(16, 24, 40, 0.12)', offsetX: 0, offsetY: 6, width: 14 },
        padding: 12,
        formatter() {
          const d = new Date(this.x);
          const rowsHtml = [...this.points].filter((p) => p.y != null).sort((a, b) => b.y - a.y).map((p) => (
            '<div style="display:flex;align-items:center;gap:8px;line-height:21px">'
            + `<span style="width:3px;height:14px;border-radius:2px;background:${p.color}"></span>`
            + `<span style="color:#57606a;font-weight:600">${p.series.name}</span>`
            + `<span style="margin-left:auto;padding-left:20px;font-weight:700;color:${p.y < TARGET * 100 ? '#cf3b32' : '#1b1f24'}">${p.y.toFixed(1)}%</span></div>`
          )).join('');
          return `<div style="font-size:12px;font-variant-numeric:tabular-nums;min-width:160px"><div style="font-size:11.5px;font-weight:600;color:#8a929c;margin-bottom:6px">${d.getMonth() + 1}월 ${d.getDate()}일</div>${rowsHtml}</div>`;
        },
      },
      plotOptions: {
        series: {
          animation: false,
          lineWidth: 2.25,
          connectNulls: true,
          marker: { enabled: view.trendDays <= 10, radius: 3, symbol: 'circle', lineWidth: 2, lineColor: '#fff' },
          states: { hover: { lineWidth: 3 }, inactive: { opacity: 0.22 } },
        },
      },
      series: [
        ...view.trend.filter((s) => codes.includes(s.code)).map((s) => ({ id: s.code, name: s.code, color: s.color, data: s.data })),
        { id: 'fleet', name: '전체 평균', color: '#4a5563', dashStyle: 'Dash', lineWidth: 2, data: view.fleetTrend, zIndex: 5, marker: { enabled: false } },
      ],
    };
  }, [view, visibleKey]);

  const toggle = (code) => setHidden((prev) => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code);
    else if (next.size < FURNACES.length - 1) next.add(code);
    return next;
  });

  return (
    <section className="mes-card ut-card ut-trend">
      <header className="ut-card-head">
        <div>
          <h3>가동률 추이</h3>
          <p>최근 {view.trendDays}일 · 일별 가동률 · 점선 = 전체 평균</p>
        </div>
        <div className="ut-chips" role="group" aria-label="설비 표시">
          {view.equips.map((e) => {
            const off = hidden.has(e.code);
            return (
              <button key={e.code} type="button" className={`ut-chip${off ? ' is-off' : ''}`} aria-pressed={!off} onClick={() => toggle(e.code)}>
                <i style={{ background: e.color }} />{e.code}
              </button>
            );
          })}
          <span className="ut-chip is-static"><i className="is-dash" />전체 평균</span>
        </div>
      </header>
      <div className="ut-trend-chart" role="img" aria-label="설비별 일별 가동률 추이 선 그래프">
        <HighchartsReact highcharts={Highcharts} options={options} updateArgs={[true, true, false]} containerProps={{ style: { height: '100%' } }} />
      </div>
    </section>
  );
}
