import { Suspense, lazy } from 'react';
import FurnaceFrame from './FurnaceFrame';
import Mbf1TempTrend from '../mbf1/Mbf1TempTrend';
import { ALL_RUN, SAMPLE_STATE } from '../mbf1/mbf1Layout';
import { tempAt, useMbf1Data } from '../mbf1/mbf1Data';
import { useChargeDemo } from './charge';

// 3D 그림(three.js)은 무거워서 3호기 화면을 열 때만 불러온다
const Mbf3Scene = lazy(() => import('../mbf3/Mbf3Scene'));

/*
 * 통합모니터링 > MBF3호기 — 설비 구성 · 램프 배치는 MBF1 · 2와 같고, 그림은 풀 3D(Mbf3Scene, 마우스로 돌려 보기).
 * 온도는 같은 화면(Mbf1TempTrend)에 3호기 패턴으로. 램프 상태 · 온도는 PLC 연결 전까지 예시.
 * allOn: 화면 위 ON 버튼 — 램프 전부 운전으로(시연용). 재료 투입은 예시 순서기(useChargeDemo)가 단계를 넘긴다.
 */
export default function Mbf3({ furnace, allOn }) {
  const data = useMbf1Data(3);
  const state = allOn ? ALL_RUN : SAMPLE_STATE;
  const charge = useChargeDemo(state.L01 === 'run');
  // 로 앞면 존별 온도 표시 — 아래 온도 칸과 같은 값
  const zoneTemps = (g) => g?.channels.map((c) => tempAt(c.target, c.seed, data.now));
  const temps = { quench: zoneTemps(data.groups?.quench), temper: zoneTemps(data.groups?.temper) };
  return (
    <FurnaceFrame
      furnace={furnace}
      drawing={(
        <Suspense fallback={<div className="itg3-loading">3D 그림 불러오는 중…</div>}>
          <Mbf3Scene
            state={state}
            temps={temps}
            charge={charge}
            title={`${furnace.code} · ${furnace.name}`}
            note={allOn ? '전체 가동(ON) · 시연용' : '예시 상태 · 설비 구성은 1호기와 같음(PLC 연결 전)'}
          />
        </Suspense>
      )}
      temps={<Mbf1TempTrend data={data} />}
    />
  );
}
