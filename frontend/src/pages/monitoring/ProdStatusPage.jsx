import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconChartBar, IconPlayerPlayFilled, IconPlayerPauseFilled, IconAlertTriangleFilled,
  IconArrowsExchange, IconFlame, IconRotateClockwise, IconRefresh, IconMaximize, IconMinimize,
} from '@tabler/icons-react';
import { FURNACES, STATUS_LABEL, fetchMockPatterns } from '../../mocks/furnaceMock';
import { useSidebar } from '../../context/SidebarContext';
import './ProdStatusPage.css';

/*
 * 모니터링 > 종합생산현황 — 화면 예시(목업).
 * 연속열처리로 6대(MBF1~6)의 벨트 위 트레이 위치, 존 온도, 현재 패턴을 보여준다.
 * 패턴·제품은 기준정보 > 패턴관리의 실제 데이터를 쓰고(없으면 아래 예시값), 온도 변동·트레이 이동·패턴 교체·알람은
 * 화면 안에서 흉내 낸다. 현장 PLC 태그를 확인한 뒤 simulate()/initFurnaces()를 실데이터 조회로 바꾸면 된다.
 */

// 벨트 위치: 장입 → 퀜칭로 1~5존 → 오일조 → 세정 → 템퍼링로 1~5존 → 배출
const STAGES = [
  { key: 'load', label: '장입', kind: 'load' },
  ...[1, 2, 3, 4, 5].map((z) => ({ key: `q${z}`, label: `${z}`, kind: 'q', zone: z })),
  { key: 'oil', label: '오일조', kind: 'oil' },
  { key: 'wash', label: '세정', kind: 'wash' },
  ...[1, 2, 3, 4, 5].map((z) => ({ key: `t${z}`, label: `${z}`, kind: 't', zone: z })),
  { key: 'out', label: '배출', kind: 'out' },
];
const N = STAGES.length;
const TICK_MS = 2500;            // 온도 갱신 주기
// 벨트는 로마다 따로, 틱마다 이 확률로 한 칸 전진 → 평균 약 12.5초에 한 칸, 장입~배출 약 3분
const BELT_STEP_CHANCE = 0.2;
// 투입은 4~5개씩 연달아, 묶음 사이는 3~4칸 비운다(LOT 트래킹과 같은 방식)
const BATCH_MIN = 4;
const BATCH_MAX = 5;
const GAP_MIN = 3;
const GAP_MAX = 4;
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// 다음 칸에 트레이를 넣을지 정하는 투입기 — { left: 이번 묶음에 남은 개수, gap: 남은 빈 칸 }
function feedStep(feed) {
  if (feed.left > 0) {
    const left = feed.left - 1;
    return { put: true, feed: left > 0 ? { left, gap: 0 } : { left: 0, gap: randInt(GAP_MIN, GAP_MAX) } };
  }
  const gap = feed.gap - 1;
  return { put: false, feed: gap > 0 ? { left: 0, gap } : { left: randInt(BATCH_MIN, BATCH_MAX), gap: 0 } };
}
// 패턴 교체는 18틱(약 45초)에 한 번, 가동 중인 로 하나만
const PATTERN_CHANGE_EVERY = 18;

// 카드 아래 슬라이드 — 6대가 같은 장을 동시에 보여줘서 설비끼리 비교하기 쉽게
const SLIDES = [
  { key: 'lot', label: 'LOT' },
  { key: 'alarm', label: '알람' },
  { key: 'energy', label: '전력·비가동' },
  { key: 'cond', label: '운전 조건' },
];
const SLIDE_MS = 8000;

// 비가동 사유 — 범주형 1~3번 색 (흰 바탕 색약 검증 통과, 청록은 대비가 낮아 항상 글자 라벨과 함께)
const DOWN_CAUSES = [
  { key: 'plan', label: '계획', color: '#2a78d6' },
  { key: 'fail', label: '이상', color: '#eb6834' },
  { key: 'wait', label: '대기', color: '#1baf7a' },
];
const POWER_TARGET_KWH = 4800; // 설비당 일 전력 목표(목업)
const DONE_LOT_SHOW = 5; // LOT 장의 최근 완료 이력 — 최근 몇 개만

const ALARM_POOL = ['오일조 온도 하한', '벨트 속도 편차', 'CP 하한', '배기팬 과부하', '세정조 수위 하한', '템퍼링로 2존 온도 편차'];

const pad = (n, l = 2) => String(n).padStart(l, '0');
const rand = (a, b) => a + Math.random() * (b - a);

function nowText(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function timeText(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let lotSeq = 0;
function newLot(furnaceNo, pattern, pos = 0) {
  const d = new Date();
  lotSeq += 1;
  return {
    id: `${furnaceNo}-${Date.now()}-${lotSeq}`,
    lotNo: `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${furnaceNo}${pad(lotSeq % 1000, 3)}`,
    company: pattern.company,
    partNo: pattern.partNo,
    productName: pattern.productName,
    patternCode: pattern.patternCode,
    pos,
    leaving: false,
  };
}

// 존별 현재값(PV) = 설정값(SV) ± 약간. 알람 존은 상한을 넘게, 정지 로는 보온 온도로
function zonePv(f, stage) {
  const p = f.pattern;
  if (stage.kind !== 'q' && stage.kind !== 't') return null;
  const sv = stage.kind === 'q' ? p.q[stage.zone - 1] : p.t[stage.zone - 1];
  if (f.status === 'idle') return Math.round(stage.kind === 'q' ? 650 + rand(-3, 3) : 120 + rand(-2, 2));
  if (f.status === 'alarm' && f.alarm?.zone === stage.key) return Math.round(sv + rand(11, 15));
  return Math.round(sv + rand(-2.4, 2.4));
}

function minutesAgo(min) {
  return timeText(new Date(Date.now() - min * 60000));
}

const dateAgo = (min) => new Date(Date.now() - min * 60000);

// 알람 표시용 '월/일 시:분'
function fmtMonthDayTime(d) {
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initFurnaces(patterns) {
  const now = new Date();
  const elapsedH = now.getHours() + now.getMinutes() / 60; // 오늘 0시부터 지난 시간
  return FURNACES.map((def, i) => {
    const pattern = patterns[i % patterns.length];
    const idle = def.status === 'idle';
    const stopH = idle ? Math.min(6, elapsedH) : 0; // 정지 로는 6시간 전부터 점검
    // 완료 이력 — 정지 로는 점검 들어가기 전까지, 가동 로는 몇 분 간격으로 최근에 배출된 것들
    const doneLots = [];
    let ago = idle ? stopH * 60 + rand(3, 8) : rand(1, 5);
    for (let k = 0; k < 14; k += 1) {
      doneLots.push({ ...newLot(i + 1, pattern, N), doneAt: minutesAgo(ago) });
      ago += rand(3.5, 6.5);
    }

    // 알람: 진행 중(미해제) + 오늘 해제된 것들, 최신 순
    const alarms = [];
    if (def.status === 'alarm') alarms.push({ id: `a${i}-0`, startAt: dateAgo(rand(8, 25)), message: def.alarm.message, active: true });
    const resolved = def.status === 'alarm' ? 2 : Math.floor(rand(0, 3.9));
    for (let k = 0; k < resolved; k += 1) {
      // 해제된 알람은 시작 후 3~25분 뒤 해제된 것으로
      const startAgo = 40 + k * rand(35, 90);
      alarms.push({
        id: `a${i}-${k + 1}`,
        startAt: dateAgo(startAgo),
        endAt: dateAgo(startAgo - rand(3, 25)),
        message: ALARM_POOL[Math.floor(rand(0, ALARM_POOL.length))],
        active: false,
      });
    }

    const f = {
      ...def,
      no: i + 1,
      pattern,
      lots: [],
      processed: Math.round(rand(18, 42)),
      changedAt: 0,
      pv: {},
      doneLots,
      alarms,
      powerKwh: (elapsedH - stopH) * rand(185, 210) + stopH * 62,
      elapsedMin: elapsedH * 60,
      // 어제 같은 시각까지의 값 = 오늘 값 × 비율(전력·비가동) / 어제 가동률(정지 로는 어제는 정상 가동)
      yday: {
        powerRatio: rand(0.9, 1.1),
        util: idle ? rand(91, 96) : rand(89, 97),
        downRatio: idle ? 0.12 : rand(0.6, 1.5),
      },
      down: {
        plan: stopH * 60 + (!idle && Math.random() < 0.35 ? rand(15, 40) : 0),
        fail: def.status === 'alarm' ? rand(20, 35) : Math.random() < 0.25 ? rand(3, 12) : 0,
        wait: rand(4, 30),
      },
    };
    // 투입기 — 설비마다 묶음 위치가 다르게 시작
    let feed = Math.random() < 0.5
      ? { left: randInt(1, BATCH_MAX), gap: 0 }
      : { left: 0, gap: randInt(1, GAP_MAX) };
    if (def.status !== 'idle') {
      // 벨트 위에 이미 묶음 단위로 트레이가 올라가 있는 상태로 시작(출구 쪽부터 채운다)
      for (let pos = N - 2; pos >= 0; pos -= 1) {
        const r = feedStep(feed);
        feed = r.feed;
        if (r.put) f.lots.push(newLot(f.no, pattern, pos));
      }
    }
    f.feed = feed;
    STAGES.forEach((s) => { f.pv[s.key] = zonePv(f, s); });
    return f;
  });
}

function heatStyle(stage, pv, idle) {
  if (pv == null) return undefined;
  if (idle) return { '--heat': 'hsl(210, 10%, 90%)', '--heat-ink': 'var(--mes-text-sub)' };
  if (stage.kind === 'q') {
    const k = Math.min(1, Math.max(0, (pv - 820) / 120));
    return { '--heat': `hsl(${36 - k * 26}, ${72 + k * 8}%, ${70 - k * 14}%)`, '--heat-ink': '#3d1608' };
  }
  const k = Math.min(1, Math.max(0, (pv - 150) / 60));
  return { '--heat': `hsl(${44 - k * 10}, ${70 + k * 10}%, ${86 - k * 12}%)`, '--heat-ink': '#4a2a06' };
}

export default function ProdStatusPage() {
  const [patterns, setPatterns] = useState(null);
  const [furnaces, setFurnaces] = useState([]);
  const [events, setEvents] = useState([]);
  const [clock, setClock] = useState(nowText());
  const [paused, setPaused] = useState(false);
  const [slide, setSlide] = useState(0);
  const [autoSlide, setAutoSlide] = useState(true);
  const [slideHold, setSlideHold] = useState(false); // 슬라이드 위에 마우스가 있으면 넘기지 않음
  const tickRef = useRef(0);

  useEffect(() => {
    if (!autoSlide || slideHold) return undefined;
    const id = setInterval(() => setSlide((v) => (v + 1) % SLIDES.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [autoSlide, slideHold, slide]);

  // 탭을 직접 고르면 자동 넘김을 끈다 — 보고 있는 장이 갑자기 바뀌지 않게
  const pickSlide = (i) => {
    setSlide(i);
    setAutoSlide(false);
  };

  const [refreshing, setRefreshing] = useState(false);

  // ── 전체화면: 왼쪽 메뉴를 감추고 브라우저 전체화면(F11과 같은 화면)으로 ──
  // 웹 페이지가 F11 키를 직접 누를 수는 없어 브라우저의 Fullscreen API를 쓴다. 브라우저가 거부해도 메뉴는 감춘다.
  const { hidden: sidebarHidden, setHidden: setSidebarHidden } = useSidebar();

  const enterFullscreen = () => {
    setSidebarHidden(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const exitFullscreen = () => {
    setSidebarHidden(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };

  // Esc 등으로 브라우저 전체화면이 풀리면 메뉴도 다시 보이게
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setSidebarHidden(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [setSidebarHidden]);

  // 다른 메뉴로 나가면 원래대로
  useEffect(() => () => {
    setSidebarHidden(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, [setSidebarHidden]);

  // 패턴(제품·회사)을 다시 불러오면 아래 useEffect가 6대 상태를 새로 만든다 — 새로고침 버튼도 이걸 쓴다
  const loadPatterns = useCallback(() => {
    setRefreshing(true);
    return fetchMockPatterns()
      .then(setPatterns)
      .finally(() => setTimeout(() => setRefreshing(false), 400));
  }, []);

  useEffect(() => { loadPatterns(); }, [loadPatterns]);

  useEffect(() => {
    if (!patterns) return;
    setFurnaces(initFurnaces(patterns));
    setEvents([
      { id: 'e0', time: timeText(), code: 'MBF4', type: 'alarm', text: '퀜칭로 3존 온도 상한 초과' },
      { id: 'e1', time: timeText(), code: 'MBF6', type: 'idle', text: '정기 점검으로 정지' },
    ]);
  }, [patterns]);

  useEffect(() => {
    const id = setInterval(() => setClock(nowText()), 1000);
    return () => clearInterval(id);
  }, []);

  // 시뮬레이션 — 트레이 이동, 새 LOT 투입, 가끔 패턴 교체.
  // 다음 상태를 setState 업데이터 밖에서 계산한다(StrictMode가 업데이터를 두 번 불러 이벤트가 두 번 쌓이는 것 방지).
  const furnacesRef = useRef(furnaces);
  furnacesRef.current = furnaces;

  useEffect(() => {
    if (!patterns || paused) return undefined;
    const id = setInterval(() => {
      tickRef.current += 1;
      const prev = furnacesRef.current;
      const newEvents = [];
      const running = prev.map((f, i) => (f.status === 'run' ? i : -1)).filter((i) => i >= 0);
      const switchIdx = tickRef.current % PATTERN_CHANGE_EVERY === 0 ? running[Math.floor(Math.random() * running.length)] : -1;

      const next = prev.map((f, idx) => {
        if (f.status === 'idle') return f;
        let { pattern, changedAt } = f;
        if (idx === switchIdx && patterns.length > 1) {
          const others = patterns.filter((x) => x.patternCode !== pattern.patternCode);
          const np = others[Math.floor(Math.random() * others.length)];
          newEvents.push({ code: f.code, type: 'pattern', text: `패턴 변경 ${pattern.patternCode} → ${np.patternCode}` });
          pattern = np;
          changedAt = Date.now();
        }
        let lots = f.lots.filter((l) => !l.leaving);
        let processed = f.processed;
        let { doneLots, feed } = f;
        if (Math.random() < BELT_STEP_CHANCE) {
          lots = lots.map((l) => {
            if (l.pos >= N - 1) {
              processed += 1;
              doneLots = [{ ...l, doneAt: timeText() }, ...doneLots].slice(0, 30);
              return { ...l, pos: N, leaving: true };
            }
            return { ...l, pos: l.pos + 1 };
          });
          const r = feedStep(feed);
          feed = r.feed;
          if (r.put) {
            const lot = newLot(f.no, pattern, 0);
            lots.push(lot);
            // LOT 투입은 자주 일어나서 다 적으면 패턴 변경·알람이 묻힌다 — 일부만
            if (Math.random() < 0.1) newEvents.push({ code: f.code, type: 'lot', text: `LOT ${lot.lotNo} 투입 (${lot.partNo})` });
          }
        }
        const powerKwh = f.powerKwh + (rand(185, 210) * TICK_MS) / 3600000;
        const nf = { ...f, pattern, changedAt, lots, processed, doneLots, feed, powerKwh, elapsedMin: f.elapsedMin + TICK_MS / 60000, pv: {} };
        STAGES.forEach((st) => { nf.pv[st.key] = zonePv(nf, st); });
        return nf;
      });

      setFurnaces(next);
      if (newEvents.length) {
        const t = timeText();
        setEvents((ev) => [
          ...newEvents.map((e, i) => ({ ...e, id: `${Date.now()}-${i}`, time: t })),
          ...ev,
        ].slice(0, 30));
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [patterns, paused]);

  const summary = useMemo(() => {
    const count = (s) => furnaces.filter((f) => f.status === s).length;
    return {
      run: count('run'),
      alarm: count('alarm'),
      idle: count('idle'),
      processed: furnaces.reduce((a, f) => a + f.processed, 0),
      inFurnace: furnaces.reduce((a, f) => a + f.lots.filter((l) => !l.leaving).length, 0),
      // 처리 LOT 수 × 패턴 장입량(kg)으로 어림한 금일 처리량
      tons: furnaces.reduce((a, f) => a + f.processed * (f.pattern.charge ?? 0), 0) / 1000,
      avgCp: (() => {
        const cps = furnaces.filter((f) => f.status !== 'idle' && f.pattern.cp != null).map((f) => f.pattern.cp);
        return cps.length ? cps.reduce((a, c) => a + c, 0) / cps.length : null;
      })(),
    };
  }, [furnaces]);

  return (
    <div className="mes-page itg-page mes-page-fill mes-page-compact">
      {/* 상단 한 줄 — 제목 · 요약 수치 · 최근 이벤트 · 시계. 로 카드에 높이를 최대한 내주려고 한 줄로 압축 */}
      <div className="itg-header-card">
        <div className="itg-title">
          <div className="mes-page-icon"><IconChartBar size={20} /></div>
          <div>
            <h2 className="mes-page-title">종합생산현황</h2>
            <span className="itg-mock-badge" title="현장 PLC 확인 후 실데이터로 교체 예정">화면 예시 · MOCK</span>
          </div>
        </div>

        <dl className="itg-kpis">
          <div className="itg-kpi is-run"><dt>가동</dt><dd>{summary.run}<small>/{furnaces.length}</small></dd></div>
          <div className="itg-kpi is-alarm"><dt>알람</dt><dd>{summary.alarm}</dd></div>
          <div className="itg-kpi is-idle"><dt>정지</dt><dd>{summary.idle}</dd></div>
          <div className="itg-kpi"><dt>로 내 LOT</dt><dd>{summary.inFurnace}</dd></div>
          <div className="itg-kpi"><dt>처리 LOT</dt><dd>{summary.processed.toLocaleString()}</dd></div>
          <div className="itg-kpi"><dt>처리량</dt><dd>{summary.tons.toFixed(1)}<small>t</small></dd></div>
          <div className="itg-kpi"><dt>평균 CP</dt><dd>{summary.avgCp != null ? summary.avgCp.toFixed(2) : '-'}<small>%</small></dd></div>
        </dl>

        <div className="itg-events" aria-live="polite">
          <ul>
            {events.slice(0, 3).map((e) => (
              <li key={e.id} className={`is-${e.type}`}>
                <span className="itg-event-time">{e.time}</span>
                <span className="itg-event-code">{e.code}</span>
                <span className="itg-event-text">{e.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="itg-live">
          <button
            type="button"
            className={`itg-auto${autoSlide ? ' is-on' : ''}`}
            onClick={() => setAutoSlide((v) => !v)}
            aria-pressed={autoSlide}
            aria-label="카드 아래 정보 자동 넘김"
            title={autoSlide ? '카드 아래 정보를 8초마다 자동으로 넘기는 중 (누르면 멈춤)' : '카드 아래 정보 자동 넘김 켜기'}
          >
            <IconRotateClockwise size={15} />
          </button>
          <span className={`itg-live-dot${paused ? ' is-paused' : ''}`} aria-hidden="true" />
          <span className="itg-clock" title={clock}>{clock.slice(11)}</span>
          <button
            type="button"
            className="mes-btn mes-btn-secondary itg-pause"
            onClick={() => setPaused((v) => !v)}
            aria-pressed={paused}
            aria-label={paused ? '움직임 다시 시작' : '움직임 잠시 멈춤'}
            title={paused ? '움직임 다시 시작' : '움직임 잠시 멈춤'}
          >
            {paused ? <IconPlayerPlayFilled size={14} /> : <IconPlayerPauseFilled size={14} />}
          </button>
          <button
            type="button"
            className={`mes-btn mes-btn-secondary itg-pause itg-refresh${refreshing ? ' is-spinning' : ''}`}
            onClick={loadPatterns}
            disabled={refreshing}
            aria-label="새로고침"
            title="새로고침 — 패턴·제품 정보를 다시 불러옵니다"
          >
            <IconRefresh size={14} />
          </button>
          <button
            type="button"
            className={`mes-btn mes-btn-secondary itg-pause itg-fullscreen${sidebarHidden ? ' is-on' : ''}`}
            onClick={sidebarHidden ? exitFullscreen : enterFullscreen}
            aria-pressed={sidebarHidden}
            aria-label={sidebarHidden ? '전체화면 끝내기' : '전체화면'}
            title={sidebarHidden ? '전체화면 끝내기 (Esc)' : '전체화면 — 왼쪽 메뉴를 감추고 크게 보기'}
          >
            {sidebarHidden ? <IconMinimize size={15} /> : <IconMaximize size={15} />}
          </button>
        </div>
      </div>

      {/* 6대 고정 — 남는 높이를 꽉 채우는 격자. 넓으면 3×2, 아니면 2×3 (CSS 컨테이너 쿼리) */}
      <div className="itg-grid-wrap">
        <div className="itg-grid">
          {furnaces.map((f) => (
            <FurnaceCard
              key={f.code}
              f={f}
              slide={slide}
              autoSlide={autoSlide && !slideHold}
              onPickSlide={pickSlide}
              onHold={setSlideHold}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FurnaceCard({ f, slide, autoSlide, onPickSlide, onHold }) {
  const idle = f.status === 'idle';
  const justChanged = Date.now() - f.changedAt < 6000;
  const p = f.pattern;

  return (
    <section className={`itg-card is-${f.status}`} aria-label={`${f.code} ${STATUS_LABEL[f.status]}`}>
      <header className="itg-card-head">
        <div className="itg-card-title">
          <strong>{f.code}</strong>
          <span>{f.name}</span>
          <span className={`itg-status is-${f.status}`}>
            {f.status === 'alarm' && <IconAlertTriangleFilled size={12} />}
            {idle ? (f.idleReason ?? STATUS_LABEL.idle) : STATUS_LABEL[f.status]}
          </span>
        </div>
        <div className={`itg-pattern${justChanged ? ' is-changed' : ''}`} title="현재 패턴">
          {justChanged && <IconArrowsExchange size={13} />}
          <span className="itg-pattern-code">{p.patternCode}</span>
          {p.patternName && <span className="itg-pattern-name">{p.patternName}</span>}
        </div>
      </header>

      <div className="itg-line">
        {/* 구역 이름 줄 */}
        <div className="itg-groups" aria-hidden="true">
          <span style={{ gridColumn: '1 / 2' }}>장입</span>
          <span className="is-q" style={{ gridColumn: '2 / 7' }}><IconFlame size={11} /> 퀜칭로</span>
          <span style={{ gridColumn: '7 / 8' }}>오일</span>
          <span style={{ gridColumn: '8 / 9' }}>세정</span>
          <span className="is-t" style={{ gridColumn: '9 / 14' }}>템퍼링로</span>
          <span style={{ gridColumn: '14 / 15' }}>배출</span>
        </div>

        {/* 존 온도 */}
        <div className="itg-zones">
          {STAGES.map((st) => {
            const pv = f.pv[st.key];
            const alarm = f.status === 'alarm' && f.alarm?.zone === st.key;
            const sv = st.kind === 'q' ? p.q[st.zone - 1] : st.kind === 't' ? p.t[st.zone - 1] : null;
            return (
              <div
                key={st.key}
                className={`itg-zone is-${st.kind}${alarm ? ' is-alarm' : ''}`}
                style={heatStyle(st, pv, idle)}
                title={pv != null ? `${st.kind === 'q' ? '퀜칭로' : '템퍼링로'} ${st.zone}존 · PV ${pv}℃ / SV ${sv}℃` : undefined}
              >
                {pv != null ? (
                  <>
                    <span className="itg-zone-no">{st.label}</span>
                    <span className="itg-zone-pv">{pv}</span>
                    {/* 카드가 충분히 높을 때만 보인다 */}
                    <span className="itg-zone-sv">{sv}</span>
                  </>
                ) : (
                  <span className="itg-zone-icon" aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>

        {/* 벨트 + 트레이 */}
        <div className="itg-belt">
          {f.lots.map((l) => (
            <span
              key={l.id}
              className={`itg-tray${l.leaving ? ' is-leaving' : ''}${l.patternCode !== p.patternCode ? ' is-prev' : ''}`}
              style={{ '--pos': l.pos }}
              title={`${l.lotNo} · ${l.partNo} ${l.productName} · ${l.patternCode}`}
            />
          ))}
          {idle && <span className="itg-belt-idle">{f.idleReason ?? '정지'}</span>}
        </div>
      </div>

      {/* 아래 정보 — 4장을 옆으로 넘기는 슬라이드 */}
      <div className="itg-slides" onMouseEnter={() => onHold(true)} onMouseLeave={() => onHold(false)}>
        <div className="itg-slide-tabs" role="tablist" aria-label={`${f.code} 정보`}>
          {SLIDES.map((sl, i) => (
            <button
              key={sl.key}
              type="button"
              role="tab"
              aria-selected={slide === i}
              className={slide === i ? 'is-on' : ''}
              onClick={() => onPickSlide(i)}
            >
              {sl.label}
              {sl.key === 'alarm' && f.alarms.some((a) => a.active) && <i className="itg-tab-dot" aria-label="진행 중 알람 있음" />}
            </button>
          ))}
          {autoSlide && <span key={slide} className="itg-slide-timer" aria-hidden="true" />}
        </div>
        <div className="itg-slide-viewport">
          <div className="itg-slide-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
            <div className="itg-slide" aria-hidden={slide !== 0}><LotSlide f={f} /></div>
            <div className="itg-slide" aria-hidden={slide !== 1}><AlarmSlide alarms={f.alarms} /></div>
            <div className="itg-slide" aria-hidden={slide !== 2}><EnergySlide f={f} /></div>
            <div className="itg-slide" aria-hidden={slide !== 3}><CondSlide f={f} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 위: 지금 진행 중인 LOT(로 안에서 배출에 가장 가까운 것) / 아래: 완료 이력(최신 순) */
function LotSlide({ f }) {
  const current = f.lots.filter((l) => !l.leaving).sort((a, b) => b.pos - a.pos)[0];
  return (
    <div className="itg-lot">
      {current ? (
        <div className="itg-lot-now" aria-live="polite">
          <span className="itg-lot-tag is-current"><i aria-hidden="true" />진행 중</span>
          <span className="itg-lot-no">{current.lotNo}</span>
          <span className="itg-lot-company" title={current.company}>{current.company}</span>
          <span className="itg-lot-part">{current.partNo}</span>
          <span className="itg-lot-name" title={current.productName}>{current.productName}</span>
        </div>
      ) : (
        <div className="itg-lot-now is-empty">
          <span className="itg-lot-tag is-stopped">정지</span>
          <span className="itg-lot-empty">{f.status === 'idle' ? `${f.idleReason ?? '정지'} — 진행 중인 LOT 없음` : '투입된 LOT 없음'}</span>
        </div>
      )}
      <div className="itg-lot-done-head" aria-hidden="true">
        <span>최근 완료</span><span>LOT</span><span>회사</span><span>품번</span><span>품명</span>
      </div>
      {/* 칸에 들어가는 줄만 보이고 나머지는 다음 열로 넘어가 가려진다 — 스크롤 없음 */}
      <ol className="itg-lot-done" aria-label="최근 완료 LOT">
        {f.doneLots.slice(0, DONE_LOT_SHOW).map((l) => (
          <li key={l.id}>
            <span className="itg-lot-done-time">{l.doneAt.slice(0, 5)}</span>
            <span className="itg-lot-done-no">{l.lotNo}</span>
            <span className="itg-lot-done-company" title={l.company}>{l.company}</span>
            <span className="itg-lot-done-part">{l.partNo}</span>
            <span className="itg-lot-done-name" title={l.productName}>{l.productName}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 진행 중(미해제) 알람과 최근 해제된 알람을 한 목록으로 — 진행 중이 위 */
function AlarmSlide({ alarms }) {
  if (!alarms.length) return <div className="itg-slide-empty">오늘 발생한 알람이 없습니다.</div>;
  const list = [...alarms].sort((a, b) => Number(b.active) - Number(a.active));
  return (
    <ul className="itg-alarm-list">
      {list.map((a) => (
        <li key={a.id} className={a.active ? 'is-active' : ''}>
          <span className={`itg-alarm-state${a.active ? ' is-active' : ''}`}>
            {a.active && <IconAlertTriangleFilled size={11} />}
            {a.active ? '진행' : '해제'}
          </span>
          {/* 월/일 시:분 — 해제된 건 시작 ~ 종료, 진행 중은 시작 ~ 진행 중 */}
          <span className="itg-alarm-time">
            {fmtMonthDayTime(a.startAt)}
            <em>~</em>
            {a.active
              ? <b className="itg-alarm-end itg-alarm-ongoing">진행 중</b>
              : <span className="itg-alarm-end">{fmtMonthDayTime(a.endAt)}</span>}
          </span>
          <span className="itg-alarm-msg" title={a.message}>{a.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** 도넛 — segments: [{ value, color, label }], total: 링 한 바퀴 값. 나머지는 회색 트랙 */
function Donut({ segments, total, size = 64, stroke = 9, children, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = segments.filter((sg) => sg.value > 0).length > 1 ? 2 : 0; // 조각 사이 2px 틈
  let offset = 0;
  return (
    // 실제 크기는 CSS(.itg-donut)가 카드 높이에 맞춰 정한다 — viewBox 좌표만 size 기준
    <div className="itg-donut" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eceef1" strokeWidth={stroke} />
        {segments.map((sg) => {
          const len = total ? Math.min(1, sg.value / total) * c : 0;
          if (len <= 0) return null;
          const dash = Math.max(0.5, len - gap);
          const el = (
            <circle
              key={sg.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={sg.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{sg.title ?? sg.label}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="itg-donut-center">{children}</div>
    </div>
  );
}

function fmtMin(m) {
  const v = Math.round(m);
  return v < 60 ? `${v}분` : `${Math.floor(v / 60)}시간${v % 60 ? ` ${v % 60}분` : ''}`;
}

/** 오늘 vs 어제 같은 시각 차이 — 좋아진 쪽은 초록, 나빠진 쪽은 빨강(글자 + ▲▼로, 색만으로 구분하지 않음) */
function Diff({ value, unit, digits = 0, goodWhenUp, neutral }) {
  const v = Number(value.toFixed(digits));
  if (v === 0) return <span className="itg-diff">변동 없음</span>;
  const up = v > 0;
  const tone = neutral ? '' : (up === goodWhenUp ? ' is-good' : ' is-bad');
  return (
    <span className={`itg-diff${tone}`}>
      {up ? '▲' : '▼'} {Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}{unit}
    </span>
  );
}

/**
 * 전력·비가동 — 금일 전력량(일 목표 대비)과 가동률을 도넛으로, 그 아래에 '어제 같은 시각까지'와의 비교 표.
 * 낮은 카드는 도넛을 표 안의 작은 아이콘으로 줄이고, 비가동 사유는 항상 한 줄로 끝까지 보이게 한다.
 */
function EnergySlide({ f }) {
  const downTotal = f.down.plan + f.down.fail + f.down.wait;
  const util = Math.max(0, Math.min(100, ((f.elapsedMin - downTotal) / f.elapsedMin) * 100));
  const powerPct = (f.powerKwh / POWER_TARGET_KWH) * 100;
  const yPower = f.powerKwh * f.yday.powerRatio;
  const yUtil = f.yday.util;
  const yDown = (f.elapsedMin * (100 - yUtil)) / 100;
  const downParts = DOWN_CAUSES.filter((dc) => f.down[dc.key] >= 1);

  const powerDonut = (
    <Donut
      segments={[{ value: f.powerKwh, color: '#2a78d6', label: '금일 전력량', title: `${Math.round(f.powerKwh).toLocaleString()} kWh` }]}
      total={POWER_TARGET_KWH}
      label={`금일 전력량 ${Math.round(f.powerKwh).toLocaleString()} kWh, 일 목표 대비 ${Math.round(powerPct)}%`}
    >
      <strong>{Math.round(powerPct)}</strong><small>%</small>
    </Donut>
  );
  const utilDonut = (
    <Donut
      segments={[{ value: util, color: '#1baf7a', label: '가동', title: `가동률 ${util.toFixed(1)}%` }]}
      total={100}
      label={`가동률 ${util.toFixed(1)}%`}
    >
      <strong>{util.toFixed(0)}</strong><small>%</small>
    </Donut>
  );

  const rows = [
    {
      key: 'power', label: '전력량', donut: powerDonut,
      today: `${Math.round(f.powerKwh).toLocaleString()} kWh`,
      yday: `${Math.round(yPower).toLocaleString()} kWh`,
      diff: <Diff value={f.powerKwh - yPower} unit=" kWh" neutral />,
    },
    {
      key: 'util', label: '가동률', donut: utilDonut,
      today: `${util.toFixed(1)}%`,
      yday: `${yUtil.toFixed(1)}%`,
      diff: <Diff value={util - yUtil} unit="%p" digits={1} goodWhenUp />,
    },
    {
      key: 'down', label: '비가동', donut: null,
      today: fmtMin(downTotal),
      yday: fmtMin(yDown),
      diff: <Diff value={downTotal - yDown} unit="분" goodWhenUp={false} />,
    },
  ];

  return (
    <div className="itg-energy">
      {/* 높은 카드에서만 보이는 큰 도넛 두 개 */}
      <div className="itg-energy-donuts">
        <div className="itg-energy-item">
          {powerDonut}
          <div className="itg-energy-text">
            <span>금일 전력량</span>
            <strong>{Math.round(f.powerKwh).toLocaleString()}<small>kWh</small></strong>
            <em>일 목표 {POWER_TARGET_KWH.toLocaleString()} kWh</em>
          </div>
        </div>
        <div className="itg-energy-item">
          {utilDonut}
          <div className="itg-energy-text">
            <span>가동률</span>
            <strong>{util.toFixed(1)}<small>%</small></strong>
            <em>지난 {fmtMin(f.elapsedMin)} 기준</em>
          </div>
        </div>
      </div>

      <table className="itg-cmp">
        <thead>
          <tr>
            <th scope="col"><span className="itg-sr">항목</span></th>
            <th scope="col">오늘</th>
            <th scope="col">어제 같은 시각</th>
            <th scope="col">차이</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={`is-${r.key}`}>
              <th scope="row">
                {r.donut ? <span className="itg-cmp-icon" aria-hidden="true">{r.donut}</span> : <span className="itg-cmp-icon is-blank" aria-hidden="true" />}
                {r.label}
              </th>
              <td className="itg-cmp-today">{r.today}</td>
              <td className="itg-cmp-yday"><span className="itg-cmp-yday-tag">어제</span>{r.yday}</td>
              <td>{r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 비가동 사유 — 말줄임 없이 끝까지 (좁으면 줄바꿈) */}
      <p className="itg-down-causes">
        <span className="itg-down-causes-label">비가동 {fmtMin(downTotal)}</span>
        {downParts.length ? downParts.map((dc) => (
          <span key={dc.key} className="itg-down-cause"><i style={{ background: dc.color }} />{dc.label} {fmtMin(f.down[dc.key])}</span>
        )) : <span className="itg-down-cause">사유 없음</span>}
      </p>
    </div>
  );
}

/** 존별 SP와 현재 편차(PV−SP). ±5℃ 넘으면 주의, ±10℃ 넘으면 위험 */
function devClass(dev) {
  const a = Math.abs(dev);
  if (a > 10) return 'is-danger';
  if (a > 5) return 'is-warn';
  return '';
}

/** 운전 조건 — 위: 회사·제품·주요 조건 / 아래: 퀜칭로·템퍼링로 존별 SP 표 */
function CondSlide({ f }) {
  const p = f.pattern;
  const idle = f.status === 'idle';
  const furnaces = [
    { key: 'q', label: '퀜칭로', sp: p.q, speed: p.qs },
    { key: 't', label: '템퍼링로', sp: p.t, speed: p.ts ?? p.qs },
  ];
  const meta = [
    ['회사', p.company ?? '-', 'is-company'],
    ['제품', `${p.productName}`, 'is-product', `${p.partNo} ${p.productName}`],
    ['CP', p.cp != null ? `${p.cp.toFixed(2)}%` : '-'],
    ['장입량', p.charge != null ? `${p.charge.toLocaleString()}kg` : '-'],
    ['로 내', `${f.lots.filter((l) => !l.leaving).length} LOT`, 'is-opt'],
    ['금일 처리', `${f.processed} LOT`],
    ['패턴', p.patternCode, 'is-opt'],
  ];
  return (
    <div className="itg-cond">
      <div className="itg-cond-meta">
        {meta.map(([k, v, cls, title]) => (
          <span key={k} className={cls} title={title ?? v}><em>{k}</em><b>{v}</b></span>
        ))}
      </div>
      {furnaces.map((fu) => (
        <div key={fu.key} className={`itg-cond-row is-${fu.key}`}>
          <span className="itg-cond-label">
            <b>{fu.label}</b>
            <small>{idle ? '정지' : `${fu.speed ?? '-'} ${p.unit ?? ''}`}</small>
          </span>
          <span className="itg-cond-zones">
            {fu.sp.map((sp, z) => {
              const pv = f.pv[`${fu.key}${z + 1}`];
              const dev = pv != null ? pv - sp : 0;
              return (
                <span
                  key={z}
                  className={`itg-sp ${idle ? '' : devClass(dev)}`}
                  title={`${fu.label} ${z + 1}존 · SP ${sp}℃ · PV ${pv ?? '-'}℃`}
                >
                  <em>{z + 1}존</em>
                  <b>{Math.round(sp)}</b>
                  {!idle && <i>{dev > 0 ? '+' : ''}{dev}</i>}
                </span>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
