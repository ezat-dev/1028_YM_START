import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconTimeline, IconX, IconPlayerPauseFilled, IconPlayerPlayFilled,
  IconAlertTriangleFilled, IconTool, IconFlame, IconArrowsExchange,
} from '@tabler/icons-react';
import { STATUS_LABEL, fetchMockPatterns } from '../../mocks/furnaceMock';
import { createLotTrackingMock } from '../../mocks/lotTrackingMock';
import { getTrackingSnapshot } from '../../api/monitoring/lotTrackingApi';
import { STAGES, SLOT_COUNT, stageOfSlot, slotCenter } from '../../constants/furnaceLayout';
import './LotTrackingPage.css';

/*
 * 모니터링 > LOT 트래킹 — 연속열처리로 6대를 가로 레인 6줄로 놓고, 벨트 위 트레이(LOT)가 어느 슬롯에 있는지 보여준다.
 *
 * 흐름: PLC 트래킹 테이블 → C# PlcApiServer 캐시(2초 주기) → 화면이 POLL_MS마다 스냅샷 조회.
 * 화면은 시간으로 위치를 '추측'하지 않고, 받은 슬롯 번호에만 트레이를 놓는다.
 * 이송 카운터가 바뀌어 슬롯이 달라진 트레이만 새 자리로 MOVE_MS 동안 미끄러지고, 새로 장입된 트레이는 장입 칸에
 * 내려앉고, 배출된 트레이는 레인 밖으로 빠지며 사라진다. 조회가 늦거나 끊겨도 마지막으로 받은 위치에 멈춰 있다.
 *
 * 지금은 목업(USE_MOCK) — 서버 API가 준비되면 false로 바꾸면 같은 화면이 실데이터로 동작한다.
 */
const USE_MOCK = true;
const POLL_MS = 3000;          // 스냅샷 조회 주기 (C# PlcMonitor 2초 캐시보다 약간 길게)
const MOVE_MS = 1800;          // 한 피치 이동 애니메이션 길이
const LEAVE_KEEP_MS = 2400;    // 배출된 트레이를 화면에 남겨 두는 시간(빠져나가는 애니메이션용)
const STALE_MS = POLL_MS * 4;  // 이만큼 새 데이터가 없으면 '수신 지연'
const CHANGED_SHOW_MS = 10000;

// 제품 색 — 범주형 팔레트에서 열처리 색(주황)·알람 색(빨강)과 헷갈리는 칸은 뺐다. 색만으로 구분하지 않도록 품명·범례를 함께 쓴다.
const PRODUCT_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#008300'];
const OTHER_COLOR = '#8a929c';

const STAGE_COLS = STAGES.map((s) => `${s.slots}fr`).join(' ');

const pad = (n, l = 2) => String(n).padStart(l, '0');

function timeText(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDuration(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분 ${sec % 60}초`;
  return `${sec}초`;
}

/**
 * 새 스냅샷을 화면용 트레이 목록으로 — 이전 목록과 LOT번호로 맞춰 본다.
 * 같은 LOT는 같은 트레이(같은 key)로 남겨야 슬롯이 바뀔 때 CSS transition으로 미끄러진다.
 */
function reconcile(prevView, snap, now) {
  return snap.furnaces.map((f) => {
    const prev = prevView?.find((p) => p.code === f.code);
    const prevTrays = new Map((prev?.trays ?? []).map((t) => [t.lotNo, t]));
    const onBelt = new Set();
    const trays = [];

    f.slots.forEach((lotNo, slot) => {
      if (!lotNo) return;
      onBelt.add(lotNo);
      const old = prevTrays.get(lotNo);
      trays.push({ ...f.lots[lotNo], slot, leaving: false, fresh: Boolean(prev) && !old });
    });

    // 이번 스냅샷에서 사라진 트레이 = 배출. 레인 밖 칸(SLOT_COUNT)으로 보내 빠져나가게 하고 잠시 뒤 지운다.
    (prev?.trays ?? []).forEach((t) => {
      if (onBelt.has(t.lotNo)) return;
      if (t.leaving) {
        if (now - t.leftAt < LEAVE_KEEP_MS) trays.push(t);
        return;
      }
      trays.push({ ...t, slot: SLOT_COUNT, leaving: true, fresh: false, leftAt: now });
    });

    const moved = Boolean(prev) && prev.moveCount !== f.moveCount;
    return { ...f, trays, movingUntil: moved ? now + MOVE_MS : (prev?.movingUntil ?? 0) };
  });
}

export default function LotTrackingPage() {
  const [source, setSource] = useState(null);   // { fetchSnapshot }
  const [view, setView] = useState(null);       // 레인별 화면 상태
  const [polledAt, setPolledAt] = useState(null);
  const [lastOkAt, setLastOkAt] = useState(null);
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(null); // { lotNo, code, snap }

  // 데이터 출처 — 목업은 패턴관리의 제품으로 가짜 스냅샷을 만들고, 실서버는 API를 그대로 부른다
  useEffect(() => {
    if (!USE_MOCK) {
      setSource({ fetchSnapshot: getTrackingSnapshot });
      return;
    }
    fetchMockPatterns().then((patterns) => setSource(createLotTrackingMock(patterns)));
  }, []);

  // ── 조회 루프: 응답이 와야 다음 조회를 예약한다(느린 응답이 겹쳐 쌓이지 않게) ──
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (!source || paused) return undefined;
    let alive = true;
    let timer;
    const poll = () => {
      source.fetchSnapshot()
        .then((snap) => {
          if (!alive) return;
          const t = Date.now();
          const next = reconcile(viewRef.current, snap, t);
          viewRef.current = next;
          setView(next);
          setPolledAt(snap.polledAt ?? t);
          setLastOkAt(t);
          setError(false);
        })
        .catch(() => { if (alive) setError(true); })
        .finally(() => { if (alive) timer = setTimeout(poll, POLL_MS); });
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [source, paused]);

  // 1초 시계 — 경과 시간, '이송 n초 전', 수신 지연 판단용
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Esc로 선택 해제
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 제품별 색 — 처음 본 순서대로 고정(필터나 개수에 따라 색이 바뀌지 않게)
  const colorMapRef = useRef(new Map());
  const colorOf = useCallback((partNo) => {
    const map = colorMapRef.current;
    if (!map.has(partNo)) map.set(partNo, PRODUCT_COLORS[map.size] ?? OTHER_COLOR);
    return map.get(partNo);
  }, []);

  const products = useMemo(() => {
    const map = new Map();
    (view ?? []).forEach((l) => l.trays.forEach((t) => {
      if (t.leaving) return;
      const cur = map.get(t.partNo) ?? { partNo: t.partNo, productName: t.productName, count: 0 };
      cur.count += 1;
      map.set(t.partNo, cur);
    }));
    return [...map.values()];
  }, [view]);

  if (!view) {
    return (
      <div className="mes-page lt-page mes-page-fill">
        <div className="lt-loading">{error ? '트래킹 데이터를 받지 못했습니다. 잠시 후 다시 시도합니다.' : 'LOT 위치를 불러오는 중…'}</div>
      </div>
    );
  }

  const onBelt = view.flatMap((l) => l.trays.filter((t) => !t.leaving).map((t) => ({ tray: t, lane: l })));
  const summary = {
    running: view.filter((l) => l.status !== 'idle').length,
    inFurnace: onBelt.length,
    inToday: view.reduce((a, l) => a + (l.inToday ?? 0), 0),
    outToday: view.reduce((a, l) => a + (l.outToday ?? 0), 0),
  };
  const stale = !paused && lastOkAt && now - lastOkAt > STALE_MS;
  const linkState = paused ? 'paused' : (error || stale) ? 'stale' : 'live';

  // 선택한 LOT — 배출되어 사라져도 마지막 모습으로 상세를 남긴다
  let sel = null;
  if (selected) {
    const lane = view.find((l) => l.code === selected.code);
    const tray = lane?.trays.find((t) => t.lotNo === selected.lotNo && !t.leaving);
    sel = tray ? { tray, lane } : { tray: selected.snap, lane, gone: true };
  }

  const pick = (tray, lane) => {
    setSelected((cur) => (cur?.lotNo === tray.lotNo ? null : { lotNo: tray.lotNo, code: lane.code, snap: tray }));
  };

  return (
    <div className={`mes-page lt-page mes-page-fill${paused ? ' is-paused' : ''}`}>
      {/* ── 상단: 제목 | 요약 | 수신 상태 ── */}
      <div className="lt-header">
        <div className="lt-title">
          <div className="mes-page-icon"><IconTimeline size={20} /></div>
          <div>
            <h2 className="mes-page-title">LOT 트래킹</h2>
            {USE_MOCK && (
              <span className="lt-mock-badge" title="PLC 연동 전 예시 데이터입니다. 이송 간격은 실제보다 짧게 잡았습니다.">
                화면 예시 · MOCK
              </span>
            )}
          </div>
        </div>

        <dl className="lt-kpis">
          <div className="lt-kpi"><dt>가동 설비</dt><dd>{summary.running}<small>/{view.length}</small></dd></div>
          <div className="lt-kpi"><dt>로 내 LOT</dt><dd>{summary.inFurnace}</dd></div>
          <div className="lt-kpi"><dt>금일 투입</dt><dd>{summary.inToday.toLocaleString()}</dd></div>
          <div className="lt-kpi"><dt>금일 배출</dt><dd>{summary.outToday.toLocaleString()}</dd></div>
        </dl>

        <div className={`lt-link is-${linkState}`} title={`${POLL_MS / 1000}초마다 위치를 조회합니다`}>
          <span className="lt-link-dot" aria-hidden="true" />
          <div className="lt-link-text">
            <span>{linkState === 'paused' ? '조회 멈춤' : linkState === 'stale' ? '수신 지연' : '실시간'}</span>
            <strong>{polledAt ? timeText(polledAt) : '-'}</strong>
          </div>
          <button
            type="button"
            className="mes-btn mes-btn-secondary lt-pause"
            onClick={() => setPaused((v) => !v)}
            aria-pressed={paused}
            title={paused ? '조회 다시 시작' : '조회 멈춤(화면 고정)'}
            aria-label={paused ? '조회 다시 시작' : '조회 멈춤'}
          >
            {paused ? <IconPlayerPlayFilled size={14} /> : <IconPlayerPauseFilled size={14} />}
          </button>
        </div>
      </div>

      {/* ── 레인 6줄 ── */}
      <div
        className={`lt-board${sel ? ' is-focusing' : ''}`}
        style={{ '--stage-cols': STAGE_COLS, '--slots': SLOT_COUNT, '--move': `${MOVE_MS}ms` }}
      >
        <div className="lt-board-inner">
          <div className="lt-stagehead" aria-hidden="true">
            <div className="lt-stagehead-corner">설비</div>
            <div className="lt-stagehead-grid">
              {STAGES.map((s, i) => {
                if (s.zone) {
                  return (
                    <span key={s.key} className={`lt-zone-no is-${s.kind}`} style={{ gridColumn: `${i + 1}`, gridRow: '2' }}>{s.zone}</span>
                  );
                }
                return <span key={s.key} className={`is-${s.kind}`} style={{ gridColumn: `${i + 1}`, gridRow: '1 / 3' }}>{s.name}</span>;
              })}
              <span className="is-q is-group" style={{ gridColumn: '2 / 7' }}><IconFlame size={12} /> 퀜칭로</span>
              <span className="is-t is-group" style={{ gridColumn: '9 / 14' }}>템퍼링로</span>
            </div>
          </div>

          <div className="lt-lanes">
            {view.map((lane) => (
              <Lane
                key={lane.code}
                lane={lane}
                now={now}
                colorOf={colorOf}
                selectedLot={sel?.tray.lotNo}
                onPick={pick}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── 하단: 선택한 LOT 상세 / 선택 없으면 제품 범례 ── */}
      <div className="lt-foot" aria-live="polite">
        {sel ? (
          <LotDetail sel={sel} now={now} color={colorOf(sel.tray.partNo)} onClose={() => setSelected(null)} />
        ) : (
          <div className="lt-legend">
            <span className="lt-legend-title">벨트 위 제품</span>
            {products.map((p) => (
              <span key={p.partNo} className="lt-legend-item">
                <i style={{ background: colorOf(p.partNo) }} />
                <strong>{p.productName}</strong>
                <span>{p.partNo}</span>
                <em>{p.count}</em>
              </span>
            ))}
            <span className="lt-legend-hint">트레이를 누르면 LOT 상세와 현재 위치가 표시됩니다 · Esc 해제</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Lane({ lane, now, colorOf, selectedLot, onPick }) {
  const idle = lane.status === 'idle';
  const alarm = lane.status === 'alarm';
  const moving = lane.movingUntil > now;
  const live = lane.trays.filter((t) => !t.leaving);
  const alarmStage = lane.alarm ? STAGES.find((s) => s.key === lane.alarm.zone) : null;
  const justChanged = Boolean(lane.patternChangedAt) && now - lane.patternChangedAt < CHANGED_SHOW_MS;

  return (
    <section className={`lt-lane is-${lane.status}${moving ? ' is-moving' : ''}`} aria-label={`${lane.code} ${lane.name ?? ''} ${STATUS_LABEL[lane.status]}`}>
      <div className="lt-info" title={idle ? undefined : `이송 주기 약 ${lane.pitchSec}초`}>
        <div className="lt-info-top">
          <strong>{lane.code}</strong>
          <span className={`lt-status is-${lane.status}`}>
            {alarm && <IconAlertTriangleFilled size={11} />}
            {idle && <IconTool size={11} />}
            {STATUS_LABEL[lane.status]}
          </span>
        </div>
        {idle ? (
          <div className="lt-info-line is-muted">{lane.idleReason ?? '정지'}</div>
        ) : (
          <div className={`lt-info-line lt-info-pattern${justChanged ? ' is-changed' : ''}`} title="지금 장입 중인 패턴 · 제품">
            {justChanged && <IconArrowsExchange size={12} />}
            <i style={{ background: colorOf(lane.pattern.partNo) }} />
            <span className="lt-info-code">{lane.pattern.patternCode}</span>
            <span className="lt-info-name">{lane.pattern.productName}</span>
          </div>
        )}
        <div className="lt-info-line lt-info-count">
          로 내 <b>{live.length}</b>
          <span aria-hidden="true">·</span>
          {idle || !lane.lastMoveAt
            ? <>배출 <b>{lane.outToday}</b></>
            : moving
              ? <span className="lt-moving">이송 중</span>
              : <>이송 <b>{fmtDuration(now - lane.lastMoveAt)}</b> 전</>}
        </div>
      </div>

      <div className="lt-track">
        {/* 구간 바탕 */}
        <div className="lt-bands" aria-hidden="true">
          {STAGES.map((s) => (
            <span key={s.key} className={`lt-band is-${s.kind}${alarmStage?.key === s.key ? ' is-alarm' : ''}`}>
              {alarmStage?.key === s.key && (
                <span className="lt-band-alarm"><IconAlertTriangleFilled size={10} />{lane.alarm.message.replace(/^퀜칭로 \d존 /, '')}</span>
              )}
            </span>
          ))}
        </div>

        {/* 벨트 — 이송하는 동안에만 롤러가 돈다 */}
        <div className={`lt-rail${moving ? ' is-moving' : ''}`} aria-hidden="true" />

        {/* 트레이 — 슬롯 위치(--x)만 바뀌고, 바뀌면 transition으로 미끄러진다 */}
        {lane.trays.map((t) => {
          const st = t.leaving ? null : stageOfSlot(t.slot);
          const cls = [
            'lt-tray',
            t.fresh ? 'is-new' : '',
            t.leaving ? 'is-leaving' : '',
            selectedLot === t.lotNo ? 'is-selected' : '',
            t.alarmPass ? 'is-flag' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={t.lotNo}
              type="button"
              className={cls}
              style={{ '--x': slotCenter(t.slot), '--c': colorOf(t.partNo) }}
              onClick={() => onPick(t, lane)}
              aria-pressed={selectedLot === t.lotNo}
              aria-label={`${t.lotNo} ${t.productName}, ${st ? st.name : '배출'}${t.alarmPass ? ', 알람 구간 통과' : ''}`}
              title={`${t.lotNo} · ${t.partNo} ${t.productName}\n${st ? st.name : '배출'}`}
              tabIndex={t.leaving ? -1 : 0}
            >
              <span className="lt-tray-body">
                <strong>{t.productName}</strong>
                <small>{t.seqText.slice(-3)}</small>
                {t.alarmPass && <span className="lt-tray-flag" aria-hidden="true"><IconAlertTriangleFilled size={9} /></span>}
              </span>
            </button>
          );
        })}

        {idle && (
          <div className="lt-idle">
            <IconTool size={15} />
            <span>{lane.idleReason ?? '정지'} · 설비 정지</span>
          </div>
        )}
      </div>
    </section>
  );
}

function LotDetail({ sel, now, color, onClose }) {
  const { tray, lane, gone } = sel;
  const st = gone ? null : stageOfSlot(tray.slot);
  const remainSlots = gone ? 0 : SLOT_COUNT - tray.slot;
  // 남은 시간 = 남은 이송 횟수 × 이송 주기 − 마지막 이송 뒤 지난 시간 (실데이터에서도 같은 계산)
  const remainMs = lane?.lastMoveAt ? remainSlots * lane.pitchSec * 1000 - (now - lane.lastMoveAt) : null;
  const markX = gone ? 1 : slotCenter(tray.slot);

  return (
    <div className="lt-detail" style={{ '--c': color }}>
      <div className="lt-detail-id">
        <span className="lt-detail-lot">{tray.lotNo}</span>
        <span className="lt-detail-sub">{lane?.code} · {tray.company}</span>
      </div>
      <div className="lt-detail-prod">
        <strong>{tray.productName}</strong>
        <span>{tray.partNo} · 패턴 {tray.patternCode}</span>
      </div>
      <div className="lt-detail-where">
        <span className="lt-detail-stage">{gone ? '배출 완료' : st.name}</span>
        <div className="lt-mini" style={{ '--stage-cols': STAGE_COLS }} aria-hidden="true">
          {STAGES.map((s) => <i key={s.key} className={`is-${s.kind}${st?.key === s.key ? ' is-here' : ''}`} />)}
          <b style={{ left: `${markX * 100}%` }} />
        </div>
        <span className="lt-detail-pos">{gone ? `${SLOT_COUNT}/${SLOT_COUNT}` : `${tray.slot + 1}/${SLOT_COUNT}`}<small>칸</small></span>
      </div>
      <dl className="lt-detail-time">
        <div><dt>장입</dt><dd>{timeText(tray.enterAt)}</dd></div>
        <div><dt>경과</dt><dd>{gone ? '-' : fmtDuration(now - tray.enterAt)}</dd></div>
        <div><dt>배출 예상</dt><dd>{gone ? '-' : remainMs != null ? `약 ${fmtDuration(Math.max(0, remainMs))} 후` : '-'}</dd></div>
      </dl>
      {tray.alarmPass && lane?.alarm && (
        <span className="lt-detail-flag">
          <IconAlertTriangleFilled size={12} />
          알람 구간 통과 · 품질 확인
        </span>
      )}
      <button type="button" className="lt-detail-close" onClick={onClose} aria-label="선택 해제" title="선택 해제 (Esc)">
        <IconX size={15} />
      </button>
    </div>
  );
}
