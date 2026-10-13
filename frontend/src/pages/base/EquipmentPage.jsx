import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconSettingsAutomation, IconPlus, IconTrash, IconFileSpreadsheet } from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getList, createEquipment, updateEquipment, deleteEquipments } from '../../api/base/equipmentApi';
import './EquipmentPage.css';

// 설비 상태 — 화면 표시 순서. tone은 배지 색
const STATUSES = [
  { value: '가동', tone: 'run' },
  { value: '정지', tone: 'stop' },
  { value: '고장', tone: 'fail' },
  { value: '점검', tone: 'check' },
  { value: '유지보수', tone: 'maint' },
];
const TONE = Object.fromEntries(STATUSES.map((s) => [s.value, s.tone]));

// 입력 도움 목록(자유 입력도 된다)
const EQUIP_TYPES = ['연속열처리로', '배치로', '템퍼링로', '세정기', '침탄로', '기타'];
const PLC_PROTOCOLS = ['MC Protocol (TCP)', 'MC Protocol (UDP)', 'LS XGT FEnet', 'Modbus TCP', 'OPC UA', 'EtherNet/IP'];

const EMPTY_FORM = {
  equipCode: '', equipName: '', equipType: '연속열처리로', equipStatus: '가동', useYn: 'Y',
  maker: '', modelName: '', managerName: '', installDate: '', startDate: '',
  plcModel: '', plcIp: '', plcProtocol: '',
  remark: '',
};

const IPV4 = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function StatusBadge({ value }) {
  return (
    <span className={`eqp-status is-${TONE[value] ?? 'stop'}`}>
      <i />{value}
    </span>
  );
}

function TwoLine({ main, sub }) {
  if (!main && !sub) return <span className="eqp-empty">-</span>;
  return (
    <span className="eqp-two">
      <span className="eqp-two-main" title={main}>{main || '-'}</span>
      {sub && <span className="eqp-two-sub" title={sub}>{sub}</span>}
    </span>
  );
}

export default function EquipmentPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  // 조회 조건: 고르는 값(*Sel)과 실제 조회 값을 나눠 [조회]를 눌렀을 때만 다시 불러온다
  const [statusSel, setStatusSel] = useState('');
  const [useYnSel, setUseYnSel] = useState('');
  const [keywordSel, setKeywordSel] = useState('');
  const [query, setQuery] = useState({ status: '', useYn: '', keyword: '' });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/base/equipment');

  const fetchRows = useCallback(() => {
    setLoading(true);
    getList(query.status, query.useYn, query.keyword)
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleSearch = () => setQuery({ status: statusSel, useYn: useYnSel, keyword: keywordSel.trim() });

  // 상태별 대수 — 헤더 요약
  const statusCount = useMemo(() => {
    const m = Object.fromEntries(STATUSES.map((s) => [s.value, 0]));
    rows.forEach((r) => { if (m[r.equipStatus] != null) m[r.equipStatus] += 1; });
    return m;
  }, [rows]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = useCallback((row) => {
    if (!permission.canUpdate) return;
    setEditing(row);
    const next = { ...EMPTY_FORM };
    Object.keys(EMPTY_FORM).forEach((k) => { next[k] = row[k] ?? EMPTY_FORM[k]; });
    setForm(next);
    setFormError('');
    setFormOpen(true);
  }, [permission.canUpdate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.equipCode.trim()) { setFormError('설비코드를 입력하세요.'); return; }
    if (!form.equipName.trim()) { setFormError('설비명을 입력하세요.'); return; }
    if (form.plcIp && !IPV4.test(form.plcIp.trim())) { setFormError('PLC IP 형식이 올바르지 않습니다. (예: 192.168.10.11)'); return; }
    if (form.installDate && form.startDate && form.startDate < form.installDate) { setFormError('가동 개시일은 설치일보다 빠를 수 없습니다.'); return; }

    // 날짜는 비어 있으면 null로(서버 LocalDate)
    const body = { ...form, installDate: form.installDate || null, startDate: form.startDate || null };
    setSaving(true);
    try {
      if (editing) {
        await updateEquipment(editing.equipId, body);
        showToast('수정되었습니다.');
      } else {
        await createEquipment({ ...body, regUserName: user?.userName ?? '' });
        showToast(`등록되었습니다. (${form.equipCode.trim().toUpperCase()})`);
      }
      setFormOpen(false);
      fetchRows();
    } catch (err) {
      setFormError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) {
      showToast('삭제할 설비를 선택해주세요.', 'error');
      return;
    }
    if (!window.confirm(`선택한 ${selectedKeys.size}대를 삭제하시겠습니까?\n쓰지 않는 설비라면 삭제 대신 사용여부를 '미사용'으로 바꾸는 것을 권장합니다.`)) return;
    try {
      await deleteEquipments(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchRows();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheet = rows.map((r) => ({
      설비코드: r.equipCode, 설비명: r.equipName, 설비유형: r.equipType, 제조사: r.maker, 모델명: r.modelName,
      관리담당자: r.managerName, 설치일: r.installDate ?? '', 가동개시일: r.startDate ?? '', 설비상태: r.equipStatus,
      PLC모델: r.plcModel, PLC_IP: r.plcIp, 통신방식: r.plcProtocol,
      사용여부: r.useYn === 'Y' ? '사용' : '미사용', 비고: r.remark,
    }));
    const ws = XLSX.utils.json_to_sheet(sheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '설비');
    XLSX.writeFile(wb, `설비목록_${todayStr()}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'equipCode', title: '설비코드', width: 90, align: 'center', sortValue: (r) => r.equipCode, render: (r) => <span className="eqp-code">{r.equipCode}</span> },
    { key: 'equipName', title: '설비명', width: 170, sortValue: (r) => r.equipName, render: (r) => <span className="eqp-name" title={r.equipName}>{r.equipName}</span> },
    { key: 'equipType', title: '설비 유형', width: 110, align: 'center', sortValue: (r) => r.equipType, render: (r) => <span className="eqp-sub">{r.equipType || '-'}</span> },
    { key: 'maker', title: '제조사 / 모델', width: 170, sortValue: (r) => r.maker, render: (r) => <TwoLine main={r.maker} sub={r.modelName} /> },
    { key: 'managerName', title: '담당자', width: 84, align: 'center', sortValue: (r) => r.managerName, render: (r) => <span className="eqp-sub">{r.managerName || '-'}</span> },
    { key: 'installDate', title: '설치일', width: 100, align: 'center', sortValue: (r) => r.installDate, render: (r) => <span className="eqp-num">{r.installDate || '-'}</span> },
    { key: 'startDate', title: '가동 개시일', width: 100, align: 'center', sortValue: (r) => r.startDate, render: (r) => <span className="eqp-num">{r.startDate || '-'}</span> },
    { key: 'equipStatus', title: '상태', width: 96, align: 'center', sortValue: (r) => STATUSES.findIndex((s) => s.value === r.equipStatus), render: (r) => <StatusBadge value={r.equipStatus} /> },
    {
      key: 'plc', title: 'PLC (모델 / IP · 통신방식)', width: 230, sortValue: (r) => r.plcIp,
      render: (r) => <TwoLine main={r.plcModel} sub={[r.plcIp, r.plcProtocol].filter(Boolean).join(' · ')} />,
    },
    {
      key: 'useYn', title: '사용', width: 70, align: 'center', sortValue: (r) => r.useYn,
      render: (r) => (
        <span className={`mes-badge ${r.useYn === 'Y' ? 'mes-badge-success' : 'eqp-badge-off'}`}>{r.useYn === 'Y' ? '사용' : '미사용'}</span>
      ),
    },
  ], []);

  return (
    <div className="mes-page eqp-page mes-page-fill">
      <div className="eqp-header-card">
        <div className="eqp-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon"><IconSettingsAutomation size={20} /></div>
            <div>
              <h2 className="mes-page-title">설비관리</h2>
              <p className="mes-page-desc">설비 기본 정보·상태·PLC 통신 정보를 관리합니다. 행을 더블클릭하면 수정할 수 있습니다.</p>
            </div>
          </div>
          <div className="eqp-header-right">
            <div className="eqp-summary" aria-label="상태별 설비 수">
              {STATUSES.map((s) => (
                <span key={s.value} className={`eqp-summary-item is-${s.tone}${statusCount[s.value] ? '' : ' is-zero'}`}>
                  <i />{s.value} <b>{statusCount[s.value]}</b>
                </span>
              ))}
            </div>
            <button
              type="button"
              className="mes-btn mes-btn-primary"
              disabled={!permission.canCreate}
              title={!permission.canCreate ? '등록 권한이 없습니다' : undefined}
              onClick={openCreate}
            >
              <IconPlus size={15} /> 설비 등록
            </button>
          </div>
        </div>

        <div className="eqp-header-sep" />

        <div className="eqp-header-controls">
          <select className="mes-field-inline" value={statusSel} onChange={(e) => setStatusSel(e.target.value)} aria-label="설비 상태">
            <option value="">전체 상태</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
          </select>
          <select className="mes-field-inline" value={useYnSel} onChange={(e) => setUseYnSel(e.target.value)} aria-label="사용여부">
            <option value="">전체 (사용/미사용)</option>
            <option value="Y">사용</option>
            <option value="N">미사용</option>
          </select>
          <input
            className="mes-field-inline eqp-keyword"
            placeholder="설비코드·설비명·모델명·PLC IP"
            value={keywordSel}
            onChange={(e) => setKeywordSel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearch}>조회</button>
          <span className="eqp-count">총 {rows.length}대</span>
          <div className="eqp-header-spacer" />
          {permission.canDelete && (
            <button type="button" className="mes-btn mes-btn-danger" onClick={handleDeleteSelected}>
              <IconTrash size={15} /> 선택 삭제
            </button>
          )}
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleExportExcel} disabled={rows.length === 0}>
            <IconFileSpreadsheet size={15} /> 엑셀
          </button>
        </div>
      </div>

      <div className="mes-card mes-card-fill eqp-table-card">
        <div className="eqp-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.equipId}
            onRowDoubleClick={openEdit}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="등록된 설비가 없습니다."
          />
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? `설비 수정 — ${editing.equipCode}` : '설비 등록'} onClose={() => setFormOpen(false)} large>
          <form onSubmit={handleSubmit} className="eqp-form">
            <datalist id="eqp-types">{EQUIP_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
            <datalist id="eqp-protocols">{PLC_PROTOCOLS.map((t) => <option key={t} value={t} />)}</datalist>

            <h4 className="eqp-form-section">기본 정보</h4>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>설비코드 *</label>
                <input
                  value={form.equipCode}
                  onChange={(e) => setField('equipCode', e.target.value.toUpperCase())}
                  placeholder="예) BCF7"
                  disabled={!!editing}
                  maxLength={20}
                  autoFocus={!editing}
                />
              </div>
              <div className="mes-field">
                <label>설비명 *</label>
                <input value={form.equipName} onChange={(e) => setField('equipName', e.target.value)} placeholder="예) 연속열처리로 7호기" maxLength={100} />
              </div>
              <div className="mes-field">
                <label>설비 유형</label>
                <input list="eqp-types" value={form.equipType} onChange={(e) => setField('equipType', e.target.value)} maxLength={50} />
              </div>
              <div className="mes-field">
                <label>사용여부</label>
                <select value={form.useYn} onChange={(e) => setField('useYn', e.target.value)}>
                  <option value="Y">사용</option>
                  <option value="N">미사용</option>
                </select>
              </div>
              <div className="mes-field mes-field-full">
                <label>설비 상태</label>
                <div className="eqp-status-pick" role="radiogroup" aria-label="설비 상태">
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={form.equipStatus === s.value}
                      className={`eqp-status-opt is-${s.tone}${form.equipStatus === s.value ? ' is-on' : ''}`}
                      onClick={() => setField('equipStatus', s.value)}
                    >
                      <i />{s.value}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <h4 className="eqp-form-section">제조 · 관리</h4>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>제조사</label>
                <input value={form.maker} onChange={(e) => setField('maker', e.target.value)} maxLength={100} />
              </div>
              <div className="mes-field">
                <label>모델명</label>
                <input value={form.modelName} onChange={(e) => setField('modelName', e.target.value)} maxLength={100} />
              </div>
              <div className="mes-field">
                <label>관리 담당자</label>
                <input value={form.managerName} onChange={(e) => setField('managerName', e.target.value)} maxLength={50} />
              </div>
              <div className="mes-field" />
              <div className="mes-field">
                <label>설치일</label>
                <input type="date" value={form.installDate} onChange={(e) => setField('installDate', e.target.value)} max={todayStr()} />
              </div>
              <div className="mes-field">
                <label>가동 개시일</label>
                <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} min={form.installDate || undefined} />
              </div>
            </div>

            <h4 className="eqp-form-section">PLC 정보</h4>
            <div className="mes-form-grid eqp-grid-3">
              <div className="mes-field">
                <label>PLC 모델</label>
                <input value={form.plcModel} onChange={(e) => setField('plcModel', e.target.value)} placeholder="예) MELSEC Q03UDV" maxLength={100} />
              </div>
              <div className="mes-field">
                <label>IP</label>
                <input value={form.plcIp} onChange={(e) => setField('plcIp', e.target.value.replace(/[^\d.]/g, ''))} placeholder="192.168.10.11" inputMode="decimal" maxLength={15} />
              </div>
              <div className="mes-field">
                <label>통신방식</label>
                <input list="eqp-protocols" value={form.plcProtocol} onChange={(e) => setField('plcProtocol', e.target.value)} maxLength={50} />
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

      <Toast toast={toast} />
    </div>
  );
}
