import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IconPlayerPauseFilled, IconPlayerPlayFilled, IconChevronLeft, IconChevronRight, IconMaximize,
  IconMinimize, IconX, IconRefresh,
} from '@tabler/icons-react';
import { getSpecList, getCapability } from '../../api/quality/hardnessApi';
import {
  ChartViewContext, XbarChart, RChart, HistogramChart, RunChart, useBoxHeight, verdict, fmt, TARGET, equipLabel, subgroupText,
} from './capability';
import { expectedPpm } from './capabilityInsights';
import './capabilityMonitor.css';

/*
 * CPK / PPK 대형 모니터링 — 사이드바 없이 전체 화면. 최근에 측정한 규격부터 자동으로 돌려 보여 준다.
 *  - 한 바퀴 돌 때마다(그리고 5분마다) 규격·분석을 다시 불러와 새 측정이 바로 반영된다.
 *  - 모니터 크기에 맞춰 글자·차트를 키운다(화면 비율이 세로면 위아래로 쌓는다).
 *  - 키: Space 멈춤/재생 · ←/→ 이전/다음 · F 전체 화면
 */

const INTERVALS = [10, 20, 30, 60];
const PERIODS = [{ days: 30, label: '30일' }, { days: 90, label: '90일' }, { days: 180, label: '180일' }];
const REFRESH_MS = 5 * 60 * 1000;
const IDLE_MS = 4000;

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;
const readNum = (key, def, allowed) => {
  try {
    const v = Number(localStorage.getItem(key));
    return allowed.includes(v) ? v : def;
  } catch {
    return def;
  }
};
const saveNum = (key, v) => { try { localStorage.setItem(key, String(v)); } catch { /* 저장 못 해도 동작 */ } };
const fullscreenOn = () => !!document.fullscreenElement;

/** 화면 크기 → 차트 글자 배율 (1920×1080 기준, 넓이 비례 — 4:3·세로 모니터도 너무 작아지지 않게) */
const scaleOf = () => Math.min(2.4, Math.max(0.85, Math.sqrt((window.innerWidth * window.innerHeight) / (1920 * 1080)) * 1.15));

export default function CapabilityMonitor() {
  const params = useParams();
  const kind = params.kind === 'ppk' ? 'ppk' : 'cpk';
  const isCpk = kind === 'cpk';
  const navigate = useNavigate();

  const [items, setItems] = useState(null); // [{ spec, cap }]
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interval, setIntervalSec] = useState(() => readNum('hd-mon-interval', 20, INTERVALS));
  const [days, setDays] = useState(() => readNum('hd-mon-days', 90, PERIODS.map((p) => p.days)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [period, setPeriod] = useState(null); // 조회 기간 { from, to }
  const [now, setNow] = useState(() => new Date());
  const [fs, setFs] = useState(fullscreenOn);
  const [idle, setIdle] = useState(false);
  const [scale, setScale] = useState(scaleOf);
  const curIdRef = useRef(null);

  // ── 불러오기: 측정이 있는 규격을 최근 측정순으로, 분석이 되는 것만 ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSpecList('', '');
      const specs = (res.data ?? [])
        .filter((s) => s.measCount > 0)
        .sort((a, b) => String(b.lastMeasDt ?? '').localeCompare(String(a.lastMeasDt ?? '')));
      const from = new Date();
      from.setDate(from.getDate() - (days - 1));
      const to = new Date();
      to.setDate(to.getDate() + 1);
      setPeriod({ from: new Date(from), to: new Date() });
      const caps = await Promise.all(specs.map((s) => getCapability(s.specId, isoDay(from), isoDay(to))
        .then((r) => r.data).catch(() => null)));
      const list = specs
        .map((spec, i) => ({ spec, cap: caps[i] }))
        .filter((x) => x.cap && (isCpk ? x.cap.subgroupCount > 0 : x.cap.totalCount > 1));
      setItems(list);
      // 보던 규격이 그대로 있으면 그 자리에서 이어서
      const keep = list.findIndex((x) => x.spec.specId === curIdRef.current);
      setIdx(keep >= 0 ? keep : 0);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err?.response?.data?.message ?? '데이터를 불러오지 못했습니다.');
      setItems((v) => v ?? []);
    } finally {
      setLoading(false);
    }
  }, [days, isCpk]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const t = setInterval(loadAll, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadAll]);

  const count = items?.length ?? 0;
  const current = count ? items[Math.min(idx, count - 1)] : null;
  useEffect(() => { curIdRef.current = current?.spec.specId ?? null; }, [current]);

  // ── 자동 로테이션 — 한 바퀴 돌면 다시 불러온다 ──
  const go = useCallback((delta) => {
    if (!count) return;
    setIdx((i) => {
      const n = (i + delta + count) % count;
      if (delta > 0 && n === 0) setTimeout(loadAll, 0);
      return n;
    });
  }, [count, loadAll]);

  useEffect(() => {
    if (paused || count < 2) return undefined;
    const t = setTimeout(() => go(1), interval * 1000);
    return () => clearTimeout(t);
  }, [paused, count, interval, idx, go]);

  // ── 시계 · 전체 화면 · 화면 크기 · 마우스 안 움직이면 조작부 숨김 ──
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const onFs = () => setFs(fullscreenOn());
    const onResize = () => setScale(scaleOf());
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  useEffect(() => {
    let t;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), IDLE_MS);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  const toggleFs = useCallback(() => {
    if (fullscreenOn()) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('select')) return;
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'f' || e.key === 'F') toggleFs();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, toggleFs]);

  const exit = () => {
    if (fullscreenOn()) document.exitFullscreen?.().catch(() => {});
    navigate(`/quality/${kind}${current ? `?specId=${current.spec.specId}` : ''}`);
  };
  const switchKind = (k) => { if (k !== kind) navigate(`/monitor/${k}`, { replace: true }); };

  const view = useMemo(() => ({ scale, dark: true }), [scale]);

  return (
    <div className={`hm-root${idle ? ' is-idle' : ''}`}>
      <header className="hm-head">
        <div className="hm-brand">
          <h1><em>{kind.toUpperCase()}</em>{isCpk ? '공정능력' : '공정성능'} 모니터링</h1>
          <p>
            <span>경도</span>
            <span>최근 {days}일</span>
            <span>{interval}초마다 최근 측정순 전환</span>
          </p>
        </div>

        <div className="hm-controls">
          <div className="hm-seg" role="group" aria-label="지수">
            {['cpk', 'ppk'].map((k) => (
              <button key={k} type="button" className={k === kind ? 'is-on' : ''} onClick={() => switchKind(k)}>{k.toUpperCase()}</button>
            ))}
          </div>
          <div className="hm-nav" role="group" aria-label="전환">
            <button type="button" onClick={() => go(-1)} disabled={count < 2} aria-label="이전"><IconChevronLeft /></button>
            <button type="button" onClick={() => setPaused((p) => !p)} disabled={count < 2} aria-label={paused ? '재생' : '멈춤'}>
              {paused ? <IconPlayerPlayFilled /> : <IconPlayerPauseFilled />}
            </button>
            <button type="button" onClick={() => go(1)} disabled={count < 2} aria-label="다음"><IconChevronRight /></button>
          </div>
          <label className="hm-select">
            <span>전환</span>
            <select value={interval} onChange={(e) => { const v = Number(e.target.value); setIntervalSec(v); saveNum('hd-mon-interval', v); }}>
              {INTERVALS.map((s) => <option key={s} value={s}>{s}초</option>)}
            </select>
          </label>
          <label className="hm-select">
            <span>기간</span>
            <select value={days} onChange={(e) => { const v = Number(e.target.value); setDays(v); saveNum('hd-mon-days', v); }}>
              {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
            </select>
          </label>
          <button type="button" className="hm-icon-btn" onClick={loadAll} disabled={loading} aria-label="새로고침" title="새로고침">
            <IconRefresh className={loading ? 'is-spin' : ''} />
          </button>
          <button type="button" className="hm-icon-btn" onClick={toggleFs} aria-label={fs ? '전체 화면 끝내기' : '전체 화면'} title={fs ? '전체 화면 끝내기 (F)' : '전체 화면 (F)'}>
            {fs ? <IconMinimize /> : <IconMaximize />}
          </button>
          <button type="button" className="hm-icon-btn is-exit" onClick={exit} aria-label="모니터링 나가기" title="나가기">
            <IconX />
          </button>
        </div>

        <div className="hm-clock">
          <b>{pad(now.getHours())}:{pad(now.getMinutes())}<small>:{pad(now.getSeconds())}</small></b>
          <span>{now.getFullYear()}.{pad(now.getMonth() + 1)}.{pad(now.getDate())} {'일월화수목금토'[now.getDay()]}요일</span>
        </div>
      </header>

      {!current ? (
        <div className="hm-empty">
          {items == null || loading
            ? '불러오는 중…'
            : error || `최근 ${days}일 안에 ${isCpk ? 'CPK' : 'PPK'}를 계산할 완료 측정이 없습니다.`}
        </div>
      ) : (
        <ChartViewContext.Provider value={view}>
          <Slide key={`${current.spec.specId}-${kind}`} item={current} kind={kind} period={period} days={days} />
        </ChartViewContext.Provider>
      )}

      <footer className="hm-foot">
        <ol className="hm-queue">
          {items?.map((x, i) => {
            const v = isCpk ? x.cap.cpk : x.cap.ppk;
            const tone = verdict(v, kind).tone;
            const on = i === idx;
            return (
              <li key={x.spec.specId}>
                <button type="button" className={`hm-tile${on ? ' is-on' : ''}`} onClick={() => setIdx(i)}>
                  <span className="hm-tile-name">{equipLabel(x.spec.equipCode, x.spec.equipName)} · {x.spec.partNo}</span>
                  <span className="hm-tile-item">{x.spec.itemName}</span>
                  <b className={`hm-tone is-${tone}`}>{fmt(v)}</b>
                  {on && count > 1 && (
                    <i
                      key={`${idx}-${interval}-${updatedAt?.getTime()}`}
                      className={`hm-progress${paused ? ' is-paused' : ''}`}
                      style={{ animationDuration: `${interval}s` }}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="hm-foot-meta">
          {count > 0 && <span><b>{idx + 1}</b> / {count}</span>}
          {updatedAt && <span>갱신 {pad(updatedAt.getHours())}:{pad(updatedAt.getMinutes())}</span>}
          {paused && <span className="hm-paused">일시정지</span>}
        </div>
      </footer>
    </div>
  );
}

const md = (d) => (d ? `${d.getMonth() + 1}/${d.getDate()}` : '-');
const ymdDot = (d) => (d ? `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : '-');
const SCALE_MAX = 2.5;
const TICKS = [0, 0.5, 1, 1.5, 2, 2.5];

/** 규격 하나 — 왼쪽 규격·지수·통계, 오른쪽 차트 두 개 */
function Slide({ item, kind, period, days }) {
  const { spec, cap } = item;
  const isCpk = kind === 'cpk';
  const s = cap.spec ?? {};
  const d = s.decimals ?? 1;
  const unit = s.unit ?? '';
  const value = isCpk ? cap.cpk : cap.ppk;
  const v = verdict(value, kind);
  const target = TARGET[kind];
  const sigma = isCpk ? cap.sigmaWithin : cap.sigmaOverall;
  const ppm = expectedPpm(cap.mean, sigma, s.lsl, s.usl);
  const pct = (x) => `${Math.max(0, Math.min(100, (x / SCALE_MAX) * 100))}%`;
  const few = isCpk ? cap.subgroupCount < cap.minSubgroups : cap.totalCount < 30;
  // 중심값(CL): 목표값이 있으면 목표, 없으면 규격 가운데
  const cl = s.target ?? (s.lsl != null && s.usl != null ? (s.lsl + s.usl) / 2 : null);
  const shift = cl != null && cap.mean != null ? cap.mean - cl : null;
  const ppmText = !ppm ? '-' : ppm.total < 0.1 ? '< 0.1' : ppm.total < 10 ? ppm.total.toFixed(1) : Math.round(ppm.total).toLocaleString('ko-KR');
  const num = (x, dec = d) => (x == null ? '-' : Number(x).toFixed(dec));
  // 실제 측정 기간(첫 측정 ~ 마지막 측정)
  const dts = (cap.subgroups ?? []).map((g) => g.measDt).filter(Boolean).sort();
  const first = dts.length ? new Date(dts[0]) : null;
  const last = dts.length ? new Date(dts[dts.length - 1]) : null;
  const lots = new Set((cap.subgroups ?? []).map((g) => g.measId)).size;

  return (
    <main className="hm-main">
      <section className="hm-side">
        {/* 규격 */}
        <div className="hm-spec">
          <div className="hm-spec-title">
            <span className="hm-spec-eq">{equipLabel(spec.equipCode, spec.equipName)}</span>
            <span className="hm-spec-part">{spec.partNo}</span>
            <span className="hm-spec-item">{spec.itemName}{spec.productName ? ` · ${spec.productName}` : ''}</span>
          </div>
          <SpecLine lsl={s.lsl} usl={s.usl} cl={cl} isTarget={s.target != null} mean={cap.mean} min={cap.min} max={cap.max} num={num} unit={unit} />
          <div className="hm-period">
            <span>측정 기간</span>
            <b>{ymdDot(first)} ~ {ymdDot(last)}</b>
            <small>조회 {md(period?.from)} ~ {md(period?.to)} ({days}일) · LOT {lots}개 · 단위 {unit}</small>
          </div>
        </div>

        {/* 지수 — 계기판처럼: 숫자 + 눈금자 */}
        <div className={`hm-hero is-${v.tone}`}>
          <div className="hm-hero-top">
            <span className="hm-hero-name">{kind.toUpperCase()}</span>
            <span className="hm-hero-state"><i />{v.tone === 'good' ? '기준 충족' : v.tone === 'warn' ? '기준 미달' : v.tone === 'bad' ? '능력 부족' : '계산 불가'}</span>
          </div>
          <div className="hm-hero-row">
            <b className="hm-hero-value">{fmt(value)}</b>
            <span className="hm-hero-target">기준<br /><b>≥ {target}</b></span>
          </div>
          <div className="hm-ruler">
            <div className="hm-ruler-bar">
              <span className="z-bad" style={{ width: pct(1) }} />
              <span className="z-warn" style={{ left: pct(1), width: `calc(${pct(target)} - ${pct(1)})` }} />
              <span className="z-good" style={{ left: pct(target), right: 0 }} />
              <span className="hm-ruler-target" style={{ left: pct(target) }} />
              {value != null && <i style={{ left: pct(value) }} />}
            </div>
            <div className="hm-ruler-ticks">
              {TICKS.map((t) => <span key={t} style={{ left: pct(t) }}>{t.toFixed(t % 1 ? 1 : 0)}</span>)}
            </div>
          </div>
        </div>

        {/* 전체 값 */}
        <dl className="hm-stats">
          <div><dt>평균</dt><dd>{num(cap.mean, d + 1)}</dd></div>
          <div><dt>{isCpk ? '범위 평균 R̄' : '범위(최대−최소)'}</dt><dd>{isCpk ? num(cap.rangeBar, d + 1) : num(cap.max != null && cap.min != null ? cap.max - cap.min : null)}</dd></div>
          <div><dt>최대</dt><dd className={s.usl != null && cap.max > s.usl ? 'is-ng' : ''}>{num(cap.max)}</dd></div>
          <div><dt>최소</dt><dd className={s.lsl != null && cap.min < s.lsl ? 'is-ng' : ''}>{num(cap.min)}</dd></div>
          <div><dt>{isCpk ? 'σ 부분군 내 (R̄/d₂)' : 'σ 전체'}</dt><dd>{num(sigma, d + 2)}</dd></div>
          <div><dt>{isCpk ? 'Cp' : 'Pp'}</dt><dd>{fmt(isCpk ? cap.cp : cap.pp)}</dd></div>
          <div><dt>중심 치우침 (평균−CL)</dt><dd>{shift == null ? '-' : `${shift > 0 ? '+' : ''}${shift.toFixed(d + 1)}`}</dd></div>
          <div><dt>예상 규격 밖</dt><dd>{ppmText}<small>ppm</small></dd></div>
          <div><dt>실제 규격 밖</dt><dd className={cap.outOfSpec ? 'is-ng' : ''}>{cap.outOfSpec}<small>/ {cap.totalCount}</small></dd></div>
          <div><dt>{isCpk ? '부분군' : '측정값'}</dt><dd>{isCpk ? cap.subgroupCount : cap.totalCount}<small>{isCpk ? `× ${subgroupText(cap)}` : '개'}</small></dd></div>
        </dl>
        {few && <p className="hm-note">데이터가 적어({isCpk ? `부분군 ${cap.minSubgroups}개 미만` : '측정값 30개 미만'}) 참고용입니다.</p>}
      </section>

      <section className="hm-charts">
        {isCpk ? (
          <>
            <ChartPanel title="X̄ 관리도" sub="부분군 평균" grow={3} render={(h) => <XbarChart cap={cap} height={h} />} />
            <ChartPanel title="R 관리도" sub="부분군 범위" grow={2} render={(h) => <RChart cap={cap} height={h} />} />
          </>
        ) : (
          <>
            <ChartPanel title="분포" sub="히스토그램 · 정규분포 곡선" grow={3} render={(h) => <HistogramChart cap={cap} sigma={cap.sigmaOverall} height={h} />} />
            <ChartPanel title="측정값 추이" sub={`측정 순서대로 ${cap.totalCount}개`} grow={2} render={(h) => <RunChart cap={cap} height={h} />} />
          </>
        )}
      </section>
    </main>
  );
}

/**
 * 규격 선 — LSL · CL · USL을 한 줄 눈금 위에 놓고, 실제 값의 최소~최대(막대)와 평균(점)을 겹쳐
 * 공정이 규격 안 어디에 있는지 한눈에. 한쪽 규격(하한만/상한만)도 그린다.
 */
function SpecLine({ lsl, usl, cl, isTarget, mean, min, max, num, unit }) {
  const pts = [lsl, usl, cl, min, max].filter((x) => x != null);
  if (!pts.length) return null;
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  const span = hi - lo || Math.abs(hi) || 1;
  lo -= span * 0.08;
  hi += span * 0.08;
  const at = (x) => `${((x - lo) / (hi - lo)) * 100}%`;
  const out = (x) => x != null && ((lsl != null && x < lsl) || (usl != null && x > usl));
  return (
    <div className="hm-specline">
      <div className="hm-specline-labels">
        {lsl != null && <span className="is-lsl" style={{ left: at(lsl) }}><em>LSL</em>{num(lsl)}</span>}
        {cl != null && <span className="is-cl" style={{ left: at(cl) }}><em>{isTarget ? 'CL·목표' : 'CL'}</em>{num(cl)}</span>}
        {usl != null && <span className="is-usl" style={{ left: at(usl) }}><em>USL</em>{num(usl)}</span>}
        {lsl == null && <span className="is-lsl is-none" style={{ left: 0 }}><em>LSL</em>하한 없음</span>}
        {usl == null && <span className="is-usl is-none" style={{ left: '100%' }}><em>USL</em>상한 없음</span>}
      </div>
      <div className="hm-specline-track">
        {/* 규격 안 구간 */}
        <span className="hm-specline-ok" style={{ left: lsl != null ? at(lsl) : 0, right: usl != null ? `calc(100% - ${at(usl)})` : 0 }} />
        {lsl != null && <span className="hm-specline-tick is-limit" style={{ left: at(lsl) }} />}
        {usl != null && <span className="hm-specline-tick is-limit" style={{ left: at(usl) }} />}
        {cl != null && <span className="hm-specline-tick is-cl" style={{ left: at(cl) }} />}
        {min != null && max != null && (
          <span className={`hm-specline-range${out(min) || out(max) ? ' is-out' : ''}`} style={{ left: at(min), width: `calc(${at(max)} - ${at(min)})` }} />
        )}
        {mean != null && <i className="hm-specline-mean" style={{ left: at(mean) }} />}
      </div>
      <div className="hm-specline-legend">
        <span><i className="is-range" />실제 범위 {num(min)} ~ {num(max)}</span>
        <span><i className="is-mean" />평균 {num(mean, 2)}</span>
        <span className="hm-unit">{unit}</span>
      </div>
    </div>
  );
}

/** 남은 높이를 재서 차트를 꽉 채운다 */
function ChartPanel({ title, sub, grow, render }) {
  const [ref, h] = useBoxHeight(true);
  return (
    <div className="hm-panel" style={{ flexGrow: grow }}>
      <h4>{title}<small>{sub}</small></h4>
      <div className="hm-panel-body" ref={ref}>
        {h > 40 && <div>{render(h)}</div>}
      </div>
    </div>
  );
}
