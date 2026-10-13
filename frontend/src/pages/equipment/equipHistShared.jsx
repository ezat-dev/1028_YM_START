import { useRef, useState } from 'react';
import {
  IconPaperclip, IconUpload, IconDownload, IconExternalLink, IconX, IconArrowBackUp,
  IconFileTypePdf, IconPhoto, IconFileSpreadsheet, IconFileText, IconFileZip, IconVideo, IconFile,
  IconFileTypeDoc, IconFileTypePpt, IconRuler2,
} from '@tabler/icons-react';
import { uploadAttachments, deleteAttachments, attachUrl } from '../../api/equipment/equipAttachApi';

/*
 * 설비이력관리·수리이력관리 공통 — 날짜 도우미, 등록/수정자 셀, 첨부파일(여러 개) 편집·보기.
 * 첨부는 폼에서 '추가할 파일'과 '지울 기존 파일'만 모아 두었다가, 본문을 저장해 ID가 생긴 뒤 한 번에 반영한다.
 */

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
export const nextDay = (s) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + 1); return ymd(d); };
// datetime-local 입력값 'YYYY-MM-DDTHH:mm'
export const toLocalInput = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtDt = (v) => (v ? String(v).replace('T', ' ').slice(0, 16) : '');
export const inputDt = (v) => (v ? String(v).slice(0, 16) : '');
export const shortDt = (v) => (v ? String(v).replace('T', ' ').slice(5, 16).replace('-', '/') : '');
export const won = (n) => (n == null ? '-' : `${Number(n).toLocaleString('ko-KR')}원`);

export function fmtDur(min) {
  if (min == null) return '-';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return h ? `${d}일 ${h}시간` : `${d}일`;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

export const QUICK = [
  { key: '7d', label: '7일', from: () => daysAgo(6) },
  { key: '30d', label: '30일', from: () => daysAgo(29) },
  { key: '90d', label: '90일', from: () => daysAgo(89) },
  { key: '1y', label: '1년', from: () => daysAgo(364) },
];

// 등록·수정자 표시 — '홍길동 (hong)'
export const who = (name, id) => (name || id ? `${name || '-'}${id ? ` (${id})` : ''}` : '');

/** 표 셀 — 1줄 등록, (수정됐으면) 2줄 수정 */
export function AuditCell({ row }) {
  const reg = who(row.regUserName, row.regUserId) || '-';
  const upd = who(row.updUserName, row.updUserId);
  return (
    <span className="dtm-audit">
      <span title={`등록 ${reg} · ${fmtDt(row.regDt)}`}><em>등록</em>{reg}<small>{shortDt(row.regDt)}</small></span>
      {upd && <span className="is-upd" title={`수정 ${upd} · ${fmtDt(row.updDt)}`}><em>수정</em>{upd}<small>{shortDt(row.updDt)}</small></span>}
    </span>
  );
}

/** 폼 아래 등록/수정자 줄 */
export function FormAudit({ editing, user }) {
  return editing ? (
    <div className="dtm-form-audit">
      <span><em>등록</em>{who(editing.regUserName, editing.regUserId) || '-'} · {fmtDt(editing.regDt)}</span>
      {(editing.updUserName || editing.updUserId) && <span><em>마지막 수정</em>{who(editing.updUserName, editing.updUserId)} · {fmtDt(editing.updDt)}</span>}
      <span className="is-me"><em>이번 수정</em>{who(user?.userName, user?.loginId) || '-'}</span>
    </div>
  ) : (
    <div className="dtm-form-audit">
      <span className="is-me"><em>등록자</em>{who(user?.userName, user?.loginId) || '-'}</span>
    </div>
  );
}

/* ───────────────────────── 첨부파일 ───────────────────────── */

export const MAX_ATTACH = 20;
const MAX_SIZE = 20 * 1024 * 1024; // 서버 multipart 파일 1개 한도와 같게
const ALLOWED_EXT = [
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
  'xls', 'xlsx', 'csv', 'doc', 'docx', 'ppt', 'pptx', 'hwp', 'hwpx', 'txt',
  'dwg', 'dxf', 'zip', '7z', 'mp4', 'mov', 'avi',
];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

const extOf = (name) => (String(name).includes('.') ? String(name).split('.').pop().toLowerCase() : '');

export function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function FileIcon({ name, size = 18 }) {
  const ext = extOf(name);
  if (ext === 'pdf') return <IconFileTypePdf size={size} className="eqh-fi is-pdf" />;
  if (IMAGE_EXT.includes(ext)) return <IconPhoto size={size} className="eqh-fi is-img" />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <IconFileSpreadsheet size={size} className="eqh-fi is-xls" />;
  if (['doc', 'docx', 'hwp', 'hwpx'].includes(ext)) return <IconFileTypeDoc size={size} className="eqh-fi is-doc" />;
  if (['ppt', 'pptx'].includes(ext)) return <IconFileTypePpt size={size} className="eqh-fi is-ppt" />;
  if (['dwg', 'dxf'].includes(ext)) return <IconRuler2 size={size} className="eqh-fi is-cad" />;
  if (['zip', '7z'].includes(ext)) return <IconFileZip size={size} className="eqh-fi" />;
  if (['mp4', 'mov', 'avi'].includes(ext)) return <IconVideo size={size} className="eqh-fi is-video" />;
  if (ext === 'txt') return <IconFileText size={size} className="eqh-fi" />;
  return <IconFile size={size} className="eqh-fi" />;
}

/** 폼 안 첨부 편집 — 드래그&드롭 또는 '파일 선택'으로 여러 개 추가, 기존 파일은 '삭제 표시'(저장할 때 지움).
 *  state: { saved: [], removed: Set<attachId>, pending: File[] } */
export function AttachEditor({ state, setState, onError }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const keptCount = state.saved.filter((a) => !state.removed.has(a.attachId)).length;
  const total = keptCount + state.pending.length;

  const add = (fileList) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const bad = [];
    const ok = [];
    files.forEach((f) => {
      if (!ALLOWED_EXT.includes(extOf(f.name))) bad.push(`${f.name} (형식)`);
      else if (f.size > MAX_SIZE) bad.push(`${f.name} (20MB 초과)`);
      else if (state.pending.some((p) => p.name === f.name && p.size === f.size)) { /* 같은 파일 두 번 → 무시 */ }
      else ok.push(f);
    });
    const room = MAX_ATTACH - total;
    if (ok.length > room) {
      bad.push(`${ok.length - room}개 (최대 ${MAX_ATTACH}개)`);
      ok.length = Math.max(0, room);
    }
    if (ok.length) setState((s) => ({ ...s, pending: [...s.pending, ...ok] }));
    onError?.(bad.length ? `추가하지 못한 파일: ${bad.join(', ')}` : '');
  };

  const toggleRemove = (id) => setState((s) => {
    const removed = new Set(s.removed);
    if (removed.has(id)) removed.delete(id);
    else removed.add(id);
    return { ...s, removed };
  });
  const dropPending = (idx) => setState((s) => ({ ...s, pending: s.pending.filter((_, i) => i !== idx) }));

  return (
    <div className="eqh-attach">
      <div
        className={`eqh-drop${drag ? ' is-drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
      >
        <IconUpload size={18} />
        <span>파일을 여기로 끌어오거나</span>
        <button type="button" className="mes-btn mes-btn-secondary eqh-drop-btn" onClick={() => inputRef.current?.click()}>파일 선택</button>
        <small>PDF·이미지·오피스·한글·도면·압축·동영상 · 1개 20MB · 최대 {MAX_ATTACH}개</small>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={ALLOWED_EXT.map((e) => `.${e}`).join(',')}
          onChange={(e) => { add(e.target.files); e.target.value = ''; }}
        />
      </div>

      {(state.saved.length > 0 || state.pending.length > 0) && (
        <ul className="eqh-files">
          {state.saved.map((a) => {
            const off = state.removed.has(a.attachId);
            return (
              <li key={`s${a.attachId}`} className={off ? 'is-removed' : ''}>
                <FileIcon name={a.origName} />
                <a className="eqh-file-name" href={attachUrl(a.attachId)} target="_blank" rel="noreferrer" title={a.origName}>{a.origName}</a>
                <span className="eqh-file-meta">{off ? '저장하면 삭제' : fmtSize(a.fileSize)}</span>
                <button type="button" className="eqh-file-x" onClick={() => toggleRemove(a.attachId)} title={off ? '삭제 취소' : '삭제'} aria-label={off ? `${a.origName} 삭제 취소` : `${a.origName} 삭제`}>
                  {off ? <IconArrowBackUp size={14} /> : <IconX size={14} />}
                </button>
              </li>
            );
          })}
          {state.pending.map((f, i) => (
            <li key={`p${f.name}${f.size}${i}`} className="is-new">
              <FileIcon name={f.name} />
              <span className="eqh-file-name" title={f.name}>{f.name}</span>
              <span className="eqh-file-meta"><em>새 파일</em>{fmtSize(f.size)}</span>
              <button type="button" className="eqh-file-x" onClick={() => dropPending(i)} title="빼기" aria-label={`${f.name} 빼기`}><IconX size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="eqh-attach-count">
        <IconPaperclip size={13} /> {total} / {MAX_ATTACH}
        {state.removed.size > 0 && <span> · 삭제 예정 {state.removed.size}</span>}
        {state.pending.length > 0 && <span> · 새 파일 {state.pending.length}</span>}
      </div>
    </div>
  );
}

/** 본문 저장 뒤 첨부 반영 — 지울 것 먼저, 그다음 업로드 */
export async function applyAttachChanges(refType, refId, state, user) {
  if (state.removed.size) await deleteAttachments([...state.removed]);
  if (state.pending.length) await uploadAttachments(refType, refId, state.pending, user);
}

/** 상세 보기용 첨부 목록 — 이미지는 썸네일, 나머지는 아이콘. 미리보기/다운로드 */
export function AttachList({ items, emptyText = '첨부파일이 없습니다.', tagOf }) {
  if (!items?.length) return <p className="eqh-detail-empty">{emptyText}</p>;
  return (
    <ul className="eqh-attach-view">
      {items.map((a) => {
        const img = IMAGE_EXT.includes(extOf(a.origName));
        const tag = tagOf?.(a);
        return (
          <li key={a.attachId}>
            <a className="eqh-thumb" href={attachUrl(a.attachId)} target="_blank" rel="noreferrer" aria-label={`${a.origName} 미리보기`}>
              {img ? <img src={attachUrl(a.attachId)} alt="" loading="lazy" /> : <FileIcon name={a.origName} size={26} />}
            </a>
            <div className="eqh-attach-info">
              <span className="eqh-attach-name" title={a.origName}>{tag && <em>{tag}</em>}{a.origName}</span>
              <small>{fmtSize(a.fileSize)} · {who(a.regUserName, a.regUserId) || '-'} · {shortDt(a.regDt)}</small>
            </div>
            <div className="eqh-attach-act">
              <a href={attachUrl(a.attachId)} target="_blank" rel="noreferrer" title="새 창에서 보기" aria-label={`${a.origName} 새 창에서 보기`}><IconExternalLink size={15} /></a>
              <a href={attachUrl(a.attachId, true)} title="다운로드" aria-label={`${a.origName} 다운로드`}><IconDownload size={15} /></a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 목록 표의 첨부 개수 */
export function ClipCount({ n }) {
  if (!n) return null;
  return <span className="eqh-clip" title={`첨부 ${n}개`}><IconPaperclip size={12} />{n}</span>;
}
