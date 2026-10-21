import { IconCircleCheckFilled, IconAlertTriangleFilled, IconInfoCircleFilled } from '@tabler/icons-react';
import { TARGET, fmt, verdict, setTone } from './capability';

/*
 * CPK·PPK 화면 아래쪽 '쓸모 있는 정보' — 서버가 준 부분군(cap.subgroups)으로 화면에서 계산한다.
 *  - 예상 불량률(ppm): 정규분포 가정, CPK는 부분군 내 σ, PPK는 전체 σ
 *  - 중심 치우침: 평균이 규격 중심에서 얼마나 벗어났는지, 중심만 맞추면 오를 수 있는 지수(Cp/Pp)
 *  - 관리 상태(CPK) / LOT 간 차이(PPK)
 *  - 설비별·구분(초물/중물/종물)별 비교, LOT별 요약
 */

const D2 = [0, 0, 1.128, 1.693, 2.059, 2.326, 2.534, 2.704, 2.847, 2.970, 3.078];

/** 표준정규 누적분포 Φ(z) — Abramowitz-Stegun 근사 */
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const p = 0.3989423 * Math.exp((-z * z) / 2)
    * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** 규격 밖으로 나갈 예상 비율(ppm) */
export function expectedPpm(mean, sigma, lsl, usl) {
  if (!sigma || sigma <= 0 || mean == null) return null;
  const below = lsl != null ? phi((lsl - mean) / sigma) : 0;
  const above = usl != null ? 1 - phi((usl - mean) / sigma) : 0;
  return { below: below * 1e6, above: above * 1e6, total: (below + above) * 1e6 };
}

const fmtPpm = (v) => {
  if (v == null) return '-';
  if (v < 0.1) return '< 0.1';
  if (v < 10) return v.toFixed(1);
  return Math.round(v).toLocaleString('ko-KR');
};

function indexOf(mean, sigma, lsl, usl) {
  if (!sigma || sigma <= 0) return null;
  const u = usl != null ? (usl - mean) / (3 * sigma) : null;
  const l = lsl != null ? (mean - lsl) / (3 * sigma) : null;
  if (u == null) return l;
  if (l == null) return u;
  return Math.min(u, l);
}

/** 부분군 묶음 → 통계(그룹 기준 keyOf) */
export function groupStats(cap, keyOf) {
  const n = cap.subgroupSize;
  const lsl = cap.spec?.lsl;
  const usl = cap.spec?.usl;
  const map = new Map();
  cap.subgroups.forEach((g) => {
    const k = keyOf(g) || '-';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(g);
  });
  return [...map.entries()].map(([key, subs]) => {
    const vals = subs.flatMap((g) => g.values);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sdo = vals.length > 1 ? Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length - 1)) : null;
    const rBar = subs.reduce((a, g) => a + g.range, 0) / subs.length;
    const sw = D2[n] ? rBar / D2[n] : null;
    return {
      key,
      k: subs.length,
      count: vals.length,
      mean,
      sigmaWithin: sw,
      sigmaOverall: sdo,
      min: Math.min(...vals),
      max: Math.max(...vals),
      out: vals.filter((v) => (lsl != null && v < lsl) || (usl != null && v > usl)).length,
      cpk: subs.length >= 2 ? indexOf(mean, sw, lsl, usl) : null,
      ppk: vals.length >= 2 ? indexOf(mean, sdo, lsl, usl) : null,
    };
  });
}

/** 숫자로 보는 요약 4칸 + 자동 진단 */
export function Insights({ cap, kind }) {
  const isCpk = kind === 'cpk';
  const s = cap.spec;
  const d = s?.decimals ?? 1;
  const unit = s?.unit ?? '';
  const sigma = isCpk ? cap.sigmaWithin : cap.sigmaOverall;
  const idx = isCpk ? cap.cpk : cap.ppk;
  const potential = isCpk ? cap.cp : cap.pp;
  const ppm = expectedPpm(cap.mean, sigma, s?.lsl, s?.usl);
  const mid = s?.lsl != null && s?.usl != null ? (s.lsl + s.usl) / 2 : null;
  const target = s?.target ?? mid;
  const shift = target != null ? cap.mean - target : null;
  const outX = cap.subgroups.filter((g) => g.mean > cap.uclX || g.mean < cap.lclX).length;
  const outR = cap.subgroups.filter((g) => g.range > cap.uclR).length;
  const ratio = cap.sigmaWithin ? cap.sigmaOverall / cap.sigmaWithin : null;
  const byEquip = groupStats(cap, (g) => g.equipCode).filter((r) => r.key !== '-');
  const worstEquip = [...byEquip].filter((r) => (isCpk ? r.cpk : r.ppk) != null)
    .sort((a, b) => (isCpk ? a.cpk - b.cpk : a.ppk - b.ppk))[0];

  // 자동 진단 — 지금 숫자로 할 수 있는 말만
  const notes = [];
  const v = verdict(idx, kind);
  if (idx != null) {
    notes.push(v.tone === 'good'
      ? { tone: 'good', text: `${kind.toUpperCase()} ${fmt(idx)}로 기준(${TARGET[kind]})을 충족합니다.` }
      : { tone: 'warn', text: `${kind.toUpperCase()} ${fmt(idx)}로 기준(${TARGET[kind]})에 못 미칩니다. 예상 규격 밖 ${fmtPpm(ppm?.total)} ppm.` });
  }
  if (potential != null && idx != null && potential - idx >= 0.15 && shift != null) {
    notes.push({ tone: 'info', text: `평균이 ${s?.target != null ? '목표' : '규격 중심'}보다 ${Math.abs(shift).toFixed(d + 1)} ${unit} ${shift > 0 ? '높습니다' : '낮습니다'}. 중심만 맞추면 ${isCpk ? 'Cp' : 'Pp'} ${fmt(potential)}까지 오를 수 있습니다.` });
  }
  if (isCpk && (outX || outR)) {
    notes.push({ tone: 'warn', text: `관리 한계를 벗어난 부분군이 있습니다(X̄ ${outX}개 · R ${outR}개). 해당 LOT의 조건을 확인하세요.` });
  }
  if (!isCpk && cap.cpk != null && cap.ppk != null && cap.cpk - cap.ppk >= 0.15) {
    notes.push({ tone: 'info', text: `PPK가 CPK(${fmt(cap.cpk)})보다 낮습니다 — LOT·설비 사이 평균 차이가 흩어짐을 키우고 있습니다.` });
  }
  if (worstEquip && byEquip.length > 1) {
    const wi = isCpk ? worstEquip.cpk : worstEquip.ppk;
    if (verdict(wi, kind).tone !== 'good') notes.push({ tone: 'warn', text: `설비 중 ${worstEquip.key}의 ${kind.toUpperCase()}가 ${fmt(wi)}로 가장 낮습니다(평균 ${worstEquip.mean.toFixed(d + 1)} ${unit}).` });
  }
  if (cap.outOfSpec > 0) notes.push({ tone: 'warn', text: `실제로 규격을 벗어난 값이 ${cap.outOfSpec}개 있습니다.` });

  return (
    <div className={`hd-insights is-${kind}`}>
      <div className="hd-insight-grid">
        <div className="hd-insight">
          <span>예상 규격 밖</span>
          <b>{fmtPpm(ppm?.total)}<small>ppm</small></b>
          <em>
            {s?.lsl != null && <>하한 밑 {fmtPpm(ppm?.below)}</>}
            {s?.lsl != null && s?.usl != null && ' · '}
            {s?.usl != null && <>상한 위 {fmtPpm(ppm?.above)}</>}
          </em>
        </div>
        <div className="hd-insight">
          <span>실제 규격 밖</span>
          <b>{cap.outOfSpec}<small>/ {cap.totalCount}개</small></b>
          <em>{cap.totalCount ? `${((cap.outOfSpec / cap.totalCount) * 100).toFixed(2)}%` : '-'}</em>
        </div>
        <div className="hd-insight">
          <span>중심 치우침</span>
          <b>{shift == null ? '-' : `${shift > 0 ? '+' : ''}${shift.toFixed(d + 1)}`}<small>{unit}</small></b>
          <em>{target == null ? '한쪽 규격' : `${s?.target != null ? '목표' : '중심'} ${Number(target).toFixed(d)} 기준 · ${isCpk ? 'Cp' : 'Pp'} ${fmt(potential)}`}</em>
        </div>
        {isCpk ? (
          <div className={`hd-insight${outX || outR ? ' is-warn' : ''}`}>
            <span>관리 상태</span>
            <b>{outX || outR ? '이탈 있음' : '안정'}</b>
            <em>한계 밖 X̄ {outX} · R {outR} / {cap.subgroupCount}부분군</em>
          </div>
        ) : (
          <div className={`hd-insight${ratio && ratio >= 1.2 ? ' is-warn' : ''}`}>
            <span>LOT 간 차이</span>
            <b>{ratio == null ? '-' : `×${ratio.toFixed(2)}`}</b>
            <em>σ전체 ÷ σ부분군 내 · 1에 가까울수록 LOT 간 차이가 적음</em>
          </div>
        )}
      </div>
      {notes.length > 0 && (
        <ul className="hd-diag">
          {notes.slice(0, 5).map((n, i) => (
            <li key={i} className={`is-${n.tone}`}>
              {n.tone === 'good' ? <IconCircleCheckFilled size={15} /> : n.tone === 'warn' ? <IconAlertTriangleFilled size={15} /> : <IconInfoCircleFilled size={15} />}
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 설비별 / 구분별 비교 표 */
export function Breakdown({ cap, kind, by }) {
  const isCpk = kind === 'cpk';
  const d = cap.spec?.decimals ?? 1;
  const rows = groupStats(cap, by === 'equip' ? (g) => g.equipCode : (g) => g.setType)
    .sort((a, b) => (by === 'set' ? ['초물', '중물', '종물'].indexOf(a.key) - ['초물', '중물', '종물'].indexOf(b.key) : a.key.localeCompare(b.key)));
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.mean - cap.mean)), 1e-9);
  if (rows.length < 2) return null; // 비교할 묶음이 하나뿐이면(한 호기 · CHECK SHEET 한 종류) 보여 줄 게 없다
  return (
    <section className="mes-card hd-card">
      <h4 className="hd-card-title">{by === 'equip' ? '설비별' : '초물 · 중물 · 종물별'} <small>평균이 전체 평균에서 얼마나 떨어졌는지 막대로</small></h4>
      <div className="hd-table-wrap is-short">
        <table className="hd-table hd-break">
          <thead>
            <tr>
              <th>{by === 'equip' ? '설비' : '구분'}</th>
              <th className="is-num">값</th>
              <th className="is-num">평균</th>
              <th className="hd-dev-col">전체 평균 대비</th>
              <th className="is-num">σ</th>
              <th className="is-num">최소 ~ 최대</th>
              <th className="is-num">규격 밖</th>
              <th className="is-num">{isCpk ? 'CPK' : 'PPK'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dev = r.mean - cap.mean;
              const w = Math.min(50, (Math.abs(dev) / maxAbs) * 50);
              const idx = isCpk ? r.cpk : r.ppk;
              const v = verdict(idx, kind);
              return (
                <tr key={r.key}>
                  <td>{by === 'set' ? <span className={`hd-set-tag is-${setTone(r.key)}`}>{r.key}</span> : <b>{r.key}</b>}</td>
                  <td className="is-num is-dim">{r.count}</td>
                  <td className="is-num is-strong">{r.mean.toFixed(d + 1)}</td>
                  <td className="hd-dev-col">
                    <span className="hd-dev" title={`${dev > 0 ? '+' : ''}${dev.toFixed(d + 1)}`}>
                      <i className={dev >= 0 ? 'is-up' : 'is-down'} style={{ width: `${w}%` }} />
                      <em>{dev > 0 ? '+' : ''}{dev.toFixed(d + 1)}</em>
                    </span>
                  </td>
                  <td className="is-num">{fmt(isCpk ? r.sigmaWithin : r.sigmaOverall, d + 1)}</td>
                  <td className="is-num is-dim">{r.min.toFixed(d)} ~ {r.max.toFixed(d)}</td>
                  <td className={`is-num${r.out ? ' is-ng' : ''}`}>{r.out}</td>
                  <td className="is-num"><span className={`hd-idx-chip is-${v.tone}`}>{fmt(idx)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** LOT(측정)별 요약 — PPK 화면 */
export function LotSummary({ cap }) {
  const d = cap.spec?.decimals ?? 1;
  const lsl = cap.spec?.lsl;
  const usl = cap.spec?.usl;
  const map = new Map();
  cap.subgroups.forEach((g) => {
    if (!map.has(g.measId)) map.set(g.measId, { ...g, vals: [] });
    map.get(g.measId).vals.push(...g.values);
  });
  const rows = [...map.values()].reverse(); // 최신 먼저
  const span = (usl ?? cap.max) - (lsl ?? cap.min) || 1;
  const lo = lsl ?? cap.min;
  const pos = (v) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%`;
  return (
    <section className="mes-card hd-card">
      <h4 className="hd-card-title">LOT별 요약 <small>{rows.length}건 · 최신순 · 막대는 규격 범위 안에서 최소~최대</small></h4>
      <div className="hd-table-wrap">
        <table className="hd-table">
          <thead>
            <tr>
              <th>측정번호</th><th>LOT</th><th>설비</th><th>측정일</th>
              <th className="is-num">값</th><th className="is-num">평균</th><th className="hd-lot-range">분포 (규격 안)</th><th className="is-num">규격 밖</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mean = r.vals.reduce((a, b) => a + b, 0) / r.vals.length;
              const mn = Math.min(...r.vals);
              const mx = Math.max(...r.vals);
              const out = r.vals.filter((v) => (lsl != null && v < lsl) || (usl != null && v > usl)).length;
              return (
                <tr key={r.measId}>
                  <td>{r.measNo}</td>
                  <td>{r.lotNo || '-'}</td>
                  <td>{r.equipCode || '-'}</td>
                  <td className="is-dim">{String(r.measDt ?? '').replace('T', ' ').slice(5, 16)}</td>
                  <td className="is-num is-dim">{r.vals.length}</td>
                  <td className="is-num is-strong">{mean.toFixed(d + 1)}</td>
                  <td className="hd-lot-range">
                    <span className="hd-lot-bar">
                      <i style={{ left: pos(mn), width: `calc(${pos(mx)} - ${pos(mn)})` }} />
                      <b style={{ left: pos(mean) }} />
                    </span>
                  </td>
                  <td className={`is-num${out ? ' is-ng' : ''}`}>{out}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
