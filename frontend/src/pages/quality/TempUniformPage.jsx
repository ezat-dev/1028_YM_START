import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  IconGauge, IconPlus, IconTrash, IconFileSpreadsheet, IconUpload, IconX,
  IconDownload, IconFileTypePdf, IconPrinter, IconSearch,
} from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import {
  getList, getEquipNames, getById, createTempUniform, updateTempUniform,
  deleteTempUniform, previewFileUrl, downloadFileUrl,
} from '../../api/quality/tempUniformApi';
import './TempUniformPage.css';

const EMPTY_FORM = {
  equipName: '', surveyDate: '', setTemp: '', maxTemp: '', minTemp: '', tolerance: '10',
  inspector: '', remark: '',
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function EquipText({ value }) {
  return <span className="tu-equip-name">{value}</span>;
}

function TempText({ value, unit = true }) {
  if (value === null || value === undefined) return <span className="tu-empty">-</span>;
  return <span className="tu-num">{Number(value).toFixed(1)}{unit ? '℃' : ''}</span>;
}

function DeviationText({ value }) {
  if (value === null || value === undefined) return <span className="tu-empty">-</span>;
  return <span className="tu-deviation">±{Number(value).toFixed(1)}℃</span>;
}

function JudgmentTag({ value }) {
  if (!value) return <span className="tu-empty">-</span>;
  const pass = value === '합격';
  return (
    <span className={`tu-judgment-tag ${pass ? 'pass' : 'fail'}`}>
      <span className="tu-judgment-dot" />
      {value}
    </span>
  );
}

function MetaText({ value }) {
  return value ? <span className="tu-meta-text" title={value}>{value}</span> : <span className="tu-empty">-</span>;
}

function FileCell({ row, onView }) {
  if (!row.fileName) return <span className="tu-empty">-</span>;
  return (
    <button type="button" className="tu-file-chip" title={row.origFileName} onClick={() => onView(row)}>
      <IconFileTypePdf size={15} />
      <span>{row.origFileName}</span>
    </button>
  );
}

export default function TempUniformPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [equipOptions, setEquipOptions] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const [equipSel, setEquipSel] = useState('');
  const [judgmentSel, setJudgmentSel] = useState('');
  const [fromSel, setFromSel] = useState('');
  const [toSel, setToSel] = useState('');
  const [equipName, setEquipName] = useState('');
  const [judgment, setJudgment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fileKept, setFileKept] = useState(null);
  const [fileNew, setFileNew] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [viewerFile, setViewerFile] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);

  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/quality/tempUniform');
  const fileInputRef = useRef(null);

  const fetchList = useCallback(() => {
    setLoading(true);
    getList(equipName || undefined, judgment || undefined, from || undefined, to || undefined)
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipName, judgment, from, to]);

  const fetchEquipNames = useCallback(() => {
    getEquipNames().then((res) => setEquipOptions(res.data ?? [])).catch(() => {});
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchEquipNames(); }, [fetchEquipNames]);

  const handleSearch = () => {
    setEquipName(equipSel);
    setJudgment(judgmentSel);
    setFrom(fromSel);
    setTo(toSel);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, surveyDate: todayStr() });
    setFileKept(null);
    setFileNew(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = useCallback(async (id) => {
    try {
      const res = await getById(id);
      const d = res.data;
      setEditing(d);
      setForm({
        equipName: d.equipName ?? '',
        surveyDate: d.surveyDate ?? '',
        setTemp: d.setTemp ?? '',
        maxTemp: d.maxTemp ?? '',
        minTemp: d.minTemp ?? '',
        tolerance: d.tolerance ?? '10',
        inspector: d.inspector ?? '',
        remark: d.remark ?? '',
      });
      setFileKept(d.fileName ? { fileName: d.fileName, origFileName: d.origFileName, fileSize: d.fileSize } : null);
      setFileNew(null);
      setFormError('');
      setFormOpen(true);
    } catch (err) {
      showToast('상세 조회에 실패했습니다.', 'error');
    }
  }, [showToast]);

  const handleRowDblClick = useCallback((rowData) => {
    if (!permission.canUpdate) return;
    openEdit(rowData.id);
  }, [permission.canUpdate, openEdit]);

  const deviationPreview = useMemo(() => {
    const set = parseFloat(form.setTemp);
    const max = parseFloat(form.maxTemp);
    const min = parseFloat(form.minTemp);
    const tol = parseFloat(form.tolerance);
    if ([set, max, min].some(Number.isNaN)) return null;
    const dev = Math.max(Math.abs(max - set), Math.abs(min - set));
    const pass = Number.isNaN(tol) ? null : dev <= tol;
    return { dev, pass };
  }, [form.setTemp, form.maxTemp, form.minTemp, form.tolerance]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.equipName.trim()) { setFormError('설비명을 입력하세요.'); return; }
    if (!form.surveyDate) { setFormError('조사일자를 입력하세요.'); return; }
    if (form.setTemp === '' || form.maxTemp === '' || form.minTemp === '') {
      setFormError('설정온도·최고·최저 측정값을 입력하세요.');
      return;
    }

    const fd = new FormData();
    fd.append('equipName', form.equipName.trim());
    fd.append('surveyDate', form.surveyDate);
    fd.append('setTemp', form.setTemp);
    fd.append('maxTemp', form.maxTemp);
    fd.append('minTemp', form.minTemp);
    fd.append('tolerance', form.tolerance === '' ? '10' : form.tolerance);
    fd.append('inspector', form.inspector.trim());
    fd.append('remark', form.remark.trim());
    if (fileNew) fd.append('file', fileNew);

    setSaving(true);
    try {
      if (editing) {
        await updateTempUniform(editing.id, fd);
        showToast('수정되었습니다.');
      } else {
        fd.append('regUserName', user?.userName ?? '');
        await createTempUniform(fd);
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
      await Promise.all(Array.from(selectedKeys).map((id) => deleteTempUniform(id)));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchList();
    } catch (err) {
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheetData = rows.map((r) => ({
      설비명: r.equipName,
      조사일자: r.surveyDate,
      설정온도: r.setTemp,
      최고: r.maxTemp,
      최저: r.minTemp,
      허용오차: r.tolerance,
      편차: r.deviation,
      판정: r.judgment,
      검사자: r.inspector,
      등록일: (r.regDt || '').slice(0, 10),
      등록자: r.regUserName,
      비고: r.remark,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
      { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '온도균일성조사');
    XLSX.writeFile(wb, `온도균일성조사보고서_${todayStr()}.xlsx`);
  };

  const summary = useMemo(() => {
    const pass = rows.filter((r) => r.judgment === '합격').length;
    const fail = rows.length - pass;
    return { total: rows.length, pass, fail };
  }, [rows]);

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 50, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'equipName', title: '설비명', width: 150, sortValue: (r) => r.equipName, render: (r) => <EquipText value={r.equipName} /> },
    { key: 'surveyDate', title: '조사일자', width: 100, align: 'center', sortValue: (r) => r.surveyDate, render: (r) => <MetaText value={r.surveyDate} /> },
    { key: 'setTemp', title: '설정온도', width: 90, align: 'right', render: (r) => <TempText value={r.setTemp} /> },
    { key: 'maxTemp', title: '최고', width: 80, align: 'right', render: (r) => <TempText value={r.maxTemp} /> },
    { key: 'minTemp', title: '최저', width: 80, align: 'right', render: (r) => <TempText value={r.minTemp} /> },
    { key: 'deviation', title: '편차', width: 90, align: 'right', render: (r) => <DeviationText value={r.deviation} /> },
    { key: 'judgment', title: '판정', width: 90, align: 'center', sortValue: (r) => r.judgment, render: (r) => <JudgmentTag value={r.judgment} /> },
    { key: 'inspector', title: '검사자', width: 90, align: 'center', render: (r) => <MetaText value={r.inspector} /> },
    { key: 'fileName', title: '성적서', width: 200, render: (r) => <FileCell row={r} onView={(row) => setViewerFile(row)} /> },
    { key: 'regDt', title: '등록일', width: 100, align: 'center', sortValue: (r) => r.regDt, render: (r) => <MetaText value={(r.regDt || '').slice(0, 10)} /> },
    { key: 'remark', title: '비고', width: 200, render: (r) => <MetaText value={r.remark} /> },
  ], []);

  return (
    <div className="mes-page tu-page mes-page-fill">
      <div className="tu-header-card">
        <div className="tu-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon tu-page-icon">
              <IconGauge size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">온도균일성보고서</h2>
              <p className="mes-page-desc">로(furnace) 유효작업구역 온도균일성조사(TUS) 기록을 관리합니다.</p>
            </div>
          </div>
          <div className="tu-header-actions">
            <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setPrintOpen(true)}>
              <IconPrinter size={15} /> 인쇄
            </button>
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
        </div>

        <div className="tu-header-sep" />

        <div className="tu-header-controls">
          <select className="mes-field-inline" value={equipSel} onChange={(e) => setEquipSel(e.target.value)}>
            <option value="">전체 설비</option>
            {equipOptions.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="mes-field-inline" value={judgmentSel} onChange={(e) => setJudgmentSel(e.target.value)}>
            <option value="">전체 판정</option>
            <option value="합격">합격</option>
            <option value="불합격">불합격</option>
          </select>
          <input type="date" className="mes-field-inline" value={fromSel} onChange={(e) => setFromSel(e.target.value)} />
          <span className="tu-range-sep">~</span>
          <input type="date" className="mes-field-inline" value={toSel} onChange={(e) => setToSel(e.target.value)} />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearch}>
            <IconSearch size={15} /> 조회
          </button>
          <span className="tu-doc-count">
            총 {summary.total}건 · <span className="tu-count-pass">합격 {summary.pass}</span> · <span className="tu-count-fail">불합격 {summary.fail}</span>
          </span>
          <div className="tu-header-spacer" />
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

      <div className="mes-card mes-card-fill tu-table-card">
        <div className="tu-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.id}
            onRowDoubleClick={handleRowDblClick}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="등록된 온도균일성조사 기록이 없습니다."
          />
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? '온도균일성조사 기록 수정' : '온도균일성조사 기록 등록'} onClose={() => setFormOpen(false)} large>
          <form onSubmit={handleSubmit}>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>설비명 *</label>
                <input value={form.equipName} onChange={(e) => setForm({ ...form, equipName: e.target.value })} placeholder="예) 소입로 1호기" />
              </div>
              <div className="mes-field">
                <label>조사일자 *</label>
                <input type="date" value={form.surveyDate} onChange={(e) => setForm({ ...form, surveyDate: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>설정온도(℃) *</label>
                <input type="number" step="0.1" value={form.setTemp} onChange={(e) => setForm({ ...form, setTemp: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>허용오차(±℃)</label>
                <input type="number" step="0.1" value={form.tolerance} onChange={(e) => setForm({ ...form, tolerance: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>최고 측정값(℃) *</label>
                <input type="number" step="0.1" value={form.maxTemp} onChange={(e) => setForm({ ...form, maxTemp: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>최저 측정값(℃) *</label>
                <input type="number" step="0.1" value={form.minTemp} onChange={(e) => setForm({ ...form, minTemp: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>편차 / 판정</label>
                <div className="tu-preview-box">
                  {deviationPreview ? (
                    <>
                      <span className="tu-num">±{deviationPreview.dev.toFixed(1)}℃</span>
                      {deviationPreview.pass !== null && (
                        <span className={`tu-judgment-tag ${deviationPreview.pass ? 'pass' : 'fail'}`}>
                          <span className="tu-judgment-dot" />
                          {deviationPreview.pass ? '합격' : '불합격'}
                        </span>
                      )}
                    </>
                  ) : <span className="mes-hint">측정값을 입력하면 자동 계산됩니다</span>}
                </div>
              </div>
              <div className="mes-field">
                <label>검사자</label>
                <input value={form.inspector} onChange={(e) => setForm({ ...form, inspector: e.target.value })} />
              </div>
              <div className="mes-field mes-field-full">
                <label>비고</label>
                <input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
              </div>
            </div>

            <div className="tu-dropzone-wrap">
              <label>성적서 첨부(PDF)</label>
              <div
                className="tu-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFileNew(f);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <IconUpload size={20} />
                <span>PDF 파일을 끌어다 놓거나 클릭하여 선택</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) setFileNew(f);
                }}
              />
              {(fileKept || fileNew) && (
                <ul className="tu-file-list">
                  {fileNew ? (
                    <li className="tu-file-new">
                      <IconFileTypePdf size={16} />
                      <span className="tu-file-name" title={fileNew.name}>{fileNew.name}</span>
                      <span className="tu-file-size">{formatFileSize(fileNew.size)}</span>
                      <button type="button" onClick={() => setFileNew(null)}><IconX size={13} /></button>
                    </li>
                  ) : (
                    <li>
                      <IconFileTypePdf size={16} />
                      <span className="tu-file-name" title={fileKept.origFileName}>{fileKept.origFileName}</span>
                      <span className="tu-file-size">{formatFileSize(fileKept.fileSize)}</span>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {formError && <div className="mes-error" style={{ marginTop: 4 }}>{formError}</div>}
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setFormOpen(false)}>취소</button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}

      {viewerFile && (
        <Modal title={viewerFile.origFileName} onClose={() => setViewerFile(null)} xl>
          <div className="tu-viewer-toolbar">
            <a className="mes-btn mes-btn-secondary" href={downloadFileUrl(viewerFile.id)}>
              <IconDownload size={13} /> 다운로드
            </a>
          </div>
          <iframe title="성적서" src={previewFileUrl(viewerFile.id)} className="tu-viewer-iframe" />
        </Modal>
      )}

      {printOpen && (
        <PrintPreview
          rows={rows}
          filters={{ equipName, judgment, from, to }}
          summary={summary}
          onClose={() => setPrintOpen(false)}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

function PrintPreview({ rows, filters, summary, onClose }) {
  const now = useMemo(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const scopeLabel = useMemo(() => {
    const parts = [];
    parts.push(filters.equipName ? filters.equipName : '전체 설비');
    if (filters.judgment) parts.push(filters.judgment);
    if (filters.from || filters.to) parts.push(`${filters.from || '전체'} ~ ${filters.to || '전체'}`);
    return parts.join(' · ');
  }, [filters]);

  return (
    <Modal title="온도균일성조사보고서 인쇄 미리보기" onClose={onClose} xl>
      <div className="tu-print-toolbar">
        <span className="mes-hint">현재 조회된 {rows.length}건이 인쇄됩니다.</span>
        <button type="button" className="mes-btn mes-btn-primary" onClick={() => window.print()}>
          <IconPrinter size={15} /> 인쇄
        </button>
      </div>

      <div className="tu-print-sheet">
        <div className="tu-print-header">
          <h1>온도균일성조사보고서 관리대장</h1>
          <p className="tu-print-subtitle">Temperature Uniformity Survey Log</p>
        </div>

        <div className="tu-print-meta">
          <div><span>조회 범위</span><strong>{scopeLabel}</strong></div>
          <div><span>총 건수</span><strong>{summary.total}건 (합격 {summary.pass} · 불합격 {summary.fail})</strong></div>
          <div><span>출력일시</span><strong>{now}</strong></div>
        </div>

        <table className="tu-print-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }}>No</th>
              <th style={{ width: '16%' }}>설비명</th>
              <th style={{ width: '10%' }}>조사일자</th>
              <th style={{ width: '9%' }}>설정온도</th>
              <th style={{ width: '8%' }}>최고</th>
              <th style={{ width: '8%' }}>최저</th>
              <th style={{ width: '8%' }}>편차</th>
              <th style={{ width: '8%' }}>판정</th>
              <th style={{ width: '10%' }}>검사자</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} className="tu-print-empty">조회된 기록이 없습니다.</td></tr>
            )}
            {rows.map((r, idx) => (
              <tr key={r.id}>
                <td className="tu-print-center">{idx + 1}</td>
                <td>{r.equipName}</td>
                <td className="tu-print-center">{r.surveyDate}</td>
                <td className="tu-print-num">{Number(r.setTemp).toFixed(1)}</td>
                <td className="tu-print-num">{Number(r.maxTemp).toFixed(1)}</td>
                <td className="tu-print-num">{Number(r.minTemp).toFixed(1)}</td>
                <td className="tu-print-num">±{Number(r.deviation).toFixed(1)}</td>
                <td className={`tu-print-center tu-print-judgment ${r.judgment === '합격' ? 'pass' : 'fail'}`}>{r.judgment}</td>
                <td className="tu-print-center">{r.inspector}</td>
                <td>{r.remark}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="tu-print-sign">
          <div><span>작성</span><em /></div>
          <div><span>검토</span><em /></div>
          <div><span>승인</span><em /></div>
        </div>
      </div>
    </Modal>
  );
}
