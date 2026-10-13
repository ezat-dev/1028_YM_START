import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  IconTemperature, IconPlus, IconTrash, IconFileSpreadsheet, IconUpload, IconX,
  IconDownload, IconFileTypePdf, IconFileTypeDoc, IconFileTypeXls, IconPhoto, IconFile,
} from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import {
  getList, getEquipNames, getById, createController, updateController,
  deleteControllers, downloadFileUrl,
} from '../../api/condition/controllerApi';
import './ControllerPage.css';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - i);

const EMPTY_FORM = { calibYear: CURRENT_YEAR, equipName: '', zoneName: '', stdTemp: '', measTemp: '' };

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

function getExt(fileName) {
  if (!fileName || !fileName.includes('.')) return '';
  return fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
}

function docIcon(ext) {
  if (ext === 'pdf') return { Icon: IconFileTypePdf, color: '#d9483f' };
  if (ext === 'doc' || ext === 'docx') return { Icon: IconFileTypeDoc, color: '#3d6fd9' };
  if (ext === 'xls' || ext === 'xlsx') return { Icon: IconFileTypeXls, color: '#1f9d63' };
  if (IMAGE_EXTS.has(ext)) return { Icon: IconPhoto, color: '#b7791f' };
  return { Icon: IconFile, color: '#8a93a6' };
}

function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TempText({ value }) {
  return value === null || value === undefined
    ? <span className="ctrl-empty">-</span>
    : <span className="ctrl-num">{Number(value).toFixed(1)}°C</span>;
}

function DeviationText({ value }) {
  if (value === null || value === undefined) return <span className="ctrl-empty">-</span>;
  const n = Number(value);
  return <span className="ctrl-deviation">{n > 0 ? '+' : ''}{n.toFixed(1)}°C</span>;
}

function FileCountText({ count }) {
  const n = count || 0;
  return n === 0 ? <span className="ctrl-empty">-</span> : <span className="ctrl-file-count">{n}</span>;
}

function ZoneTag({ value }) {
  if (!value) return null;
  return (
    <span className="ctrl-zone-tag">
      <span className="ctrl-zone-dot" />
      {value}
    </span>
  );
}

function EquipText({ value }) {
  return <span className="ctrl-equip-name">{value}</span>;
}

function MetaText({ value }) {
  return value ? <span className="ctrl-meta-text" title={value}>{value}</span> : <span className="ctrl-empty">-</span>;
}

function FileDropZone({ label, keptFiles, newFiles, onRemoveKept, onRemoveNew, onAddFiles }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const empty = keptFiles.length === 0 && newFiles.length === 0;

  return (
    <div className="ctrl-dropzone-wrap">
      <label>{label}</label>
      <div
        className={`ctrl-dropzone${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          // dataTransfer.files/target.files는 input의 실시간 FileList라서, 이후 value를 비우면
          // (혹은 드롭 이벤트 자체가 끝나면) 그 참조가 무효화될 수 있다 — 즉시 배열로 스냅샷을 떠서 넘긴다.
          if (e.dataTransfer.files?.length) onAddFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
      >
        <IconUpload size={20} />
        <span>파일을 끌어다 놓거나 클릭하여 선택</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = e.target.files?.length ? Array.from(e.target.files) : null;
          e.target.value = '';
          if (files) onAddFiles(files);
        }}
      />
      <ul className="ctrl-file-list">
        {empty && <li className="ctrl-file-empty">첨부된 파일이 없습니다.</li>}
        {keptFiles.map((f) => (
          <li key={`kept-${f.id}`}>
            <span className="ctrl-file-name" title={f.origFileName}>{f.origFileName}</span>
            <span className="ctrl-file-size">{formatFileSize(f.fileSize)}</span>
            <button type="button" onClick={() => onRemoveKept(f.id)}><IconX size={13} /></button>
          </li>
        ))}
        {newFiles.map((f, i) => (
          <li key={`new-${i}`} className="ctrl-file-new">
            <span className="ctrl-file-name" title={f.name}>{f.name}</span>
            <span className="ctrl-file-size">{formatFileSize(f.size)}</span>
            <button type="button" onClick={() => onRemoveNew(i)}><IconX size={13} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ControllerPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [equipOptions, setEquipOptions] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const [yearSel, setYearSel] = useState(CURRENT_YEAR);
  const [equipSel, setEquipSel] = useState('');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [equipName, setEquipName] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [h1Kept, setH1Kept] = useState([]);
  const [h2Kept, setH2Kept] = useState([]);
  const [h1New, setH1New] = useState([]);
  const [h2New, setH2New] = useState([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [fileListModal, setFileListModal] = useState(null);

  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/condition/controller');

  const fetchList = useCallback(() => {
    setLoading(true);
    getList(year, equipName || undefined)
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, equipName]);

  const fetchEquipNames = useCallback(() => {
    getEquipNames().then((res) => setEquipOptions(res.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchEquipNames(); }, [fetchEquipNames]);

  const handleSearch = () => {
    setYear(yearSel);
    setEquipName(equipSel);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, calibYear: yearSel });
    setH1Kept([]); setH2Kept([]); setH1New([]); setH2New([]);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = useCallback(async (id) => {
    try {
      const res = await getById(id);
      const d = res.data;
      setEditing(d);
      setForm({
        calibYear: d.calibYear,
        equipName: d.equipName ?? '',
        zoneName: d.zoneName ?? '',
        stdTemp: d.stdTemp ?? '',
        measTemp: d.measTemp ?? '',
      });
      setH1Kept(d.h1Files ?? []);
      setH2Kept(d.h2Files ?? []);
      setH1New([]); setH2New([]);
      setFormError('');
      setFormOpen(true);
    } catch (err) {
      showToast('상세 조회에 실패했습니다.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRowDblClick = useCallback((rowData) => {
    if (!permission.canUpdate) return;
    openEdit(rowData.id);
  }, [permission.canUpdate, openEdit]);

  const openFileList = useCallback(async (rowData, half) => {
    const count = half === 'H1' ? rowData.h1FileCount : rowData.h2FileCount;
    if (!count) return;
    try {
      const res = await getById(rowData.id);
      const d = res.data;
      setFileListModal({ half, files: (half === 'H1' ? d.h1Files : d.h2Files) ?? [] });
    } catch (err) {
      showToast('파일 목록을 불러오지 못했습니다.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deviationPreview = useMemo(() => {
    const std = parseFloat(form.stdTemp);
    const meas = parseFloat(form.measTemp);
    if (Number.isNaN(std) || Number.isNaN(meas)) return '';
    const dev = meas - std;
    return `${dev > 0 ? '+' : ''}${dev.toFixed(2)}`;
  }, [form.stdTemp, form.measTemp]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.equipName.trim()) { setFormError('설비명을 입력하세요.'); return; }
    if (!form.zoneName.trim()) { setFormError('구분값(존 위치)을 입력하세요.'); return; }

    const fd = new FormData();
    fd.append('calibYear', form.calibYear);
    fd.append('equipName', form.equipName.trim());
    fd.append('zoneName', form.zoneName.trim());
    if (form.stdTemp !== '' && form.stdTemp !== null) fd.append('stdTemp', form.stdTemp);
    if (form.measTemp !== '' && form.measTemp !== null) fd.append('measTemp', form.measTemp);
    h1New.forEach((f) => fd.append('h1Files', f));
    h2New.forEach((f) => fd.append('h2Files', f));

    setSaving(true);
    try {
      if (editing) {
        [...h1Kept, ...h2Kept].forEach((f) => fd.append('keepFileIds', f.id));
        await updateController(editing.id, fd);
        showToast('수정되었습니다.');
      } else {
        fd.append('regUserName', user?.userName ?? '');
        await createController(fd);
        showToast('등록되었습니다.');
      }
      setFormOpen(false);
      fetchList();
      fetchEquipNames();
    } catch (err) {
      setFormError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) {
      showToast('삭제할 행을 선택해주세요.', 'error');
      return;
    }
    if (!window.confirm(`선택한 ${selectedKeys.size}건을 삭제하시겠습니까?`)) return;
    try {
      await deleteControllers(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchList();
    } catch (err) {
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheetData = rows.map((r) => ({
      연도: r.calibYear,
      설비명: r.equipName,
      구분값: r.zoneName,
      표준온도: r.stdTemp ?? '',
      실측온도: r.measTemp ?? '',
      편차: r.deviation ?? '',
      상반기파일수: r.h1FileCount ?? 0,
      하반기파일수: r.h2FileCount ?? 0,
      등록일: (r.regDt || '').slice(0, 10),
      등록자: r.regUserName,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}년`);
    XLSX.writeFile(wb, `조절계관리_${year}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 50, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'equipName', title: '설비명', width: 150, sortValue: (r) => r.equipName, render: (r) => <EquipText value={r.equipName} /> },
    { key: 'zoneName', title: '구분값', width: 140, sortValue: (r) => r.zoneName, render: (r) => <ZoneTag value={r.zoneName} /> },
    { key: 'stdTemp', title: '표준온도', width: 100, align: 'right', render: (r) => <TempText value={r.stdTemp} /> },
    { key: 'measTemp', title: '실측온도', width: 100, align: 'right', render: (r) => <TempText value={r.measTemp} /> },
    { key: 'deviation', title: '편차', width: 90, align: 'right', render: (r) => <DeviationText value={r.deviation} /> },
    {
      key: 'h1FileCount', title: '상반기', width: 80, align: 'center',
      render: (r) => <FileCountText count={r.h1FileCount} />,
      onCellClick: (r) => openFileList(r, 'H1'),
    },
    {
      key: 'h2FileCount', title: '하반기', width: 80, align: 'center',
      render: (r) => <FileCountText count={r.h2FileCount} />,
      onCellClick: (r) => openFileList(r, 'H2'),
    },
    { key: 'regDt', title: '등록일', width: 100, align: 'center', sortValue: (r) => r.regDt, render: (r) => <MetaText value={(r.regDt || '').slice(0, 10)} /> },
    { key: 'regUserName', title: '등록자', width: 110, align: 'center', render: (r) => <MetaText value={r.regUserName} /> },
  ], [openFileList]);

  return (
    <div className="mes-page ctrl-page mes-page-fill">
      <div className="ctrl-header-card">
        <div className="ctrl-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon ctrl-page-icon">
              <IconTemperature size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">조절계 관리</h2>
              <p className="mes-page-desc">설비별 온도조절계 정도검사(교정) 이력을 연도·설비 단위로 관리합니다.</p>
            </div>
          </div>
          <button
            type="button"
            className="mes-btn mes-btn-primary"
            disabled={!permission.canCreate}
            title={!permission.canCreate ? '등록 권한이 없습니다' : undefined}
            onClick={openCreate}
          >
            <IconPlus size={15} /> 추가
          </button>
        </div>

        <div className="ctrl-header-sep" />

        <div className="ctrl-header-controls">
          <select className="mes-field-inline" value={yearSel} onChange={(e) => setYearSel(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="mes-field-inline" value={equipSel} onChange={(e) => setEquipSel(e.target.value)}>
            <option value="">전체 설비</option>
            {equipOptions.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearch}>조회</button>
          <span className="ctrl-doc-count">총 {rows.length}건</span>
          <div className="ctrl-header-spacer" />
          {permission.canDelete && (
            <button type="button" className="mes-btn mes-btn-danger" onClick={handleDeleteSelected}>
              <IconTrash size={15} /> 선택 삭제
            </button>
          )}
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleExportExcel}>
            <IconFileSpreadsheet size={15} /> 엑셀
          </button>
        </div>
      </div>

      <div className="mes-card mes-card-fill ctrl-table-card">
        <div className="ctrl-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.id}
            onRowDoubleClick={handleRowDblClick}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="등록된 정도검사 기록이 없습니다."
          />
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? '정도검사 기록 수정' : '정도검사 기록 등록'} onClose={() => setFormOpen(false)} large>
          <form onSubmit={handleSubmit}>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>연도 *</label>
                <select value={form.calibYear} onChange={(e) => setForm({ ...form, calibYear: Number(e.target.value) })}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
              </div>
              <div className="mes-field">
                <label>설비명 *</label>
                <input value={form.equipName} onChange={(e) => setForm({ ...form, equipName: e.target.value })} placeholder="예) BCF1" />
              </div>
              <div className="mes-field mes-field-full">
                <label>구분값(존 위치) *</label>
                <input value={form.zoneName} onChange={(e) => setForm({ ...form, zoneName: e.target.value })} placeholder="예) 1존" />
              </div>
              <div className="mes-field">
                <label>표준온도(℃)</label>
                <input type="number" step="0.1" value={form.stdTemp} onChange={(e) => setForm({ ...form, stdTemp: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>실측온도(℃)</label>
                <input type="number" step="0.1" value={form.measTemp} onChange={(e) => setForm({ ...form, measTemp: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>편차(℃)</label>
                <input value={deviationPreview} disabled placeholder="자동 계산" />
                <span className="mes-hint">저장 시 서버에서 실측−표준으로 다시 계산됩니다.</span>
              </div>
            </div>

            <div className="ctrl-dropzone-grid">
              <FileDropZone
                label="상반기(H1) 첨부파일"
                keptFiles={h1Kept}
                newFiles={h1New}
                onRemoveKept={(id) => setH1Kept((prev) => prev.filter((f) => f.id !== id))}
                onRemoveNew={(i) => setH1New((prev) => prev.filter((_, idx) => idx !== i))}
                onAddFiles={(fileList) => setH1New((prev) => [...prev, ...Array.from(fileList)])}
              />
              <FileDropZone
                label="하반기(H2) 첨부파일"
                keptFiles={h2Kept}
                newFiles={h2New}
                onRemoveKept={(id) => setH2Kept((prev) => prev.filter((f) => f.id !== id))}
                onRemoveNew={(i) => setH2New((prev) => prev.filter((_, idx) => idx !== i))}
                onAddFiles={(fileList) => setH2New((prev) => [...prev, ...Array.from(fileList)])}
              />
            </div>

            {formError && <div className="mes-error" style={{ marginTop: 4 }}>{formError}</div>}
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setFormOpen(false)}>취소</button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}

      {fileListModal && (
        <Modal title={`${fileListModal.half === 'H1' ? '상반기' : '하반기'} 첨부파일`} onClose={() => setFileListModal(null)}>
          <ul className="ctrl-filelist-modal">
            {fileListModal.files.length === 0 && <li className="ctrl-file-empty">첨부된 파일이 없습니다.</li>}
            {fileListModal.files.map((f) => {
              const ext = getExt(f.origFileName);
              const { Icon, color } = docIcon(ext);
              return (
                <li key={f.id} className="ctrl-filelist-row">
                  <Icon size={20} style={{ color }} />
                  <span className="ctrl-filelist-name" title={f.origFileName}>{f.origFileName}</span>
                  <span className="ctrl-filelist-size">{formatFileSize(f.fileSize)}</span>
                  <a className="mes-btn mes-btn-secondary" href={downloadFileUrl(f.id)}>
                    <IconDownload size={13} /> 다운로드
                  </a>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
