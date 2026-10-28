import { useMemo, useRef, useState } from 'react';
import {
  IconActivity, IconChevronsRight, IconDroplet, IconElevator, IconEngine, IconFilter, IconFlame,
  IconPropeller, IconRotateClockwise2, IconSpray, IconTemperature, IconWaveSine, IconWind,
} from '@tabler/icons-react';
import { LAMPS, ZONES, VIEW_W, VIEW_H, QUENCH_ZONE_COUNT } from './mbf1Layout';
import fanImg from '../../../assets/monitoring/fan.png';
import './mbf1.css';

/*
 * MBF1호기 설비 그림 — 현장 운전 표시 패널을 화면으로 옮긴 것.
 *  - 구간 9개(재료 투입 → 방청조)를 라인 그림으로, 장비마다 램프(운전 초록 · 정지 회색 · 알람 빨강 깜빡임)
 *  - RC FAN · 교반기는 운전 중이면 돌고, 버너 블로워가 돌면 불꽃, 소입로 컨베이어가 돌면 제품 흐름이 움직인다
 *  - 램프에 마우스를 올리면 패널 원래 이름 · 구간 · 상태 · PLC 주소
 * state: { [램프 id]: 'run' | 'stop' | 'alarm' }
 */

const STATE_LABEL = { run: '운전', stop: '정지', alarm: '알람' };
const LAMP_Y = { top: 62, bottom: 276 };
const BELT_Y = 208;
const zoneOf = new Map(ZONES.map((z) => [z.key, z]));

// 제품이 지나가는 길(재료 투입 → 출구)
const FLOW_PATH = 'M26 244 H58 V176 H112 L140 214 L146 240 L206 152 L234 194 L246 236 L392 174 L406 '
  + `${BELT_Y} H676 L716 232 L772 240 L900 130 H1002 L1050 236 L1194 180 L1208 ${BELT_Y} H1602 L1642 236 L1782 190`;

/** 팬(천일 모니터링과 같은 아이콘) — 운전 중이면 천천히 돌고, 정지면 흐리게 */
function Fan({ cx, cy, r = 10, on }) {
  const size = r * 2.3;
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <g className={`mb-fan${on ? ' mb-spin' : ' is-off'}`}>
        <image href={fanImg} x={-size / 2} y={-size / 2} width={size} height={size} />
      </g>
    </g>
  );
}

/** 모터 + 축 + 팬(로 천장에 달린 RC FAN) */
function RcFan({ x, on }) {
  return (
    <g>
      <rect x={x - 10} y={122} width={20} height={22} rx={3} className="mb-motor" />
      <rect x={x - 6} y={126} width={12} height={3} rx={1} className="mb-motor-rib" />
      <rect x={x - 6} y={132} width={12} height={3} rx={1} className="mb-motor-rib" />
      <line x1={x} y1={144} x2={x} y2={162} className="mb-shaft" />
      <Fan cx={x} cy={174} r={12.5} on={on} />
    </g>
  );
}

/** 컨베이어(기울어진 벨트) — 바깥 프레임 + 안쪽 벨트 + 양 끝 롤러 */
function Conveyor({ x1, y1, x2, y2 }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="mb-conv-frame" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="mb-conv-belt" />
      <circle cx={x1} cy={y1} r={4.5} className="mb-roller" />
      <circle cx={x2} cy={y2} r={4.5} className="mb-roller" />
    </g>
  );
}

/**
 * 진동 피더 경사부 — 다른 컨베이어처럼 굵은 레일(바깥 프레임 + 안쪽 벨트, 작은 화면에서도 테두리가 끊겨 보이지 않게)
 * 위에 계단식 트레이. 운전 중이면 트레이가 경사를 따라 천천히 올라가고(한 칸 간격만큼 밀어 이음매 없이 반복),
 * 트레이마다 부품이 실려 있다. 트레이는 벨트 안쪽으로 잘라 레일 밖으로 나오지 않는다.
 */
const FEEDER_TRAYS = 6;
function FeederIncline({ x1, y1, x2, y2, on }) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const half = 5.5; // 안쪽 벨트 반폭 — 트레이를 이 안으로 자른다
  const inner = `M${x1 + nx * half} ${y1 + ny * half} L${x2 + nx * half} ${y2 + ny * half} L${x2 - nx * half} ${y2 - ny * half} L${x1 - nx * half} ${y1 - ny * half} Z`;
  const dx = (x2 - x1) / FEEDER_TRAYS;
  const dy = (y2 - y1) / FEEDER_TRAYS;
  return (
    <g>
      <defs>
        <clipPath id="mb-clip-feeder"><path d={inner} /></clipPath>
      </defs>
      {[0.5, 0.86].map((t) => {
        const lx = x1 + (x2 - x1) * t;
        return <line key={t} x1={lx} y1={y1 + (y2 - y1) * t + 9} x2={lx} y2={250} className="mb-leg-line" />;
      })}
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="mb-feeder-frame" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="mb-feeder-belt" />
      <g clipPath="url(#mb-clip-feeder)">
        <g className={on ? 'mb-feeder-move' : undefined} style={{ '--mb-fx': `${dx}px`, '--mb-fy': `${dy}px` }}>
          {Array.from({ length: FEEDER_TRAYS + 2 }, (_, i) => i - 1).map((i) => {
            const tx = x1 + dx * (i + 0.5);
            const ty = y1 + dy * (i + 0.5);
            return (
              <g key={i}>
                <line x1={tx - 8} y1={ty} x2={tx + 8} y2={ty} className="mb-tray" />
                {on && <rect x={tx - 4.5} y={ty - 3} width={9} height={2.6} rx={1} className="mb-parts" />}
              </g>
            );
          })}
        </g>
      </g>
      <circle cx={x1} cy={y1} r={4.5} className="mb-roller" />
      <circle cx={x2} cy={y2} r={4.5} className="mb-roller" />
    </g>
  );
}

/** 열처리로 몸체 — 바깥 벽 · 안쪽 챔버 · 존 구분 · 벨트 · 다리 */
function Furnace({ x, w, kind, zones = 5 }) {
  const inX = x + 8;
  const inW = w - 16;
  return (
    <g className={`mb-furnace is-${kind}`}>
      <rect x={x - 16} y={176} width={18} height={40} rx={2} className="mb-vestibule" />
      <rect x={x} y={148} width={w} height={70} rx={5} className="mb-furnace-wall" />
      <rect x={inX} y={158} width={inW} height={46} rx={3} className="mb-furnace-in" />
      {Array.from({ length: zones - 1 }, (_, i) => i + 1).map((k) => (
        <line key={k} x1={inX + (inW * k) / zones} y1={160} x2={inX + (inW * k) / zones} y2={202} className="mb-zone-div" />
      ))}
      {Array.from({ length: zones }, (_, i) => i + 1).map((k) => (
        <text key={k} x={inX + (inW * (k - 0.5)) / zones} y={199} className="mb-zone-no">{k}존</text>
      ))}
      {Array.from({ length: Math.round(w / 70) + 1 }, (_, i) => x + 14 + (i * (w - 28)) / Math.round(w / 70)).map((lx) => (
        <rect key={lx} x={lx - 3} y={218} width={6} height={32} className="mb-leg" />
      ))}
    </g>
  );
}

/** 버너 — 버너 블로워가 돌면 불꽃 */
function Burner({ cx, on }) {
  return (
    <g>
      <rect x={cx - 15} y={226} width={30} height={16} rx={3} className="mb-burner" />
      <circle cx={cx - 6} cy={234} r={4} className="mb-burner-port" />
      {on && (
        <g className="mb-flame">
          <path d={`M${cx + 4} 240 q4 -8 0 -14 q7 5 6 14 z`} />
          <path d={`M${cx + 9} 240 q2 -5 0 -9 q4 3 3 9 z`} className="mb-flame-in" />
        </g>
      )}
    </g>
  );
}

/** 물결 면 — 탱크 폭의 3배 길이로 그려 한 주기(period)만큼 옆으로 밀면 이음매 없이 반복된다 */
function wavePath(x0, top, bottom, period, amp, len) {
  let d = `M${x0} ${top}`;
  for (let px = 0; px < len; px += period) d += ` q ${period / 4} ${-amp} ${period / 2} 0 t ${period / 2} 0`;
  return `${d} V${bottom} H${x0} Z`;
}

/**
 * 물/기름 탱크 — 몸체 · 액체(뒤 물결 · 앞 물결 두 겹).
 * active면 액면이 천천히 출렁이고(펌프·교반기 운전), bubbles면 바닥에서 기포가 올라온다(교반기 운전)
 */
function Tank({ id, x, y, w, h, kind, active, bubbles }) {
  const top = y + 13;
  const bottom = y + h - 2;
  const period = Math.round(w / 2);
  const len = w * 3;
  return (
    <g className={`mb-tank is-${kind}${active ? ' is-active' : ''}`}>
      <defs>
        <clipPath id={`mb-clip-${id}`}>
          <rect x={x + 2} y={y + 4} width={w - 4} height={h - 6} rx={2} />
        </clipPath>
      </defs>
      <rect x={x} y={y} width={w} height={h} rx={3} className="mb-tank-wall" />
      <g clipPath={`url(#mb-clip-${id})`}>
        <path d={wavePath(x - w, top - 1, bottom, period, 3, len)} className="mb-liquid-back" style={{ '--mb-p': `${period}px` }} />
        <path d={wavePath(x - w + period / 2, top + 1, bottom, period, 2.4, len)} className="mb-liquid" style={{ '--mb-p': `${-period}px` }} />
        {bubbles && [0.18, 0.34, 0.52, 0.7, 0.86].map((fx, i) => (
          <circle key={fx} cx={x + w * fx} cy={bottom - 4} r={1.6 + (i % 3) * 0.6} className="mb-bubble"
            style={{ '--mb-rise': `${-(h - 22)}px`, animationDelay: `${i * 0.9}s` }} />
        ))}
      </g>
    </g>
  );
}

/** 램프 아이콘 — 설비 종류별(팬 · 블로워 · 버너 · 펌프 · 스프레이 · 컨베이어 …) */
function iconOf(l) {
  if (l.fan) return IconPropeller;
  if (l.agitator) return IconRotateClockwise2;
  if (l.burner) return IconFlame;
  if (l.conv || l.label.includes('컨베이어')) return IconChevronsRight;
  const f = l.full;
  if (f.includes('SPRAY')) return IconSpray;
  if (f.includes('열교환')) return IconTemperature;
  if (f.includes('유압')) return IconEngine;
  if (f.includes('PUMP')) return IconDroplet;
  if (f.includes('BLOWER')) return IconWind;
  if (f.includes('SKIMMER')) return IconFilter;
  if (f.includes('승강기')) return IconElevator;
  if (f.includes('진동')) return IconWaveSine;
  return IconActivity;
}

/** 램프 — 아이콘 타일: 운전 = 초록 타일(은은한 빛), 정지 = 회색 타일, 알람 = 빨강 타일 깜박임. 이름은 위/아래 */
function Lamp({ lamp, state, onHover }) {
  const y = LAMP_Y[lamp.row];
  const lines = lamp.label.split('\n');
  const top = lamp.row === 'top';
  const textY = top ? y - 21 - (lines.length - 1) * 11 : y + 26;
  const Icon = iconOf(lamp);
  return (
    <g
      className={`mb-lamp is-${state}`}
      transform={`translate(${lamp.x} ${y})`}
      onMouseEnter={(e) => onHover(lamp, e.currentTarget)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      onFocus={(e) => onHover(lamp, e.currentTarget)}
      onBlur={() => onHover(null)}
      role="img"
      aria-label={`${lamp.full} ${STATE_LABEL[state] ?? '확인 불가'}`}
    >
      <rect x={-17} y={-17} width={34} height={34} rx={10} className="mb-lamp-halo" />
      <rect x={-13} y={-13} width={26} height={26} rx={7} className="mb-lamp-tile" />
      <Icon x={-8.5} y={-8.5} size={17} stroke={1.9} className="mb-lamp-icon" aria-hidden="true" />
      <rect x={-22} y={-22} width={44} height={44} className="mb-lamp-hit" />
      <text y={textY - y} className="mb-lamp-text">
        {lines.map((t, i) => <tspan key={t} x={0} dy={i === 0 ? 0 : 11}>{t}</tspan>)}
      </text>
    </g>
  );
}

export default function Mbf1Mimic({ state, title, note }) {
  const wrapRef = useRef(null);
  const [tip, setTip] = useState(null);
  const on = (id) => state[id] === 'run';
  const counts = useMemo(() => {
    const c = { run: 0, stop: 0, alarm: 0 };
    LAMPS.forEach((l) => { c[state[l.id] ?? 'stop'] += 1; });
    return c;
  }, [state]);
  const lineRunning = on('L13');

  const hover = (lamp, el) => {
    if (!lamp) { setTip(null); return; }
    const box = wrapRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setTip({ lamp, x: r.left + r.width / 2 - box.left, y: lamp.row === 'top' ? r.bottom - box.top + 6 : r.top - box.top - 6 });
  };

  return (
    <div className="mb-wrap" ref={wrapRef}>
      <div className="mb-legend">
        {title && <b className="mb-legend-title">{title}</b>}
        <span className="mb-legend-item is-run"><i />운전 <b>{counts.run}</b></span>
        <span className="mb-legend-item is-stop"><i />정지 <b>{counts.stop}</b></span>
        <span className="mb-legend-item is-alarm"><i />알람 <b>{counts.alarm}</b></span>
        <span className={`mb-legend-flow${lineRunning ? ' is-on' : ''}`}>{lineRunning ? '라인 이송 중' : '라인 이송 정지'}</span>
        {note && <span className="mb-legend-note">{note}</span>}
      </div>

      <svg className="mb-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="MBF1호기 설비 운전 상태">
        {/* 구간 띠 + 이름 */}
        {ZONES.map((z, i) => (
          <g key={z.key}>
            <rect x={z.x} y={4} width={z.w} height={VIEW_H - 8} rx={8} className={`mb-band${i % 2 ? ' is-alt' : ''}`} />
            <text x={z.x + z.w / 2} y={VIEW_H - 22} className="mb-zone-name">{z.name}</text>
            <text x={z.x + z.w / 2} y={VIEW_H - 10} className="mb-zone-en">{z.en}</text>
          </g>
        ))}
        <line x1={14} y1={252} x2={VIEW_W - 14} y2={252} className="mb-ground" />

        {/* ── 재료 투입: 스킵 승강기 — 바닥에서 담아 올려 피더 투입부에 붓는다 ── */}
        <rect x={22} y={222} width={26} height={24} rx={2} className="mb-box" />
        <text x={35} y={237} className="mb-tiny">유압</text>
        <rect x={54} y={168} width={8} height={82} className="mb-post" />
        <path d="M26 244 H58 V176 H112" className="mb-rail" />
        <path d="M26 244 H58 V176 H112" className="mb-rail-in" />
        <g className={on('L01') ? 'mb-skip is-on' : 'mb-skip'}>
          <path d="M88 158 h24 l-4 14 h-16 z" className="mb-bucket" />
        </g>

        {/* ── 진동 피더 — 바닥 투입부에서 계단식 트레이로 비스듬히 올라가 전세정기로 ── */}
        <path d="M120 206 H160 L150 248 H130 Z" className="mb-box" />
        <FeederIncline x1={146} y1={242} x2={206} y2={152} on={on('L03')} />
        <rect x={198} y={134} width={20} height={15} rx={3} className="mb-motor" />
        <path d="M208 152 L234 192" className="mb-chute" />

        {/* ── 전세정기 ── */}
        <Tank id="fwash" x={230} y={176} w={104} h={72} kind="water" active={on('L07') || on('L08')} />
        <line x1={240} y1={170} x2={318} y2={170} className="mb-pipe" />
        {[252, 276, 300].map((nx) => <path key={nx} d={`M${nx - 4} 170 h8 l-4 6 z`} className="mb-nozzle" />)}
        {on('L07') && [252, 276, 300].map((nx) => <path key={nx} d={`M${nx} 178 l-6 14 M${nx} 178 l0 16 M${nx} 178 l6 14`} className="mb-spray" />)}
        <rect x={334} y={188} width={14} height={16} rx={2} className={`mb-box${on('L05') ? ' is-on' : ''}`} />
        <Conveyor x1={244} y1={238} x2={392} y2={174} />

        {/* ── 소입로 ── */}
        <rect x={430} y={100} width={14} height={48} rx={2} className="mb-stack" />
        {on('L11') && <g className="mb-smoke"><circle cx={451} cy={92} r={5} /><circle cx={457} cy={82} r={4} /><circle cx={450} cy={73} r={3} /></g>}
        <Furnace x={420} w={252} kind="quench" zones={QUENCH_ZONE_COUNT} />
        <line x1={404} y1={BELT_Y} x2={684} y2={BELT_Y} className="mb-belt" />
        <RcFan x={480} on={on('L09')} />
        <RcFan x={600} on={on('L10')} />
        <Burner cx={530} on={on('L12')} />
        <path d="M672 202 L716 232" className="mb-chute" />

        {/* ── 유조 ── */}
        <Tank id="oil" x={700} y={182} w={132} h={66} kind="oil" active={on('L14') || on('L15') || on('L16')} bubbles={on('L14')} />
        <rect x={722} y={150} width={20} height={18} rx={3} className="mb-motor" />
        <line x1={732} y1={168} x2={732} y2={222} className="mb-shaft" />
        <Fan cx={732} cy={228} r={9} on={on('L14')} />
        <Conveyor x1={772} y1={240} x2={900} y2={130} />
        <rect x={842} y={222} width={26} height={24} rx={2} className="mb-box" />
        <path d="M846 228 l4 6 l4 -6 l4 6 l4 -6 l4 6" className={`mb-hx${on('L18') ? ' is-on' : ''}`} />

        {/* ── 유절 컨베이어 ── */}
        <Conveyor x1={900} y1={130} x2={1002} y2={130} />
        <rect x={914} y={140} width={80} height={9} rx={2} className="mb-drip" />
        {on('L20') && [930, 954, 978].map((dx) => <circle key={dx} cx={dx} cy={156} r={1.8} className="mb-drop" />)}
        <line x1={924} y1={149} x2={924} y2={250} className="mb-leg-line" />
        <line x1={990} y1={149} x2={990} y2={250} className="mb-leg-line" />
        <path d="M1002 130 L1050 220" className="mb-chute" />

        {/* ── 중간세정기 ── */}
        <Tank id="mwash" x={1042} y={184} w={96} h={64} kind="water" active={on('L25') || on('L26')} />
        <rect x={1138} y={194} width={14} height={16} rx={2} className={`mb-box${on('L23') ? ' is-on' : ''}`} />
        <line x1={1050} y1={176} x2={1120} y2={176} className="mb-pipe" />
        {[1062, 1086, 1110].map((nx) => <path key={nx} d={`M${nx - 4} 176 h8 l-4 6 z`} className="mb-nozzle" />)}
        {on('L26') && [1062, 1086, 1110].map((nx) => <path key={nx} d={`M${nx} 184 l-6 14 M${nx} 184 l0 16 M${nx} 184 l6 14`} className="mb-spray" />)}
        <Conveyor x1={1052} y1={238} x2={1194} y2={180} />

        {/* ── 소려로 ── */}
        <Furnace x={1222} w={380} kind="temper" />
        <line x1={1206} y1={BELT_Y} x2={1608} y2={BELT_Y} className="mb-belt" />
        {[['L27', 1290], ['L28', 1382], ['L29', 1474], ['L30', 1566]].map(([id, fx]) => <RcFan key={id} x={fx} on={on(id)} />)}
        <Burner cx={1350} on={on('L31')} />
        <path d="M1602 202 L1642 232" className="mb-chute" />

        {/* ── 방청조 ── */}
        <Tank id="rust" x={1628} y={192} w={86} h={56} kind="rust" active={on('L33') || on('L35')} />
        {on('L35') && [1648, 1670, 1692].map((nx) => <path key={nx} d={`M${nx} 194 l-5 10 M${nx} 194 l0 12 M${nx} 194 l5 10`} className="mb-spray" />)}
        <Conveyor x1={1640} y1={238} x2={1782} y2={190} />
        <path d="M1770 178 l14 10 l-16 6" className="mb-exit" />

        {/* 제품 흐름 */}
        <path d={FLOW_PATH} className={`mb-flow${lineRunning ? ' is-on' : ''}`} />

        {/* 램프 */}
        {LAMPS.map((l) => <Lamp key={l.id} lamp={l} state={state[l.id] ?? 'stop'} onHover={hover} />)}
      </svg>

      {tip && (
        <div className={`mb-tip is-${tip.lamp.row} is-${state[tip.lamp.id] ?? 'stop'}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
          <b>{tip.lamp.full}</b>
          <span>{zoneOf.get(tip.lamp.zone)?.name} · <em>{STATE_LABEL[state[tip.lamp.id]] ?? '확인 불가'}</em></span>
          <small>PLC 주소 {tip.lamp.tag || '미지정'}</small>
        </div>
      )}
    </div>
  );
}
