import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconDroplet, IconPlus, IconFileSpreadsheet, IconUpload, IconX, IconDownload } from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import {
  getList, getMchNames, createDoc, updateDoc, deleteDoc, previewFileUrl, downloadFileUrl,
} from '../../api/condition/oilAnalysisApi';
import './OilAnalysisPage.css';

const SLOT_LABELS = ['① 분석보고서', '② 냉각시험 그래프', '③ 기타파일1', '④ 기타파일2'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function twoYearsAgoStr() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MetaText({ value }) {
  return value ? <span className="oil-meta-text" title={value}>{value}</span> : <span className="oil-empty">-</span>;
}

function SlotText({ fileName, origFileName }) {
  return fileName
    ? <span className="oil-slot-present" title={origFileName}>{origFileName}</span>
    : <span className="oil-empty">-</span>;
}

const EMPTY_SLOTS = () => [0, 1, 2, 3].map(() => ({ kept: null, newFile: null }));
const EMPTY_FORM = { crDate: '', mchName: '', memo: '' };

function PdfSlotInput({ label, kept, newFile, onPick, onCancelNew, onPreviewKept }) {
  const inputRef = useRef(null);
  return (
    <div className="oil-slot-wrap">
      <label>{label}</label>
      <div className="oil-slot-box">
        {newFile ? (
          <>
            <span className="oil-slot-name" title={newFile.name}>{newFile.name}</span>
            <span className="oil-slot-size">{formatFileSize(newFile.size)}</span>
            <button type="button" className="oil-slot-btn" onClick={onCancelNew}><IconX size={13} /></button>
          </>
        ) : kept ? (
          <>
            <span className="oil-slot-name oil-slot-link" title={kept.origFileName} onClick={onPreviewKept}>
              {kept.origFileName}
            </span>
            <span className="oil-slot-size">{formatFileSize(kept.fileSize)}</span>
            <button type="button" className="oil-slot-btn oil-slot-replace" onClick={() => inputRef.current?.click()}>교체</button>
          </>
        ) : (
          <div className="oil-slot-empty" onClick={() => inputRef.current?.click()}>
            <IconUpload size={16} />
            <span>PDF 선택</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
    </div>
  );
}

export default function OilAnalysisPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mchOptions, setMchOptions] = useState([]);

  const [fromSel, setFromSel] = useState(twoYearsAgoStr());
  const [toSel, setToSel] = useState(todayStr());
  const [mchSel, setMchSel] = useState('');
  const [from, setFrom] = useState(twoYearsAgoStr());
  const [to, setTo] = useState(todayStr());
  const [mchName, setMchName] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slots, setSlots] = useState(EMPTY_SLOTS());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [previewInfo, setPreviewInfo] = useState(null);

  const { toast, showToast } = useToast();
  const permission = usePermission('/condition/oilAnalysis');

  const fetchList = useCallback(() => {
    setLoading(true);
    getList(from, to, mchName || undefined)
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, mchName]);

  const fetchMchNames = useCallback(() => {
    getMchNames().then((res) => setMchOptions(res.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchMchNames(); }, [fetchMchNames]);

  const handleSearch = () => {
    setFrom(fromSel);
    setTo(toSel);
    setMchName(mchSel);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, crDate: todayStr() });
    setSlots(EMPTY_SLOTS());
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = useCallback((doc) => {
    if (!permission.canUpdate) return;
    setEditing(doc);
    setForm({ crDate: doc.crDate || '', mchName: doc.mchName || '', memo: doc.memo || '' });
    setSlots([1, 2, 3, 4].map((n) => {
      const fileName = doc[`box${n}FileName`];
      const origFileName = doc[`box${n}OrigFileName`];
      const fileSize = doc[`box${n}FileSize`];
      return { kept: fileName ? { origFileName, fileSize } : null, newFile: null };
    }));
    setFormError('');
    setFormOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission.canUpdate]);

  const openPreviewFromRow = useCallback((rowData, slot) => {
    const fileName = rowData[`box${slot}FileName`];
    if (!fileName) return;
    setPreviewInfo({ id: rowData.id, slot, title: `${rowData.mchName} · ${rowData.crDate}` });
  }, []);

  const handlePickSlot = (index, file) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast(`업로드 파일은 PDF 형식만 가능합니다: ${file.name}`, 'error');
      return;
    }
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, newFile: file } : s)));
  };

  const handleCancelNewSlot = (index) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, newFile: null } : s)));
  };

  const handlePreviewKeptSlot = (index) => {
    if (!editing) return;
    setPreviewInfo({ id: editing.id, slot: index + 1, title: `${form.mchName} · ${form.crDate}` });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.crDate) { setFormError('채취일을 입력하세요.'); return; }
    if (!form.mchName.trim()) { setFormError('설비명을 입력하세요.'); return; }

    const fd = new FormData();
    fd.append('crDate', form.crDate);
    fd.append('mchName', form.mchName.trim());
    fd.append('memo', form.memo.trim());
    slots.forEach((s, i) => {
      if (s.newFile) fd.append(`box${i + 1}`, s.newFile);
    });

    setSaving(true);
    try {
      if (editing) {
        await updateDoc(editing.id, fd);
        showToast('수정되었습니다.');
      } else {
        await createDoc(fd);
        showToast('등록되었습니다.');
      }
      setFormOpen(false);
      fetchList();
      fetchMchNames();
    } catch (err) {
      setFormError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!window.confirm(`'${form.mchName}' (${form.crDate}) 기록을 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(editing.id);
      showToast('삭제되었습니다.');
      setFormOpen(false);
      fetchList();
    } catch (err) {
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheetData = rows.map((r) => ({
      채취일: r.crDate,
      설비명: r.mchName,
      비고: r.memo || '',
      분석보고서: r.box1OrigFileName || '',
      냉각시험그래프: r.box2OrigFileName || '',
      기타파일1: r.box3OrigFileName || '',
      기타파일2: r.box4OrigFileName || '',
      등록일: (r.regDt || '').slice(0, 10),
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '열처리유성상분석');
    XLSX.writeFile(wb, `열처리유성상분석_${from}~${to}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 50, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'crDate', title: '채취일', width: 110, align: 'center', sortValue: (r) => r.crDate, render: (r) => <MetaText value={r.crDate} /> },
    { key: 'mchName', title: '설비명', width: 170, sortValue: (r) => r.mchName, render: (r) => <span className="oil-mch-name" title={r.mchName}>{r.mchName}</span> },
    { key: 'box1FileName', title: '①분석', width: 250, render: (r) => <SlotText fileName={r.box1FileName} origFileName={r.box1OrigFileName} />, onCellClick: (r) => openPreviewFromRow(r, 1) },
    { key: 'box2FileName', title: '②냉각', width: 250, render: (r) => <SlotText fileName={r.box2FileName} origFileName={r.box2OrigFileName} />, onCellClick: (r) => openPreviewFromRow(r, 2) },
    { key: 'box3FileName', title: '③기타1', width: 250, render: (r) => <SlotText fileName={r.box3FileName} origFileName={r.box3OrigFileName} />, onCellClick: (r) => openPreviewFromRow(r, 3) },
    { key: 'box4FileName', title: '④기타2', width: 250, render: (r) => <SlotText fileName={r.box4FileName} origFileName={r.box4OrigFileName} />, onCellClick: (r) => openPreviewFromRow(r, 4) },
    { key: 'regDt', title: '등록일', width: 130, align: 'center', sortValue: (r) => r.regDt, render: (r) => <MetaText value={(r.regDt || '').slice(0, 10)} /> },
    { key: 'memo', title: '비고', width: 200, render: (r) => <MetaText value={r.memo} /> },
  ], [openPreviewFromRow]);

  return (
    <div className="mes-page oil-page mes-page-fill">
      <div className="oil-header-card">
        <div className="oil-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon oil-page-icon">
              <IconDroplet size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">열처리유성상분석</h2>
              <p className="mes-page-desc">열처리유(냉각유) 성상분석 보고서·그래프 파일을 기간별로 등록·조회합니다.</p>
            </div>
          </div>
          <button
            type="button"
            className="mes-btn mes-btn-primary"
            disabled={!permission.canCreate}
            title={!permission.canCreate ? '등록 권한이 없습니다' : undefined}
            onClick={openCreate}
          >
            <IconPlus size={15} /> 등록
          </button>
        </div>

        <div className="oil-header-sep" />

        <div className="oil-header-controls">
          <input type="date" className="mes-field-inline" value={fromSel} onChange={(e) => setFromSel(e.target.value)} />
          <span>~</span>
          <input type="date" className="mes-field-inline" value={toSel} onChange={(e) => setToSel(e.target.value)} />
          <select className="mes-field-inline" value={mchSel} onChange={(e) => setMchSel(e.target.value)}>
            <option value="">전체 설비</option>
            {mchOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearch}>조회</button>
          <span className="oil-doc-count">총 {rows.length}건</span>
          <div className="oil-header-spacer" />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleExportExcel}>
            <IconFileSpreadsheet size={15} /> 엑셀
          </button>
        </div>
      </div>

      <div className="mes-card mes-card-fill oil-table-card">
        <div className="oil-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.id}
            onRowDoubleClick={openEdit}
            loading={loading}
            emptyText="등록된 성상분석 기록이 없습니다."
          />
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? '성상분석 기록 수정' : '성상분석 기록 등록'} onClose={() => setFormOpen(false)} large>
          <form onSubmit={handleSubmit}>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>채취일 *</label>
                <input type="date" value={form.crDate} onChange={(e) => setForm({ ...form, crDate: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>설비명 *</label>
                <input value={form.mchName} onChange={(e) => setForm({ ...form, mchName: e.target.value })} placeholder="예) 열처리 연속로" />
              </div>
              <div className="mes-field mes-field-full">
                <label>비고</label>
                <textarea rows={2} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              </div>
            </div>

            <div className="oil-slot-grid">
              {SLOT_LABELS.map((label, i) => (
                <PdfSlotInput
                  key={label}
                  label={label}
                  kept={slots[i].kept}
                  newFile={slots[i].newFile}
                  onPick={(file) => handlePickSlot(i, file)}
                  onCancelNew={() => handleCancelNewSlot(i)}
                  onPreviewKept={() => handlePreviewKeptSlot(i)}
                />
              ))}
            </div>

            {formError && <div className="mes-error" style={{ marginTop: 4 }}>{formError}</div>}
            <div className="mes-modal-footer">
              {editing && permission.canDelete && (
                <button type="button" className="mes-btn mes-btn-danger" style={{ marginRight: 'auto' }} onClick={handleDelete}>
                  삭제
                </button>
              )}
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setFormOpen(false)}>취소</button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}

      {previewInfo && (
        <Modal
          title={previewInfo.title}
          onClose={() => setPreviewInfo(null)}
          xl
          footer={(
            <>
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setPreviewInfo(null)}>닫기</button>
              <a className="mes-btn mes-btn-primary" href={downloadFileUrl(previewInfo.id, previewInfo.slot)}>
                <IconDownload size={15} /> 다운로드
              </a>
            </>
          )}
        >
          <div className="oil-preview-body">
            <iframe title={previewInfo.title} src={previewFileUrl(previewInfo.id, previewInfo.slot)} className="oil-preview-iframe" />
          </div>
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
