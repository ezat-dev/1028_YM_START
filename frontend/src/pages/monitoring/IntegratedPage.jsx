import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconDeviceDesktopAnalytics, IconPower } from '@tabler/icons-react';
import { FURNACES, STATUS_LABEL } from '../../mocks/furnaceMock';
import { useSidebar } from '../../context/SidebarContext';
import { FURNACE_VIEWS } from './integrated';
import './IntegratedPage.css';

/*
 * 모니터링 > 통합모니터링 — 호기 하나씩 크게: [설비 그림] 위 / [현재 온도 | 최근 3시간 그래프 | 최근 알람] 아래.
 * 그림을 크게 보도록 들어오면 왼쪽 메뉴를 접고, 나갈 때 들어오기 전 상태로 되돌린다.
 * 우측 상단 1~6호기 버튼으로 바꿔 보고, 고른 호기는 주소(?equip=MBF1)에 남아 새로고침해도 그대로다.
 * 호기 화면은 integrated/Mbf1~Mbf6 파일에 하나씩 — MBF1만 현장 패널을 옮겨 그렸고 나머지는 패널 확인 후 그린다.
 * 1호기 버튼 왼쪽 ON/OFF — 누르면 램프가 전부 켜지고 설비가 움직인다(시연용), 다시 누르면 예시 상태로.
 */
export default function IntegratedPage() {
  const [params, setParams] = useSearchParams();
  const code = FURNACE_VIEWS[params.get('equip')] ? params.get('equip') : FURNACES[0].code;
  const furnace = FURNACES.find((f) => f.code === code);
  const View = FURNACE_VIEWS[code];
  const [allOn, setAllOn] = useState(false);

  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } = useSidebar();
  const sidebarBefore = useRef(sidebarCollapsed);
  useEffect(() => {
    const before = sidebarBefore.current;
    setSidebarCollapsed(true);
    return () => setSidebarCollapsed(before);
  }, [setSidebarCollapsed]);

  return (
    <div className="mes-page itg2-page mes-page-fill">
      <div className="itg2-header">
        <div className="mes-page-icon"><IconDeviceDesktopAnalytics size={20} /></div>
        <h2 className="mes-page-title">통합모니터링</h2>
        <span className="itg2-badge">{code === 'MBF3' ? 'MBF3 3D 작화 · 예시 데이터' : code === 'MBF1' || code === 'MBF2' ? `${code} 작화 · 예시 데이터` : '현장 패널 확인 후 작화'}</span>

        <button
          type="button"
          className={`itg2-power${allOn ? ' is-on' : ''}`}
          aria-pressed={allOn}
          title={allOn ? '누르면 예시 상태로' : '누르면 램프 전부 켜고 설비 가동(시연)'}
          onClick={() => setAllOn((v) => !v)}
        >
          <IconPower size={15} stroke={2.2} />
          {allOn ? 'ON' : 'OFF'}
        </button>

        <div className="itg2-switch" role="tablist" aria-label="호기 선택">
          {FURNACES.map((f) => (
            <button
              key={f.code}
              type="button"
              role="tab"
              className={`itg2-switch-btn${f.code === code ? ' is-active' : ''}`}
              aria-selected={f.code === code}
              title={`${f.name} · ${STATUS_LABEL[f.status] ?? ''}`}
              onClick={() => setParams({ equip: f.code }, { replace: true })}
            >
              <i className={`itg2-dot is-${f.status}`} aria-hidden="true" />
              {Number(f.code.replace(/\D/g, ''))}호기
            </button>
          ))}
        </div>
      </div>

      <View key={code} furnace={furnace} allOn={allOn} />
    </div>
  );
}
