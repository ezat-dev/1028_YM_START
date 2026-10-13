import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { IconMenu2 } from '@tabler/icons-react';
import Sidebar from '../components/Sidebar';
import { SidebarProvider, useSidebar } from '../context/SidebarContext';

export default function MainLayout() {
  return (
    <SidebarProvider>
      <LayoutShell />
    </SidebarProvider>
  );
}

// useSidebar()는 Provider 안쪽에서만 쓸 수 있어 레이아웃 본문을 따로 뺐다
function LayoutShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hidden } = useSidebar(); // 전체화면 모드 — 사이드바·모바일 헤더를 그리지 않음

  return (
    <>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f5f6f8' }}>
        {!hidden && <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!hidden && <div className="mes-mobile-header">
            <button
              className="mes-mobile-header-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="메뉴 열기"
            >
              <IconMenu2 size={20} />
            </button>
            <span className="mes-mobile-header-title">SMART MES</span>
          </div>}

          <div style={{ flex: 1, overflow: 'auto', background: '#f5f6f8' }}>
            <Outlet />
          </div>
        </div>

      <style>{`
        .mes-mobile-header {
          display: none;
        }
        @media (max-width: 768px) {
          .mes-mobile-header {
            display: flex;
            align-items: center;
            gap: 12px;
            height: 52px;
            flex-shrink: 0;
            padding: 0 14px;
            background: #fff;
            border-bottom: 1px solid var(--sb-border);
            color: var(--mes-text);
          }
          .mes-mobile-header-btn {
            border: none;
            background: transparent;
            color: var(--mes-text-sub);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            cursor: pointer;
          }
          .mes-mobile-header-title {
            font-size: 15px;
            font-weight: 800;
            letter-spacing: .2px;
          }
        }
      `}</style>
      </div>
    </>
  );
}
