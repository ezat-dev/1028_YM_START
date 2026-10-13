import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconSearch, IconRefresh, IconHistory, IconCircleCheck, IconCircleX, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { getList } from '../../api/base/loginHistApi';

// 컬럼 폭 규칙
// - 길이가 항상 같은 값(일시 19자, 결과 배지)은 내용에 딱 맞는 고정폭(px)
// - 나머지(아이디·이름·IP·실패 사유)는 width를 주지 않는다 → table-layout:fixed에서
//   남는 폭을 '똑같이' 나눠 가진다. 화면이 넓든 좁든 네 칸이 항상 같은 폭이라 고르게 보인다.
// - 짧은 값은 가운데 정렬, 문장인 실패 사유만 왼쪽 정렬
// - 표 최소 폭(.lh-table)보다 좁아지면 표 안에서 가로 스크롤
const COLUMNS = [
  { key: 'loginDt', label: '로그인 일시', sortable: true, align: 'center', width: '170px' },
  { key: 'loginId', label: '아이디', sortable: true, align: 'center' },
  { key: 'userName', label: '이름', sortable: true, align: 'center' },
  { key: 'loginIp', label: '접속 IP', sortable: false, align: 'center' },
  { key: 'successYn', label: '결과', sortable: true, align: 'center', width: '84px' },
  { key: 'failReason', label: '실패 사유', sortable: false, align: 'left' },
];

function formatDt(v) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '';
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yearStartStr() {
  return `${new Date().getFullYear()}-01-01`;
}

export default function LoginHistPage() {
  const [rows, setRows] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState(yearStartStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState('loginDt');
  const [sortDir, setSortDir] = useState('desc');
  const { toast, showToast } = useToast();
  const { visibleCount, onScroll, reset: resetVisible } = useInfiniteScroll();

  const fetchHist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getList({ page: 1, size: 1000 });
      setRows(res.data?.content ?? []);
    } catch (e) {
      showToast('로그인 이력을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchHist();
  }, [fetchHist]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    // "T00:00:00"을 붙여야 로컬 자정 기준으로 파싱된다 (YYYY-MM-DD만 넘기면 UTC 자정으로 해석돼
    // 시간대에 따라 하루 앞뒤로 밀리는 문제가 있음).
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return rows.filter((r) => {
      if (k && !(r.loginId?.toLowerCase().includes(k) || r.userName?.toLowerCase().includes(k))) return false;
      if (from !== null || to !== null) {
        const t = r.loginDt ? new Date(r.loginDt).getTime() : NaN;
        if (isNaN(t)) return false;
        if (from !== null && t < from) return false;
        if (to !== null && t > to) return false;
      }
      return true;
    });
  }, [rows, keyword, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const list = [...filtered];
    list.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'ko');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => { resetVisible(); }, [keyword, dateFrom, dateTo, resetVisible]);

  const paged = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);

  const toggleSort = (col) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  const stats = useMemo(() => {
    const success = rows.filter((r) => r.successYn === 'Y').length;
    return { total: rows.length, success, fail: rows.length - success };
  }, [rows]);

  return (
    <div className="mes-page mes-page-fill">
      <div className="mes-page-header">
        <div className="mes-page-heading">
          <div className="mes-page-icon">
            <IconHistory size={20} />
          </div>
          <div>
            <h2 className="mes-page-title">로그인이력</h2>
            <p className="mes-page-desc">로그인 성공/실패 시도가 자동으로 기록됩니다.</p>
          </div>
        </div>
        <button className="mes-btn mes-btn-secondary" onClick={fetchHist}>
          <IconRefresh size={16} /> 새로고침
        </button>
      </div>

      <div className="mes-stat-grid">
        <div className="mes-stat-card">
          <div className="mes-stat-icon" style={{ background: 'var(--mes-accent-soft)', color: 'var(--mes-accent-dark)' }}>
            <IconHistory size={17} />
          </div>
          <div>
            <div className="mes-stat-value">{stats.total}</div>
            <div className="mes-stat-label">전체 시도</div>
          </div>
        </div>
        <div className="mes-stat-card">
          <div className="mes-stat-icon" style={{ background: 'var(--mes-success-soft)', color: 'var(--mes-success)' }}>
            <IconCircleCheck size={17} />
          </div>
          <div>
            <div className="mes-stat-value">{stats.success}</div>
            <div className="mes-stat-label">성공</div>
          </div>
        </div>
        <div className="mes-stat-card">
          <div className="mes-stat-icon" style={{ background: 'var(--mes-danger-soft)', color: 'var(--mes-danger)' }}>
            <IconCircleX size={17} />
          </div>
          <div>
            <div className="mes-stat-value">{stats.fail}</div>
            <div className="mes-stat-label">실패</div>
          </div>
        </div>
      </div>

      <div className="mes-card mes-card-fill">
        <div className="mes-toolbar" style={{ flexWrap: 'wrap', rowGap: 8 }}>
          <div className="mes-search">
            <IconSearch size={15} />
            <input
              placeholder="아이디 또는 이름 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <span className="mes-page-desc">기간</span>
          <input
            type="date"
            className="mes-field-inline"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="mes-page-desc">~</span>
          <input
            type="date"
            className="mes-field-inline"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <button
            className="mes-btn mes-btn-ghost"
            onClick={() => { setDateFrom(yearStartStr()); setDateTo(todayStr()); }}
          >
            기간 초기화
          </button>
          <span className="mes-page-desc" style={{ marginLeft: 'auto' }}>{loading ? '불러오는 중...' : `총 ${filtered.length}건`}</span>
        </div>

        <div className="mes-table-scroll" onScroll={onScroll}>
          <table className="mes-plain-table mes-table-fixed lh-table">
            <colgroup>
              {COLUMNS.map((col) => <col key={col.key} style={col.width ? { width: col.width } : undefined} />)}
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={col.sortable ? 'sortable' : undefined}
                    style={col.align ? { textAlign: col.align } : undefined}
                    onClick={() => toggleSort(col)}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="sort-arrow">
                        {sortDir === 'asc' ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="mes-table-empty">데이터가 없습니다.</td></tr>
              )}
              {paged.map((r, i) => (
                <tr key={`${r.loginId}-${r.loginDt}-${i}`}>
                  <td style={{ textAlign: 'center' }}>{formatDt(r.loginDt)}</td>
                  <td className="truncate" style={{ textAlign: 'center' }} title={r.loginId}>{r.loginId}</td>
                  <td className="truncate" style={{ textAlign: 'center' }}>{r.userName}</td>
                  <td className="truncate" style={{ textAlign: 'center' }} title={r.loginIp}>{r.loginIp}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`mes-badge ${r.successYn === 'Y' ? 'mes-badge-success' : 'mes-badge-danger'}`}>
                      {r.successYn === 'Y' ? '성공' : '실패'}
                    </span>
                  </td>
                  <td className="truncate" title={r.failReason || undefined}>{r.failReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mes-scroll-status">
          {sorted.length === 0 ? '0건' : `${Math.min(visibleCount, sorted.length)} / 총 ${sorted.length}건 표시 중`}
          {visibleCount < sorted.length && ' · 스크롤하여 더 보기'}
        </div>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
