import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  IconHexagon, IconChevronDown, IconSearch, IconX, IconLogout,
  IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand,
  IconDatabase, IconActivity, IconClipboardList, IconAdjustments, IconCertificate, IconSettings,
  IconUser, IconBuilding, IconBox, IconRoute, IconShieldLock, IconHistory, IconSettingsAutomation, IconTags,
  IconChartBar, IconDeviceDesktopAnalytics, IconBell, IconListNumbers, IconChartLine, IconPackages, IconTimeline,
  IconClipboardCheck, IconGauge, IconNotebook, IconFileReport,
  IconTemperature, IconAdjustmentsHorizontal, IconDroplet, IconChecklist, IconFileText,
  IconChartHistogram, IconChartDots, IconShieldCheck, IconFlame, IconDiamond, IconAlertOctagon,
  IconPlayerPause, IconChartPie, IconBolt, IconTool, IconHammer, IconComponents,
} from '@tabler/icons-react';
import MENU_DATA from '../constants/menuData';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import './Sidebar.css';

// 대분류 아이콘
const CATEGORY_ICONS = {
  '기준정보': IconDatabase,
  '모니터링': IconActivity,
  '생산관리': IconClipboardList,
  '조건관리': IconAdjustments,
  '품질관리': IconCertificate,
  '설비관리': IconSettings,
};

// 하위 메뉴 아이콘 — menuData.js는 백엔드 메뉴 트리와 같은 구조를 유지해야 해서 화면 전용인
// 아이콘은 여기서 경로로 매핑한다. 없으면 대분류 아이콘을 쓴다.
const MENU_ICONS = {
  '/base/user': IconUser,
  '/base/vendor': IconBuilding,
  '/base/product': IconBox,
  '/base/pattern': IconRoute,
  '/base/equipment': IconSettingsAutomation,
  '/base/downtime': IconTags,
  '/base/auth': IconShieldLock,
  '/base/loginHist': IconHistory,
  '/monitoring/prodStatus': IconChartBar,
  '/monitoring/integrated': IconDeviceDesktopAnalytics,
  '/monitoring/alarm': IconBell,
  '/monitoring/alarmRank': IconListNumbers,
  '/monitoring/trend': IconChartLine,
  '/monitoring/lotStatus': IconPackages,
  '/monitoring/lotTracking': IconTimeline,
  '/production/workOrder': IconClipboardList,
  '/production/byItem': IconClipboardCheck,
  '/production/equipEff': IconGauge,
  '/production/dailyReport': IconNotebook,
  '/production/lotReport': IconFileReport,
  '/condition/sensor': IconTemperature,
  '/condition/controller': IconAdjustmentsHorizontal,
  '/condition/oilAnalysis': IconDroplet,
  '/condition/dailyCheck': IconChecklist,
  '/condition/standard': IconFileText,
  '/quality/cpk': IconChartHistogram,
  '/quality/ppk': IconChartDots,
  '/quality/fproof': IconShieldCheck,
  '/quality/tempUniform': IconFlame,
  '/quality/hardness': IconDiamond,
  '/quality/nonconform': IconAlertOctagon,
  '/equipment/downStatus': IconPlayerPause,
  '/equipment/utilRate': IconChartPie,
  '/equipment/powerUsage': IconBolt,
  '/equipment/history': IconTool,
  '/equipment/repairHist': IconHammer,
  '/equipment/sparePart': IconComponents,
};

const MOBILE_QUERY = '(max-width: 768px)';
const isActivePath = (pathname, path) => pathname === path || pathname.startsWith(`${path}/`);

export default function Sidebar({ menuData = MENU_DATA, mobileOpen = false, onCloseMobile }) {
  const { collapsed, setCollapsed } = useSidebar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  // 모바일 서랍은 항상 펼친 모양 — 데스크톱의 접힘 상태가 서랍까지 따라오지 않게.
  const isCollapsed = collapsed && !isMobile;

  const activeCategory = menuData.find((g) => g.menus.some((m) => isActivePath(pathname, m.path)))?.category;

  // 기본은 전부 펼침(참고 화면처럼 한눈에 보이게). 사용자가 접은 그룹만 기억한다.
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  useEffect(() => {
    // 다른 그룹의 화면으로 이동하면 그 그룹은 다시 펼쳐서 현재 위치가 항상 보이게 한다.
    if (activeCategory) setClosedGroups((prev) => {
      if (!prev.has(activeCategory)) return prev;
      const next = new Set(prev);
      next.delete(activeCategory);
      return next;
    });
  }, [activeCategory]);

  const toggleGroup = (category) =>
    setClosedGroups((prev) => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });

  // ── 메뉴 검색 (Ctrl+K) ─────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const q = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!q) return menuData;
    return menuData
      .map((g) => ({ ...g, menus: g.menus.filter((m) => m.name.toLowerCase().includes(q)) }))
      .filter((g) => g.menus.length > 0);
  }, [q, menuData]);
  const firstResult = q ? visibleGroups[0]?.menus[0] : null;

  const focusSearch = () => {
    if (isCollapsed) setCollapsed(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const afterNavigate = () => {
    setQuery('');
    onCloseMobile?.();
  };

  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter' && firstResult) {
      navigate(firstResult.path);
      afterNavigate();
    }
    if (e.key === 'Escape') {
      setQuery('');
      e.currentTarget.blur();
    }
  };

  // ── 접힘 상태 툴팁 (메뉴 영역이 세로 스크롤이라 CSS 말풍선은 잘려서 fixed로 띄운다) ──
  const [tip, setTip] = useState(null);
  const tipProps = (label) => ({
    onMouseEnter: (e) => {
      if (!isCollapsed) return;
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
    },
    onMouseLeave: () => setTip(null),
  });
  useEffect(() => setTip(null), [isCollapsed, pathname]);

  const handleLogout = () => {
    if (window.confirm('로그아웃하시겠습니까?')) {
      logout();
      navigate('/login', { replace: true });
    }
  };

  const userName = user?.userName ?? '';
  const userDept = user?.deptName ?? '';

  const classes = ['sb', isCollapsed && 'sb--collapsed', mobileOpen && 'sb--mobile-open'].filter(Boolean).join(' ');

  return (
    <>
      <div className={`sb-backdrop${mobileOpen ? ' is-visible' : ''}`} onClick={onCloseMobile} aria-hidden="true" />

      <aside className={classes} aria-label="주 메뉴">
        {/* 브랜드 */}
        <div className="sb-brand">
          <span className="sb-logo"><IconHexagon size={16} stroke={2} /></span>
          <span className="sb-brand-name">SMART MES</span>
          {isMobile && (
            <button type="button" className="sb-icon-btn" onClick={onCloseMobile} aria-label="메뉴 닫기">
              <IconX size={18} />
            </button>
          )}
        </div>

        {/* 검색 */}
        {isCollapsed ? (
          <button type="button" className="sb-link sb-search-btn" onClick={focusSearch} aria-label="메뉴 검색" {...tipProps('메뉴 검색 (Ctrl+K)')}>
            <IconSearch size={18} className="sb-link-icon" />
          </button>
        ) : (
          <label className="sb-search">
            <IconSearch size={15} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="메뉴 검색 (Ctrl+K)"
              aria-label="메뉴 검색"
            />
            {query && (
              <button type="button" className="sb-search-clear" onClick={() => setQuery('')} aria-label="검색어 지우기">
                <IconX size={14} />
              </button>
            )}
          </label>
        )}

        {/* 메뉴 */}
        <nav className="sb-nav">
          {q && visibleGroups.length === 0 && <div className="sb-empty">일치하는 메뉴가 없습니다.</div>}

          {visibleGroups.map((group) => {
            const GroupIcon = CATEGORY_ICONS[group.category] ?? IconDatabase;
            // 검색 중이거나 접힘 상태에서는 그룹을 항상 펼쳐 보여준다(접힘 상태는 아이콘만 나열).
            const isOpen = !!q || isCollapsed || !closedGroups.has(group.category);
            const panelId = `sb-panel-${group.path.replace(/\W/g, '')}`;
            return (
              <section key={group.category} className="sb-group">
                {isCollapsed ? (
                  <div className="sb-divider" role="separator" />
                ) : (
                  <button
                    type="button"
                    className={`sb-group-head${group.category === activeCategory ? ' is-current' : ''}`}
                    onClick={() => toggleGroup(group.category)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    disabled={!!q}
                  >
                    <GroupIcon size={16} stroke={2} className="sb-group-icon" />
                    <span className="sb-group-label">{group.category}</span>
                    {!q && <IconChevronDown size={15} className={`sb-chevron${isOpen ? '' : ' is-closed'}`} />}
                  </button>
                )}

                {isOpen && (
                  <div id={panelId} className="sb-items">
                    {group.menus.map((item) => {
                      const Icon = MENU_ICONS[item.path] ?? GroupIcon;
                      const isFirst = firstResult?.path === item.path;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          className={({ isActive }) => `sb-link${isActive ? ' is-active' : ''}${isFirst ? ' is-first' : ''}`}
                          onClick={afterNavigate}
                          aria-label={isCollapsed ? item.name : undefined}
                          {...tipProps(item.name)}
                        >
                          <Icon size={18} stroke={1.7} className="sb-link-icon" />
                          <span className="sb-link-label">{item.name}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </nav>

        {/* 하단: 사용자 + 메뉴 접기 */}
        <div className="sb-footer">
          <div className="sb-user">
            <span className="sb-avatar" aria-hidden="true">{userName ? userName.slice(0, 1) : '?'}</span>
            <span className="sb-user-text">
              <span className="sb-user-name">{userName}</span>
              <span className="sb-user-dept">{userDept}</span>
            </span>
            <button type="button" className="sb-icon-btn sb-logout" onClick={handleLogout} aria-label="로그아웃" {...tipProps('로그아웃')}>
              <IconLogout size={17} />
            </button>
          </div>

          {!isMobile && (
            <button
              type="button"
              className="sb-link sb-collapse"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={isCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
              {...tipProps('메뉴 펼치기')}
            >
              {isCollapsed
                ? <IconLayoutSidebarLeftExpand size={18} className="sb-link-icon" />
                : <IconLayoutSidebarLeftCollapse size={18} className="sb-link-icon" />}
              <span className="sb-link-label">메뉴 접기</span>
            </button>
          )}
        </div>
      </aside>

      {tip && (
        <div className="sb-tooltip" style={{ top: tip.top, left: tip.left }} role="tooltip">
          {tip.label}
        </div>
      )}
    </>
  );
}
