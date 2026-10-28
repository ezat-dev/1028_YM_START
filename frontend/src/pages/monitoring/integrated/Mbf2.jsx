import FurnaceFrame from './FurnaceFrame';
import Mbf2Mimic from '../mbf2/Mbf2Mimic';
import { useChargeDemo } from './charge';
import Mbf1TempTrend from '../mbf1/Mbf1TempTrend';
import { ALL_RUN, SAMPLE_STATE } from '../mbf1/mbf1Layout';
import { tempAt, useMbf1Data } from '../mbf1/mbf1Data';

/*
 * 통합모니터링 > MBF2호기 — 설비 구성 · 램프 배치는 MBF1과 같고(mbf1Layout), 그림만 차분한 산업용 스타일(Mbf2Mimic).
 * 온도는 MBF1과 같은 화면(Mbf1TempTrend)에 2호기 패턴으로. 램프 상태 · 온도는 PLC 연결 전까지 예시.
 * allOn: 화면 위 ON 버튼 — 램프 전부 운전으로(시연용). 재료 투입(철통 도착 · 계량 · 승강기)은 예시 순서기(useChargeDemo)가 단계를 넘긴다.
 */
export default function Mbf2({ furnace, allOn }) {
  const data = useMbf1Data(2);
  const state = allOn ? ALL_RUN : SAMPLE_STATE;
  const charge = useChargeDemo(state.L01 === 'run');
  // 로 앞면 존별 온도 표시 — 아래 온도 칸과 같은 값
  const zoneTemps = (g) => g?.channels.map((c) => tempAt(c.target, c.seed, data.now));
  const temps = { quench: zoneTemps(data.groups?.quench), temper: zoneTemps(data.groups?.temper) };
  return (
    <FurnaceFrame
      furnace={furnace}
      drawing={(
        <Mbf2Mimic
          state={state}
          temps={temps}
          charge={charge}
          title={`${furnace.code} · ${furnace.name}`}
          note={allOn ? '전체 가동(ON) · 시연용' : '예시 상태 · 설비 구성은 1호기와 같음(PLC 연결 전)'}
        />
      )}
      temps={<Mbf1TempTrend data={data} />}
    />
  );
}
