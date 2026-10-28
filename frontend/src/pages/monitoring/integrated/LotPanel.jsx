import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconChevronRight } from '@tabler/icons-react';
import { FURNACES, fetchMockPatterns, seededRandom } from '../../../mocks/furnaceMock';

/*
 * 통합모니터링 호기 화면 왼쪽 — LOT 현황(종합생산현황 카드의 LOT 장과 같은 구성).
 *  - 위: 지금 진행 중인 LOT(로 안에서 배출에 가장 가까운 것) + 로 내 · 금일 처리 개수
 *  - 아래: 최근 완료 LOT(시각 · LOT · 회사 · 품번 · 품명), 최신 순
 * 예시 데이터 — 패턴관리의 실제 패턴(제품 · 회사)으로 LOT를 만들고, 30초마다 하나씩 배출된 것처럼 흉내 낸다.
 * LOT 번호 형식은 종합생산현황과 같다(YYMMDD-호기번호+순번). 실데이터가 생기면 두 화면 모두 같은 조회로 바꾼다.
 */

const DONE_SHOW = 8;           // 최근 완료는 8건까지
const IN_FURNACE = 9;           // 로 안에 있는 LOT 수(예시)
const LOT_EVERY_MIN = 5;        // 평균 5분에 한 LOT 배출(예시)
const TICK_MS = 30000;          // 화면에서는 30초마다 하나씩 배출된 것처럼
const pad = (n, l = 2) => String(n).padStart(l, '0');
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function lotNo(no, seq, d = new Date()) {
  return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${no}${pad(seq % 1000, 3)}`;
}

/** 오늘 0시부터 지금까지의 LOT — 같은 날이면 새로고침해도 같은 순번이 나오게 날짜를 씨앗으로 */
function initLots(furnace, no, pattern) {
  const now = new Date();
  const rnd = seededRandom(`${now.toDateString()}-${furnace.code}-lot`);
  const elapsedMin = now.getHours() * 60 + now.getMinutes();
  const idle = furnace.status === 'idle';
  const stopMin = idle ? Math.min(360, elapsedMin) : 0; // 정지 로는 6시간 전부터 점검
  const processed = Math.max(0, Math.floor((elapsedMin - stopMin) / LOT_EVERY_MIN));
  const base = { company: pattern.company, partNo: pattern.partNo, productName: pattern.productName, patternCode: pattern.patternCode };

  const done = [];
  let ago = stopMin + 1 + rnd() * 4;
  for (let k = 0; k < Math.min(DONE_SHOW, processed); k += 1) {
    done.push({ ...base, seq: processed - k, lotNo: lotNo(no, processed - k), doneAt: new Date(now - ago * 60000) });
    ago += LOT_EVERY_MIN - 1.5 + rnd() * 3;
  }
  const inFurnace = idle ? [] : Array.from({ length: IN_FURNACE }, (_, k) => ({ ...base, seq: processed + 1 + k, lotNo: lotNo(no, processed + 1 + k) }));
  return { processed, done, inFurnace };
}

export default function LotPanel({ furnace }) {
  const no = FURNACES.findIndex((f) => f.code === furnace.code) + 1;
  const idle = furnace.status === 'idle';
  const [patterns, setPatterns] = useState(null);
  const [state, setState] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchMockPatterns().then((list) => { if (alive) setPatterns(list); });
    return () => { alive = false; };
  }, []);

  // 종합생산현황과 같은 배정 — n호기는 패턴 목록의 (n-1)번째
  const pattern = useMemo(() => (patterns ? patterns[(no - 1) % patterns.length] : null), [patterns, no]);

  useEffect(() => {
    if (!pattern) return undefined;
    setState(initLots(furnace, no, pattern));
    if (idle) return undefined;
    const id = setInterval(() => {
      setState((s) => {
        const [first, ...rest] = s.inFurnace;
        const seq = s.inFurnace[s.inFurnace.length - 1].seq + 1;
        return {
          processed: s.processed + 1,
          done: [{ ...first, doneAt: new Date() }, ...s.done].slice(0, DONE_SHOW),
          inFurnace: [...rest, { ...first, seq, lotNo: lotNo(no, seq) }],
        };
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [furnace, no, pattern, idle]);

  const current = state?.inFurnace[0];

  return (
    <div className="mbl">
      <div className="mbl-head">
        <b>LOT</b>
        <span className="mbl-count">로 내 <b>{state?.inFurnace.length ?? 0}</b></span>
        <span className="mbl-count">금일 처리 <b>{state?.processed ?? 0}</b></span>
        <Link to="/monitoring/prodStatus" className="mbl-more">종합생산현황<IconChevronRight size={13} /></Link>
      </div>

      {current ? (
        <div className="mbl-now" aria-live="polite">
          <span className="mbl-tag"><i aria-hidden="true" />진행 중</span>
          <strong className="mbl-no">{current.lotNo}</strong>
          <dl className="mbl-meta">
            <div><dt>회사</dt><dd title={current.company}>{current.company}</dd></div>
            <div><dt>품번</dt><dd title={current.partNo}>{current.partNo}</dd></div>
            <div><dt>품명</dt><dd title={current.productName}>{current.productName}</dd></div>
            <div><dt>패턴</dt><dd title={current.patternCode}>{current.patternCode}</dd></div>
          </dl>
        </div>
      ) : (
        <div className="mbl-now is-empty">
          <span className="mbl-tag is-stopped">정지</span>
          <span className="mbl-empty">{idle ? `${furnace.idleReason ?? '정지'} — 진행 중인 LOT 없음` : '불러오는 중'}</span>
        </div>
      )}

      <div className="mbl-list-head" aria-hidden="true">
        <span>완료</span><span>LOT</span><span>회사</span><span>품번</span><span>품명</span>
      </div>
      <ol className="mbl-list" aria-label="최근 완료 LOT">
        {(state?.done ?? []).map((l) => (
          <li key={l.lotNo}>
            <span className="mbl-time">{hm(l.doneAt)}</span>
            <span className="mbl-lot">{l.lotNo}</span>
            <span title={l.company}>{l.company}</span>
            <span title={l.partNo}>{l.partNo}</span>
            <span title={l.productName}>{l.productName}</span>
          </li>
        ))}
        {state && !state.done.length && <li className="mbl-none">오늘 완료된 LOT가 없습니다.</li>}
      </ol>
    </div>
  );
}
