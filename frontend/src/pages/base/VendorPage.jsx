import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconBuilding, IconPlus, IconTrash, IconFileSpreadsheet } from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getList, createVendor, updateVendor, deleteVendors } from '../../api/base/vendorApi';
import './VendorPage.css';

const VENDOR_TYPES = ['매출처', '매입처', '외주처', '겸용'];

const EMPTY_FORM = {
  vendorCode: '', vendorName: '', vendorType: '매출처', useYn: 'Y',
  ceoName: '', bizNo: '', bizType: '', bizItem: '',
  tel: '', fax: '',
  zipCode: '', address: '', addressDetail: '',
  managerName: '', managerPhone: '', managerEmail: '',
  remark: '',
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 입력하는 대로 000-00-00000 으로 맞춘다
function formatBizNo(v) {
  const d = v.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

// 02(서울) / 0xx 지역번호 / 010 휴대폰 / 1588 같은 대표번호를 구분해 하이픈을 넣는다
function formatPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.startsWith('02')) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (/^1[5-9]/.test(d) && d.length <= 8) {
    return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function MetaText({ value }) {
  return value ? <span className="vnd-meta-text" title={value}>{value}</span> : <span className="vnd-empty">-</span>;
}

function TypeTag({ value }) {
  const cls = { 매출처: 'sales', 매입처: 'purchase', 외주처: 'outsource', 겸용: 'both' }[value] ?? 'both';
  return (
    <span className="vnd-type-tag">
      <span className={`vnd-type-dot ${cls}`} />
      {value}
    </span>
  );
}

function ManagerCell({ name, phone }) {
  if (!name && !phone) return <span className="vnd-empty">-</span>;
  return (
    <span className="vnd-manager">
      <span className="vnd-manager-name">{name || '-'}</span>
      {phone && <span className="vnd-manager-phone">{phone}</span>}
    </span>
  );
}

export default function VendorPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  // 조회 조건: 화면에서 고르는 값(*Sel)과 실제 조회에 쓰는 값을 나눠, [조회]를 눌렀을 때만 다시 불러온다
  const [typeSel, setTypeSel] = useState('');
  const [useYnSel, setUseYnSel] = useState('');
  const [keywordSel, setKeywordSel] = useState('');
  const [vendorType, setVendorType] = useState('');
  const [useYn, setUseYn] = useState('');
  const [keyword, setKeyword] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/base/vendor');

  const fetchRows = useCallback(() => {
    setLoading(true);
    getList(vendorType, useYn, keyword)
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorType, useYn, keyword]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleSearch = () => {
    setVendorType(typeSel);
    setUseYn(useYnSel);
    setKeyword(keywordSel.trim());
  };

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
    if (!form.vendorName.trim()) { setFormError('거래처명을 입력하세요.'); return; }
    if (form.bizNo && form.bizNo.replace(/\D/g, '').length !== 10) { setFormError('사업자번호는 숫자 10자리입니다.'); return; }
    if (form.managerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.managerEmail.trim())) {
      setFormError('담당자 이메일 형식이 올바르지 않습니다.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateVendor(editing.vendorId, form);
        showToast('수정되었습니다.');
      } else {
        const res = await createVendor({ ...form, regUserName: user?.userName ?? '' });
        showToast(`등록되었습니다. (${res.data?.vendorCode ?? ''})`);
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
      showToast('삭제할 거래처를 선택해주세요.', 'error');
      return;
    }
    if (!window.confirm(`선택한 ${selectedKeys.size}건을 삭제하시겠습니까?\n거래가 끊긴 업체라면 삭제 대신 사용여부를 '미사용'으로 바꾸는 것을 권장합니다.`)) return;
    try {
      await deleteVendors(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchRows();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheetData = rows.map((r) => ({
      거래처코드: r.vendorCode, 거래처명: r.vendorName, 구분: r.vendorType, 대표자: r.ceoName,
      사업자번호: r.bizNo, 업태: r.bizType, 종목: r.bizItem, 대표전화: r.tel, 팩스: r.fax,
      우편번호: r.zipCode, 주소: [r.address, r.addressDetail].filter(Boolean).join(' '),
      담당자: r.managerName, 담당자연락처: r.managerPhone, 담당자이메일: r.managerEmail,
      사용여부: r.useYn === 'Y' ? '사용' : '미사용', 등록일: (r.regDt || '').slice(0, 10), 비고: r.remark,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '거래처');
    XLSX.writeFile(wb, `거래처목록_${todayStr()}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'vendorCode', title: '거래처코드', width: 100, align: 'center', sortValue: (r) => r.vendorCode, render: (r) => <span className="vnd-code">{r.vendorCode}</span> },
    { key: 'vendorName', title: '거래처명', width: 190, sortValue: (r) => r.vendorName, render: (r) => <span className="vnd-name" title={r.vendorName}>{r.vendorName}</span> },
    { key: 'vendorType', title: '구분', width: 90, align: 'center', sortValue: (r) => r.vendorType, render: (r) => <TypeTag value={r.vendorType} /> },
    { key: 'ceoName', title: '대표자', width: 90, align: 'center', render: (r) => <MetaText value={r.ceoName} /> },
    { key: 'bizNo', title: '사업자번호', width: 120, align: 'center', render: (r) => <span className="vnd-num">{r.bizNo || '-'}</span> },
    { key: 'tel', title: '대표전화', width: 120, align: 'center', render: (r) => <span className="vnd-num">{r.tel || '-'}</span> },
    { key: 'manager', title: '담당자', width: 130, sortValue: (r) => r.managerName, render: (r) => <ManagerCell name={r.managerName} phone={r.managerPhone} /> },
    {
      key: 'useYn', title: '사용', width: 70, align: 'center', sortValue: (r) => r.useYn,
      render: (r) => (
        <span className={`mes-badge ${r.useYn === 'Y' ? 'mes-badge-success' : 'vnd-badge-off'}`}>
          {r.useYn === 'Y' ? '사용' : '미사용'}
        </span>
      ),
    },
    { key: 'regDt', title: '등록일', width: 100, align: 'center', sortValue: (r) => r.regDt, render: (r) => <span className="vnd-num">{(r.regDt || '').slice(0, 10)}</span> },
  ], []);

  return (
    <div className="mes-page vnd-page mes-page-fill">
      <div className="vnd-header-card">
        <div className="vnd-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon">
              <IconBuilding size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">거래처관리</h2>
              <p className="mes-page-desc">매출처·매입처·외주처 정보를 등록하고 관리합니다. 행을 더블클릭하면 수정할 수 있습니다.</p>
            </div>
          </div>
          <button
            type="button"
            className="mes-btn mes-btn-primary"
            disabled={!permission.canCreate}
            title={!permission.canCreate ? '등록 권한이 없습니다' : undefined}
            onClick={openCreate}
          >
            <IconPlus size={15} /> 거래처 등록
          </button>
        </div>

        <div className="vnd-header-sep" />

        <div className="vnd-header-controls">
          <select className="mes-field-inline" value={typeSel} onChange={(e) => setTypeSel(e.target.value)} aria-label="구분">
            <option value="">전체 구분</option>
            {VENDOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="mes-field-inline" value={useYnSel} onChange={(e) => setUseYnSel(e.target.value)} aria-label="사용여부">
            <option value="">전체 (사용/미사용)</option>
            <option value="Y">사용</option>
            <option value="N">미사용</option>
          </select>
          <input
            className="mes-field-inline vnd-keyword"
            placeholder="거래처명·코드·사업자번호"
            value={keywordSel}
            onChange={(e) => setKeywordSel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearch}>조회</button>
          <span className="vnd-count">총 {rows.length}건</span>
          <div className="vnd-header-spacer" />
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

      <div className="mes-card mes-card-fill vnd-table-card">
        <div className="vnd-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.vendorId}
            onRowDoubleClick={openEdit}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="등록된 거래처가 없습니다."
          />
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? `거래처 수정 — ${editing.vendorCode}` : '거래처 등록'} onClose={() => setFormOpen(false)} large>
          <form onSubmit={handleSubmit} className="vnd-form">
            <h4 className="vnd-form-section">기본 정보</h4>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>거래처코드</label>
                <input
                  value={form.vendorCode}
                  onChange={(e) => setField('vendorCode', e.target.value.toUpperCase())}
                  placeholder={editing ? '' : '비워두면 자동 채번 (V0001)'}
                  disabled={!!editing}
                  maxLength={20}
                />
              </div>
              <div className="mes-field">
                <label>거래처명 *</label>
                <input value={form.vendorName} onChange={(e) => setField('vendorName', e.target.value)} maxLength={100} autoFocus />
              </div>
              <div className="mes-field">
                <label>구분</label>
                <select value={form.vendorType} onChange={(e) => setField('vendorType', e.target.value)}>
                  {VENDOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="mes-field">
                <label>사용여부</label>
                <select value={form.useYn} onChange={(e) => setField('useYn', e.target.value)}>
                  <option value="Y">사용</option>
                  <option value="N">미사용</option>
                </select>
              </div>
              <div className="mes-field">
                <label>대표자</label>
                <input value={form.ceoName} onChange={(e) => setField('ceoName', e.target.value)} maxLength={50} />
              </div>
              <div className="mes-field">
                <label>사업자번호</label>
                <input
                  value={form.bizNo}
                  onChange={(e) => setField('bizNo', formatBizNo(e.target.value))}
                  placeholder="000-00-00000"
                  inputMode="numeric"
                />
              </div>
              <div className="mes-field">
                <label>업태</label>
                <input value={form.bizType} onChange={(e) => setField('bizType', e.target.value)} placeholder="예) 제조업" maxLength={50} />
              </div>
              <div className="mes-field">
                <label>종목</label>
                <input value={form.bizItem} onChange={(e) => setField('bizItem', e.target.value)} placeholder="예) 금속열처리" maxLength={100} />
              </div>
            </div>

            <h4 className="vnd-form-section">연락처 · 주소</h4>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>대표전화</label>
                <input value={form.tel} onChange={(e) => setField('tel', formatPhone(e.target.value))} placeholder="055-000-0000" inputMode="tel" />
              </div>
              <div className="mes-field">
                <label>팩스</label>
                <input value={form.fax} onChange={(e) => setField('fax', formatPhone(e.target.value))} inputMode="tel" />
              </div>
              <div className="mes-field">
                <label>우편번호</label>
                <input
                  value={form.zipCode}
                  onChange={(e) => setField('zipCode', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  inputMode="numeric"
                  className="vnd-zip"
                />
              </div>
              <div className="mes-field" />
              <div className="mes-field mes-field-full">
                <label>기본주소</label>
                <input value={form.address} onChange={(e) => setField('address', e.target.value)} maxLength={200} />
              </div>
              <div className="mes-field mes-field-full">
                <label>상세주소</label>
                <input value={form.addressDetail} onChange={(e) => setField('addressDetail', e.target.value)} maxLength={200} />
              </div>
            </div>

            <h4 className="vnd-form-section">담당자</h4>
            <div className="mes-form-grid vnd-grid-3">
              <div className="mes-field">
                <label>담당자</label>
                <input value={form.managerName} onChange={(e) => setField('managerName', e.target.value)} maxLength={50} />
              </div>
              <div className="mes-field">
                <label>연락처</label>
                <input value={form.managerPhone} onChange={(e) => setField('managerPhone', formatPhone(e.target.value))} placeholder="010-0000-0000" inputMode="tel" />
              </div>
              <div className="mes-field">
                <label>이메일</label>
                <input type="email" value={form.managerEmail} onChange={(e) => setField('managerEmail', e.target.value)} maxLength={100} />
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
