import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconBolt, IconRefresh, IconAlertTriangleFilled, IconCircleCheckFilled,
  IconClockHour4, IconTool,
} from '@tabler/icons-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  AreaChart, Area, ReferenceLine, Cell, LabelList,
} from 'recharts';
import Highcharts from 'highcharts/esm/highcharts';
import HighchartsReact from 'highcharts-react-official';
import { FURNACES, STATUS_LABEL } from '../../mocks/furnaceMock';
import { createPowerMock } from '../../mocks/powerMock';
import { EQUIP_COLORS, LINE_BLUE } from '../../constants/equipColors';
import { getPowerSeries, getMeterLatest } from '../../api/equipment/powerUsageApi';
import './PowerUsagePage.css';

/*
 * 설비관리 > 전력량 — 설비 6대의 KDX300 전력량계 데이터(누적 유효전력량 Wh, 누적 무효전력량 varh).
 * 누적값의 구간 차이로 시간대별/일별 사용량을 보여주고, 두 값으로 역률(PF = Wh / √(Wh² + varh²))을 계산한다.
 * 단위가 다른 유효/무효는 한 차트에 축 두 개로 겹치지 않고, 같은 차트에서 전환해서 본다.
 * 지금은 목업(USE_MOCK) — DB API가 준비되면 false로 바꾸면 된다(형식은 mocks/powerMock.js 주석).
 */
const USE_MOCK = true;
const POLL_MS = 30000;
const HOUR = 3600000;
const PF_TARGET = 0.9;   // 역률 목표
const PF_WARN = 0.85;    // 이 아래는 경고

// 설비 색은 constants/equipColors.js에서 — 설비관리 화면끼리 같은 색을 쓴다

const RANGES = [
  { key: 'today', label: '오늘' },
  { key: 'yday', label: '어제' },
  { key: '7d', label: '최근 7일' },
  { key: '30d', label: '최근 30일' },
];

const pad = (n) => String(n).padStart(2, '0');
const hms = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const startOfDay = (ms, addDays = 0) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + addDays); return d.getTime(); };

/** 기간 → 조회 구간과 비교 구간(직전 같은 길이) */
function rangeWindow(key, now) {
  const today = startOfDay(now);
  switch (key) {
    case 'yday':
      return { from: startOfDay(now, -1), to: today, prevFrom: startOfDay(now, -2), prevTo: startOfDay(now, -1), unit: 'hour', prevLabel: '그저께' };
    case '7d':
      return { from: startOfDay(now, -6), to: now, prevFrom: startOfDay(now, -13), prevTo: now - 7 * 24 * HOUR, unit: 'hour', prevLabel: '직전 7일' };
    case '30d':
      return { from: startOfDay(now, -29), to: now, prevFrom: startOfDay(now, -59), prevTo: now - 30 * 24 * HOUR, unit: 'hour', prevLabel: '직전 30일' };
    default:
      return { from: today, to: now, prevFrom: startOfDay(now, -1), prevTo: now - 24 * HOUR, unit: 'hour', prevLabel: '어제 같은 시각' };
  }
}

const pfOf = (wh, varh) => (wh > 0 || varh > 0 ? wh / Math.sqrt(wh * wh + varh * varh) : null);
// 하루짜리 조회는 '14시', 여러 날은 '10/08 14시'
const bucketLabel = (ts, unit, multiDay) => {
  const d = new Date(ts);
  const day = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  if (unit !== 'hour') return day;
  return multiDay ? `${day} ${pad(d.getHours())}시` : `${pad(d.getHours())}시`;
};

function fmtEnergy(v) {
  if (v == null || Number.isNaN(v)) return '-';
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function pfTone(pf) {
  if (pf == null) return 'none';
  if (pf >= PF_TARGET) return 'good';
  if (pf >= PF_WARN) return 'warn';
  return 'bad';
}

export default function PowerUsagePage() {
  const [source] = useState(() => (USE_MOCK ? createPowerMock() : { getPowerSeries, getMeterLatest }));
  const [rangeKey, setRangeKey] = useState('today');
  const [metric, setMetric] = useState('wh'); // 'wh' 유효 | 'varh' 무효
  const [hidden, setHidden] = useState(() => new Set());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    const now = Date.now();
    const w = rangeWindow(rangeKey, now);
    setLoading(true);
    return Promise.all([
      source.getPowerSeries({ from: w.from, to: w.to, unit: w.unit }),
      source.getPowerSeries({ from: w.prevFrom, to: w.prevTo, unit: w.unit }),
      // 현재 부하(kW) = 마지막으로 끝난 한 시간의 사용량
      source.getPowerSeries({ from: Math.floor(now / HOUR) * HOUR - HOUR, to: Math.floor(now / HOUR) * HOUR, unit: 'hour' }),
      source.getMeterLatest(),
    ])
      .then(([cur, prev, lastHour, meters]) => {
        setData({ at: now, window: w, cur, prev, lastHour, meters });
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setTimeout(() => setLoading(false), 300));
  }, [source, rangeKey]);

  useEffect(() => {
    load();
    if (rangeKey === 'yday') return undefined; // 지난 하루는 바뀌지 않는다
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, rangeKey]);

  const toggleEquip = (code) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else if (next.size < FURNACES.length - 1) next.add(code); // 하나는 남긴다
      return next;
    });
  };

  const view = useMemo(() => (data ? buildView(data, hidden) : null), [data, hidden]);

  return (
    <div className="mes-page pw-page">
      <div className="pw-header">
        <div className="pw-title">
          <div className="mes-page-icon"><IconBolt size={20} /></div>
          <div>
            <h2 className="mes-page-title">전력량</h2>
            <span className="pw-sub">KDX300 전력량계 · 설비 {FURNACES.length}대{USE_MOCK && <em className="pw-mock">화면 예시 · MOCK</em>}</span>
          </div>
        </div>
        <div className="pw-seg" role="tablist" aria-label="조회 기간">
          {RANGES.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={rangeKey === r.key} className={rangeKey === r.key ? 'is-on' : ''} onClick={() => setRangeKey(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="pw-head-right">
          <span className={`pw-updated${error ? ' is-error' : ''}`}>{error ? '조회 실패' : '갱신'} <b>{data ? hms(data.at) : '-'}</b></span>
          <button type="button" className={`mes-btn mes-btn-secondary pw-icon-btn${loading ? ' is-spinning' : ''}`} onClick={load} title="새로고침" aria-label="새로고침">
            <IconRefresh size={15} />
          </button>
        </div>
      </div>

      {!view ? (
        <div className="mes-card pw-loading">{error ? '전력량 데이터를 불러오지 못했습니다.' : '전력량을 불러오는 중…'}</div>
      ) : (
        <>
          <div className="pw-equips">
            {view.equips.map((e) => <EquipCard key={e.code} e={e} unit={view.unit} dim={hidden.has(e.code)} onToggle={() => toggleEquip(e.code)} />)}
          </div>

          <div className="pw-row-main">
            <MainChart view={view} metric={metric} setMetric={setMetric} hidden={hidden} toggleEquip={toggleEquip} />
            <ShareCard view={view} metric={metric} />
          </div>

          <div className="pw-row-bottom">
            <MeterTable meters={data.meters} now={data.at} />
            <PfChart view={view} />
          </div>
        </>
      )}
    </div>
  );
}

/** 조회 결과 → 화면용 묶음(구간별·설비별 합계, 역률, 비교) */
function buildView({ window: w, cur, prev, lastHour }, hidden) {
  const unit = cur.unit;
  const multiDay = w.to - w.from > 26 * HOUR;
  const visible = FURNACES.filter((f) => !hidden.has(f.code)).map((f) => f.code);
  const sumBy = (rows, codes) => rows.reduce((a, r) => (codes.includes(r.code) ? { wh: a.wh + r.wh, varh: a.varh + r.varh } : a), { wh: 0, varh: 0 });

  // 구간별(차트용) — kWh / kvarh
  const buckets = cur.buckets.map((ts) => {
    const row = { ts, label: bucketLabel(ts, unit, multiDay), wh: 0, varh: 0 };
    FURNACES.forEach((f) => { row[`wh_${f.code}`] = 0; row[`varh_${f.code}`] = 0; });
    return row;
  });
  const idx = new Map(buckets.map((b, i) => [b.ts, i]));
  cur.rows.forEach((r) => {
    const b = buckets[idx.get(r.ts)];
    if (!b) return;
    b[`wh_${r.code}`] = r.wh / 1000;
    b[`varh_${r.code}`] = r.varh / 1000;
    if (visible.includes(r.code)) { b.wh += r.wh / 1000; b.varh += r.varh / 1000; }
  });
  buckets.forEach((b) => { const pf = pfOf(b.wh, b.varh); b.pf = pf == null ? null : pf * 100; });

  const total = sumBy(cur.rows, visible);
  const prevTotal = sumBy(prev.rows, visible);
  const last = sumBy(lastHour.rows, visible);
  const peak = buckets.reduce((m, b) => (b.wh > (m?.wh ?? -1) ? b : m), null);

  const equips = FURNACES.map((f) => {
    const mine = cur.rows.filter((r) => r.code === f.code);
    const s = sumBy(mine, [f.code]);
    const p = sumBy(prev.rows.filter((r) => r.code === f.code), [f.code]);
    const lh = sumBy(lastHour.rows.filter((r) => r.code === f.code), [f.code]);
    return {
      code: f.code,
      name: f.name,
      status: f.status,
      idleReason: f.idleReason,
      color: EQUIP_COLORS[f.code],
      kwh: s.wh / 1000,
      kvarh: s.varh / 1000,
      pf: pfOf(s.wh, s.varh),
      prevKwh: p.wh / 1000,
      loadKw: lh.wh / 1000,
      share: total.wh > 0 && visible.includes(f.code) ? s.wh / total.wh : 0,
      spark: mine.map((r) => ({ ts: r.ts, v: r.wh / 1000 })),
    };
  });

  return {
    unit,
    multiDay,
    window: w,
    visible,
    buckets,
    equips,
    totalKwh: total.wh / 1000,
    totalKvarh: total.varh / 1000,
    prevKwh: prevTotal.wh / 1000,
    prevKvarh: prevTotal.varh / 1000,
    pf: pfOf(total.wh, total.varh),
    prevPf: pfOf(prevTotal.wh, prevTotal.varh),
    loadKw: last.wh / 1000,
    peak,
  };
}

/** 증감 — 색 대신 화살표+숫자로(전력량 증가가 꼭 나쁜 건 아니라서 중립 색) */
function Delta({ cur, prev, unit = '%', pp = false }) {
  if (prev == null || cur == null || (!pp && prev === 0)) return <span className="pw-delta">비교 없음</span>;
  const d = pp ? (cur - prev) * 100 : ((cur - prev) / prev) * 100;
  if (Math.abs(d) < 0.05) return <span className="pw-delta">변동 없음</span>;
  return (
    <span className={`pw-delta ${d > 0 ? 'is-up' : 'is-down'}`}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1)}{pp ? '%p' : unit}
    </span>
  );
}

function PfBadge({ pf }) {
  const tone = pfTone(pf);
  if (tone === 'none') return <span className="pw-pf is-none">-</span>;
  const label = tone === 'good' ? '양호' : tone === 'warn' ? '주의' : '개선 필요';
  return (
    <span className={`pw-pf is-${tone}`}>
      {tone === 'good' ? <IconCircleCheckFilled size={11} /> : <IconAlertTriangleFilled size={11} />}
      {label}
    </span>
  );
}

// Highcharts는 기본이 UTC라 브라우저(현장 PC) 시간대로 맞춘다
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DAY_SHIFT = [8, 20]; // 주간 근무 시간(시) — 하루 조회 때 배경 띠로 표시

/**
 * 시간대별 사용량 — TREND 온도 차트와 같은 Highcharts 곡선(시간 축, 공통 툴팁·세로 기준선, 드래그 확대).
 * 설비마다 선 하나(채우기 없이 깔끔하게), 한 설비에 올리면 나머지는 흐려진다. 색은 설비에 고정.
 * 값은 그 한 시간 동안의 사용량(= 평균 kW).
 */
function MainChart({ view, metric, setMetric, hidden, toggleEquip }) {
  const unitText = metric === 'wh' ? 'kWh' : 'kvarh';
  const visible = FURNACES.filter((f) => !hidden.has(f.code));
  const visibleKey = visible.map((f) => f.code).join(',');
  const total = metric === 'wh' ? view.totalKwh : view.totalKvarh;
  // 시간당 평균 = 합계 ÷ 조회 구간의 지난 시간
  const hours = Math.max(1 / 60, (Math.min(Date.now(), view.window.to) - view.window.from) / HOUR);

  const options = useMemo(() => {
    const codes = visibleKey.split(',');
    const now = Date.now();
    const first = view.buckets[0]?.ts ?? now;
    const last = view.buckets[view.buckets.length - 1]?.ts ?? now;

    // 배경 띠 — 하루: 주간 근무 시간 / 여러 날: 하루 걸러 옅게(날짜 구분)
    const plotBands = [];
    if (!view.multiDay) {
      const d = new Date(first);
      d.setHours(DAY_SHIFT[0], 0, 0, 0);
      const from = d.getTime();
      d.setHours(DAY_SHIFT[1]);
      plotBands.push({
        from, to: d.getTime(), color: 'rgba(47, 91, 181, 0.035)',
        label: { text: '주간', align: 'left', x: 6, y: 14, style: { fontSize: '10.5px', color: '#9aa3ad', fontWeight: '600' } },
      });
    } else {
      const d = new Date(first);
      d.setHours(0, 0, 0, 0);
      for (let t = d.getTime(), i = 0; t <= last; i += 1) {
        const n = new Date(t);
        n.setDate(n.getDate() + 1);
        if (i % 2 === 1) plotBands.push({ from: t, to: n.getTime(), color: 'rgba(27, 31, 36, 0.025)' });
        t = n.getTime();
      }
    }

    // 진행 중인 시간 — 지금까지 몇 분치라 그대로 그리면 선이 뚝 떨어진다 → 한 시간치로 환산하고 점선으로
    const liveFrac = last + HOUR > now ? Math.max(0.05, (now - last) / HOUR) : 1;
    const series = FURNACES.filter((f) => codes.includes(f.code)).map((f) => {
      const color = EQUIP_COLORS[f.code];
      const data = view.buckets.map((b, i) => {
        const raw = b[`${metric}_${f.code}`];
        const y = Math.round((i === view.buckets.length - 1 ? raw / liveFrac : raw) * 10) / 10;
        // 마지막 값에는 점 + 은은한 테두리
        return i === view.buckets.length - 1
          ? { x: b.ts, y, marker: { enabled: true, radius: 4.5, lineWidth: 2.5, lineColor: '#fff', fillColor: color } }
          : [b.ts, y];
      });
      return {
        id: f.code,
        name: f.code,
        color,
        data,
        zoneAxis: 'x',
        zones: liveFrac < 1 ? [{ value: last - HOUR }, { dashStyle: 'ShortDot' }] : [],
      };
    });

    return {
      chart: {
        type: 'spline',
        animation: false,
        backgroundColor: 'transparent',
        spacing: [16, 8, 6, 0],
        zooming: {
          type: 'x',
          resetButton: {
            position: { align: 'right', x: -6, y: 2 },
            theme: { r: 6, fill: '#fff', stroke: '#cfd4da', 'stroke-width': 1, padding: 6, style: { fontSize: '12px', fontWeight: '600', color: '#234a94' }, states: { hover: { fill: '#f3f6fc' } } },
          },
        },
        panning: { enabled: true, type: 'x' },
        panKey: 'shift',
        style: { fontFamily: 'inherit' },
      },
      time: { timezone: LOCAL_TZ },
      title: { text: null },
      credits: { enabled: false },
      exporting: { enabled: false }, // TREND 화면이 내보내기 모듈을 올려 두면 메뉴 버튼이 생긴다 — 여기선 끈다
      legend: { enabled: false }, // 범례는 위 설비 칩(켜고 끄기 겸용)
      xAxis: {
        type: 'datetime',
        lineWidth: 0,
        tickLength: 0,
        gridLineWidth: view.multiDay ? 1 : 0,
        gridLineColor: '#e6e9ed',
        gridLineDashStyle: 'Dot',
        tickInterval: view.multiDay ? 24 * HOUR : undefined,
        crosshair: { color: '#c3cbd6', width: 1, zIndex: 3 },
        labels: {
          format: view.multiDay ? '{value:%m/%d}' : '{value:%H시}',
          y: 20,
          style: { fontSize: '11px', color: '#8a929c' },
        },
        plotBands,
        plotLines: now <= last + HOUR ? [{
          value: now, color: LINE_BLUE, width: 1, dashStyle: 'ShortDash', zIndex: 4,
          label: { text: '지금', rotation: 0, align: 'right', x: -4, y: 12, style: { fontSize: '10.5px', fontWeight: '700', color: '#4a68ad' } },
        }] : [],
      },
      yAxis: {
        min: 0,
        title: { text: null },
        gridLineColor: '#eef0f3',
        gridLineDashStyle: 'Dash',
        tickAmount: 5,
        labels: {
          align: 'left',
          x: 0,
          y: -4,
          style: { fontSize: '10.5px', color: '#9aa3ad' },
          formatter() { return this.isLast ? `${Highcharts.numberFormat(this.value, 0, '.', ',')} ${unitText}` : Highcharts.numberFormat(this.value, 0, '.', ','); },
        },
      },
      tooltip: {
        shared: true,
        useHTML: true,
        outside: true,
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderWidth: 1,
        borderColor: '#e1e4e8',
        borderRadius: 10,
        shadow: { color: 'rgba(16, 24, 40, 0.12)', offsetX: 0, offsetY: 6, width: 14 },
        padding: 12,
        formatter() {
          // Highcharts.dateFormat은 UTC 기준이라 쓰지 않고 브라우저 시간으로 직접 만든다
          const d0 = new Date(this.x);
          const d1 = new Date(this.x + HOUR);
          const day = view.multiDay ? `${d0.getMonth() + 1}월 ${d0.getDate()}일 ` : '';
          const live = this.x === last && liveFrac < 1;
          const head = `${day}${pad(d0.getHours())}:00 – ${pad(d1.getHours())}:00${live ? ' · 진행 중(한 시간 환산)' : ''}`;
          let sum = 0;
          const rows = [...this.points].sort((a, b) => b.y - a.y).map((pt) => {
            sum += pt.y;
            return '<div style="display:flex;align-items:center;gap:8px;line-height:21px">'
              + `<span style="width:3px;height:14px;border-radius:2px;background:${pt.color}"></span>`
              + `<span style="color:#57606a;font-weight:600">${pt.series.name}</span>`
              + `<span style="margin-left:auto;padding-left:20px;color:#1b1f24;font-weight:700">${fmtEnergy(pt.y)}</span></div>`;
          }).join('');
          return '<div style="font-size:12px;font-variant-numeric:tabular-nums;min-width:170px">'
            + `<div style="font-size:11.5px;font-weight:600;color:#8a929c;margin-bottom:6px">${head}</div>${rows}`
            + '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:7px;padding-top:7px;border-top:1px solid #eef0f3">'
            + `<span style="color:#57606a">합계</span><span><b style="font-size:14px;color:#1b1f24">${fmtEnergy(sum)}</b> <span style="color:#8a929c">${unitText}</span></span></div></div>`;
        },
      },
      plotOptions: {
        series: {
          animation: false,
          lineWidth: 2.5,
          threshold: null,
          turboThreshold: 0,
          linecap: 'round',
          marker: { enabled: false, radius: 3, symbol: 'circle', lineWidth: 2, lineColor: '#fff', states: { hover: { radius: 5, lineWidth: 2.5 } } },
          states: { hover: { lineWidth: 3, halo: { size: 9, opacity: 0.18 } }, inactive: { opacity: 0.22 } },
        },
      },
      series,
    };
  }, [view, metric, visibleKey, unitText]);

  return (
    <section className="mes-card pw-card pw-main">
      <header className="pw-card-head">
        <div>
          <h3>시간대별 {metric === 'wh' ? '유효전력량' : '무효전력량'}</h3>
          <p className="pw-main-sum">
            합계 <b>{fmtEnergy(total)}</b> {unitText}
            <span aria-hidden="true">·</span>
            시간당 평균 <b>{fmtEnergy(total / hours)}</b> {metric === 'wh' ? 'kW' : 'kvar'}
            <span aria-hidden="true">·</span>
            <em>드래그하면 확대 · Shift+드래그 이동</em>
          </p>
        </div>
        <div className="pw-seg is-sm" role="tablist" aria-label="표시 값">
          <button type="button" role="tab" aria-selected={metric === 'wh'} className={metric === 'wh' ? 'is-on' : ''} onClick={() => setMetric('wh')}>유효 kWh</button>
          <button type="button" role="tab" aria-selected={metric === 'varh'} className={metric === 'varh' ? 'is-on' : ''} onClick={() => setMetric('varh')}>무효 kvarh</button>
        </div>
      </header>

      {/* 범례 겸 필터 — 설비별 합계도 같이, 누르면 그 설비를 빼고/넣고 본다(색은 설비에 고정) */}
      <div className="pw-legend" role="group" aria-label="설비 표시">
        {view.equips.map((e) => {
          const off = hidden.has(e.code);
          return (
            <button key={e.code} type="button" className={`pw-chip${off ? ' is-off' : ''}`} aria-pressed={!off} onClick={() => toggleEquip(e.code)} title={off ? '눌러서 표시' : '눌러서 숨기기'}>
              <i style={{ background: e.color }} />
              <span className="pw-chip-code">{e.code}</span>
              <span className="pw-chip-val">{fmtEnergy(metric === 'wh' ? e.kwh : e.kvarh)}</span>
            </button>
          );
        })}
      </div>

      <div className="pw-chart" role="img" aria-label={`시간대별 ${metric === 'wh' ? '유효' : '무효'}전력량 설비별 선 그래프`}>
        <HighchartsReact highcharts={Highcharts} options={options} updateArgs={[true, true, false]} containerProps={{ style: { height: '100%' } }} />
      </div>
    </section>
  );
}

/** 막대 끝 라벨 — '3,849 kWh · 18.3%' */
function ShareLabel({ x, y, width, height, index, data, unitText }) {
  const d = data[index];
  if (!d) return null;
  return (
    <text x={x + width + 8} y={y + height / 2} dominantBaseline="central" fontSize={12} fill="#1b1f24">
      <tspan fontWeight={700}>{fmtEnergy(d.value)}</tspan>
      <tspan fill="#7d858f"> {unitText} · </tspan>
      <tspan fontWeight={700} fill="#57606a">{(d.share * 100).toFixed(1)}%</tspan>
    </text>
  );
}

function ShareTooltip({ active, payload, unitText }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="pw-tip">
      <div className="pw-tip-title">{d.code}</div>
      <div className="pw-tip-row"><i style={{ background: d.color }} /><span>사용량</span><b>{fmtEnergy(d.value)} {unitText}</b></div>
      <div className="pw-tip-row"><span>비중</span><b>{(d.share * 100).toFixed(1)}%</b></div>
    </div>
  );
}

/** 설비별 사용 비중 — 많이 쓴 순 가로 막대(막대 끝에 값과 비중) */
function ShareCard({ view, metric }) {
  const key = metric === 'wh' ? 'kwh' : 'kvarh';
  const unitText = metric === 'wh' ? 'kWh' : 'kvarh';
  const items = view.equips.filter((e) => view.visible.includes(e.code));
  const total = items.reduce((a, e) => a + e[key], 0);
  const data = [...items]
    .sort((a, b) => b[key] - a[key])
    .map((e) => ({ code: e.code, color: e.color, value: e[key], share: total ? e[key] / total : 0 }));

  return (
    <section className="mes-card pw-card pw-share">
      <header className="pw-card-head">
        <div>
          <h3>설비별 사용 비중</h3>
          <p>{metric === 'wh' ? '유효전력량' : '무효전력량'} 기준 · 많이 쓴 순</p>
        </div>
        <div className="pw-share-total">
          <span>합계</span>
          <b>{fmtEnergy(total)}</b>
          <small>{unitText}</small>
        </div>
      </header>
      <div className="pw-share-chart" role="img" aria-label={`설비별 ${metric === 'wh' ? '유효' : '무효'}전력량 비중 가로 막대 차트`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 128, bottom: 4, left: 0 }} barCategoryGap="26%">
            <CartesianGrid horizontal={false} stroke="#eceef1" />
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="code" width={52} tickLine={false} axisLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#1b1f24' }} />
            <RTooltip content={<ShareTooltip unitText={unitText} />} cursor={{ fill: 'rgba(47, 91, 181, 0.06)' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={26}>
              {data.map((d) => <Cell key={d.code} fill={d.color} />)}
              <LabelList dataKey="value" content={<ShareLabel data={data} unitText={unitText} />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function EquipCard({ e, unit, dim, onToggle }) {
  const idle = e.status === 'idle';
  return (
    <section className={`mes-card pw-equip${dim ? ' is-dim' : ''}`} style={{ '--c': e.color }} aria-label={`${e.code} 전력량`}>
      <header>
        <i className="pw-equip-dot" aria-hidden="true" />
        <strong>{e.code}</strong>
        <span className={`pw-equip-status is-${e.status}`}>
          {idle && <IconTool size={11} />}
          {e.status === 'alarm' && <IconAlertTriangleFilled size={11} />}
          {idle ? (e.idleReason ?? STATUS_LABEL.idle) : STATUS_LABEL[e.status]}
        </span>
        <button type="button" className="pw-equip-toggle" onClick={onToggle} aria-pressed={!dim} title={dim ? '차트에 표시' : '차트에서 숨기기'}>
          {dim ? '숨김' : '표시 중'}
        </button>
      </header>
      <div className="pw-equip-main">
        <div>
          <span className="pw-equip-label">유효전력량</span>
          <span className="pw-equip-value">{fmtEnergy(e.kwh)}<small>kWh</small></span>
        </div>
        <div className="pw-equip-pf">
          <span className="pw-equip-label">역률</span>
          <span className={`pw-equip-pf-v is-${pfTone(e.pf)}`}>{e.pf == null ? '-' : (e.pf * 100).toFixed(1)}<small>%</small></span>
        </div>
      </div>
      <div className="pw-equip-spark" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={e.spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`pw-g-${e.code}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={e.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={e.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={e.color} strokeWidth={2} fill={`url(#pw-g-${e.code})`} isAnimationActive={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <dl className="pw-equip-stats">
        <div><dt>무효전력량</dt><dd>{fmtEnergy(e.kvarh)} <small>kvarh</small></dd></div>
        <div><dt>현재 부하</dt><dd>{fmtEnergy(e.loadKw)} <small>kW</small></dd></div>
        <div><dt>비중</dt><dd>{dim ? '-' : `${(e.share * 100).toFixed(1)}%`}</dd></div>
      </dl>
      <div className="pw-equip-foot">
        <IconClockHour4 size={12} />
        {unit === 'hour' ? '시간대별' : '일별'} 유효전력량 추이 · <Delta cur={e.kwh} prev={e.prevKwh} /> 직전 대비
      </div>
    </section>
  );
}

function PfTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="pw-tip">
      <div className="pw-tip-title">{label}</div>
      <div className="pw-tip-row"><span>역률</span><b>{v == null ? '-' : `${v.toFixed(1)}%`}</b></div>
    </div>
  );
}

function PfChart({ view }) {
  const vals = view.buckets.map((b) => b.pf).filter((v) => v != null);
  const lo = Math.max(60, Math.floor(Math.min(PF_WARN * 100, ...vals) - 3));
  return (
    <section className="mes-card pw-card pw-pfcard">
      <header className="pw-card-head">
        <div>
          <h3>역률 추이</h3>
          <p>선택한 설비 합계 기준 · 목표 {PF_TARGET * 100}% / 주의 {PF_WARN * 100}%</p>
        </div>
        <PfBadge pf={view.pf} />
      </header>
      <div className="pw-chart is-sm" role="img" aria-label="역률 추이 차트">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={view.buckets} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="pw-pf-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE_BLUE} stopOpacity={0.18} />
                <stop offset="100%" stopColor={LINE_BLUE} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#eceef1" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#d5d9de' }} tick={{ fontSize: 11, fill: '#7d858f' }} interval="preserveStartEnd" minTickGap={10} />
            <YAxis domain={[lo, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#7d858f' }} width={40} tickFormatter={(v) => `${v}%`} />
            <RTooltip content={<PfTooltip />} cursor={{ stroke: '#cfd4da', strokeDasharray: '3 3' }} />
            <ReferenceLine y={PF_TARGET * 100} stroke="#7cc3a0" strokeDasharray="4 4" label={{ value: `목표 ${PF_TARGET * 100}%`, position: 'insideTopRight', fontSize: 11, fill: '#1a7f4e' }} />
            <ReferenceLine y={PF_WARN * 100} stroke="#eba29c" strokeDasharray="2 4" label={{ value: `주의 ${PF_WARN * 100}%`, position: 'insideBottomRight', fontSize: 11, fill: '#cf3b32' }} />
            <Area type="monotone" dataKey="pf" stroke={LINE_BLUE} strokeWidth={2.25} fill="url(#pw-pf-g)" isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function MeterTable({ meters, now }) {
  return (
    <section className="mes-card pw-card pw-meters">
      <header className="pw-card-head">
        <div>
          <h3>계량기 현재값</h3>
          <p>KDX300 누적값 원본 · 사용량은 이 값의 구간 차이</p>
        </div>
      </header>
      <div className="pw-table-wrap">
        <table className="pw-table">
          <thead>
            <tr>
              <th scope="col">설비</th>
              <th scope="col">계량기</th>
              <th scope="col" className="is-num">누적 유효전력량<small>Wh</small></th>
              <th scope="col" className="is-num">누적 무효전력량<small>varh</small></th>
              <th scope="col">수신</th>
            </tr>
          </thead>
          <tbody>
            {meters.map((m) => {
              const ago = Math.max(0, Math.round((now - m.readAt) / 1000));
              return (
                <tr key={m.code}>
                  <td><span className="pw-t-code"><i style={{ background: EQUIP_COLORS[m.code] }} />{m.code}</span></td>
                  <td className="pw-t-meter">{m.meterId}</td>
                  <td className="is-num">{m.whTotal.toLocaleString()}</td>
                  <td className="is-num">{m.varhTotal.toLocaleString()}</td>
                  <td>
                    <span className={`pw-t-status is-${m.status}`} title={new Date(m.readAt).toLocaleString()}>
                      <i />{m.status === 'ok' ? '정상' : '수신 지연'} · {ago < 60 ? `${ago}초 전` : `${Math.floor(ago / 60)}분 전`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
