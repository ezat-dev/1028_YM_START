import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconArrowRight } from '@tabler/icons-react';
import { getHistory } from '../../../api/monitoring/alarmApi';

/*
 * 통합모니터링 > 호기별 최근 알람 발생이력 — 경보모니터링 실데이터(ez_scada).
 * 알람 폴더 이름이 호기 코드(MBF1~6)라 그 폴더 것만 골라 최근 순으로 8건. 30초마다 다시 읽는다.
 * ez_scada는 무거운 SQL에 약해서 단순 조회(최근 N건)만 쓰고 고르기는 화면에서 한다.
 */

const FETCH_LIMIT = 500;
const SHOW = 8; // 화면에는 최근 8건까지
const REFRESH_MS = 30000;
const pad = (n) => String(n).padStart(2, '0');
const fmt = (s) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const dur = (a, b) => {
  const sec = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000));
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
  return `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분`;
};

export default function AlarmRecent({ code }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => getHistory(FETCH_LIMIT)
      .then((res) => { if (alive) { setRows((res.data ?? []).filter((r) => r.folderName === code)); setError(false); } })
      .catch(() => { if (alive) setError(true); });
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [code]);

  const active = useMemo(() => (rows ?? []).filter((r) => !r.clearTime).length, [rows]);
  const list = (rows ?? []).slice(0, SHOW);

  return (
    <div className="mba">
      <div className="mba-head">
        <b>최근 알람</b>
        <span className={`mba-active${active ? ' is-on' : ''}`}>{active ? `진행 중 ${active}` : '진행 중 없음'}</span>
        <Link to="/monitoring/alarm" className="mba-more">경보모니터링 <IconArrowRight size={13} /></Link>
      </div>
      <div className="mba-list" role="list">
        {error && <div className="mba-empty">알람 이력을 불러오지 못했습니다.</div>}
        {!error && rows == null && <div className="mba-empty">불러오는 중…</div>}
        {!error && rows != null && !list.length && <div className="mba-empty">최근 발생한 알람이 없습니다.</div>}
        {list.map((r) => {
          const on = !r.clearTime;
          return (
            <div key={r.historyId} role="listitem" className={`mba-row${on ? ' is-on' : ''}`} title={`${r.tagName ?? ''} ${r.address ?? ''}`.trim()}>
              <i className="mba-dot" aria-hidden="true" />
              <span className="mba-time">{fmt(r.occurTime)}</span>
              <span className="mba-msg">{r.alarmMsg || r.tagName}</span>
              <span className="mba-state">{on ? '진행 중' : `${dur(r.occurTime, r.clearTime)} 후 해제`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
