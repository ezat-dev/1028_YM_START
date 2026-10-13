import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { IconTool, IconPlus, IconTrash, IconFileSpreadsheet, IconHammer, IconEdit, IconListDetails } from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getList as getEquipmentList } from '../../api/base/equipmentApi';
import { getHistoryList, getHistory, createHistory, updateHistory, deleteHistories } from '../../api/equipment/historyApi';
import {
  daysAgo, nextDay, toLocalInput, fmtDt, inputDt, who, QUICK,
  AuditCell, FormAudit, AttachEditor, AttachList, ClipCount, applyAttachChanges,
} from './equipHistShared';
import '../../styles/downtime.css';
import '../../styles/equipHist.css';

/*
 * 설비관리 > 설비이력관리 — 설비 생애주기(점검·교체·변경·설치·개조·수리·기타)를 남긴다.
 *  - 수리이력관리에서 '완료'된 수리는 '수리' 이력으로 자동 등록되고, 그 행은 여기서 읽기만 한다(수정은 수리이력에서)
 *  - 첨부파일 여러 개, 등록·수정자는 로그인 ID로 기록
 */

export const HIST_TYPES = [
  { value: '점검', tone: 'check' },
  { value: '교체', tone: 'replace' },
  { value: '변경', tone: 'change' },
  { value: '설치', tone: 'install' },
  { value: '개조', tone: 'modify' },
  { value: '수리', tone: 'repair' },
  { value: '기타', tone: 'etc' },
];
const TONE = Object.fromEntries(HIST_TYPES.map((t) => [t.value, t.tone]));
// 직접 등록할 때 고르는 유형 — '수리'는 수리이력관리에서 완료하면 자동으로 생긴다
const MANUAL_TYPES = HIST_TYPES.filter((t) => t.value !== '수리');

function HistType({ value }) {
  return <span className={`eqh-type is-${TONE[value] ?? 'etc'}`}><i />{value}</span>;
}

export default function HistoryPage() {
  const [equipments, setEquipments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/equipment/history');

  const [fromSel, setFromSel] = useState(() => daysAgo(89));
  const [toSel, setToSel] = useState(() => daysAgo(0));
  const [equipSel, setEquipSel] = useState('');
  const [typeSel, setTypeSel] = useState('');
  const [keywordSel, setKeywordSel] = useState('');
  const [query, setQuery] = useState(() => ({ from: daysAgo(89), to: daysAgo(0), equipId: '', histType: '', keyword: '' }));

  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(null); // { editing: row|null }

  useEffect(() => {
    getEquipmentList('', '', '')
      .then((res) => setEquipments(res.data ?? []))
      .catch(() => showToast('설비 목록을 불러오지 못했습니다.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRows = useCallback(() => {
    setLoading(true);
    getHistoryList({
      from: `${query.from}T00:00:00`,
      to: `${nextDay(query.to)}T00:00:00`,
      equipId: query.equipId,
      histType: query.histType,
      keyword: query.keyword,
    })
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('설비이력을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleSearch = (over = {}) => {
    const from = over.from ?? fromSel;
    const to = over.to ?? toSel;
    setQuery({
      from: from <= to ? from : to,
      to: from <= to ? to : from,
      equipId: equipSel,
      histType: over.histType ?? typeSel,
      keyword: keywordSel.trim(),
    });
  };
  const applyQuick = (q) => {
    const from = q.from();
    const to = daysAgo(0);
    setFromSel(from);
    setToSel(to);
    handleSearch({ from, to });
  };
  const activeQuick = QUICK.find((q) => q.from() === fromSel && toSel === daysAgo(0))?.key;
  const pickType = (v) => { setTypeSel(v); handleSearch({ histType: v }); };

  const counts = useMemo(() => {
    const c = Object.fromEntries(HIST_TYPES.map((t) => [t.value, 0]));
    rows.forEach((r) => { if (c[r.histType] != null) c[r.histType] += 1; });
    return c;
  }, [rows]);

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) { showToast('삭제할 이력을 선택해주세요.', 'error'); return; }
    const linked = rows.filter((r) => selectedKeys.has(r.histId) && r.repairId);
    if (linked.length) {
      showToast(`수리 연동 이력 ${linked.length}건은 여기서 삭제할 수 없습니다. 수리이력관리에서 처리해주세요.`, 'error');
      return;
    }
    if (!window.confirm(`선택한 ${selectedKeys.size}건을 삭제하시겠습니까?\n첨부파일도 함께 삭제됩니다.`)) return;
    try {
      await deleteHistories(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchRows();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheet = rows.map((r, i) => ({
      No: i + 1, 이력번호: r.histNo, 발생일시: fmtDt(r.workDt), 설비코드: r.equipCode, 설비명: r.equipName,
      이력유형: r.histType, 이력제목: r.title, 작업내용: r.content, 작업자: r.workerName,
      연결수리: r.repairNo ?? '', 첨부: r.attachCount ?? 0,
      등록자: r.regUserName, 등록자ID: r.regUserId, 등록일시: fmtDt(r.regDt),
    }));
    const ws = XLSX.utils.json_to_sheet(sheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '설비이력');
    XLSX.writeFile(wb, `설비이력_${query.from}_${query.to}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'histNo', title: '이력번호', width: 124, align: 'center', sortValue: (r) => r.histNo, render: (r) => <span className="eqh-no">{r.histNo}</span> },
    { key: 'workDt', title: '발생일시', width: 128, align: 'center', sortValue: (r) => r.workDt, render: (r) => <span className="dtm-num">{fmtDt(r.workDt)}</span> },
    { key: 'equipCode', title: '설비코드', width: 76, align: 'center', sortValue: (r) => r.equipCode, render: (r) => <b className="eqh-code">{r.equipCode}</b> },
    { key: 'equipName', title: '설비명', width: 130, sortValue: (r) => r.equipName, render: (r) => <span className="eqh-ellipsis" title={r.equipName}>{r.equipName}</span> },
    { key: 'histType', title: '이력유형', width: 84, align: 'center', sortValue: (r) => r.histType, render: (r) => <HistType value={r.histType} /> },
    {
      key: 'title', title: '이력제목', width: 240, sortValue: (r) => r.title,
      render: (r) => (
        <span className="eqh-title-cell">
          {r.repairId && <span className="eqh-link-tag" title={`수리이력 ${r.repairNo}에서 자동 등록`}><IconHammer size={11} />수리</span>}
          <span className="eqh-ellipsis" title={r.title}>{r.title}</span>
          <ClipCount n={r.attachCount} />
        </span>
      ),
    },
    { key: 'content', title: '작업내용', width: 220, render: (r) => (r.content ? <span className="eqh-ellipsis eqh-sub" title={r.content}>{r.content.replace(/\n/g, ' · ')}</span> : <span className="dtm-empty">-</span>) },
    { key: 'workerName', title: '작업자', width: 96, align: 'center', sortValue: (r) => r.workerName, render: (r) => r.workerName || <span className="dtm-empty">-</span> },
    { key: 'audit', title: '등록 / 수정', width: 180, sortValue: (r) => r.updDt ?? r.regDt, render: (r) => <AuditCell row={r} /> },
    {
      key: 'detail', title: '상세', width: 64, align: 'center', fixed: true,
      render: (r) => <button type="button" className="eqh-detail-btn" onClick={() => setDetailId(r.histId)} aria-label={`${r.histNo} 상세`}><IconListDetails size={15} /></button>,
    },
  ], []);

  return (
    <div className="mes-page dtm-page eqh-page mes-page-fill">
      <div className="dtm-header-card">
        <div className="dtm-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon"><IconTool size={20} /></div>
            <div>
              <h2 className="mes-page-title">설비이력관리</h2>
              <p className="mes-page-desc">설비 점검·교체·변경·설치·개조 이력을 남깁니다. 수리이력관리에서 완료된 수리는 &lsquo;수리&rsquo; 이력으로 자동 등록됩니다. 행을 더블클릭하면 상세를 봅니다.</p>
            </div>
          </div>
          <div className="dtm-header-right">
            <button type="button" className="mes-btn mes-btn-primary" disabled={!permission.canCreate} title={!permission.canCreate ? '등록 권한이 없습니다' : undefined} onClick={() => setForm({ editing: null })}>
              <IconPlus size={15} /> 이력 등록
            </button>
          </div>
        </div>

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
            <input type="date" className="mes-field-inline" value={toSel} min={fromSel} onChange={(e) => setToSel(e.target.value)} aria-label="종료일" />
          </div>
          <select className="mes-field-inline" value={equipSel} onChange={(e) => setEquipSel(e.target.value)} aria-label="설비">
            <option value="">전체 설비</option>
            {equipments.map((e) => <option key={e.equipId} value={e.equipId}>{e.equipCode} {e.equipName}</option>)}
          </select>
          <input
            className="mes-field-inline dtm-keyword"
            placeholder="번호·제목·내용·작업자"
            value={keywordSel}
            onChange={(e) => setKeywordSel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={() => handleSearch()}>조회</button>
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

        {/* 유형 칩 — 누르면 그 유형만 */}
        <div className="eqh-chips" role="group" aria-label="이력 유형">
          <button type="button" className={`eqh-chip${!query.histType ? ' is-on' : ''}`} onClick={() => pickType('')}>
            전체 <b>{query.histType ? '' : rows.length}</b>
          </button>
          {HIST_TYPES.map((t) => (
            <button key={t.value} type="button" className={`eqh-chip is-${t.tone}${query.histType === t.value ? ' is-on' : ''}`} onClick={() => pickType(query.histType === t.value ? '' : t.value)}>
              <i />{t.value} {!query.histType && <b>{counts[t.value]}</b>}
            </button>
          ))}
        </div>
      </div>

      <div className="mes-card mes-card-fill dtm-table-card">
        <div className="dtm-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.histId}
            onRowDoubleClick={(r) => setDetailId(r.histId)}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="조회 기간에 등록된 설비이력이 없습니다."
          />
        </div>
      </div>

      {detailId != null && (
        <HistoryDetail
          histId={detailId}
          permission={permission}
          onClose={() => setDetailId(null)}
          onEdit={(row) => { setDetailId(null); setForm({ editing: row }); }}
          onDeleted={() => { setDetailId(null); showToast('삭제되었습니다.'); fetchRows(); }}
          showToast={showToast}
        />
      )}

      {form && (
        <HistoryForm
          editing={form.editing}
          equipments={equipments}
          user={user}
          onClose={() => setForm(null)}
          onSaved={(msg, id) => { setForm(null); showToast(msg); fetchRows(); if (id) setDetailId(id); }}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

/* ───────────────────────── 상세 ───────────────────────── */

function HistoryDetail({ histId, permission, onClose, onEdit, onDeleted, showToast }) {
  const [h, setH] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getHistory(histId)
      .then((res) => setH(res.data))
      .catch((err) => setError(err.response?.data?.message ?? '상세를 불러오지 못했습니다.'));
  }, [histId]);

  const linked = Boolean(h?.repairId);
  const remove = async () => {
    if (!window.confirm(`${h.histNo} 이력을 삭제하시겠습니까?\n첨부파일도 함께 삭제됩니다.`)) return;
    try {
      await deleteHistories([h.histId]);
      onDeleted();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const own = h?.attachments?.filter((a) => a.refType === 'HISTORY') ?? [];
  const fromRepair = h?.attachments?.filter((a) => a.refType === 'REPAIR') ?? [];

  return (
    <Modal title={h ? `설비이력 상세 — ${h.histNo}` : '설비이력 상세'} onClose={onClose} large className="eqh-modal">
      {!h ? (
        <div className="eqh-detail-loading">{error || '불러오는 중…'}</div>
      ) : (
        <div className="eqh-detail">
          <div className="eqh-detail-head">
            <HistType value={h.histType} />
            <h4>{h.title}</h4>
          </div>
          {linked && (
            <div className="eqh-linked-note">
              <IconHammer size={14} />
              <span>수리이력 <b>{h.repairNo}</b>에서 자동 등록된 이력입니다. 수정·삭제는 수리이력관리에서 합니다.</span>
              <Link to={`/equipment/repairHist?open=${h.repairId}`}>수리이력 열기 →</Link>
            </div>
          )}
          <dl className="eqh-dl">
            <div><dt>설비</dt><dd><b>{h.equipCode}</b> {h.equipName}</dd></div>
            <div><dt>발생일시</dt><dd className="dtm-num">{fmtDt(h.workDt)}</dd></div>
            <div><dt>작업자</dt><dd>{h.workerName || '-'}</dd></div>
            <div><dt>등록</dt><dd>{who(h.regUserName, h.regUserId) || '-'} · {fmtDt(h.regDt)}</dd></div>
            {(h.updUserName || h.updUserId) && <div><dt>마지막 수정</dt><dd>{who(h.updUserName, h.updUserId)} · {fmtDt(h.updDt)}</dd></div>}
          </dl>
          <section className="eqh-sec">
            <h5>작업 내용</h5>
            {h.content ? <p className="eqh-pre">{h.content}</p> : <p className="eqh-detail-empty">입력된 내용이 없습니다.</p>}
          </section>
          <section className="eqh-sec">
            <h5>첨부파일 <small>{own.length + fromRepair.length}</small></h5>
            <AttachList items={[...own, ...fromRepair]} tagOf={(a) => (a.refType === 'REPAIR' ? '수리' : null)} />
          </section>
        </div>
      )}
      <div className="mes-modal-footer">
        {h && !linked && permission.canDelete && (
          <button type="button" className="mes-btn mes-btn-danger eqh-footer-left" onClick={remove}><IconTrash size={15} /> 삭제</button>
        )}
        <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>닫기</button>
        {h && !linked && permission.canUpdate && (
          <button type="button" className="mes-btn mes-btn-primary" onClick={() => onEdit(h)}><IconEdit size={15} /> 수정</button>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────────── 등록 / 수정 ───────────────────────── */

function HistoryForm({ editing, equipments, user, onClose, onSaved }) {
  const now = new Date();
  now.setSeconds(0, 0);
  const [equipId, setEquipId] = useState(editing ? String(editing.equipId) : '');
  const [histType, setHistType] = useState(editing?.histType ?? '점검');
  const [workDt, setWorkDt] = useState(editing ? inputDt(editing.workDt) : toLocalInput(now));
  const [workerName, setWorkerName] = useState(editing?.workerName ?? user?.userName ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [content, setContent] = useState(editing?.content ?? '');
  const [attach, setAttach] = useState(() => ({ saved: editing?.attachments?.filter((a) => a.refType === 'HISTORY') ?? [], removed: new Set(), pending: [] }));
  const [attachMsg, setAttachMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const equipOptions = equipments.filter((e) => e.useYn === 'Y' || e.equipId === editing?.equipId);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!equipId) { setError('설비를 선택하세요.'); return; }
    if (!workDt) { setError('발생일시를 입력하세요.'); return; }
    if (!title.trim()) { setError('이력 제목을 입력하세요.'); return; }
    const body = { equipId: Number(equipId), histType, workDt, workerName: workerName.trim(), title: title.trim(), content: content.trim() };
    setSaving(true);
    let id = editing?.histId;
    try {
      if (editing) {
        await updateHistory(id, { ...body, updUserId: user?.loginId ?? '', updUserName: user?.userName ?? '' });
      } else {
        const res = await createHistory({ ...body, regUserId: user?.loginId ?? '', regUserName: user?.userName ?? '' });
        id = res.data.histId;
      }
    } catch (err) {
      setError(err.response?.data?.message ?? '저장에 실패했습니다.');
      setSaving(false);
      return;
    }
    try {
      await applyAttachChanges('HISTORY', id, attach, user);
      onSaved(editing ? '수정되었습니다.' : '등록되었습니다.', id);
    } catch (err) {
      // 본문은 저장됨 — 첨부만 실패
      onSaved(`이력은 저장했지만 첨부파일 처리에 실패했습니다: ${err.response?.data?.message ?? '네트워크 오류'}`, id);
    }
  };

  return (
    <Modal title={editing ? `설비이력 수정 — ${editing.histNo}` : '설비이력 등록'} onClose={onClose} large className="eqh-modal">
      <form onSubmit={submit} className="dtm-form">
        <div className="eqh-grid-2">
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="eqh-equip">설비 *</label>
            <select id="eqh-equip" className="dtm-input" value={equipId} onChange={(e) => setEquipId(e.target.value)}>
              <option value="">설비를 선택하세요</option>
              {equipOptions.map((e) => <option key={e.equipId} value={e.equipId}>{e.equipCode} · {e.equipName}</option>)}
            </select>
          </div>
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="eqh-dt">발생일시 *</label>
            <input id="eqh-dt" type="datetime-local" className="dtm-input" value={workDt} onChange={(e) => setWorkDt(e.target.value)} />
          </div>
        </div>

        <div className="dtm-form-row">
          <div className="dtm-form-label">
            이력 유형 *
            <span className="dtm-form-hint">&lsquo;수리&rsquo;는 수리이력관리에서 완료하면 자동 등록됩니다</span>
          </div>
          <div className="eqh-pick" role="radiogroup" aria-label="이력 유형">
            {MANUAL_TYPES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={histType === t.value} className={`eqh-pick-opt is-${t.tone}${histType === t.value ? ' is-on' : ''}`} onClick={() => setHistType(t.value)}>
                <i />{t.value}
              </button>
            ))}
          </div>
        </div>

        <div className="eqh-grid-2 eqh-grid-title">
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="eqh-title">이력 제목 *</label>
            <input id="eqh-title" className="dtm-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="예) 3존 열전대 교체" />
          </div>
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="eqh-worker">작업자</label>
            <input id="eqh-worker" className="dtm-input" value={workerName} maxLength={50} onChange={(e) => setWorkerName(e.target.value)} />
          </div>
        </div>

        <div className="dtm-form-row">
          <label className="dtm-form-label" htmlFor="eqh-content">작업 내용</label>
          <textarea id="eqh-content" className="dtm-input" rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="작업 내용, 측정값, 교체 부품, 특이사항 등" />
        </div>

        <div className="dtm-form-row">
          <div className="dtm-form-label">첨부파일 <span className="dtm-form-hint">점검표·사진·성적서·도면 등 여러 개</span></div>
          <AttachEditor state={attach} setState={setAttach} onError={setAttachMsg} />
          {attachMsg && <p className="dtm-form-empty">{attachMsg}</p>}
        </div>

        <FormAudit editing={editing} user={user} />

        {error && <div className="mes-error" style={{ marginTop: 4 }}>{error}</div>}
        <div className="mes-modal-footer">
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button>
          <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : editing ? '저장' : '등록'}</button>
        </div>
      </form>
    </Modal>
  );
}
