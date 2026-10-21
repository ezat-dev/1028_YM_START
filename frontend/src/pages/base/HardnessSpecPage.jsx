import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconRulerMeasure, IconPlus, IconTrash, IconFileSpreadsheet } from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getSpecList, createSpec, updateSpec, deleteSpecs } from '../../api/quality/hardnessApi';
import { getList as getEquipmentList } from '../../api/base/equipmentApi';
import { getList as getProductList } from '../../api/base/productApi';
import { AuditCell, FormAudit } from '../equipment/equipHistShared';
import { fmtSpecRange, equipLabel } from '../quality/capability';
import '../../styles/downtime.css';
import '../../styles/hardness.css';

/*
 * 기준정보 > 경도관리 — 호기 × 품번 × 검사 항목별 경도 규격(하한·상한·단위, 세트당 측정 개수).
 * 같은 품번이라도 호기마다 규격이 다르다. 경도측정 · CHECK SHEET · CPK·PPK가 모두 이 규격을 쓴다.
 * 품번은 기준정보 > 제품관리에서 고른다(품명·업체·재질은 제품관리 값). 하한·상한은 제품의 경도 기준을 불러와 고칠 수 있다.
 */

const ITEMS = ['표면 경도', '심부 경도', '유효경화깊이', '비경화부 경도'];
const UNITS = ['HV', 'HRC', 'HRA', 'HRB', 'HB', 'mm'];
const EMPTY = {
  equipCode: '', productId: null, partNo: '', productName: '', itemName: '표면 경도', unit: 'HV', lsl: '', usl: '', target: '',
  decimals: 0, sampleSize: 5, useYn: 'Y', remark: '',
};
const num = (v) => (v === '' || v == null ? null : Number(v));
// 제품관리의 경도 기준(표면·심부) → 이 규격의 하한·상한·단위
const productHard = (p, item) => {
  if (!p) return null;
  if (item === '표면 경도' && (p.surfaceHardMin != null || p.surfaceHardMax != null)) return { lsl: p.surfaceHardMin, usl: p.surfaceHardMax, unit: p.surfaceHardUnit };
  if (item === '심부 경도' && (p.coreHardMin != null || p.coreHardMax != null)) return { lsl: p.coreHardMin, usl: p.coreHardMax, unit: p.coreHardUnit };
  return null;
};
const show = (v, d) => (v == null ? <span className="dtm-empty">-</span> : <span className="hd-num">{Number(v).toFixed(d)}</span>);

export default function HardnessSpecPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [keywordSel, setKeywordSel] = useState('');
  const [useSel, setUseSel] = useState('');
  const [query, setQuery] = useState({ keyword: '', useYn: '', equipCode: '' });
  const [equipments, setEquipments] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null); // { editing }
  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/base/hardnessSpec');

  const fetchRows = useCallback(() => {
    setLoading(true);
    getSpecList(query.keyword, query.useYn, query.equipCode)
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('경도 규격을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => {
    getEquipmentList('', 'Y', '').then((res) => setEquipments(res.data ?? [])).catch(() => {});
    getProductList(null, 'Y', '').then((res) => setProducts(res.data ?? [])).catch(() => {});
  }, []);

  const partCount = useMemo(() => new Set(rows.map((r) => r.partNo)).size, [rows]);

  const openEdit = useCallback((row) => {
    if (!permission.canUpdate) return;
    setForm({ editing: row });
  }, [permission.canUpdate]);

  const handleDelete = async () => {
    if (selectedKeys.size === 0) { showToast('삭제할 규격을 선택해주세요.', 'error'); return; }
    if (!window.confirm(`선택한 ${selectedKeys.size}건을 삭제하시겠습니까?`)) return;
    try {
      await deleteSpecs([...selectedKeys]);
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchRows();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map((r, i) => ({
      No: i + 1, 호기: equipLabel(r.equipCode, r.equipName), 설비코드: r.equipCode, 품번: r.partNo, 품명: r.productName, 검사항목: r.itemName, 단위: r.unit,
      하한: r.lsl, 목표: r.target, 상한: r.usl, 세트당개수: r.sampleSize, 소수자리: r.decimals,
      사용: r.useYn === 'Y' ? '사용' : '미사용', 측정건수: r.measCount, 비고: r.remark,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '경도규격');
    XLSX.writeFile(wb, '경도규격.xlsx');
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, i) => i + 1 },
    { key: 'equip', title: '호기', width: 70, align: 'center', sortValue: (r) => r.equipCode, render: (r) => <span className="hd-eq" title={r.equipName}>{equipLabel(r.equipCode, r.equipName)}</span> },
    { key: 'partNo', title: '품번', width: 130, sortValue: (r) => r.partNo, render: (r) => <b className="hd-part">{r.partNo}</b> },
    { key: 'productName', title: '품명', width: 140, sortValue: (r) => r.productName, render: (r) => r.productName || <span className="dtm-empty">-</span> },
    { key: 'vendor', title: '업체', width: 110, sortValue: (r) => r.vendorName, render: (r) => r.vendorName || <span className="dtm-empty">-</span> },
    { key: 'material', title: '재질', width: 80, render: (r) => r.material || <span className="dtm-empty">-</span> },
    { key: 'itemName', title: '검사 항목', width: 110, sortValue: (r) => r.itemName, render: (r) => <span className="hd-item">{r.itemName}</span> },
    { key: 'range', title: '규격', width: 150, render: (r) => <span className="hd-range">{fmtSpecRange(r)}</span> },
    { key: 'lsl', title: '하한', width: 80, align: 'right', render: (r) => show(r.lsl, r.decimals) },
    { key: 'target', title: '목표', width: 80, align: 'right', render: (r) => show(r.target, r.decimals) },
    { key: 'usl', title: '상한', width: 80, align: 'right', render: (r) => show(r.usl, r.decimals) },
    { key: 'unit', title: '단위', width: 64, align: 'center', render: (r) => <span className="hd-unit">{r.unit}</span> },
    { key: 'sampleSize', title: '세트당', width: 84, align: 'center', render: (r) => <span className="hd-num">경도1~{r.sampleSize}</span> },
    { key: 'measCount', title: '측정', width: 64, align: 'right', sortValue: (r) => r.measCount, render: (r) => <span className="hd-num">{r.measCount}건</span> },
    { key: 'useYn', title: '사용', width: 70, align: 'center', render: (r) => (r.useYn === 'Y' ? <span className="mes-badge mes-badge-success">사용</span> : <span className="dtm-badge-off">미사용</span>) },
    { key: 'remark', title: '비고', width: 160, render: (r) => (r.remark ? <span className="dtm-memo" title={r.remark}>{r.remark}</span> : <span className="dtm-empty">-</span>) },
    { key: 'audit', title: '등록 / 수정', width: 170, render: (r) => <AuditCell row={r} /> },
  ], []);

  return (
    <div className="mes-page dtm-page hd-page mes-page-fill">
      <div className="dtm-header-card">
        <div className="dtm-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon"><IconRulerMeasure size={20} /></div>
            <div>
              <h2 className="mes-page-title">경도관리</h2>
              <p className="mes-page-desc">호기 · 품번 · 검사 항목별 경도 규격(하한·상한·단위)을 관리합니다. 같은 품번도 호기마다 규격이 다릅니다. 경도측정 · CHECK SHEET · CPK·PPK가 이 규격을 씁니다. 행을 더블클릭하면 수정합니다.</p>
            </div>
          </div>
          <div className="dtm-header-right">
            <button type="button" className="mes-btn mes-btn-primary" disabled={!permission.canCreate} onClick={() => setForm({ editing: null })}>
              <IconPlus size={15} /> 규격 등록
            </button>
          </div>
        </div>
        <div className="dtm-header-sep" />
        <div className="dtm-header-controls">
          <div className="hd-eq-filter" role="group" aria-label="호기">
            <button type="button" className={!query.equipCode ? 'is-on' : ''} onClick={() => setQuery((q) => ({ ...q, equipCode: '' }))}>전체</button>
            {equipments.map((eq) => (
              <button key={eq.equipId} type="button" className={query.equipCode === eq.equipCode ? 'is-on' : ''} onClick={() => setQuery((q) => ({ ...q, equipCode: eq.equipCode }))} title={eq.equipName}>
                {equipLabel(eq.equipCode, eq.equipName)}
              </button>
            ))}
          </div>
          <select className="mes-field-inline" value={useSel} onChange={(e) => setUseSel(e.target.value)} aria-label="사용 여부">
            <option value="">전체</option>
            <option value="Y">사용</option>
            <option value="N">미사용</option>
          </select>
          <input
            className="mes-field-inline dtm-keyword"
            placeholder="품번·품명·검사 항목"
            value={keywordSel}
            onChange={(e) => setKeywordSel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setQuery((q) => ({ ...q, keyword: keywordSel.trim(), useYn: useSel })); }}
          />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setQuery((q) => ({ ...q, keyword: keywordSel.trim(), useYn: useSel }))}>조회</button>
          <span className="dtm-count">품번 {partCount}개 · 규격 {rows.length}건</span>
          <div className="dtm-header-spacer" />
          {permission.canDelete && <button type="button" className="mes-btn mes-btn-danger" onClick={handleDelete}><IconTrash size={15} /> 선택 삭제</button>}
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleExcel} disabled={!rows.length}><IconFileSpreadsheet size={15} /> 엑셀</button>
        </div>
      </div>

      <div className="mes-card mes-card-fill dtm-table-card">
        <div className="dtm-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.specId}
            onRowDoubleClick={openEdit}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="등록된 경도 규격이 없습니다."
          />
        </div>
      </div>

      {form && (
        <SpecForm
          editing={form.editing}
          equipments={equipments}
          products={products}
          defaultEquip={query.equipCode}
          user={user}
          onClose={() => setForm(null)}
          onSaved={(msg) => { setForm(null); showToast(msg); fetchRows(); }}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}

function SpecForm({ editing, equipments, products, defaultEquip, user, onClose, onSaved }) {
  const [f, setF] = useState(() => (editing ? {
    ...EMPTY, ...editing,
    lsl: editing.lsl ?? '', usl: editing.usl ?? '', target: editing.target ?? '', productName: editing.productName ?? '', remark: editing.remark ?? '',
  } : EMPTY));
  // 새로 등록할 때는 여러 호기에 같은 규격을 한 번에 넣을 수 있다
  const [equipSet, setEquipSet] = useState(() => new Set(editing ? [editing.equipCode] : defaultEquip ? [defaultEquip] : []));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // 측정이 쌓인 규격은 단위·세트당 개수·품번을 못 바꾼다(지난 값과 섞이면 CPK·PPK가 틀어짐)
  const locked = Boolean(editing?.measCount);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setVal = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const product = products.find((p) => p.productId === f.productId) ?? (f.productId == null ? products.find((p) => p.partNo === f.partNo) : null);
  // 하한·상한이 비어 있으면 제품관리의 경도 기준으로 채운다
  const fillHard = (s, p, item) => {
    const h = productHard(p, item);
    if (!h || num(s.lsl) != null || num(s.usl) != null) return s;
    return { ...s, lsl: h.lsl ?? '', usl: h.usl ?? '', unit: locked ? s.unit : (h.unit || s.unit) };
  };
  const pickProduct = (e) => {
    const p = products.find((x) => String(x.productId) === e.target.value);
    setF((s) => fillHard({ ...s, productId: p?.productId ?? null, partNo: p?.partNo ?? '', productName: p?.productName ?? '' }, p, s.itemName));
  };
  const pickItem = (it) => setF((s) => fillHard({ ...s, itemName: it }, product, it));
  const loadHard = () => {
    const h = productHard(product, f.itemName);
    if (h) setF((s) => ({ ...s, lsl: h.lsl ?? '', usl: h.usl ?? '', unit: locked ? s.unit : (h.unit || s.unit) }));
  };
  const hardHint = productHard(product, f.itemName);

  const preview = fmtSpecRange({ lsl: num(f.lsl), usl: num(f.usl), unit: f.unit, decimals: Number(f.decimals) });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!equipSet.size) { setError('호기를 고르세요.'); return; }
    if (!f.partNo.trim()) { setError('품번(제품)을 고르세요.'); return; }
    if (!f.itemName.trim()) { setError('검사 항목을 입력하세요.'); return; }
    if (num(f.lsl) == null && num(f.usl) == null) { setError('하한이나 상한 중 하나는 입력하세요.'); return; }
    if (num(f.lsl) != null && num(f.usl) != null && num(f.lsl) >= num(f.usl)) { setError('하한은 상한보다 작아야 합니다.'); return; }
    const body = {
      ...f, productId: product?.productId ?? f.productId, partNo: f.partNo.trim(), itemName: f.itemName.trim(),
      lsl: num(f.lsl), usl: num(f.usl), target: num(f.target), decimals: Number(f.decimals), sampleSize: Number(f.sampleSize),
    };
    setSaving(true);
    try {
      if (editing) {
        await updateSpec(editing.specId, { ...body, equipCode: [...equipSet][0], updUserId: user?.loginId ?? '', updUserName: user?.userName ?? '' });
        onSaved('수정되었습니다.');
      } else {
        const codes = [...equipSet];
        for (const code of codes) {
          // eslint-disable-next-line no-await-in-loop
          await createSpec({ ...body, equipCode: code, regUserId: user?.loginId ?? '', regUserName: user?.userName ?? '' });
        }
        onSaved(codes.length > 1 ? `${codes.length}개 호기에 등록되었습니다.` : '등록되었습니다.');
      }
    } catch (err) {
      setError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? `경도 규격 수정 — ${equipLabel(editing.equipCode, editing.equipName)} · ${editing.partNo} · ${editing.itemName}` : '경도 규격 등록'} onClose={onClose} large className="hd-modal">
      <form onSubmit={submit} className="dtm-form">
        <div className="dtm-form-row">
          <div className="dtm-form-label">
            호기 *
            <span className="dtm-form-hint">
              {editing ? (locked ? `측정 ${editing.measCount}건이 있어 바꿀 수 없습니다` : '같은 품번도 호기마다 규격이 다릅니다') : '여러 호기를 고르면 같은 규격으로 한 번에 등록합니다'}
            </span>
          </div>
          <div className="hd-eq-pick" role="group" aria-label="호기">
            {equipments.map((eq) => {
              const on = equipSet.has(eq.equipCode);
              return (
                <button
                  key={eq.equipId}
                  type="button"
                  aria-pressed={on}
                  className={on ? 'is-on' : ''}
                  disabled={Boolean(editing) && locked && !on}
                  title={eq.equipName}
                  onClick={() => setEquipSet((cur) => {
                    if (editing) return new Set([eq.equipCode]);
                    const n = new Set(cur);
                    if (n.has(eq.equipCode)) n.delete(eq.equipCode); else n.add(eq.equipCode);
                    return n;
                  })}
                >
                  {equipLabel(eq.equipCode, eq.equipName)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="hd-grid-2">
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="hs-part">
              품번 *
              <span className="dtm-form-hint">{locked ? `측정 ${editing.measCount}건이 있어 바꿀 수 없습니다` : '기준정보 > 제품관리에서 고릅니다'}</span>
            </label>
            <select id="hs-part" className="dtm-input" value={product?.productId ?? ''} onChange={pickProduct} disabled={locked}>
              <option value="">제품 선택</option>
              {products.map((p) => (
                <option key={p.productId} value={p.productId}>{p.partNo} · {p.productName}{p.vendorName ? ` (${p.vendorName})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="dtm-form-row">
            <div className="dtm-form-label">품명 · 업체 · 재질 <span className="dtm-form-hint">제품관리 값</span></div>
            <div className="hd-product-info">
              {product
                ? <><b>{product.productName}</b><span>{product.vendorName || '-'}</span><span>{product.material || '-'}</span>{product.spec && <span>{product.spec}</span>}</>
                : <span className="dtm-empty">제품을 고르면 나옵니다</span>}
            </div>
          </div>
        </div>

        <div className="dtm-form-row">
          <label className="dtm-form-label" htmlFor="hs-item">검사 항목 *</label>
          <div className="hd-item-row">
            <input id="hs-item" className="dtm-input" value={f.itemName} maxLength={30} onChange={set('itemName')} />
            <div className="hd-chips-pick">
              {ITEMS.map((it) => <button key={it} type="button" className={f.itemName === it ? 'is-on' : ''} onClick={() => pickItem(it)}>{it}</button>)}
            </div>
          </div>
        </div>

        <div className="dtm-form-row">
          <div className="dtm-form-label">단위 *{locked && <span className="dtm-form-hint">측정 {editing.measCount}건이 있어 바꿀 수 없습니다</span>}</div>
          <div className="hd-seg" role="radiogroup" aria-label="단위">
            {UNITS.map((u) => <button key={u} type="button" role="radio" aria-checked={f.unit === u} disabled={locked && f.unit !== u} className={f.unit === u ? 'is-on' : ''} onClick={() => setVal('unit', u)}>{u}</button>)}
          </div>
        </div>

        <div className="hd-grid-3">
          {[['lsl', '하한 (LSL)'], ['target', '목표값'], ['usl', '상한 (USL)']].map(([k, label]) => (
            <div key={k} className="dtm-form-row">
              <label className="dtm-form-label" htmlFor={`hs-${k}`}>{label}</label>
              <div className="hd-unit-input">
                <input id={`hs-${k}`} className="dtm-input" type="number" step="any" value={f[k]} onChange={set(k)} placeholder={k === 'target' ? '선택' : '없으면 비움'} />
                <span>{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hd-preview">
          규격 <b>{preview || '하한·상한을 입력하세요'}</b>
          {hardHint && (
            <button type="button" className="hd-load-hard" onClick={loadHard} title="제품관리에 적힌 경도 기준을 하한·상한에 넣습니다">
              제품관리 기준 불러오기 <small>{fmtSpecRange({ lsl: hardHint.lsl, usl: hardHint.usl, unit: hardHint.unit, decimals: 1 })}</small>
            </button>
          )}
        </div>

        <div className="hd-grid-3">
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="hs-n">세트당 측정 개수</label>
            <select id="hs-n" className="dtm-input" value={f.sampleSize} onChange={set('sampleSize')} disabled={locked} title={locked ? '측정이 있어 바꿀 수 없습니다' : undefined}>
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}개 (경도1~{n})</option>)}
            </select>
          </div>
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="hs-dec">소수 자리</label>
            <select id="hs-dec" className="dtm-input" value={f.decimals} onChange={set('decimals')}>
              {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}자리</option>)}
            </select>
          </div>
          <div className="dtm-form-row">
            <div className="dtm-form-label">사용</div>
            <div className="hd-seg" role="radiogroup" aria-label="사용 여부">
              {[['Y', '사용'], ['N', '미사용']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={f.useYn === v} className={f.useYn === v ? 'is-on' : ''} onClick={() => setVal('useYn', v)}>{l}</button>)}
            </div>
          </div>
        </div>
        <p className="hd-help">경도측정 화면은 세트마다 경도1~{f.sampleSize}칸을 씁니다. CHECK SHEET는 통마다 X1~X5 중 적은 만큼(최소 2개부터 CPK) 계산합니다. 한 시료에서 여러 점을 쟀으면 평균 1개 값을 입력합니다.</p>

        <div className="dtm-form-row">
          <label className="dtm-form-label" htmlFor="hs-remark">비고</label>
          <input id="hs-remark" className="dtm-input" value={f.remark} maxLength={300} onChange={set('remark')} placeholder="예) 침탄 후 표면, HV10" />
        </div>

        <FormAudit editing={editing} user={user} />
        {error && <div className="mes-error">{error}</div>}
        <div className="mes-modal-footer">
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button>
          <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : editing ? '저장' : '등록'}</button>
        </div>
      </form>
    </Modal>
  );
}
