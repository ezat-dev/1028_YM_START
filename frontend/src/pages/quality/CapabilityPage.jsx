import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { IconChartHistogram, IconChartDots, IconRefresh, IconArrowRight, IconDeviceDesktopAnalytics } from '@tabler/icons-react';
import { getCapability } from '../../api/quality/hardnessApi';
import {
  useSpecs, SpecCombo, IndexCard, Stat, SampleNote, XbarRCharts, HistogramChart, RunChart, ChartCard, fmt, fmtSpecRange, TARGET, setTone, subgroupText,
} from './capability';
import { Insights, Breakdown, LotSummary } from './capabilityInsights';
import '../../styles/downtime.css';
import '../../styles/hardness.css';

/*
 * 품질관리 > CPK 분석 / PPK 분석 — 같은 화면 틀에 kind만 다르다.
 *  - CPK: 부분군(측정 세트) 안의 흩어짐(R̄/d₂)으로 본 공정의 '실력' — X̄·R 관리도와 부분군 표
 *  - PPK: 전체 값의 흩어짐으로 본 실제 '성적' — 히스토그램(정규분포)과 측정값 추이
 * 경도측정에서 측정을 '완료'하면 그 값이 바로 여기 반영된다. ?specId= 로 들어오면 그 규격을 바로 연다.
 */

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const nextDay = (s) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + 1); return ymd(d); };
const QUICK = [
  { key: '30', label: '30일', days: 29 },
  { key: '90', label: '90일', days: 89 },
  { key: '180', label: '180일', days: 179 },
  { key: 'all', label: '전체', days: null },
];

export default function CapabilityPage({ kind }) {
  const isCpk = kind === 'cpk';
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // 대형 모니터링 — 전체 화면(F11과 같은 효과)으로 바꾸고 사이드바 없는 화면으로
  const openMonitor = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    navigate(`/monitor/${kind}`);
  };
  const specs = useSpecs(''); // 지난 측정도 보려고 미사용 규격까지
  // 고른 규격은 주소(?specId=)에 둔다 — 같은 화면에서 링크로 규격만 바뀌어도, 새로고침해도 그대로
  const urlSpecId = searchParams.get('specId') ? Number(searchParams.get('specId')) : null;
  const [specId, setSpecIdState] = useState(urlSpecId);
  useEffect(() => { if (urlSpecId != null) setSpecIdState(urlSpecId); }, [urlSpecId]);
  const setSpecId = (id) => {
    setSpecIdState(id);
    setSearchParams(id ? { specId: String(id) } : {}, { replace: true });
  };
  const [quick, setQuick] = useState('90');
  const [from, setFrom] = useState(daysAgo(89));
  const [to, setTo] = useState(daysAgo(0));
  const [cap, setCap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 규격을 아직 안 골랐으면 첫 규격으로
  useEffect(() => {
    if (specId == null && specs?.length) {
      const latest = [...specs].sort((a, b) => String(b.lastMeasDt ?? '').localeCompare(String(a.lastMeasDt ?? '')))[0];
      setSpecIdState(latest.specId);
    }
  }, [specs, specId]);

  const load = useCallback(() => {
    if (!specId) return;
    setLoading(true);
    setError('');
    const f = quick === 'all' ? undefined : `${from}T00:00:00`;
    const t = quick === 'all' ? undefined : `${nextDay(to)}T00:00:00`;
    getCapability(specId, f, t)
      .then((res) => setCap(res.data))
      .catch((err) => { setCap(null); setError(err.response?.data?.message ?? '분석 결과를 불러오지 못했습니다.'); })
      .finally(() => setLoading(false));
  }, [specId, quick, from, to]);

  useEffect(() => { load(); }, [load]);

  const pickQuick = (q) => {
    setQuick(q.key);
    if (q.days != null) { setFrom(daysAgo(q.days)); setTo(daysAgo(0)); }
  };

  const spec = cap?.spec;
  const d = spec?.decimals ?? 1;
  const unit = spec?.unit ?? '';
  const ready = cap && cap.subgroupCount > 0;

  const noteSpec = '기준정보 > 경도관리에서 이 규격에 값을 넣으면 나옵니다.';
  const why = {
    upper: `지금 규격에 상한(USL)이 없어 계산하지 않습니다. ${noteSpec}`,
    lower: `지금 규격에 하한(LSL)이 없어 계산하지 않습니다. ${noteSpec}`,
    both: `하한·상한이 모두 있어야 계산됩니다. 지금 규격은 ${spec?.usl == null ? '상한(USL)' : '하한(LSL)'}이 없습니다. ${noteSpec}`,
  };

  return (
    <div className="mes-page dtm-page hd-page">
      <div className="dtm-header-card">
        <div className="dtm-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon">{isCpk ? <IconChartHistogram size={20} /> : <IconChartDots size={20} />}</div>
            <div>
              <h2 className="mes-page-title">{isCpk ? 'CPK 분석' : 'PPK 분석'}</h2>
              <p className="mes-page-desc">
                {isCpk
                  ? `경도측정 세트(초물·중물·종물)를 부분군으로, 부분군 안의 흩어짐으로 공정 실력을 봅니다. 기준 CPK ≥ ${TARGET.cpk}`
                  : `기간 안의 모든 경도 값의 흩어짐으로 실제 성적을 봅니다. 기준 PPK ≥ ${TARGET.ppk}`}
              </p>
            </div>
          </div>
          <div className="dtm-header-right">
            <Link className="mes-btn mes-btn-secondary" to={`/quality/${isCpk ? 'ppk' : 'cpk'}${specId ? `?specId=${specId}` : ''}`}>
              {isCpk ? 'PPK 분석' : 'CPK 분석'} 보기 <IconArrowRight size={14} />
            </Link>
            <button type="button" className="mes-btn mes-btn-primary" onClick={openMonitor} title="전체 화면 · 최근 측정순 자동 전환">
              <IconDeviceDesktopAnalytics size={15} /> 대형 모니터링
            </button>
          </div>
        </div>
        <div className="dtm-header-sep" />
        <div className="dtm-header-controls">
          <SpecCombo specs={specs} value={specId} onChange={setSpecId} />
          <div className="dtm-quick" role="group" aria-label="기간">
            {QUICK.map((q) => <button key={q.key} type="button" className={quick === q.key ? 'is-on' : ''} onClick={() => pickQuick(q)}>{q.label}</button>)}
          </div>
          <div className="dtm-dates">
            <input type="date" className="mes-field-inline" value={from} max={to} disabled={quick === 'all'} onChange={(e) => { setFrom(e.target.value); setQuick('custom'); }} aria-label="시작일" />
            <span aria-hidden="true">~</span>
            <input type="date" className="mes-field-inline" value={to} min={from} disabled={quick === 'all'} onChange={(e) => { setTo(e.target.value); setQuick('custom'); }} aria-label="종료일" />
          </div>
          <button type="button" className="mes-btn mes-btn-secondary" onClick={load} disabled={!specId}><IconRefresh size={15} /> 조회</button>
          {spec && <span className="hd-spec-chip">규격 <b>{fmtSpecRange(spec)}</b>{spec.target != null && <> · 목표 {Number(spec.target).toFixed(d)}</>} · 세트당 {spec.sampleSize}개</span>}
        </div>
      </div>

      {specs && !specs.length && <div className="mes-card hd-empty">경도 규격이 없습니다. 기준정보 &gt; 경도관리에서 먼저 등록해주세요.</div>}
      {error && <div className="mes-card hd-empty is-error">{error}</div>}
      {loading && !cap && <div className="mes-card hd-empty">분석 중…</div>}

      {cap && (
        <>
          <SampleNote cap={cap} />
          <div className="hd-summary">
            <IndexCard
              kind={kind}
              value={isCpk ? cap.cpk : cap.ppk}
              sub={isCpk ? `σ(부분군 내) ${fmt(cap.sigmaWithin, d + 2)}` : `σ(전체) ${fmt(cap.sigmaOverall, d + 2)}`}
            />
            <div className="hd-stats">
              {isCpk ? (
                <>
                  <Stat label="Cp" formula="(USL − LSL) ÷ 6σ" value={fmt(cap.cp)} why={cap.cp == null ? why.both : null}
                    hint="규격 폭 안에 공정의 흩어짐이 몇 배 여유 있게 들어가는지 보는 '잠재 능력'입니다. 평균이 한쪽으로 치우친 것은 보지 않습니다. CPK보다 많이 크면 평균을 규격 가운데로 옮기면 좋아진다는 뜻입니다." />
                  <Stat label="CPU" formula="(USL − X̄̄) ÷ 3σ" value={fmt(cap.cpu)} why={cap.cpu == null ? why.upper : null}
                    hint="평균이 상한(USL)에서 얼마나 떨어져 있는지. 작을수록 경도가 너무 높게 나와 상한을 넘을 위험이 큽니다." />
                  <Stat label="CPL" formula="(X̄̄ − LSL) ÷ 3σ" value={fmt(cap.cpl)} why={cap.cpl == null ? why.lower : null}
                    hint="평균이 하한(LSL)에서 얼마나 떨어져 있는지. 작을수록 경도가 모자라 하한 아래로 떨어질 위험이 큽니다." />
                  <Stat label="X̄̄ (전체 평균)" formula="부분군 평균들의 평균" value={fmt(cap.mean, d + 1)} unit={unit}
                    hint="세트(부분군)마다 평균을 내고, 그 평균들을 다시 평균한 값입니다. 공정의 중심 위치입니다." />
                  <Stat label="R̄ (평균 범위)" formula="(최대 − 최소)의 평균" value={fmt(cap.rangeBar, d + 1)} unit={unit}
                    hint="세트마다 '최대 − 최소'를 구해 평균한 값입니다. σ(부분군 내) = R̄ ÷ d₂ 로 CPK 계산에 쓰입니다." />
                  <Stat label="부분군" formula="세트 수 × 세트당 개수" value={`${cap.subgroupCount}`} unit={` × ${subgroupText(cap)}`}
                    hint="CPK 계산에 쓴 측정 묶음(세트·통) 수입니다. 값이 2개 이상인 묶음만 씁니다. 믿을 만한 판단에는 25개 이상이 필요합니다." />
                </>
              ) : (
                <>
                  <Stat label="Pp" formula="(USL − LSL) ÷ 6σ전체" value={fmt(cap.pp)} why={cap.pp == null ? why.both : null}
                    hint="전체 측정값의 흩어짐이 규격 폭 안에 몇 배 여유 있게 들어가는지 보는 '잠재 능력'입니다. 평균 치우침은 보지 않습니다." />
                  <Stat label="PPU" formula="(USL − 평균) ÷ 3σ전체" value={fmt(cap.ppu)} why={cap.ppu == null ? why.upper : null}
                    hint="평균이 상한(USL)에서 얼마나 떨어져 있는지. 작을수록 경도가 상한을 넘을 위험이 큽니다." />
                  <Stat label="PPL" formula="(평균 − LSL) ÷ 3σ전체" value={fmt(cap.ppl)} why={cap.ppl == null ? why.lower : null}
                    hint="평균이 하한(LSL)에서 얼마나 떨어져 있는지. 작을수록 경도가 하한 아래로 떨어질 위험이 큽니다." />
                  <Stat label="평균" formula="모든 측정값의 평균" value={fmt(cap.mean, d + 1)} unit={unit}
                    hint="기간 안의 측정값 전부를 평균한 값입니다." />
                  <Stat label="최소 ~ 최대" value={ready ? `${fmt(cap.min, d)} ~ ${fmt(cap.max, d)}` : '-'} unit={unit}
                    hint="기간 안에서 가장 낮게, 가장 높게 나온 측정값입니다." />
                  <Stat label="측정값" value={`${cap.totalCount}`} unit="개"
                    hint="PPK 계산에 쓴 측정값 개수입니다. 많을수록 정확하며, 초기 공정 제출용은 보통 100개 이상을 씁니다." />
                </>
              )}
              <Stat label="규격 밖" value={`${cap.outOfSpec}`} unit="개"
                hint="하한(LSL)보다 낮거나 상한(USL)보다 높게 나온 측정값 개수입니다." />
              <Stat label={isCpk ? 'PPK (참고)' : 'CPK (참고)'} formula={isCpk ? 'min(PPU, PPL)' : 'min(CPU, CPL)'} value={fmt(isCpk ? cap.ppk : cap.cpk)}
                hint={isCpk
                  ? '전체 측정값의 σ로 계산한 장기 능력입니다. CPK보다 많이 낮으면 LOT·날짜 사이에 차이가 크다는 뜻입니다.'
                  : '세트 안의 σ로 계산한 단기 능력입니다. PPK보다 많이 높으면 LOT·날짜 사이에 차이가 크다는 뜻입니다.'} />
            </div>
          </div>

          {ready && <Insights cap={cap} kind={kind} />}

          {ready && (isCpk ? (
            <>
              <XbarRCharts cap={cap} />
              <Breakdown cap={cap} kind={kind} by="equip" />
              <div className="mes-card hd-card">
                <h4 className="hd-card-title">부분군 <small>{cap.subgroupCount}개 · 오래된 순 · 빨간 칸은 규격 밖 또는 관리 한계 밖</small></h4>
                <div className="hd-table-wrap">
                  <table className="hd-table">
                    <thead>
                      <tr>
                        <th>#</th><th>측정번호</th><th>LOT</th><th>설비</th><th>구분</th>
                        {Array.from({ length: cap.subgroupSizeMax ?? cap.subgroupSize }, (_, i) => <th key={i} className="is-num">경도{i + 1}</th>)}
                        <th className="is-num">평균</th><th className="is-num">범위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cap.subgroups.map((g, gi) => (
                        <tr key={`${g.measId}-${g.seq}-${gi}`}>
                          <td className="is-dim">{gi + 1}</td>
                          <td>{g.measNo}</td>
                          <td>{g.lotNo || '-'}</td>
                          <td>{g.equipCode || '-'}</td>
                          <td><span className={`hd-set-tag is-${setTone(g.setType)}`}>{g.setType}</span></td>
                          {Array.from({ length: cap.subgroupSizeMax ?? cap.subgroupSize }, (_, i) => g.values[i]).map((v, i) => (
                            v == null
                              ? <td key={i} className="is-num is-dim">-</td>
                              : <td key={i} className={`is-num${outOf(v, spec) ? ' is-ng' : ''}`}>{v.toFixed(d)}</td>
                          ))}
                          <td className={`is-num is-strong${g.mean > cap.uclX || g.mean < cap.lclX ? ' is-ng' : ''}`}>{g.mean.toFixed(d + 1)}</td>
                          <td className={`is-num${g.range > cap.uclR ? ' is-ng' : ''}`}>{g.range.toFixed(d)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="hd-charts is-2">
                <ChartCard title="분포" sub="히스토그램 · 정규분포 곡선(전체 σ)" height={300} render={(h) => <HistogramChart cap={cap} sigma={cap.sigmaOverall} height={h} />} />
                <ChartCard title="측정값 추이" sub={`측정 순서대로 ${cap.totalCount}개`} height={300} render={(h) => <RunChart cap={cap} height={h} />} />
              </div>
              <Breakdown cap={cap} kind={kind} by="equip" />
              <LotSummary cap={cap} />
            </>
          ))}
        </>
      )}
    </div>
  );
}

function outOf(v, s) {
  return s && ((s.lsl != null && v < s.lsl) || (s.usl != null && v > s.usl));
}
