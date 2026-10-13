import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  IconPackage, IconPlus, IconTrash, IconFileSpreadsheet, IconPhoto, IconPhotoPlus, IconStar, IconArrowsMaximize,
} from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import ImageViewer from '../../components/ui/ImageViewer';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getList as getVendorList } from '../../api/base/vendorApi';
import {
  getList, createProduct, updateProduct, deleteProducts, uploadImage, deleteImage, reorderImages, imageUrl,
} from '../../api/base/productApi';
import { makeThumbnail, isAllowedImage, IMAGE_ACCEPT, MAX_IMAGE_BYTES } from '../../utils/imageThumb';
import './ProductPage.css';

const MAX_IMAGES = 5;
const HARDNESS_UNITS = ['HRC', 'HV', 'HB', 'HRB'];

const EMPTY_FORM = {
  productCode: '', vendorId: '', partNo: '', productName: '', material: '', spec: '', useYn: 'Y',
  chargeWeightKg: '', unitWeightG: '', unitPrice: '', priceUnit: 'KG',
  surfaceHardMin: '', surfaceHardMax: '', surfaceHardUnit: 'HRC',
  coreHardMin: '', coreHardMax: '', coreHardUnit: 'HRC',
  remark: '',
};

const NUMBER_FIELDS = [
  'chargeWeightKg', 'unitWeightG', 'unitPrice', 'surfaceHardMin', 'surfaceHardMax', 'coreHardMin', 'coreHardMax',
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

function fmtNum(v) {
  return v === null || v === undefined ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// 58~62 HRC / 58 이상 / 62 이하
function fmtHardness(min, max, unit) {
  if (min == null && max == null) return '';
  if (min != null && max != null) return `${fmtNum(min)}~${fmtNum(max)} ${unit}`;
  if (min != null) return `${fmtNum(min)} ${unit} 이상`;
  return `${fmtNum(max)} ${unit} 이하`;
}

function fmtPrice(price, unit) {
  if (price == null) return '';
  return `${fmtNum(price)}원/${unit === 'EA' ? '개' : 'kg'}`;
}

// 1회 장입량(kg) ÷ 개당 중량(g) → 1회에 들어가는 개수
function chargeCount(kg, g) {
  const k = num(kg);
  const w = num(g);
  if (!k || !w) return null;
  return Math.floor((k * 1000) / w);
}

function MetaText({ value }) {
  return value ? <span className="prd-meta-text" title={value}>{value}</span> : <span className="prd-empty">-</span>;
}

// 저장된 이미지 → 뷰어/미리보기용 객체
function savedToView(img) {
  return {
    src: imageUrl(img.imageId),
    thumbSrc: imageUrl(img.imageId, { thumb: true }),
    downloadUrl: imageUrl(img.imageId, { download: true }),
    name: img.origFileName,
  };
}

function HardnessCell({ product: r }) {
  const surface = fmtHardness(r.surfaceHardMin, r.surfaceHardMax, r.surfaceHardUnit);
  const core = fmtHardness(r.coreHardMin, r.coreHardMax, r.coreHardUnit);
  if (!surface && !core) return <span className="prd-empty">-</span>;
  return (
    <span className="prd-hard-cell">
      <span><em>표면</em>{surface || '-'}</span>
      <span><em>심부</em>{core || '-'}</span>
    </span>
  );
}

function ThumbCell({ product, onOpen }) {
  const images = product.images ?? [];
  if (images.length === 0) {
    return (
      <span className="prd-thumb prd-thumb-empty" aria-label="이미지 없음">
        <IconPhoto size={16} />
      </span>
    );
  }
  return (
    <button
      type="button"
      className="prd-thumb"
      onClick={(e) => { e.stopPropagation(); onOpen(product, 0); }}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={`${product.productName} 이미지 ${images.length}장 보기`}
    >
      <img src={imageUrl(images[0].imageId, { thumb: true })} alt="" loading="lazy" />
      {images.length > 1 && <span className="prd-thumb-count">+{images.length - 1}</span>}
    </button>
  );
}

export default function ProductPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const [vendorSel, setVendorSel] = useState('');
  const [useYnSel, setUseYnSel] = useState('');
  const [keywordSel, setKeywordSel] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [useYn, setUseYn] = useState('');
  const [keyword, setKeyword] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // 이미지 칸 5개: null | { type: 'saved', image } | { type: 'new', file, preview, thumb }
  const [slots, setSlots] = useState(Array(MAX_IMAGES).fill(null));
  const [dragOverSlot, setDragOverSlot] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [viewer, setViewer] = useState(null); // { images, index, title }
  const fileInputRef = useRef(null);
  const pickTargetRef = useRef(0);

  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/base/product');

  const fetchRows = useCallback(() => {
    setLoading(true);
    getList(vendorId, useYn, keyword)
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, useYn, keyword]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    getVendorList().then((res) => setVendors(res.data ?? [])).catch(() => {});
  }, []);

  // 새로 고른 이미지의 미리보기 URL은 모달을 닫거나 칸을 비울 때 정리
  const revokeSlots = (list) => list.forEach((s) => { if (s?.type === 'new') URL.revokeObjectURL(s.preview); });

  // 등록 화면의 거래처 목록: 사용 중인 매출처·겸용 + (수정 중이면) 지금 연결된 거래처
  const vendorOptions = useMemo(() => {
    const list = vendors.filter((v) => v.useYn === 'Y' && (v.vendorType === '매출처' || v.vendorType === '겸용'));
    if (editing && !list.some((v) => v.vendorId === editing.vendorId)) {
      const cur = vendors.find((v) => v.vendorId === editing.vendorId);
      if (cur) list.push(cur);
    }
    return list.sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'ko'));
  }, [vendors, editing]);

  const filterVendors = useMemo(
    () => [...vendors].sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'ko')),
    [vendors],
  );

  const handleSearch = () => {
    setVendorId(vendorSel);
    setUseYn(useYnSel);
    setKeyword(keywordSel.trim());
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const openViewer = useCallback((product, index) => {
    setViewer({
      images: (product.images ?? []).map(savedToView),
      index,
      title: `${product.productName} · ${product.partNo}`,
    });
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSlots(Array(MAX_IMAGES).fill(null));
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = useCallback((row) => {
    if (!permission.canUpdate) return;
    setEditing(row);
    const next = { ...EMPTY_FORM };
    Object.keys(EMPTY_FORM).forEach((k) => { next[k] = row[k] ?? EMPTY_FORM[k]; });
    next.vendorId = String(row.vendorId);
    setForm(next);
    const s = Array(MAX_IMAGES).fill(null);
    (row.images ?? []).forEach((img) => { if (img.slot >= 1 && img.slot <= MAX_IMAGES) s[img.slot - 1] = { type: 'saved', image: img }; });
    setSlots(s);
    setFormError('');
    setFormOpen(true);
  }, [permission.canUpdate]);

  const closeForm = () => {
    revokeSlots(slots);
    setFormOpen(false);
  };

  // 파일 여러 장을 startIndex 칸부터 빈 칸에 차례로 채운다(첫 칸은 비어 있지 않아도 교체)
  const addFiles = async (fileList, startIndex = 0) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    const rejected = files.filter((f) => !isAllowedImage(f) || f.size > MAX_IMAGE_BYTES);
    if (rejected.length) {
      showToast('jpg·png·webp·gif, 장당 10MB 이하만 올릴 수 있습니다.', 'error');
    }
    const ok = files.filter((f) => isAllowedImage(f) && f.size <= MAX_IMAGE_BYTES);
    if (ok.length === 0) return;

    const prepared = await Promise.all(ok.map(async (file) => ({
      type: 'new', file, preview: URL.createObjectURL(file), thumb: await makeThumbnail(file),
    })));

    setSlots((prev) => {
      const next = [...prev];
      let i = startIndex;
      for (const item of prepared) {
        // 시작 칸은 교체, 그 다음부터는 빈 칸만 찾아 들어간다
        if (i !== startIndex) {
          while (i < MAX_IMAGES && next[i]) i += 1;
        }
        if (i >= MAX_IMAGES) {
          URL.revokeObjectURL(item.preview);
          continue;
        }
        if (next[i]?.type === 'new') URL.revokeObjectURL(next[i].preview);
        next[i] = item;
        i += 1;
      }
      return next;
    });
  };

  const pickFiles = (slotIndex) => {
    pickTargetRef.current = slotIndex;
    fileInputRef.current?.click();
  };

  const removeSlot = (i) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[i]?.type === 'new') URL.revokeObjectURL(next[i].preview);
      next[i] = null;
      return next;
    });
  };

  const makeMain = (i) => {
    setSlots((prev) => {
      const next = [...prev];
      [next[0], next[i]] = [next[i], next[0]];
      return next;
    });
  };

  const slotView = (s) => (s.type === 'saved'
    ? savedToView(s.image)
    : { src: s.preview, thumbSrc: s.preview, name: s.file.name });

  const openSlotViewer = (i) => {
    const filled = slots.map((s, idx) => (s ? { s, idx } : null)).filter(Boolean);
    setViewer({
      images: filled.map(({ s }) => slotView(s)),
      index: filled.findIndex((f) => f.idx === i),
      title: form.productName || '제품 이미지',
    });
  };

  const handlePaste = (e) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    const firstEmpty = slots.findIndex((s) => !s);
    if (firstEmpty === -1) {
      showToast('이미지 칸이 가득 찼습니다. 하나를 지운 뒤 붙여넣어 주세요.', 'error');
      return;
    }
    // 붙여넣은 이미지는 이름이 image.png라 구분이 안 돼서 시각을 붙인다
    const named = files.map((f, n) => new File([f], `붙여넣기_${Date.now()}_${n + 1}.png`, { type: f.type }));
    addFiles(named, firstEmpty);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.vendorId) { setFormError('거래처를 선택하세요.'); return; }
    if (!form.partNo.trim()) { setFormError('품번을 입력하세요.'); return; }
    if (!form.productName.trim()) { setFormError('품명을 입력하세요.'); return; }
    for (const [lo, hi, label] of [['surfaceHardMin', 'surfaceHardMax', '표면경도'], ['coreHardMin', 'coreHardMax', '심부경도']]) {
      if (form[lo] !== '' && form[hi] !== '' && Number(form[lo]) > Number(form[hi])) {
        setFormError(`${label} 하한이 상한보다 큽니다.`);
        return;
      }
    }

    const payload = { ...form, vendorId: Number(form.vendorId) };
    NUMBER_FIELDS.forEach((k) => { payload[k] = num(form[k]); });

    setSaving(true);
    let productId;
    try {
      const res = editing
        ? await updateProduct(editing.productId, payload)
        : await createProduct({ ...payload, regUserName: user?.userName ?? '' });
      productId = res.data.productId;
    } catch (err) {
      setFormError(err.response?.data?.message ?? '저장에 실패했습니다.');
      setSaving(false);
      return;
    }

    // 이미지: ① 뺀 것 삭제 → ② 남긴 것 칸 재배치 → ③ 새 파일 업로드
    let failed = 0;
    try {
      const original = editing?.images ?? [];
      const kept = new Map();
      slots.forEach((s, i) => { if (s?.type === 'saved') kept.set(s.image.imageId, i + 1); });
      for (const img of original) {
        if (!kept.has(img.imageId)) await deleteImage(productId, img.imageId);
      }
      const order = [...kept].map(([imageId, slot]) => ({ imageId, slot }));
      if (order.some((o) => original.find((x) => x.imageId === o.imageId)?.slot !== o.slot)) {
        await reorderImages(productId, order);
      }
      for (let i = 0; i < MAX_IMAGES; i += 1) {
        const s = slots[i];
        if (s?.type !== 'new') continue;
        try {
          await uploadImage(productId, i + 1, s.file, s.thumb);
        } catch {
          failed += 1;
        }
      }
    } catch {
      failed += 1;
    }

    setSaving(false);
    revokeSlots(slots);
    setFormOpen(false);
    fetchRows();
    if (failed) {
      showToast(`제품은 저장됐지만 이미지 ${failed}건을 처리하지 못했습니다. 다시 시도해주세요.`, 'error');
    } else {
      showToast(editing ? '수정되었습니다.' : '등록되었습니다.');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) {
      showToast('삭제할 제품을 선택해주세요.', 'error');
      return;
    }
    if (!window.confirm(`선택한 ${selectedKeys.size}건과 등록된 이미지를 삭제하시겠습니까?\n단종된 제품이라면 삭제 대신 사용여부를 '미사용'으로 바꾸는 것을 권장합니다.`)) return;
    try {
      await deleteProducts(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchRows();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheetData = rows.map((r) => ({
      제품코드: r.productCode, 거래처코드: r.vendorCode, 거래처명: r.vendorName, 품번: r.partNo, 품명: r.productName,
      재질: r.material, 규격: r.spec, '장입량(kg)': r.chargeWeightKg ?? '', '중량(g)': r.unitWeightG ?? '',
      단가: r.unitPrice ?? '', 단가기준: r.priceUnit === 'EA' ? '개당' : 'kg당',
      표면경도: fmtHardness(r.surfaceHardMin, r.surfaceHardMax, r.surfaceHardUnit),
      심부경도: fmtHardness(r.coreHardMin, r.coreHardMax, r.coreHardUnit),
      이미지수: r.images?.length ?? 0, 사용여부: r.useYn === 'Y' ? '사용' : '미사용',
      등록일: (r.regDt || '').slice(0, 10), 비고: r.remark,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '제품');
    XLSX.writeFile(wb, `제품목록_${todayStr()}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 44, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'image', title: '이미지', width: 60, align: 'center', render: (r) => <ThumbCell product={r} onOpen={openViewer} /> },
    { key: 'productCode', title: '제품코드', width: 76, align: 'center', sortValue: (r) => r.productCode, render: (r) => <span className="prd-code">{r.productCode}</span> },
    { key: 'vendorName', title: '거래처', width: 104, sortValue: (r) => r.vendorName, render: (r) => <MetaText value={r.vendorName} /> },
    { key: 'partNo', title: '품번', width: 116, sortValue: (r) => r.partNo, render: (r) => <span className="prd-part" title={r.partNo}>{r.partNo}</span> },
    { key: 'productName', title: '품명', width: 136, sortValue: (r) => r.productName, render: (r) => <span className="prd-name" title={r.productName}>{r.productName}</span> },
    { key: 'material', title: '재질', width: 90, align: 'center', sortValue: (r) => r.material, render: (r) => <MetaText value={r.material} /> },
    { key: 'spec', title: '규격', width: 132, render: (r) => <MetaText value={r.spec} /> },
    // 표면/심부 경도를 한 칸에 두 줄로 — 칸 2개로 나누면 표가 화면보다 넓어져 재질·규격이 잘린다
    { key: 'hardness', title: '경도 기준', width: 136, render: (r) => <HardnessCell product={r} /> },
    { key: 'unitPrice', title: '단가', width: 92, align: 'right', sortValue: (r) => r.unitPrice, render: (r) => <span className="prd-price">{fmtPrice(r.unitPrice, r.priceUnit) || '-'}</span> },
    {
      key: 'useYn', title: '사용', width: 60, align: 'center', sortValue: (r) => r.useYn,
      render: (r) => (
        <span className={`mes-badge ${r.useYn === 'Y' ? 'mes-badge-success' : 'prd-badge-off'}`}>
          {r.useYn === 'Y' ? '사용' : '미사용'}
        </span>
      ),
    },
    { key: 'regDt', title: '등록일', width: 90, align: 'center', sortValue: (r) => r.regDt, render: (r) => <span className="prd-num">{(r.regDt || '').slice(0, 10)}</span> },
  ], [openViewer]);

  const count = chargeCount(form.chargeWeightKg, form.unitWeightG);

  return (
    <div className="mes-page prd-page mes-page-fill">
      <div className="prd-header-card">
        <div className="prd-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon">
              <IconPackage size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">제품관리</h2>
              <p className="mes-page-desc">거래처별 제품의 규격·경도 기준·단가와 제품 사진을 관리합니다. 행을 더블클릭하면 수정할 수 있습니다.</p>
            </div>
          </div>
          <button
            type="button"
            className="mes-btn mes-btn-primary"
            disabled={!permission.canCreate}
            title={!permission.canCreate ? '등록 권한이 없습니다' : undefined}
            onClick={openCreate}
          >
            <IconPlus size={15} /> 제품 등록
          </button>
        </div>

        <div className="prd-header-sep" />

        <div className="prd-header-controls">
          <select className="mes-field-inline prd-vendor-filter" value={vendorSel} onChange={(e) => setVendorSel(e.target.value)} aria-label="거래처">
            <option value="">전체 거래처</option>
            {filterVendors.map((v) => <option key={v.vendorId} value={v.vendorId}>{v.vendorName}</option>)}
          </select>
          <select className="mes-field-inline" value={useYnSel} onChange={(e) => setUseYnSel(e.target.value)} aria-label="사용여부">
            <option value="">전체 (사용/미사용)</option>
            <option value="Y">사용</option>
            <option value="N">미사용</option>
          </select>
          <input
            className="mes-field-inline prd-keyword"
            placeholder="품번·품명·제품코드"
            value={keywordSel}
            onChange={(e) => setKeywordSel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearch}>조회</button>
          <span className="prd-count">총 {rows.length}건</span>
          <div className="prd-header-spacer" />
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

      <div className="mes-card mes-card-fill prd-table-card">
        <div className="prd-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.productId}
            onRowDoubleClick={openEdit}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="등록된 제품이 없습니다."
          />
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? `제품 수정 — ${editing.productCode}` : '제품 등록'} onClose={closeForm} large className="prd-modal">
          <form onSubmit={handleSubmit} onPaste={handlePaste} className="prd-form">
            <h4 className="prd-form-section">기본 정보</h4>
            {/* 3열: [제품코드 | 거래처 | 사용여부] [품번 | 품명──] [재질 | 규격──] */}
            <div className="mes-form-grid prd-grid-3">
              <div className="mes-field">
                <label htmlFor="prd-code">제품코드</label>
                <input
                  id="prd-code"
                  value={form.productCode}
                  onChange={(e) => setField('productCode', e.target.value.toUpperCase())}
                  placeholder={editing ? '' : '비워두면 자동 채번 (P0001)'}
                  disabled={!!editing}
                  maxLength={20}
                />
              </div>
              <div className="mes-field">
                <label htmlFor="prd-vendor">거래처 *</label>
                <select id="prd-vendor" value={form.vendorId} onChange={(e) => setField('vendorId', e.target.value)}>
                  <option value="">선택하세요</option>
                  {vendorOptions.map((v) => (
                    <option key={v.vendorId} value={v.vendorId}>
                      {v.vendorName} ({v.vendorCode}){v.useYn !== 'Y' ? ' · 미사용' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mes-field">
                <label htmlFor="prd-use">사용여부</label>
                <select id="prd-use" value={form.useYn} onChange={(e) => setField('useYn', e.target.value)}>
                  <option value="Y">사용</option>
                  <option value="N">미사용</option>
                </select>
              </div>
              <div className="mes-field">
                <label htmlFor="prd-part">품번 *</label>
                <input id="prd-part" value={form.partNo} onChange={(e) => setField('partNo', e.target.value)} maxLength={50} autoFocus={!editing} />
              </div>
              <div className="mes-field prd-span-2">
                <label htmlFor="prd-name">품명 *</label>
                <input id="prd-name" value={form.productName} onChange={(e) => setField('productName', e.target.value)} maxLength={100} />
              </div>
              <div className="mes-field">
                <label htmlFor="prd-material">재질</label>
                <input id="prd-material" value={form.material} onChange={(e) => setField('material', e.target.value.toUpperCase())} placeholder="예) SCM415" maxLength={50} />
              </div>
              <div className="mes-field prd-span-2">
                <label htmlFor="prd-spec">규격</label>
                <input id="prd-spec" value={form.spec} onChange={(e) => setField('spec', e.target.value)} placeholder="예) Ø32 × 120" maxLength={100} />
              </div>
            </div>

            <h4 className="prd-form-section">장입 · 단가</h4>
            <div className="mes-form-grid prd-grid-3">
              <div className="mes-field">
                <label htmlFor="prd-charge">1회 장입량</label>
                <div className="prd-unit-input">
                  <input id="prd-charge" type="number" min="0" step="any" inputMode="decimal" value={form.chargeWeightKg} onChange={(e) => setField('chargeWeightKg', e.target.value)} />
                  <span>kg</span>
                </div>
              </div>
              <div className="mes-field">
                <label htmlFor="prd-weight">개당 중량</label>
                <div className="prd-unit-input">
                  <input id="prd-weight" type="number" min="0" step="any" inputMode="decimal" value={form.unitWeightG} onChange={(e) => setField('unitWeightG', e.target.value)} />
                  <span>g</span>
                </div>
              </div>
              <div className="mes-field">
                <label>1회 장입 수량</label>
                <div className="prd-computed" aria-live="polite">
                  {count != null ? <><strong>{count.toLocaleString()}</strong> 개</> : <span className="prd-empty">장입량·중량 입력 시 계산</span>}
                </div>
              </div>
              <div className="mes-field prd-span-2">
                <label htmlFor="prd-price">단가</label>
                <div className="prd-price-row">
                  <div className="prd-unit-input">
                    <input id="prd-price" type="number" min="0" step="any" inputMode="decimal" value={form.unitPrice} onChange={(e) => setField('unitPrice', e.target.value)} />
                    <span>원</span>
                  </div>
                  <div className="prd-segment" role="radiogroup" aria-label="단가 기준">
                    {[['KG', 'kg당'], ['EA', '개당']].map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={form.priceUnit === v}
                        className={form.priceUnit === v ? 'is-on' : ''}
                        onClick={() => setField('priceUnit', v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <h4 className="prd-form-section">경도 기준</h4>
            <div className="prd-hard-grid">
              {[
                ['표면경도 (퀜칭)', 'surfaceHardMin', 'surfaceHardMax', 'surfaceHardUnit'],
                ['심부경도', 'coreHardMin', 'coreHardMax', 'coreHardUnit'],
              ].map(([label, lo, hi, unit]) => (
                <div className="prd-hard-row" key={lo}>
                  <span className="prd-hard-label">{label}</span>
                  <input type="number" min="0" step="any" inputMode="decimal" value={form[lo]} onChange={(e) => setField(lo, e.target.value)} placeholder="하한" aria-label={`${label} 하한`} />
                  <span className="prd-hard-tilde">~</span>
                  <input type="number" min="0" step="any" inputMode="decimal" value={form[hi]} onChange={(e) => setField(hi, e.target.value)} placeholder="상한" aria-label={`${label} 상한`} />
                  <select value={form[unit]} onChange={(e) => setField(unit, e.target.value)} aria-label={`${label} 단위`}>
                    {HARDNESS_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <h4 className="prd-form-section">
              제품 이미지
              <span className="prd-form-section-hint">최대 5장 · 1번이 대표 이미지 · 끌어다 놓기나 Ctrl+V 붙여넣기도 됩니다</span>
            </h4>
            <div className="prd-slots">
              {slots.map((s, i) => (
                <div
                  key={i}
                  className={`prd-slot${s ? ' is-filled' : ''}${dragOverSlot === i ? ' is-dragover' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverSlot(i); }}
                  onDragLeave={() => setDragOverSlot((d) => (d === i ? null : d))}
                  onDrop={(e) => { e.preventDefault(); setDragOverSlot(null); addFiles(e.dataTransfer.files, i); }}
                >
                  {i === 0 && <span className="prd-slot-main">대표</span>}
                  {s ? (
                    <>
                      <button type="button" className="prd-slot-preview" onClick={() => openSlotViewer(i)} aria-label={`${i + 1}번 이미지 크게 보기`}>
                        <img src={s.type === 'saved' ? imageUrl(s.image.imageId, { thumb: true }) : s.preview} alt="" />
                      </button>
                      {s.type === 'new' && <span className="prd-slot-new">새 이미지</span>}
                      <div className="prd-slot-actions">
                        <button type="button" onClick={() => openSlotViewer(i)} title="크게 보기" aria-label="크게 보기"><IconArrowsMaximize size={14} /></button>
                        {i > 0 && <button type="button" onClick={() => makeMain(i)} title="대표 이미지로" aria-label="대표 이미지로"><IconStar size={14} /></button>}
                        <button type="button" onClick={() => pickFiles(i)} title="다른 이미지로 바꾸기" aria-label="다른 이미지로 바꾸기"><IconPhotoPlus size={14} /></button>
                        <button type="button" className="is-danger" onClick={() => removeSlot(i)} title="빼기" aria-label="빼기"><IconTrash size={14} /></button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="prd-slot-empty" onClick={() => pickFiles(i)}>
                      <IconPhotoPlus size={22} stroke={1.5} />
                      <span>{i + 1}번 이미지</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              hidden
              onChange={(e) => { addFiles(e.target.files, pickTargetRef.current); e.target.value = ''; }}
            />

            <div className="mes-field prd-remark">
              <label htmlFor="prd-remark">비고</label>
              <textarea id="prd-remark" rows={2} value={form.remark} onChange={(e) => setField('remark', e.target.value)} maxLength={300} />
            </div>

            {formError && <div className="mes-error" style={{ marginTop: 4 }}>{formError}</div>}
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={closeForm}>취소</button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}

      {viewer && (
        <ImageViewer images={viewer.images} startIndex={viewer.index} title={viewer.title} onClose={() => setViewer(null)} />
      )}

      <Toast toast={toast} />
    </div>
  );
}
