import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconTrophy, IconFileSpreadsheet, IconArrowUp, IconArrowDown, IconListDetails } from '@tabler/icons-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip as RTooltip } from 'recharts';
import * as XLSX from 'xlsx';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { getRank, getTrendByFolder } from '../../api/monitoring/alarmRankApi';
import { getMessageCountsByFolder, getFolders, getHistoryRange } from '../../api/monitoring/alarmApi';
import './AlarmRankPage.css';

function toDateInput(d) {
  return d.toISOString().slice(0, 10);
}

function pad(n) { return String(n).padStart(2, '0'); }
function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toSqlDateTime(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}
function fmtDt(s) {
  return String(s ?? '').replace('T', ' ').slice(0, 19);
}

const PERIODS = [
  { key: 'today', label: '오늘', days: 0 },
  { key: 'week', label: '이번주', days: 7 },
  { key: 'month', label: '이번달' }, // 일수가 아니라 이번 달 1일부터 — applyPeriod에서 따로 계산
  { key: 'all', label: '전체', days: 3650 },
];

const medalColor = (i) => (i === 0 ? '#d4a017' : i === 1 ? '#9aa1ac' : i === 2 ? '#b0764a' : 'var(--mes-text-faint)');
const levelBadge = (level) => (level >= 3 ? 'mes-badge-danger' : level === 2 ? 'mes-badge-warning' : 'mes-badge-success');

// 다른 화면(전력량·설비 색)과 같은 연한 계열 — 순서대로 쓰고 돌려 쓰지 않는다(상위 6개 + 기타)
const DONUT_COLORS = ['#5f80c6', '#e6a35a', '#35ad9c', '#9a85db', '#e57a7f', '#55ade6'];
const DONUT_OTHER_COLOR = '#c3c9d4';

function formatBucket(bucket, bucketUnit) {
  // recharts Tooltip이 XAxis dataKey 없이는 카테고리 인덱스(숫자)를 label로 넘길 때가 있어
  // 문자열이 아니면 그냥 빈 값으로 처리한다.
  if (!bucket || typeof bucket !== 'string') return '';
  if (bucketUnit === 'HOUR') return `${bucket.slice(11, 13)}시`;
  return bucket.slice(5, 10).replace('-', '/');
}

const HIST_COLUMNS = [
  { key: 'folderName', label: '설비', sortable: false, align: 'center' },
  { key: 'occurTime', label: '발생시각', sortable: true, align: 'center' },
  { key: 'clearTime', label: '해제시각', sortable: true, align: 'center' },
  { key: 'tagName', label: '태그', sortable: false },
  { key: 'alarmMsg', label: '메시지', sortable: false },
  { key: 'level', label: '레벨', sortable: false, align: 'center' },
  { key: 'valueAtOccur', label: '발생값', sortable: false, align: 'center' },
];

/**
 * 얇은 링 도넛 — 조각 사이 2px 틈, 마우스를 올린 조각만 두껍게.
 * 가운데에는 평소 총 건수, 조각(또는 오른쪽 목록)에 올리면 그 메시지의 비율을 보여준다.
 */
const RING_R = 46;
const RING_W = 12;
const RING_C = 2 * Math.PI * RING_R;
const RING_GAP = 2.2; // 조각 사이 틈(둘레 길이 기준)

function MessageRing({ data, total, active, onActive }) {
  let acc = 0;
  const gap = data.length > 1 ? RING_GAP : 0;
  const arcs = data.map((d) => {
    const len = total ? (d.value / total) * RING_C : 0;
    const arc = { ...d, start: acc, len: Math.max(0.01, len - gap) };
    acc += len;
    return arc;
  });
  const cur = arcs.find((a) => a.key === active);
  return (
    <div className="rank2-ring">
      <svg viewBox="0 0 120 120" role="img" aria-label={data.map((d) => `${d.label} ${d.value}건`).join(', ')}>
        <circle cx="60" cy="60" r={RING_R} fill="none" stroke="var(--mes-line)" strokeWidth={RING_W} opacity=".5" />
        {arcs.map((a) => {
          const on = a.key === active;
          return (
            <circle
              key={a.key}
              cx="60"
              cy="60"
              r={RING_R}
              fill="none"
              stroke={a.color}
              strokeWidth={on ? RING_W + 4 : RING_W}
              strokeDasharray={`${a.len} ${RING_C - a.len}`}
              strokeDashoffset={-a.start}
              transform="rotate(-90 60 60)"
              className={`rank2-ring-seg${active && !on ? ' is-dim' : ''}`}
              onMouseEnter={() => onActive(a.key)}
              onMouseLeave={() => onActive(null)}
            />
          );
        })}
      </svg>
      <div className="rank2-ring-center" aria-hidden="true">
        {cur ? (
          <>
            <b>{Math.round((cur.value / total) * 100)}<small>%</small></b>
            <span>{cur.value}건</span>
          </>
        ) : (
          <>
            <b>{total}</b>
            <span>전체 건수</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function AlarmRankPage() {
  // ── 사이드바: 랭킹/스탯/스파크라인 ──
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [byFolder, setByFolder] = useState([]);
  const [messageCounts, setMessageCounts] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── 메인: 알람 이력(설비/상태/기간 조회 + 엑셀) — 이 페이지의 주인공 ──
  const [folders, setFolders] = useState([]);
  const [histFrom, setHistFrom] = useState('');
  const [histTo, setHistTo] = useState('');
  const [histFolderId, setHistFolderId] = useState('');
  const [histState, setHistState] = useState('all'); // all | active | cleared
  const [histRows, setHistRows] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histSortKey, setHistSortKey] = useState('occurTime');
  const [histSortDir, setHistSortDir] = useState('desc');

  const { toast, showToast } = useToast();
  const { visibleCount: histVisibleCount, onScroll: onHistScroll, reset: resetHistVisible } = useInfiniteScroll();

  const bucketUnit = period === 'today' ? 'HOUR' : 'DAY';

  const applyPeriod = useCallback((key) => {
    const now = new Date();
    let start;
    if (key === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      const p = PERIODS.find((x) => x.key === key);
      start = new Date(now);
      start.setDate(start.getDate() - (p?.days ?? 7));
    }
    setFrom(toDateInput(start));
    setTo(toDateInput(now));
    setPeriod(key);
  }, []);

  // f/t를 인자로 받는다 — 마운트 시 setHistFrom/setHistTo 직후 곧바로 조회할 때 state 반영을
  // 기다리지 않고 그 자리에서 계산한 기본값으로 바로 호출하기 위해서(클로저 stale-state 방지).
  const fetchHistory = useCallback(async (f, t) => {
    if (!f || !t) return;
    setHistLoading(true);
    try {
      const res = await getHistoryRange(toSqlDateTime(new Date(f)), toSqlDateTime(new Date(t)));
      setHistRows(res.data ?? []);
      resetHistVisible();
    } catch (e) {
      showToast('알람 이력을 불러오지 못했습니다.', 'error');
    } finally {
      setHistLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyPeriod('month');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultFrom = toLocalInput(monthStart);
    const defaultTo = toLocalInput(now);
    setHistFrom(defaultFrom);
    setHistTo(defaultTo);
    getFolders().then((res) => setFolders(res.data ?? [])).catch(() => {});
    fetchHistory(defaultFrom, defaultTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyPeriod]);

  const fetchRank = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    try {
      const [folderRes, msgRes, trendRes] = await Promise.all([
        getRank(from, to, 'folder'),
        getMessageCountsByFolder(from, to),
        getTrendByFolder(from, to, bucketUnit),
      ]);
      setByFolder(folderRes.data ?? []);
      setMessageCounts(msgRes.data ?? []);
      setTrendRows(trendRes.data ?? []);
    } catch (e) {
      showToast('랭킹을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, bucketUnit]);

  useEffect(() => {
    fetchRank();
  }, [fetchRank]);

  const topMessageOverall = useMemo(() => {
    if (!messageCounts.length) return null;
    return [...messageCounts].sort((a, b) => b.cnt - a.cnt)[0];
  }, [messageCounts]);

  // 설비별 랭킹 하단 도넛 — "어떤 메시지가 제일 많이 떴는지"가 궁금한 거라서, 설비 구분 없이
  // 메시지 텍스트 기준으로 전부 합산한 뒤 건수 상위 6개를 슬라이스로, 나머지 메시지는
  // "기타" 한 조각으로 묶는다(같은 메시지가 여러 설비에서 발생해도 하나로 합쳐진다).
  const topMessagesDonut = useMemo(() => {
    const byMsg = new Map();
    messageCounts.forEach((row) => {
      const key = row.alarmMsg;
      byMsg.set(key, (byMsg.get(key) ?? 0) + row.cnt);
    });
    const sorted = Array.from(byMsg.entries())
      .map(([msg, cnt]) => ({ msg, cnt }))
      .sort((a, b) => b.cnt - a.cnt);

    const top = sorted.slice(0, 6).map((r, i) => ({
      key: r.msg,
      label: r.msg,
      value: r.cnt,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
    const restSum = sorted.slice(6).reduce((s, r) => s + r.cnt, 0);
    if (restSum > 0) {
      top.push({
        key: '__other',
        label: '기타',
        detail: `${sorted.length - 6}개 메시지`,
        value: restSum,
        color: DONUT_OTHER_COLOR,
      });
    }
    return top;
  }, [messageCounts]);

  const donutTotal = topMessagesDonut.reduce((s, r) => s + r.value, 0);
  const [donutActive, setDonutActive] = useState(null);

  // 설비별 추이를 전체 합계 하나로 접어 사이드바용 미니 스파크라인만 그린다(설비별 세부 추이는
  // 이제 이 페이지의 주인공이 아니라서 뺐다 — 필요하면 설비별 랭킹에서 절대량 비교로 충분).
  // 백엔드가 빈 버킷을 채워주지 않아(트렌드 화면과 달리 gap-fill 없음), 알람이 하루에 몰려 있으면
  // 점 하나만 찍혀 추이처럼 보이지 않는다 — 여기서 0으로 채워 넣어 선이 항상 이어지게 한다.
  const totalTrendData = useMemo(() => {
    const map = new Map();
    trendRows.forEach((row) => { map.set(row.bucket, (map.get(row.bucket) || 0) + row.cnt); });
    if (!from || !to) return [];

    const buckets = [];
    if (bucketUnit === 'HOUR') {
      const now = new Date();
      const isToday = from === toDateInput(now);
      const lastHour = isToday ? now.getHours() : 23;
      for (let hh = 0; hh <= lastHour; hh++) buckets.push(`${from} ${pad(hh)}:00:00`);
    } else {
      const cursor = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      while (cursor <= end) {
        buckets.push(toDateInput(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return buckets.map((bucket) => ({ bucket, cnt: map.get(bucket) || 0 }));
  }, [trendRows, from, to, bucketUnit]);

  // 스파크라인 맨 끝(최신 값) 점만 살짝 펄스를 줘서 실시간 갱신 중인 느낌을 준다.
  const renderSparkDot = (props) => {
    const { cx, cy, index } = props;
    if (cx == null || cy == null || index !== totalTrendData.length - 1) return null;
    return (
      <g key="spark-live">
        <circle cx={cx} cy={cy} r="3" className="rank2-spark-pulse" />
        <circle cx={cx} cy={cy} r="2.5" fill="var(--mes-accent)" />
      </g>
    );
  };

  const totalCount = byFolder.reduce((s, r) => s + r.count, 0);
  const maxCount = byFolder.length ? Math.max(...byFolder.map((r) => r.count)) : 1;
  const topFolder = byFolder[0];

  // ── 알람 이력: 설비/상태 필터 + 정렬 + 페이징 ──
  const filteredHistRows = useMemo(() => {
    let rows = histRows;
    if (histFolderId) rows = rows.filter((r) => String(r.folderId) === String(histFolderId));
    if (histState === 'active') rows = rows.filter((r) => !r.clearTime);
    if (histState === 'cleared') rows = rows.filter((r) => !!r.clearTime);
    rows = [...rows].sort((a, b) => {
      const av = a[histSortKey] ?? '', bv = b[histSortKey] ?? '';
      return histSortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return rows;
  }, [histRows, histFolderId, histState, histSortKey, histSortDir]);

  useEffect(() => { resetHistVisible(); }, [histFolderId, histState, resetHistVisible]);

  const pagedHistRows = useMemo(
    () => filteredHistRows.slice(0, histVisibleCount),
    [filteredHistRows, histVisibleCount]
  );

  const toggleHistSort = (col) => {
    if (!col.sortable) return;
    if (histSortKey === col.key) setHistSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setHistSortKey(col.key); setHistSortDir('desc'); }
  };

  // 전호기(全號機) 각각 시트에 나눠서 엑셀로 저장 — 현재 조회된 기간 전체(설비 필터와 무관하게 전 설비)를 대상으로 한다.
  const handleExportExcel = () => {
    if (!histRows.length) { showToast('내보낼 데이터가 없습니다.', 'error'); return; }
    const byFolderName = new Map();
    histRows.forEach((r) => {
      const key = r.folderName || '기타';
      if (!byFolderName.has(key)) byFolderName.set(key, []);
      byFolderName.get(key).push(r);
    });
    const wb = XLSX.utils.book_new();
    Array.from(byFolderName.keys()).sort().forEach((folderName) => {
      const rows = byFolderName.get(folderName);
      const sheetData = rows.map((r) => ({
        발생시각: fmtDt(r.occurTime),
        해제시각: r.clearTime ? fmtDt(r.clearTime) : '활성',
        태그: r.tagName,
        메시지: r.alarmMsg,
        레벨: r.level,
        발생값: r.valueAtOccur,
      }));
      const ws = XLSX.utils.json_to_sheet(sheetData);
      // 기본 열 너비가 너무 좁아 내용이 다 가려져서 실제 값 길이에 맞춰 넉넉하게 지정한다.
      ws['!cols'] = [
        { wch: 20 }, // 발생시각
        { wch: 20 }, // 해제시각
        { wch: 14 }, // 태그
        { wch: 30 }, // 메시지
        { wch: 8 },  // 레벨
        { wch: 10 }, // 발생값
      ];
      const safeName = String(folderName).replace(/[[\]:*?/\\]/g, '_').slice(0, 31) || 'Sheet';
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    });
    const stamp = (s) => s.replace('T', '_').replace(/:/g, '');
    XLSX.writeFile(wb, `경보이력_${stamp(histFrom)}~${stamp(histTo)}.xlsx`);
  };

  return (
    <div className="mes-page mes-page-fill">
      <div className="mes-page-header">
        <div className="mes-page-heading">
          <div className="mes-page-icon">
            <IconTrophy size={20} />
          </div>
          <div>
            <h2 className="mes-page-title">경보랭킹</h2>
            <p className="mes-page-desc">설비별 순위·추이는 참고용 사이드바로, 실제 알람 이력 조회가 이 화면의 중심입니다.</p>
          </div>
        </div>
      </div>

      <div className="rank2-layout">
        <div className="mes-card rank2-sidebar">
          <div className="rank2-period-row">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={period === p.key ? 'mes-btn mes-btn-primary' : 'mes-btn mes-btn-secondary'}
                onClick={() => applyPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="rank2-kpi-stack">
            <div className="rank2-kpi-row">
              <span className="rank2-kpi-label">총 발생</span>
              <span className="rank2-kpi-value">{totalCount}건</span>
            </div>
            <div className="rank2-kpi-row">
              <span className="rank2-kpi-label">최다 설비</span>
              <span className="rank2-kpi-value">{topFolder?.label ?? '—'} <b>{topFolder?.count ?? 0}건</b></span>
            </div>
            <div className="rank2-kpi-row">
              <span className="rank2-kpi-label">최다 메시지</span>
              <span className="rank2-kpi-value" title={topMessageOverall?.alarmMsg}>{topMessageOverall?.alarmMsg ?? '—'}</span>
            </div>
          </div>

          <div className="rank2-sparkline">
            <ResponsiveContainer width="100%" height={60}>
              <AreaChart data={totalTrendData} margin={{ top: 2, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="rankSpark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--mes-accent)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--mes-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                {/* dataKey를 명시해야 Tooltip label로 실제 bucket 문자열이 들어온다 —
                    없으면 recharts가 배열 인덱스(숫자)를 넘겨서 formatBucket의 .slice()가 터진다. */}
                <XAxis dataKey="bucket" hide />
                <RTooltip labelFormatter={(v) => formatBucket(v, bucketUnit)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Area type="monotone" dataKey="cnt" stroke="var(--mes-accent)" fill="url(#rankSpark)" strokeWidth={2} dot={renderSparkDot} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="rank2-section-label">설비별 랭킹 ({bucketUnit === 'HOUR' ? '오늘' : period === 'all' ? '전체' : '기간'})</div>
          <div className="rank2-list">
            {loading ? (
              <div className="rank2-empty">불러오는 중...</div>
            ) : byFolder.length === 0 ? (
              <div className="rank2-empty">해당 기간에 발생한 알람이 없습니다.</div>
            ) : (
              byFolder.slice(0, 5).map((r, i) => (
                <div className="rank2-row" key={r.groupKey}>
                  <span className="rank2-badge" style={{ background: medalColor(i) }}>{i + 1}</span>
                  <span className="rank2-label" title={r.label}>{r.label}</span>
                  <div className="rank2-bar-track"><div className="rank2-bar-fill" style={{ width: `${(r.count / maxCount) * 100}%` }} /></div>
                  <span className="rank2-count">{r.count}</span>
                </div>
              ))
            )}
          </div>

          <div className="rank2-section-label">가장 많이 발생한 메시지</div>
          <div className="rank2-donut-block">
            {topMessagesDonut.length === 0 ? (
              <div className="rank2-empty">데이터 없음</div>
            ) : (
              <div className="rank2-msg">
                <MessageRing data={topMessagesDonut} total={donutTotal} active={donutActive} onActive={setDonutActive} />
                <ol className="rank2-msg-list">
                  {topMessagesDonut.map((d) => {
                    const pct = donutTotal ? Math.round((d.value / donutTotal) * 100) : 0;
                    return (
                      <li
                        key={d.key}
                        className={`rank2-msg-row${donutActive === d.key ? ' is-on' : ''}${donutActive && donutActive !== d.key ? ' is-dim' : ''}`}
                        title={d.detail ? `${d.label} (${d.detail})` : d.label}
                        onMouseEnter={() => setDonutActive(d.key)}
                        onMouseLeave={() => setDonutActive(null)}
                      >
                        <span className="rank2-msg-dot" style={{ background: d.color }} />
                        <span className="rank2-msg-label">{d.label}</span>
                        <span className="rank2-msg-cnt">{d.value}건</span>
                        <span className="rank2-msg-pct">{pct}%</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        </div>

        <div className="mes-card rank2-main">
          <div className="mes-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span className="rank2-main-title"><IconListDetails size={16} /> 알람 이력 ({filteredHistRows.length}건)</span>
            <select className="mes-field-inline" value={histFolderId} onChange={(e) => setHistFolderId(e.target.value)}>
              <option value="">전체 설비</option>
              {folders.map((f) => <option key={f.folderId} value={f.folderId}>{f.folderName}</option>)}
            </select>
            <select className="mes-field-inline" value={histState} onChange={(e) => setHistState(e.target.value)}>
              <option value="all">전체 상태</option>
              <option value="active">활성만</option>
              <option value="cleared">해제만</option>
            </select>
            <span className="mes-page-desc">기간</span>
            <input type="datetime-local" className="mes-field-inline" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
            <span>~</span>
            <input type="datetime-local" className="mes-field-inline" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
            <button className="mes-btn mes-btn-secondary" onClick={() => fetchHistory(histFrom, histTo)}>조회</button>
            <button className="mes-btn mes-btn-secondary" style={{ marginLeft: 'auto' }} onClick={handleExportExcel}>
              <IconFileSpreadsheet size={15} /> 엑셀 출력 (설비별 시트)
            </button>
          </div>

          <div className="mes-table-scroll" onScroll={onHistScroll}>
            <table className="mes-plain-table">
              <thead>
                <tr>
                  {HIST_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={col.sortable ? 'sortable' : undefined}
                      style={col.align ? { textAlign: col.align } : undefined}
                      onClick={() => toggleHistSort(col)}
                    >
                      {col.label}
                      {histSortKey === col.key && (
                        <span className="sort-arrow">
                          {histSortDir === 'asc' ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {histLoading && (
                  <tr><td colSpan={HIST_COLUMNS.length} className="mes-table-empty">불러오는 중...</td></tr>
                )}
                {!histLoading && pagedHistRows.length === 0 && (
                  <tr><td colSpan={HIST_COLUMNS.length} className="mes-table-empty">데이터가 없습니다.</td></tr>
                )}
                {!histLoading && pagedHistRows.map((a) => (
                  <tr key={a.historyId}>
                    <td style={{ textAlign: 'center' }}>{a.folderName}</td>
                    <td style={{ textAlign: 'center' }}>{fmtDt(a.occurTime)}</td>
                    <td style={{ textAlign: 'center' }}>{a.clearTime ? fmtDt(a.clearTime) : <span style={{ color: 'var(--mes-danger)' }}>활성</span>}</td>
                    <td>{a.tagName}</td>
                    <td>{a.alarmMsg}</td>
                    <td style={{ textAlign: 'center' }}><span className={`mes-badge ${levelBadge(a.level)}`}>Lv{a.level}</span></td>
                    <td style={{ textAlign: 'center' }}>{a.valueAtOccur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mes-scroll-status">
            {filteredHistRows.length === 0
              ? '0건'
              : `${Math.min(histVisibleCount, filteredHistRows.length)} / 총 ${filteredHistRows.length}건 표시 중`}
            {histVisibleCount < filteredHistRows.length && ' · 스크롤하여 더 보기'}
          </div>
        </div>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
