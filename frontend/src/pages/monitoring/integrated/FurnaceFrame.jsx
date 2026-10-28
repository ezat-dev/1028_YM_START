import AlarmRecent from './AlarmRecent';
import LotPanel from './LotPanel';

/*
 * 통합모니터링 호기 화면의 공통 틀 — [설비 그림] 위(가로 꽉) / 아래 3구역 [LOT | 온도(현재 + 3시간 그래프) | 최근 알람].
 * 각 호기 파일(Mbf1~Mbf6)은 그림 · 온도만 넣는다. LOT(예시) · 알람(실데이터)은 모든 호기에 바로 나온다.
 * 아직 안 그린 호기는 빈 영역(안내 문구)으로 둔다.
 */
function Empty({ label, className = '' }) {
  return <div className={`itg3-panel is-empty ${className}`.trim()}><span>{label}</span></div>;
}

export default function FurnaceFrame({ furnace, drawing, temps }) {
  return (
    <section className="itg3" aria-label={`${furnace.code} ${furnace.name}`}>
      {drawing
        ? <div className="itg3-drawing">{drawing}</div>
        : <Empty className="itg3-drawing" label={`${furnace.code} ${furnace.name} · 설비 그림은 현장 패널 확인 후 작화`} />}
      <div className="itg3-bottom">
        <div className="itg3-panel"><LotPanel furnace={furnace} /></div>
        {temps ? <div className="itg3-panel">{temps}</div> : <Empty label="온도 · 최근 3시간 그래프" />}
        <div className="itg3-panel"><AlarmRecent code={furnace.code} /></div>
      </div>
    </section>
  );
}
