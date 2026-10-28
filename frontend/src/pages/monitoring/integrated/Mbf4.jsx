import FurnaceFrame from './FurnaceFrame';

/*
 * 통합모니터링 > MBF4호기 — 현장 운전 표시 패널을 확인한 뒤 그린다(MBF1처럼 그림 · 온도 컴포넌트를 만들어 넣으면 된다).
 * 그 전까지는 빈 영역.
 */
export default function Mbf4({ furnace }) {
  return <FurnaceFrame furnace={furnace} />;
}
