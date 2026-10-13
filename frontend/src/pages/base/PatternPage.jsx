import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconFlame, IconPlus, IconTrash, IconFileSpreadsheet, IconHistory } from '@tabler/icons-react';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getList as getVendorList } from '../../api/base/vendorApi';
import { getList as getProductList } from '../../api/base/productApi';
import { getList, createPattern, updatePattern, deletePatterns, getHistory } from '../../api/base/patternApi';
import './PatternPage.css';

const SPEED_UNITS = ['Hz', 'mm/min', 'm/h'];
const ZONES = [1, 2, 3, 4, 5];

const EMPTY_FORM = {
  vendorId: '', productId: '', patternCode: '', patternName: '', chargeWeightKg: '', speedUnit: 'Hz', useYn: 'Y',
  q1Zone: '', q2Zone: '', q3Zone: '', q4Zone: '', q5Zone: '', quenchSpeed: '', cp: '',
  t1Zone: '', t2Zone: '', t3Zone: '', t4Zone: '', t5Zone: '', temperSpeed: '',
  remark: '',
};

const NUMBER_FIELDS = [
  'chargeWeightKg', 'q1Zone', 'q2Zone', 'q3Zone', 'q4Zone', 'q5Zone', 'quenchSpeed', 'cp',
  't1Zone', 't2Zone', 't3Zone', 't4Zone', 't5Zone', 'temperSpeed',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function num(v) {
  return v === null || v === undefined || v === '' ? null : Number(v);
}

// 860.0 → 860, 860.5 → 860.5
function fmtNum(v, digits = 1) {
  if (v === null || v === undefined || v === '') return '';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtHardness(min, max, unit) {
  if (min == null && max == null) return '';
  if (min != null && max != null) return `${fmtNum(min)}~${fmtNum(max)} ${unit}`;
  return min != null ? `${fmtNum(min)} ${unit} 이상` : `${fmtNum(max)} ${unit} 이하`;
}

// Tabulator formatter는 문자열을 innerHTML로 넣으므로 사용자 입력은 반드시 이스케이프
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const EMPTY_CELL = '<span class="pat-null">-</span>';

const fmtTemp = (cell) => {
  const v = cell.getValue();
  return v == null ? EMPTY_CELL : fmtNum(v);
};

const fmtSpeed = (cell) => {
  const v = cell.getValue();
  if (v == null) return EMPTY_CELL;
  return `${fmtNum(v, 2)}<span class="pat-unit">${esc(cell.getRow().getData().speedUnit)}</span>`;
};

// 같은 시각·같은 사람·같은 동작으로 남은 줄들을 "한 번의 변경"으로 묶는다 (서버는 최신 순으로 준다)
function groupHistory(rows) {
  const groups = [];
  rows.forEach((h) => {
    const last = groups[groups.length - 1];
    if (last && last.regDt === h.regDt && last.userName === h.userName && last.action === h.action) {
      last.items.push(h);
    } else {
      groups.push({ regDt: h.regDt, userName: h.userName, action: h.action, items: [h] });
    }
  });
  groups.forEach((g) => g.items.reverse()); // 한 번의 변경 안에서는 화면 항목 순서대로
  return groups;
}

export default function PatternPage() {
  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);

  const [vendorSel, setVendorSel] = useState('');
  const [useYnSel, setUseYnSel] = useState('');
  const [keywordSel, setKeywordSel] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [useYn, setUseYn] = useState('');
  const [keyword, setKeyword] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('form');
  const [history, setHistory] = useState(null);

  const tableRef = useRef(null);
  const openEditRef = useRef(null);

  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/base/pattern');

  const fetchRows = useCallback(() => {
    getList(vendorId, null, useYn, keyword)
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, useYn, keyword]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    getVendorList().then((res) => setVendors(res.data ?? [])).catch(() => {});
    getProductList().then((res) => setProducts(res.data ?? [])).catch(() => {});
  }, []);

  const sortedVendors = useMemo(
    () => [...vendors].sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'ko')),
    [vendors],
  );

  // 등록 화면: 제품이 있는 거래처만, 고른 거래처의 사용 중인 제품만 (수정 중이면 지금 연결된 것도 포함)
  const formVendors = useMemo(() => {
    const ids = new Set(products.map((p) => p.vendorId));
    return sortedVendors.filter((v) => ids.has(v.vendorId));
  }, [sortedVendors, products]);

  const formProducts = useMemo(() => {
    const keepId = editing?.productId;
    return products
      .filter((p) => String(p.vendorId) === String(form.vendorId) && (p.useYn === 'Y' || p.productId === keepId))
      .sort((a, b) => a.partNo.localeCompare(b.partNo, 'ko'));
  }, [products, form.vendorId, editing]);

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.productId) === String(form.productId)),
    [products, form.productId],
  );

  const handleSearch = () => {
    setVendorId(vendorSel);
    setUseYn(useYnSel);
    setKeyword(keywordSel.trim());
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setTab('form');
    setHistory(null);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    if (!permission.canUpdate) return;
    setEditing(row);
    const next = { ...EMPTY_FORM };
    Object.keys(EMPTY_FORM).forEach((k) => { next[k] = row[k] ?? EMPTY_FORM[k]; });
    next.vendorId = String(row.vendorId);
    next.productId = String(row.productId);
    setForm(next);
    setFormError('');
    setTab('form');
    setHistory(null);
    setFormOpen(true);
    getHistory(row.patternId).then((res) => setHistory(res.data ?? [])).catch(() => setHistory([]));
  };
  // Tabulator 이벤트는 표를 만들 때 한 번만 붙으므로, 항상 최신 openEdit(권한 반영)을 부르도록 ref로 넘긴다
  openEditRef.current = openEdit;

  const handleVendorChange = (value) => {
    setForm((f) => ({ ...f, vendorId: value, productId: '' }));
  };

  // 제품을 고르면 장입량이 비어 있을 때 제품의 장입량을 기본값으로 채운다
  const handleProductChange = (value) => {
    const p = products.find((x) => String(x.productId) === value);
    setForm((f) => ({
      ...f,
      productId: value,
      chargeWeightKg: f.chargeWeightKg === '' && p?.chargeWeightKg != null ? String(p.chargeWeightKg) : f.chargeWeightKg,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.productId) { setFormError('제품을 선택하세요.'); return; }

    const payload = { ...form, productId: Number(form.productId) };
    delete payload.vendorId;
    NUMBER_FIELDS.forEach((k) => { payload[k] = num(form[k]); });

    setSaving(true);
    try {
      if (editing) {
        await updatePattern(editing.patternId, { ...payload, updUserName: user?.userName ?? '' });
        showToast('수정되었습니다.');
      } else {
        const res = await createPattern({ ...payload, regUserName: user?.userName ?? '' });
        showToast(`등록되었습니다. (${res.data?.patternCode ?? ''})`);
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
    const selected = tableRef.current?.getSelectedData() ?? [];
    if (selected.length === 0) {
      showToast('삭제할 패턴을 선택해주세요.', 'error');
      return;
    }
    if (!window.confirm(`선택한 패턴 ${selected.length}건을 삭제하시겠습니까?\n변경 이력은 지워지지 않고 남습니다.`)) return;
    try {
      await deletePatterns(selected.map((r) => r.patternId), user?.userName);
      showToast('삭제되었습니다.');
      fetchRows();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheetData = rows.map((r) => {
      const row = {
        패턴코드: r.patternCode, 패턴명: r.patternName, 거래처: r.vendorName, 품번: r.partNo, 품명: r.productName,
        규격: r.spec, 재질: r.material,
        표면경도: fmtHardness(r.surfaceHardMin, r.surfaceHardMax, r.surfaceHardUnit),
        심부경도: fmtHardness(r.coreHardMin, r.coreHardMax, r.coreHardUnit),
        '장입량(kg)': r.chargeWeightKg ?? '',
      };
      ZONES.forEach((z) => { row[`퀜칭 ${z}존`] = r[`q${z}Zone`] ?? ''; });
      row['퀜칭 속도'] = r.quenchSpeed ?? '';
      row['CP(%)'] = r.cp ?? '';
      ZONES.forEach((z) => { row[`템퍼링 ${z}존`] = r[`t${z}Zone`] ?? ''; });
      row['템퍼링 속도'] = r.temperSpeed ?? '';
      row['속도 단위'] = r.speedUnit;
      row['사용여부'] = r.useYn === 'Y' ? '사용' : '미사용';
      row['수정일'] = (r.updDt || '').replace('T', ' ').slice(0, 16);
      row['비고'] = r.remark;
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '패턴');
    XLSX.writeFile(wb, `패턴목록_${todayStr()}.xlsx`);
  };

  const zoneCols = (prefix, groupClass) => [
    ...ZONES.map((z, i) => ({
      title: `${z}존`, field: `${prefix}${z}Zone`, width: 54, minWidth: 54, hozAlign: 'center', headerSort: false,
      formatter: fmtTemp, cssClass: `pat-z ${groupClass}${i === 0 ? ' pat-sep' : ''}`,
    })),
    {
      title: '속도', field: prefix === 'q' ? 'quenchSpeed' : 'temperSpeed', width: 78, minWidth: 78, hozAlign: 'center',
      headerSort: false, formatter: fmtSpeed, cssClass: `pat-z ${groupClass}`,
    },
  ];

  const columns = useMemo(() => {
    const cols = [];
    if (permission.canDelete) {
      cols.push({
        formatter: 'rowSelection', titleFormatter: 'rowSelection', hozAlign: 'center', headerHozAlign: 'center',
        headerSort: false, width: 40, minWidth: 40, frozen: true, cssClass: 'pat-check',
        cellClick: (e, cell) => cell.getRow().toggleSelect(),
      });
    }
    cols.push(
      { title: 'No', formatter: 'rownum', width: 48, minWidth: 48, hozAlign: 'center', headerSort: false, frozen: true },
      {
        title: '패턴', field: 'patternCode', width: 116, minWidth: 116, frozen: true,
        formatter: (cell) => {
          const d = cell.getRow().getData();
          return `<span class="pat-code">${esc(d.patternCode)}</span>${d.patternName ? `<span class="pat-sub" title="${esc(d.patternName)}">${esc(d.patternName)}</span>` : ''}`;
        },
      },
      { title: '거래처', field: 'vendorName', width: 104, minWidth: 104, frozen: true, formatter: (c) => `<span class="pat-text">${esc(c.getValue())}</span>` },
      { title: '품번', field: 'partNo', width: 116, minWidth: 116, frozen: true, formatter: (c) => `<span class="pat-text">${esc(c.getValue())}</span>` },
      {
        title: '품명', field: 'productName', width: 132, minWidth: 132, frozen: true,
        formatter: (c) => `<span class="pat-name" title="${esc(c.getValue())}">${esc(c.getValue())}</span>`,
      },
      {
        title: '장입량', field: 'chargeWeightKg', width: 84, minWidth: 84, hozAlign: 'right',
        formatter: (c) => (c.getValue() == null ? EMPTY_CELL : `${fmtNum(c.getValue(), 2)}<span class="pat-unit">kg</span>`),
      },
      { title: '퀜칭로 (℃)', cssClass: 'pat-grp pat-grp-q', columns: zoneCols('q', 'pat-q') },
      {
        title: 'CP', field: 'cp', width: 64, minWidth: 64, hozAlign: 'center', headerSort: false, cssClass: 'pat-z pat-q pat-sep',
        formatter: (c) => (c.getValue() == null ? EMPTY_CELL : `${Number(c.getValue()).toFixed(2)}<span class="pat-unit">%</span>`),
      },
      { title: '템퍼링로 (℃)', cssClass: 'pat-grp pat-grp-t', columns: zoneCols('t', 'pat-t') },
      {
        title: '사용', field: 'useYn', width: 64, minWidth: 64, hozAlign: 'center', cssClass: 'pat-sep',
        formatter: (c) => (c.getValue() === 'Y'
          ? '<span class="mes-badge mes-badge-success">사용</span>'
          : '<span class="mes-badge pat-badge-off">미사용</span>'),
      },
      {
        title: '수정일', field: 'updDt', width: 96, minWidth: 96, hozAlign: 'center',
        formatter: (c) => `<span class="pat-num">${esc((c.getValue() || '').slice(0, 10))}</span>`,
      },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission.canDelete]);

  const tableOptions = useMemo(() => ({
    layout: 'fitDataStretch',
    pagination: false,
    // 행을 눌러도 선택되지 않게(더블클릭 수정과 겹치지 않도록) — 선택은 왼쪽 체크박스로만
    selectableRows: 'highlight',
    placeholder: '등록된 패턴이 없습니다.',
  }), [permission.canDelete]);

  const handleTableReady = useCallback((table) => {
    tableRef.current = table;
    table.on('rowDblClick', (e, row) => openEditRef.current?.(row.getData()));
  }, []);

  const historyGroups = useMemo(() => (history ? groupHistory(history) : []), [history]);

  return (
    <div className="mes-page pat-page mes-page-fill">
      <div className="pat-header-card">
        <div className="pat-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon">
              <IconFlame size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">패턴관리</h2>
              <p className="mes-page-desc">제품별 열처리 패턴(퀜칭로·템퍼링로 존 온도, 속도, CP)을 관리하고 변경 이력을 남깁니다. 행을 더블클릭하면 수정할 수 있습니다.</p>
            </div>
          </div>
          <button
            type="button"
            className="mes-btn mes-btn-primary"
            disabled={!permission.canCreate}
            title={!permission.canCreate ? '등록 권한이 없습니다' : undefined}
            onClick={openCreate}
          >
            <IconPlus size={15} /> 패턴 등록
          </button>
        </div>

        <div className="pat-header-sep" />

        <div className="pat-header-controls">
          <select className="mes-field-inline pat-vendor-filter" value={vendorSel} onChange={(e) => setVendorSel(e.target.value)} aria-label="거래처">
            <option value="">전체 거래처</option>
            {sortedVendors.map((v) => <option key={v.vendorId} value={v.vendorId}>{v.vendorName}</option>)}
          </select>
          <select className="mes-field-inline" value={useYnSel} onChange={(e) => setUseYnSel(e.target.value)} aria-label="사용여부">
            <option value="">전체 (사용/미사용)</option>
            <option value="Y">사용</option>
            <option value="N">미사용</option>
          </select>
          <input
            className="mes-field-inline pat-keyword"
            placeholder="품번·품명·패턴코드·패턴명"
            value={keywordSel}
            onChange={(e) => setKeywordSel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearch}>조회</button>
          <span className="pat-count">총 {rows.length}건</span>
          <div className="pat-header-spacer" />
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

      <div className="mes-card mes-card-fill pat-table-card">
        <div className="pat-table-wrap">
          <DataTable data={rows} columns={columns} options={tableOptions} height="100%" onTableReady={handleTableReady} />
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? `패턴 수정 — ${editing.patternCode}` : '패턴 등록'} onClose={() => setFormOpen(false)} large className="pat-modal">
          {editing && (
            <div className="pat-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'form'} className={tab === 'form' ? 'is-on' : ''} onClick={() => setTab('form')}>
                조건
              </button>
              <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'is-on' : ''} onClick={() => setTab('history')}>
                <IconHistory size={14} /> 변경 이력{history ? ` ${historyGroups.length}` : ''}
              </button>
            </div>
          )}

          {tab === 'history' && editing ? (
            <div className="pat-history">
              {!history && <div className="pat-history-empty">불러오는 중...</div>}
              {history && historyGroups.length === 0 && <div className="pat-history-empty">변경 이력이 없습니다.</div>}
              {historyGroups.map((g, gi) => (
                <div className="pat-history-item" key={`${g.regDt}-${gi}`}>
                  <div className="pat-history-head">
                    <span className={`pat-history-action is-${g.action === '등록' ? 'create' : g.action === '삭제' ? 'delete' : 'update'}`}>{g.action}</span>
                    <span className="pat-history-when">{(g.regDt || '').replace('T', ' ').slice(0, 16)}</span>
                    <span className="pat-history-who">{g.userName || '알 수 없음'}</span>
                  </div>
                  {g.action === '수정' && (
                    <ul className="pat-history-changes">
                      {g.items.map((h) => (
                        <li key={h.histId}>
                          <span className="pat-history-field">{h.fieldLabel}</span>
                          <span className="pat-history-before">{h.beforeValue || '(없음)'}</span>
                          <span className="pat-history-arrow" aria-label="에서">→</span>
                          <span className="pat-history-after">{h.afterValue || '(없음)'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <div className="mes-modal-footer">
                <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setFormOpen(false)}>닫기</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="pat-form">
              <h4 className="pat-form-section">제품</h4>
              <div className="mes-form-grid">
                <div className="mes-field">
                  <label htmlFor="pat-vendor">거래처 *</label>
                  <select id="pat-vendor" value={form.vendorId} onChange={(e) => handleVendorChange(e.target.value)}>
                    <option value="">선택하세요</option>
                    {formVendors.map((v) => <option key={v.vendorId} value={v.vendorId}>{v.vendorName}</option>)}
                  </select>
                </div>
                <div className="mes-field">
                  <label htmlFor="pat-product">제품 *</label>
                  <select id="pat-product" value={form.productId} onChange={(e) => handleProductChange(e.target.value)} disabled={!form.vendorId}>
                    <option value="">{form.vendorId ? '선택하세요' : '거래처를 먼저 고르세요'}</option>
                    {formProducts.map((p) => (
                      <option key={p.productId} value={p.productId}>
                        {p.partNo} · {p.productName}{p.useYn !== 'Y' ? ' (미사용)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedProduct && (
                <dl className="pat-product-info">
                  <div><dt>품명</dt><dd>{selectedProduct.productName}</dd></div>
                  <div><dt>규격</dt><dd>{selectedProduct.spec || '-'}</dd></div>
                  <div><dt>재질</dt><dd>{selectedProduct.material || '-'}</dd></div>
                  <div><dt>표면경도</dt><dd>{fmtHardness(selectedProduct.surfaceHardMin, selectedProduct.surfaceHardMax, selectedProduct.surfaceHardUnit) || '-'}</dd></div>
                  <div><dt>심부경도</dt><dd>{fmtHardness(selectedProduct.coreHardMin, selectedProduct.coreHardMax, selectedProduct.coreHardUnit) || '-'}</dd></div>
                </dl>
              )}

              <h4 className="pat-form-section">패턴</h4>
              <div className="mes-form-grid pat-grid-3">
                <div className="mes-field">
                  <label htmlFor="pat-code">패턴코드</label>
                  <input
                    id="pat-code"
                    value={form.patternCode}
                    onChange={(e) => setField('patternCode', e.target.value.toUpperCase())}
                    placeholder={editing ? '' : '비워두면 자동 채번 (PT0001)'}
                    disabled={!!editing}
                    maxLength={20}
                  />
                </div>
                <div className="mes-field pat-span-2">
                  <label htmlFor="pat-name">패턴명</label>
                  <input id="pat-name" value={form.patternName} onChange={(e) => setField('patternName', e.target.value)} placeholder="같은 제품의 패턴끼리 구분 (예: 1라인 기본)" maxLength={100} />
                </div>
                <div className="mes-field">
                  <label htmlFor="pat-charge">장입량</label>
                  <div className="pat-unit-input">
                    <input id="pat-charge" type="number" min="0" step="any" inputMode="decimal" value={form.chargeWeightKg} onChange={(e) => setField('chargeWeightKg', e.target.value)} />
                    <span>kg</span>
                  </div>
                </div>
                <div className="mes-field">
                  <label htmlFor="pat-speed-unit">속도 단위</label>
                  <select id="pat-speed-unit" value={form.speedUnit} onChange={(e) => setField('speedUnit', e.target.value)}>
                    {SPEED_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="mes-field">
                  <label htmlFor="pat-use">사용여부</label>
                  <select id="pat-use" value={form.useYn} onChange={(e) => setField('useYn', e.target.value)}>
                    <option value="Y">사용</option>
                    <option value="N">미사용</option>
                  </select>
                </div>
              </div>

              <h4 className="pat-form-section">로 조건</h4>
              <div className="pat-furnace">
                <div className="pat-furnace-head" aria-hidden="true">
                  <span />
                  {ZONES.map((z) => <span key={z}>{z}존</span>)}
                  <span>속도</span>
                  <span>CP</span>
                </div>
                {[
                  { key: 'q', label: '퀜칭로', cls: 'is-q', speed: 'quenchSpeed', cp: true },
                  { key: 't', label: '템퍼링로', cls: 'is-t', speed: 'temperSpeed', cp: false },
                ].map((f) => (
                  <div className={`pat-furnace-row ${f.cls}`} key={f.key}>
                    <span className="pat-furnace-label">{f.label}<small>℃</small></span>
                    {ZONES.map((z) => (
                      <input
                        key={z}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={form[`${f.key}${z}Zone`]}
                        onChange={(e) => setField(`${f.key}${z}Zone`, e.target.value)}
                        aria-label={`${f.label} ${z}존 온도`}
                      />
                    ))}
                    <div className="pat-unit-input">
                      <input type="number" min="0" step="any" inputMode="decimal" value={form[f.speed]} onChange={(e) => setField(f.speed, e.target.value)} aria-label={`${f.label} 속도`} />
                      <span>{form.speedUnit}</span>
                    </div>
                    {f.cp ? (
                      <div className="pat-unit-input">
                        <input type="number" min="0" max="3" step="0.01" inputMode="decimal" value={form.cp} onChange={(e) => setField('cp', e.target.value)} aria-label="카본포텐셜 CP" />
                        <span>%</span>
                      </div>
                    ) : <span />}
                  </div>
                ))}
              </div>

              <div className="mes-field pat-remark">
                <label htmlFor="pat-remark">비고</label>
                <textarea id="pat-remark" rows={2} value={form.remark} onChange={(e) => setField('remark', e.target.value)} maxLength={300} />
              </div>

              {editing && <p className="pat-hist-note">저장하면 바뀐 항목이 변경 이력에 남습니다.</p>}
              {formError && <div className="mes-error" style={{ marginTop: 4 }}>{formError}</div>}
              <div className="mes-modal-footer">
                <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setFormOpen(false)}>취소</button>
                <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
