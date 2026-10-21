import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconClipboardText, IconChevronLeft, IconChevronRight, IconEdit, IconCheck, IconDownload, IconPlus,
  IconPhoto, IconCamera, IconTrash, IconArrowUp, IconArrowDown, IconX, IconLock, IconLayoutGrid,
  IconListCheck, IconCircleCheckFilled, IconAlertTriangleFilled, IconChecks,
} from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import ImageViewer from '../../components/ui/ImageViewer';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import {
  getSheets, createSheet, updateSheet, deleteSheets, getBoard, addItem, updateItem, deleteItem, moveItem,
  uploadPhoto, deletePhoto, photoUrl, setResult, fillDay, saveMonth, saveNote, sign, confirmWeek,
} from '../../api/condition/equipCheckApi';
import {
  DOW, legendOf, cyclesOf, signsOf, ymOf, daysIn, dowOf, addMonth, ymLabel, weeksOf, stampName, markState, rangeText, isNumMark,
  indexResults, inspectorsByDay, fmtMd, fmtHm,
} from './equipCheckShared';
import EquipCheckToday from './EquipCheckToday';
import SignModal from './EquipCheckSign';
import NumEntry from './EquipCheckNum';
import '../../styles/downtime.css';
import './EquipCheckPage.css';

const MENU = '/condition/equipCheck';
const MIN_ROWS = 8; // 종이 양식처럼 항목이 적어도 빈 줄을 채워 둔다
const DAY_COLS = 31;

const errMsg = (err) => err?.response?.data?.message ?? '처리에 실패했습니다.';
const isTouchLike = () => typeof window !== 'undefined'
  && window.matchMedia('(max-width: 1023px), (pointer: coarse)').matches;

export default function EquipCheckPage() {
  const { user } = useAuth();
  const permission = usePermission(MENU);
  const { toast, showToast } = useToast();
  const [params, setParams] = useSearchParams();

  const [sheets, setSheets] = useState(null);
  const [ym, setYm] = useState(() => ymOf(new Date()));
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(() => (isTouchLike() ? 'today' : 'sheet'));
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(null); // 편집 중인 머리·범례·결재란
  const [picker, setPicker] = useState(null); // { itemId|null, day, rect }
  const [viewer, setViewer] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [signDlg, setSignDlg] = useState(null); // { slot } 결재 | { week } 관리책임자 확인
  const [todayDay, setTodayDay] = useState(null); // 오늘 점검 화면에서 보는 날

  const sheetId = params.get('sheet') ? Number(params.get('sheet')) : null;
  const setSheetId = useCallback((id) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set('sheet', String(id)); else n.delete('sheet');
      return n;
    }, { replace: true });
  }, [setParams]);

  const who = useMemo(() => ({ userId: user?.loginId ?? '', userName: user?.userName ?? '' }), [user]);
  const canWrite = permission.canUpdate;
  const canForm = permission.canUpdate || permission.canCreate || permission.canDelete;

  // ── 불러오기 ──
  const loadSheets = useCallback(async () => {
    try {
      const res = await getSheets();
      setSheets(res.data ?? []);
      return res.data ?? [];
    } catch (err) {
      showToast(errMsg(err), 'error');
      setSheets([]);
      return [];
    }
  }, [showToast]);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  useEffect(() => {
    if (!sheets?.length) return;
    if (!sheetId || !sheets.some((s) => s.sheetId === sheetId)) {
      const first = sheets.find((s) => s.useYn === 'Y') ?? sheets[0];
      setSheetId(first.sheetId);
    }
  }, [sheets, sheetId, setSheetId]);

  const reqRef = useRef(0);
  const loadBoard = useCallback(async (quiet = false) => {
    if (!sheetId) { setBoard(null); return; }
    const req = ++reqRef.current;
    if (!quiet) setLoading(true);
    try {
      const res = await getBoard(sheetId, ym);
      if (req === reqRef.current) setBoard(res.data);
    } catch (err) {
      if (req === reqRef.current) showToast(errMsg(err), 'error');
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [sheetId, ym, showToast]);

  useEffect(() => { loadBoard(); }, [loadBoard]);
  useEffect(() => { setEditMode(false); setDraft(null); setPicker(null); }, [sheetId]);

  // ── 계산 ──
  const sheet = board?.sheet;
  const legend = useMemo(() => legendOf(draft ?? sheet), [draft, sheet]);
  const cycles = useMemo(() => cyclesOf(draft ?? sheet), [draft, sheet]);
  const signs = useMemo(() => signsOf(draft ?? sheet), [draft, sheet]);
  const good = legend[0]?.mark;
  const today = board?.today ?? new Date().toISOString().slice(0, 10);
  const todayYm = today.slice(0, 7);
  const todayNum = Number(today.slice(8, 10));
  const isCurMonth = ym === todayYm;
  const lastDay = daysIn(ym);
  const isFuture = (day) => ym > todayYm || (isCurMonth && day > todayNum);
  const locked = !!board?.locked;
  const items = board?.items ?? [];
  const activeItems = items.filter((i) => i.useYn === 'Y');
  const resIdx = useMemo(() => indexResults(board?.results), [board?.results]);
  const inspectors = useMemo(() => inspectorsByDay(board?.results), [board?.results]);
  const noteMap = useMemo(() => new Map((board?.notes ?? []).map((n) => [n.itemId, n.note])), [board?.notes]);
  const confirmMap = useMemo(() => new Map((board?.confirms ?? []).map((c) => [c.weekNo, c])), [board?.confirms]);
  const markEditable = canWrite && !locked && !editMode;

  useEffect(() => {
    setTodayDay(isCurMonth ? todayNum : lastDay);
  }, [ym, isCurMonth, todayNum, lastDay]);

  // ── 기록 ──
  const applyResult = (itemId, day, r) => {
    setBoard((b) => {
      if (!b) return b;
      const rest = b.results.filter((x) => !(x.itemId === itemId && x.day === day));
      return { ...b, results: r ? [...rest, r] : rest };
    });
  };

  const mark = async (itemId, day, m) => {
    setPicker(null);
    const prev = resIdx.get(`${itemId}-${day}`);
    if ((prev?.mark ?? '') === (m ?? '')) return;
    try {
      const res = await setResult(itemId, { ym, day, mark: m ?? '', ...who });
      applyResult(itemId, day, res.data);
      if (res.data && !board.month.inspectorName) {
        setBoard((b) => ({ ...b, month: { ...b.month, inspectorName: res.data.userName || b.month.inspectorName } }));
      }
      loadSheets();
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };

  const fill = async (day, m) => {
    setPicker(null);
    setBusy(true);
    try {
      const res = await fillDay(sheetId, { ym, day, mark: m, ...who });
      setBoard(res.data);
      loadSheets();
      const l = legend.find((x) => x.mark === (m ?? good)) ?? legend[0];
      showToast(`${Number(ym.slice(5))}/${day} 빈 칸을 '${l.mark} ${l.label}'(으)로 채웠습니다.`);
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveMonthInfo = async (patch) => {
    const m = board.month;
    const body = { ym, inspectorName: m.inspectorName ?? '', remark: m.remark ?? '', ...patch };
    if ((m.inspectorName ?? '') === (body.inspectorName ?? '') && (m.remark ?? '') === (body.remark ?? '')) return;
    try {
      const res = await saveMonth(sheetId, body);
      setBoard((b) => ({ ...b, month: { ...b.month, ...res.data } }));
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };

  const saveItemNote = async (itemId, note) => {
    if ((noteMap.get(itemId) ?? '') === note.trim()) return;
    try {
      await saveNote(itemId, { ym, note });
      setBoard((b) => {
        const rest = b.notes.filter((n) => n.itemId !== itemId);
        return { ...b, notes: note.trim() ? [...rest, { itemId, ym, note: note.trim() }] : rest };
      });
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };

  // 결재(담당/검토/확인) — 팝업에서 서명하거나 이름 입력
  const submitSign = async (slot, body) => {
    const res = await sign(sheetId, { ym, slot, on: true, ...who, ...body });
    setBoard((b) => ({ ...b, month: { ...b.month, ...res.data }, locked: !!res.data?.sign3Name }));
    setSignDlg(null);
    showToast(`${signs[slot - 1]} 서명했습니다.`);
  };
  const cancelSign = async (slot) => {
    const res = await sign(sheetId, { ym, slot, on: false, ...who });
    setBoard((b) => ({ ...b, month: { ...b.month, ...res.data }, locked: !!res.data?.sign3Name }));
    setSignDlg(null);
    showToast('서명을 취소했습니다.');
  };

  // 관리책임자 확인란(주마다)
  const submitConfirm = async (w, body) => {
    const res = await confirmWeek(sheetId, { ym, weekNo: w.no, on: true, ...who, ...body });
    setBoard((b) => ({ ...b, confirms: res.data ?? [] }));
    setSignDlg(null);
    showToast(`${w.from}~${w.to}일 확인했습니다.`);
  };
  const cancelConfirm = async (w) => {
    const res = await confirmWeek(sheetId, { ym, weekNo: w.no, on: false, ...who });
    setBoard((b) => ({ ...b, confirms: res.data ?? [] }));
    setSignDlg(null);
    showToast('확인을 취소했습니다.');
  };

  // ── 편집 모드 ──
  const startEdit = () => {
    setDraft({
      title: sheet.title ?? '설비점검표',
      equipName: sheet.equipName ?? '',
      modelNo: sheet.modelNo ?? '',
      legend: legendOf(sheet).map((l) => ({ ...l })),
      cycles: cyclesOf(sheet).map((c) => ({ ...c })),
      signs: [...signsOf(sheet)],
      footerNote: sheet.footerNote ?? '',
    });
    setEditMode(true);
    setPicker(null);
  };
  const finishEdit = async (save) => {
    if (!save) { setEditMode(false); setDraft(null); return; }
    setBusy(true);
    try {
      const body = {
        ...sheet,
        title: draft.title,
        equipName: draft.equipName,
        modelNo: draft.modelNo,
        legendJson: JSON.stringify(draft.legend.map((l) => ({ mark: l.mark.trim(), label: l.label.trim() }))),
        cycleJson: JSON.stringify(draft.cycles.map((c) => ({ code: c.code.trim(), label: c.label.trim() }))),
        signJson: JSON.stringify(draft.signs.map((s) => s.trim())),
        footerNote: draft.footerNote,
        updUserId: who.userId,
        updUserName: who.userName,
      };
      const res = await updateSheet(sheetId, body);
      setBoard((b) => ({ ...b, sheet: res.data }));
      setEditMode(false);
      setDraft(null);
      loadSheets();
      showToast('양식을 저장했습니다.');
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const runItem = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      await loadBoard(true);
      loadSheets();
      if (okMsg) showToast(okMsg);
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveItemField = (it, patch) => {
    const next = { location: it.location ?? '', itemName: it.itemName ?? '', cycle: it.cycle, rangeMin: it.rangeMin ?? null, rangeMax: it.rangeMax ?? null, ...patch };
    const sameNum = (a, b) => (a == null ? null : Number(a)) === (b == null ? null : Number(b));
    if (next.location === (it.location ?? '') && next.itemName === (it.itemName ?? '') && next.cycle === it.cycle
      && sameNum(next.rangeMin, it.rangeMin) && sameNum(next.rangeMax, it.rangeMax)) return;
    if (!next.itemName.trim()) { showToast('점검항목은 비울 수 없습니다.', 'error'); loadBoard(true); return; }
    runItem(() => updateItem(it.itemId, next));
  };

  const saveRange = (it, key, v) => {
    const t = String(v ?? '').trim();
    if (t !== '' && (Number.isNaN(Number(t)) || Number(t) < 0 || Number(t) > 999)) { showToast('범위는 0 ~ 999 숫자로 입력하세요.', 'error'); loadBoard(true); return; }
    saveItemField(it, { [key]: t === '' ? null : Number(t) });
  };

  const removeItem = (it) => {
    const used = (board.results ?? []).some((r) => r.itemId === it.itemId);
    const msg = used
      ? `'${it.itemName}' 항목을 뺄까요?\n이미 기록이 있어 지난 달 점검표에는 그대로 남습니다.`
      : `'${it.itemName}' 항목을 지울까요?`;
    if (!window.confirm(msg)) return;
    runItem(() => deleteItem(it.itemId), '항목을 뺐습니다.');
  };

  const fileRef = useRef(null);
  const photoTarget = useRef(null);
  const pickPhoto = (it) => { photoTarget.current = it; fileRef.current?.click(); };
  const onPhotoFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    const it = photoTarget.current;
    if (!f || !it) return;
    runItem(() => uploadPhoto(it.itemId, f), '사진을 올렸습니다.');
  };

  const openPhoto = (it) => {
    const withPhoto = items.filter((x) => x.photoName);
    setViewer({
      images: withPhoto.map((x) => ({ src: photoUrl(x), name: `${x.location ?? ''} ${x.itemName}`.trim() })),
      index: Math.max(0, withPhoto.findIndex((x) => x.itemId === it.itemId)),
    });
  };

  const removeSheet = async () => {
    if (!window.confirm(`'${sheet.equipName}' 점검표를 지울까요?\n항목·사진·모든 달의 기록과 결재가 함께 지워집니다.`)) return;
    setBusy(true);
    try {
      await deleteSheets([sheetId]);
      setEditMode(false);
      setDraft(null);
      setSheetId(null);
      setBoard(null);
      await loadSheets();
      showToast('점검표를 지웠습니다.');
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      const { downloadSheetExcel } = await import('./equipCheckExcel');
      await downloadSheetExcel(board, ym);
    } catch (err) {
      console.error(err);
      showToast('엑셀 만들기에 실패했습니다.', 'error');
    }
  };

  // ── 화면 ──
  const fillerRows = Math.max(0, MIN_ROWS - items.length);
  const openPicker = (e, itemId, day) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPicker({ itemId, day, rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width } });
  };

  return (
    <div className="mes-page dtm-page ec-page">
      <div className="dtm-header-card">
        <div className="dtm-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon"><IconClipboardText size={20} /></div>
            <div>
              <h2 className="mes-page-title">설비점검표</h2>
              <p className="mes-page-desc">설비마다 점검표 한 장. 칸을 눌러 ○ 양호 · △ 수리 · □ 조정 · X 교환을 기록하고, 결재와 관리책임자 확인도 여기서 합니다.</p>
            </div>
          </div>
          <div className="dtm-header-right">
            {permission.canCreate && (
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setNewOpen(true)}>
                <IconPlus size={15} /> 새 점검표
              </button>
            )}
            {board && (
              <button type="button" className="mes-btn mes-btn-secondary" onClick={download} disabled={editMode}>
                <IconDownload size={15} /> 엑셀 다운로드
              </button>
            )}
            {board && canForm && view === 'sheet' && !editMode && (
              <button type="button" className="mes-btn mes-btn-primary" onClick={startEdit}>
                <IconEdit size={15} /> 편집
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 점검표 고르기 · 년월 · 보기 */}
      <div className="ec-toolbar">
        <div className="ec-sheets" role="tablist" aria-label="점검표">
          {sheets?.map((s) => {
            const done = s.itemCount > 0 && s.todayDone >= s.itemCount;
            return (
              <button
                key={s.sheetId}
                type="button"
                role="tab"
                aria-selected={s.sheetId === sheetId}
                className={`ec-sheet-chip${s.sheetId === sheetId ? ' is-on' : ''}${s.useYn === 'N' ? ' is-off' : ''}`}
                onClick={() => setSheetId(s.sheetId)}
                disabled={editMode && s.sheetId !== sheetId}
              >
                <span className="ec-chip-name">{s.equipName}</span>
                {s.itemCount === 0
                  ? <span className="ec-chip-state is-none">항목 없음</span>
                  : done
                    ? <span className="ec-chip-state is-done"><IconCheck size={12} /> 오늘 완료</span>
                    : <span className="ec-chip-state is-todo">오늘 {s.todayDone}/{s.itemCount}</span>}
                {s.monthIssueCount > 0 && <span className="ec-chip-issue" title="이번 달 양호가 아닌 기록">{s.monthIssueCount}</span>}
              </button>
            );
          })}
          {sheets && !sheets.length && <span className="ec-empty-inline">등록된 점검표가 없습니다. '새 점검표'로 시작하세요.</span>}
        </div>
        <div className="ec-toolbar-right">
          <div className="ec-ym" role="group" aria-label="점검 년월">
            <button type="button" onClick={() => setYm((v) => addMonth(v, -1))} aria-label="이전 달" disabled={editMode}><IconChevronLeft size={16} /></button>
            <b>{ymLabel(ym)}</b>
            <button type="button" onClick={() => setYm((v) => addMonth(v, 1))} aria-label="다음 달" disabled={editMode}><IconChevronRight size={16} /></button>
            {!isCurMonth && <button type="button" className="ec-ym-now" onClick={() => setYm(todayYm)} disabled={editMode}>이번 달</button>}
          </div>
          <div className="ec-view-seg" role="group" aria-label="보기">
            <button type="button" className={view === 'today' ? 'is-on' : ''} onClick={() => { setView('today'); finishEdit(false); }}>
              <IconListCheck size={15} /> 오늘 점검
            </button>
            <button type="button" className={view === 'sheet' ? 'is-on' : ''} onClick={() => setView('sheet')}>
              <IconLayoutGrid size={15} /> 점검표
            </button>
          </div>
        </div>
      </div>

      {locked && (
        <div className="ec-lock-bar"><IconLock size={15} /> {signs[2]} 결재가 끝난 달이라 기록을 고칠 수 없습니다. 고치려면 {signs[2]} 결재를 취소하세요.</div>
      )}

      {editMode && (
        <div className="ec-edit-bar">
          <span><IconEdit size={15} /> 편집 중 — 머리·범례·결재란은 <b>저장</b>을 눌러야 반영되고, 항목은 바로 저장됩니다.</span>
          <div>
            {permission.canDelete && (
              <button type="button" className="mes-btn mes-btn-secondary ec-btn-danger" onClick={removeSheet} disabled={busy}>
                <IconTrash size={15} /> 점검표 삭제
              </button>
            )}
            <button type="button" className="mes-btn mes-btn-secondary" onClick={() => finishEdit(false)} disabled={busy}>취소</button>
            <button type="button" className="mes-btn mes-btn-primary" onClick={() => finishEdit(true)} disabled={busy}><IconCheck size={15} /> 저장</button>
          </div>
        </div>
      )}

      {!sheetId || !board ? (
        <div className="mes-card ec-empty">{loading || sheets == null ? '불러오는 중…' : '점검표를 고르거나 새로 만드세요.'}</div>
      ) : view === 'today' ? (
        <EquipCheckToday
          board={board}
          legend={legend}
          cycles={cycles}
          ym={ym}
          day={todayDay ?? 1}
          setDay={setTodayDay}
          lastDay={lastDay}
          isFuture={isFuture}
          isToday={(d) => isCurMonth && d === todayNum}
          resIdx={resIdx}
          canWrite={canWrite && !locked}
          busy={busy}
          onMark={(it, d, m) => mark(it.itemId, d, m)}
          onFill={(d) => fill(d, good)}
          onPhoto={openPhoto}
        />
      ) : (
        <div className="ec-paper-wrap">
          <div className={`ec-paper${editMode ? ' is-editing' : ''}`}>
            {/* ── 머리: 범례 · 주기 범례 · 제목 · 결재 ── */}
            <div className="ec-head">
              <div className="ec-head-label">범<br />례</div>
              <div className="ec-legend">
                {editMode ? (
                  <LegendEditor
                    rows={draft.legend}
                    keyA="mark"
                    keyB="label"
                    placeholderA="기호"
                    placeholderB="뜻"
                    max={8}
                    onChange={(rows) => setDraft((d) => ({ ...d, legend: rows }))}
                    hint="첫 번째가 '양호'(전체 양호에 쓰임)"
                  />
                ) : (
                  <ul className="ec-legend-list">
                    {legend.map((l, i) => (
                      <li key={l.mark}><b className={i === 0 ? 'is-good' : 'is-issue'}>{l.mark}</b> : {l.label}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="ec-head-label">주<br />기<br /><br />범<br />례</div>
              <div className="ec-legend is-cycle">
                {editMode ? (
                  <LegendEditor
                    rows={draft.cycles}
                    keyA="code"
                    keyB="label"
                    placeholderA="코드"
                    placeholderB="뜻"
                    max={8}
                    onChange={(rows) => setDraft((d) => ({ ...d, cycles: rows }))}
                  />
                ) : (
                  <ul className="ec-legend-list is-col">
                    {cycles.map((c) => <li key={c.code}><b>{c.code}</b> : {c.label}</li>)}
                  </ul>
                )}
              </div>
              <div className="ec-title">
                {editMode
                  ? <input className="ec-in ec-title-in" value={draft.title} maxLength={50} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} aria-label="제목" />
                  : <h3>{sheet.title}</h3>}
              </div>
              <div className="ec-signs">
                {signs.map((label, i) => {
                  const slot = i + 1;
                  const name = board.month[`sign${slot}Name`];
                  const dt = board.month[`sign${slot}Dt`];
                  return (
                    <div key={slot} className="ec-sign">
                      <div className="ec-sign-label">
                        {editMode
                          ? <input className="ec-in" value={draft.signs[i]} maxLength={10} onChange={(e) => setDraft((d) => { const s = [...d.signs]; s[i] = e.target.value; return { ...d, signs: s }; })} aria-label={`결재 ${slot} 이름`} />
                          : label}
                      </div>
                      <button
                        type="button"
                        className={`ec-sign-box${name ? ' is-signed' : ''}`}
                        disabled={editMode || (!name && !canWrite)}
                        onClick={() => setSignDlg({ slot })}
                        title={name ? `${name} · ${String(dt).replace('T', ' ').slice(0, 16)}` : `${label} 서명`}
                      >
                        {name ? (
                          <>
                            {board.month[`sign${slot}Img`]
                              ? <img className="ec-sign-img" src={board.month[`sign${slot}Img`]} alt={`${name} 서명`} />
                              : <span className="ec-stamp is-big">{stampName(name)}</span>}
                            <small>{fmtMd(dt)}</small>
                          </>
                        ) : <span className="ec-sign-hint">서명</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 설비명 · 모델 NO · 점검 년월 · 점검자 ── */}
            <div className="ec-info">
              <span className="ec-info-label">설비명</span>
              <span className="ec-info-value is-strong">
                {editMode
                  ? <input className="ec-in" value={draft.equipName} maxLength={100} onChange={(e) => setDraft((d) => ({ ...d, equipName: e.target.value }))} aria-label="설비명" />
                  : sheet.equipName}
              </span>
              <span className="ec-info-label">모델 NO</span>
              <span className="ec-info-value">
                {editMode
                  ? <input className="ec-in" value={draft.modelNo} maxLength={100} onChange={(e) => setDraft((d) => ({ ...d, modelNo: e.target.value }))} aria-label="모델 NO" />
                  : (sheet.modelNo || '-')}
              </span>
              <span className="ec-info-label">점검 년월</span>
              <span className="ec-info-value">{ymLabel(ym)}</span>
              <span className="ec-info-label">점검자</span>
              <span className="ec-info-value">
                <BlurInput
                  className="ec-in is-plain"
                  value={board.month.inspectorName ?? ''}
                  placeholder={canWrite ? '이름' : ''}
                  maxLength={50}
                  disabled={!canWrite || locked}
                  onCommit={(v) => saveMonthInfo({ inspectorName: v })}
                  aria-label="점검자"
                />
              </span>
            </div>

            {/* ── 항목 × 1~31일 ── */}
            <table className="ec-grid">
              <colgroup>
                {editMode && <col className="ec-c-act" />}
                <col className="ec-c-loc" />
                <col className="ec-c-item" />
                <col className="ec-c-cycle" />
                <col className="ec-c-photo" />
                {Array.from({ length: DAY_COLS }, (_, i) => <col key={i} className="ec-c-day" />)}
                <col className="ec-c-note" />
              </colgroup>
              <thead>
                <tr>
                  {editMode && <th aria-label="순서" />}
                  <th>점검개소</th>
                  <th>점검항목</th>
                  <th>주기</th>
                  <th>사진</th>
                  {Array.from({ length: DAY_COLS }, (_, i) => {
                    const day = i + 1;
                    if (day > lastDay) return <th key={day} className="ec-day-h is-out" />;
                    const dow = dowOf(ym, day);
                    const can = markEditable && !isFuture(day) && activeItems.length > 0;
                    const cls = `ec-day-h${dow === 0 ? ' is-sun' : dow === 6 ? ' is-sat' : ''}${isCurMonth && day === todayNum ? ' is-today' : ''}`;
                    return (
                      <th key={day} className={cls}>
                        <button
                          type="button"
                          disabled={!can}
                          onClick={(e) => openPicker(e, null, day)}
                          title={can ? `${day}일 빈 칸 한 번에 채우기` : undefined}
                        >
                          <b>{day}</b>
                          <small>{DOW[dow]}</small>
                        </button>
                      </th>
                    );
                  })}
                  <th>정기 점검</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const hidden = it.useYn !== 'Y';
                  return (
                    <tr key={it.itemId} className={hidden ? 'is-hidden-item' : ''}>
                      {editMode && (
                        <td className="ec-act">
                          {!hidden && (
                            <>
                              <button type="button" onClick={() => runItem(() => moveItem(it.itemId, 'up'))} disabled={busy || idx === 0} aria-label="위로"><IconArrowUp size={13} /></button>
                              <button type="button" onClick={() => runItem(() => moveItem(it.itemId, 'down'))} disabled={busy || idx === activeItems.length - 1} aria-label="아래로"><IconArrowDown size={13} /></button>
                              {permission.canDelete && <button type="button" className="is-del" onClick={() => removeItem(it)} disabled={busy} aria-label="항목 빼기"><IconX size={13} /></button>}
                            </>
                          )}
                        </td>
                      )}
                      <td className="ec-loc">
                        {editMode && !hidden
                          ? <BlurInput className="ec-in" value={it.location ?? ''} maxLength={100} placeholder="점검개소" onCommit={(v) => saveItemField(it, { location: v })} aria-label="점검개소" />
                          : it.location}
                        {hidden && <small className="ec-hidden-tag">지운 항목</small>}
                      </td>
                      <td className="ec-item">
                        {editMode && !hidden ? (
                          <>
                            <BlurInput className="ec-in" value={it.itemName ?? ''} maxLength={200} placeholder="점검항목" onCommit={(v) => saveItemField(it, { itemName: v })} aria-label="점검항목" />
                            {/* 수치로 기록할 항목의 범위 — 하나만 넣어도 된다(이상 / 이하) */}
                            <span className="ec-range-edit" title="수치로 기록할 때 이 범위를 벗어나면 빨간색으로 표시합니다">
                              <small>범위</small>
                              <BlurInput className="ec-in is-range" value={it.rangeMin == null ? '' : String(Number(it.rangeMin))} inputMode="decimal" maxLength={7} placeholder="하한" onCommit={(v) => saveRange(it, 'rangeMin', v)} aria-label="범위 하한" />
                              <span>~</span>
                              <BlurInput className="ec-in is-range" value={it.rangeMax == null ? '' : String(Number(it.rangeMax))} inputMode="decimal" maxLength={7} placeholder="상한" onCommit={(v) => saveRange(it, 'rangeMax', v)} aria-label="범위 상한" />
                            </span>
                          </>
                        ) : (
                          <>
                            {it.itemName}
                            {rangeText(it) && <span className="ec-range">({rangeText(it)})</span>}
                          </>
                        )}
                      </td>
                      <td className="ec-cycle">
                        {editMode && !hidden ? (
                          <select className="ec-in" value={it.cycle} onChange={(e) => saveItemField(it, { cycle: e.target.value })} aria-label="주기">
                            {cyclesOf(sheet).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                          </select>
                        ) : <span title={cycles.find((c) => c.code === it.cycle)?.label}>{it.cycle}</span>}
                      </td>
                      <td className="ec-photo">
                        {editMode && !hidden ? (
                          <span className="ec-photo-edit">
                            {it.photoName ? (
                              <>
                                <button type="button" onClick={() => openPhoto(it)} title="사진 보기"><IconPhoto size={15} /></button>
                                <button type="button" className="is-del" onClick={() => window.confirm('사진을 지울까요?') && runItem(() => deletePhoto(it.itemId), '사진을 지웠습니다.')} title="사진 지우기"><IconX size={12} /></button>
                              </>
                            ) : (
                              <button type="button" className="is-add" onClick={() => pickPhoto(it)} title="사진 올리기"><IconCamera size={15} /></button>
                            )}
                          </span>
                        ) : it.photoName ? (
                          <button type="button" className="ec-photo-btn" onClick={() => openPhoto(it)} title={`${it.itemName} 사진 크게 보기`}>
                            <IconPhoto size={16} />
                          </button>
                        ) : <span className="ec-dim">-</span>}
                      </td>
                      {Array.from({ length: DAY_COLS }, (_, i) => {
                        const day = i + 1;
                        if (day > lastDay) return <td key={day} className="ec-day is-out" />;
                        const r = resIdx.get(`${it.itemId}-${day}`);
                        const future = isFuture(day);
                        const can = markEditable && !future && !hidden;
                        const st = markState(it, r?.mark, good);
                        const cls = [
                          'ec-day',
                          isCurMonth && day === todayNum ? 'is-today' : '',
                          future ? 'is-future' : '',
                          st ? `is-${st}` : '',
                        ].filter(Boolean).join(' ');
                        return (
                          <td key={day} className={cls}>
                            <button
                              type="button"
                              disabled={!can}
                              onClick={(e) => openPicker(e, it.itemId, day)}
                              title={r ? `${st === 'out' ? `범위(${rangeText(it)}) 밖 · ` : ''}${r.userName ?? ''} ${fmtHm(r.checkedDt)}`.trim() : undefined}
                              aria-label={`${it.itemName} ${day}일 ${r ? r.mark : '빈 칸'}`}
                            >
                              {r?.mark}
                            </button>
                          </td>
                        );
                      })}
                      <td className="ec-note">
                        <BlurInput
                          className="ec-in is-plain"
                          value={noteMap.get(it.itemId) ?? ''}
                          maxLength={200}
                          disabled={!canWrite || locked || editMode}
                          onCommit={(v) => saveItemNote(it.itemId, v)}
                          aria-label={`${it.itemName} 정기 점검`}
                        />
                      </td>
                    </tr>
                  );
                })}
                {Array.from({ length: fillerRows }, (_, i) => (
                  <tr key={`f${i}`} className="ec-filler">
                    {editMode && <td />}
                    {i === 0 && editMode && permission.canCreate ? (
                      <td colSpan={4} className="ec-add-cell">
                        <button type="button" onClick={() => runItem(() => addItem(sheetId, { location: '', itemName: '새 점검항목', cycle: cyclesOf(sheet)[0]?.code }))} disabled={busy}>
                          <IconPlus size={14} /> 항목 추가
                        </button>
                      </td>
                    ) : (
                      <>
                        <td /><td /><td /><td />
                      </>
                    )}
                    {Array.from({ length: DAY_COLS }, (_, d) => <td key={d} className="ec-day is-blank" />)}
                    <td />
                  </tr>
                ))}
                {fillerRows === 0 && editMode && permission.canCreate && (
                  <tr className="ec-filler">
                    <td />
                    <td colSpan={4} className="ec-add-cell">
                      <button type="button" onClick={() => runItem(() => addItem(sheetId, { location: '', itemName: '새 점검항목', cycle: cyclesOf(sheet)[0]?.code }))} disabled={busy}>
                        <IconPlus size={14} /> 항목 추가
                      </button>
                    </td>
                    {Array.from({ length: DAY_COLS }, (_, d) => <td key={d} className="ec-day is-blank" />)}
                    <td />
                  </tr>
                )}
              </tbody>
              <tfoot>
                {/* 점검자 — 그날 기록한 사람이 바로 찍힌다 */}
                <tr className="ec-who-row">
                  <th colSpan={editMode ? 5 : 4}>점검자</th>
                  {Array.from({ length: DAY_COLS }, (_, i) => {
                    const day = i + 1;
                    if (day > lastDay) return <td key={day} className="ec-day is-out" />;
                    const names = inspectors.get(day);
                    return (
                      <td key={day} className={`ec-day${isCurMonth && day === todayNum ? ' is-today' : ''}`}>
                        {names?.length ? (
                          <span className="ec-stamp" title={names.join(', ')}>{stampName(names[names.length - 1])}</span>
                        ) : null}
                      </td>
                    );
                  })}
                  <td />
                </tr>
                {/* 관리책임자 확인란 — 주(7일)마다 */}
                <tr className="ec-confirm-row">
                  <th colSpan={editMode ? 5 : 4}>관리책임자 확인란</th>
                  {weeksOf(ym).map((w) => {
                    const c = confirmMap.get(w.no);
                    const reachable = !isFuture(w.from);
                    return (
                      <td key={w.no} colSpan={w.to - w.from + 1} className="ec-week">
                        <button
                          type="button"
                          className={c ? 'is-done' : ''}
                          disabled={editMode || (!c && (!canWrite || !reachable))}
                          onClick={() => setSignDlg({ week: w })}
                          title={c ? `${c.userName} · ${String(c.confirmDt).replace('T', ' ').slice(0, 16)}` : `${w.from}~${w.to}일 확인`}
                        >
                          {c ? (
                            <>
                              {c.signImg
                                ? <img className="ec-week-img" src={c.signImg} alt={`${c.userName} 서명`} />
                                : <span className="ec-sign-name">{c.userName}</span>}
                              <small>{fmtMd(c.confirmDt)}</small>
                            </>
                          ) : <span className="ec-week-hint">{w.from}~{w.to}일 확인</span>}
                        </button>
                      </td>
                    );
                  })}
                  {lastDay < DAY_COLS && <td colSpan={DAY_COLS - lastDay} className="ec-day is-out" />}
                  <td />
                </tr>
              </tfoot>
            </table>

            {/* ── 특기사항 ── */}
            <div className="ec-remark">
              <span>특기사항</span>
              <BlurTextarea
                value={board.month.remark ?? ''}
                disabled={!canWrite || locked}
                placeholder={canWrite && !locked ? '이상 내용, 조치 사항 등을 적으세요.' : ''}
                onCommit={(v) => saveMonthInfo({ remark: v })}
              />
              <p className="ec-footer">
                ☞{' '}
                {editMode
                  ? <input className="ec-in" value={draft.footerNote} maxLength={300} onChange={(e) => setDraft((d) => ({ ...d, footerNote: e.target.value }))} aria-label="하단 문구" />
                  : sheet.footerNote}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 기호 고르기 */}
      {picker && (
        <MarkPicker
          picker={picker}
          legend={legend}
          title={picker.itemId == null
            ? `${Number(ym.slice(5))}/${picker.day} 빈 칸 모두`
            : `${Number(ym.slice(5))}/${picker.day} · ${items.find((x) => x.itemId === picker.itemId)?.itemName ?? ''}`}
          current={picker.itemId == null ? null : resIdx.get(`${picker.itemId}-${picker.day}`)?.mark}
          item={picker.itemId == null ? null : items.find((x) => x.itemId === picker.itemId)}
          onPick={(m) => (picker.itemId == null ? fill(picker.day, m) : mark(picker.itemId, picker.day, m))}
          onClear={picker.itemId == null ? null : () => mark(picker.itemId, picker.day, null)}
          goodLabel={legend[0] ? `${legend[0].mark} ${legend[0].label}` : '양호'}
          onFillDay={picker.itemId == null ? null : () => fill(picker.day)}
          onClose={() => setPicker(null)}
        />
      )}

      {signDlg && board && (() => {
        if (signDlg.slot) {
          const n = signDlg.slot;
          const m = board.month;
          const cur = m[`sign${n}Name`]
            ? { name: m[`sign${n}Name`], img: m[`sign${n}Img`], dt: m[`sign${n}Dt`], userId: m[`sign${n}UserId`] }
            : null;
          return (
            <SignModal
              title={`${signs[n - 1]} 서명`}
              subtitle={`${sheet.equipName} · ${ymLabel(ym)} 설비점검표${n === 3 ? ' — 서명하면 그달 기록이 잠깁니다.' : ''}`}
              defaultName={who.userName}
              current={cur}
              canCancel={!!cur && canWrite && (!cur.userId || cur.userId === who.userId)}
              onSubmit={(body) => submitSign(n, body)}
              onCancelSign={() => cancelSign(n)}
              onClose={() => setSignDlg(null)}
            />
          );
        }
        const w = signDlg.week;
        const c = confirmMap.get(w.no);
        const cur = c ? { name: c.userName, img: c.signImg, dt: c.confirmDt, userId: c.userId } : null;
        return (
          <SignModal
            title="관리책임자 확인"
            subtitle={`${sheet.equipName} · ${Number(ym.slice(5))}월 ${w.from}일 ~ ${w.to}일 점검 확인`}
            defaultName={who.userName}
            current={cur}
            canCancel={!!cur && canWrite && (!cur.userId || cur.userId === who.userId)}
            onSubmit={(body) => submitConfirm(w, body)}
            onCancelSign={() => cancelConfirm(w)}
            onClose={() => setSignDlg(null)}
          />
        );
      })()}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhotoFile} />

      {viewer && (
        <ImageViewer images={viewer.images} startIndex={viewer.index} title="점검 항목 사진" onClose={() => setViewer(null)} />
      )}

      {newOpen && (
        <NewSheetModal
          sheets={sheets ?? []}
          onClose={() => setNewOpen(false)}
          onSave={async (body) => {
            const res = await createSheet({ ...body, regUserId: who.userId, regUserName: who.userName });
            setNewOpen(false);
            await loadSheets();
            setSheetId(res.data.sheetId);
            setView('sheet');
            showToast(`'${res.data.equipName}' 점검표를 만들었습니다.`);
          }}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

/** 포커스가 빠질 때 저장하는 입력 칸 */
function BlurInput({ value, onCommit, ...rest }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => { const v = e.target.value; if (v !== value) onCommit(v.trim()); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setText(value); e.currentTarget.blur(); }
      }}
    />
  );
}

function BlurTextarea({ value, onCommit, ...rest }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <textarea
      {...rest}
      value={text}
      rows={3}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => { const v = e.target.value; if (v !== value) onCommit(v); }}
    />
  );
}

/** 범례·주기 범례 편집 — 기호/코드 + 뜻, 추가·삭제 */
function LegendEditor({ rows, keyA, keyB, placeholderA, placeholderB, max, onChange, hint }) {
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="ec-legend-edit">
      {rows.map((r, i) => (
        <div key={i} className="ec-legend-row">
          <input className="ec-in is-mark" value={r[keyA]} maxLength={3} placeholder={placeholderA} onChange={(e) => set(i, keyA, e.target.value)} aria-label={placeholderA} />
          <span>:</span>
          <input className="ec-in" value={r[keyB]} maxLength={10} placeholder={placeholderB} onChange={(e) => set(i, keyB, e.target.value)} aria-label={placeholderB} />
          {rows.length > 1 && (
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="빼기"><IconX size={12} /></button>
          )}
        </div>
      ))}
      <div className="ec-legend-foot">
        {rows.length < max && (
          <button type="button" onClick={() => onChange([...rows, { [keyA]: '', [keyB]: '' }])}><IconPlus size={12} /> 추가</button>
        )}
        {hint && <small>{hint}</small>}
      </div>
    </div>
  );
}

/** 칸을 누르면 뜨는 기호 고르기 — 숫자 키 1~n으로도 고른다 */
function MarkPicker({ picker, legend, title, current, item, onPick, onClear, onFillDay, goodLabel, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.target instanceof HTMLInputElement) return; // 수치 입력 중에는 숫자 키를 기호로 쓰지 않는다
      const n = Number(e.key);
      if (n >= 1 && n <= legend.length) onPick(legend[n - 1].mark);
      if ((e.key === 'Delete' || e.key === 'Backspace') && onClear) onClear();
    };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onClose);
    };
  }, [legend, onPick, onClear, onClose]);

  // 칸 아래(공간이 없으면 위)에, 화면 밖으로 안 나가게
  const W = Math.min(Math.max(64 * legend.length + (onClear ? 64 : 0) + 24, item ? 280 : 0), window.innerWidth - 16);
  const left = Math.max(8, Math.min(picker.rect.left + picker.rect.width / 2 - W / 2, window.innerWidth - W - 8));
  const below = picker.rect.bottom + (item ? 170 : 120) < window.innerHeight;
  const style = below ? { left, top: picker.rect.bottom + 6, width: W } : { left, bottom: window.innerHeight - picker.rect.top + 6, width: W };

  return (
    <div ref={ref} className="ec-picker" style={style} role="dialog" aria-label={title}>
      <div className="ec-picker-title">{title}</div>
      <div className="ec-picker-btns">
        {legend.map((l, i) => (
          <button
            key={l.mark}
            type="button"
            className={`${i === 0 ? 'is-good' : 'is-issue'}${current === l.mark ? ' is-on' : ''}`}
            onClick={() => onPick(l.mark)}
          >
            <b>{l.mark}</b>
            <small>{l.label}</small>
            <kbd>{i + 1}</kbd>
          </button>
        ))}
        {onClear && (
          <button type="button" className="is-clear" onClick={onClear} disabled={!current}>
            <IconX size={16} />
            <small>지우기</small>
          </button>
        )}
      </div>
      {item && (
        <NumEntry
          item={item}
          current={isNumMark(current) ? current : null}
          autoFocus={!!rangeText(item)}
          onSave={onPick}
          extra={onFillDay && (
            <button type="button" className="ec-fill-day" onClick={onFillDay} title={`이 날짜의 빈 칸을 모두 '${goodLabel}'(으)로 채웁니다(이미 적은 칸은 그대로)`}>
              <IconChecks size={14} /> 전부 양호
            </button>
          )}
        />
      )}
    </div>
  );
}

function NewSheetModal({ sheets, onClose, onSave }) {
  const [form, setForm] = useState({ equipName: '', modelNo: '', copyFromId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!form.equipName.trim()) { setError('설비명을 입력해주세요.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        equipName: form.equipName.trim(),
        modelNo: form.modelNo.trim(),
        copyFromId: form.copyFromId ? Number(form.copyFromId) : null,
      });
    } catch (err) {
      setError(errMsg(err));
      setSaving(false);
    }
  };
  return (
    <Modal
      title="새 점검표"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button>
          <button type="submit" form="ec-new-form" className="mes-btn mes-btn-primary" disabled={saving}><IconCheck size={15} /> 만들기</button>
        </>
      )}
    >
      <form id="ec-new-form" className="ec-new-form" onSubmit={submit}>
        <label className="mes-field">
          <span>설비명 <em className="ec-req">*</em></span>
          <input className="dtm-input" value={form.equipName} maxLength={100} autoFocus onChange={(e) => setForm((f) => ({ ...f, equipName: e.target.value }))} placeholder="예) MOUNTING PRESS" />
        </label>
        <label className="mes-field">
          <span>모델 NO</span>
          <input className="dtm-input" value={form.modelNo} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, modelNo: e.target.value }))} placeholder="예) PREMOUNT" />
        </label>
        <label className="mes-field">
          <span>항목 가져오기</span>
          <select className="dtm-input" value={form.copyFromId} onChange={(e) => setForm((f) => ({ ...f, copyFromId: e.target.value }))}>
            <option value="">빈 양식 (기본 범례 ○△□X · 주기 D/W/M)</option>
            {sheets.map((s) => <option key={s.sheetId} value={s.sheetId}>{s.equipName} 점검표의 항목·범례 복사</option>)}
          </select>
        </label>
        <p className="ec-new-hint">
          {form.copyFromId
            ? <><IconCircleCheckFilled size={14} /> 항목과 범례·결재란을 복사합니다. 사진은 설비마다 달라 복사하지 않습니다.</>
            : <><IconAlertTriangleFilled size={14} /> 만든 뒤 '편집'에서 점검 항목을 추가하세요.</>}
        </p>
        {error && <p className="ec-error">{error}</p>}
      </form>
    </Modal>
  );
}
