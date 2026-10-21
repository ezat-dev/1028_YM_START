import ExcelJS from 'exceljs';
import { equipLabel } from '../quality/capability';
import { ITEMS, GROUPS } from './CheckSheetPaper';

/*
 * 열처리 CHECK SHEET 엑셀 — 종이 양식처럼(A4 가로, 너비 맞춤, 머리글 반복 인쇄).
 * 통이 많으면 아래로 이어지고, 인쇄할 때 페이지마다 표 머리가 다시 찍힌다.
 */
const FONT = '맑은 고딕';
const HEAD_BG = 'FFF2F2F2';
const RED = 'FFC0392B';
const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
const medium = { style: 'medium', color: { argb: 'FF404040' } };
// No 출로 업체 Part 품명/규격 작지 생산량 불량 표기 시간 재질 경도 기준 X1~X5 판정 열처리LOT 작업자 조장 QC
const WIDTHS = [5, 7, 8, 13, 13, 14, 8, 9, 6, 8, 9, 6, 10, 7, 7, 7, 7, 7, 6, 9, 8, 7, 7];

export async function downloadCheckSheetExcel({ board, specs, reasons, defects }) {
  const wb = new ExcelJS.Workbook();
  const label = equipLabel(board.equipCode, board.equipName);
  const ws = wb.addWorksheet(`${label} ${board.prodDate}`, {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
      printTitlesRow: '5:6',
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = WIDTHS.map((width) => ({ width }));
  const LAST = WIDTHS.length;
  const cell = (r, c) => ws.getCell(r, c);
  const put = (r1, c1, r2, c2, value, style = {}) => {
    if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
    const x = cell(r1, c1);
    x.value = value;
    x.font = { name: FONT, size: 9, ...style.font };
    x.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, ...style.alignment };
    if (style.fill) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
    for (let r = r1; r <= r2; r += 1) {
      for (let c = c1; c <= c2; c += 1) {
        cell(r, c).border = { top: thin, bottom: thin, left: thin, right: thin };
      }
    }
  };
  const signs = new Map((board.signs ?? []).map((s) => [s.slot, s]));
  const signText = (slot) => (signs.get(slot) ? `${signs.get(slot).signName}\n${String(signs.get(slot).signDt).slice(5, 10).replace('-', '/')}` : '');
  const [y, m, d] = board.prodDate.split('-').map(Number);

  // ── 머리 1~4행 ──
  [22, 22, 22, 22].forEach((h, i) => { ws.getRow(i + 1).height = h; });
  put(1, 1, 4, 6, `( ${label.replace('호기', '')} 호기)  열처리 CHECK SHEET\n(${board.subtitle ?? ''})`, { font: { size: 15, bold: true } });
  put(1, 7, 2, 7, '작업자', { fill: HEAD_BG });
  put(1, 8, 1, 8, '주간', { fill: HEAD_BG });
  put(1, 9, 1, 11, board.sheet?.workerDay ?? '', { font: { bold: true } });
  put(2, 8, 2, 8, '야간', { fill: HEAD_BG });
  put(2, 9, 2, 11, board.sheet?.workerNight ?? '', { font: { bold: true } });
  put(3, 7, 4, 7, '결재', { fill: HEAD_BG });
  [['담당', 8, 8], ['검토', 9, 10], ['승인', 11, 11]].forEach(([s, c1, c2]) => {
    put(3, c1, 3, c2, s, { fill: HEAD_BG });
    put(4, c1, 4, c2, signText(s), { font: { bold: true, color: { argb: RED } } });
  });
  put(1, 12, 1, 13, '확인란', { fill: HEAD_BG });
  put(2, 12, 4, 13, signText('확인'), { font: { bold: true, color: { argb: RED } } });
  put(1, 14, 1, 15, '공정QC 담당자', { fill: HEAD_BG });
  put(2, 14, 4, 15, board.sheet?.qcName ?? '', { font: { bold: true } });
  put(1, 16, 1, 17, '생산일자', { fill: HEAD_BG });
  put(1, 18, 1, LAST, `${y}년 ${m}월 ${d}일`, { font: { size: 11, bold: true } });
  put(2, 16, 4, 16, '협조팀', { fill: HEAD_BG });
  [['설비관리', 17, 18], ['품질관리', 19, 20], ['품질보증', 21, 21], ['생산관리', 22, LAST]].forEach(([s, c1, c2]) => {
    put(2, c1, 2, c2, s, { fill: HEAD_BG });
    put(3, c1, 4, c2, signText(s), { font: { bold: true, color: { argb: RED } } });
  });

  // ── 표 머리 5~6행 ──
  const R0 = 5;
  ws.getRow(R0).height = 18;
  ws.getRow(R0 + 1).height = 18;
  const heads = [['No'], ['출로\n시간'], ['업체'], ['Part No'], ['품명\n규격'], ['작지 No'], ['생산량\n(Kg)'], ['불량']];
  heads.forEach(([t], i) => put(R0, i + 1, R0 + 1, i + 1, t, { fill: HEAD_BG }));
  put(R0, 9, R0, 10, '비가동', { fill: HEAD_BG });
  put(R0 + 1, 9, R0 + 1, 9, '표기', { fill: HEAD_BG });
  put(R0 + 1, 10, R0 + 1, 10, '시간', { fill: HEAD_BG });
  put(R0, 11, R0 + 1, 11, '재질', { fill: HEAD_BG });
  put(R0, 12, R0 + 1, 12, '경도', { fill: HEAD_BG });
  put(R0, 13, R0 + 1, 13, '검사기준', { fill: HEAD_BG });
  put(R0, 14, R0, 18, '측정값', { fill: HEAD_BG });
  for (let i = 0; i < 5; i += 1) put(R0 + 1, 14 + i, R0 + 1, 14 + i, `X${i + 1}`, { fill: HEAD_BG });
  [['판정', 19], ['열처리\nLOT NO', 20], ['작업자', 21], ['조장', 22], ['공정QC', 23]].forEach(([t, c]) => put(R0, c, R0 + 1, c, t, { fill: HEAD_BG }));

  // ── 통(행) ──
  const specOf = (part, item) => specs.find((s) => s.partNo === part && s.itemName === item);
  let r = R0 + 2;
  (board.rows ?? []).forEach((row) => {
    ws.getRow(r).height = 17;
    ws.getRow(r + 1).height = 17;
    const span = (c, v, style) => put(r, c, r + 1, c, v ?? '', style);
    span(1, row.rowNo, { font: { bold: true } });
    span(2, row.outTime);
    span(3, row.vendor);
    span(4, row.partNo, { font: { bold: true } });
    put(r, 5, r, 5, row.productName ?? '');
    put(r + 1, 5, r + 1, 5, row.specText ?? '');
    span(6, row.lotNo, { font: { bold: true } });
    span(7, row.qtyKg == null ? '' : Number(row.qtyKg));
    span(8, row.defectQty ? `${Number(row.defectQty)} ${row.defectCode ?? ''}` : '', { font: { color: { argb: RED }, bold: true } });
    span(9, row.downCode, { font: { bold: true } });
    span(10, row.downStart || row.downEnd ? `${row.downStart ?? ''}\n~${row.downEnd ?? ''}` : '');
    span(11, row.material);
    ITEMS.forEach((it, k) => {
      const rr = r + k;
      const spec = specOf(row.partNo, it.key);
      const h = (row.hardness ?? []).find((x) => x.itemName === it.key);
      put(rr, 12, rr, 12, it.label, { fill: HEAD_BG });
      put(rr, 13, rr, 13, spec ? `${spec.lsl ?? ''}~${spec.usl ?? ''}` : '~');
      let ng = false;
      let any = false;
      for (let i = 0; i < 5; i += 1) {
        const v = h?.values?.[i];
        const out = v != null && spec && ((spec.lsl != null && v < spec.lsl) || (spec.usl != null && v > spec.usl));
        if (v != null) any = true;
        if (out) ng = true;
        put(rr, 14 + i, rr, 14 + i, v == null ? '' : Number(v), { font: { bold: true, color: { argb: out ? RED : 'FF1F3F7A' } } });
      }
      put(rr, 19, rr, 19, any ? (ng ? '불' : '합') : '', { font: { bold: true, color: { argb: ng ? RED : 'FF2E8A5F' } } });
    });
    span(20, row.heatLotNo);
    span(21, row.worker);
    span(22, row.leader);
    span(23, row.qc);
    r += 2;
  });

  // ── 코드표 · 특기사항 ──
  r += 1;
  const grouped = GROUPS.map((g) => [g, reasons.filter((x) => (x.reasonGroup || '기타') === g)]).filter(([, l]) => l.length);
  const reasonText = grouped.map(([g, l]) => `[${g}] ${l.map((x) => `${x.reasonName} ${x.reasonCode}`).join(' · ')}`).join('\n');
  put(r, 1, r, 2, '비가동', { fill: HEAD_BG });
  put(r, 3, r, LAST, reasonText, { alignment: { horizontal: 'left' }, font: { size: 8 } });
  ws.getRow(r).height = 15 * Math.max(2, grouped.length);
  r += 1;
  put(r, 1, r, 2, '불량구분', { fill: HEAD_BG });
  put(r, 3, r, LAST, defects.filter((t) => t.useYn === 'Y').map((t) => `${t.defectName} ${t.defectCode}`).join('   '), { alignment: { horizontal: 'left' }, font: { size: 8 } });
  ws.getRow(r).height = 18;
  r += 1;
  put(r, 1, r, 2, '특기사항', { fill: HEAD_BG });
  put(r, 3, r, LAST, board.note ?? '', { alignment: { horizontal: 'left' }, font: { size: 8 } });
  ws.getRow(r).height = 15 * Math.max(2, String(board.note ?? '').split('\n').length);

  for (let c = 1; c <= LAST; c += 1) {
    cell(1, c).border = { ...cell(1, c).border, top: medium };
    cell(r, c).border = { ...cell(r, c).border, bottom: medium };
  }
  for (let rr = 1; rr <= r; rr += 1) {
    cell(rr, 1).border = { ...cell(rr, 1).border, left: medium };
    cell(rr, LAST).border = { ...cell(rr, LAST).border, right: medium };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `열처리CHECKSHEET_${label}_${board.prodDate}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
