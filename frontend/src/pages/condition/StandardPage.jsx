import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconBooks, IconPlus, IconSearch, IconEye, IconDownload, IconEdit, IconTrash,
  IconFileTypePdf, IconFileTypeDoc, IconFileTypeXls, IconPhoto, IconFile,
} from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { getList, createDoc, updateDoc, deleteDoc, previewUrl, downloadUrl } from '../../api/condition/standardApi';
import './StandardPage.css';

const CATEGORY_TABS = [
  { value: '', label: '전체' },
  { value: '관리계획서', label: '관리계획서' },
  { value: '작업표준서', label: '작업표준서' },
];

const EMPTY_FORM = { docTitle: '', docCategory: '작업표준서', equipName: '', revNo: '', effectiveDate: '', remark: '' };

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

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function StandardPage() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [keyword, setKeyword] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formFile, setFormFile] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [previewDoc, setPreviewDoc] = useState(null);

  const { toast, showToast } = useToast();
  const permission = usePermission('/condition/standard');

  const fetchList = useCallback(() => {
    setLoading(true);
    getList(category || undefined, undefined)
      .then((res) => setDocs(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const filteredDocs = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return docs;
    return docs.filter((d) =>
      (d.docTitle || '').toLowerCase().includes(k) || (d.equipName || '').toLowerCase().includes(k));
  }, [docs, keyword]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, effectiveDate: todayStr() });
    setFormFile(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (doc) => {
    setEditing(doc);
    setForm({
      docTitle: doc.docTitle ?? '',
      docCategory: doc.docCategory ?? '작업표준서',
      equipName: doc.equipName ?? '',
      revNo: doc.revNo ?? '',
      effectiveDate: doc.effectiveDate ?? '',
      remark: doc.remark ?? '',
    });
    setFormFile(null);
    setFormError('');
    setFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.docTitle.trim()) { setFormError('문서명을 입력하세요.'); return; }
    if (!editing && !formFile) { setFormError('첨부할 파일을 선택하세요.'); return; }

    const fd = new FormData();
    fd.append('docTitle', form.docTitle.trim());
    fd.append('docCategory', form.docCategory);
    fd.append('equipName', form.equipName.trim());
    fd.append('revNo', form.revNo.trim());
    fd.append('effectiveDate', form.effectiveDate);
    fd.append('remark', form.remark.trim());
    if (formFile) fd.append('file', formFile);

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
    } catch (err) {
      setFormError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`'${doc.docTitle}' 문서를 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc.id);
      showToast('삭제되었습니다.');
      fetchList();
    } catch (err) {
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const previewExt = previewDoc ? getExt(previewDoc.origFileName) : '';

  return (
    <div className="mes-page std-page">
      <div className="std-header-card">
        <div className="std-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon std-page-icon">
              <IconBooks size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">관리계획서 및 작업표준서</h2>
              <p className="mes-page-desc">설비별 관리계획서·작업표준서 문서를 등록하고 미리보기·다운로드할 수 있습니다.</p>
            </div>
          </div>
          <button
            type="button"
            className="mes-btn mes-btn-primary"
            disabled={!permission.canCreate}
            title={!permission.canCreate ? '등록 권한이 없습니다' : undefined}
            onClick={openCreate}
          >
            <IconPlus size={15} /> 문서 등록
          </button>
        </div>

        <div className="std-header-sep" />

        <div className="std-header-controls">
          <div className="std-tabs">
            {CATEGORY_TABS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`std-tab${category === c.value ? ' active' : ''}`}
                onClick={() => setCategory(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <span className="std-doc-count">총 {filteredDocs.length}건</span>
          <div className="mes-search std-header-search">
            <IconSearch size={15} />
            <input placeholder="문서명·설비로 검색" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="std-grid">
        {loading ? (
          <div className="std-empty">불러오는 중...</div>
        ) : filteredDocs.length === 0 ? (
          <div className="std-empty">등록된 문서가 없습니다.</div>
        ) : (
          filteredDocs.map((doc) => {
            const ext = getExt(doc.origFileName);
            const { Icon, color } = docIcon(ext);
            return (
              <div key={doc.id} className="std-card">
                <div className="std-card-top">
                  <div className="std-card-icon" style={{ background: `${color}1a`, color }}>
                    <Icon size={26} />
                  </div>
                  <div className="std-card-top-right">
                    <span className={`std-cat-badge${doc.docCategory === '관리계획서' ? ' plan' : ''}`}>
                      {doc.docCategory}
                    </span>
                    {(permission.canUpdate || permission.canDelete) && (
                      <div className="std-card-manage">
                        {permission.canUpdate && (
                          <button type="button" className="std-card-manage-btn" title="수정" onClick={() => openEdit(doc)}>
                            <IconEdit size={13} />
                          </button>
                        )}
                        {permission.canDelete && (
                          <button type="button" className="std-card-manage-btn" title="삭제" onClick={() => handleDelete(doc)}>
                            <IconTrash size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="std-card-title" title={doc.docTitle}>{doc.docTitle}</div>

                <div className="std-card-meta">
                  {doc.equipName && <span>{doc.equipName}</span>}
                  {doc.revNo && <span>Rev.{doc.revNo}</span>}
                  {doc.effectiveDate && <span>{doc.effectiveDate}</span>}
                </div>

                <div className="std-card-file">
                  <span className="std-card-ext">{ext ? ext.toUpperCase() : 'FILE'}</span>
                  <span className="std-card-size">{formatFileSize(doc.fileSize)}</span>
                </div>

                {doc.remark && <div className="std-card-remark" title={doc.remark}>{doc.remark}</div>}

                <div className="std-card-actions">
                  <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setPreviewDoc(doc)}>
                    <IconEye size={14} /> 미리보기
                  </button>
                  <a className="mes-btn mes-btn-secondary" href={downloadUrl(doc.id)}>
                    <IconDownload size={14} /> 다운로드
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>

      {formOpen && (
        <Modal title={editing ? '문서 수정' : '문서 등록'} onClose={() => setFormOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="mes-form-grid">
              <div className="mes-field mes-field-full">
                <label>문서명 *</label>
                <input value={form.docTitle} onChange={(e) => setForm({ ...form, docTitle: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>구분</label>
                <select value={form.docCategory} onChange={(e) => setForm({ ...form, docCategory: e.target.value })}>
                  <option value="관리계획서">관리계획서</option>
                  <option value="작업표준서">작업표준서</option>
                </select>
              </div>
              <div className="mes-field">
                <label>관련 설비</label>
                <input value={form.equipName} onChange={(e) => setForm({ ...form, equipName: e.target.value })} placeholder="예) MBF1" />
              </div>
              <div className="mes-field">
                <label>개정번호</label>
                <input value={form.revNo} onChange={(e) => setForm({ ...form, revNo: e.target.value })} placeholder="예) 3" />
              </div>
              <div className="mes-field">
                <label>적용일자</label>
                <input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
              </div>
              <div className="mes-field mes-field-full">
                <label>비고</label>
                <textarea
                  rows={3}
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                />
              </div>
              <div className="mes-field mes-field-full">
                <label>{editing ? '파일 교체 (선택)' : '파일 *'}</label>
                <input type="file" onChange={(e) => setFormFile(e.target.files?.[0] ?? null)} />
                <span className="mes-hint">
                  {editing && '파일을 선택하지 않으면 기존 파일이 유지됩니다. '}
                  미리보기는 이미지·PDF 형식만 지원하며, 그 외 형식은 다운로드로 확인합니다.
                </span>
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

      {previewDoc && (
        <Modal
          title={previewDoc.docTitle}
          onClose={() => setPreviewDoc(null)}
          xl
          className="std-preview-modal"
          footer={(
            <>
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setPreviewDoc(null)}>닫기</button>
              <a className="mes-btn mes-btn-primary" href={downloadUrl(previewDoc.id)}>
                <IconDownload size={15} /> 다운로드
              </a>
            </>
          )}
        >
          <div className="std-preview-body">
            {IMAGE_EXTS.has(previewExt) ? (
              <img src={previewUrl(previewDoc.id)} alt={previewDoc.docTitle} className="std-preview-img" />
            ) : previewExt === 'pdf' ? (
              <iframe title={previewDoc.docTitle} src={previewUrl(previewDoc.id)} className="std-preview-iframe" />
            ) : (
              <div className="std-preview-fallback">
                <IconFile size={40} />
                <p>미리보기를 지원하지 않는 형식입니다. 다운로드해서 확인하세요.</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
