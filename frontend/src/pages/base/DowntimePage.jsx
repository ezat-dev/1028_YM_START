import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconTags, IconPlus, IconTrash } from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getReasonList, createReason, updateReason, deleteReasons } from '../../api/base/downtimeApi';
import '../../styles/downtime.css';

/*
 * 기준정보 > 비가동관리 — 비가동 사유 기준정보(계획정지/고장정지/대기/기타).
 * 설비관리 > 설비비가동현황에서 비가동을 등록할 때 고르는 사유 목록이 된다. 이미 쓰인 사유는 삭제 대신 미사용으로.
 */

const REASON_TYPES = [
  { value: '계획정지', tone: 'plan' },
  { value: '고장정지', tone: 'fail' },
  { value: '대기', tone: 'wait' },
  { value: '기타', tone: 'etc' },
];
const TONE = Object.fromEntries(REASON_TYPES.map((t) => [t.value, t.tone]));
const EMPTY_REASON = { reasonCode: '', reasonName: '', reasonType: '계획정지', sortOrder: 0, useYn: 'Y', remark: '' };

const fmtDt = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : '');

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

export default function DowntimePage() {
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/base/downtime');

  const load = useCallback(() => {
    setLoading(true);
    getReasonList('', '')
      .then((res) => setReasons(res.data ?? []))
      .catch(() => showToast('비가동 사유를 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mes-page dtm-page mes-page-fill">
      <ReasonList reasons={reasons} loading={loading} permission={permission} user={user} showToast={showToast} onChanged={load} />
      <Toast toast={toast} />
    </div>
  );
}

function Header({ action }) {
  return (
    <div className="dtm-header-top">
      <div className="mes-page-heading">
        <div className="mes-page-icon"><IconTags size={20} /></div>
        <div>
          <h2 className="mes-page-title">비가동관리</h2>
          <p className="mes-page-desc">비가동 사유 기준정보를 관리합니다. 설비비가동현황에서 비가동을 등록할 때 이 목록에서 고릅니다. 행을 더블클릭하면 수정할 수 있습니다.</p>
        </div>
      </div>
      <div className="dtm-header-right">{action}</div>
    </div>
  );
}

function ReasonList({ reasons, loading, permission, user, showToast, onChanged }) {
  const [typeSel, setTypeSel] = useState('');
  const [useYnSel, setUseYnSel] = useState('');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_REASON);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const rows = reasons.filter((r) => (!typeSel || r.reasonType === typeSel) && (!useYnSel || r.useYn === useYnSel));
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => {
    setEditing(null);
    const maxSort = reasons.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0);
    setForm({ ...EMPTY_REASON, sortOrder: maxSort + 1 });
    setFormError('');
    setFormOpen(true);
  };
  const openEdit = useCallback((row) => {
    if (!permission.canUpdate) return;
    setEditing(row);
    const next = { ...EMPTY_REASON };
    Object.keys(EMPTY_REASON).forEach((k) => { next[k] = row[k] ?? EMPTY_REASON[k]; });
    setForm(next);
    setFormError('');
    setFormOpen(true);
  }, [permission.canUpdate]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.reasonName.trim()) { setFormError('사유명을 입력하세요.'); return; }
    const body = { ...form, sortOrder: Number(form.sortOrder) || 0 };
    setSaving(true);
    try {
      if (editing) {
        await updateReason(editing.reasonId, { ...body, updUserId: user?.loginId ?? '', updUserName: user?.userName ?? '' });
        showToast('수정되었습니다.');
      } else {
        const res = await createReason({ ...body, regUserId: user?.loginId ?? '', regUserName: user?.userName ?? '' });
        showToast(`등록되었습니다. (${res.data?.reasonCode ?? ''})`);
      }
      setFormOpen(false);
      onChanged();
    } catch (err) {
      setFormError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) { showToast('삭제할 사유를 선택해주세요.', 'error'); return; }
    if (!window.confirm(`선택한 ${selectedKeys.size}건을 삭제하시겠습니까?\n이미 쓰인 사유는 삭제 대신 사용여부를 '미사용'으로 바꾸세요.`)) return;
    try {
      await deleteReasons(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'reasonCode', title: '사유코드', width: 90, align: 'center', sortValue: (r) => r.reasonCode, render: (r) => <span className="dtm-num">{r.reasonCode}</span> },
    { key: 'reasonName', title: '사유명', width: 170, sortValue: (r) => r.reasonName, render: (r) => <span className="dtm-reason">{r.reasonName}</span> },
    { key: 'reasonType', title: '구분', width: 100, align: 'center', sortValue: (r) => r.reasonType, render: (r) => <TypeBadge value={r.reasonType} /> },
    { key: 'sortOrder', title: '정렬', width: 64, align: 'center', sortValue: (r) => r.sortOrder, render: (r) => <span className="dtm-num">{r.sortOrder}</span> },
    { key: 'useCount', title: '사용 건수', width: 84, align: 'right', sortValue: (r) => r.useCount, render: (r) => <span className="dtm-num">{(r.useCount ?? 0).toLocaleString()}건</span> },
    {
      key: 'useYn', title: '사용', width: 70, align: 'center', sortValue: (r) => r.useYn,
      render: (r) => <span className={`mes-badge ${r.useYn === 'Y' ? 'mes-badge-success' : 'dtm-badge-off'}`}>{r.useYn === 'Y' ? '사용' : '미사용'}</span>,
    },
    { key: 'remark', title: '비고', width: 200, render: (r) => (r.remark ? <span className="dtm-memo" title={r.remark}>{r.remark}</span> : <span className="dtm-empty">-</span>) },
    { key: 'audit', title: '등록 / 수정', width: 190, sortValue: (r) => r.updDt ?? r.regDt, render: (r) => <AuditCell row={r} /> },
  ], []);

  return (
    <>
      <div className="dtm-header-card">
        <Header
          action={(
            <button type="button" className="mes-btn mes-btn-primary" disabled={!permission.canCreate} onClick={openCreate}>
              <IconPlus size={15} /> 사유 등록
            </button>
          )}
        />
        <div className="dtm-header-sep" />
        <div className="dtm-header-controls">
          <select className="mes-field-inline" value={typeSel} onChange={(e) => setTypeSel(e.target.value)} aria-label="구분">
            <option value="">전체 구분</option>
            {REASON_TYPES.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
          </select>
          <select className="mes-field-inline" value={useYnSel} onChange={(e) => setUseYnSel(e.target.value)} aria-label="사용여부">
            <option value="">전체 (사용/미사용)</option>
            <option value="Y">사용</option>
            <option value="N">미사용</option>
          </select>
          <span className="dtm-count">총 {rows.length}건</span>
          <span className="dtm-help">등록 화면의 사유 목록은 정렬 순서대로 보입니다.</span>
          <div className="dtm-header-spacer" />
          {permission.canDelete && (
            <button type="button" className="mes-btn mes-btn-danger" onClick={handleDeleteSelected}>
              <IconTrash size={15} /> 선택 삭제
            </button>
          )}
        </div>
      </div>

      <div className="mes-card mes-card-fill dtm-table-card">
        <div className="dtm-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.reasonId}
            onRowDoubleClick={openEdit}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="등록된 비가동 사유가 없습니다."
          />
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? `비가동 사유 수정 — ${editing.reasonCode}` : '비가동 사유 등록'} onClose={() => setFormOpen(false)}>
          <form onSubmit={submit} className="dtm-form">
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>사유코드</label>
                <input value={form.reasonCode} onChange={(e) => setField('reasonCode', e.target.value.toUpperCase())} placeholder={editing ? '' : '비워두면 자동 채번 (DR011)'} disabled={!!editing} maxLength={20} />
              </div>
              <div className="mes-field">
                <label>사유명 *</label>
                <input value={form.reasonName} onChange={(e) => setField('reasonName', e.target.value)} maxLength={100} autoFocus />
              </div>
              <div className="mes-field mes-field-full">
                <label>구분</label>
                <div className="dtm-type-pick" role="radiogroup" aria-label="구분">
                  {REASON_TYPES.map((t) => (
                    <button key={t.value} type="button" role="radio" aria-checked={form.reasonType === t.value} className={`dtm-type-opt is-${t.tone}${form.reasonType === t.value ? ' is-on' : ''}`} onClick={() => setField('reasonType', t.value)}>
                      <i />{t.value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mes-field">
                <label>정렬 순서</label>
                <input type="number" min={0} value={form.sortOrder} onChange={(e) => setField('sortOrder', e.target.value)} />
              </div>
              <div className="mes-field">
                <label>사용여부</label>
                <select value={form.useYn} onChange={(e) => setField('useYn', e.target.value)}>
                  <option value="Y">사용</option>
                  <option value="N">미사용</option>
                </select>
              </div>
            </div>
            <div className="mes-field">
              <label>비고</label>
              <textarea rows={2} value={form.remark} onChange={(e) => setField('remark', e.target.value)} maxLength={300} />
            </div>
            {formError && <div className="mes-error" style={{ marginTop: 4 }}>{formError}</div>}
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setFormOpen(false)}>취소</button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
