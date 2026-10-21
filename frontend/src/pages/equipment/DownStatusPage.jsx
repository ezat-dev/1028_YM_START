import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  IconPlayerPause, IconPlus, IconTrash, IconFileSpreadsheet, IconCheck, IconPlayerPlay, IconChartBar,
} from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getList as getEquipmentList } from '../../api/base/equipmentApi';
import { getReasonList, getDowntimeList, createDowntimes, updateDowntime, deleteDowntimes } from '../../api/base/downtimeApi';
import DowntimeStats from './DowntimeStats';
import '../../styles/downtime.css';

/*
 * 설비관리 > 설비비가동현황 — 설비 비가동 내역(수동 등록)을 조회·등록·수정·삭제하고 통계를 본다.
 *  - 설비를 여러 대 골라 같은 내용을 한 번에 등록(설비마다 1건씩 저장), 등록·수정자는 로그인 ID로 기록
 *  - 들어오면 통계 팝업을 먼저 띄운다(조회 버튼 옆 '통계'로 다시 열기)
 * 설비는 기준정보 > 설비관리, 사유는 기준정보 > 비가동관리(비가동 사유 기준정보)에서 가져온다.
 * 나중에 PLC 신호로 들어오는 비가동(source=PLC)도 같은 표에 쌓을 예정 — 지금은 수동 등록만.
 */

const REASON_TYPES = [
  { value: '계획정지', tone: 'plan' },
  { value: '고장정지', tone: 'fail' },
  { value: '대기', tone: 'wait' },
  { value: '기타', tone: 'etc' },
];
const TONE = Object.fromEntries(REASON_TYPES.map((t) => [t.value, t.tone]));
// 설비 상태 → 색 (기준정보 > 설비관리와 같은 구분)
const EQUIP_TONE = { 가동: 'run', 정지: 'stop', 고장: 'fail', 점검: 'check', 유지보수: 'maint' };

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
// datetime-local 입력값 'YYYY-MM-DDTHH:mm'
const toLocalInput = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDt = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : '');
const nextDay = (s) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + 1); return ymd(d); };

function fmtDur(min) {
  if (min == null) return '-';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

const QUICK = [
  { key: 'today', label: '오늘', from: () => daysAgo(0) },
  { key: '7d', label: '7일', from: () => daysAgo(6) },
  { key: '30d', label: '30일', from: () => daysAgo(29) },
];

// 등록·수정자 표시 — '홍길동 (hong)'
const who = (name, id) => (name || id ? `${name || '-'}${id ? ` (${id})` : ''}` : '');
const shortDt = (v) => (v ? String(v).replace('T', ' ').slice(5, 16).replace('-', '/') : '');

/** 표 셀 — 1줄 등록, (수정됐으면) 2줄 수정 */
function AuditCell({ row }) {
  const reg = who(row.regUserName, row.regUserId) || '-';
  const upd = who(row.updUserName, row.updUserId);
  return (
    <span className="dtm-audit">
      <span title={`등록 ${reg} · ${fmtDt(row.regDt)}`}><em>등록</em>{reg}<small>{shortDt(row.regDt)}</small></span>
      {upd && <span className="is-upd" title={`수정 ${upd} · ${fmtDt(row.updDt)}`}><em>수정</em>{upd}<small>{shortDt(row.updDt)}</small></span>}
    </span>
  );
}

function TypeBadge({ value }) {
  return <span className={`dtm-type is-${TONE[value] ?? 'etc'}`}><i />{value}</span>;
}

export default function DownStatusPage() {
  const [equipments, setEquipments] = useState([]);
  const [reasons, setReasons] = useState([]);
  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/equipment/downStatus');
  // 페이지에 들어오면 통계를 먼저 띄운다 — 한 번만
  const autoStatsRef = useRef(true);

  useEffect(() => {
    getEquipmentList('', '', '')
      .then((res) => setEquipments(res.data ?? []))
      .catch(() => showToast('설비 목록을 불러오지 못했습니다.', 'error'));
    getReasonList('', '')
      .then((res) => setReasons(res.data ?? []))
      .catch(() => showToast('비가동 사유를 불러오지 못했습니다.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mes-page dtm-page mes-page-fill">
      <DowntimeList
        equipments={equipments}
        reasons={reasons}
        permission={permission}
        user={user}
        showToast={showToast}
        autoStatsRef={autoStatsRef}
      />
      <Toast toast={toast} />
    </div>
  );
}

function Header({ action }) {
  return (
    <div className="dtm-header-top">
      <div className="mes-page-heading">
        <div className="mes-page-icon"><IconPlayerPause size={20} /></div>
        <div>
          <h2 className="mes-page-title">설비비가동현황</h2>
          <p className="mes-page-desc">설비 비가동 내역을 조회하고 수동으로 등록합니다. 설비를 여러 대 골라 한 번에 등록할 수 있고, 행을 더블클릭하면 수정합니다.</p>
        </div>
      </div>
      <div className="dtm-header-right">{action}</div>
    </div>
  );
}

/* ───────────────────────── 비가동 내역 ───────────────────────── */

function DowntimeList({ equipments, reasons, permission, user, showToast, autoStatsRef }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const [fromSel, setFromSel] = useState(() => daysAgo(6));
  const [toSel, setToSel] = useState(() => daysAgo(0));
  const [equipSel, setEquipSel] = useState('');
  const [typeSel, setTypeSel] = useState('');
  const [keywordSel, setKeywordSel] = useState('');
  const [query, setQuery] = useState(() => ({ from: daysAgo(6), to: daysAgo(0), equipId: '', reasonType: '', keyword: '' }));

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const fetchRows = useCallback(() => {
    setLoading(true);
    getDowntimeList({
      from: `${query.from}T00:00:00`,
      to: `${nextDay(query.to)}T00:00:00`,
      equipId: query.equipId,
      reasonType: query.reasonType,
      keyword: query.keyword,
    })
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('비가동 내역을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // 첫 조회와 설비 목록이 다 들어온 뒤 통계 팝업을 연다
  useEffect(() => {
    if (autoStatsRef.current && !loading && equipments.length > 0) {
      autoStatsRef.current = false;
      setStatsOpen(true);
    }
  }, [loading, equipments, autoStatsRef]);

  const handleSearch = (over = {}) => {
    const from = over.from ?? fromSel;
    const to = over.to ?? toSel;
    setQuery({ from: from <= to ? from : to, to: from <= to ? to : from, equipId: equipSel, reasonType: typeSel, keyword: keywordSel.trim() });
  };

  const applyQuick = (q) => {
    const from = q.from();
    const to = daysAgo(0);
    setFromSel(from);
    setToSel(to);
    handleSearch({ from, to });
  };
  const activeQuick = QUICK.find((q) => q.from() === fromSel && toSel === daysAgo(0))?.key;

  // 요약 — 건수, 총 시간, 진행 중, 구분별 시간
  const summary = useMemo(() => {
    const byType = Object.fromEntries(REASON_TYPES.map((t) => [t.value, 0]));
    let total = 0;
    let running = 0;
    rows.forEach((r) => {
      total += r.durationMin ?? 0;
      if (!r.endDt) running += 1;
      if (byType[r.reasonType] != null) byType[r.reasonType] += r.durationMin ?? 0;
    });
    return { total, running, byType };
  }, [rows]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = useCallback((row) => {
    if (!permission.canUpdate) return;
    if (row.source === 'SHEET') {
      showToast('CHECK SHEET에서 입력한 비가동입니다. CHECK SHEET 행에서 고쳐주세요.', 'error');
      return;
    }
    setEditing(row);
    setFormOpen(true);
  }, [permission.canUpdate, showToast]);

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) { showToast('삭제할 비가동 내역을 선택해주세요.', 'error'); return; }
    if (!window.confirm(`선택한 ${selectedKeys.size}건을 삭제하시겠습니까?`)) return;
    try {
      await deleteDowntimes(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchRows();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheet = rows.map((r, i) => ({
      No: i + 1, 설비코드: r.equipCode, 설비명: r.equipName, 구분: r.reasonType, 사유: r.reasonName,
      시작: fmtDt(r.startDt), 종료: r.endDt ? fmtDt(r.endDt) : '진행 중', '시간(분)': r.durationMin,
      메모: r.memo, 입력: r.source === 'PLC' ? 'PLC' : r.source === 'SHEET' ? 'CHECK SHEET' : '수동',
      등록자: r.regUserName, 등록자ID: r.regUserId, 등록일시: fmtDt(r.regDt),
      수정자: r.updUserName, 수정자ID: r.updUserId, 수정일시: r.updUserName || r.updUserId ? fmtDt(r.updDt) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '비가동');
    XLSX.writeFile(wb, `비가동내역_${query.from}_${query.to}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, idx) => idx + 1 },
    {
      key: 'equip', title: '설비', width: 150, sortValue: (r) => r.equipCode,
      render: (r) => (
        <span className="dtm-equip"><b>{r.equipCode}</b><span title={r.equipName}>{r.equipName}</span></span>
      ),
    },
    { key: 'reasonType', title: '구분', width: 96, align: 'center', sortValue: (r) => r.reasonType, render: (r) => <TypeBadge value={r.reasonType} /> },
    { key: 'reasonName', title: '사유', width: 130, sortValue: (r) => r.reasonName, render: (r) => <span className="dtm-reason">{r.reasonName}</span> },
    { key: 'startDt', title: '시작', width: 130, align: 'center', sortValue: (r) => r.startDt, render: (r) => <span className="dtm-num">{fmtDt(r.startDt)}</span> },
    {
      key: 'endDt', title: '종료', width: 130, align: 'center', sortValue: (r) => r.endDt ?? '9999',
      render: (r) => (r.endDt ? <span className="dtm-num">{fmtDt(r.endDt)}</span> : <span className="dtm-running"><i />진행 중</span>),
    },
    { key: 'durationMin', title: '시간', width: 100, align: 'right', sortValue: (r) => r.durationMin, render: (r) => <span className="dtm-dur">{fmtDur(r.durationMin)}</span> },
    { key: 'memo', title: '메모', width: 200, render: (r) => (r.memo ? <span className="dtm-memo" title={r.memo}>{r.memo}</span> : <span className="dtm-empty">-</span>) },
    {
      key: 'source', title: '입력', width: 84, align: 'center', sortValue: (r) => r.source,
      render: (r) => (r.source === 'SHEET'
        ? <span className="dtm-src is-plc" title="CHECK SHEET에서 입력 — 거기서 고칩니다">CHECK SHEET</span>
        : <span className={`dtm-src is-${r.source === 'PLC' ? 'plc' : 'manual'}`}>{r.source === 'PLC' ? 'PLC' : '수동'}</span>),
    },
    { key: 'audit', title: '등록 / 수정', width: 190, sortValue: (r) => r.updDt ?? r.regDt, render: (r) => <AuditCell row={r} /> },
  ], []);

  return (
    <>
      <div className="dtm-header-card">
        <Header
          action={(
            <button type="button" className="mes-btn mes-btn-primary" disabled={!permission.canCreate} title={!permission.canCreate ? '등록 권한이 없습니다' : undefined} onClick={openCreate}>
              <IconPlus size={15} /> 비가동 등록
            </button>
          )}
        />

        <div className="dtm-header-sep" />

        <div className="dtm-header-controls">
          <div className="dtm-quick" role="group" aria-label="기간 빠른 선택">
            {QUICK.map((q) => (
              <button key={q.key} type="button" className={activeQuick === q.key ? 'is-on' : ''} onClick={() => applyQuick(q)}>{q.label}</button>
            ))}
          </div>
          <div className="dtm-dates">
            <input type="date" className="mes-field-inline" value={fromSel} max={toSel} onChange={(e) => setFromSel(e.target.value)} aria-label="시작일" />
            <span aria-hidden="true">~</span>
            <input type="date" className="mes-field-inline" value={toSel} min={fromSel} max={daysAgo(0)} onChange={(e) => setToSel(e.target.value)} aria-label="종료일" />
          </div>
          <select className="mes-field-inline" value={equipSel} onChange={(e) => setEquipSel(e.target.value)} aria-label="설비">
            <option value="">전체 설비</option>
            {equipments.map((e) => <option key={e.equipId} value={e.equipId}>{e.equipCode} {e.equipName}</option>)}
          </select>
          <select className="mes-field-inline" value={typeSel} onChange={(e) => setTypeSel(e.target.value)} aria-label="구분">
            <option value="">전체 구분</option>
            {REASON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
          </select>
          <input
            className="mes-field-inline dtm-keyword"
            placeholder="사유·메모·등록자"
            value={keywordSel}
            onChange={(e) => setKeywordSel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={() => handleSearch()}>조회</button>
          <button type="button" className="mes-btn mes-btn-secondary dtm-stats-btn" onClick={() => setStatsOpen(true)} title="지금 조회 조건으로 통계 보기">
            <IconChartBar size={15} /> 통계
          </button>
          <div className="dtm-header-spacer" />
          {permission.canDelete && (
            <button type="button" className="mes-btn mes-btn-danger" onClick={handleDeleteSelected}>
              <IconTrash size={15} /> 선택 삭제
            </button>
          )}
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleExportExcel} disabled={rows.length === 0}>
            <IconFileSpreadsheet size={15} /> 엑셀
          </button>
        </div>

        <div className="dtm-summary" aria-label="조회 요약">
          <span>총 <b>{rows.length}</b>건</span>
          <span>비가동 <b>{fmtDur(summary.total)}</b></span>
          <span className={summary.running ? 'is-running' : ''}>진행 중 <b>{summary.running}</b>건</span>
          <span className="dtm-summary-sep" aria-hidden="true" />
          {REASON_TYPES.map((t) => (
            <span key={t.value} className={`dtm-summary-type is-${t.tone}`}><i />{t.value} <b>{fmtDur(summary.byType[t.value])}</b></span>
          ))}
        </div>
      </div>

      <div className="mes-card mes-card-fill dtm-table-card">
        <div className="dtm-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.downtimeId}
            onRowDoubleClick={openEdit}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="조회 기간에 등록된 비가동이 없습니다."
          />
        </div>
      </div>

      {statsOpen && (
        <DowntimeStats
          rows={rows}
          equipments={equipments.filter((e) => e.useYn === 'Y' || rows.some((r) => r.equipId === e.equipId))}
          query={query}
          onClose={() => setStatsOpen(false)}
        />
      )}

      {formOpen && (
        <DowntimeForm
          editing={editing}
          equipments={equipments}
          reasons={reasons}
          user={user}
          onClose={() => setFormOpen(false)}
          onSaved={(msg) => { setFormOpen(false); showToast(msg); fetchRows(); }}
        />
      )}
    </>
  );
}

/** 비가동 등록/수정 — 등록은 설비 여러 대, 수정은 1대 */
function DowntimeForm({ editing, equipments, reasons, user, onClose, onSaved }) {
  const multi = !editing;
  const now = new Date();
  now.setSeconds(0, 0);
  const [equipIds, setEquipIds] = useState(() => new Set(editing ? [editing.equipId] : []));
  const [reasonId, setReasonId] = useState(editing ? String(editing.reasonId) : '');
  const [startDt, setStartDt] = useState(editing ? String(editing.startDt).slice(0, 16) : toLocalInput(now));
  const [running, setRunning] = useState(editing ? !editing.endDt : false);
  const [endDt, setEndDt] = useState(editing?.endDt ? String(editing.endDt).slice(0, 16) : '');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // 사용 중인 설비·사유만(수정 중인 건이 쓰는 것은 미사용이어도 보이게)
  const equipOptions = equipments.filter((e) => e.useYn === 'Y' || e.equipId === editing?.equipId);
  const reasonOptions = reasons.filter((r) => r.useYn === 'Y' || r.reasonId === editing?.reasonId);
  const allOn = equipOptions.length > 0 && equipOptions.every((e) => equipIds.has(e.equipId));

  const toggleEquip = (id) => {
    setEquipIds((prev) => {
      if (!multi) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => setEquipIds(allOn ? new Set() : new Set(equipOptions.map((e) => e.equipId)));

  const durationMin = useMemo(() => {
    if (!startDt) return null;
    const s = new Date(startDt).getTime();
    const e = running ? Date.now() : (endDt ? new Date(endDt).getTime() : null);
    if (e == null || Number.isNaN(s)) return null;
    return Math.round((e - s) / 60000);
  }, [startDt, endDt, running]);

  const setEndAfter = (min) => {
    if (!startDt) return;
    const d = new Date(new Date(startDt).getTime() + min * 60000);
    setEndDt(toLocalInput(d));
    setRunning(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (equipIds.size === 0) { setError('설비를 하나 이상 선택하세요.'); return; }
    if (!reasonId) { setError('비가동 사유를 선택하세요.'); return; }
    if (!startDt) { setError('시작 시각을 입력하세요.'); return; }
    if (!running && !endDt) { setError("종료 시각을 입력하거나 '진행 중'을 선택하세요."); return; }
    if (!running && endDt <= startDt) { setError('종료 시각은 시작 시각보다 뒤여야 합니다.'); return; }

    const body = {
      reasonId: Number(reasonId),
      startDt,
      endDt: running ? null : endDt,
      memo: memo.trim(),
    };
    setSaving(true);
    try {
      if (editing) {
        await updateDowntime(editing.downtimeId, { ...body, equipId: [...equipIds][0], updUserId: user?.loginId ?? '', updUserName: user?.userName ?? '' });
        onSaved('수정되었습니다.');
      } else {
        const res = await createDowntimes({ ...body, equipIds: [...equipIds], regUserId: user?.loginId ?? '', regUserName: user?.userName ?? '' });
        onSaved(`${res.data?.length ?? equipIds.size}건 등록되었습니다.`);
      }
    } catch (err) {
      setError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? `비가동 수정 — ${editing.equipCode}` : '비가동 등록'} onClose={onClose} large>
      <form onSubmit={submit} className="dtm-form">
        <div className="dtm-form-row">
          <div className="dtm-form-label">
            설비 *
            {multi && <span className="dtm-form-hint">여러 대 선택 가능 · <b>{equipIds.size}</b>대 선택</span>}
          </div>
          <div className="dtm-equip-grid" role={multi ? 'group' : 'radiogroup'} aria-label="설비 선택">
            {equipOptions.map((eq) => {
              const on = equipIds.has(eq.equipId);
              return (
                <button
                  key={eq.equipId}
                  type="button"
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  className={`dtm-equip-opt${on ? ' is-on' : ''}`}
                  onClick={() => toggleEquip(eq.equipId)}
                >
                  <span className="dtm-equip-check" aria-hidden="true">{on && <IconCheck size={12} stroke={3} />}</span>
                  <span className="dtm-equip-text">
                    <b>{eq.equipCode}</b>
                    <span>{eq.equipName}</span>
                  </span>
                  <span className={`dtm-equip-status is-${EQUIP_TONE[eq.equipStatus] ?? 'stop'}`} title={`설비 상태: ${eq.equipStatus}`}>{eq.equipStatus}</span>
                </button>
              );
            })}
            {multi && equipOptions.length > 1 && (
              <button type="button" className={`dtm-equip-all${allOn ? ' is-on' : ''}`} onClick={toggleAll}>
                {allOn ? '전체 해제' : '전체 선택'}
              </button>
            )}
          </div>
          {equipOptions.length === 0 && <p className="dtm-form-empty">사용 중인 설비가 없습니다. 기준정보 &gt; 설비관리에서 먼저 등록하세요.</p>}
        </div>

        <div className="dtm-form-row">
          <label className="dtm-form-label" htmlFor="dtm-reason">비가동 사유 *</label>
          <select id="dtm-reason" className="dtm-input" value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
            <option value="">사유를 선택하세요</option>
            {REASON_TYPES.map((t) => {
              const list = reasonOptions.filter((r) => r.reasonType === t.value);
              return list.length ? (
                <optgroup key={t.value} label={t.value}>
                  {list.map((r) => <option key={r.reasonId} value={r.reasonId}>{r.reasonName}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </div>

        <div className="dtm-form-row dtm-time-row">
          <div className="dtm-time">
            <label className="dtm-form-label" htmlFor="dtm-start">시작 *</label>
            <input id="dtm-start" type="datetime-local" className="dtm-input" value={startDt} max={toLocalInput(new Date())} onChange={(e) => setStartDt(e.target.value)} />
          </div>
          <div className="dtm-time">
            <label className="dtm-form-label" htmlFor="dtm-end">종료</label>
            <input id="dtm-end" type="datetime-local" className="dtm-input" value={running ? '' : endDt} min={startDt} disabled={running} onChange={(e) => setEndDt(e.target.value)} />
          </div>
          <div className="dtm-time-tools">
            <label className={`dtm-running-toggle${running ? ' is-on' : ''}`}>
              <input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} />
              <IconPlayerPlay size={13} /> 진행 중 (종료 미정)
            </label>
            <div className="dtm-quick-dur" role="group" aria-label="종료 빠르게 넣기">
              {[30, 60, 120].map((m) => (
                <button key={m} type="button" onClick={() => setEndAfter(m)}>+{m < 60 ? `${m}분` : `${m / 60}시간`}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="dtm-duration">
          비가동 시간 <b>{durationMin == null ? '-' : durationMin < 0 ? '시간을 확인하세요' : fmtDur(durationMin)}</b>
          {running && <em>(지금까지)</em>}
          {multi && equipIds.size > 1 && <span> · 설비 {equipIds.size}대에 같은 내용으로 {equipIds.size}건 등록</span>}
        </div>

        <div className="dtm-form-row">
          <label className="dtm-form-label" htmlFor="dtm-memo">메모</label>
          <textarea id="dtm-memo" className="dtm-input" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={300} placeholder="예) 패턴 PT0001 → PT0003 변경" />
        </div>

        {editing ? (
          <div className="dtm-form-audit">
            <span><em>등록</em>{who(editing.regUserName, editing.regUserId) || '-'} · {fmtDt(editing.regDt)}</span>
            {(editing.updUserName || editing.updUserId) && <span><em>마지막 수정</em>{who(editing.updUserName, editing.updUserId)} · {fmtDt(editing.updDt)}</span>}
            <span className="is-me"><em>이번 수정</em>{who(user?.userName, user?.loginId) || '-'}</span>
          </div>
        ) : (
          <div className="dtm-form-audit">
            <span className="is-me"><em>등록자</em>{who(user?.userName, user?.loginId) || '-'}</span>
          </div>
        )}

        {error && <div className="mes-error" style={{ marginTop: 4 }}>{error}</div>}
        <div className="mes-modal-footer">
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button>
          <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>
            {saving ? '저장 중...' : editing ? '저장' : `등록${equipIds.size > 1 ? ` (${equipIds.size}건)` : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
