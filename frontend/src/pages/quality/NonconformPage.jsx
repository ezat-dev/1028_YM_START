import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { IconAlertOctagon, IconPlus, IconTrash, IconFileSpreadsheet, IconExternalLink } from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import {
  getList, getNonconform, createNonconform, updateNonconform, deleteNonconforms, getDefectTypes,
} from '../../api/quality/nonconformApi';
import { getList as getEquipmentList } from '../../api/base/equipmentApi';
import { equipLabel } from './capability';
import { AuditCell } from '../equipment/equipHistShared';
import '../../styles/downtime.css';
import './nonconform.css';

/*
 * 품질관리 > 부적합품관리 — 불량이 생긴 건과 처리(폐기·재작업·선별·특채·반품).
 * CHECK SHEET 행에 불량을 적으면 여기 '대기'로 자동 등록된다. 그 건은 내용은 CHECK SHEET가 원본이라
 * 처리 상태·방법·조치만 여기서 고친다.
 */

const MENU = '/quality/nonconform';
const STATUSES = ['대기', '처리중', '완료'];
const DISPOSITIONS = ['폐기', '재작업', '선별', '특채', '반품'];
const UNITS = ['EA', 'KG'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const QUICK = [{ key: '7', label: '7일', days: 6 }, { key: '30', label: '30일', days: 29 }, { key: '90', label: '90일', days: 89 }];
const errMsg = (err) => err?.response?.data?.message ?? '처리에 실패했습니다.';
const tone = (s) => (s === '완료' ? 'done' : s === '처리중' ? 'doing' : 'wait');

export default function NonconformPage() {
  const { user } = useAuth();
  const permission = usePermission(MENU);
  const { toast, showToast } = useToast();
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [equipments, setEquipments] = useState([]);
  const [defects, setDefects] = useState([]);
  const [quick, setQuick] = useState('30');
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(daysAgo(0));
  const [equipCode, setEquipCode] = useState('');
  const [status, setStatus] = useState('');
  const [defectCode, setDefectCode] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState({ keyword: '' });
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState(null); // { editing }

  useEffect(() => {
    getEquipmentList('', 'Y', '').then((r) => setEquipments(r.data ?? [])).catch(() => {});
    getDefectTypes('').then((r) => setDefects(r.data ?? [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    getList({ from, to, equipCode, status, defectCode, keyword: query.keyword })
      .then((r) => setRows(r.data ?? []))
      .catch((err) => showToast(errMsg(err), 'error'))
      .finally(() => setLoading(false));
  }, [from, to, equipCode, status, defectCode, query, showToast]);
  useEffect(() => { load(); }, [load]);

  // ?nc= 로 들어오면 그 건을 바로 연다(CHECK SHEET에서 링크)
  useEffect(() => {
    const id = params.get('nc');
    if (!id) return;
    getNonconform(id).then((r) => setForm({ editing: r.data })).catch(() => {});
    setParams((p) => { const n = new URLSearchParams(p); n.delete('nc'); return n; }, { replace: true });
  }, [params, setParams]);

  const counts = useMemo(() => {
    const c = { 대기: 0, 처리중: 0, 완료: 0, qty: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; c.qty += Number(r.qty) || 0; });
    return c;
  }, [rows]);

  const pickQuick = (q) => { setQuick(q.key); setFrom(daysAgo(q.days)); setTo(daysAgo(0)); };

  const handleDelete = async () => {
    if (!selected.size) { showToast('삭제할 부적합을 선택해주세요.', 'error'); return; }
    if (!window.confirm(`선택한 ${selected.size}건을 삭제할까요?`)) return;
    try {
      await deleteNonconforms([...selected]);
      setSelected(new Set());
      showToast('삭제했습니다.');
      load();
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };

  const excel = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map((r, i) => ({
      No: i + 1, 번호: r.ncNo, 발생일: r.occurDate, 호기: r.equipCode ? equipLabel(r.equipCode, r.equipName) : '', 품번: r.partNo, 품명: r.productName,
      LOT: r.lotNo, 불량구분: `${r.defectCode ?? ''} ${r.defectName ?? ''}`.trim(), 수량: Number(r.qty), 단위: r.unit, 상태: r.status,
      처리방법: r.disposition, 조치내용: r.actionNote, 출처: r.source === 'SHEET' ? `CHECK SHEET No.${r.sheetRowNo ?? ''}` : '직접 등록', 비고: r.remark,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '부적합품');
    XLSX.writeFile(wb, `부적합품_${from}_${to}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, i) => i + 1 },
    { key: 'ncNo', title: '번호', width: 136, sortValue: (r) => r.ncNo, render: (r) => <b className="nc-no">{r.ncNo}</b> },
    { key: 'occurDate', title: '발생일', width: 96, align: 'center', sortValue: (r) => r.occurDate, render: (r) => r.occurDate },
    { key: 'equip', title: '호기', width: 70, align: 'center', render: (r) => (r.equipCode ? <span className="hd-eq">{equipLabel(r.equipCode, r.equipName)}</span> : <span className="dtm-empty">-</span>) },
    { key: 'partNo', title: '품번', width: 120, sortValue: (r) => r.partNo, render: (r) => <b>{r.partNo || '-'}</b> },
    { key: 'productName', title: '품명', width: 120, render: (r) => r.productName || <span className="dtm-empty">-</span> },
    { key: 'lotNo', title: 'LOT', width: 120, render: (r) => r.lotNo || <span className="dtm-empty">-</span> },
    { key: 'defect', title: '불량 구분', width: 110, sortValue: (r) => r.defectCode, render: (r) => <span className="nc-defect"><em>{r.defectCode}</em>{r.defectName}</span> },
    { key: 'qty', title: '수량', width: 80, align: 'right', sortValue: (r) => Number(r.qty), render: (r) => <span className="nc-qty">{Number(r.qty).toLocaleString('ko-KR')}<small>{r.unit}</small></span> },
    { key: 'status', title: '상태', width: 80, align: 'center', sortValue: (r) => STATUSES.indexOf(r.status), render: (r) => <span className={`nc-status is-${tone(r.status)}`}>{r.status}</span> },
    { key: 'disposition', title: '처리 방법', width: 84, align: 'center', render: (r) => r.disposition || <span className="dtm-empty">-</span> },
    { key: 'actionNote', title: '조치 내용', width: 200, render: (r) => (r.actionNote ? <span className="dtm-memo" title={r.actionNote}>{r.actionNote}</span> : <span className="dtm-empty">-</span>) },
    { key: 'source', title: '출처', width: 150, render: (r) => (r.source === 'SHEET'
      ? (
        <Link className="nc-src" to={`/production/checkSheet?equip=${r.equipCode}&date=${r.occurDate}`} onClick={(e) => e.stopPropagation()}>
          CHECK SHEET{r.sheetRowNo ? ` No.${r.sheetRowNo}` : ''} <IconExternalLink size={12} />
        </Link>
      ) : <span className="nc-src is-manual">직접 등록</span>) },
    { key: 'audit', title: '등록 / 수정', width: 170, render: (r) => <AuditCell row={r} /> },
  ], []);

  return (
    <div className="mes-page dtm-page nc-page mes-page-fill">
      <div className="dtm-header-card">
        <div className="dtm-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon"><IconAlertOctagon size={20} /></div>
            <div>
              <h2 className="mes-page-title">부적합품관리</h2>
              <p className="mes-page-desc">불량 발생 건과 처리를 관리합니다. CHECK SHEET에 불량을 적으면 여기에 '대기'로 자동 등록됩니다. 행을 더블클릭하면 처리 내용을 적습니다.</p>
            </div>
          </div>
          <div className="dtm-header-right">
            <button type="button" className="mes-btn mes-btn-primary" disabled={!permission.canCreate} onClick={() => setForm({ editing: null })}>
              <IconPlus size={15} /> 부적합 등록
            </button>
          </div>
        </div>
        <div className="dtm-header-sep" />
        <div className="dtm-header-controls">
          <div className="dtm-quick" role="group" aria-label="기간">
            {QUICK.map((q) => <button key={q.key} type="button" className={quick === q.key ? 'is-on' : ''} onClick={() => pickQuick(q)}>{q.label}</button>)}
          </div>
          <div className="dtm-dates">
            <input type="date" className="mes-field-inline" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setQuick(''); }} aria-label="시작일" />
            <span aria-hidden="true">~</span>
            <input type="date" className="mes-field-inline" value={to} min={from} onChange={(e) => { setTo(e.target.value); setQuick(''); }} aria-label="종료일" />
          </div>
          <select className="mes-field-inline" value={equipCode} onChange={(e) => setEquipCode(e.target.value)} aria-label="호기">
            <option value="">전체 호기</option>
            {equipments.map((eq) => <option key={eq.equipId} value={eq.equipCode}>{equipLabel(eq.equipCode, eq.equipName)} ({eq.equipCode})</option>)}
          </select>
          <select className="mes-field-inline" value={defectCode} onChange={(e) => setDefectCode(e.target.value)} aria-label="불량 구분">
            <option value="">전체 불량</option>
            {defects.map((t) => <option key={t.defectCode} value={t.defectCode}>{t.defectCode} {t.defectName}</option>)}
          </select>
          <input className="mes-field-inline dtm-keyword" placeholder="번호·품번·품명·LOT" value={keyword} onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setQuery({ keyword: keyword.trim() }); }} />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setQuery({ keyword: keyword.trim() })}>조회</button>
          <div className="dtm-header-spacer" />
          {permission.canDelete && <button type="button" className="mes-btn mes-btn-danger" onClick={handleDelete}><IconTrash size={15} /> 선택 삭제</button>}
          <button type="button" className="mes-btn mes-btn-secondary" onClick={excel} disabled={!rows.length}><IconFileSpreadsheet size={15} /> 엑셀</button>
        </div>
      </div>

      <div className="nc-summary" role="group" aria-label="상태">
        <button type="button" className={`nc-sum${status === '' ? ' is-on' : ''}`} onClick={() => setStatus('')}>
          <span>전체</span><b>{rows.length}</b><small>수량 {counts.qty.toLocaleString('ko-KR')}</small>
        </button>
        {STATUSES.map((s) => (
          <button key={s} type="button" className={`nc-sum is-${tone(s)}${status === s ? ' is-on' : ''}`} onClick={() => setStatus(status === s ? '' : s)}>
            <span>{s}</span><b>{status && status !== s ? '-' : counts[s]}</b>
          </button>
        ))}
      </div>

      <div className="mes-card mes-card-fill dtm-table-card">
        <div className="dtm-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.ncId}
            onRowDoubleClick={(r) => setForm({ editing: r })}
            selectable={permission.canDelete}
            selectedKeys={selected}
            onSelectionChange={setSelected}
            loading={loading}
            emptyText="부적합이 없습니다."
          />
        </div>
      </div>

      {form && (
        <NcForm
          editing={form.editing}
          equipments={equipments}
          defects={defects.filter((t) => t.useYn === 'Y' || t.defectCode === form.editing?.defectCode)}
          user={user}
          canSave={form.editing ? permission.canUpdate : permission.canCreate}
          onClose={() => setForm(null)}
          onSaved={(msg) => { setForm(null); showToast(msg); load(); }}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}

function NcForm({ editing, equipments, defects, user, canSave, onClose, onSaved }) {
  const fromSheet = editing?.source === 'SHEET';
  const [f, setF] = useState(() => ({
    occurDate: editing?.occurDate ?? ymd(new Date()),
    equipCode: editing?.equipCode ?? '',
    partNo: editing?.partNo ?? '',
    productName: editing?.productName ?? '',
    lotNo: editing?.lotNo ?? '',
    defectCode: editing?.defectCode ?? '',
    qty: editing?.qty ?? '',
    unit: editing?.unit ?? 'EA',
    status: editing?.status ?? '대기',
    disposition: editing?.disposition ?? '',
    actionNote: editing?.actionNote ?? '',
    remark: editing?.remark ?? '',
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const lockContent = fromSheet || !canSave;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!fromSheet) {
      if (!f.defectCode) { setError('불량 구분을 고르세요.'); return; }
      if (!(Number(f.qty) > 0)) { setError('수량을 입력하세요.'); return; }
    }
    if (f.status === '완료' && !f.disposition) { setError('완료하려면 처리 방법을 고르세요.'); return; }
    setSaving(true);
    try {
      const body = { ...f, qty: Number(f.qty) };
      if (editing) {
        await updateNonconform(editing.ncId, { ...body, updUserId: user?.loginId ?? '', updUserName: user?.userName ?? '' });
        onSaved('저장했습니다.');
      } else {
        await createNonconform({ ...body, regUserId: user?.loginId ?? '', regUserName: user?.userName ?? '' });
        onSaved('등록했습니다.');
      }
    } catch (err) {
      setError(errMsg(err));
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? `부적합 — ${editing.ncNo}` : '부적합 등록'} onClose={onClose} large className="nc-modal">
      <form className="dtm-form" onSubmit={submit}>
        {fromSheet && (
          <div className="nc-sheet-note">
            CHECK SHEET({editing.occurDate} · No.{editing.sheetRowNo ?? '-'})에서 생긴 부적합입니다. 일자·품번·LOT·불량·수량은 CHECK SHEET에서 고칩니다.
            <Link to={`/production/checkSheet?equip=${editing.equipCode}&date=${editing.occurDate}`}>CHECK SHEET 열기 →</Link>
          </div>
        )}
        <fieldset className="nc-box" disabled={lockContent}>
          <legend>발생 내용</legend>
          <div className="nc-grid-3">
            <label className="mes-field"><span>발생일 *</span><input type="date" className="dtm-input" value={f.occurDate} onChange={set('occurDate')} /></label>
            <label className="mes-field"><span>호기</span>
              <select className="dtm-input" value={f.equipCode} onChange={set('equipCode')}>
                <option value="">선택 안 함</option>
                {equipments.map((eq) => <option key={eq.equipId} value={eq.equipCode}>{equipLabel(eq.equipCode, eq.equipName)} ({eq.equipCode})</option>)}
              </select>
            </label>
            <label className="mes-field"><span>LOT(작지 No)</span><input className="dtm-input" value={f.lotNo} maxLength={30} onChange={set('lotNo')} /></label>
          </div>
          <div className="nc-grid-3">
            <label className="mes-field"><span>품번</span><input className="dtm-input" value={f.partNo} maxLength={50} onChange={set('partNo')} /></label>
            <label className="mes-field"><span>품명</span><input className="dtm-input" value={f.productName} maxLength={100} onChange={set('productName')} /></label>
            <label className="mes-field"><span>불량 구분 *</span>
              <select className="dtm-input" value={f.defectCode} onChange={set('defectCode')}>
                <option value="">선택</option>
                {defects.map((t) => <option key={t.defectCode} value={t.defectCode}>{t.defectCode} {t.defectName}</option>)}
              </select>
            </label>
          </div>
          <div className="nc-grid-3">
            <label className="mes-field"><span>수량 *</span><input type="number" min="0" step="any" className="dtm-input" value={f.qty} onChange={set('qty')} /></label>
            <label className="mes-field"><span>단위</span>
              <select className="dtm-input" value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
            </label>
          </div>
        </fieldset>

        <fieldset className="nc-box" disabled={!canSave}>
          <legend>처리</legend>
          <div className="mes-field">
            <span>상태</span>
            <div className="nc-seg" role="radiogroup" aria-label="상태">
              {STATUSES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={f.status === s} className={`is-${tone(s)}${f.status === s ? ' is-on' : ''}`} onClick={() => setF((x) => ({ ...x, status: s }))}>{s}</button>
              ))}
            </div>
          </div>
          <div className="mes-field">
            <span>처리 방법 {f.status === '완료' && <em className="nc-req">*</em>}</span>
            <div className="nc-seg" role="radiogroup" aria-label="처리 방법">
              {DISPOSITIONS.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={f.disposition === d} className={f.disposition === d ? 'is-on' : ''} onClick={() => setF((x) => ({ ...x, disposition: x.disposition === d ? '' : d }))}>{d}</button>
              ))}
            </div>
          </div>
          <label className="mes-field"><span>조치 내용</span><textarea className="dtm-input" rows={3} maxLength={500} value={f.actionNote} onChange={set('actionNote')} placeholder="원인, 조치, 재발 방지 등" /></label>
          <label className="mes-field"><span>비고</span><input className="dtm-input" maxLength={300} value={f.remark} onChange={set('remark')} /></label>
        </fieldset>

        {error && <div className="mes-error">{error}</div>}
        <div className="mes-modal-footer">
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>닫기</button>
          {canSave && <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : editing ? '저장' : '등록'}</button>}
        </div>
      </form>
    </Modal>
  );
}
