import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconListSearch, IconSearch, IconFileSpreadsheet } from '@tabler/icons-react';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { getEquips, getSessions, getDetail, getExport } from '../../api/quality/fproofApi';
import './FproofPage.css';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function errMsg(err, fallback) {
  return err.response?.data?.message ?? fallback;
}

// 엑셀 시트 이름: 31자 이내, [ ] : * ? / \ 불가, 중복 불가
function safeSheetName(name, used) {
  const base = String(name).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet';
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 28)}_${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

const sessionKey = (s) => `${s.folderId}|${s.startId}`;

export default function FproofListPage() {
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
  const [queried, setQueried] = useState(false);

  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(false);

  const [equips, setEquips] = useState([]);   // 엑셀에서 세션이 없는 설비도 시트를 만들기 위해
  const [exporting, setExporting] = useState(false);

  const { toast, showToast } = useToast();
  const detailReqRef = useRef(0);

  const rangeError = useCallback((f, t) => {
    if (!f || !t) return '조회 기간을 선택하세요.';
    if (t < f) return '종료일이 시작일보다 빠릅니다.';
    return null;
  }, []);

  const loadSessions = useCallback(async (f, t) => {
    const problem = rangeError(f, t);
    if (problem) {
      showToast(problem, 'error');
      return;
    }
    setLoadingSessions(true);
    setSessionsError(false);
    setActive(null);
    setDetail([]);
    setDetailError(false);
    detailReqRef.current += 1;
    try {
      const res = await getSessions(f, t);
      setSessions(res.data ?? []);
      setQueried(true);
    } catch (err) {
      setSessions([]);
      setSessionsError(true);
      showToast(errMsg(err, '세션을 불러오지 못했습니다.'), 'error');
    } finally {
      setLoadingSessions(false);
    }
  }, [rangeError, showToast]);

  // 처음 열면 오늘 날짜로 바로 조회한다.
  useEffect(() => { loadSessions(todayStr(), todayStr()); }, [loadSessions]);

  useEffect(() => {
    getEquips().then((res) => setEquips(res.data ?? [])).catch(() => {});
  }, []);

  const openSession = async (s) => {
    setActive(s);
    setDetail([]);
    setDetailError(false);
    setLoadingDetail(true);
    detailReqRef.current += 1;
    const reqId = detailReqRef.current;
    try {
      const res = await getDetail(s.folderId, s.startTime, s.endTime);
      if (reqId === detailReqRef.current) setDetail(res.data ?? []);
    } catch (err) {
      if (reqId === detailReqRef.current) {
        setDetailError(true);
        showToast(errMsg(err, '알람 상세를 불러오지 못했습니다.'), 'error');
      }
    } finally {
      if (reqId === detailReqRef.current) setLoadingDetail(false);
    }
  };

  // 날짜가 바뀔 때마다 카드 배경을 번갈아 칠한다.
  const coloredSessions = useMemo(() => {
    let idx = 0;
    let lastDay = '';
    return sessions.map((s) => {
      const day = String(s.startTime).slice(0, 10);
      if (day !== lastDay) {
        if (lastDay !== '') idx = (idx + 1) % 2;
        lastDay = day;
      }
      return { s, idx };
    });
  }, [sessions]);

  const handleExport = async () => {
    const problem = rangeError(from, to);
    if (problem) {
      showToast(problem, 'error');
      return;
    }
    setExporting(true);
    try {
      const res = await getExport(from, to);
      const rows = res.data ?? [];

      // 설비별로 묶는다 — 세션이 없는 설비도 시트는 만든다.
      const byEquip = new Map();
      equips.forEach((e) => byEquip.set(e.folderId, { name: e.folderName, rows: [] }));
      rows.forEach((r) => {
        if (!byEquip.has(r.folderId)) byEquip.set(r.folderId, { name: r.folderName, rows: [] });
        byEquip.get(r.folderId).rows.push(r);
      });
      if (byEquip.size === 0) {
        showToast('내보낼 설비가 없습니다.', 'error');
        return;
      }

      const wb = XLSX.utils.book_new();
      const usedNames = new Set();
      byEquip.forEach(({ name, rows: equipRows }) => {
        const sheetRows = [
          [`F/PROOF LIST - ${name}`, '', '', '', '', '', ''],
          [`조회기간: ${from} ~ ${to}`, '', '', '', '', '', ''],
          [],
          ['설비', '세션 시작', '세션 종료', '태그명', '알람 메시지', '발생 시각', '해제 시각'],
        ];
        if (equipRows.length === 0) {
          sheetRows.push([name, '-', '-', '(세션 없음)', '', '', '']);
        } else {
          equipRows.forEach((r) => {
            sheetRows.push([
              name,
              r.startTime,
              r.endTime || '미종료',
              r.tagName || '(알람 없음)',
              r.alarmMsg || '',
              r.occurTime || '',
              r.tagName ? (r.clearTime || '미해제') : '',
            ]);
          });
        }
        const ws = XLSX.utils.aoa_to_sheet(sheetRows);
        ws['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
        ];
        ws['!cols'] = [{ wch: 10 }, { wch: 21 }, { wch: 21 }, { wch: 16 }, { wch: 32 }, { wch: 21 }, { wch: 21 }];
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name, usedNames));
      });

      XLSX.writeFile(wb, `FPROOF_${from}_${to}.xlsx`);
    } catch (err) {
      showToast(errMsg(err, '엑셀 생성에 실패했습니다.'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const renderSessions = () => {
    if (loadingSessions) return <div className="fp-empty">불러오는 중…</div>;
    if (sessionsError) return <div className="fp-empty">로드 실패</div>;
    if (!queried) return <div className="fp-empty">날짜를 선택하고 조회하세요</div>;
    if (sessions.length === 0) return <div className="fp-empty">조회된 세션이 없습니다</div>;
    return coloredSessions.map(({ s, idx }) => {
      const cnt = s.alarmCount ?? 0;
      const isActive = active && sessionKey(active) === sessionKey(s);
      return (
        <div
          key={sessionKey(s)}
          className={`fp-session date-c${idx}${isActive ? ' is-active' : ''}`}
          onClick={() => openSession(s)}
        >
          <div className="fp-session-row1">
            <span className="fp-equip-badge">{s.folderName}</span>
            <span className={`fp-alarm-cnt${cnt > 0 ? '' : ' is-zero'}`}>알람 {cnt}건</span>
          </div>
          <div className="fp-session-row2">
            <span className="fp-time-label">시작</span>
            <span className="fp-time-val">{s.startTime}</span>
            <span className="fp-time-arrow">→</span>
            <span className="fp-time-label">종료</span>
            {s.endTime
              ? <span className="fp-time-val">{s.endTime}</span>
              : <span className="fp-time-open">미종료</span>}
          </div>
        </div>
      );
    });
  };

  const renderDetail = () => {
    if (!active) return <div className="fp-empty">세션을 선택하세요</div>;
    if (loadingDetail) return <div className="fp-empty">불러오는 중…</div>;
    if (detailError) return <div className="fp-empty">로드 실패</div>;
    if (detail.length === 0) return <div className="fp-empty">해당 구간 F/PROOF 알람 없음</div>;
    return (
      <table className="fp-detail-table">
        <thead>
          <tr>
            <th>태그명</th>
            <th>알람 메시지</th>
            <th>발생시각</th>
            <th>해제시각</th>
          </tr>
        </thead>
        <tbody>
          {detail.map((a) => (
            <tr key={a.historyId}>
              <td><span className="fp-tag-name">{a.tagName}</span></td>
              <td><span className="fp-alarm-msg">{a.alarmMsg}</span></td>
              <td><span className="fp-time-cell">{a.occurTime}</span></td>
              <td>
                {a.clearTime
                  ? <span className="fp-time-cell">{a.clearTime}</span>
                  : <span className="fp-no-clear">미해제</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="mes-page mes-page-fill">
      <div className="fp-header-card">
        <div className="fp-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon">
              <IconListSearch size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">F/PROOF LIST</h2>
              <p className="mes-page-desc">Fool Proof 세션별 F/PROOF 알람 이력을 조회합니다.</p>
            </div>
          </div>
          <div className="fp-header-controls">
            <input type="date" className="mes-field-inline" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="fp-range-sep">~</span>
            <input type="date" className="mes-field-inline" value={to} onChange={(e) => setTo(e.target.value)} />
            <button type="button" className="mes-btn mes-btn-secondary" disabled={loadingSessions} onClick={() => loadSessions(from, to)}>
              <IconSearch size={15} /> 조회
            </button>
            <button type="button" className="mes-btn mes-btn-secondary" disabled={exporting} onClick={handleExport}>
              <IconFileSpreadsheet size={15} /> {exporting ? '생성 중...' : '엑셀 출력'}
            </button>
          </div>
        </div>
      </div>

      <div className="fp-panels">
        <div className="fp-panel">
          <div className="fp-panel-hd">
            <span className="fp-panel-title">Fool Proof 세션</span>
            <span className="fp-badge">{sessions.length}건</span>
          </div>
          <div className="fp-list">{renderSessions()}</div>
        </div>

        <div className="fp-mid" aria-hidden="true">
          <span>›</span>
          <span>›</span>
        </div>

        <div className="fp-panel">
          <div className="fp-panel-hd">
            <span className="fp-panel-title">{active ? `${active.folderName} F/PROOF 알람` : '알람 상세'}</span>
            <span className="fp-badge is-alarm">{active && !loadingDetail && !detailError ? detail.length : 0}건</span>
          </div>
          <div className="fp-detail-wrap">{renderDetail()}</div>
        </div>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
