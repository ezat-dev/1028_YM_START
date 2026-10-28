import FurnaceFrame from './FurnaceFrame';
import Mbf1Mimic from '../mbf1/Mbf1Mimic';
import Mbf1TempTrend from '../mbf1/Mbf1TempTrend';
import { ALL_RUN, SAMPLE_STATE } from '../mbf1/mbf1Layout';
import { useMbf1Data } from '../mbf1/mbf1Data';

/*
 * 통합모니터링 > MBF1호기 — 현장 운전 표시 패널을 옮긴 그림(램프 36개) + 온도(현재 + 최근 3시간 그래프).
 * 램프 상태 · 온도는 PLC 주소 연결 전까지 예시(SAMPLE_STATE · mbf1Data). 온도 칸과 그래프는 같은 데이터를 본다.
 * allOn: 화면 위 ON 버튼 — 램프 전부 운전으로(시연용). 끄면 예시 상태로 돌아간다.
 */
export default function Mbf1({ furnace, allOn }) {
  const data = useMbf1Data();
  return (
    <FurnaceFrame
      furnace={furnace}
      drawing={(
        <Mbf1Mimic
          state={allOn ? ALL_RUN : SAMPLE_STATE}
          title={`${furnace.code} · ${furnace.name}`}
          note={allOn ? '전체 가동(ON) · 시연용' : '예시 상태 · 현장 패널 사진 기준(PLC 연결 전)'}
        />
      )}
      temps={<Mbf1TempTrend data={data} />}
    />
  );
}
