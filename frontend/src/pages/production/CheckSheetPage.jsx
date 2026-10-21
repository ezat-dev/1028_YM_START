import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconClipboardList, IconChevronLeft, IconChevronRight, IconEdit, IconCheck, IconLock, IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand, IconDownload, IconChevronDown, IconHistory,
} from '@tabler/icons-react';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { useSidebar } from '../../context/SidebarContext';
import {
  getEquips, getSheets, getBoard, getProducts, addRow, updateRow, deleteRow, saveHardness, saveHead, sign, saveSettings,
} from '../../api/production/checkSheetApi';
import { getSpecList } from '../../api/quality/hardnessApi';
import { getReasonList } from '../../api/base/downtimeApi';
import { getDefectTypes } from '../../api/quality/nonconformApi';
import { equipLabel } from '../quality/capability';
import SignModal from '../condition/EquipCheckSign';
import CheckSheetPaper from './CheckSheetPaper';
import CheckSheetAudit from './CheckSheetAudit';
import '../../styles/downtime.css';
import './checkSheet.css';

/*
 * 생산관리 > CHECK SHEET(열처리) — 현장 종이 양식 그대로.
 *  - 위: 1~6호기 버튼, 왼쪽: 그 호기의 날짜별 시트, 가운데: 시트(행 = 통, 통이 나올 때마다 한 줄씩)
 *  - Part No = 제품 품번, 작지 No = LOT. 검사기준·표면/심부는 기준정보 > 경도관리(호기 × 품번)에서 가져온다
 *  - 경도 X1~X5(최소 2개부터 CPK) → 경도측정·CPK·PPK, 비가동 → 설비비가동현황, 불량 → 부적합품관리로 바로 연동
 */

const MENU = '/production/checkSheet';
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const DOW = '일월화수목금토';
const dateLabel = (s) => { const d = new Date(`${s}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`; };
const errMsg = (err) => err?.response?.data?.message ?? '처리에 실패했습니다.';

export default function CheckSheetPage() {
  const { user } = useAuth();
  const permission = usePermission(MENU);
  const { toast, showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const today = ymd(new Date());

  // 시트가 넓어 들어오면 왼쪽 메뉴를 접고, 나갈 때 들어오기 전 상태로 되돌린다
  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } = useSidebar();
  const sidebarBefore = useRef(sidebarCollapsed);
  useEffect(() => {
    const before = sidebarBefore.current;
    setSidebarCollapsed(true);
    return () => setSidebarCollapsed(before);
  }, [setSidebarCollapsed]);

  const [equips, setEquips] = useState([]);
  const equipCode = params.get('equip') || equips[0]?.equipCode || '';
  const date = params.get('date') || today;
  const go = useCallback((patch) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
      return n;
    }, { replace: true });
  }, [setParams]);

  const [sheets, setSheets] = useState([]);
  const [board, setBoard] = useState(null);
  const [specs, setSpecs] = useState([]);
  const [products, setProducts] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [defects, setDefects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listOpen, setListOpen] = useState(() => window.innerWidth >= 1500);
  const [editMode, setEditMode] = useState(false);
  const [signDlg, setSignDlg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [focusRowId, setFocusRowId] = useState(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [pickPart, setPickPart] = useState(null); // 왼쪽 Part No 카드로 고른 품번 — 그 행들을 연두색으로

  const who = useMemo(() => ({ userId: user?.loginId ?? '', userName: user?.userName ?? '' }), [user]);
  const canWrite = permission.canUpdate || permission.canCreate;

  // ── 불러오기 ──
  const viewDate = params.get('date') || today;
  const loadEquips = useCallback(() => getEquips(viewDate).then((r) => setEquips(r.data ?? [])).catch(() => {}), [viewDate]);
  const loadMasters = useCallback(() => {
    getReasonList('', 'Y').then((r) => setReasons(r.data ?? [])).catch(() => {});
    getDefectTypes('').then((r) => setDefects(r.data ?? [])).catch(() => {});
  }, []);
  useEffect(() => { loadEquips(); loadMasters(); }, [loadEquips, loadMasters]);

  const loadSheets = useCallback(() => {
    if (!equipCode) return;
    getSheets(equipCode, addDays(today, -120), today).then((r) => setSheets(r.data ?? [])).catch(() => {});
  }, [equipCode, today]);
  useEffect(() => { loadSheets(); }, [loadSheets]);

  useEffect(() => {
    if (!equipCode) return;
    getSpecList('', 'Y', equipCode).then((r) => setSpecs(r.data ?? [])).catch(() => setSpecs([]));
    getProducts(equipCode).then((r) => setProducts(r.data ?? [])).catch(() => setProducts([]));
  }, [equipCode]);

  const reqRef = useRef(0);
  const loadBoard = useCallback(async (quiet = false) => {
    if (!equipCode) return;
    const req = ++reqRef.current;
    if (!quiet) setLoading(true);
    try {
      const r = await getBoard(equipCode, date);
      if (req === reqRef.current) setBoard(r.data);
    } catch (err) {
      if (req === reqRef.current) showToast(errMsg(err), 'error');
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [equipCode, date, showToast]);
  useEffect(() => { loadBoard(); }, [loadBoard]);
  useEffect(() => { setEditMode(false); setPickPart(null); }, [equipCode, date]);

  const refreshSide = () => { loadSheets(); loadEquips(); };
  const signs = useMemo(() => new Map((board?.signs ?? []).map((s) => [s.slot, s])), [board?.signs]);
  const locked = signs.has('승인');
  const editable = canWrite && !locked && date <= today;

  // ── 행 ──
  const replaceRow = (row) => setBoard((b) => ({ ...b, rows: b.rows.map((r) => (r.rowId === row.rowId ? row : r)) }));

  const onAddRow = async () => {
    setBusy(true);
    try {
      const r = await addRow({ equipCode, prodDate: date, ...who });
      setBoard((b) => ({ ...b, rows: [...(b?.rows ?? []), r.data] }));
      setFocusRowId(r.data.rowId);
      if (!board?.sheet) loadBoard(true);
      refreshSide();
    } catch (err) {
      showToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onSaveRow = async (row) => {
    try {
      const r = await updateRow(row.rowId, { ...row, hardness: undefined, ...who });
      replaceRow(r.data);
      refreshSide();
      return r.data;
    } catch (err) {
      showToast(errMsg(err), 'error');
      loadBoard(true); // 서버 값으로 되돌린다
      return null;
    }
  };

  const onSaveHardness = async (rowId, itemName, values) => {
    try {
      const r = await saveHardness(rowId, { itemName, values, ...who });
      replaceRow(r.data);
      refreshSide();
      return true;
    } catch (err) {
      showToast(errMsg(err), 'error');
      loadBoard(true);
      return false;
    }
  };

  const onDeleteRow = async (row) => {
    const linked = [row.downtimeId && '설비비가동', row.ncId && '부적합품', (row.hardness ?? []).length && '경도측정'].filter(Boolean);
    const msg = `${row.rowNo}번 통을 지울까요?${linked.length ? `\n연동된 ${linked.join('·')} 기록도 같이 지워집니다.` : ''}`;
    if (!window.confirm(msg)) return;
    try {
      await deleteRow(row.rowId, who);
      await loadBoard(true);
      refreshSide();
      showToast(`${row.rowNo}번 통을 지웠습니다.`);
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };

  const onSaveHead = async (patch) => {
    const s = board?.sheet ?? {};
    const body = { equipCode, prodDate: date, workerDay: s.workerDay ?? '', workerNight: s.workerNight ?? '', qcName: s.qcName ?? '', ...patch, ...who };
    try {
      const r = await saveHead(body);
      setBoard((b) => ({ ...b, sheet: { ...b.sheet, ...r.data } }));
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };

  const onSaveSettings = async (patch) => {
    try {
      const r = await saveSettings(patch);
      setBoard((b) => ({ ...b, subtitle: r.data.subtitle, note: r.data.note }));
    } catch (err) {
      showToast(errMsg(err), 'error');
    }
  };

  // ── 서명 ──
  const submitSign = async (slot, body) => {
    const r = await sign({ equipCode, prodDate: date, slot, on: true, ...who, ...body });
    setBoard((b) => ({ ...b, signs: r.data ?? [] }));
    setSignDlg(null);
    if (!board?.sheet) loadBoard(true);
    refreshSide();
    showToast(`${slot} 서명했습니다.`);
  };
  const cancelSign = async (slot) => {
    const r = await sign({ equipCode, prodDate: date, slot, on: false, ...who });
    setBoard((b) => ({ ...b, signs: r.data ?? [] }));
    setSignDlg(null);
    refreshSide();
    showToast('서명을 취소했습니다.');
  };

  const download = async () => {
    try {
      const { downloadCheckSheetExcel } = await import('./checkSheetExcel');
      await downloadCheckSheetExcel({ board, specs, reasons, defects });
    } catch (err) {
      console.error(err);
      showToast('엑셀 만들기에 실패했습니다.', 'error');
    }
  };

  const eqCur = equips.find((e) => e.equipCode === equipCode);

  // 왼쪽: 이 시트에 들어간 품번 — 통 수, 첫 작지 No·출로시간(처음 들어간 순서)
  const parts = useMemo(() => {
    const m = new Map();
    [...(board?.rows ?? [])].sort((a, b) => a.rowNo - b.rowNo).forEach((r) => {
      const k = r.partNo || '';
      if (!m.has(k)) {
        m.set(k, { partNo: r.partNo, productName: r.productName, count: 0, qty: 0, ng: 0, firstRowId: r.rowId, firstLot: r.lotNo, firstOut: r.outTime, firstNo: r.rowNo });
      }
      const p = m.get(k);
      p.count += 1;
      p.qty += Number(r.qtyKg) || 0;
      if (!p.productName && r.productName) p.productName = r.productName;
      if ((r.hardness ?? []).some((h) => h.judgement === '불합격')) p.ng += 1;
    });
    return [...m.values()];
  }, [board?.rows]);
  const totalQty = parts.reduce((a, p) => a + p.qty, 0);
  // 카드를 누르면 그 Part No 행들을 표시하고 첫 행으로, 한 번 더 누르면 해제
  const togglePart = (p) => {
    const key = p.partNo || '';
    if (pickPart === key) { setPickPart(null); return; }
    setPickPart(key);
    document.getElementById(`cs-row-${p.firstRowId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div className="mes-page dtm-page cs-page">
      {/* 머리 + 호기 탭을 한 카드에 */}
      <div className="dtm-header-card cs-header">
        <div className="cs-header-row">
          <div className="mes-page-heading cs-heading">
            <div className="mes-page-icon"><IconClipboardList size={20} /></div>
            <div>
              <h2 className="mes-page-title">CHECK SHEET</h2>
              <p className="mes-page-desc">통마다 한 줄 · 경도→CPK·PPK, 비가동→설비비가동현황, 불량→부적합품관리 자동 연동</p>
            </div>
          </div>
          <div className="cs-equips" role="tablist" aria-label="호기">
            {equips.map((e) => (
              <button
                key={e.equipCode}
                type="button"
                role="tab"
                aria-selected={e.equipCode === equipCode}
                className={`cs-equip${e.equipCode === equipCode ? ' is-on' : ''}`}
                onClick={() => go({ equip: e.equipCode })}
                title={`${e.equipName} · ${dateLabel(viewDate)} ${e.partCount}품목 ${e.rowCount}통`}
              >
                <b>{equipLabel(e.equipCode, e.equipName)}</b>
                <span className={`cs-equip-count${e.partCount ? '' : ' is-zero'}`}>
                  {e.partCount ? <>{e.partCount}품목<small>{e.rowCount}통</small></> : '기록 없음'}
                </span>
              </button>
            ))}
          </div>
          <div className="cs-header-actions">
            <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setAuditOpen(true)} title="누가 언제 무엇을 입력·수정·서명했는지">
              <IconHistory size={15} /> 기록
            </button>
            <button type="button" className="mes-btn mes-btn-secondary" onClick={download} disabled={!board?.rows?.length}>
              <IconDownload size={15} /> 엑셀
            </button>
            {canWrite && (
              <button type="button" className={`mes-btn ${editMode ? 'mes-btn-primary' : 'mes-btn-secondary'}`} onClick={() => setEditMode((v) => !v)}>
                {editMode ? <><IconCheck size={15} /> 양식 편집 끝</> : <><IconEdit size={15} /> 양식 편집</>}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`cs-body${listOpen ? '' : ' is-list-closed'}`}>
        {/* 왼쪽: 날짜 이동 · Part No · 최근 시트 */}
        <aside className="mes-card cs-dates" aria-label="시트 요약">
          <div className="cs-dates-head">
            <b>{equipLabel(equipCode, eqCur?.equipName)}</b>
            <span className="cs-dates-date">{dateLabel(date)}{date === today && <em>오늘</em>}</span>
            <button type="button" className="cs-icon-btn" onClick={() => setListOpen(false)} aria-label="왼쪽 접기"><IconLayoutSidebarLeftCollapse size={16} /></button>
          </div>
          <div className="cs-date-nav">
            <button type="button" onClick={() => go({ date: addDays(date, -1) })} aria-label="전날"><IconChevronLeft size={16} /></button>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && go({ date: e.target.value })} aria-label="생산일자" />
            <button type="button" onClick={() => go({ date: addDays(date, 1) })} disabled={date >= today} aria-label="다음날"><IconChevronRight size={16} /></button>
          </div>
          {date !== today && <button type="button" className="cs-today-btn" onClick={() => go({ date: today })}>오늘로</button>}

          <div className="cs-side-total">
            <span>합계</span>
            <b>{board?.rows?.length ?? 0}<small>통</small></b>
            <b>{totalQty.toLocaleString('ko-KR')}<small>Kg</small></b>
          </div>

          <div className="cs-parts-title">Part No <small>{parts.length}</small></div>
          <ul className="cs-parts">
            {!parts.length && <li className="cs-parts-empty">아직 들어간 통이 없습니다.</li>}
            {parts.map((p) => (
              <li key={p.partNo || '-'}>
                <button
                  type="button"
                  className={`cs-part${pickPart === (p.partNo || '') ? ' is-on' : ''}`}
                  onClick={() => togglePart(p)}
                  aria-pressed={pickPart === (p.partNo || '')}
                  title={pickPart === (p.partNo || '') ? '한 번 더 누르면 표시 해제' : `${p.count}통 표시 · ${p.firstNo}번 통으로 이동`}
                >
                  <span className="cs-part-top">
                    <b>{p.partNo || 'Part No 미입력'}</b>
                    <em>{p.count}통</em>
                  </span>
                  {p.productName && <span className="cs-part-name">{p.productName}</span>}
                  <span className="cs-part-first">
                    <span><i>첫 작지</i>{p.firstLot || '-'}</span>
                    <span><i>첫 출로</i>{p.firstOut || '-'}</span>
                  </span>
                  {(p.qty > 0 || p.ng > 0) && (
                    <span className="cs-part-foot">
                      {p.qty > 0 && <span>{p.qty.toLocaleString('ko-KR')}Kg</span>}
                      {p.ng > 0 && <span className="is-ng">경도 불 {p.ng}</span>}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <button type="button" className={`cs-recent-toggle${recentOpen ? ' is-open' : ''}`} onClick={() => setRecentOpen((v) => !v)} aria-expanded={recentOpen}>
            최근 시트 <small>{sheets.length}</small><IconChevronDown size={14} />
          </button>
          {recentOpen && (
            <ul className="cs-recent">
              {sheets.map((s) => (
                <li key={s.sheetId}>
                  <button type="button" className={s.prodDate === date ? 'is-on' : ''} onClick={() => go({ date: s.prodDate })}>
                    <span>{dateLabel(s.prodDate)}</span>
                    <b>{s.rowCount}통</b>
                    {(Number(s.defectSum) > 0 || s.downCount > 0 || s.ngCount > 0) && <i title="불량·비가동·경도 불합격 있음" />}
                  </button>
                </li>
              ))}
              {!sheets.length && <li className="cs-parts-empty">기록된 시트가 없습니다.</li>}
            </ul>
          )}
        </aside>

        <section className="cs-main">
          {!listOpen && (
            <button type="button" className="cs-list-open" onClick={() => setListOpen(true)}>
              <IconLayoutSidebarLeftExpand size={16} /> Part No 요약
            </button>
          )}
          {locked && (
            <div className="cs-lock-bar"><IconLock size={15} /> 승인된 시트입니다. 고치려면 승인 서명을 취소하세요.</div>
          )}
          {date > today && <div className="cs-lock-bar">앞으로 올 날짜입니다.</div>}
          {!board || loading ? (
            <div className="mes-card cs-empty">불러오는 중…</div>
          ) : (
            <CheckSheetPaper
              board={board}
              specs={specs}
              products={products}
              reasons={reasons}
              defects={defects}
              signs={signs}
              editable={editable}
              editMode={editMode}
              busy={busy}
              focusRowId={focusRowId}
              highlightPart={pickPart}
              onFocused={() => setFocusRowId(null)}
              onAddRow={onAddRow}
              onSaveRow={onSaveRow}
              onSaveHardness={onSaveHardness}
              onDeleteRow={onDeleteRow}
              onSaveHead={onSaveHead}
              onSaveSettings={onSaveSettings}
              onSign={(slot) => setSignDlg(slot)}
              onMastersChanged={loadMasters}
              showToast={showToast}
              canSign={canWrite}
            />
          )}
        </section>
      </div>

      {signDlg && board && (() => {
        const cur = signs.get(signDlg);
        const c = cur ? { name: cur.signName, img: cur.signImg, dt: cur.signDt, userId: cur.userId } : null;
        return (
          <SignModal
            title={`${signDlg} 서명`}
            subtitle={`${equipLabel(equipCode, eqCur?.equipName)} · ${date} CHECK SHEET${signDlg === '승인' ? ' — 승인하면 이 시트를 고칠 수 없습니다.' : ''}`}
            defaultName={who.userName}
            current={c}
            canCancel={!!c && canWrite && (!c.userId || c.userId === who.userId)}
            onSubmit={(body) => submitSign(signDlg, body)}
            onCancelSign={() => cancelSign(signDlg)}
            onClose={() => setSignDlg(null)}
          />
        );
      })()}

      {auditOpen && (
        <CheckSheetAudit
          date={date}
          equipCode={equipCode}
          equips={equips}
          onClose={() => setAuditOpen(false)}
          onOpenSheet={(eq, d) => { setAuditOpen(false); go({ equip: eq, date: d }); }}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
