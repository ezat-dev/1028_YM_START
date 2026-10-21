import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { IconPlus, IconTrash, IconAlertTriangle, IconDatabase } from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { createReason, updateReason } from '../../api/base/downtimeApi';
import { createDefectType, updateDefectType } from '../../api/quality/nonconformApi';
import { equipLabel, fmtSpecRange } from '../quality/capability';
import { stampName } from '../condition/equipCheckShared';

/* 열처리 CHECK SHEET 한 장 — 머리 · 통(행) · 비가동/불량 코드표 · 특기사항 */

export const ITEMS = [{ key: '표면 경도', label: '표면' }, { key: '심부 경도', label: '심부' }];
export const GROUPS = ['설비문제(기계)', '설비문제(전기)', '생산', '생산관리', '영업부문', '공통문제'];
const N = 5; // X1~X5
const ROW_FIELDS = ['outTime', 'vendor', 'partNo', 'productName', 'specText', 'lotNo', 'qtyKg', 'defectQty', 'defectCode',
  'downCode', 'downStart', 'downEnd', 'material', 'heatLotNo', 'worker', 'leader', 'qc'];
const norm = (v) => (v == null ? '' : String(v).trim());
const numOrNull = (v) => (norm(v) === '' ? null : Number(v));

/** 서명 칸 */
function SignBox({ slot, sign, disabled, onClick, small }) {
  return (
    <button type="button" className={`cs-sign${small ? ' is-small' : ''}${sign ? ' is-signed' : ''}`} disabled={disabled && !sign} onClick={() => onClick(slot)}
      title={sign ? `${sign.signName} · ${String(sign.signDt).replace('T', ' ').slice(0, 16)}` : `${slot} 서명`}>
      <span className="cs-sign-label">{slot}</span>
      <span className="cs-sign-body">
        {sign ? (sign.signImg
          ? <img src={sign.signImg} alt={`${sign.signName} 서명`} />
          : <span className="ec-stamp">{stampName(sign.signName)}</span>)
          : <span className="cs-sign-hint">서명</span>}
      </span>
    </button>
  );
}

export default function CheckSheetPaper({
  board, specs, products, reasons, defects, signs, editable, editMode, busy, focusRowId, onFocused, highlightPart,
  onAddRow, onSaveRow, onSaveHardness, onDeleteRow, onSaveHead, onSaveSettings, onSign, onMastersChanged, showToast, canSign,
}) {
  const sheet = board.sheet;
  const rows = board.rows ?? [];
  const [d0] = board.prodDate.split('T');
  const [y, m, d] = d0.split('-').map(Number);

  // 규격: 이 호기 × 품번 × 검사항목
  const specOf = useMemo(() => {
    const map = new Map(specs.map((s) => [`${s.partNo}|${s.itemName}`, s]));
    return (partNo, item) => map.get(`${norm(partNo)}|${item}`);
  }, [specs]);
  const productOf = useMemo(() => new Map(products.map((p) => [p.partNo, p])), [products]);
  const partOptions = useMemo(() => [...products].sort((a, b) => String(a.partNo).localeCompare(String(b.partNo))), [products]);
  const reasonGroups = useMemo(() => {
    const g = new Map(GROUPS.map((k) => [k, []]));
    reasons.forEach((r) => {
      // 그룹이 없는 사유(설비비가동현황 전용)는 편집할 때만 보여 그룹을 정할 수 있게
      const k = r.reasonGroup || (editMode ? '그룹 없음' : null);
      if (!k) return;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(r);
    });
    return [...g.entries()].filter(([, list]) => list.length || editMode);
  }, [reasons, editMode]);
  const activeDefects = defects.filter((t) => t.useYn === 'Y');
  // 품번이 바뀔 때마다 배경을 번갈아(같은 품번 통끼리 묶여 보이게)
  const altOf = useMemo(() => {
    const m = new Map();
    let g = 0;
    rows.forEach((r, i) => {
      if (i > 0 && norm(r.partNo) !== norm(rows[i - 1].partNo)) g += 1;
      m.set(r.rowId, g % 2 === 1);
    });
    return m;
  }, [rows]);

  // Enter: 같은 칸 다음 행으로
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    const col = e.target.dataset.col;
    if (!col) return;
    e.preventDefault();
    const list = [...e.currentTarget.querySelectorAll(`input[data-col="${col}"]`)];
    const i = list.indexOf(e.target);
    if (i >= 0 && list[i + 1]) list[i + 1].focus();
    else e.target.blur();
  };

  const [legendDlg, setLegendDlg] = useState(null); // { kind: 'reason'|'defect', item?, group? }

  return (
    <div className="cs-paper-wrap">
      <div className="cs-paper">
        {/* ── 머리 ── */}
        <div className="cs-head">
          <div className="cs-title">
            <h3>( <b>{equipLabel(board.equipCode, board.equipName).replace('호기', '')}</b> 호기) 열처리 CHECK SHEET</h3>
            {editMode
              ? <BlurInput className="cs-in cs-subtitle-in" value={board.subtitle ?? ''} maxLength={100} onCommit={(v) => onSaveSettings({ subtitle: v })} aria-label="제목 아래 문구" />
              : <small>({board.subtitle})</small>}
          </div>
          <div className="cs-head-mid">
            <div className="cs-workers">
              <span className="cs-vlabel">작업자</span>
              <label><span>주간</span><BlurInput className="cs-in" value={sheet?.workerDay ?? ''} maxLength={50} disabled={!editable} onCommit={(v) => onSaveHead({ workerDay: v })} /></label>
              <label><span>야간</span><BlurInput className="cs-in" value={sheet?.workerNight ?? ''} maxLength={50} disabled={!editable} onCommit={(v) => onSaveHead({ workerNight: v })} /></label>
            </div>
            <div className="cs-approve">
              <span className="cs-vlabel">결<br />재</span>
              {['담당', '검토', '승인'].map((s) => <SignBox key={s} slot={s} sign={signs.get(s)} disabled={!canSign} onClick={onSign} />)}
            </div>
          </div>
          <div className="cs-confirm">
            <SignBox slot="확인" sign={signs.get('확인')} disabled={!canSign} onClick={onSign} />
          </div>
          <div className="cs-qc">
            <span className="cs-qc-label">공정QC 담당자</span>
            <BlurInput className="cs-in" value={sheet?.qcName ?? ''} maxLength={50} disabled={!editable} onCommit={(v) => onSaveHead({ qcName: v })} aria-label="공정QC 담당자" />
          </div>
          <div className="cs-date-coop">
            <div className="cs-prod-date"><span>생산일자</span><b>{y}년 {m}월 {d}일</b></div>
            <div className="cs-coop">
              <span className="cs-vlabel">협<br />조<br />팀</span>
              {['설비관리', '품질관리', '품질보증', '생산관리'].map((s) => <SignBox key={s} slot={s} sign={signs.get(s)} disabled={!canSign} onClick={onSign} small />)}
            </div>
          </div>
        </div>

        {/* ── 통(행) ── */}
        <table className="cs-grid" onKeyDown={onKeyDown}>
          <colgroup>
            <col className="c-no" /><col className="c-time" /><col className="c-vendor" /><col className="c-part" /><col className="c-name" />
            <col className="c-lot" /><col className="c-qty" /><col className="c-defect" /><col className="c-dcode" /><col className="c-dtime" />
            <col className="c-mat" /><col className="c-item" /><col className="c-spec" />
            {Array.from({ length: N }, (_, i) => <col key={i} className="c-x" />)}
            <col className="c-judge" /><col className="c-hlot" /><col className="c-person" /><col className="c-person" /><col className="c-person" />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>No</th>
              <th rowSpan={2}>출로<br />시간</th>
              <th rowSpan={2} className="is-master" title="기준정보 > 제품관리">업체</th>
              <th rowSpan={2} className="is-master" title="기준정보 목록에서 고릅니다">Part No</th>
              <th rowSpan={2} className="is-master" title="기준정보 > 제품관리">품명<br /><small>규격</small></th>
              <th rowSpan={2}>작지 No<br /><small>LOT</small></th>
              <th rowSpan={2}>생산량<br /><small>(Kg)</small></th>
              <th rowSpan={2}>불량</th>
              <th colSpan={2}>비가동</th>
              <th rowSpan={2}>재질</th>
              <th rowSpan={2}>경도</th>
              <th rowSpan={2} className="is-master" title="기준정보 > 경도관리(호기 × Part No)">검사기준</th>
              <th colSpan={N}>측정값</th>
              <th rowSpan={2}>판정</th>
              <th rowSpan={2}>열처리<br />LOT NO</th>
              <th rowSpan={2}>작업자</th>
              <th rowSpan={2}>조장</th>
              <th rowSpan={2}>공정<br />QC</th>
            </tr>
            <tr>
              <th>표기</th>
              <th>시간</th>
              {Array.from({ length: N }, (_, i) => <th key={i}>X{i + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SheetRow
                key={row.rowId}
                row={row}
                alt={altOf.get(row.rowId)}
                hl={highlightPart != null && norm(row.partNo) === highlightPart}
                editMode={editMode}
                partOptions={partOptions}
                prodDate={board.prodDate}
                today={board.today}
                specOf={specOf}
                productOf={productOf}
                reasonGroups={reasonGroups}
                defects={activeDefects}
                editable={editable}
                autoFocus={row.rowId === focusRowId}
                onFocused={onFocused}
                onSave={onSaveRow}
                onSaveHardness={onSaveHardness}
                onDelete={onDeleteRow}
              />
            ))}
            {!rows.length && (
              <tr className="cs-empty-row">
                <td colSpan={18 + N}>
                  {editable ? '아직 통이 없습니다. 아래 \'통 추가\'로 첫 줄을 시작하세요.' : '기록이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="cs-master-hint">
          <IconDatabase size={14} />
          <span><b>업체 · Part No · 품명 · 검사기준</b>은 기준정보 값입니다. Part No는 목록에서 고르고, 내용을 바꾸려면
            {' '}<Link to="/base/product">제품관리</Link> · <Link to="/base/hardnessSpec">경도관리</Link>에서 변경하세요.</span>
        </p>
        {editable && (
          <div className="cs-add">
            <button type="button" onClick={onAddRow} disabled={busy}>
              <IconPlus size={15} /> 통 추가 <small>{rows.length ? '위 행의 Part No·품명·작업자 등을 이어 씁니다' : ''}</small>
            </button>
          </div>
        )}

        {/* ── 비가동 코드표 · 불량 구분 · 특기사항 ── */}
        <div className="cs-legend">
          <div className="cs-down">
            <span className="cs-vlabel">비<br />가<br />동</span>
            <div className="cs-down-groups">
              {reasonGroups.map(([group, list]) => (
                <div key={group} className="cs-down-group">
                  <b>{group}</b>
                  <ul>
                    {list.map((r) => (
                      <li key={r.reasonId}>
                        {editMode
                          ? <button type="button" onClick={() => setLegendDlg({ kind: 'reason', item: r })}>{r.reasonName}<em>{r.reasonCode}</em></button>
                          : <>{r.reasonName}<em>{r.reasonCode}</em></>}
                      </li>
                    ))}
                    {editMode && group !== '그룹 없음' && (
                      <li><button type="button" className="is-add" onClick={() => setLegendDlg({ kind: 'reason', group })}><IconPlus size={12} /> 추가</button></li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="cs-defect-legend">
            <span className="cs-vlabel">불량<br />구분</span>
            <ul>
              {defects.filter((t) => editMode || t.useYn === 'Y').map((t) => (
                <li key={t.defectId} className={t.useYn === 'N' ? 'is-off' : ''}>
                  {editMode
                    ? <button type="button" onClick={() => setLegendDlg({ kind: 'defect', item: t })}>{t.defectName}<em>{t.defectCode}</em></button>
                    : <>{t.defectName}<em>{t.defectCode}</em></>}
                </li>
              ))}
              {editMode && <li><button type="button" className="is-add" onClick={() => setLegendDlg({ kind: 'defect' })}><IconPlus size={12} /> 추가</button></li>}
            </ul>
            <div className="cs-note">
              <span className="cs-vlabel">특기<br />사항</span>
              {editMode
                ? <BlurTextarea className="cs-note-in" value={board.note ?? ''} onCommit={(v) => onSaveSettings({ note: v })} />
                : <p>{board.note}</p>}
            </div>
          </div>
        </div>
        {editMode && (
          <p className="cs-legend-hint">코드표를 고치면 기준정보 &gt; 비가동관리와 부적합품관리의 불량 구분에도 바로 반영됩니다.</p>
        )}
      </div>

      {legendDlg?.kind === 'reason' && (
        <ReasonModal
          item={legendDlg.item}
          group={legendDlg.group}
          onClose={() => setLegendDlg(null)}
          onSaved={(msg) => { setLegendDlg(null); onMastersChanged(); showToast(msg); }}
        />
      )}
      {legendDlg?.kind === 'defect' && (
        <DefectModal
          item={legendDlg.item}
          onClose={() => setLegendDlg(null)}
          onSaved={(msg) => { setLegendDlg(null); onMastersChanged(); showToast(msg); }}
        />
      )}
    </div>
  );
}

/** 통 한 줄 = 표 두 줄(표면/심부) */
function SheetRow({ row, alt, hl, editMode, partOptions, prodDate, today, specOf, productOf, reasonGroups, defects, editable, autoFocus, onFocused, onSave, onSaveHardness, onDelete }) {
  const [downOpen, setDownOpen] = useState(false);
  const [r, setR] = useState(row);
  const saved = useRef(row);
  // 서버 응답으로 행이 바뀌어도, 아직 저장 안 한 칸(입력 중)은 그대로 둔다 — 늦게 온 응답이 방금 친 값을 덮지 않게
  useEffect(() => {
    const prev = saved.current;
    setR((cur) => {
      const next = { ...row };
      ROW_FIELDS.forEach((k) => { if (norm(cur[k]) !== norm(prev[k])) next[k] = cur[k]; });
      return next;
    });
    saved.current = row;
  }, [row]);
  const lotRef = useRef(null);
  useEffect(() => {
    if (autoFocus && lotRef.current) {
      const el = lotRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      onFocused();
    }
  }, [autoFocus, onFocused]);

  // 경도 값(문자열로 들고 있다가 칸을 떠날 때 저장)
  const toStrs = (item, src = row) => {
    const h = (src.hardness ?? []).find((x) => x.itemName === item);
    return Array.from({ length: N }, (_, i) => (h?.values?.[i] == null ? '' : String(Number(h.values[i]))));
  };
  const [hv, setHv] = useState(() => Object.fromEntries(ITEMS.map((it) => [it.key, toStrs(it.key)])));
  const savedH = useRef(Object.fromEntries(ITEMS.map((it) => [it.key, toStrs(it.key)])));
  const same = (a, b) => a.every((v, i) => norm(v) === norm(b[i]));
  useEffect(() => {
    // 입력 중(저장한 값과 다른) 항목은 건드리지 않는다
    setHv((cur) => {
      const next = { ...cur };
      ITEMS.forEach((it) => {
        if (same(cur[it.key], savedH.current[it.key])) {
          next[it.key] = toStrs(it.key);
          savedH.current[it.key] = next[it.key];
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  const changed = (next) => ROW_FIELDS.some((k) => norm(next[k]) !== norm(saved.current[k]));
  const commit = (next = r) => {
    if (!changed(next)) return;
    saved.current = next;
    onSave({ ...next, qtyKg: numOrNull(next.qtyKg), defectQty: numOrNull(next.defectQty) });
  };
  const set = (k) => (e) => setR((x) => ({ ...x, [k]: e.target.value }));
  const setAndCommit = (k) => (e) => { const next = { ...r, [k]: e.target.value }; setR(next); commit(next); };
  // Part No는 기준정보 목록에서만 고른다 — 업체·품명·규격은 그 품번의 기준정보로(재질은 비었을 때만)
  const pickPart = (e) => {
    const partNo = e.target.value;
    const p = productOf.get(partNo);
    const next = {
      ...r,
      partNo,
      vendor: p?.vendor ?? '',
      productName: p?.productName ?? '',
      specText: p?.specText ?? '',
      material: r.material || p?.material || '',
    };
    setR(next);
    commit(next);
  };
  // 경도 값이 있으면 규격이 엇갈리지 않게 Part No를 잠근다(서버도 막는다)
  const partLocked = (row.hardness ?? []).length > 0;
  const partKnown = !r.partNo || productOf.has(norm(r.partNo));

  const commitHardness = (item) => {
    const cur = hv[item];
    const before = savedH.current[item];
    if (same(cur, before)) return;
    const bad = cur.find((v) => norm(v) !== '' && Number.isNaN(Number(v)));
    if (bad != null) { setHv((s) => ({ ...s, [item]: before })); return; }
    savedH.current[item] = [...cur]; // 보낸 값 — 응답이 오면 서버 값으로 맞춰진다
    onSaveHardness(row.rowId, item, cur.map(numOrNull));
  };

  const inp = (k, opts = {}) => (
    <input
      className={`cs-in${opts.num ? ' is-num' : ''}${opts.className ? ` ${opts.className}` : ''}`}
      value={r[k] ?? ''}
      data-col={k}
      disabled={!editable}
      maxLength={opts.max ?? 50}
      inputMode={opts.num || opts.time ? 'decimal' : undefined}
      placeholder={opts.ph}
      list={opts.list}
      ref={opts.ref}
      onChange={set(k)}
      onBlur={opts.onBlur ?? (() => commit())}
      aria-label={opts.label}
    />
  );

  const judgeOf = (item, spec) => {
    const vals = hv[item].map(numOrNull).filter((v) => v != null && !Number.isNaN(v));
    if (!vals.length || !spec) return null;
    const ng = vals.some((v) => (spec.lsl != null && v < spec.lsl) || (spec.usl != null && v > spec.usl));
    return ng ? '불' : '합';
  };

  return (
    <>
      {/* 표(tbody) 안에 div를 둘 수 없어 body로 띄운다 */}
      {downOpen && createPortal(
        <DowntimeDialog
          row={r}
          prodDate={prodDate}
          today={today}
          reasonGroups={reasonGroups}
          onClose={() => setDownOpen(false)}
          onSave={(patch) => { const next = { ...r, ...patch }; setR(next); commit(next); setDownOpen(false); }}
        />,
        document.body,
      )}
      {ITEMS.map((it, idx) => {
        const spec = specOf(r.partNo, it.key);
        const judge = judgeOf(it.key, spec);
        const dec = spec?.decimals ?? 1;
        const first = idx === 0;
        return (
          <tr key={it.key} id={first ? `cs-row-${row.rowId}` : undefined} className={`${first ? 'cs-row-top' : 'cs-row-bottom'}${alt ? ' is-alt' : ''}${hl ? ' is-hl' : ''}${judge === '불' ? ' is-ng' : ''}`}>
            {first && (
              <>
                {/* 번호 아래 삭제 — 표가 넓어 가로로 밀려도 왼쪽에서 바로 보이게 */}
                <td rowSpan={2} className="cs-no">
                  <span>{row.rowNo}</span>
                  {editable && editMode && (
                    <button type="button" className="cs-row-del" onClick={() => onDelete(row)} aria-label={`${row.rowNo}번 통 삭제`} title="이 통(행) 삭제">
                      <IconTrash size={14} />
                    </button>
                  )}
                </td>
                <td rowSpan={2}>{inp('outTime', { time: true, max: 5, ph: '00:00', label: '출로시간' })}</td>
                <td rowSpan={2} className="cs-ro" title={r.vendor || undefined}>{r.vendor}</td>
                {/* 칸에는 Part No만, 펼친 목록에는 품명까지 — 투명한 select를 글자 위에 겹친다 */}
                <td rowSpan={2} className={`cs-part-cell${partLocked || !editable ? ' is-locked' : ''}`}>
                  <span className={`cs-part-val${r.partNo ? '' : ' is-empty'}`}>{r.partNo || '선택'}</span>
                  <select
                    className="cs-part-sel"
                    value={r.partNo ?? ''}
                    disabled={!editable || partLocked}
                    onChange={pickPart}
                    aria-label="Part No"
                    title={partLocked ? '경도 값이 있어 Part No를 바꿀 수 없습니다. 경도 값을 먼저 지워주세요.' : (r.partNo || 'Part No 고르기')}
                  >
                    <option value="">선택</option>
                    {!partKnown && <option value={r.partNo}>{r.partNo} (기준정보 없음)</option>}
                    {partOptions.map((o) => (
                      <option key={o.partNo} value={o.partNo}>{o.partNo}{o.productName ? ` · ${o.productName}` : ''}</option>
                    ))}
                  </select>
                </td>
                <td rowSpan={2} className="cs-stack cs-ro">
                  <span className="cs-ro-line is-name" title={r.productName || undefined}>{r.productName}</span>
                  <span className="cs-ro-line" title={r.specText || undefined}>{r.specText}</span>
                </td>
                <td rowSpan={2}>{inp('lotNo', { max: 30, label: '작지 No', ref: lotRef, className: 'is-strong' })}</td>
                <td rowSpan={2}>{inp('qtyKg', { num: true, max: 10, label: '생산량' })}</td>
                <td rowSpan={2} className="cs-stack">
                  {inp('defectQty', { num: true, max: 10, label: '불량 수량', ph: '수량' })}
                  <select className="cs-in cs-sel" value={r.defectCode ?? ''} disabled={!editable} onChange={setAndCommit('defectCode')} aria-label="불량 구분">
                    <option value="">구분</option>
                    {defects.map((t) => <option key={t.defectCode} value={t.defectCode}>{t.defectCode} {t.defectName}</option>)}
                  </select>
                  {row.ncNo && (
                    <Link className="cs-link" to={`/quality/nonconform?nc=${row.ncId}`} title={`부적합 ${row.ncNo} · ${row.ncStatus}`}>
                      {row.ncNo.slice(-3)} {row.ncStatus}
                    </Link>
                  )}
                </td>
                <td rowSpan={2} colSpan={2} className="cs-down-cell">
                  <DownCell row={r} linked={Boolean(row.downtimeId)} reasonName={reasonNameOf(reasonGroups, r.downCode)} editable={editable} onOpen={() => setDownOpen(true)} />
                </td>
                <td rowSpan={2}>{inp('material', { label: '재질' })}</td>
              </>
            )}
            <td className="cs-item">{it.label}</td>
            <td className={`cs-spec${spec ? '' : ' is-none'}`} title={spec ? `${fmtSpecRange(spec)} · 기준정보 > 경도관리에서 변경` : '기준정보 > 경도관리에 이 호기·Part No 규격이 없습니다'}>
              {spec ? `${spec.lsl ?? ''}~${spec.usl ?? ''}` : '~'}
              {spec && <small>{spec.unit}</small>}
            </td>
            {Array.from({ length: N }, (_, i) => {
              const v = numOrNull(hv[it.key][i]);
              const out = spec && v != null && ((spec.lsl != null && v < spec.lsl) || (spec.usl != null && v > spec.usl));
              return (
                <td key={i} className={`cs-x${out ? ' is-out' : ''}`}>
                  <input
                    className="cs-in is-num"
                    value={hv[it.key][i]}
                    data-col={`x-${it.key}-${i}`}
                    inputMode="decimal"
                    disabled={!editable || !spec}
                    placeholder={i < 3 && spec ? '·' : ''}
                    onChange={(e) => setHv((s) => ({ ...s, [it.key]: s[it.key].map((x, j) => (j === i ? e.target.value : x)) }))}
                    onBlur={() => commitHardness(it.key)}
                    aria-label={`${row.rowNo}번 ${it.label} X${i + 1}`}
                    title={v != null ? Number(v).toFixed(dec) : undefined}
                  />
                </td>
              );
            })}
            <td className={`cs-judge${judge ? ` is-${judge === '합' ? 'ok' : 'ng'}` : ''}`}>{judge ?? <span className="cs-judge-ph">합·불</span>}</td>
            {first && (
              <>
                {/* 열처리 LOT NO — 칸이 좁아 길면 줄을 바꿔 보여 준다(Enter는 다른 칸처럼 다음 행으로) */}
                <td rowSpan={2} className="cs-wrap-cell">
                  <textarea
                    className="cs-in cs-wrap"
                    rows={1}
                    value={r.heatLotNo ?? ''}
                    data-col="heatLotNo"
                    disabled={!editable}
                    maxLength={20}
                    onChange={(e) => setR((x) => ({ ...x, heatLotNo: e.target.value.replace(/[\r\n]/g, '') }))}
                    onBlur={() => commit()}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const list = [...e.currentTarget.closest('table').querySelectorAll('textarea[data-col="heatLotNo"]')];
                      const i = list.indexOf(e.currentTarget);
                      if (list[i + 1]) list[i + 1].focus(); else e.currentTarget.blur();
                    }}
                    aria-label="열처리 LOT NO"
                    title={r.heatLotNo || undefined}
                  />
                </td>
                <td rowSpan={2}>{inp('worker', { label: '작업자' })}</td>
                <td rowSpan={2}>{inp('leader', { label: '조장' })}</td>
                <td rowSpan={2}>{inp('qc', { label: '공정QC' })}</td>
              </>
            )}
          </tr>
        );
      })}
    </>
  );
}

// ── 비가동: 칸에는 보여 주기만, 입력은 팝업에서(아무 시각이나 적히지 않게) ──
const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fromMin = (n) => {
  const v = ((n % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
const durOf = (s, e) => {
  const a = toMin(s);
  const b = toMin(e);
  if (a == null || b == null) return null;
  return b > a ? b - a : b + 1440 - a; // 끝이 시작보다 이르면 자정을 넘긴 것
};
const durText = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);
const reasonNameOf = (groups, code) => {
  for (const [, list] of groups) {
    const f = list.find((x) => x.reasonCode === code);
    if (f) return f.reasonName;
  }
  return '';
};

function DownCell({ row, linked, reasonName, editable, onOpen }) {
  const has = Boolean(row.downCode);
  const timed = has && row.downStart && row.downEnd;
  const content = has ? (
    <>
      <span className="cs-down-code"><b>{row.downCode}</b><small>{reasonName}</small></span>
      {timed ? (
        <span className="cs-down-time">
          {row.downStart}~{row.downEnd}
          <em>{durText(durOf(row.downStart, row.downEnd))}</em>
        </span>
      ) : <span className="cs-down-warn"><IconAlertTriangle size={11} /> 시간 없음</span>}
      {linked && <span className="cs-down-linked">비가동현황 반영</span>}
    </>
  ) : <span className="cs-down-empty">{editable ? '+ 비가동' : ''}</span>;
  if (!editable) return <div className="cs-down-btn is-static">{content}</div>;
  return (
    <button type="button" className={`cs-down-btn${has ? ' is-set' : ''}${has && !timed ? ' is-warn' : ''}`} onClick={onOpen} aria-label="비가동 입력">
      {content}
    </button>
  );
}

const DURATIONS = [5, 10, 15, 20, 30, 60];
const DOW_KO = '일월화수목금토';
const nowHmStr = () => { const d = new Date(); return fromMin(d.getHours() * 60 + d.getMinutes()); };
const addDayStr = (ymdStr, n) => {
  const d = new Date(`${ymdStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mdLabel = (ymdStr) => {
  const d = new Date(`${ymdStr}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KO[d.getDay()]})`;
};
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/** 24시간 시·분 — 브라우저 시간 입력(오전/오후)을 쓰지 않는다 */
function HmPicker({ value, onChange, label }) {
  const [h, m] = (value || ':').split(':');
  const set = (nh, nm) => onChange(nh === '' && nm === '' ? '' : `${nh || '00'}:${nm || '00'}`);
  return (
    <div className="cs-hm" role="group" aria-label={label}>
      <select value={h ?? ''} onChange={(e) => set(e.target.value, m)} aria-label={`${label} 시`}>
        <option value="">시</option>
        {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <b>:</b>
      <select value={m ?? ''} onChange={(e) => set(h, e.target.value)} aria-label={`${label} 분`}>
        <option value="">분</option>
        {MINUTES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  );
}

function DowntimeDialog({ row, prodDate, today, reasonGroups, onClose, onSave }) {
  const [code, setCode] = useState(row.downCode ?? '');
  // 시작은 비어 있으면 지금 시각으로(생산일자 기준)
  const [start, setStart] = useState(row.downStart || nowHmStr());
  const [end, setEnd] = useState(row.downEnd ?? '');
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [code, start, end]);
  const isToday = prodDate === today;
  const nowHm = nowHmStr;
  const dur = durOf(start, end);
  const overnight = toMin(start) != null && toMin(end) != null && toMin(end) <= toMin(start);
  const groups = reasonGroups.filter(([g]) => g !== '그룹 없음');

  const submit = () => {
    setError('');
    if (!code) { setError('비가동 코드를 고르세요.'); return; }
    if (toMin(start) == null || toMin(end) == null) { setError('시작과 끝 시각을 모두 넣으세요.'); return; }
    if (start === end) { setError('시작과 끝이 같습니다.'); return; }
    if (isToday && toMin(start) > toMin(nowHm())) { setError('앞으로 올 시각은 넣을 수 없습니다.'); return; }
    if (isToday && !overnight && toMin(end) > toMin(nowHm()) + 1) { setError('끝 시각이 지금보다 늦습니다. 아직 끝나지 않았으면 끝난 뒤 넣어주세요.'); return; }
    if (dur > 12 * 60 && !window.confirm(`비가동이 ${durText(dur)}입니다. 맞습니까?`)) return;
    onSave({ downCode: code, downStart: start, downEnd: end });
  };

  return (
    <Modal
      title={`${row.rowNo}번 통 비가동`}
      onClose={onClose}
      large
      className="cs-down-modal"
      footer={(
        <>
          {row.downCode && (
            <button type="button" className="mes-btn mes-btn-secondary cs-btn-danger" onClick={() => onSave({ downCode: '', downStart: '', downEnd: '' })}>비가동 지우기</button>
          )}
          <span className="cs-modal-spacer" />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button>
          <button type="button" className="mes-btn mes-btn-primary" onClick={submit}>저장</button>
        </>
      )}
    >
      <div className="cs-down-form">
        <section>
          <h5>비가동 코드</h5>
          <div className="cs-code-groups">
            {groups.map(([g, list]) => (
              <div key={g} className="cs-code-group">
                <span>{g}</span>
                <div>
                  {list.map((x) => (
                    <button key={x.reasonId} type="button" className={code === x.reasonCode ? 'is-on' : ''} aria-pressed={code === x.reasonCode} onClick={() => setCode(x.reasonCode)}>
                      <b>{x.reasonCode}</b>{x.reasonName}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="cs-time-sec">
          <h5>시간 <small>24시간 · 시작부터 끝까지</small></h5>
          <div className="cs-time-row">
            <span className="cs-time-label">시작</span>
            <span className="cs-time-date">{mdLabel(prodDate)}</span>
            <HmPicker value={start} onChange={setStart} label="시작" />
            <div className="cs-time-quick">
              {row.outTime && <button type="button" onClick={() => setStart(row.outTime)}>출로시간 {row.outTime}</button>}
              <button type="button" onClick={() => setStart(nowHm())}>지금</button>
            </div>
          </div>
          <div className="cs-time-row">
            <span className="cs-time-label">끝</span>
            <span className={`cs-time-date${overnight ? ' is-next' : ''}`}>
              {mdLabel(overnight ? addDayStr(prodDate, 1) : prodDate)}
              {overnight && <em>다음날</em>}
            </span>
            <HmPicker value={end} onChange={setEnd} label="끝" />
            <div className="cs-time-quick">
              {isToday && <button type="button" onClick={() => setEnd(nowHm())}>지금</button>}
            </div>
          </div>
          <div className="cs-dur-quick" role="group" aria-label="시작부터">
            <span>시작부터</span>
            {DURATIONS.map((n) => (
              <button key={n} type="button" disabled={toMin(start) == null} className={dur === n ? 'is-on' : ''} onClick={() => setEnd(fromMin(toMin(start) + n))}>{durText(n)}</button>
            ))}
          </div>
          <p className={`cs-dur-sum${dur == null ? ' is-empty' : ''}`}>
            {dur == null ? '끝 시각(시·분)을 고르면 비가동 시간이 계산됩니다.' : (
              <>
                <b>{mdLabel(prodDate)} {start}</b> ~ <b>{overnight ? `${mdLabel(addDayStr(prodDate, 1))} ` : ''}{end}</b> · 비가동 <b>{durText(dur)}</b>
              </>
            )}
          </p>
          <p className="cs-down-note">저장하면 설비비가동현황에 이 호기·시간으로 자동 등록됩니다. 같은 시간대 비가동이 이미 있으면 저장되지 않습니다.</p>
        </section>
        {error && <div className="mes-error">{error}</div>}
      </div>
    </Modal>
  );
}

function BlurInput({ value, onCommit, ...rest }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => { const v = e.target.value; if (v !== value) onCommit(v.trim()); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

function BlurTextarea({ value, onCommit, ...rest }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return <textarea {...rest} value={text} rows={4} onChange={(e) => setText(e.target.value)} onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value); }} />;
}

const REASON_TYPES = ['고장정지', '계획정지', '대기', '기타'];

/** 비가동 코드 추가·수정 — 기준정보 비가동관리와 같은 목록 */
function ReasonModal({ item, group, onClose, onSaved }) {
  const { user } = useAuth();
  const [f, setF] = useState(() => ({
    reasonCode: item?.reasonCode ?? '',
    reasonName: item?.reasonName ?? '',
    reasonGroup: item?.reasonGroup ?? group ?? GROUPS[0],
    reasonType: item?.reasonType ?? '고장정지',
    useYn: item?.useYn ?? 'Y',
  }));
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.reasonCode.trim() || !f.reasonName.trim()) { setError('코드와 이름을 입력하세요.'); return; }
    try {
      const body = { ...item, ...f, reasonCode: f.reasonCode.trim(), reasonName: f.reasonName.trim(), sortOrder: item?.sortOrder ?? 900, remark: item?.remark ?? '' };
      if (item) await updateReason(item.reasonId, { ...body, updUserId: user?.loginId ?? '', updUserName: user?.userName ?? '' });
      else await createReason({ ...body, regUserId: user?.loginId ?? '', regUserName: user?.userName ?? '' });
      onSaved(item ? '비가동 코드를 고쳤습니다.' : '비가동 코드를 추가했습니다.');
    } catch (err) {
      setError(err?.response?.data?.message ?? '저장에 실패했습니다.');
    }
  };
  return (
    <Modal title={item ? `비가동 코드 수정 — ${item.reasonCode}` : '비가동 코드 추가'} onClose={onClose}
      footer={<><button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button><button type="submit" form="cs-reason-form" className="mes-btn mes-btn-primary">저장</button></>}>
      <form id="cs-reason-form" className="dtm-form" onSubmit={submit}>
        <div className="cs-form-2">
          <label className="mes-field"><span>코드 *</span><input className="dtm-input" value={f.reasonCode} maxLength={20} disabled={Boolean(item)} onChange={set('reasonCode')} placeholder="예) AF" /></label>
          <label className="mes-field"><span>이름 *</span><input className="dtm-input" value={f.reasonName} maxLength={100} onChange={set('reasonName')} placeholder="예) 설비변성로" /></label>
        </div>
        <div className="cs-form-2">
          <label className="mes-field"><span>그룹</span>
            <input className="dtm-input" list="cs-groups" value={f.reasonGroup} maxLength={30} onChange={set('reasonGroup')} />
            <datalist id="cs-groups">{GROUPS.map((g) => <option key={g} value={g} />)}</datalist>
          </label>
          <label className="mes-field"><span>비가동 구분 <small>설비비가동현황 통계</small></span>
            <select className="dtm-input" value={f.reasonType} onChange={set('reasonType')}>{REASON_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </label>
        </div>
        <label className="mes-field"><span>사용</span>
          <select className="dtm-input" value={f.useYn} onChange={set('useYn')}><option value="Y">사용</option><option value="N">미사용(코드표에서 숨김)</option></select>
        </label>
        {error && <div className="mes-error">{error}</div>}
      </form>
    </Modal>
  );
}

/** 불량 구분 추가·수정 — 부적합품관리와 같은 목록 */
function DefectModal({ item, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ defectCode: item?.defectCode ?? '', defectName: item?.defectName ?? '', sortOrder: item?.sortOrder ?? 99, useYn: item?.useYn ?? 'Y' }));
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.defectCode.trim() || !f.defectName.trim()) { setError('코드와 이름을 입력하세요.'); return; }
    try {
      const body = { ...f, defectCode: f.defectCode.trim(), defectName: f.defectName.trim(), sortOrder: Number(f.sortOrder) || 0 };
      if (item) await updateDefectType(item.defectId, body);
      else await createDefectType(body);
      onSaved(item ? '불량 구분을 고쳤습니다.' : '불량 구분을 추가했습니다.');
    } catch (err) {
      setError(err?.response?.data?.message ?? '저장에 실패했습니다.');
    }
  };
  return (
    <Modal title={item ? `불량 구분 수정 — ${item.defectCode}` : '불량 구분 추가'} onClose={onClose}
      footer={<><button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button><button type="submit" form="cs-defect-form" className="mes-btn mes-btn-primary">저장</button></>}>
      <form id="cs-defect-form" className="dtm-form" onSubmit={submit}>
        <div className="cs-form-2">
          <label className="mes-field"><span>코드 *</span><input className="dtm-input" value={f.defectCode} maxLength={10} disabled={Boolean(item)} onChange={set('defectCode')} placeholder="예) A" /></label>
          <label className="mes-field"><span>이름 *</span><input className="dtm-input" value={f.defectName} maxLength={50} onChange={set('defectName')} placeholder="예) 경도불량" /></label>
        </div>
        <div className="cs-form-2">
          <label className="mes-field"><span>순서</span><input className="dtm-input" type="number" value={f.sortOrder} onChange={set('sortOrder')} /></label>
          <label className="mes-field"><span>사용</span>
            <select className="dtm-input" value={f.useYn} onChange={set('useYn')}><option value="Y">사용</option><option value="N">미사용</option></select>
          </label>
        </div>
        {error && <div className="mes-error">{error}</div>}
      </form>
    </Modal>
  );
}
