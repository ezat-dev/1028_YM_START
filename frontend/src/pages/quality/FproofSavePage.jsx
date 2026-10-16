import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconShieldCheck, IconSettings, IconRestore } from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import {
  getEquips, getSelected, selectTag, deselectTag, saveTrigger, resetTrigger,
} from '../../api/quality/fproofApi';
import './FproofPage.css';

const LEVEL_TEXT = { 1: 'INFO', 2: 'WARN', 3: 'ERROR' };

function errMsg(err, fallback) {
  return err.response?.data?.message ?? fallback;
}

// ── 알람 태그 한 줄 ──
// 왼쪽(미지정) 항목은 화살표가 오른쪽 끝에, 오른쪽(지정) 항목은 왼쪽 끝에 붙는다.
function TagItem({ tag, side, isNew, trigger, readOnly, busy, anim, onClick }) {
  const isStart = trigger?.startTagId === tag.tagId;
  const isEnd = trigger?.endTagId === tag.tagId;
  const cls = ['fp-item', readOnly && 'is-readonly', busy && 'is-busy', isNew && 'is-new', anim]
    .filter(Boolean).join(' ');
  const arrow = side === 'avail'
    ? <span className="fp-arrow to-sel">›</span>
    : <span className="fp-arrow to-avail">‹</span>;

  return (
    <div className={cls} onClick={readOnly ? undefined : onClick} title={readOnly ? undefined : (side === 'avail' ? '클릭하면 F/PROOF 대상으로 지정' : '클릭하면 지정 해제')}>
      {side === 'sel' && !readOnly && arrow}
      <div className="fp-seq">{tag.tagId}</div>
      <div className="fp-item-info">
        <div className="fp-item-row">
          <span className="fp-item-name">{tag.tagName}</span>
          <span className="fp-item-addr">{tag.address}</span>
          <span className={`fp-lv lv-${tag.level}`}>{LEVEL_TEXT[tag.level] ?? 'INFO'}</span>
          {isStart && <span className="fp-chip is-start">START</span>}
          {isEnd && <span className="fp-chip is-end">END</span>}
        </div>
        <div className="fp-item-row">
          <span className="fp-item-msg">{tag.alarmMsg}</span>
          {isNew && <span className="fp-chip is-save">SAVE</span>}
        </div>
      </div>
      {side === 'avail' && !readOnly && arrow}
    </div>
  );
}

// ── 설비별 시작/종료 트리거 설정 모달 ──
function draftOf(equip) {
  return { start: equip.startTagId != null ? String(equip.startTagId) : '', end: equip.endTagId != null ? String(equip.endTagId) : '' };
}

function buildDrafts(equips) {
  const drafts = {};
  equips.forEach((e) => { drafts[e.folderId] = draftOf(e); });
  return drafts;
}

function TriggerModal({ equips, canEdit, onClose, onChanged, showToast }) {
  const [drafts, setDrafts] = useState(() => buildDrafts(equips));
  const [workingId, setWorkingId] = useState(null);

  const setDraft = (folderId, patch) => {
    setDrafts((prev) => ({ ...prev, [folderId]: { ...prev[folderId], ...patch } }));
  };

  const handleSave = async (equip) => {
    const d = drafts[equip.folderId];
    setWorkingId(equip.folderId);
    try {
      await saveTrigger(equip.folderId, Number(d.start), Number(d.end));
      await onChanged();
      showToast(`${equip.folderName} 트리거를 저장했습니다.`);
    } catch (err) {
      showToast(errMsg(err, '트리거 저장에 실패했습니다.'), 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const handleReset = async (equip) => {
    setWorkingId(equip.folderId);
    try {
      await resetTrigger(equip.folderId);
      const list = await onChanged();
      const fresh = list?.find((e) => e.folderId === equip.folderId);
      if (fresh) setDraft(equip.folderId, draftOf(fresh));
      showToast(`${equip.folderName} 트리거를 기본값으로 되돌렸습니다.`);
    } catch (err) {
      showToast(errMsg(err, '기본값 복원에 실패했습니다.'), 'error');
    } finally {
      setWorkingId(null);
    }
  };

  const optionLabel = (t) => `${t.tagName} · ${t.address} · ${t.alarmMsg}`;

  return (
    <Modal
      title="F/PROOF 시작·종료 트리거 설정"
      onClose={onClose}
      xl
      footer={<button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>닫기</button>}
    >
      <p className="fp-trig-hint">
        설비마다 F/PROOF 구간의 시작·종료로 쓸 알람 태그를 고릅니다.
        F/PROOF LIST는 <b>시작 알람이 발생한 시각부터 그 뒤 처음 발생한 종료 알람까지</b>를 한 세션으로 봅니다.
        지정하지 않은 설비는 알람 문구가 &apos;Fool Proof 시작&apos; / &apos;Fool Proof 종료&apos;인 태그를 기본값으로 씁니다.
      </p>
      <table className="fp-trig-table">
        <thead>
          <tr>
            <th>설비</th>
            <th>시작 트리거</th>
            <th>종료 트리거</th>
            <th>상태</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {equips.map((equip) => {
            const d = drafts[equip.folderId] ?? { start: '', end: '' };
            const hasBoth = d.start !== '' && d.end !== '';
            const same = hasBoth && d.start === d.end;
            const dirty = d.start !== (equip.startTagId != null ? String(equip.startTagId) : '')
              || d.end !== (equip.endTagId != null ? String(equip.endTagId) : '');
            // 기본값을 쓰는 설비는 값이 그대로여도 "지정"으로 확정할 수 있다.
            const canSave = canEdit && hasBoth && !same && (dirty || !equip.custom);
            const working = workingId === equip.folderId;
            const stateCls = equip.custom ? 'is-custom' : (equip.startTagId != null && equip.endTagId != null ? 'is-default' : 'is-none');
            const stateText = equip.custom ? '지정됨' : (stateCls === 'is-default' ? '기본값' : '미설정');

            return (
              <tr key={equip.folderId}>
                <td className="fp-trig-equip">{equip.folderName}</td>
                <td>
                  <select
                    className="mes-field-inline fp-trig-select"
                    value={d.start}
                    disabled={!canEdit || working}
                    onChange={(e) => setDraft(equip.folderId, { start: e.target.value })}
                  >
                    <option value="">선택하세요</option>
                    {equip.tags.map((t) => <option key={t.tagId} value={String(t.tagId)}>{optionLabel(t)}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    className="mes-field-inline fp-trig-select"
                    value={d.end}
                    disabled={!canEdit || working}
                    onChange={(e) => setDraft(equip.folderId, { end: e.target.value })}
                  >
                    <option value="">선택하세요</option>
                    {equip.tags.map((t) => <option key={t.tagId} value={String(t.tagId)}>{optionLabel(t)}</option>)}
                  </select>
                </td>
                <td><span className={`fp-trig-state ${stateCls}`}>{stateText}</span></td>
                <td>
                  <div className="fp-trig-actions">
                    <button
                      type="button"
                      className="mes-btn mes-btn-primary"
                      disabled={!canSave || working}
                      title={same ? '시작과 종료는 서로 다른 태그여야 합니다' : undefined}
                      onClick={() => handleSave(equip)}
                    >
                      {working ? '처리 중...' : '저장'}
                    </button>
                    {equip.custom && (
                      <button
                        type="button"
                        className="mes-btn mes-btn-secondary"
                        disabled={!canEdit || working}
                        title="지정을 지우고 'Fool Proof 시작/종료' 문구 기본값으로 되돌립니다"
                        onClick={() => handleReset(equip)}
                      >
                        <IconRestore size={14} /> 기본값
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}

export default function FproofSavePage() {
  const [equips, setEquips] = useState([]);
  const [folderId, setFolderId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [newlyAdded, setNewlyAdded] = useState(new Set());
  const [movedTo, setMovedTo] = useState(null);   // { tagId, to: 'sel' | 'avail' } — 방금 옮겨진 항목(입장 애니메이션용)
  const [busy, setBusy] = useState(new Set());
  const [loadingEquips, setLoadingEquips] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);

  const { toast, showToast } = useToast();
  const permission = usePermission('/quality/fproofSave');

  // 설비 목록(+트리거·알람 태그). 저장/초기화 뒤에도 다시 불러오므로 새 목록을 돌려준다.
  const fetchEquips = useCallback(async () => {
    try {
      const res = await getEquips();
      const list = res.data ?? [];
      setEquips(list);
      setFolderId((cur) => (cur != null && list.some((e) => e.folderId === cur) ? cur : (list[0]?.folderId ?? null)));
      setLoadError(false);
      return list;
    } catch (err) {
      setLoadError(true);
      showToast(errMsg(err, '설비 목록을 불러오지 못했습니다.'), 'error');
      return undefined;
    } finally {
      setLoadingEquips(false);
    }
  }, [showToast]);

  useEffect(() => { fetchEquips(); }, [fetchEquips]);

  // 설비를 바꾸면 그 설비의 지정 목록을 새로 가져온다.
  useEffect(() => {
    if (folderId == null) return undefined;
    let cancelled = false;
    setLoadingList(true);
    setNewlyAdded(new Set());
    setMovedTo(null);
    getSelected(folderId)
      .then((res) => {
        if (cancelled) return;
        setSelectedIds(new Set(res.data ?? []));
        setLoadError(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setSelectedIds(new Set());
        setLoadError(true);
        showToast(errMsg(err, '지정 목록을 불러오지 못했습니다.'), 'error');
      })
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [folderId, showToast]);

  const equip = useMemo(() => equips.find((e) => e.folderId === folderId) ?? null, [equips, folderId]);
  const tags = useMemo(() => equip?.tags ?? [], [equip]);
  const avail = useMemo(() => tags.filter((t) => !selectedIds.has(t.tagId)), [tags, selectedIds]);
  const sel = useMemo(() => tags.filter((t) => selectedIds.has(t.tagId)), [tags, selectedIds]);
  const trigger = equip ? { startTagId: equip.startTagId, endTagId: equip.endTagId } : null;

  const applyMove = (tagId, toSel) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (toSel) next.add(tagId); else next.delete(tagId);
      return next;
    });
    setNewlyAdded((prev) => {
      const next = new Set(prev);
      if (toSel) next.add(tagId); else next.delete(tagId);
      return next;
    });
    setMovedTo({ tagId, to: toSel ? 'sel' : 'avail' });
  };

  // 화면에서 먼저 옮기고 서버에 반영한다. 서버가 거절하면 되돌리고 알려준다(화면과 DB가 어긋나지 않게).
  const move = async (tag, toSel) => {
    if (!permission.canUpdate || busy.has(tag.tagId)) return;
    setBusy((prev) => new Set(prev).add(tag.tagId));
    applyMove(tag.tagId, toSel);
    try {
      await (toSel ? selectTag : deselectTag)(tag.tagId, folderId);
    } catch (err) {
      applyMove(tag.tagId, !toSel);
      setMovedTo(null);
      showToast(errMsg(err, toSel ? '지정에 실패했습니다.' : '해제에 실패했습니다.'), 'error');
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(tag.tagId);
        return next;
      });
    }
  };

  const renderList = (list, side) => {
    if (loadingEquips || loadingList) return <div className="fp-empty">불러오는 중…</div>;
    if (loadError) return <div className="fp-empty">로드 실패</div>;
    if (equips.length === 0) return <div className="fp-empty">설비(알람 폴더)가 없습니다</div>;
    if (list.length === 0) {
      return <div className="fp-empty">{side === 'avail' ? '등록 가능한 태그가 없습니다' : '지정된 알람이 없습니다'}</div>;
    }
    return list.map((tag) => {
      const anim = movedTo?.tagId === tag.tagId
        ? (movedTo.to === 'sel' ? 'anim-in-sel' : 'anim-in-avail')
        : undefined;
      return (
        <TagItem
          key={tag.tagId}
          tag={tag}
          side={side}
          isNew={side === 'sel' && newlyAdded.has(tag.tagId)}
          trigger={trigger}
          readOnly={!permission.canUpdate}
          busy={busy.has(tag.tagId)}
          anim={anim}
          onClick={() => move(tag, side === 'avail')}
        />
      );
    });
  };

  return (
    <div className="mes-page mes-page-fill">
      <div className="fp-header-card">
        <div className="fp-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon">
              <IconShieldCheck size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">F/PROOF SAVE</h2>
              <p className="mes-page-desc">설비별 F/PROOF 대상 알람 태그를 지정합니다.</p>
            </div>
          </div>
          <div className="fp-header-controls">
            <span className="fp-control-label">설비 선택</span>
            <select
              className="mes-field-inline fp-equip-select"
              value={folderId ?? ''}
              disabled={equips.length === 0}
              onChange={(e) => setFolderId(Number(e.target.value))}
            >
              {equips.map((e) => <option key={e.folderId} value={e.folderId}>{e.folderName}</option>)}
            </select>
            <button
              type="button"
              className="mes-btn mes-btn-secondary fp-icon-btn"
              title="설비별 시작·종료 트리거 설정"
              aria-label="설비별 시작·종료 트리거 설정"
              disabled={equips.length === 0}
              onClick={() => setTriggerOpen(true)}
            >
              <IconSettings size={17} />
            </button>
          </div>
        </div>
        {!permission.loading && !permission.canUpdate && (
          <div className="fp-notice">수정 권한이 없어 조회만 가능합니다. (기준정보 &gt; 사용자권한에서 이 메뉴의 수정 권한을 부여하세요)</div>
        )}
      </div>

      <div className="fp-panels">
        <div className="fp-panel">
          <div className="fp-panel-hd">
            <span className="fp-panel-title">{equip ? `${equip.folderName} 등록 가능 알람 태그` : '등록 가능 알람 태그'}</span>
            <span className="fp-badge">{avail.length}건</span>
          </div>
          <div className="fp-list">{renderList(avail, 'avail')}</div>
        </div>

        <div className="fp-mid" aria-hidden="true">
          <span>›</span>
          <span>›</span>
        </div>

        <div className="fp-panel">
          <div className="fp-panel-hd">
            <span className="fp-panel-title">F/PROOF 지정 알람</span>
            <span className="fp-badge is-sel">{sel.length}건</span>
          </div>
          <div className="fp-list">{renderList(sel, 'sel')}</div>
        </div>
      </div>

      {triggerOpen && (
        <TriggerModal
          equips={equips}
          canEdit={permission.canUpdate}
          onClose={() => setTriggerOpen(false)}
          onChanged={fetchEquips}
          showToast={showToast}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
