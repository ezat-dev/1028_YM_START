import { IconChevronLeft, IconChevronRight, IconPhoto, IconChecks, IconX } from '@tabler/icons-react';
import { photoUrl } from '../../api/condition/equipCheckApi';
import { DOW, dowOf, weeksOf, fmtHm, fmtMd, markState, rangeText, isNumMark } from './equipCheckShared';
import NumEntry from './EquipCheckNum';

/**
 * 오늘 점검 — 태블릿·휴대폰용. 항목마다 큰 버튼으로 기호를 고르고,
 * 아래 고정 버튼으로 빈 항목을 한 번에 '양호'로 채운다.
 */
export default function EquipCheckToday({
  board, legend, cycles, ym, day, setDay, lastDay, isFuture, isToday, resIdx, canWrite, busy, onMark, onFill, onPhoto,
}) {
  const items = board.items.filter((i) => i.useYn === 'Y');
  const good = legend[0];
  const month = Number(ym.slice(5));
  const done = items.filter((it) => resIdx.get(`${it.itemId}-${day}`)).length;
  const empty = items.length - done;
  const future = isFuture(day);
  const week = weeksOf(ym).find((w) => day >= w.from && day <= w.to);

  // 주간·월간 항목은 이번 주/달에 이미 기록했으면 알려 준다
  const periodHint = (it) => {
    if (it.cycle === cycles[0]?.code) return null;
    const range = it.cycle === 'M' ? { from: 1, to: lastDay } : it.cycle === 'W' ? week : null;
    if (!range) return null;
    const hit = board.results
      .filter((r) => r.itemId === it.itemId && r.day >= range.from && r.day <= range.to && r.day !== day)
      .sort((a, b) => b.day - a.day)[0];
    if (!hit) return null;
    return `${it.cycle === 'M' ? '이번 달' : '이번 주'} ${month}/${hit.day}에 ${hit.mark}로 기록함`;
  };

  return (
    <div className="ec-today">
      <div className="mes-card ec-today-head">
        <button type="button" className="ec-day-nav" onClick={() => setDay(Math.max(1, day - 1))} disabled={day <= 1} aria-label="전날">
          <IconChevronLeft size={20} />
        </button>
        <div className="ec-today-date">
          <b>{month}월 {day}일 <span className={dowOf(ym, day) === 0 ? 'is-sun' : dowOf(ym, day) === 6 ? 'is-sat' : ''}>({DOW[dowOf(ym, day)]})</span></b>
          {isToday(day) ? <em>오늘</em> : future ? <em className="is-future">앞으로 올 날</em> : <em className="is-past">지난 날</em>}
        </div>
        <button type="button" className="ec-day-nav" onClick={() => setDay(Math.min(lastDay, day + 1))} disabled={day >= lastDay || isFuture(day + 1)} aria-label="다음날">
          <IconChevronRight size={20} />
        </button>
        <div className="ec-today-progress" aria-label={`${items.length}개 중 ${done}개 기록`}>
          <span><i style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></span>
          <small><b>{done}</b> / {items.length}</small>
        </div>
      </div>

      {!items.length && <div className="mes-card ec-empty">점검 항목이 없습니다. '점검표' 보기에서 '편집'으로 항목을 추가하세요.</div>}

      <div className="ec-cards">
        {items.map((it) => {
          const r = resIdx.get(`${it.itemId}-${day}`);
          const hint = periodHint(it);
          const cyc = cycles.find((c) => c.code === it.cycle);
          return (
            <section key={it.itemId} className={`mes-card ec-card${r ? ` is-${markState(it, r.mark, good?.mark)}` : ''}`}>
              <div className="ec-card-top">
                {it.photoName ? (
                  <button type="button" className="ec-card-thumb" onClick={() => onPhoto(it)} aria-label={`${it.itemName} 사진 크게 보기`}>
                    <img src={photoUrl(it)} alt="" loading="lazy" />
                  </button>
                ) : (
                  <span className="ec-card-thumb is-none" aria-hidden="true"><IconPhoto size={20} /></span>
                )}
                <div className="ec-card-text">
                  {it.location && <span className="ec-card-loc">{it.location}</span>}
                  <b className="ec-card-name">{it.itemName}{rangeText(it) && <span className="ec-range">({rangeText(it)})</span>}</b>
                  <span className="ec-card-meta">
                    <span className="ec-cycle-badge">{it.cycle}{cyc ? ` · ${cyc.label}` : ''}</span>
                    {r
                      ? <span>{isNumMark(r.mark) && <b className="ec-card-val">{r.mark}</b>}{r.userName || '기록됨'} · {fmtHm(r.checkedDt) || fmtMd(r.checkedDt)}</span>
                      : <span className="ec-dim">아직 기록 없음</span>}
                  </span>
                  {hint && <span className="ec-card-hint">{hint}</span>}
                </div>
                {r && canWrite && !future && (
                  <button type="button" className="ec-card-clear" onClick={() => onMark(it, day, null)} aria-label="기록 지우기" title="기록 지우기">
                    <IconX size={16} />
                  </button>
                )}
              </div>
              <div className="ec-card-btns" role="group" aria-label={`${it.itemName} 결과`}>
                {legend.map((l, i) => (
                  <button
                    key={l.mark}
                    type="button"
                    className={`${i === 0 ? 'is-good' : 'is-issue'}${r?.mark === l.mark ? ' is-on' : ''}`}
                    aria-pressed={r?.mark === l.mark}
                    disabled={!canWrite || future}
                    onClick={() => onMark(it, day, l.mark)}
                  >
                    <b>{l.mark}</b>
                    <small>{l.label}</small>
                  </button>
                ))}
              </div>
              <NumEntry item={it} current={isNumMark(r?.mark) ? r.mark : null} disabled={!canWrite || future} onSave={(m) => onMark(it, day, m)} />
            </section>
          );
        })}
      </div>

      {items.length > 0 && (
        <div className="ec-today-bar">
          <button
            type="button"
            className="mes-btn mes-btn-primary"
            disabled={!canWrite || future || busy || empty === 0}
            onClick={() => onFill(day)}
          >
            <IconChecks size={18} />
            {empty === 0 ? '모든 항목을 기록했습니다' : `빈 항목 ${empty}개 모두 ${good?.mark} ${good?.label}`}
          </button>
        </div>
      )}
    </div>
  );
}
