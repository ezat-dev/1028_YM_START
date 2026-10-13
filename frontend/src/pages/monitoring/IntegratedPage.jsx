import { useState } from 'react';
import { IconDeviceDesktopAnalytics } from '@tabler/icons-react';
import { FURNACES } from '../../mocks/furnaceMock';
import './IntegratedPage.css';

// 한 화면에 2대씩 — 우측 상단 버튼으로 1~2 / 3~4 / 5~6호기를 바꿔 본다
const GROUPS = [
  { key: 'a', label: '1~2호기', items: FURNACES.slice(0, 2) },
  { key: 'b', label: '3~4호기', items: FURNACES.slice(2, 4) },
  { key: 'c', label: '5~6호기', items: FURNACES.slice(4, 6) },
];

/*
 * 모니터링 > 통합모니터링 — 레이아웃 초안(영역만).
 * 거래처와 배치를 상의하기 위한 빈 틀: 설비 2대를 가로로 긴 줄 2개로 쌓고, 각 줄은 [설비 그림] 위 / [온도] 아래.
 * 내용이 정해지면 각 영역(.itg2-drawing / .itg2-temp) 안을 채우면 된다.
 */
export default function IntegratedPage() {
  const [groupKey, setGroupKey] = useState(GROUPS[0].key);
  const group = GROUPS.find((g) => g.key === groupKey);

  return (
    <div className="mes-page itg2-page mes-page-fill">
      <div className="itg2-header">
        <div className="mes-page-icon"><IconDeviceDesktopAnalytics size={20} /></div>
        <h2 className="mes-page-title">통합모니터링</h2>
        <span className="itg2-badge">레이아웃 초안 · 영역만 표시</span>

        <div className="itg2-switch" role="group" aria-label="설비 묶음 선택">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`itg2-switch-btn${g.key === groupKey ? ' is-active' : ''}`}
              aria-pressed={g.key === groupKey}
              onClick={() => setGroupKey(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="itg2-rows">
        {group.items.map((f) => (
          <section key={f.code} className="itg2-row" aria-label={`${f.code} ${f.name}`}>
            <div className="itg2-row-label">
              <strong>{f.code}</strong>
              <span>{f.name}</span>
            </div>
            <div className="itg2-area itg2-drawing">
              <span>설비 그림 영역</span>
            </div>
            <div className="itg2-area itg2-temp">
              <span>온도 표시 영역</span>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
