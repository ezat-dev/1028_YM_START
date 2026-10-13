import { useMemo } from 'react';
import Highcharts from 'highcharts/esm/highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  IconClockPause, IconHourglass, IconTool, IconPlayerPlay, IconAlertTriangle, IconPercentage,
} from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';

/*
 * 비가동 통계 — 지금 조회 조건(기간·설비·구분·검색어)으로 불러온 수동 등록 비가동으로 만든다.
 * 시간 합계는 조회 기간 안에 들어간 부분만 센다(기간 앞뒤로 걸친 비가동은 잘라서, 진행 중은 지금까지).
 */

const TYPES = [
  { value: '계획정지', color: '#ebbd68' },
  { value: '고장정지', color: '#e57373' },
  { value: '대기', color: '#b9c1cd' },
  { value: '기타', color: '#a99bd9' },
];
const TYPE_COLOR = Object.fromEntries(TYPES.map((t) => [t.value, t.color]));
const MIN = 60000;

const pad = (n) => String(n).padStart(2, '0');
const md = (d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
const parse = (v) => (v ? new Date(String(v)).getTime() : null);

function fmtDur(min) {
  const m = Math.round(min ?? 0);
  const h = Math.floor(m / 60);
  if (!h) return `${m}분`;
  return m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`;
}
const hrs = (min) => Math.round((min / 60) * 10) / 10;

/** 조회 결과 → 통계 묶음 */
function buildStats(rows, equipments, from, to) {
  const now = Date.now();
  const pFrom = new Date(`${from}T00:00:00`).getTime();
  const pToDay = new Date(`${to}T00:00:00`);
  pToDay.setDate(pToDay.getDate() + 1);
  const pTo = Math.min(pToDay.getTime(), now);

  const clip = (r) => {
    const s = Math.max(parse(r.startDt), pFrom);
    const e = Math.min(r.endDt ? parse(r.endDt) : now, pTo);
    return { s, e, min: Math.max(0, (e - s) / MIN) };
  };

  const byType = Object.fromEntries(TYPES.map((t) => [t.value, 0]));
  const equipCodes = equipments.length ? equipments.map((e) => e.equipCode) : [...new Set(rows.map((r) => r.equipCode))].sort();
  const byEquip = Object.fromEntries(equipCodes.map((c) => [c, Object.fromEntries(TYPES.map((t) => [t.value, 0]))]));
  const reasonMap = new Map();
  const userMap = new Map();
  const byHour = new Array(24).fill(0);

  // 날짜 칸
  const days = [];
  for (let d = new Date(pFrom); d.getTime() < pTo; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  const dayIdx = (t) => Math.floor((new Date(new Date(t).setHours(0, 0, 0, 0)).getTime() - pFrom) / 864e5);
  const byDay = days.map(() => Object.fromEntries(TYPES.map((t) => [t.value, 0])));

  let total = 0;
  let running = 0;
  let longest = null;
  const fails = [];

  rows.forEach((r) => {
    const type = TYPE_COLOR[r.reasonType] ? r.reasonType : '기타';
    const { s, e, min } = clip(r);
    total += min;
    byType[type] += min;
    if (!byEquip[r.equipCode]) byEquip[r.equipCode] = Object.fromEntries(TYPES.map((t) => [t.value, 0]));
    byEquip[r.equipCode][type] += min;

    // 날짜별로 나눠 담기
    for (let t = s; t < e;) {
      const dEnd = new Date(t);
      dEnd.setHours(24, 0, 0, 0);
      const segEnd = Math.min(e, dEnd.getTime());
      const i = dayIdx(t);
      if (byDay[i]) byDay[i][type] += (segEnd - t) / MIN;
      t = segEnd;
    }

    const rk = `${type}|${r.reasonName}`;
    const rc = reasonMap.get(rk) ?? { name: r.reasonName, type, min: 0, count: 0 };
    rc.min += min;
    rc.count += 1;
    reasonMap.set(rk, rc);

    const st = parse(r.startDt);
    if (st >= pFrom && st < pTo) byHour[new Date(st).getHours()] += 1;

    if (!r.endDt) running += 1;
    const full = r.durationMin ?? 0;
    if (!longest || full > longest.min) longest = { min: full, code: r.equipCode, reason: r.reasonName, running: !r.endDt };
    if (type === '고장정지' && r.endDt) fails.push(full);

    const reg = r.regUserName || r.regUserId ? `${r.regUserName || '-'}${r.regUserId ? ` (${r.regUserId})` : ''}` : '알 수 없음';
    const u = userMap.get(reg) ?? { who: reg, reg: 0, upd: 0 };
    u.reg += 1;
    userMap.set(reg, u);
    if (r.updUserName || r.updUserId) {
      const upd = `${r.updUserName || '-'}${r.updUserId ? ` (${r.updUserId})` : ''}`;
      const v = userMap.get(upd) ?? { who: upd, reg: 0, upd: 0 };
      v.upd += 1;
      userMap.set(upd, v);
    }
  });

  const failCount = rows.filter((r) => r.reasonType === '고장정지').length;
  const available = ((pTo - pFrom) / MIN) * Math.max(1, equipCodes.length);

  return {
    total,
    count: rows.length,
    avg: rows.length ? total / rows.length : 0,
    running,
    longest,
    failCount,
    mttr: fails.length ? fails.reduce((a, b) => a + b, 0) / fails.length : null,
    lossRate: available > 0 ? total / available : 0,
    byType,
    equipCodes,
    byEquip,
    days,
    byDay,
    reasons: [...reasonMap.values()].sort((a, b) => b.min - a.min).slice(0, 10),
    byHour,
    users: [...userMap.values()].sort((a, b) => (b.reg + b.upd) - (a.reg + a.upd)),
  };
}

// Highcharts 공통 모양 — 전력량·설비가동률 화면과 같은 톤
const BASE = {
  chart: { animation: false, backgroundColor: 'transparent', style: { fontFamily: 'inherit' }, spacing: [8, 8, 4, 0] },
  title: { text: null },
  credits: { enabled: false },
  exporting: { enabled: false },
  legend: { enabled: false },
  tooltip: {
    useHTML: true,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderColor: '#e1e4e8',
    borderRadius: 10,
    shadow: { color: 'rgba(16, 24, 40, 0.12)', offsetX: 0, offsetY: 6, width: 14 },
    padding: 10,
    style: { fontSize: '12px' },
  },
  xAxis: { lineColor: '#e1e4e8', tickLength: 0, labels: { style: { fontSize: '11px', color: '#7d858f' } } },
  yAxis: { title: { text: null }, gridLineColor: '#eef0f3', gridLineDashStyle: 'Dash', labels: { style: { fontSize: '10.5px', color: '#9aa3ad' } } },
  plotOptions: { series: { animation: false, borderWidth: 0, borderRadius: 3 } },
};

function stackTip() {
  const rows = this.points.filter((p) => p.y > 0).map((p) => (
    `<div style="display:flex;align-items:center;gap:7px;line-height:20px"><span style="width:8px;height:8px;border-radius:2px;background:${p.color}"></span>`
    + `<span style="color:#57606a">${p.series.name}</span><b style="margin-left:auto;padding-left:16px;color:#1b1f24">${fmtDur(p.y * 60)}</b></div>`
  )).join('');
  const sum = this.points.reduce((a, p) => a + p.y, 0);
  return `<div style="min-width:150px"><div style="font-weight:700;color:#1b1f24;margin-bottom:4px">${this.x}</div>${rows || '<span style="color:#9aa3ad">비가동 없음</span>'}`
    + `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #eef0f3;display:flex;justify-content:space-between;color:#57606a"><span>합계</span><b style="color:#1b1f24">${fmtDur(sum * 60)}</b></div></div>`;
}

export default function DowntimeStats({ rows, equipments, query, onClose }) {
  const st = useMemo(() => buildStats(rows, equipments, query.from, query.to), [rows, equipments, query]);
  const filters = [
    query.equipId && equipments.find((e) => String(e.equipId) === String(query.equipId))?.equipCode,
    query.reasonType,
    query.keyword && `"${query.keyword}"`,
  ].filter(Boolean);

  const equipChart = useMemo(() => ({
    ...BASE,
    chart: { ...BASE.chart, type: 'bar' },
    xAxis: { ...BASE.xAxis, categories: st.equipCodes, labels: { style: { fontSize: '12px', fontWeight: '700', color: '#1b1f24' } } },
    yAxis: { ...BASE.yAxis, labels: { ...BASE.yAxis.labels, format: '{value}h' }, stackLabels: { enabled: true, formatter() { return this.total > 0 ? `${this.total.toFixed(1)}h` : ''; }, style: { fontSize: '11px', fontWeight: '700', color: '#57606a', textOutline: 'none' } } },
    tooltip: { ...BASE.tooltip, shared: true, formatter: stackTip },
    plotOptions: { ...BASE.plotOptions, bar: { stacking: 'normal', pointPadding: 0.12, groupPadding: 0.12, maxPointWidth: 22 } },
    series: TYPES.map((t) => ({ name: t.value, color: t.color, data: st.equipCodes.map((c) => hrs(st.byEquip[c]?.[t.value] ?? 0)) })),
  }), [st]);

  const dayChart = useMemo(() => ({
    ...BASE,
    chart: { ...BASE.chart, type: 'column' },
    xAxis: { ...BASE.xAxis, categories: st.days.map(md) },
    yAxis: { ...BASE.yAxis, labels: { ...BASE.yAxis.labels, format: '{value}h' } },
    tooltip: { ...BASE.tooltip, shared: true, formatter: stackTip },
    plotOptions: { ...BASE.plotOptions, column: { stacking: 'normal', pointPadding: 0.08, groupPadding: 0.1, maxPointWidth: 34 } },
    series: TYPES.map((t) => ({ name: t.value, color: t.color, data: st.byDay.map((d) => hrs(d[t.value])) })),
  }), [st]);

  const reasonChart = useMemo(() => ({
    ...BASE,
    chart: { ...BASE.chart, type: 'bar', spacing: [8, 90, 4, 0] },
    xAxis: { ...BASE.xAxis, categories: st.reasons.map((r) => r.name), labels: { style: { fontSize: '12px', fontWeight: '600', color: '#1b1f24' } } },
    yAxis: { ...BASE.yAxis, visible: false },
    tooltip: {
      ...BASE.tooltip,
      formatter() {
        const r = st.reasons[this.point.index];
        return `<b style="color:#1b1f24">${r.name}</b> <span style="color:#7d858f">${r.type}</span><br/>${fmtDur(r.min)} · ${r.count}건 · 건당 ${fmtDur(r.min / r.count)}`;
      },
    },
    plotOptions: {
      ...BASE.plotOptions,
      bar: {
        pointPadding: 0.14, groupPadding: 0.06, maxPointWidth: 18,
        dataLabels: {
          enabled: true, crop: false, overflow: 'allow', useHTML: true,
          formatter() { const r = st.reasons[this.point.index]; return `<span style="font-size:11.5px;font-weight:700;color:#1b1f24">${fmtDur(r.min)}</span> <span style="font-size:11px;color:#8a929c">· ${r.count}건</span>`; },
        },
      },
    },
    series: [{ name: '비가동', data: st.reasons.map((r) => ({ y: hrs(r.min), color: TYPE_COLOR[r.type] })) }],
  }), [st]);

  const hourChart = useMemo(() => {
    const max = Math.max(1, ...st.byHour);
    return {
      ...BASE,
      chart: { ...BASE.chart, type: 'column' },
      xAxis: { ...BASE.xAxis, categories: st.byHour.map((_, h) => `${h}`), labels: { ...BASE.xAxis.labels, step: 3, format: '{value}시' } },
      yAxis: { ...BASE.yAxis, allowDecimals: false },
      tooltip: { ...BASE.tooltip, formatter() { return `<b style="color:#1b1f24">${this.x}시대</b> 발생 ${this.y}건`; } },
      plotOptions: { ...BASE.plotOptions, column: { pointPadding: 0.06, groupPadding: 0.04 } },
      // 많이 발생한 시간대일수록 진하게
      series: [{ name: '발생', data: st.byHour.map((v) => ({ y: v, color: `rgba(95, 128, 198, ${0.25 + (v / max) * 0.75})` })) }],
    };
  }, [st]);

  const typeTotal = Object.values(st.byType).reduce((a, b) => a + b, 0);

  return (
    <Modal title="비가동 통계" onClose={onClose} xl className="dtm-stats-modal">
      <div className="dts">
        <div className="dts-cond">
          <span>{query.from} ~ {query.to}</span>
          {filters.length > 0 && <span>· {filters.join(' · ')}</span>}
          <em>수동 등록 비가동 기준 · 기간 밖으로 걸친 시간은 잘라서 계산</em>
        </div>

        {st.count === 0 ? (
          <div className="dts-empty">이 조건으로 등록된 비가동이 없습니다.</div>
        ) : (
          <>
            <div className="dts-kpis">
              <div className="dts-kpi is-main">
                <span><IconClockPause size={14} />총 비가동 시간</span>
                <b>{fmtDur(st.total)}</b>
                <small>{st.count}건</small>
              </div>
              <div className="dts-kpi">
                <span><IconPercentage size={14} />비가동률</span>
                <b>{(st.lossRate * 100).toFixed(1)}<i>%</i></b>
                <small>설비 {st.equipCodes.length}대 가능 시간 대비</small>
              </div>
              <div className="dts-kpi">
                <span><IconHourglass size={14} />건당 평균</span>
                <b>{fmtDur(st.avg)}</b>
                <small>비가동 1건 평균 시간</small>
              </div>
              <div className="dts-kpi is-fail">
                <span><IconTool size={14} />고장정지</span>
                <b>{st.failCount}<i>건</i></b>
                <small>평균 복구 {st.mttr == null ? '-' : fmtDur(st.mttr)}</small>
              </div>
              <div className={`dts-kpi${st.running ? ' is-running' : ''}`}>
                <span><IconPlayerPlay size={14} />진행 중</span>
                <b>{st.running}<i>건</i></b>
                <small>종료 시각 미입력</small>
              </div>
              <div className="dts-kpi">
                <span><IconAlertTriangle size={14} />최장 비가동</span>
                <b>{st.longest ? fmtDur(st.longest.min) : '-'}</b>
                <small>{st.longest ? `${st.longest.code} · ${st.longest.reason}${st.longest.running ? ' (진행 중)' : ''}` : ''}</small>
              </div>
            </div>

            <div className="dts-typebar" aria-label="구분별 비중">
              <div className="dts-typebar-bar">
                {TYPES.map((t) => (st.byType[t.value] > 0 ? (
                  <i key={t.value} style={{ width: `${(st.byType[t.value] / typeTotal) * 100}%`, background: t.color }} title={`${t.value} ${fmtDur(st.byType[t.value])}`} />
                ) : null))}
              </div>
              <div className="dts-typebar-legend">
                {TYPES.map((t) => (
                  <span key={t.value}>
                    <i style={{ background: t.color }} />{t.value}
                    <b>{fmtDur(st.byType[t.value])}</b>
                    <em>{typeTotal ? ((st.byType[t.value] / typeTotal) * 100).toFixed(1) : '0.0'}%</em>
                  </span>
                ))}
              </div>
            </div>

            <div className="dts-grid">
              <section className="dts-card">
                <h4>설비별 비가동 시간 <small>구분별 누적</small></h4>
                <div className="dts-chart" style={{ height: Math.max(200, st.equipCodes.length * 38) }}>
                  <HighchartsReact highcharts={Highcharts} options={equipChart} containerProps={{ style: { height: '100%' } }} />
                </div>
              </section>
              <section className="dts-card">
                <h4>비가동 사유 TOP {st.reasons.length} <small>시간 순</small></h4>
                <div className="dts-chart" style={{ height: Math.max(200, st.reasons.length * 32) }}>
                  <HighchartsReact highcharts={Highcharts} options={reasonChart} containerProps={{ style: { height: '100%' } }} />
                </div>
              </section>
              <section className="dts-card is-wide">
                <h4>일별 비가동 추이 <small>구분별 누적 · 시간</small></h4>
                <div className="dts-chart" style={{ height: 220 }}>
                  <HighchartsReact highcharts={Highcharts} options={dayChart} containerProps={{ style: { height: '100%' } }} />
                </div>
              </section>
              <section className="dts-card">
                <h4>시간대별 발생 건수 <small>비가동 시작 시각 기준</small></h4>
                <div className="dts-chart" style={{ height: 200 }}>
                  <HighchartsReact highcharts={Highcharts} options={hourChart} containerProps={{ style: { height: '100%' } }} />
                </div>
              </section>
              <section className="dts-card">
                <h4>등록·수정자</h4>
                <table className="dts-table">
                  <thead><tr><th>사용자 (ID)</th><th className="is-num">등록</th><th className="is-num">수정</th></tr></thead>
                  <tbody>
                    {st.users.map((u) => (
                      <tr key={u.who}><td>{u.who}</td><td className="is-num">{u.reg}</td><td className="is-num">{u.upd || '-'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="dts-card is-wide">
                <h4>설비 × 구분 <small>비가동 시간 표</small></h4>
                <div className="dts-table-wrap">
                  <table className="dts-table is-matrix">
                    <thead>
                      <tr>
                        <th>설비</th>
                        {TYPES.map((t) => <th key={t.value} className="is-num"><i style={{ background: t.color }} />{t.value}</th>)}
                        <th className="is-num">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {st.equipCodes.map((c) => {
                        const e = st.byEquip[c] ?? {};
                        const sum = TYPES.reduce((a, t) => a + (e[t.value] ?? 0), 0);
                        return (
                          <tr key={c}>
                            <td><b>{c}</b></td>
                            {TYPES.map((t) => <td key={t.value} className={`is-num${e[t.value] ? '' : ' is-zero'}`}>{e[t.value] ? fmtDur(e[t.value]) : '-'}</td>)}
                            <td className="is-num is-sum">{sum ? fmtDur(sum) : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>합계</td>
                        {TYPES.map((t) => <td key={t.value} className="is-num">{st.byType[t.value] ? fmtDur(st.byType[t.value]) : '-'}</td>)}
                        <td className="is-num is-sum">{fmtDur(st.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
