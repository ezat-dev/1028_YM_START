import { useState } from 'react';
import { IconBellRinging, IconAlertTriangleFilled, IconClockHour4, IconChevronRight } from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';

/*
 * 조건관리 > 열전대/센서 관리 — 차기교체일자 알림.
 * 페이지에 들어올 때, 차기교체일자가 ALERT_DAYS일 이내로 다가왔거나 이미 지난 항목이 있으면 띄운다.
 * '오늘 하루 보지 않기'는 이 브라우저에만 저장(localStorage) — 저장이 막힌 환경이면 그냥 매번 뜬다.
 */

export const ALERT_DAYS = 7;
const HIDE_KEY = 'mes.sensorDueAlert.hideDate';

const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function isHiddenToday() {
  try {
    return localStorage.getItem(HIDE_KEY) === todayStr();
  } catch {
    return false;
  }
}

function hideToday() {
  try {
    localStorage.setItem(HIDE_KEY, todayStr());
  } catch {
    // 저장이 막혀 있으면 무시
  }
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * 설비·존·구분마다 가장 최근 연도 행만 보고, 차기교체일자가 ALERT_DAYS일 이내이거나 지난 것만 고른다.
 * (지난 연도 행은 올해 행이 있으면 이미 교체된 것이라 빼야 한다)
 */
export function pickDue(rows) {
  const latest = new Map();
  rows.forEach((r) => {
    const key = `${r.equipName}|${r.zoneName}|${r.sensorType}`;
    const cur = latest.get(key);
    if (!cur || r.year > cur.year) latest.set(key, r);
  });
  return [...latest.values()]
    .map((r) => ({ ...r, dday: daysUntil(r.nextChangeDate) }))
    .filter((r) => r.dday != null && r.dday <= ALERT_DAYS)
    .sort((a, b) => a.dday - b.dday || a.equipName.localeCompare(b.equipName));
}

function DBadge({ d }) {
  const text = d === 0 ? 'D-DAY' : d < 0 ? `D+${-d}` : `D-${d}`;
  return <span className={`sda-dday ${d < 0 ? 'is-over' : 'is-soon'}`}>{text}</span>;
}

function DueItem({ row, canEdit, onPick }) {
  const body = (
    <>
      <DBadge d={row.dday} />
      <span className="sda-item-main">
        <strong>{row.equipName}</strong>
        <span className="sda-item-sub">
          <i className={`sen-type-dot ${row.sensorType === '센서' ? 'sensor' : 'thermocouple'}`} />
          {row.sensorType} · {row.zoneName}
        </span>
      </span>
      <span className="sda-item-date">
        <small>차기 교체</small>
        {row.nextChangeDate}
      </span>
      {canEdit && <IconChevronRight size={16} className="sda-item-go" aria-hidden="true" />}
    </>
  );
  return (
    <li>
      {canEdit ? (
        <button type="button" className="sda-item" onClick={() => onPick(row)} title="눌러서 교체일자 등록">{body}</button>
      ) : (
        <div className="sda-item">{body}</div>
      )}
    </li>
  );
}

export default function SensorDueAlert({ items, canEdit, onPick, onClose }) {
  const [hide, setHide] = useState(false);
  const over = items.filter((r) => r.dday < 0);
  const soon = items.filter((r) => r.dday >= 0);

  const close = () => {
    if (hide) hideToday();
    onClose();
  };

  return (
    <Modal title="교체 시기 알림" onClose={close} className="sda-modal">
      <div className="sda">
        <div className="sda-hero">
          <span className="sda-hero-icon" aria-hidden="true"><IconBellRinging size={22} /></span>
          <div>
            <p className="sda-hero-title">교체가 필요한 열전대·센서가 <b>{items.length}건</b> 있습니다</p>
            <p className="sda-hero-desc">차기교체일자가 {ALERT_DAYS}일 이내로 다가왔거나 이미 지난 항목입니다.{canEdit && ' 항목을 누르면 교체일자를 등록할 수 있습니다.'}</p>
          </div>
        </div>

        <div className="sda-sum">
          <span className="is-over"><IconAlertTriangleFilled size={13} />교체일 지남 <b>{over.length}</b></span>
          <span className="is-soon"><IconClockHour4 size={13} />{ALERT_DAYS}일 이내 <b>{soon.length}</b></span>
        </div>

        <div className="sda-lists">
          {over.length > 0 && (
            <section>
              <h4 className="is-over">교체일 지남</h4>
              <ul>{over.map((r) => <DueItem key={r.id} row={r} canEdit={canEdit} onPick={onPick} />)}</ul>
            </section>
          )}
          {soon.length > 0 && (
            <section>
              <h4 className="is-soon">{ALERT_DAYS}일 이내 교체 예정</h4>
              <ul>{soon.map((r) => <DueItem key={r.id} row={r} canEdit={canEdit} onPick={onPick} />)}</ul>
            </section>
          )}
        </div>
      </div>

      <div className="mes-modal-footer sda-footer">
        <label className="sda-hide">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
          오늘 하루 보지 않기
        </label>
        <button type="button" className="mes-btn mes-btn-primary" onClick={close}>확인</button>
      </div>
    </Modal>
  );
}
