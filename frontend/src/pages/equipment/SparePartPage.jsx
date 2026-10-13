import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconBox, IconPlus, IconTrash, IconFileSpreadsheet, IconArrowsExchange } from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import {
  getList, getEquipNames, createPart, updatePart, deleteParts,
  getHistory, createHistory, deleteHistory,
} from '../../api/equipment/sparePartApi';
import './SparePartPage.css';

const REPLACE_TYPES = ['상시', '정기'];
const BUY_CYCLES = ['월', '반기', '년', '수시'];

const EMPTY_FORM = {
  partName: '', equipName: '', standard: '', maker: '', unit: 'EA', safeStock: 0,
  replaceType: '상시', buyCycle: '년', storageLocation: '', rackNo: '', remark: '',
};
const EMPTY_HISTORY_FORM = { sparePartId: '', type: 'IN', qty: 1, workDesc: '' };

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTime(v) {
  return v ? v.replace('T', ' ').slice(0, 16) : '';
}

function MetaText({ value }) {
  return value ? <span className="spr-meta-text" title={value}>{value}</span> : <span className="spr-empty">-</span>;
}

function StatusTag({ value }) {
  const cls = value === '정상' ? 'ok' : value === '부족' ? 'warn' : 'danger';
  return (
    <span className="spr-status-tag">
      <span className={`spr-status-dot ${cls}`} />
      {value}
    </span>
  );
}

function StockValue({ value, unit, status }) {
  const cls = status === '부족' ? 'warn' : status === '재고없음' ? 'danger' : 'ok';
  return <span className={`spr-stock-value ${cls}`}>{value}{unit}</span>;
}

function TypeTag({ value }) {
  return (
    <span className="spr-type-tag">
      <span className={`spr-type-dot ${value === 'OUT' ? 'out' : 'in'}`} />
      {value === 'OUT' ? '사용' : '입고'}
    </span>
  );
}

export default function SparePartPage() {
  const [tab, setTab] = useState('stock');

  const [parts, setParts] = useState([]);
  const [loadingParts, setLoadingParts] = useState(true);
  const [equipOptions, setEquipOptions] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [equipSel, setEquipSel] = useState('');
  const [keywordSel, setKeywordSel] = useState('');
  const [equipName, setEquipName] = useState('');
  const [keyword, setKeyword] = useState('');

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [partSel, setPartSel] = useState('');
  const [typeSel, setTypeSel] = useState('');
  const [fromSel, setFromSel] = useState('');
  const [toSel, setToSel] = useState(todayStr());
  const [partId, setPartId] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayStr());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [initialQty, setInitialQty] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [historyFormOpen, setHistoryFormOpen] = useState(false);
  const [historyForm, setHistoryForm] = useState(EMPTY_HISTORY_FORM);
  const [historyFormError, setHistoryFormError] = useState('');
  const [historySaving, setHistorySaving] = useState(false);

  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/equipment/sparePart');

  const fetchParts = useCallback(() => {
    setLoadingParts(true);
    getList(equipName, keyword)
      .then((res) => setParts(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoadingParts(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipName, keyword]);

  const fetchEquipNames = useCallback(() => {
    getEquipNames().then((res) => setEquipOptions(res.data ?? [])).catch(() => {});
  }, []);

  const fetchHistory = useCallback(() => {
    setLoadingHistory(true);
    getHistory(partId || undefined, type || undefined, from || undefined, to || undefined)
      .then((res) => setHistory(res.data ?? []))
      .catch(() => showToast('이력을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoadingHistory(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId, type, from, to]);

  useEffect(() => { fetchParts(); }, [fetchParts]);
  useEffect(() => { fetchEquipNames(); }, [fetchEquipNames]);
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleSearchParts = () => {
    setEquipName(equipSel);
    setKeyword(keywordSel);
  };

  const handleSearchHistory = () => {
    setPartId(partSel);
    setType(typeSel);
    setFrom(fromSel);
    setTo(toSel);
  };

  const openCreatePart = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setInitialQty('');
    setFormError('');
    setFormOpen(true);
  };

  const openEditPart = useCallback((row) => {
    if (!permission.canUpdate) return;
    setEditing(row);
    setForm({
      partName: row.partName || '', equipName: row.equipName || '', standard: row.standard || '',
      maker: row.maker || '', unit: row.unit || 'EA', safeStock: row.safeStock ?? 0,
      replaceType: row.replaceType || '상시', buyCycle: row.buyCycle || '년',
      storageLocation: row.storageLocation || '', rackNo: row.rackNo || '', remark: row.remark || '',
    });
    setFormError('');
    setFormOpen(true);
  }, [permission.canUpdate]);

  const handleSubmitPart = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.partName.trim()) { setFormError('품명을 입력하세요.'); return; }
    if (!form.equipName.trim()) { setFormError('적용설비를 입력하세요.'); return; }

    const payload = { ...form, partName: form.partName.trim(), equipName: form.equipName.trim(), safeStock: Number(form.safeStock) || 0 };

    setSaving(true);
    try {
      if (editing) {
        await updatePart(editing.id, payload);
        showToast('수정되었습니다.');
      } else {
        await createPart({ ...payload, regUserName: user?.userName ?? '' }, initialQty ? Number(initialQty) : undefined);
        showToast('등록되었습니다.');
      }
      setFormOpen(false);
      fetchParts();
      fetchEquipNames();
    } catch (err) {
      setFormError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelectedParts = async () => {
    if (selectedKeys.size === 0) {
      showToast('삭제할 행을 선택해주세요.', 'error');
      return;
    }
    if (!window.confirm(`선택한 ${selectedKeys.size}건을 삭제하시겠습니까?`)) return;
    try {
      await deleteParts(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchParts();
    } catch (err) {
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const openHistoryForm = () => {
    setHistoryForm({ ...EMPTY_HISTORY_FORM, sparePartId: parts[0]?.id ?? '' });
    setHistoryFormError('');
    setHistoryFormOpen(true);
  };

  const handleSubmitHistory = async (e) => {
    e.preventDefault();
    setHistoryFormError('');
    if (!historyForm.sparePartId) { setHistoryFormError('부품을 선택하세요.'); return; }
    if (!historyForm.qty || Number(historyForm.qty) <= 0) { setHistoryFormError('수량은 1 이상이어야 합니다.'); return; }

    setHistorySaving(true);
    try {
      await createHistory({
        sparePartId: Number(historyForm.sparePartId),
        type: historyForm.type,
        qty: Number(historyForm.qty),
        workDesc: historyForm.workDesc.trim(),
        regUserName: user?.userName ?? '',
      });
      showToast(historyForm.type === 'OUT' ? '사용 처리되었습니다.' : '입고 처리되었습니다.');
      setHistoryFormOpen(false);
      fetchParts();
      fetchHistory();
    } catch (err) {
      setHistoryFormError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setHistorySaving(false);
    }
  };

  const handleDeleteHistory = useCallback(async (row) => {
    if (!permission.canDelete) return;
    if (!window.confirm(`'${row.partName}' ${row.type === 'OUT' ? '사용' : '입고'} 이력(${row.qty}건)을 삭제하시겠습니까?`)) return;
    try {
      await deleteHistory(row.id);
      showToast('삭제되었습니다.');
      fetchParts();
      fetchHistory();
    } catch (err) {
      showToast('삭제에 실패했습니다.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission.canDelete]);

  const handleExportPartsExcel = () => {
    const sheetData = parts.map((r) => ({
      품명: r.partName, 적용설비: r.equipName, 규격: r.standard, 제작업체: r.maker,
      현재고: r.currentStock, 안전재고: r.safeStock, 단위: r.unit, 재고상태: r.stockStatus,
      교체유형: r.replaceType, 구매주기: r.buyCycle, 보관위치: r.storageLocation, 랙번호: r.rackNo,
      등록자: r.regUserName || '', 비고: r.remark || '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '재고현황');
    XLSX.writeFile(wb, `SPARE부품_재고현황_${todayStr()}.xlsx`);
  };

  const handleExportHistoryExcel = () => {
    const sheetData = history.map((r) => ({
      일시: formatDateTime(r.regDt), 구분: r.type === 'OUT' ? '사용' : '입고', 품명: r.partName,
      수량: r.qty, 작업내용: r.workDesc || '', 담당자: r.regUserName || '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '입출고이력');
    XLSX.writeFile(wb, `SPARE부품_입출고이력_${todayStr()}.xlsx`);
  };

  const partColumns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'partName', title: '품명', width: 150, sortValue: (r) => r.partName, render: (r) => <span className="spr-part-name">{r.partName}</span> },
    { key: 'equipName', title: '적용설비', width: 130, sortValue: (r) => r.equipName, render: (r) => <MetaText value={r.equipName} /> },
    { key: 'standard', title: '규격', width: 120, render: (r) => <MetaText value={r.standard} /> },
    { key: 'currentStock', title: '현재고', width: 90, align: 'right', render: (r) => <StockValue value={r.currentStock} unit={r.unit} status={r.stockStatus} /> },
    { key: 'safeStock', title: '안전재고', width: 90, align: 'right', render: (r) => <span className="spr-num">{r.safeStock}{r.unit}</span> },
    { key: 'stockStatus', title: '재고상태', width: 100, align: 'center', render: (r) => <StatusTag value={r.stockStatus} /> },
    { key: 'storageLocation', title: '보관위치', width: 110, render: (r) => <MetaText value={r.storageLocation} /> },
    { key: 'regUserName', title: '등록자', width: 90, align: 'center', render: (r) => <MetaText value={r.regUserName} /> },
    { key: 'remark', title: '비고', width: 200, render: (r) => <MetaText value={r.remark} /> },
  ], []);

  const historyColumns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'regDt', title: '일시', width: 150, align: 'center', sortValue: (r) => r.regDt, render: (r) => <MetaText value={formatDateTime(r.regDt)} /> },
    { key: 'type', title: '구분', width: 90, align: 'center', render: (r) => <TypeTag value={r.type} /> },
    { key: 'partName', title: '품명', width: 150, render: (r) => <span className="spr-part-name">{r.partName}</span> },
    { key: 'qty', title: '수량', width: 90, align: 'right', render: (r) => <span className="spr-num">{r.type === 'OUT' ? '-' : '+'}{r.qty}</span> },
    { key: 'workDesc', title: '작업내용', width: 220, render: (r) => <MetaText value={r.workDesc} /> },
    {
      key: 'manage', title: '관리', width: 90,
      align: 'center',
      render: () => permission.canDelete ? <span className="spr-hist-delete">삭제</span> : <span className="spr-empty">-</span>,
      onCellClick: permission.canDelete ? (r) => handleDeleteHistory(r) : undefined,
    },
  ], [permission.canDelete, handleDeleteHistory]);

  return (
    <div className="mes-page spr-page mes-page-fill">
      <div className="spr-header-card">
        <div className="spr-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon spr-page-icon">
              <IconBox size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">SPARE 부품관리</h2>
              <p className="mes-page-desc">설비별 스페어부품 재고를 관리하고 입고·사용 이력을 기록합니다.</p>
            </div>
          </div>
          <div className="spr-header-actions">
            <button type="button" className="mes-btn mes-btn-secondary" disabled={!permission.canCreate} onClick={openHistoryForm}>
              <IconArrowsExchange size={15} /> 입고/사용 등록
            </button>
            <button
              type="button"
              className="mes-btn mes-btn-primary"
              disabled={!permission.canCreate}
              title={!permission.canCreate ? '등록 권한이 없습니다' : undefined}
              onClick={openCreatePart}
            >
              <IconPlus size={15} /> 부품 추가
            </button>
          </div>
        </div>

        <div className="spr-header-sep" />

        <div className="spr-tabs">
          <button type="button" className={`spr-tab${tab === 'stock' ? ' active' : ''}`} onClick={() => setTab('stock')}>재고 현황</button>
          <button type="button" className={`spr-tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>입출고 이력</button>
        </div>

        {tab === 'stock' ? (
          <div className="spr-header-controls">
            <select className="mes-field-inline" value={equipSel} onChange={(e) => setEquipSel(e.target.value)}>
              <option value="">전체 설비</option>
              {equipOptions.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
            </select>
            <input
              className="mes-field-inline"
              placeholder="품명 검색"
              value={keywordSel}
              onChange={(e) => setKeywordSel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearchParts(); }}
            />
            <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearchParts}>조회</button>
            <span className="spr-doc-count">총 {parts.length}건</span>
            <div className="spr-header-spacer" />
            {permission.canDelete && (
              <button type="button" className="mes-btn mes-btn-danger" onClick={handleDeleteSelectedParts}>
                <IconTrash size={15} /> 선택 삭제
              </button>
            )}
            <button type="button" className="mes-btn mes-btn-secondary" onClick={handleExportPartsExcel}>
              <IconFileSpreadsheet size={15} /> 엑셀
            </button>
          </div>
        ) : (
          <div className="spr-header-controls">
            <select className="mes-field-inline" value={partSel} onChange={(e) => setPartSel(e.target.value)}>
              <option value="">전체 부품</option>
              {parts.map((p) => <option key={p.id} value={p.id}>{p.partName} ({p.equipName})</option>)}
            </select>
            <select className="mes-field-inline" value={typeSel} onChange={(e) => setTypeSel(e.target.value)}>
              <option value="">전체 구분</option>
              <option value="IN">입고</option>
              <option value="OUT">사용</option>
            </select>
            <input type="date" className="mes-field-inline" value={fromSel} onChange={(e) => setFromSel(e.target.value)} />
            <span>~</span>
            <input type="date" className="mes-field-inline" value={toSel} onChange={(e) => setToSel(e.target.value)} />
            <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearchHistory}>조회</button>
            <span className="spr-doc-count">총 {history.length}건</span>
            <div className="spr-header-spacer" />
            <button type="button" className="mes-btn mes-btn-secondary" onClick={handleExportHistoryExcel}>
              <IconFileSpreadsheet size={15} /> 엑셀
            </button>
          </div>
        )}
      </div>

      <div className="mes-card mes-card-fill spr-table-card">
        <div className="spr-table-wrap">
          {tab === 'stock' ? (
            <SimpleTable
              data={parts}
              columns={partColumns}
              rowKey={(r) => r.id}
              onRowDoubleClick={openEditPart}
              selectable={permission.canDelete}
              selectedKeys={selectedKeys}
              onSelectionChange={setSelectedKeys}
              loading={loadingParts}
              emptyText="등록된 부품이 없습니다."
            />
          ) : (
            <SimpleTable
              data={history}
              columns={historyColumns}
              rowKey={(r) => r.id}
              loading={loadingHistory}
              emptyText="입출고 이력이 없습니다."
            />
          )}
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? 'SPARE 부품 수정' : 'SPARE 부품 등록'} onClose={() => setFormOpen(false)} large>
          <form onSubmit={handleSubmitPart}>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>품명 *</label>
                <input value={form.partName} onChange={(e) => setForm({ ...form, partName: e.target.value })} placeholder="예) 열전대 센서" />
              </div>
              <div className="mes-field">
                <label>적용설비 *</label>
                <input value={form.equipName} onChange={(e) => setForm({ ...form, equipName: e.target.value })} placeholder="예) 연속열처리로" />
              </div>
              <div className="mes-field">
                <label>규격</label>
                <input value={form.standard} onChange={(e) => setForm({ ...form, standard: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>제작업체</label>
                <input value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>단위</label>
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>안전재고</label>
                <input type="number" min="0" value={form.safeStock} onChange={(e) => setForm({ ...form, safeStock: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>교체유형</label>
                <select value={form.replaceType} onChange={(e) => setForm({ ...form, replaceType: e.target.value })}>
                  {REPLACE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="mes-field">
                <label>구매주기</label>
                <select value={form.buyCycle} onChange={(e) => setForm({ ...form, buyCycle: e.target.value })}>
                  {BUY_CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="mes-field">
                <label>보관위치</label>
                <input value={form.storageLocation} onChange={(e) => setForm({ ...form, storageLocation: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>랙번호</label>
                <input value={form.rackNo} onChange={(e) => setForm({ ...form, rackNo: e.target.value })} />
              </div>
              {!editing && (
                <div className="mes-field">
                  <label>초기 재고 수량</label>
                  <input type="number" min="0" value={initialQty} onChange={(e) => setInitialQty(e.target.value)} placeholder="있으면 자동으로 최초 입고 처리" />
                </div>
              )}
              <div className="mes-field mes-field-full">
                <label>비고</label>
                <textarea rows={2} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
              </div>
            </div>
            {formError && <div className="mes-error" style={{ marginTop: 4 }}>{formError}</div>}
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setFormOpen(false)}>취소</button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}

      {historyFormOpen && (
        <Modal title="입고/사용 등록" onClose={() => setHistoryFormOpen(false)}>
          <form onSubmit={handleSubmitHistory}>
            <div className="mes-form-grid">
              <div className="mes-field mes-field-full">
                <label>부품 *</label>
                <select value={historyForm.sparePartId} onChange={(e) => setHistoryForm({ ...historyForm, sparePartId: e.target.value })}>
                  <option value="">선택하세요</option>
                  {parts.map((p) => <option key={p.id} value={p.id}>{p.partName} ({p.equipName}) — 현재고 {p.currentStock}{p.unit}</option>)}
                </select>
              </div>
              <div className="mes-field">
                <label>구분 *</label>
                <select value={historyForm.type} onChange={(e) => setHistoryForm({ ...historyForm, type: e.target.value })}>
                  <option value="IN">입고</option>
                  <option value="OUT">사용</option>
                </select>
              </div>
              <div className="mes-field">
                <label>수량 *</label>
                <input type="number" min="1" value={historyForm.qty} onChange={(e) => setHistoryForm({ ...historyForm, qty: e.target.value })} />
              </div>
              <div className="mes-field mes-field-full">
                <label>작업내용</label>
                <textarea rows={2} value={historyForm.workDesc} onChange={(e) => setHistoryForm({ ...historyForm, workDesc: e.target.value })} placeholder="예) 정기 교체 작업" />
              </div>
            </div>
            {historyFormError && <div className="mes-error" style={{ marginTop: 4 }}>{historyFormError}</div>}
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setHistoryFormOpen(false)}>취소</button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={historySaving}>{historySaving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
