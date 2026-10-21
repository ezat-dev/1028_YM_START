import { useEffect, useMemo, useState } from 'react';
import { IconLock, IconSearch, IconUser, IconWorld, IconArrowRight } from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';
import { getAudit } from '../../api/production/checkSheetApi';
import { equipLabel } from '../quality/capability';

/*
 * CHECK SHEET 기록 — 관리자가 한 화면에서 본다.
 *  1) 결재 현황: 시트(호기 × 일자)마다 8칸 서명 — 누가 언제
 *  2) 사람별: 누가 몇 건 추가·입력·수정·삭제·서명했는지, 마지막 작업, 접속 IP
 *  3) 바뀐 내용: 같은 사람이 같은 통을 연달아 고친 것은 한 줄로 묶어 전 → 후만 보여준다(로그처럼 칸마다 쪼개지 않게)
 */

const SLOTS = ['담당', '검토', '승인', '확인', '설비관리', '품질관리', '품질보증', '생산관리'];
const MERGE_MIN = 10; // 같은 사람 · 같은 통을 이 시간 안에 다시 고치면 한 줄로
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const toDate = (s) => new Date(String(s).replace(' ', 'T'));
const hm = (s) => { const d = toDate(s); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const md = (s) => { const d = toDate(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const DOW = '일월화수목금토';
const dayLabel = (s) => { const d = new Date(`${s}T00:00:00`); return `${d.getMonth() + 1}/${d.getDate()} (${DOW[d.getDay()]})`; };
const parse = (json) => { try { return JSON.parse(json || '[]'); } catch { return []; } };
const whoKey = (l) => l.userId || l.userName || '-';

function kindOf(changes) {
  if (changes.every((c) => !c.b)) return '입력';
  if (changes.every((c) => !c.a)) return '삭제';
  return '수정';
}

/** 같은 사람이 같은 통(행 정보 + 경도)을 짧은 시간에 여러 번 고친 것을 한 줄로 */
function mergeLogs(logs) {
  const asc = [...logs].sort((a, b) => toDate(a.regDt) - toDate(b.regDt) || a.auditId - b.auditId);
  const out = [];
  const open = new Map();
  asc.forEach((l) => {
    const changes = parse(l.changes);
    const editable = l.rowId && (l.target === '통' || l.target === '경도') && !['추가', '삭제'].includes(l.action);
    const key = editable ? `${whoKey(l)}|${l.rowId}` : null;
    const g = key && open.get(key);
    if (g && (toDate(l.regDt) - toDate(g.lastDt)) / 60000 <= MERGE_MIN) {
      changes.forEach((c) => {
        const cur = g.changes.find((x) => x.f === c.f);
        if (cur) cur.a = c.a;
        else g.changes.push({ ...c });
      });
      g.lastDt = l.regDt;
      g.count += 1;
      g.rowNo = l.rowNo;
      g.partNo = l.partNo || g.partNo;
      if (l.clientIp) g.ips.add(l.clientIp);
      return;
    }
    const e = {
      ...l,
      target: editable ? '통' : l.target,
      changes: changes.map((c) => ({ ...c })),
      firstDt: l.regDt,
      lastDt: l.regDt,
      count: 1,
      ips: new Set(l.clientIp ? [l.clientIp] : []),
    };
    out.push(e);
    if (key) open.set(key, e);
  });
  return out
    .map((e) => {
      if (e.count === 1 || !['입력', '수정', '삭제'].includes(e.action)) return e;
      const changes = e.changes.filter((c) => (c.b ?? '') !== (c.a ?? ''));
      return { ...e, changes, action: changes.length ? kindOf(changes) : e.action };
    })
    .filter((e) => e.changes.length || ['추가', '서명', '서명취소'].includes(e.action))
    .sort((a, b) => toDate(b.lastDt) - toDate(a.lastDt));
}

export default function CheckSheetAudit({ date, equipCode, equips, onClose, onOpenSheet }) {
  const [range, setRange] = useState('day'); // day | week
  const [scope, setScope] = useState('all'); // all | one
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [person, setPerson] = useState(null);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');

  const from = range === 'week' ? addDays(date, -6) : date;
  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    getAudit({ from, to: date, equipCode: scope === 'one' ? equipCode : undefined })
      .then((r) => { if (alive) setData(r.data); })
      .catch((err) => { if (alive) setError(err?.response?.data?.message ?? '기록을 불러오지 못했습니다.'); });
    return () => { alive = false; };
  }, [from, date, scope, equipCode]);

  const nameOf = useMemo(() => new Map((equips ?? []).map((e) => [e.equipCode, e.equipName])), [equips]);
  const entries = useMemo(() => mergeLogs(data?.logs ?? []), [data]);

  // 결재 칸마다 서명한 IP(가장 최근 서명 기록)
  const signIp = useMemo(() => {
    const m = new Map();
    (data?.logs ?? []).forEach((l) => {
      if (l.target !== '서명' || l.action !== '서명') return;
      const slot = parse(l.changes)[0]?.f;
      const k = `${l.sheetId}|${slot}`;
      if (!m.has(k)) m.set(k, l.clientIp); // 최신순으로 오므로 처음 것이 최근
    });
    return m;
  }, [data]);
  const signsBySheet = useMemo(() => {
    const m = new Map();
    (data?.signs ?? []).forEach((g) => {
      if (!m.has(g.sheetId)) m.set(g.sheetId, new Map());
      m.get(g.sheetId).set(g.slot, g);
    });
    return m;
  }, [data]);

  // 사람별
  const people = useMemo(() => {
    const m = new Map();
    entries.forEach((e) => {
      const k = whoKey(e);
      if (!m.has(k)) m.set(k, { key: k, name: e.userName || e.userId || '(알 수 없음)', id: e.userId, counts: {}, last: e.lastDt, ips: new Set(), total: 0 });
      const p = m.get(k);
      const a = e.action === '서명취소' ? '서명' : e.action;
      p.counts[a] = (p.counts[a] ?? 0) + 1;
      p.total += 1;
      if (toDate(e.lastDt) > toDate(p.last)) p.last = e.lastDt;
      e.ips.forEach((ip) => p.ips.add(ip));
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [entries]);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (person && whoKey(e) !== person) return false;
      if (kind && !(kind === '서명' ? e.action.startsWith('서명') : e.action === kind)) return false;
      if (!kw) return true;
      const hay = [e.partNo, e.userName, e.userId, ...e.changes.flatMap((c) => [c.f, c.b, c.a])].join(' ').toLowerCase();
      return hay.includes(kw);
    });
  }, [entries, person, kind, q]);
  const kindCount = (k) => entries.filter((e) => (k === '서명' ? e.action.startsWith('서명') : e.action === k)).length;

  const sheets = data?.sheets ?? [];
  const eqText = (code) => equipLabel(code, nameOf.get(code));

  return (
    <Modal title="CHECK SHEET 기록" onClose={onClose} xl className="cs-audit-modal">
      <div className="cs-audit">
        <div className="cs-audit-bar">
          <div className="cs-seg" role="group" aria-label="기간">
            <button type="button" className={range === 'day' ? 'is-on' : ''} onClick={() => setRange('day')}>{dayLabel(date)}</button>
            <button type="button" className={range === 'week' ? 'is-on' : ''} onClick={() => setRange('week')}>최근 7일</button>
          </div>
          <div className="cs-seg" role="group" aria-label="호기">
            <button type="button" className={scope === 'all' ? 'is-on' : ''} onClick={() => setScope('all')}>전체 호기</button>
            <button type="button" className={scope === 'one' ? 'is-on' : ''} onClick={() => setScope('one')}>{eqText(equipCode)}만</button>
          </div>
          <span className="cs-audit-range">{data ? (data.from === data.to ? data.from : `${data.from} ~ ${data.to}`) : ''}</span>
          <label className="cs-audit-search">
            <IconSearch size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Part No · 사람 · 값" aria-label="기록 검색" />
          </label>
        </div>

        {error && <div className="mes-error">{error}</div>}
        {!data && !error && <div className="cs-audit-empty">불러오는 중…</div>}

        {data && (
          <>
            {/* 1. 결재 현황 */}
            <section className="cs-audit-sec">
              <h4>결재 현황 <small>시트 {sheets.length}장 · 이름 위에 마우스를 올리면 서명 시각·IP</small></h4>
              {sheets.length ? (
                <div className="cs-audit-scroll">
                  <table className="cs-audit-sign">
                    <thead>
                      <tr>
                        <th>생산일자</th>
                        <th>호기</th>
                        <th>통</th>
                        {SLOTS.map((s) => <th key={s} className={s === '승인' ? 'is-lock' : ''}>{s}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sheets.map((sh) => {
                        const sg = signsBySheet.get(sh.sheetId) ?? new Map();
                        const done = SLOTS.slice(0, 4).filter((s) => sg.has(s)).length;
                        return (
                          <tr key={sh.sheetId} className={sg.has('승인') ? 'is-approved' : ''}>
                            <td>
                              <button type="button" className="cs-audit-link" onClick={() => onOpenSheet(sh.equipCode, String(sh.prodDate))} title="이 시트 열기">
                                {dayLabel(String(sh.prodDate))}
                              </button>
                            </td>
                            <td><b>{eqText(sh.equipCode)}</b></td>
                            <td className="is-num">{sh.rowCount}<small>통</small><em className={`cs-audit-prog is-${done}`}>{done}/4</em></td>
                            {SLOTS.map((s) => {
                              const g = sg.get(s);
                              if (!g) return <td key={s} className="cs-audit-nosign">—</td>;
                              const ip = signIp.get(`${sh.sheetId}|${s}`);
                              return (
                                <td key={s} className={`cs-audit-signed${s === '승인' ? ' is-lock' : ''}`}
                                  title={`${g.signName}${g.userId ? ` (${g.userId})` : ''} · ${String(g.signDt).replace('T', ' ').slice(0, 16)}${ip ? ` · IP ${ip}` : ''}${g.hasImg ? ' · 손 서명' : ' · 이름'}`}>
                                  <b>{s === '승인' && <IconLock size={11} />}{g.signName}</b>
                                  <small>{md(g.signDt)} {hm(g.signDt)}</small>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <div className="cs-audit-empty">이 기간에 작성된 시트가 없습니다.</div>}
            </section>

            {/* 2. 사람별 */}
            <section className="cs-audit-sec">
              <h4>사람별 <small>누르면 그 사람 것만</small></h4>
              {people.length ? (
                <div className="cs-audit-people">
                  {people.map((p) => (
                    <button key={p.key} type="button" className={`cs-audit-person${person === p.key ? ' is-on' : ''}`} onClick={() => setPerson((v) => (v === p.key ? null : p.key))}>
                      <span className="cs-audit-person-top">
                        <IconUser size={14} />
                        <b>{p.name}</b>
                        {p.id && <small>{p.id}</small>}
                      </span>
                      <span className="cs-audit-counts">
                        {['추가', '입력', '수정', '삭제', '서명'].filter((k) => p.counts[k]).map((k) => (
                          <span key={k} className={`cs-kind is-${k}`}>{k} {p.counts[k]}</span>
                        ))}
                      </span>
                      <span className="cs-audit-person-foot">
                        <span>마지막 {md(p.last)} {hm(p.last)}</span>
                        {p.ips.size > 0 && <span title={[...p.ips].join(', ')}><IconWorld size={11} /> {[...p.ips][0]}{p.ips.size > 1 ? ` 외 ${p.ips.size - 1}` : ''}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              ) : <div className="cs-audit-empty">이 기간에 입력·수정한 기록이 없습니다.</div>}
            </section>

            {/* 3. 바뀐 내용 */}
            <section className="cs-audit-sec">
              <h4>
                바뀐 내용
                <small>같은 사람이 같은 통을 {MERGE_MIN}분 안에 이어서 고친 것은 한 줄로 묶었습니다</small>
              </h4>
              <div className="cs-audit-kinds" role="group" aria-label="구분">
                <button type="button" className={!kind ? 'is-on' : ''} onClick={() => setKind('')}>전체 <b>{entries.length}</b></button>
                {['추가', '입력', '수정', '삭제', '서명'].map((k) => (
                  <button key={k} type="button" className={`${kind === k ? 'is-on' : ''}`} onClick={() => setKind((v) => (v === k ? '' : k))} disabled={!kindCount(k)}>
                    <i className={`cs-kind-dot is-${k}`} />{k} <b>{kindCount(k)}</b>
                  </button>
                ))}
                {person && <button type="button" className="cs-audit-clear" onClick={() => setPerson(null)}>사람 선택 해제</button>}
              </div>
              {shown.length ? (
                <div className="cs-audit-scroll">
                  <table className="cs-audit-log">
                    <thead>
                      <tr>
                        <th className="c-time">시각</th>
                        <th className="c-where">호기 · 일자</th>
                        <th className="c-target">대상</th>
                        <th className="c-kind">구분</th>
                        <th>바뀐 내용</th>
                        <th className="c-who">작성자 (계정)</th>
                        <th className="c-ip">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((e) => (
                        <tr key={e.auditId} className={`is-${e.action}`}>
                          <td className="c-time">
                            <b>{hm(e.lastDt)}</b>
                            {e.count > 1 && <small>{hm(e.firstDt)}부터 {e.count}번</small>}
                            {range === 'week' && <small>{md(e.lastDt)}</small>}
                          </td>
                          <td className="c-where">
                            <button type="button" className="cs-audit-link" onClick={() => onOpenSheet(e.equipCode, String(e.prodDate))} title="이 시트 열기">
                              <b>{eqText(e.equipCode)}</b> {dayLabel(String(e.prodDate))}
                            </button>
                          </td>
                          <td className="c-target">
                            {e.target === '통'
                              ? <><b>No.{e.rowNo}</b> <span>{e.partNo || ''}</span></>
                              : <b>{e.target === '머리' ? '작업자·QC' : '결재'}</b>}
                          </td>
                          <td className="c-kind"><span className={`cs-kind is-${e.action.startsWith('서명') ? (e.action === '서명' ? '서명' : '삭제') : e.action}`}>{e.action === '서명취소' ? '서명 취소' : e.action}</span></td>
                          <td>
                            <ul className="cs-audit-changes">
                              {e.changes.map((c) => (
                                <li key={c.f}>
                                  <span className="cs-chg-f">{c.f}</span>
                                  {c.b && <span className={`cs-chg-b${c.a ? '' : ' is-gone'}`}>{c.b}</span>}
                                  {c.b && c.a && <IconArrowRight size={12} className="cs-chg-arrow" />}
                                  {c.a && <span className="cs-chg-a">{c.a}</span>}
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="c-who">
                            <b>{e.userName || '-'}</b>
                            {e.userId && <small>{e.userId}</small>}
                          </td>
                          <td className="c-ip">{[...e.ips].join(', ') || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="cs-audit-empty">{entries.length ? '조건에 맞는 기록이 없습니다.' : '이 기간에 바뀐 내용이 없습니다. (기록은 이 기능을 넣은 뒤부터 쌓입니다)'}</div>}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
