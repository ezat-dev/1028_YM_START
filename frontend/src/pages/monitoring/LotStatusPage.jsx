import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  IconPackages, IconRefresh, IconHistory, IconLayoutGrid, IconAlertTriangleFilled, IconTool,
  IconFileSpreadsheet, IconArrowRight, IconCircleCheckFilled,
} from '@tabler/icons-react';
import DataTable from '../../components/ui/DataTable';
import { STATUS_LABEL, fetchMockPatterns, FURNACES } from '../../mocks/furnaceMock';
import { createLotStatusMock } from '../../mocks/lotStatusMock';
import { getLotStatus, getLotHistory } from '../../api/monitoring/lotStatusApi';
import { STAGES } from '../../constants/furnaceLayout';
import './LotStatusPage.css';

/*
 * 모니터링 > LOT 현황
 *  - 현재 현황: 설비 6대 각각의 '진행 중 LOT'과 '직전 LOT'
 *  - 과거 이력: 완료된 LOT를 기간·설비·결과·검색어로 조회 + 엑셀
 * 우측 상단 전환 버튼으로 두 화면을 오가고, 주소(?view=history)에도 남겨 새로고침·링크 공유 때 그대로 열린다.
 * 지금은 목업(USE_MOCK) — DB API가 준비되면 false로 바꾸면 된다(데이터 형식은 mocks/lotStatusMock.js 주석).
 */
const USE_MOCK = true;
const POLL_MS = 10000;

const pad = (n, l = 2) => String(n).padStart(l, '0');
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hms = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const mdhm = (ms) => { const d = new Date(ms); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${hm(ms)}`; };
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };

function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}시간 ${pad(m % 60)}분` : `${m}분`;
}

const fmtTon = (kg) => (kg / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const range = (arr) => {
  const v = (arr ?? []).filter((x) => x != null);
  if (!v.length) return '-';
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return lo === hi ? `${lo}` : `${lo}~${hi}`;
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 진행 막대 아래 구간 묶음 이름 — STAGES 순서(장입, 퀜칭 1~5, 오일, 세정, 템퍼링 1~5, 배출)에 맞춘 칸 범위
const STAGE_GROUPS = [
  { label: '장입', from: 1, to: 2, kind: 'load' },
  { label: '퀜칭로', from: 2, to: 7, kind: 'q' },
  { label: '오일', from: 7, to: 8, kind: 'oil' },
  { label: '세정', from: 8, to: 9, kind: 'wash' },
  { label: '템퍼링로', from: 9, to: 14, kind: 't' },
  { label: '배출', from: 14, to: 15, kind: 'out' },
];

export default function LotStatusPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'history' ? 'history' : 'current';
  const [source, setSource] = useState(null);

  useEffect(() => {
    if (!USE_MOCK) {
      setSource({ getLotStatus, getLotHistory });
      return;
    }
    fetchMockPatterns().then((patterns) => setSource(createLotStatusMock(patterns)));
  }, []);

  const switchView = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'history') next.set('view', 'history');
    else next.delete('view');
    setParams(next, { replace: true });
  };

  const viewSwitch = (
    <div className="lst-switch" role="tablist" aria-label="보기 전환">
      <button type="button" role="tab" aria-selected={view === 'current'} className={view === 'current' ? 'is-on' : ''} onClick={() => switchView('current')}>
        <IconLayoutGrid size={15} /> 현재 현황
      </button>
      <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'is-on' : ''} onClick={() => switchView('history')}>
        <IconHistory size={15} /> 과거 이력
      </button>
    </div>
  );

  return (
    <div className="mes-page lst-page mes-page-fill mes-page-compact">
      {view === 'history'
        ? <HistoryView source={source} viewSwitch={viewSwitch} />
        : <CurrentView source={source} viewSwitch={viewSwitch} />}
    </div>
  );
}

function PageTitle() {
  return (
    <div className="lst-title">
      <div className="mes-page-icon"><IconPackages size={20} /></div>
      <div>
        <h2 className="mes-page-title">LOT 현황</h2>
        {USE_MOCK && <span className="lst-mock-badge" title="DB 연동 전 예시 데이터입니다">화면 예시 · MOCK</span>}
      </div>
    </div>
  );
}

/* ───────────────────────── 현재 현황 ───────────────────────── */

function CurrentView({ source, viewSwitch }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!source) return Promise.resolve();
    setLoading(true);
    return source.getLotStatus()
      .then((d) => { setData(d); setError(false); })
      .catch(() => setError(true))
      .finally(() => setTimeout(() => setLoading(false), 300));
  }, [source]);

  useEffect(() => {
    if (!source) return undefined;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [source, load]);

  const furnaces = data?.furnaces ?? [];
  const summary = {
    running: furnaces.reduce((a, f) => a + (f.running?.length ?? 0), 0),
    busy: furnaces.filter((f) => f.running?.length).length,
    done: furnaces.reduce((a, f) => a + (f.today?.doneCount ?? 0), 0),
    weight: furnaces.reduce((a, f) => a + (f.today?.weightKg ?? 0), 0),
    check: furnaces.reduce((a, f) => a + (f.today?.checkCount ?? 0) + (f.running ?? []).filter((l) => l.note).length, 0),
  };

  return (
    <>
      <div className="lst-header">
        <PageTitle />
        <dl className="lst-kpis">
          <div className="lst-kpi" title={`LOT 진행 중인 설비 ${summary.busy}대`}><dt>진행 중 LOT</dt><dd>{summary.running}<small>건 · {summary.busy}/{furnaces.length || 6}대</small></dd></div>
          <div className="lst-kpi"><dt>금일 완료</dt><dd>{summary.done}<small>LOT</small></dd></div>
          <div className="lst-kpi"><dt>금일 처리량</dt><dd>{fmtTon(summary.weight)}<small>t</small></dd></div>
          <div className={`lst-kpi${summary.check ? ' is-check' : ''}`}><dt>품질 확인</dt><dd>{summary.check}<small>건</small></dd></div>
        </dl>
        <div className="lst-head-right">
          <span className={`lst-updated${error ? ' is-error' : ''}`} title={`${POLL_MS / 1000}초마다 갱신`}>
            {error ? '갱신 실패' : '갱신'} <b>{data ? hms(data.updatedAt) : '-'}</b>
          </span>
          <button type="button" className={`mes-btn mes-btn-secondary lst-icon-btn${loading ? ' is-spinning' : ''}`} onClick={load} title="새로고침" aria-label="새로고침">
            <IconRefresh size={15} />
          </button>
          {viewSwitch}
        </div>
      </div>

      {!data ? (
        <div className="lst-loading">{error ? 'LOT 현황을 불러오지 못했습니다.' : 'LOT 현황을 불러오는 중…'}</div>
      ) : (
        <div className="lst-grid-wrap">
          <div className="lst-grid">
            {furnaces.map((f) => <FurnaceCard key={f.code} f={f} now={data.updatedAt} />)}
          </div>
        </div>
      )}
    </>
  );
}

function StatusPill({ status, idleReason }) {
  return (
    <span className={`lst-status is-${status}`}>
      {status === 'alarm' && <IconAlertTriangleFilled size={11} />}
      {status === 'idle' && <IconTool size={11} />}
      {status === 'idle' ? (idleReason ?? STATUS_LABEL.idle) : STATUS_LABEL[status]}
    </span>
  );
}

function ResultBadge({ lot }) {
  if (lot.result === 'check') {
    return <span className="lst-badge is-check" title={lot.note ?? '품질 확인'}><IconAlertTriangleFilled size={11} /><span>품질 확인</span></span>;
  }
  if (lot.result === 'run') return <span className="lst-badge is-run"><i /><span>진행 중</span></span>;
  return <span className="lst-badge is-ok" title="정상"><IconCircleCheckFilled size={11} /><span>정상</span></span>;
}

function FurnaceCard({ f, now }) {
  return (
    <section className={`lst-card is-${f.status}`} aria-label={`${f.code} ${f.name}`}>
      <header className="lst-card-head">
        <strong>{f.code}</strong>
        <span className="lst-card-name">{f.name}</span>
        <StatusPill status={f.status} idleReason={f.idleReason} />
        <span className="lst-card-today" title="오늘 완료한 LOT 수">금일 완료 <b>{f.today?.doneCount ?? 0}</b></span>
      </header>

      <div className="lst-current">
        {f.running?.length ? <RunningLots lots={f.running} now={now} alarm={f.alarm} /> : (
          <>
            <div className="lst-sec-label">진행 중 LOT</div>
            <div className="lst-empty">
              {f.status === 'idle' ? <IconTool size={18} /> : null}
              <strong>진행 중인 LOT 없음</strong>
              <span>{f.status === 'idle' ? `${f.idleReason ?? '정지'} — 설비 정지 중` : '다음 LOT 장입 대기'}</span>
            </div>
          </>
        )}
      </div>

      <div className="lst-prev">
        <div className="lst-sec-label">직전 LOT <span>완료 · 최근순</span></div>
        {f.previous?.length ? (
          <ul className="lst-prev-list">
            {f.previous.map((l) => <PrevLot key={l.lotNo} lot={l} />)}
          </ul>
        ) : <div className="lst-prev-empty">이력 없음</div>}
      </div>
    </section>
  );
}

// 로 안의 LOT 구분 색 — 배출에 가까운 LOT부터 차례로(구간 색·알람 색과 겹치지 않는 계열)
const LOT_COLORS = ['#2f5bb5', '#0e8a7e', '#7a4fc4'];

/** 차지한 구간 이름 — '퀜칭로 2~5존', '오일조 ~ 템퍼링 2존', '장입' */
function zoneRange(from, to) {
  const a = STAGES[from];
  const b = STAGES[to];
  if (!a || !b) return '-';
  if (from === to) return a.name;
  if (a.kind === b.kind && a.zone && b.zone) return `${a.kind === 'q' ? '퀜칭로' : '템퍼링로'} ${a.zone}~${b.zone}존`;
  const short = (s) => (s.kind === 'q' ? `퀜칭 ${s.zone}존` : s.kind === 't' ? `템퍼링 ${s.zone}존` : s.name);
  return `${short(a)} ~ ${short(b)}`;
}

/**
 * 진행 중 LOT — 동시에 여러 LOT가 로 안에 있을 수 있다.
 * 위: 로 전체 막대에 LOT별 색으로 차지한 구간을 칠하고, 아래: LOT마다 한 줄(같은 색 표시)로 상세.
 */
function RunningLots({ lots, now, alarm }) {
  const alarmIdx = alarm ? STAGES.findIndex((s) => s.key === alarm.zone) : -1;
  const owner = new Array(STAGES.length).fill(-1);
  lots.forEach((l, li) => {
    for (let z = l.zoneFrom; z <= l.zoneTo; z += 1) owner[z] = li;
  });

  return (
    <div className={`lst-lot${lots.length >= 3 ? ' is-n3' : ''}`}>
      {/* 배지 + 막대 — 넓은 카드는 위아래, 낮은 카드는 한 줄로 */}
      <div className={`lst-run-top${alarm ? ' has-alarm' : ''}`}>
      <div className="lst-run-head">
        <span className="lst-badge is-run"><i />진행 중 LOT</span>
        {lots.length > 1 && <span className="lst-run-multi">{lots.length}건<span className="lst-run-multi-long"> 동시 진행</span></span>}
        {/* 설비 알람은 LOT마다 반복하지 않고 여기 한 번 */}
        {alarm && (
          <span className="lst-badge is-check lst-alarm-badge" title={alarm.message}>
            <IconAlertTriangleFilled size={11} />알람 발생 진행 중
          </span>
        )}
      </div>

      <div className="lst-occ">
        <div className="lst-route" role="img" aria-label={lots.map((l) => `${l.lotNo} ${zoneRange(l.zoneFrom, l.zoneTo)}`).join(', ')}>
          {STAGES.map((s, i) => {
            const li = owner[i];
            return (
              <i
                key={s.key}
                className={`is-${s.kind}${li >= 0 ? ' is-lot' : ''}${i === alarmIdx ? ' is-alarm' : ''}`}
                style={li >= 0 ? { '--lot': LOT_COLORS[li % LOT_COLORS.length] } : undefined}
                title={li >= 0 ? `${s.name} · ${lots[li].lotNo}` : s.name}
              >
                {s.zone ?? ''}
              </i>
            );
          })}
        </div>
        <div className="lst-route-labels" aria-hidden="true">
          {STAGE_GROUPS.map((g) => (
            <span key={g.label} className={`is-${g.kind}`} style={{ gridColumn: `${g.from} / ${g.to}` }}>{g.label}</span>
          ))}
        </div>
      </div>
      </div>

      <ul className={`lst-run-list is-n${Math.min(lots.length, 3)}`}>
        {lots.map((l, li) => <RunRow key={l.lotNo} lot={l} now={now} color={LOT_COLORS[li % LOT_COLORS.length]} alarm={alarm} />)}
      </ul>
    </div>
  );
}

/**
 * 진행 중 LOT 한 건. 넓은 카드: [LOT번호 · 품명 · 품번 … %] / [구간 · 장입 · 남은 시간] / (높은 카드) [수량·설정값]
 * 좁은 카드: [LOT번호 … %] / [품명 · 품번] / [구간 · 장입 · 남은 시간] — CSS grid 영역만 바꿔 줄을 나눈다.
 */
function RunRow({ lot, now, color, alarm }) {
  const remain = lot.expectedEndAt - now;
  const pct = Math.round(lot.progress * 100);
  return (
    <li className="lst-run-row" style={{ '--lot': color }} title={`${lot.lotNo} · ${lot.productName} · ${lot.partNo} · ${lot.company} · ${lot.patternCode}`}>
      <span className="lst-run-dot" aria-hidden="true" />
      <span className="lst-lotno">{lot.lotNo}</span>
      {/* 설비 알람은 머리줄에 한 번 표시 — LOT 줄에는 품질 확인 사유가 따로 있을 때만 */}
      {!alarm && lot.note && (
        <span className="lst-badge is-check lst-note-badge" title={lot.note}>
          <IconAlertTriangleFilled size={11} /><span>품질 확인</span>
        </span>
      )}
      <span className="lst-run-prod">
        <strong className="lst-lot-prod">{lot.productName}</strong>
        <span className="lst-lot-sub">{lot.partNo} · {lot.company} · {lot.patternCode}</span>
      </span>
      <span className="lst-run-pct">{pct}<small>%</small></span>
      <div className="lst-run-info">
        <span className="lst-run-zone">{zoneRange(lot.zoneFrom, lot.zoneTo)}</span>
        <span className="lst-run-in"><em>장입</em><b>{hm(lot.startAt)}</b></span>
        <span className="lst-run-remain">
          {remain >= 60000 ? <>남은 <b>{fmtDur(remain)}</b><em className="lst-run-eta"> ({hm(lot.expectedEndAt)} 완료)</em></> : '곧 배출'}
        </span>
      </div>
      <div className="lst-run-meta">
        트레이 <b>{lot.trayCount}</b><span aria-hidden="true">·</span>
        <b>{lot.qty.toLocaleString()}</b> ea<span aria-hidden="true">·</span>
        <b>{lot.weightKg.toLocaleString()}</b> kg<span aria-hidden="true">·</span>
        퀜칭 {range(lot.sp?.q)}℃ · 템퍼링 {range(lot.sp?.t)}℃{lot.sp?.cp != null && <> · CP {Number(lot.sp.cp).toFixed(2)}%</>}
      </div>
    </li>
  );
}

/** 직전(완료) LOT 한 줄 — LOT번호 | 품명 | 장입→배출 | 결과 */
function PrevLot({ lot }) {
  const title = [
    `${lot.lotNo} · ${lot.partNo} ${lot.productName} · ${lot.company}`,
    `${hm(lot.startAt)} → ${hm(lot.endAt)} (${fmtDur(lot.endAt - lot.startAt)}) · ${lot.weightKg.toLocaleString()} kg`,
    lot.note ? `품질 확인: ${lot.note}` : '',
  ].filter(Boolean).join('\n');
  return (
    <li className="lst-prev-row" title={title}>
      <span className="lst-prev-lot">{lot.lotNo}</span>
      <span className="lst-prev-prod">{lot.productName}</span>
      <span className="lst-prev-when">
        <span className="lst-prev-start">{hm(lot.startAt)}<IconArrowRight size={10} /></span>
        <span className="lst-prev-end-label">완료 </span>{hm(lot.endAt)}
      </span>
      <ResultBadge lot={lot} />
    </li>
  );
}

/* ───────────────────────── 과거 이력 ───────────────────────── */

const QUICK_RANGES = [
  { key: 'today', label: '오늘', from: () => daysAgo(0), to: () => daysAgo(0) },
  { key: 'yday', label: '어제', from: () => daysAgo(1), to: () => daysAgo(1) },
  { key: '7d', label: '7일', from: () => daysAgo(6), to: () => daysAgo(0) },
  { key: '30d', label: '30일', from: () => daysAgo(29), to: () => daysAgo(0) },
];

function HistoryView({ source, viewSwitch }) {
  const [from, setFrom] = useState(() => daysAgo(6));
  const [to, setTo] = useState(() => daysAgo(0));
  const [code, setCode] = useState('');
  const [result, setResult] = useState('');
  const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchedAt, setSearchedAt] = useState(null);

  // 조회 조건은 '조회'를 눌렀을 때만 반영 — 날짜를 고치는 도중에 표가 바뀌지 않게
  const condRef = useRef({ from, to, code, result, keyword });
  condRef.current = { from, to, code, result, keyword };

  const search = useCallback(() => {
    if (!source) return;
    const c = condRef.current;
    if (c.from > c.to) { setFrom(c.to); setTo(c.from); }
    setLoading(true);
    source.getLotHistory({ from: c.from <= c.to ? c.from : c.to, to: c.from <= c.to ? c.to : c.from, code: c.code, result: c.result, keyword: c.keyword })
      .then((list) => { setRows(list); setError(false); setSearchedAt(Date.now()); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [source]);

  useEffect(() => { search(); }, [search]);

  const applyQuick = (q) => {
    setFrom(q.from());
    setTo(q.to());
    condRef.current = { ...condRef.current, from: q.from(), to: q.to() };
    search();
  };
  const activeQuick = QUICK_RANGES.find((q) => q.from() === from && q.to() === to)?.key;

  const totals = useMemo(() => ({
    count: rows.length,
    weight: rows.reduce((a, r) => a + r.weightKg, 0),
    qty: rows.reduce((a, r) => a + r.qty, 0),
    check: rows.filter((r) => r.result === 'check').length,
  }), [rows]);

  const columns = useMemo(() => [
    { title: 'No', formatter: 'rownum', width: 56, hozAlign: 'center', headerSort: false },
    { title: '설비', field: 'code', width: 72, hozAlign: 'center', formatter: (c) => `<span class="lst-t-code">${esc(c.getValue())}</span>` },
    { title: 'LOT번호', field: 'lotNo', width: 128, hozAlign: 'center', formatter: (c) => `<span class="lst-t-lot">${esc(c.getValue())}</span>` },
    { title: '회사', field: 'company', width: 96, hozAlign: 'center' },
    { title: '품번', field: 'partNo', width: 116, hozAlign: 'center', formatter: (c) => `<span class="lst-t-mono">${esc(c.getValue())}</span>` },
    { title: '품명', field: 'productName', minWidth: 130, formatter: (c) => `<span class="lst-t-name" title="${esc(c.getValue())}">${esc(c.getValue())}</span>` },
    { title: '패턴', field: 'patternCode', width: 84, hozAlign: 'center' },
    { title: '수량', field: 'qty', width: 80, hozAlign: 'right', formatter: (c) => `${Number(c.getValue()).toLocaleString()}<span class="lst-t-unit">ea</span>` },
    { title: '중량', field: 'weightKg', width: 90, hozAlign: 'right', formatter: (c) => `${Number(c.getValue()).toLocaleString()}<span class="lst-t-unit">kg</span>` },
    { title: '장입', field: 'startAt', width: 104, hozAlign: 'center', formatter: (c) => `<span class="lst-t-time">${mdhm(c.getValue())}</span>` },
    { title: '완료', field: 'endAt', width: 104, hozAlign: 'center', formatter: (c) => `<span class="lst-t-time">${mdhm(c.getValue())}</span>` },
    {
      title: '소요', width: 96, hozAlign: 'center', headerSort: false,
      formatter: (c) => { const d = c.getRow().getData(); return `<span class="lst-t-time">${fmtDur(d.endAt - d.startAt)}</span>`; },
    },
    {
      title: '결과', field: 'result', width: 96, hozAlign: 'center',
      formatter: (c) => (c.getValue() === 'check'
        ? '<span class="lst-badge is-check">품질 확인</span>'
        : '<span class="lst-badge is-ok">정상</span>'),
    },
    { title: '비고', field: 'note', minWidth: 150, formatter: (c) => (c.getValue() ? `<span class="lst-t-note" title="${esc(c.getValue())}">${esc(c.getValue())}</span>` : '<span class="lst-t-empty">-</span>') },
  ], []);

  const tableOptions = useMemo(() => ({
    layout: 'fitColumns',
    pagination: false,
    selectableRows: false,
    placeholder: '조건에 맞는 LOT가 없습니다.',
    initialSort: [{ column: 'endAt', dir: 'desc' }],
  }), []);

  const exportExcel = () => {
    const sheet = rows.map((r, i) => ({
      No: i + 1, 설비: r.code, LOT번호: r.lotNo, 회사: r.company, 품번: r.partNo, 품명: r.productName, 패턴: r.patternCode,
      트레이: r.trayCount, '수량(ea)': r.qty, '중량(kg)': r.weightKg,
      장입: `${ymd(new Date(r.startAt))} ${hm(r.startAt)}`, 완료: `${ymd(new Date(r.endAt))} ${hm(r.endAt)}`,
      소요: fmtDur(r.endAt - r.startAt), 결과: r.result === 'check' ? '품질 확인' : '정상', 비고: r.note ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'LOT 이력');
    XLSX.writeFile(wb, `LOT이력_${from}_${to}.xlsx`);
  };

  return (
    <>
      <div className="lst-header is-history">
        <PageTitle />
        <dl className="lst-kpis">
          <div className="lst-kpi"><dt>조회 LOT</dt><dd>{totals.count.toLocaleString()}<small>건</small></dd></div>
          <div className="lst-kpi"><dt>처리량</dt><dd>{fmtTon(totals.weight)}<small>t</small></dd></div>
          <div className="lst-kpi"><dt>수량</dt><dd>{totals.qty.toLocaleString()}<small>ea</small></dd></div>
          <div className={`lst-kpi${totals.check ? ' is-check' : ''}`}><dt>품질 확인</dt><dd>{totals.check}<small>건</small></dd></div>
        </dl>
        <div className="lst-head-right">{viewSwitch}</div>
      </div>

      <div className="mes-card lst-filter">
        <div className="lst-quick" role="group" aria-label="기간 빠른 선택">
          {QUICK_RANGES.map((q) => (
            <button key={q.key} type="button" className={activeQuick === q.key ? 'is-on' : ''} onClick={() => applyQuick(q)}>{q.label}</button>
          ))}
        </div>
        <div className="lst-dates">
          <input type="date" className="mes-field-inline" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="시작일" />
          <span aria-hidden="true">~</span>
          <input type="date" className="mes-field-inline" value={to} min={from} max={daysAgo(0)} onChange={(e) => setTo(e.target.value)} aria-label="종료일" />
        </div>
        <select className="mes-field-inline" value={code} onChange={(e) => setCode(e.target.value)} aria-label="설비">
          <option value="">전체 설비</option>
          {FURNACES.map((f) => <option key={f.code} value={f.code}>{f.code}</option>)}
        </select>
        <select className="mes-field-inline" value={result} onChange={(e) => setResult(e.target.value)} aria-label="결과">
          <option value="">전체 결과</option>
          <option value="ok">정상</option>
          <option value="check">품질 확인</option>
        </select>
        <input
          className="mes-field-inline lst-keyword"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder="LOT번호 · 품번 · 품명 · 회사"
          aria-label="검색어"
        />
        <button type="button" className="mes-btn mes-btn-primary" onClick={search} disabled={loading}>조회</button>
        <div className="lst-filter-spacer" />
        <span className="lst-filter-info">
          {error ? <span className="is-error">조회 실패</span> : searchedAt ? <>조회 {hms(searchedAt)}</> : null}
        </span>
        <button type="button" className="mes-btn mes-btn-secondary" onClick={exportExcel} disabled={!rows.length}>
          <IconFileSpreadsheet size={15} /> 엑셀
        </button>
      </div>

      <div className="mes-card mes-card-fill lst-table-card">
        <div className="lst-table-wrap">
          <DataTable data={rows} columns={columns} options={tableOptions} height="100%" />
        </div>
      </div>
    </>
  );
}
