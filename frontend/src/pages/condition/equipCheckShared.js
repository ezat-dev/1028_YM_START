// 설비점검표 — 화면·엑셀이 같이 쓰는 계산

export const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const parse = (json, fallback) => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

export const legendOf = (sheet) => parse(sheet?.legendJson, [{ mark: '○', label: '양호' }]);
export const cyclesOf = (sheet) => parse(sheet?.cycleJson, [{ code: 'D', label: '매일' }]);
export const signsOf = (sheet) => parse(sheet?.signJson, ['담당', '검토', '확인']);

export const pad2 = (n) => String(n).padStart(2, '0');
export const ymOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
export const daysIn = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const dowOf = (ym, day) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, day).getDay();
};
export const addMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
};
export const ymLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${y}년 ${m}월`;
};

/** 관리책임자 확인란 — 1~7, 8~14, 15~21, 22~28, 29~말일 */
export const weeksOf = (ym) => {
  const last = daysIn(ym);
  const w = [];
  for (let s = 1, no = 1; s <= last; s += 7, no += 1) w.push({ no, from: s, to: Math.min(s + 6, last) });
  return w;
};

/** 도장에 넣을 이름(3자까지) */
export const stampName = (name) => (name ?? '').replace(/\s+/g, '').slice(0, 3);

/** 결과 → { 'itemId-day': result } */
export const indexResults = (results) => {
  const m = new Map();
  (results ?? []).forEach((r) => m.set(`${r.itemId}-${r.day}`, r));
  return m;
};

/** 날짜별 점검자 — 그날 마지막으로 기록한 사람(여러 명이면 같이) */
export const inspectorsByDay = (results) => {
  const m = new Map();
  [...(results ?? [])]
    .sort((a, b) => String(a.checkedDt).localeCompare(String(b.checkedDt)))
    .forEach((r) => {
      if (!r.userName) return;
      const list = m.get(r.day) ?? [];
      const i = list.indexOf(r.userName);
      if (i >= 0) list.splice(i, 1);
      list.push(r.userName);
      m.set(r.day, list);
    });
  return m; // day → [이름…] (마지막이 가장 최근)
};

export const fmtMd = (dt) => {
  if (!dt) return '';
  const s = String(dt);
  return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
};
export const fmtHm = (dt) => (dt ? String(dt).slice(11, 16) : '');

// ── 수치 기록 · 범위 ──
/** 기록이 수치인지(범례 기호가 아니라) */
export const isNumMark = (m) => /^\d+(\.\d+)?$/.test(String(m ?? ''));
/** 입력 형식 — 숫자 최대 3자리(소수점 포함 가능): 180, 12.5, 0.85 */
export const NUM_OK = /^(\d{1,3}|\d{1,2}\.\d|\d\.\d{1,2})$/;
/** 입력 중 걸러내기 — 숫자와 점 하나, 숫자는 3개까지 */
export const cleanNum = (v) => {
  let out = '';
  let digits = 0;
  let dot = false;
  for (const ch of String(v)) {
    if (ch >= '0' && ch <= '9') {
      if (digits >= 3) continue;
      digits += 1;
      out += ch;
    } else if ((ch === '.' || ch === ',') && !dot && out.length) {
      dot = true;
      out += '.';
    }
  }
  return out;
};
const numStr = (v) => String(Number(v));
/** 항목 범위 글자 — 170~190 / 170 이상 / 190 이하 / '' */
export const rangeText = (it) => {
  const lo = it?.rangeMin;
  const hi = it?.rangeMax;
  if (lo != null && hi != null) return `${numStr(lo)}~${numStr(hi)}`;
  if (lo != null) return `${numStr(lo)} 이상`;
  if (hi != null) return `${numStr(hi)} 이하`;
  return '';
};
/** 수치 기록이 범위 밖인지 */
export const isOutOfRange = (it, m) => {
  if (!isNumMark(m)) return false;
  const v = Number(m);
  return (it?.rangeMin != null && v < Number(it.rangeMin)) || (it?.rangeMax != null && v > Number(it.rangeMax));
};
/** 칸 상태 — good(양호) · issue(양호 아닌 기호) · num(범위 안 수치) · out(범위 밖 수치) */
export const markState = (it, m, good) => {
  if (m == null || m === '') return '';
  if (isNumMark(m)) return isOutOfRange(it, m) ? 'out' : 'num';
  return m === good ? 'good' : 'issue';
};
