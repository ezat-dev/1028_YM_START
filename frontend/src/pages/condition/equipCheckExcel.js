import ExcelJS from 'exceljs';
import {
  legendOf, cyclesOf, signsOf, daysIn, ymLabel, weeksOf, indexResults, inspectorsByDay, fmtMd, markState, rangeText,
} from './equipCheckShared';

/*
 * 설비점검표 엑셀 — 현장 종이 양식 그대로(A4 가로 한 장).
 *  열: A 점검개소 · B 점검항목 · C 주기 · D~AH 1~31일 · AI~AK 정기 점검
 *  행: 1~4 범례/주기 범례/제목/결재 · 5 설비명·모델 NO·점검 년월·점검자 · 6 머리글 · 항목(빈 줄 포함 12줄)
 *      · 점검자 · 관리책임자 확인란 · 특기사항 · 안내 문구
 */
const FONT = '맑은 고딕';
const MIN_ROWS = 12;
const DAY0 = 4; // D열 = 1일
const NOTE_FROM = DAY0 + 31; // AI
const LAST_COL = NOTE_FROM + 2; // AK
const GRAY = 'FFBFBFBF';
const HEAD_BG = 'FFF2F2F2';
const RED = 'FFC0392B';

const COL_W = [13, 19, 5, ...Array.from({ length: 31 }, () => 3.6), 6, 6, 6];
const colPx = (c) => Math.round(COL_W[c - 1] * 7 + 5); // 엑셀 열 너비(글자) → 화면 px(대략)

/** PNG data URL에서 가로·세로 크기 읽기(IHDR) */
const pngSize = (dataUrl) => {
  try {
    const i = dataUrl.indexOf(',') + 1;
    const bin = atob(dataUrl.slice(i, i + 44));
    const n = (o) => ((bin.charCodeAt(o) << 24) | (bin.charCodeAt(o + 1) << 16) | (bin.charCodeAt(o + 2) << 8) | bin.charCodeAt(o + 3)) >>> 0;
    return { w: n(16) || 360, h: n(20) || 140 };
  } catch {
    return { w: 360, h: 140 };
  }
};

const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
const medium = { style: 'medium', color: { argb: 'FF404040' } };

/** 워크북 만들기(다운로드와 분리 — 확인용으로 Node에서도 부른다) */
export function buildSheetWorkbook(board, ym) {
  const { sheet, items, month } = board;
  const legend = legendOf(sheet);
  const cycles = cyclesOf(sheet);
  const signs = signsOf(sheet);
  const good = legend[0]?.mark;
  const lastDay = daysIn(ym);
  const res = indexResults(board.results);
  const inspectors = inspectorsByDay(board.results);
  const notes = new Map((board.notes ?? []).map((n) => [n.itemId, n.note]));
  const confirms = new Map((board.confirms ?? []).map((c) => [c.weekNo, c]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SMART MES';
  const ws = wb.addWorksheet(ymLabel(ym), {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });

  ws.columns = COL_W.map((width) => ({ width }));

  const cell = (r, c) => ws.getCell(r, c);
  const put = (r1, c1, r2, c2, value, style = {}) => {
    if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
    const x = cell(r1, c1);
    x.value = value;
    x.font = { name: FONT, size: 10, ...style.font };
    x.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, ...style.alignment };
    if (style.fill) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
    return x;
  };
  const box = (r1, c1, r2, c2, edge = thin) => {
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) {
        cell(r, c).border = {
          top: r === r1 ? edge : thin, bottom: r === r2 ? edge : thin,
          left: c === c1 ? edge : thin, right: c === c2 ? edge : thin,
        };
      }
    }
  };
  const shade = (r, c, argb) => {
    cell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  };
  const rowPx = (r) => Math.round((ws.getRow(r).height || 15) * 4 / 3);
  /** 서명 이미지를 (r1~r2, c1~c2) 칸 안에 비율 유지해서 가운데(위쪽 여백 top px)에 놓는다 */
  const putImage = (dataUrl, r1, c1, r2, c2, maxW, maxH, top) => {
    const { w, h } = pngSize(dataUrl);
    const k = Math.min(maxW / w, maxH / h, 1);
    const iw = Math.round(w * k);
    const ih = Math.round(h * k);
    let boxW = 0;
    for (let c = c1; c <= c2; c += 1) boxW += colPx(c);
    let boxH = 0;
    for (let r = r1; r <= r2; r += 1) boxH += rowPx(r);
    // px 위치 → (0부터 세는) 열·행 위치(소수)
    let x = Math.max(0, (boxW - iw) / 2);
    let col = c1 - 1;
    while (x > colPx(col + 1) && col < c2 - 1) { x -= colPx(col + 1); col += 1; }
    let y = top ?? Math.max(0, (boxH - ih) / 2);
    let row = r1 - 1;
    while (y > rowPx(row + 1) && row < r2 - 1) { y -= rowPx(row + 1); row += 1; }
    const id = wb.addImage({ base64: dataUrl, extension: 'png' });
    ws.addImage(id, {
      tl: { col: col + x / colPx(col + 1), row: row + y / rowPx(row + 1) },
      ext: { width: iw, height: ih },
      editAs: 'oneCell',
    });
  };

  // ── 1~4행: 범례 · 주기 범례 · 제목 · 결재 ──
  [24, 24, 24, 24].forEach((h, i) => { ws.getRow(i + 1).height = h; });
  put(1, 1, 4, 1, '범\n\n례', { font: { size: 10 } });
  const legendLines = [];
  for (let i = 0; i < legend.length; i += 2) {
    legendLines.push(legend.slice(i, i + 2).map((l) => `${l.mark} : ${l.label}`).join('      '));
  }
  put(1, 2, 4, 3, legendLines.join('\n\n'), { font: { size: 11 } });
  put(1, DAY0, 4, DAY0 + 1, '주\n기\n\n범\n례', { font: { size: 9 } });
  put(1, DAY0 + 2, 4, DAY0 + 8, cycles.map((c) => `${c.code} : ${c.label}`).join('\n\n'), { font: { size: 11 } });
  put(1, DAY0 + 9, 4, DAY0 + 24, sheet.title || '설비점검표', { font: { size: 26, bold: true } });

  // 결재 3칸: AC~AE · AF~AH · AI~AK(정기 점검 열 위)
  const signCols = [[DAY0 + 25, DAY0 + 27], [DAY0 + 28, DAY0 + 30], [NOTE_FROM, LAST_COL]];
  signCols.forEach(([c1, c2], i) => {
    put(1, c1, 1, c2, signs[i] ?? '', { font: { size: 10 }, fill: HEAD_BG });
    const name = month?.[`sign${i + 1}Name`];
    const dt = month?.[`sign${i + 1}Dt`];
    const img = month?.[`sign${i + 1}Img`];
    if (img) {
      // 서명 이미지 + 아래에 날짜
      put(2, c1, 4, c2, fmtMd(dt), { font: { size: 9, color: { argb: 'FF7F7F7F' } }, alignment: { vertical: 'bottom' } });
      let boxW = 0;
      for (let c = c1; c <= c2; c += 1) boxW += colPx(c);
      putImage(img, 2, c1, 4, c2, boxW - 10, 62, 6);
    } else {
      put(2, c1, 4, c2, name ? `${name}\n${fmtMd(dt)}` : '', { font: { size: 11, bold: true, color: { argb: 'FF000000' } } });
    }
    box(1, c1, 1, c2);
    box(2, c1, 4, c2);
  });
  box(1, 1, 4, 1);
  box(1, 2, 4, 3);
  box(1, DAY0, 4, DAY0 + 1);
  box(1, DAY0 + 2, 4, DAY0 + 8);
  box(1, DAY0 + 9, 4, DAY0 + 24);

  // ── 5행: 설비명 · 모델 NO · 점검 년월 · 점검자 ──
  const R_INFO = 5;
  ws.getRow(R_INFO).height = 24;
  const info = [
    [1, 1, '설비명', true], [2, 3, sheet.equipName ?? '', false],
    [DAY0, DAY0 + 4, '모델 NO', true], [DAY0 + 5, DAY0 + 10, sheet.modelNo ?? '', false],
    [DAY0 + 11, DAY0 + 15, '점검 년월', true], [DAY0 + 16, DAY0 + 21, ymLabel(ym), false],
    [DAY0 + 22, DAY0 + 25, '점검자', true], [DAY0 + 26, LAST_COL, month?.inspectorName ?? '', false],
  ];
  info.forEach(([c1, c2, v, isLabel]) => {
    put(R_INFO, c1, R_INFO, c2, v, { font: { size: 11, bold: !isLabel && c1 === 2 }, fill: isLabel ? HEAD_BG : undefined });
    box(R_INFO, c1, R_INFO, c2);
  });

  // ── 6행: 머리글 ──
  const R_HEAD = 6;
  ws.getRow(R_HEAD).height = 22;
  put(R_HEAD, 1, R_HEAD, 1, '점검개소', { fill: HEAD_BG });
  put(R_HEAD, 2, R_HEAD, 2, '점검항목', { fill: HEAD_BG });
  put(R_HEAD, 3, R_HEAD, 3, '주기', { fill: HEAD_BG });
  for (let d = 1; d <= 31; d += 1) put(R_HEAD, DAY0 + d - 1, R_HEAD, DAY0 + d - 1, d, { fill: HEAD_BG, font: { size: 9 } });
  put(R_HEAD, NOTE_FROM, R_HEAD, LAST_COL, '정기 점검', { fill: HEAD_BG });
  box(R_HEAD, 1, R_HEAD, LAST_COL);

  // ── 항목 ──
  const rows = Math.max(MIN_ROWS, items.length);
  const R_ITEM = R_HEAD + 1;
  for (let i = 0; i < rows; i += 1) {
    const r = R_ITEM + i;
    const it = items[i];
    ws.getRow(r).height = 22;
    put(r, 1, r, 1, it?.location ?? '', { font: { size: 10 } });
    put(r, 2, r, 2, it ? `${it.itemName ?? ''}${rangeText(it) ? ` (${rangeText(it)})` : ''}` : '', { font: { size: 10 } });
    put(r, 3, r, 3, it?.cycle ?? '', { font: { size: 10 } });
    for (let d = 1; d <= 31; d += 1) {
      const c = DAY0 + d - 1;
      const x = res.get(`${it?.itemId}-${d}`);
      // 수치는 범위 밖일 때만 빨간색(작은 글씨), 기호는 양호가 아니면 빨간색
      const st = x ? markState(it, x.mark, good) : '';
      const bad = st === 'issue' || st === 'out';
      const num = st === 'num' || st === 'out';
      put(r, c, r, c, num ? Number(x.mark) : (x?.mark ?? ''), { font: { size: num ? 9 : 13, color: { argb: bad ? RED : 'FF1F3F7A' }, bold: bad }, alignment: num ? { shrinkToFit: true, wrapText: false } : undefined });
      if (!it || d > lastDay) shade(r, c, GRAY);
    }
    put(r, NOTE_FROM, r, LAST_COL, it ? (notes.get(it.itemId) ?? '') : '', { font: { size: 9 } });
  }
  box(R_ITEM, 1, R_ITEM + rows - 1, LAST_COL);

  // ── 점검자 ──
  const R_WHO = R_ITEM + rows;
  ws.getRow(R_WHO).height = 26;
  put(R_WHO, 1, R_WHO, 3, '점검자');
  for (let d = 1; d <= 31; d += 1) {
    const c = DAY0 + d - 1;
    const names = inspectors.get(d);
    put(R_WHO, c, R_WHO, c, names?.length ? names[names.length - 1] : '', { font: { size: 8 }, alignment: { shrinkToFit: true, wrapText: false } });
    if (d > lastDay) shade(R_WHO, c, GRAY);
  }
  put(R_WHO, NOTE_FROM, R_WHO, LAST_COL, '');
  box(R_WHO, 1, R_WHO, LAST_COL);

  // ── 관리책임자 확인란 (주마다) ──
  const R_CF = R_WHO + 1;
  ws.getRow(R_CF).height = 30;
  put(R_CF, 1, R_CF, 3, '관리책임자 확인란');
  weeksOf(ym).forEach((w) => {
    const cf = confirms.get(w.no);
    const c1 = DAY0 + w.from - 1;
    const c2 = DAY0 + w.to - 1;
    if (cf?.signImg) {
      put(R_CF, c1, R_CF, c2, fmtMd(cf.confirmDt), { font: { size: 8, color: { argb: 'FF7F7F7F' } }, alignment: { horizontal: 'right', vertical: 'bottom' } });
      putImage(cf.signImg, R_CF, c1, R_CF, c2, 120, 34);
    } else {
      put(R_CF, c1, R_CF, c2, cf ? `${cf.userName}  ${fmtMd(cf.confirmDt)}` : '',
        { font: { size: 10, bold: true, color: { argb: 'FF000000' } } });
    }
  });
  if (lastDay < 31) {
    put(R_CF, DAY0 + lastDay, R_CF, DAY0 + 30, '');
    for (let c = DAY0 + lastDay; c <= DAY0 + 30; c += 1) shade(R_CF, c, GRAY);
  }
  put(R_CF, NOTE_FROM, R_CF, LAST_COL, '');
  box(R_CF, 1, R_CF, LAST_COL);

  // ── 특기사항 · 안내 문구 ──
  const R_RM = R_CF + 1;
  ws.getRow(R_RM).height = 90;
  put(R_RM, 1, R_RM, LAST_COL, `특기사항\n${month?.remark ?? ''}`, { font: { size: 10 }, alignment: { horizontal: 'left', vertical: 'top' } });
  box(R_RM, 1, R_RM, LAST_COL);
  const R_FT = R_RM + 1;
  ws.getRow(R_FT).height = 22;
  put(R_FT, 1, R_FT, LAST_COL, sheet.footerNote ? `☞ ${sheet.footerNote}` : '', { font: { size: 10 }, alignment: { horizontal: 'left' } });
  box(R_FT, 1, R_FT, LAST_COL);

  // 바깥 테두리 굵게
  for (let r = 1; r <= R_FT; r += 1) {
    const a = cell(r, 1);
    a.border = { ...a.border, left: medium };
    const z = cell(r, LAST_COL);
    z.border = { ...z.border, right: medium };
  }
  for (let c = 1; c <= LAST_COL; c += 1) {
    const t = cell(1, c);
    t.border = { ...t.border, top: medium };
    const b = cell(R_FT, c);
    b.border = { ...b.border, bottom: medium };
  }
  ws.pageSetup.printArea = `A1:${ws.getColumn(LAST_COL).letter}${R_FT}`;
  return wb;
}

export async function downloadSheetExcel(board, ym) {
  const { sheet } = board;
  const buf = await buildSheetWorkbook(board, ym).xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `설비점검표_${(sheet.equipName || '').replace(/[\\/:*?"<>|]/g, '_')}_${ym}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
