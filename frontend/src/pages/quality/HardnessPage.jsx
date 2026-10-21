import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IconDiamond, IconPlus, IconTrash, IconEdit, IconBroadcast, IconBroadcastOff, IconKeyboard, IconCheck,
  IconArrowBackUp, IconX, IconCircleCheckFilled, IconAlertTriangleFilled, IconArrowRight, IconSearch, IconMinus,
} from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getList as getEquipmentList } from '../../api/base/equipmentApi';
import {
  getMeasList, getMeas, createMeas, updateMeasInfo, deleteMeas, addSet, deleteSet, setValue,
  completeMeas, reopenMeas, setReceiving, getCapability,
} from '../../api/quality/hardnessApi';
import {
  useSpecs, SpecSelect, IndexCard, ChartCard, LotTrendChart, HistogramChart, useBoxHeight, verdict, fmt, fmtSpecRange, setTone, equipLabel,
} from './capability';
import { expectedPpm, groupStats } from './capabilityInsights';
import '../../styles/downtime.css';
import '../../styles/hardness.css';

/*
 * 품질관리 > 경도측정 — LOT마다 초물·중물·종물 세트에 경도1~n을 기록한다.
 *
 *  - 자동 수신: '자동 수신'을 켠 측정 1건에 비커스 경도계(C# 연동)가 값을 보내면, 세트·경도 순서대로 다음 빈 칸에 들어간다.
 *    화면은 측정 중인 동안 2초마다 다시 읽어 새 값을 반짝임으로 보여 준다.
 *  - 수동 입력: '수동 입력'을 누르면 칸이 입력창으로 바뀐다(Enter → 저장하고 다음 칸).
 *  - 측정 완료: 빈 칸이 없으면 합격/불합격을 판정하고, 이 규격의 CPK·PPK를 바로 다시 계산해 보여 준다.
 * 규격(하한·상한·단위·세트당 개수)은 기준정보 > 경도관리에서 관리한다. 지금은 LOT번호를 직접 입력한다.
 */

const POLL_MS = 2000;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const nextDay = (s) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + 1); return ymd(d); };
const fmtDt = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : '');
const hms = (v) => (v ? String(v).replace('T', ' ').slice(11, 19) : '');
const QUICK = [
  { key: '7', label: '7일', days: 6 },
  { key: '30', label: '30일', days: 29 },
  { key: '90', label: '90일', days: 89 },
];
const CAP_DAYS = 90; // 측정 화면 아래 공정능력은 최근 90일 완료 측정 기준

const isOut = (v, m) => v != null && ((m.lsl != null && v < m.lsl) || (m.usl != null && v > m.usl));

/** 세트별 값 배열(경도1~n, 빈 칸은 null)과 통계 */
function buildRows(meas) {
  if (!meas) return [];
  const n = meas.sampleSize;
  const seen = {};
  return (meas.sets ?? []).map((s) => {
    seen[s.setType] = (seen[s.setType] ?? 0) + 1;
    const cells = Array.from({ length: n }, (_, i) => s.values?.find((v) => v.idx === i + 1) ?? null);
    const vals = cells.filter(Boolean).map((c) => Number(c.value));
    const full = vals.length === n;
    const ng = cells.some((c) => c && isOut(Number(c.value), meas));
    return {
      ...s,
      label: s.setType,
      no: seen[s.setType],
      cells,
      mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      range: vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : null,
      judge: ng ? 'NG' : full ? 'OK' : null,
    };
  });
}

/** 같은 구분이 여러 개면 '중물 2'처럼 번호 */
function withNumbers(rows) {
  const total = {};
  rows.forEach((r) => { total[r.setType] = (total[r.setType] ?? 0) + 1; });
  return rows.map((r) => ({ ...r, title: total[r.setType] > 1 ? `${r.setType} ${r.no}` : r.setType }));
}

export default function HardnessPage() {
  const specs = useSpecs();
  const [equipments, setEquipments] = useState([]);
  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/quality/hardness');

  // 목록
  const [quick, setQuick] = useState('30');
  const [statusSel, setStatusSel] = useState('');
  const [keyword, setKeyword] = useState('');
  const [list, setList] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const selectedRef = useRef(null);
  selectedRef.current = selectedId;

  // 상세
  const [meas, setMeas] = useState(null);
  const [manual, setManual] = useState(false);
  const [flash, setFlash] = useState(new Set()); // 방금 들어온 값(valueId)
  const [cap, setCap] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null); // 'new' | 'info'
  const knownValues = useRef(new Set());

  useEffect(() => {
    getEquipmentList('', 'Y', '').then((res) => setEquipments(res.data ?? [])).catch(() => {});
  }, []);

  const loadList = useCallback((keepSelection = true) => {
    setListLoading(true);
    const q = QUICK.find((x) => x.key === quick);
    return getMeasList({ from: `${daysAgo(q.days)}T00:00:00`, to: `${nextDay(daysAgo(0))}T00:00:00`, status: statusSel, keyword: keyword.trim() })
      .then((res) => {
        const rows = res.data ?? [];
        setList(rows);
        if (!keepSelection || !rows.some((r) => r.measId === selectedRef.current)) {
          // 처음엔 자동 수신 중인 측정 → 측정 중인 측정 → 가장 최근 측정
          const pick = rows.find((r) => r.receiving === 'Y') ?? rows.find((r) => r.status === '측정중') ?? rows[0];
          setSelectedId(pick?.measId ?? null);
        }
        return rows;
      })
      .catch(() => showToast('측정 목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setListLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick, statusSel, keyword]);

  useEffect(() => { loadList(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [quick, statusSel]);

  // 상세 불러오기 + 새로 들어온 값 반짝임
  const applyMeas = useCallback((m, markNew) => {
    const ids = new Set();
    (m.sets ?? []).forEach((s) => (s.values ?? []).forEach((v) => ids.add(v.valueId)));
    if (markNew) {
      const fresh = [...ids].filter((id) => !knownValues.current.has(id));
      if (fresh.length) {
        setFlash(new Set(fresh));
        setTimeout(() => setFlash(new Set()), 1600);
      }
    }
    knownValues.current = ids;
    setMeas(m);
    // 목록의 진행 상황도 같이 갱신
    setList((prev) => prev.map((r) => (r.measId === m.measId ? { ...r, ...m, sets: undefined, valueCount: ids.size } : r)));
  }, []);

  useEffect(() => {
    if (!selectedId) { setMeas(null); return; }
    setManual(false);
    getMeas(selectedId)
      .then((res) => { if (res.data.measId === selectedRef.current) applyMeas(res.data, false); })
      .catch(() => showToast('측정을 불러오지 못했습니다.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // 측정 중이면 2초마다 다시 읽는다(경도계 자동 수신 반영)
  useEffect(() => {
    if (!meas || meas.status !== '측정중') return undefined;
    const id = setInterval(() => {
      if (document.hidden) return;
      getMeas(meas.measId)
        .then((res) => { if (res.data.measId === selectedRef.current) applyMeas(res.data, true); })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [meas?.measId, meas?.status, applyMeas]); // eslint-disable-line react-hooks/exhaustive-deps

  // 이 규격의 공정능력(최근 90일 완료 측정)
  const loadCap = useCallback((specId) => {
    if (!specId) { setCap(null); return Promise.resolve(null); }
    return getCapability(specId, `${daysAgo(CAP_DAYS - 1)}T00:00:00`, undefined)
      .then((res) => { setCap(res.data); return res.data; })
      .catch(() => { setCap(null); return null; });
  }, []);
  useEffect(() => { loadCap(meas?.specId); }, [meas?.specId, loadCap]);

  const rows = useMemo(() => withNumbers(buildRows(meas)), [meas]);
  const n = meas?.sampleSize ?? 5;
  const d = meas?.decimals ?? 1;
  const total = rows.length * n;
  const filled = rows.reduce((a, r) => a + r.cells.filter(Boolean).length, 0);
  const allVals = rows.flatMap((r) => r.cells.filter(Boolean).map((c) => Number(c.value)));
  const ngCount = allVals.filter((v) => isOut(v, meas ?? {})).length;
  const next = useMemo(() => {
    for (const r of rows) {
      const i = r.cells.findIndex((c) => !c);
      if (i >= 0) return { setId: r.setId, idx: i + 1, title: r.title };
    }
    return null;
  }, [rows]);
  const lastAuto = useMemo(() => {
    let last = null;
    rows.forEach((r) => r.cells.forEach((c) => { if (c?.source === 'AUTO' && (!last || c.measuredAt > last.measuredAt)) last = c; }));
    return last;
  }, [rows]);

  const measuring = meas?.status === '측정중';
  const canEdit = permission.canUpdate && measuring;

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.data?.measId) applyMeas(res.data, false);
      if (okMsg) showToast(okMsg);
      return res;
    } catch (err) {
      showToast(err.response?.data?.message ?? '처리에 실패했습니다.', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const toggleReceive = () => run(() => setReceiving(meas.measId, meas.receiving !== 'Y'), meas.receiving === 'Y' ? '자동 수신을 껐습니다.' : '자동 수신을 켰습니다. 경도계에서 측정하면 다음 칸에 들어갑니다.')
    .then(() => loadList(true));

  const handleComplete = async () => {
    const res = await run(() => completeMeas(meas.measId));
    if (!res) return;
    const c = await loadCap(meas.specId);
    loadList(true);
    showToast(`측정 완료 · ${res.data.judgement}${c?.cpk != null ? ` · CPK ${fmt(c.cpk)} / PPK ${fmt(c.ppk)}` : ''}`, res.data.judgement === '합격' ? 'success' : 'error');
  };

  const handleReopen = async () => {
    if (!window.confirm('완료된 측정을 다시 열어 수정하시겠습니까? 다시 완료할 때까지 CPK·PPK 분석에서 빠집니다.')) return;
    await run(() => reopenMeas(meas.measId), '다시 측정할 수 있게 열었습니다.');
    loadCap(meas.specId);
    loadList(true);
  };

  const handleDelete = async () => {
    const extra = meas.status === '완료' ? '\n완료된 측정이라 CPK·PPK 분석에서도 빠집니다.' : '';
    if (!window.confirm(`${meas.measNo} 측정을 삭제하시겠습니까? 입력한 값도 모두 지워집니다.${extra}`)) return;
    try {
      await deleteMeas([meas.measId]);
      showToast('삭제되었습니다.');
      setSelectedId(null);
      loadList(false);
      loadCap(meas.specId);
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const removeSet = (r) => {
    const cnt = r.cells.filter(Boolean).length;
    if (cnt && !window.confirm(`${r.title} 세트에 값 ${cnt}개가 있습니다. 세트를 빼면 값도 지워집니다. 뺄까요?`)) return;
    run(() => deleteSet(r.setId), `${r.title} 세트를 뺐습니다.`);
  };

  const saveCell = (setId, idx, raw, current) => {
    const text = String(raw ?? '').trim();
    const value = text === '' ? null : Number(text);
    if (text !== '' && (Number.isNaN(value) || value <= 0)) { showToast('숫자를 입력해주세요.', 'error'); return Promise.resolve(false); }
    if ((current == null && value == null) || (current != null && value != null && Number(current) === value)) return Promise.resolve(true);
    return setValue(setId, idx, value)
      .then((res) => { applyMeas(res.data, false); return true; })
      .catch((err) => { showToast(err.response?.data?.message ?? '저장에 실패했습니다.', 'error'); return false; });
  };

  return (
    <div className="mes-page dtm-page hd-page hd-meas-page">
      <div className="dtm-header-card">
        <div className="dtm-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon"><IconDiamond size={20} /></div>
            <div>
              <h2 className="mes-page-title">경도측정</h2>
              <p className="mes-page-desc">LOT마다 초물·중물·종물 세트에 경도를 기록합니다. 경도계 값은 '자동 수신'으로 바로 들어오고, '수동 입력'으로 직접 넣을 수도 있습니다. 완료하면 CPK·PPK가 바로 다시 계산됩니다.</p>
            </div>
          </div>
          <div className="dtm-header-right">
            <button type="button" className="mes-btn mes-btn-primary" disabled={!permission.canCreate} onClick={() => setModal('new')}>
              <IconPlus size={15} /> 새 측정
            </button>
          </div>
        </div>
      </div>

      <div className="hd-bench">
        {/* ── 측정 목록 ── */}
        <aside className="mes-card hd-list-card">
          <div className="hd-list-filters">
            <div className="dtm-quick" role="group" aria-label="기간">
              {QUICK.map((q) => <button key={q.key} type="button" className={quick === q.key ? 'is-on' : ''} onClick={() => setQuick(q.key)}>{q.label}</button>)}
            </div>
            <div className="hd-status-chips" role="group" aria-label="상태">
              {[['', '전체'], ['측정중', '측정중'], ['완료', '완료']].map(([v, l]) => (
                <button key={l} type="button" className={statusSel === v ? 'is-on' : ''} onClick={() => setStatusSel(v)}>{l}</button>
              ))}
            </div>
            <div className="hd-search">
              <IconSearch size={14} />
              <input
                placeholder="측정번호·품번·LOT·측정자"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadList(true); }}
                aria-label="측정 검색"
              />
            </div>
          </div>
          <ul className="hd-list">
            {listLoading && !list.length && <li className="hd-list-empty">불러오는 중…</li>}
            {!listLoading && !list.length && <li className="hd-list-empty">측정이 없습니다. '새 측정'으로 시작하세요.</li>}
            {list.map((m) => {
              const tot = (m.setCount ?? 0) * (m.sampleSize ?? 5);
              const pct = tot ? Math.round(((m.valueCount ?? 0) / tot) * 100) : 0;
              return (
                <li key={m.measId}>
                  <button type="button" className={`hd-list-item${m.measId === selectedId ? ' is-on' : ''}`} onClick={() => setSelectedId(m.measId)}>
                    <span className="hd-li-top">
                      <b>{m.partNo}</b>
                      <span className="hd-li-item">{m.itemName}</span>
                      <StatusBadge m={m} />
                    </span>
                    <span className="hd-li-mid">{m.equipCode && <span className="hd-eq">{equipLabel(m.equipCode)}</span>} LOT {m.lotNo || '-'}{m.checkRowId ? ' · CHECK SHEET' : ''}</span>
                    <span className="hd-li-bottom">
                      <span>{m.measNo} · {fmtDt(m.measDt).slice(5)}</span>
                      {m.status === '측정중'
                        ? <span className="hd-li-progress"><span className="hd-li-bar"><i style={{ width: `${pct}%` }} /></span><em>{m.valueCount}/{tot}</em></span>
                        : m.ngCount > 0 && <span className="hd-li-ng">규격 밖 {m.ngCount}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── 측정 작업 영역 ── */}
        <section className="hd-work">
          {!meas ? (
            <div className="mes-card hd-empty">왼쪽에서 측정을 고르거나 '새 측정'을 눌러 시작하세요.</div>
          ) : (
            <>
              <div className="mes-card hd-work-head">
                <div className="hd-wh-title">
                  <span className="hd-wh-part">{meas.partNo}{meas.productName && <small>{meas.productName}</small>}</span>
                  <span className="hd-wh-item">{meas.itemName}</span>
                  <StatusBadge m={meas} big />
                </div>
                <div className="hd-wh-chips">
                  <span>규격 <b>{fmtSpecRange({ ...meas, decimals: d })}</b></span>
                  <span>LOT <b>{meas.lotNo || '-'}</b></span>
                  <span>호기 <b>{meas.equipCode ? `${equipLabel(meas.equipCode)} (${meas.equipCode})` : '-'}</b></span>
                  <span>측정자 <b>{meas.workerName || '-'}</b></span>
                  <span>{meas.measNo} · {fmtDt(meas.measDt)}</span>
                </div>
                <div className="hd-wh-actions">
                  {!meas.checkRowId && permission.canUpdate && <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setModal('info')}><IconEdit size={15} /> 정보 수정</button>}
                  {!meas.checkRowId && permission.canDelete && <button type="button" className="mes-btn mes-btn-secondary hd-btn-danger" onClick={handleDelete}><IconTrash size={15} /> 삭제</button>}
                  {meas.checkRowId ? null : measuring
                    ? <button type="button" className="mes-btn mes-btn-primary" disabled={busy || !permission.canUpdate} onClick={handleComplete}><IconCheck size={15} /> 측정 완료</button>
                    : <button type="button" className="mes-btn mes-btn-secondary" disabled={busy || !permission.canUpdate} onClick={handleReopen}><IconArrowBackUp size={15} /> 다시 측정</button>}
                </div>
              </div>

              {meas.checkRowId && (
                <div className="hd-sheet-banner">
                  CHECK SHEET에서 입력한 측정입니다. 값은 CHECK SHEET에서 고쳐주세요.
                  <Link to={`/production/checkSheet?equip=${meas.equipCode}&date=${String(meas.measDt).slice(0, 10)}`}>CHECK SHEET 열기 →</Link>
                </div>
              )}

              {/* 경도계 / 입력 방식 */}
              {measuring && (
                <div className={`mes-card hd-device${meas.receiving === 'Y' ? ' is-live' : ''}`}>
                  <div className="hd-device-state">
                    <span className="hd-device-dot" aria-hidden="true" />
                    <div>
                      <b>{meas.receiving === 'Y' ? '경도계 자동 수신 중' : '자동 수신 꺼짐'}</b>
                      <span>
                        {meas.receiving === 'Y'
                          ? (next ? <>비커스 경도계에서 측정하면 <em>{next.title} · 경도{next.idx}</em>에 들어갑니다.</> : '모든 칸이 찼습니다. 측정을 완료하세요.')
                          : '자동 수신을 켜면 경도계 값이 다음 빈 칸에 차례로 들어갑니다. (경도계 C# 연동 후 사용)'}
                      </span>
                    </div>
                  </div>
                  {lastAuto && (
                    <div className="hd-device-last" title={`장비 ${lastAuto.deviceId || '-'}`}>
                      <span>마지막 수신</span>
                      <b>{Number(lastAuto.value).toFixed(d)}<small>{meas.unit}</small></b>
                      <em>{hms(lastAuto.measuredAt)}</em>
                    </div>
                  )}
                  <div className="hd-device-actions">
                    <button type="button" className={`mes-btn ${meas.receiving === 'Y' ? 'mes-btn-secondary' : 'mes-btn-primary'}`} disabled={busy || !permission.canUpdate} onClick={toggleReceive}>
                      {meas.receiving === 'Y' ? <><IconBroadcastOff size={15} /> 자동 수신 끄기</> : <><IconBroadcast size={15} /> 자동 수신 켜기</>}
                    </button>
                    <button type="button" className={`mes-btn ${manual ? 'mes-btn-primary' : 'mes-btn-secondary'}`} aria-pressed={manual} disabled={!canEdit} onClick={() => setManual((v) => !v)}>
                      <IconKeyboard size={15} /> {manual ? '수동 입력 끝내기' : '수동 입력'}
                    </button>
                  </div>
                </div>
              )}

              {!measuring && (
                <div className={`mes-card hd-result is-${meas.judgement === '합격' ? 'ok' : 'ng'}`}>
                  {meas.judgement === '합격' ? <IconCircleCheckFilled size={22} /> : <IconAlertTriangleFilled size={22} />}
                  <div>
                    <b>{meas.judgement || '판정 없음'}</b>
                    <span>{fmtDt(meas.completedDt)} 완료 · {filled}개 측정 · 규격 밖 {ngCount}개</span>
                  </div>
                </div>
              )}

              {/* 세트 × 경도1~n */}
              <div className="mes-card hd-grid-card">
                <div className="hd-grid-scroll">
                  <table className="hd-grid">
                    <thead>
                      <tr>
                        <th className="hd-col-set">세트</th>
                        {Array.from({ length: n }, (_, i) => <th key={i}>경도{i + 1}</th>)}
                        <th>평균</th>
                        <th>범위</th>
                        <th>판정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.setId}>
                          <th className="hd-col-set" scope="row">
                            <span className="hd-set-cell">
                              <span className={`hd-set-tag is-${setTone(r.setType)}`}>{r.title}</span>
                              {canEdit && rows.length > 1 && (
                                <button
                                  type="button"
                                  className="hd-set-del"
                                  title={`${r.title} 세트 빼기`}
                                  aria-label={`${r.title} 세트 빼기`}
                                  disabled={busy}
                                  onClick={() => removeSet(r)}
                                >
                                  <IconX size={13} />
                                </button>
                              )}
                            </span>
                          </th>
                          {r.cells.map((c, i) => {
                            const isNext = measuring && next?.setId === r.setId && next.idx === i + 1;
                            const v = c ? Number(c.value) : null;
                            const cls = [
                              'hd-cell',
                              c ? 'is-filled' : 'is-empty',
                              isOut(v, meas) ? 'is-ng' : '',
                              isNext && meas.receiving === 'Y' ? 'is-next' : '',
                              c && flash.has(c.valueId) ? 'is-flash' : '',
                            ].filter(Boolean).join(' ');
                            return (
                              <td key={i} className={cls}>
                                {canEdit && manual ? (
                                  <CellInput
                                    setId={r.setId}
                                    idx={i + 1}
                                    value={v}
                                    decimals={d}
                                    onSave={saveCell}
                                  />
                                ) : c ? (
                                  <span className="hd-cell-v" title={`${c.source === 'AUTO' ? `경도계 자동 수신${c.deviceId ? ` (${c.deviceId})` : ''}` : '수동 입력'} · ${hms(c.measuredAt)}`}>
                                    {v.toFixed(d)}
                                    <i className={`hd-src is-${c.source === 'AUTO' ? 'auto' : 'manual'}`} aria-hidden="true" />
                                  </span>
                                ) : (
                                  <span className="hd-cell-empty">{isNext && meas.receiving === 'Y' ? '대기' : '—'}</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="hd-cell-stat">{r.mean == null ? '-' : r.mean.toFixed(d + 1)}</td>
                          <td className="hd-cell-stat">{r.range == null ? '-' : r.range.toFixed(d)}</td>
                          <td className="hd-cell-judge">{r.judge ? <span className={`hd-judge is-${r.judge === 'OK' ? 'ok' : 'ng'}`}>{r.judge}</span> : <span className="dtm-empty">-</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="hd-grid-foot">
                  {canEdit && (
                    <div className="hd-add-set">
                      <span>세트 추가</span>
                      {['초물', '중물', '종물'].map((t) => (
                        <button key={t} type="button" className={`hd-add-btn is-${setTone(t)}`} disabled={busy} onClick={() => run(() => addSet(meas.measId, t), `${t} 세트를 추가했습니다.`)}>
                          <IconPlus size={12} /> {t}
                        </button>
                      ))}
                      {rows.length > 1 && (
                        <button type="button" className="hd-add-btn is-remove" disabled={busy} onClick={() => removeSet(rows[rows.length - 1])}>
                          <IconMinus size={12} /> 마지막 세트 빼기
                        </button>
                      )}
                    </div>
                  )}
                  <div className="hd-grid-summary">
                    <span className="hd-progress" aria-label={`입력 ${filled}/${total}`}><i style={{ width: `${total ? (filled / total) * 100 : 0}%` }} /></span>
                    <span>입력 <b>{filled}</b>/{total}</span>
                    <span>평균 <b>{allVals.length ? (allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(d + 1) : '-'}</b></span>
                    <span>최소 <b>{allVals.length ? Math.min(...allVals).toFixed(d) : '-'}</b></span>
                    <span>최대 <b>{allVals.length ? Math.max(...allVals).toFixed(d) : '-'}</b></span>
                    <span className={ngCount ? 'is-ng' : ''}>규격 밖 <b>{ngCount}</b></span>
                    <span className="hd-legend"><i className="hd-src is-auto" /> 자동 <i className="hd-src is-manual" /> 수동</span>
                  </div>
                </div>
              </div>

              {/* 공정능력 — 완료하면 자동으로 다시 계산 */}
              <div className="mes-card hd-cap-card">
                <div className="hd-cap-head">
                  <h4>공정능력 <small>{meas.partNo} · {meas.itemName} · 최근 {CAP_DAYS}일 완료 측정{cap ? ` · 부분군 ${cap.subgroupCount}개` : ''}</small></h4>
                  <div className="hd-cap-links">
                    <Link to={`/quality/cpk?specId=${meas.specId}`}>CPK 분석 <IconArrowRight size={13} /></Link>
                    <Link to={`/quality/ppk?specId=${meas.specId}`}>PPK 분석 <IconArrowRight size={13} /></Link>
                  </div>
                </div>
                {cap && cap.subgroupCount > 0 ? (() => {
                  const ppm = expectedPpm(cap.mean, cap.sigmaOverall, cap.spec?.lsl, cap.spec?.usl);
                  const target = cap.spec?.target ?? (cap.spec?.lsl != null && cap.spec?.usl != null ? (cap.spec.lsl + cap.spec.usl) / 2 : null);
                  const shift = target != null ? cap.mean - target : null;
                  const curMean = allVals.length ? allVals.reduce((a, b) => a + b, 0) / allVals.length : null;
                  const current = { measId: meas.measId, measNo: meas.measNo, lotNo: meas.lotNo, vals: allVals };
                  return (
                    <div className="hd-cap-body">
                      <div className="hd-cap-left">
                        <div className="hd-cap-idx">
                          <IndexCard kind="cpk" value={cap.cpk} compact sub={`σ 부분군 내 ${fmt(cap.sigmaWithin, d + 2)}`} />
                          <IndexCard kind="ppk" value={cap.ppk} compact sub={`σ 전체 ${fmt(cap.sigmaOverall, d + 2)}`} />
                        </div>
                        <dl className="hd-cap-facts">
                          <div><dt>전체 평균</dt><dd>{fmt(cap.mean, d + 1)} <small>{meas.unit}</small></dd></div>
                          <div><dt>이번 측정 평균</dt><dd className={curMean != null && isOut(curMean, meas) ? 'is-ng' : ''}>{curMean == null ? '-' : curMean.toFixed(d + 1)} <small>{meas.unit}</small></dd></div>
                          <div><dt>예상 규격 밖</dt><dd>{ppm ? (ppm.total < 0.1 ? '< 0.1' : ppm.total < 10 ? ppm.total.toFixed(1) : Math.round(ppm.total).toLocaleString('ko-KR')) : '-'} <small>ppm</small></dd></div>
                          <div><dt>중심 치우침</dt><dd>{shift == null ? '-' : `${shift > 0 ? '+' : ''}${shift.toFixed(d + 1)}`} <small>{meas.unit}</small></dd></div>
                          <div><dt>측정값</dt><dd>{cap.totalCount} <small>개 · 규격 밖 {cap.outOfSpec}</small></dd></div>
                        </dl>
                        {(cap.subgroupCount < cap.minSubgroups || measuring) && (
                          <p className="hd-cap-note">
                            {cap.subgroupCount < cap.minSubgroups && <>부분군 {cap.minSubgroups}개 미만이라 참고용입니다. </>}
                            {measuring && <>이번 측정은 완료하면 계산에 들어갑니다.</>}
                          </p>
                        )}
                        <CapFill cap={cap} />
                      </div>
                      <ChartCard
                        plain
                        title="최근 LOT 평균 추이"
                        sub="점 = LOT 평균 · 막대 = 최소~최대 · 점선 = 전체 평균 · 초록 = 이번 측정"
                        fill
                        render={(h, isBig) => <LotTrendChart cap={cap} current={current} height={h} last={isBig ? 40 : 20} />}
                      />
                    </div>
                  );
                })() : (
                  <p className="hd-cap-empty">아직 완료된 측정이 없습니다. 이 측정을 완료하면 CPK·PPK가 계산됩니다.</p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {modal === 'new' && (
        <NewMeasModal
          specs={specs}
          equipments={equipments}
          user={user}
          onClose={() => setModal(null)}
          onCreated={async (m) => {
            setModal(null);
            showToast(`${m.measNo} 측정을 시작했습니다.`);
            setStatusSel('');
            await loadList(true);
            setSelectedId(m.measId);
          }}
        />
      )}
      {modal === 'info' && meas && (
        <InfoModal
          meas={meas}
          equipments={equipments}
          user={user}
          onClose={() => setModal(null)}
          onSaved={(m) => { setModal(null); applyMeas(m, false); showToast('수정되었습니다.'); }}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}

const SET_ORDER = ['초물', '중물', '종물'];
const SETS_HEAD = 24; // 제목 줄(20 + 아래 여백 4)
const SETS_ROW = 26;
const HIST_HEAD = 24;
const HIST_MIN = 150;

/**
 * 공정능력 왼쪽 아래 남는 칸 — 높이를 재서 들어가는 만큼만 보여 준다(작은 화면에서 스크롤을 만들지 않게).
 * 자리가 있으면 초물·중물·종물 비교, 더 있으면 분포 히스토그램.
 */
function CapFill({ cap }) {
  const [ref, boxH] = useBoxHeight(true);
  const h = boxH - 10; // 위 여백(padding-top) 빼고
  const d = cap.spec?.decimals ?? 1;
  const sets = groupStats(cap, (g) => g.setType).sort((a, b) => SET_ORDER.indexOf(a.key) - SET_ORDER.indexOf(b.key));
  const setsH = SETS_HEAD + SETS_ROW * (sets.length + 1);
  const showSets = sets.length > 1 && h >= setsH;
  const histH = h - (showSets ? setsH + 12 : 0) - HIST_HEAD;
  const showHist = histH >= HIST_MIN;
  const maxAbs = Math.max(...sets.map((r) => Math.abs(r.mean - cap.mean)), 1e-9);
  return (
    <div className="hd-cap-fill" ref={ref}>
      {showSets && (
        <section className="hd-cap-sets">
          <h5>초물 · 중물 · 종물 비교 <small>막대 = 전체 평균과의 차이</small></h5>
          <table>
            <thead>
              <tr><th>구분</th><th className="is-num">평균</th><th>전체 평균 대비</th><th className="is-num">CPK</th><th className="is-num">PPK</th></tr>
            </thead>
            <tbody>
              {sets.map((r) => {
                const dev = r.mean - cap.mean;
                const w = Math.min(50, (Math.abs(dev) / maxAbs) * 50);
                return (
                  <tr key={r.key}>
                    <td><span className={`hd-set-tag is-${setTone(r.key)}`}>{r.key}</span></td>
                    <td className="is-num"><b>{r.mean.toFixed(d + 1)}</b></td>
                    <td>
                      <span className="hd-dev" title={`${dev > 0 ? '+' : ''}${dev.toFixed(d + 1)}`}>
                        <i className={dev >= 0 ? 'is-up' : 'is-down'} style={{ width: `${w}%` }} />
                        <em>{dev > 0 ? '+' : ''}{dev.toFixed(d + 1)}</em>
                      </span>
                    </td>
                    <td className="is-num"><span className={`hd-idx-chip is-${verdict(r.cpk, 'cpk').tone}`}>{fmt(r.cpk)}</span></td>
                    <td className="is-num"><span className={`hd-idx-chip is-${verdict(r.ppk, 'ppk').tone}`}>{fmt(r.ppk)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {showHist && (
        <section className="hd-cap-hist">
          <h5>분포 <small>{cap.totalCount}개 · 정규분포 곡선(전체 σ)</small></h5>
          <HistogramChart cap={cap} sigma={cap.sigmaOverall} height={histH} />
        </section>
      )}
    </div>
  );
}

function StatusBadge({ m, big }) {
  if (m.status === '측정중') {
    // 작업 영역 머리(big)에는 '자동 수신'을 안 띄운다 — 목록과 경도계 패널에 이미 나온다
    const live = m.receiving === 'Y' && !big;
    return <span className={`hd-status is-run${live ? ' is-live' : ''}${big ? ' is-big' : ''}`}><i />{live ? '자동 수신' : '측정중'}</span>;
  }
  return <span className={`hd-status is-${m.judgement === '합격' ? 'ok' : 'ng'}${big ? ' is-big' : ''}`}><i />{m.judgement || '완료'}</span>;
}

/** 수동 입력 칸 — Enter: 저장하고 다음 칸, Esc: 되돌리기 */
function CellInput({ setId, idx, value, decimals, onSave }) {
  const shown = value == null ? '' : value.toFixed(decimals);
  const [text, setText] = useState(shown);
  const sent = useRef(shown); // Enter 뒤 포커스가 옮겨가며 blur가 또 저장하지 않게
  useEffect(() => { setText(shown); sent.current = shown; }, [shown]);
  const commit = () => {
    if (text.trim() === sent.current) return;
    sent.current = text.trim();
    onSave(setId, idx, text, value);
  };
  return (
    <input
      className="hd-cell-input"
      inputMode="decimal"
      value={text}
      aria-label={`경도${idx}`}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { setText(shown); return; }
        if (e.key === 'Enter') {
          e.preventDefault();
          const inputs = [...document.querySelectorAll('.hd-cell-input')];
          const i = inputs.indexOf(e.currentTarget);
          commit();
          inputs[i + 1]?.focus();
          inputs[i + 1]?.select();
        }
      }}
    />
  );
}

function NewMeasModal({ specs, equipments, user, onClose, onCreated }) {
  const [specId, setSpecId] = useState(null);
  const [lotNo, setLotNo] = useState('');
  const [equipCode, setEquipCode] = useState('');
  const equipSpecs = useMemo(() => (specs ?? []).filter((s) => s.equipCode === equipCode), [specs, equipCode]);
  const [workerName, setWorkerName] = useState(user?.userName ?? '');
  const [counts, setCounts] = useState({ 초물: 1, 중물: 1, 종물: 1 });
  const [autoOn, setAutoOn] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const spec = (specs ?? []).find((s) => s.specId === specId);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!equipCode) { setError('호기를 고르세요.'); return; }
    if (!specId) { setError('품번 · 검사 항목을 선택하세요.'); return; }
    const setTypes = ['초물', '중물', '종물'].flatMap((t) => Array(counts[t]).fill(t));
    if (!setTypes.length) { setError('세트를 하나 이상 넣으세요.'); return; }
    setSaving(true);
    try {
      if (lotNo.trim()) {
        const dup = (await getMeasList({ specId, keyword: lotNo.trim() })).data?.find((m) => m.lotNo === lotNo.trim());
        if (dup && !window.confirm(`같은 LOT(${dup.lotNo})·같은 검사 항목의 측정이 이미 있습니다(${dup.measNo}, ${dup.status}).\n그래도 새로 측정할까요?`)) {
          setSaving(false);
          return;
        }
      }
      const res = await createMeas({
        specId, lotNo: lotNo.trim(), equipCode, workerName: workerName.trim(), setTypes,
        regUserId: user?.loginId ?? '', regUserName: user?.userName ?? '',
      });
      if (autoOn) await setReceiving(res.data.measId, true);
      onCreated(res.data);
    } catch (err) {
      setError(err.response?.data?.message ?? '측정을 시작하지 못했습니다.');
      setSaving(false);
    }
  };

  return (
    <Modal title="새 경도 측정" onClose={onClose} large className="hd-modal">
      <form onSubmit={submit} className="dtm-form">
        <div className="dtm-form-row">
          <div className="dtm-form-label">호기 * <span className="dtm-form-hint">같은 품번도 호기마다 규격이 다릅니다</span></div>
          <div className="hd-eq-pick" role="radiogroup" aria-label="호기">
            {equipments.map((eq) => {
              const cnt = (specs ?? []).filter((s) => s.equipCode === eq.equipCode).length;
              return (
                <button
                  key={eq.equipId}
                  type="button"
                  role="radio"
                  aria-checked={equipCode === eq.equipCode}
                  className={equipCode === eq.equipCode ? 'is-on' : ''}
                  title={`${eq.equipName} · 규격 ${cnt}개`}
                  onClick={() => { setEquipCode(eq.equipCode); setSpecId(null); }}
                >
                  {equipLabel(eq.equipCode, eq.equipName)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="dtm-form-row">
          <label className="dtm-form-label" htmlFor="hm-spec">품번 · 검사 항목 *</label>
          <SpecSelect specs={equipSpecs} value={specId} onChange={setSpecId} id="hm-spec" className="dtm-input" />
          {spec && <p className="hd-help">규격 <b>{fmtSpecRange(spec)}</b> · 세트마다 경도1~{spec.sampleSize}</p>}
          {equipCode && specs && !equipSpecs.length && <p className="dtm-form-empty">이 호기에 사용 중인 경도 규격이 없습니다. 기준정보 &gt; 경도관리에서 먼저 등록하세요.</p>}
          {!equipCode && <p className="hd-help">호기를 먼저 고르세요.</p>}
        </div>
        <div className="hd-grid-2">
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="hm-lot">LOT번호 <span className="dtm-form-hint">지금은 직접 입력</span></label>
            <input id="hm-lot" className="dtm-input" value={lotNo} maxLength={30} onChange={(e) => setLotNo(e.target.value)} placeholder="예) 261020-1001" />
          </div>
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="hm-worker">측정자</label>
            <input id="hm-worker" className="dtm-input" value={workerName} maxLength={50} onChange={(e) => setWorkerName(e.target.value)} />
          </div>
        </div>
        <div className="dtm-form-row">
          <div className="dtm-form-label">세트 <span className="dtm-form-hint">측정 중에도 더 추가할 수 있습니다</span></div>
          <div className="hd-set-steppers">
            {['초물', '중물', '종물'].map((t) => (
              <div key={t} className={`hd-stepper is-${setTone(t)}`}>
                <span>{t}</span>
                <button type="button" aria-label={`${t} 줄이기`} onClick={() => setCounts((c) => ({ ...c, [t]: Math.max(0, c[t] - 1) }))}>−</button>
                <b>{counts[t]}</b>
                <button type="button" aria-label={`${t} 늘리기`} onClick={() => setCounts((c) => ({ ...c, [t]: Math.min(9, c[t] + 1) }))}>+</button>
              </div>
            ))}
          </div>
        </div>
        <label className="hd-check">
          <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
          바로 경도계 자동 수신 켜기 <span className="dtm-form-hint">다른 측정의 자동 수신은 꺼집니다</span>
        </label>
        {error && <div className="mes-error">{error}</div>}
        <div className="mes-modal-footer">
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button>
          <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '시작 중...' : '측정 시작'}</button>
        </div>
      </form>
    </Modal>
  );
}

function InfoModal({ meas, equipments, user, onClose, onSaved }) {
  const [f, setF] = useState({ lotNo: meas.lotNo ?? '', equipCode: meas.equipCode ?? '', workerName: meas.workerName ?? '', remark: meas.remark ?? '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = await updateMeasInfo(meas.measId, { ...f, updUserId: user?.loginId ?? '', updUserName: user?.userName ?? '' });
      onSaved(res.data);
    } catch (err) {
      setError(err.response?.data?.message ?? '저장에 실패했습니다.');
    }
  };
  return (
    <Modal title={`측정 정보 — ${meas.measNo}`} onClose={onClose} className="hd-modal">
      <form onSubmit={submit} className="dtm-form">
        <div className="dtm-form-row">
          <label className="dtm-form-label" htmlFor="hi-lot">LOT번호</label>
          <input id="hi-lot" className="dtm-input" value={f.lotNo} maxLength={30} onChange={set('lotNo')} />
        </div>
        <div className="dtm-form-row">
          <div className="dtm-form-label">호기 <span className="dtm-form-hint">규격의 호기를 따릅니다</span></div>
          <div className="hd-help">{meas.equipCode ? `${equipLabel(meas.equipCode, equipments.find((e) => e.equipCode === meas.equipCode)?.equipName)} (${meas.equipCode})` : '-'}</div>
        </div>
        <div className="dtm-form-row">
          <label className="dtm-form-label" htmlFor="hi-worker">측정자</label>
          <input id="hi-worker" className="dtm-input" value={f.workerName} maxLength={50} onChange={set('workerName')} />
        </div>
        <div className="dtm-form-row">
          <label className="dtm-form-label" htmlFor="hi-remark">비고</label>
          <input id="hi-remark" className="dtm-input" value={f.remark} maxLength={300} onChange={set('remark')} />
        </div>
        {error && <div className="mes-error">{error}</div>}
        <div className="mes-modal-footer">
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button>
          <button type="submit" className="mes-btn mes-btn-primary">저장</button>
        </div>
      </form>
    </Modal>
  );
}
