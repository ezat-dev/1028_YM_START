import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Highcharts from 'highcharts/esm/highcharts';
import HighchartsReact from 'highcharts-react-official';
import 'highcharts/esm/modules/exporting';
import 'highcharts/esm/modules/offline-exporting';
import 'highcharts/esm/modules/export-data';
import html2canvas from 'html2canvas';
import {
  IconChartLine, IconPlus, IconCamera, IconFileSpreadsheet, IconRefresh,
  IconCalendar, IconSearch, IconChevronDown, IconChevronUp, IconBuildingFactory2, IconSettings, IconFlask,
} from '@tabler/icons-react';
import Toast from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../context/AuthContext';
import { getTags, getSnapshotRange, getMemos, createMemo, deleteMemo } from '../../api/monitoring/trendApi';
import { getFullList as getFullTagList, createTag as createTrendTag, updateTag as updateTrendTag, deleteTag as deleteTrendTag } from '../../api/monitoring/trendSettingsApi';
import {
  getEquipFromTag, isCpTag, isFlowTag, isSpTag,
  applyValueCorrection, buildTagColorMap, tagColor, getSnapshotValue, parseTs,
} from '../../utils/trendScale';
import { DEMO_TAGS, DEMO_RAMP_LEAD, makeDemoRows, makeDemoMemos } from '../../mocks/trendMock';
import './TrendPage.css';

const EMPTY_SETTINGS_FORM = {
  tagName: '', address: '', plcId: '', colName: '', trendName: '', equipId: '', scale: '', enabled: 1,
};

// highcharts/modules/* (레거시 UMD 빌드)는 window._Highcharts 전역에 기대 실행되는데,
// Vite가 코어 highcharts는 esm/highcharts.js로 resolve하면서 그 전역을 채우지 않아
// "Cannot read properties of undefined (reading 'AST')"로 모듈 로드 시점에 죽는다.
// 코어/서브모듈을 전부 esm/ 트리에서 가져오면 진짜 ES import로 같은 인스턴스를 공유해서
// 별도 초기화 호출 없이 자동으로 등록된다.

const PERIOD_LABEL = { '1h': '최근 1시간', '6h': '최근 6시간', '24h': '최근 24시간', '3d': '최근 3일', '7d': '최근 7일' };
const PERIOD_MS = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '3d': 259200000, '7d': 604800000 };
const EQUIP_TABS = ['ALL', 'MBF1', 'MBF2', 'MBF3', 'MBF4', 'MBF5', 'MBF6'];
// Highcharts는 기본이 UTC라 축·툴팁 시각이 9시간 어긋난다 — 브라우저 시간대로 맞춘다
const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function pad(n) { return String(n).padStart(2, '0'); }
function toLocalInput(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
function toSqlDateTime(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
}
function isKgTag(t) {
  const n = (t.colName || t.tagName || '').toLowerCase();
  return /11.*kg|kg.*11/.test(n) || n.indexOf('11_kg') !== -1;
}
function isDefaultTag(t) {
  const name = `${t.trendName || t.tagName || t.colName || ''}`.toLowerCase();
  return !name.split(/[\s\-_]+/).some((s) => s === 'sp');
}
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export default function TrendPage() {
  const { user } = useAuth();
  // 실데이터가 아직 없어서 처음에는 예시 데이터를 켠 상태로 연다(툴바 버튼으로 끌 수 있음)
  const [tags, setTags] = useState(DEMO_TAGS);
  const [selectedCols, setSelectedCols] = useState(() => Object.fromEntries(
    DEMO_TAGS.filter((t) => t.equipId === 'MBF1').map((t) => [t.colName, t.demoDefault]),
  ));
  const [curEquip, setCurEquip] = useState('MBF1');
  const [curPeriod, setCurPeriod] = useState('6h');
  const [isCustom, setIsCustom] = useState(false);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [chartRows, setChartRows] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [memos, setMemos] = useState([]);
  const [memoVisible, setMemoVisible] = useState({});
  const [tagPanelTab, setTagPanelTab] = useState('tags'); // 'tags' | 'memo' — 좌측 패널 탭
  const [kpiOpen, setKpiOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [countdown, setCountdown] = useState(15);
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [memoForm, setMemoForm] = useState({ name: '', desc: '', time: '' });
  const [avgResult, setAvgResult] = useState(null); // { x0Pct, widthPct, rows: [{name,color,avg}] }

  // ── 트렌드 설정(태그 관리) 팝업 — 더 이상 별도 메뉴가 아니라 이 화면의 버튼에서 연다 ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTags, setSettingsTags] = useState([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsKeyword, setSettingsKeyword] = useState('');
  const [settingsFormOpen, setSettingsFormOpen] = useState(false);
  const [settingsEditing, setSettingsEditing] = useState(null);
  const [settingsForm, setSettingsForm] = useState(EMPTY_SETTINGS_FORM);
  const [settingsFormError, setSettingsFormError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  // 예시 데이터 보기 — 켜면 실제 태그·스냅샷 대신 1~6호기 예시 태그와 값을 보여준다(DB에는 아무것도 쓰지 않음)
  const [demo, setDemo] = useState(true);
  const demoRef = useRef(true); // 비동기 태그 로드에서 현재 예시 여부를 보기 위해
  demoRef.current = demo;
  const realTagsRef = useRef(null); // 실제 태그·선택 상태(예시를 끄면 이걸로 돌아간다)
  const demoAnchorRef = useRef(Date.now() - DEMO_RAMP_LEAD); // 예시 승온 시작 시각(켠 시각 기준으로 잡아 6시간 화면에 승온~안정이 보이게)

  const { toast, showToast } = useToast();
  const chartRef = useRef(null);
  const chartBoxRef = useRef(null);
  const [chartBoxW, setChartBoxW] = useState(0); // 메모 라벨이 오른쪽에 들어갈지 판단용
  const dragRef = useRef({ active: false, x0: 0, x1: 0 });
  const curFromRef = useRef('');
  const curToRef = useRef('');

  // ── 초기 로드 ──
  useEffect(() => {
    const now = new Date();
    setFromTime(toLocalInput(new Date(now.getTime() - PERIOD_MS['6h'])));
    setToTime(toLocalInput(now));

    getTags().then((res) => {
      const list = (res.data ?? []).filter((t) => t.enabled === 1);
      let firstEquip = null;
      list.forEach((t) => { const eq = getEquipFromTag(t); if (eq && !firstEquip) firstEquip = eq; });
      const eq = list.length ? (firstEquip || 'ALL') : 'ALL';
      const sel = {};
      if (eq !== 'ALL') {
        list.forEach((t) => { if (getEquipFromTag(t) === eq) sel[t.colName] = isDefaultTag(t); });
        if (!Object.values(sel).some(Boolean)) {
          let cnt = 0;
          list.forEach((t) => { if (getEquipFromTag(t) === eq && cnt < 2) { sel[t.colName] = true; cnt += 1; } });
        }
      }
      // 예시를 보고 있는 동안에는 실제 태그를 따로 보관만 하고, 예시를 끄면 그때 적용한다
      realTagsRef.current = { tags: list, selectedCols: sel, curEquip: eq };
      if (demoRef.current) return;
      setTags(list);
      setCurEquip(eq);
      setSelectedCols(sel);
    }).catch(() => showToast('태그 목록을 불러오지 못했습니다.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tagColorMap = useMemo(() => buildTagColorMap(tags), [tags]);

  // ── 데이터 조회 (시간 범위가 바뀔 때만 재조회 — 태그 선택은 클라이언트에서만 재계산) ──
  const fetchData = useCallback(async () => {
    if (!fromTime || !toTime) return;
    const from = toSqlDateTime(new Date(fromTime));
    const to = toSqlDateTime(new Date(toTime));
    curFromRef.current = from;
    curToRef.current = to;
    if (demo) {
      setChartRows(makeDemoRows(from, to, demoAnchorRef.current));
      setLoadError(false);
      const memoList = makeDemoMemos(from, to, demoAnchorRef.current);
      setMemos(memoList);
      setMemoVisible((prev) => {
        const next = { ...prev };
        memoList.forEach((m) => { if (next[m.tcCnt] === undefined) next[m.tcCnt] = true; });
        return next;
      });
      return;
    }
    try {
      const [snapRes, memoRes] = await Promise.all([
        getSnapshotRange(from, to),
        getMemos(from, to),
      ]);
      setChartRows(Array.isArray(snapRes.data) ? snapRes.data : []);
      setLoadError(false);
      const memoList = memoRes.data ?? [];
      setMemos(memoList);
      setMemoVisible((prev) => {
        const next = { ...prev };
        memoList.forEach((m) => { if (next[m.tcCnt] === undefined) next[m.tcCnt] = true; });
        return next;
      });
    } catch (e) {
      setLoadError(true);
    }
  }, [fromTime, toTime, demo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 실시간 15초 카운트다운(커스텀 범위가 아닐 때만 자동 새로고침) ──
  useEffect(() => {
    if (isCustom) return undefined;
    setCountdown(15);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          const now = new Date();
          setFromTime(toLocalInput(new Date(now.getTime() - PERIOD_MS[curPeriod])));
          setToTime(toLocalInput(now));
          return 15;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isCustom, curPeriod]);

  const selList = useMemo(
    () => tags.filter((t) => selectedCols[t.colName] && !isKgTag(t)),
    [tags, selectedCols]
  );

  // 차트 컨테이너 높이가 (고정 px가 아니라) flex로 정해지다 보니, Highcharts가 최초 마운트
  // 시점에 레이아웃이 채 안 잡힌 컨테이너를 측정해 기본값(400px)으로 굳어버리는 경우가 있다.
  // ResizeObserver로 실제 컨테이너 크기 변화(최초 레이아웃 확정 포함)를 감지해 매번 reflow.
  // chartBoxRef가 매달린 div는 tags/selList/loadError 조건에 따라 마운트·언마운트되므로,
  // 그 시점이 바뀔 때마다 옵저버를 다시 붙여야 최초 렌더 이후에도 안정적으로 동작한다.
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      // reflow()는 옵션에 height가 명시되지 않으면 높이는 다시 측정하지 않고 폭만 반응하는
      // 경우가 있어(하이차트 특유 동작), 관찰된 실제 크기를 setSize로 직접 지정한다.
      chartRef.current?.chart?.setSize(rect.width, rect.height, false);
      setChartBoxW(Math.round(rect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tags.length, selList.length, loadError]);

  const filteredTagList = useMemo(() => {
    const q = tagSearch.toLowerCase();
    return tags
      .filter((t) => (curEquip === 'ALL' || getEquipFromTag(t) === curEquip))
      .filter((t) => !isKgTag(t))
      .filter((t) => {
        if (!q) return true;
        const disp = (t.trendName || t.tagName || t.colName || '').toLowerCase();
        const sub = (t.colName || t.tagName || '').toLowerCase();
        return disp.includes(q) || sub.includes(q) || (t.address || '').toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => {
        const aN = (a.colName || a.tagName || '').toLowerCase();
        const bN = (b.colName || b.tagName || '').toLowerCase();
        return (/pv/.test(aN) ? 0 : 1) - (/pv/.test(bN) ? 0 : 1);
      });
  }, [tags, curEquip, tagSearch]);

  // 좌측 태그 목록에 최근값을 같이 보여주기 위한 태그별 최신값 — 선택 여부와 무관하게
  // 이미 받아온 chartRows(현재 조회 기간)에서 각 태그의 마지막 유효값만 뽑는다.
  const latestValueByTag = useMemo(() => {
    const map = {};
    filteredTagList.forEach((t) => {
      const vals = chartRows
        .map((row) => applyValueCorrection(parseFloat(getSnapshotValue(row, t)), t))
        .filter((v) => !isNaN(v));
      if (!vals.length) return;
      const cp = !isFlowTag(t) && isCpTag(t);
      const dec = cp ? 3 : (isFlowTag(t) ? 2 : 1);
      map[t.colName] = vals[vals.length - 1].toFixed(dec);
    });
    return map;
  }, [filteredTagList, chartRows]);

  const toggleTag = (colName) => setSelectedCols((prev) => ({ ...prev, [colName]: !prev[colName] }));

  const applyDefaultSelFor = (equipId, list) => {
    const sel = {};
    list.forEach((t) => { if (getEquipFromTag(t) === equipId) sel[t.colName] = t.demoDefault ?? isDefaultTag(t); });
    if (!Object.values(sel).some(Boolean)) {
      let cnt = 0;
      list.forEach((t) => { if (getEquipFromTag(t) === equipId && cnt < 2) { sel[t.colName] = true; cnt += 1; } });
    }
    return sel;
  };

  const setEquip = (eq) => {
    setCurEquip(eq);
    if (eq === 'ALL') {
      let firstEquip = null;
      tags.forEach((t) => { const teq = getEquipFromTag(t); if (teq && !firstEquip) firstEquip = teq; });
      setSelectedCols(firstEquip ? applyDefaultSelFor(firstEquip, tags) : {});
    } else {
      setSelectedCols(applyDefaultSelFor(eq, tags));
    }
  };

  const selectAll = (v) => {
    setSelectedCols((prev) => {
      const next = { ...prev };
      tags.forEach((t) => {
        const teq = getEquipFromTag(t);
        if (curEquip === 'ALL' || teq === curEquip) next[t.colName] = v;
      });
      return next;
    });
  };

  const setPeriod = (p) => {
    setCurPeriod(p);
    setIsCustom(false);
    const now = new Date();
    setFromTime(toLocalInput(new Date(now.getTime() - PERIOD_MS[p])));
    setToTime(toLocalInput(now));
  };

  const applyCustomRange = () => setIsCustom(true);

  const toggleDemo = () => {
    if (!demo) {
      realTagsRef.current = { tags, selectedCols, curEquip };
      demoAnchorRef.current = Date.now() - DEMO_RAMP_LEAD;
      setTags(DEMO_TAGS);
      setCurEquip('MBF1');
      setSelectedCols(applyDefaultSelFor('MBF1', DEMO_TAGS));
      setDemo(true);
    } else {
      const saved = realTagsRef.current;
      setTags(saved?.tags ?? []);
      setSelectedCols(saved?.selectedCols ?? {});
      setCurEquip(saved?.curEquip ?? 'ALL');
      setMemos([]);
      setDemo(false);
    }
  };

  // ── 현재 값 카드(최근값·평균·최소·최대) ──
  const kpiData = useMemo(() => selList.map((t) => {
    const vals = chartRows
      .map((row) => applyValueCorrection(parseFloat(getSnapshotValue(row, t)), t))
      .filter((v) => !isNaN(v));
    const color = tagColor(t, tagColorMap, tags);
    const name = t.trendName || t.tagName || t.colName;
    const cp = !isFlowTag(t) && isCpTag(t);
    const dec = cp ? 3 : (isFlowTag(t) ? 2 : 1);
    if (!vals.length) return { key: t.colName, name, color, na: true };
    const last = vals[vals.length - 1];
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { key: t.colName, name, color, last: last.toFixed(dec), avg: avg.toFixed(dec), min: Math.min(...vals).toFixed(dec), max: Math.max(...vals).toFixed(dec) };
  }), [selList, chartRows, tagColorMap, tags]);

  // ── 메인 차트 옵션 ──
  const chartOptions = useMemo(() => {
    const series = selList.map((t) => {
      const color = tagColor(t, tagColorMap, tags);
      const flow = isFlowTag(t);
      const cp = !flow && isCpTag(t);
      const sp = isSpTag(t);
      const data = [];
      chartRows.forEach((row) => {
        const ts = parseTs(row.record_time || row.recordTime);
        if (!ts) return;
        const v = applyValueCorrection(parseFloat(getSnapshotValue(row, t)), t);
        if (!isNaN(v)) data.push([ts, v]);
      });
      return {
        name: t.trendName || t.tagName || t.colName,
        data, color, lineWidth: 2, type: 'spline',
        yAxis: flow && /c3h8/.test((t.trendName || t.tagName || t.colName || '').toLowerCase()) ? 2 : ((flow || cp) ? 1 : 0),
        custom: { isCp: cp, isFlow: flow },
        dashStyle: sp ? 'Dash' : 'Solid',
        marker: { enabled: data.length < 80, radius: 3 },
        states: { hover: { lineWidth: 3 } },
      };
    });

    // 라벨 폭을 글자 수로 어림해 시간 폭으로 바꾼다 — 오른쪽에 안 들어가면 선 왼쪽으로 펼치고,
    // 메모끼리 겹치면 아래 줄로 내린다
    const firstTs = parseTs(chartRows[0]?.record_time || chartRows[0]?.recordTime);
    const lastTs = parseTs(chartRows[chartRows.length - 1]?.record_time || chartRows[chartRows.length - 1]?.recordTime);
    const span = firstTs && lastTs ? lastTs - firstTs : 0;
    // 플롯 폭 — 이미 그려진 차트가 있으면 실제 값, 없으면 상자 폭에서 좌우 축 라벨 폭을 뺀 어림값
    const plotPx = chartRef.current?.chart?.plotWidth || Math.max(600, (chartBoxW || 1200) - 130);
    // 한글은 영문·숫자보다 넓다(제목 11px, 내용 10px 기준 어림)
    const textPx = (str, size) => [...String(str || '')].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? size : size * 0.6), 0);
    const labelPx = (m) => Math.max(textPx(m.tcName, 11.5), textPx(m.tcDesc, 10)) + 22;
    const labelSpan = (m) => (span * labelPx(m)) / plotPx;
    const rowsUsed = []; // 줄마다 차지한 [시작, 끝] 목록
    const plotLines = memos
      .filter((m) => memoVisible[m.tcCnt] !== false)
      .slice()
      .sort((a, b) => (parseTs(a.tcRegtime) ?? 0) - (parseTs(b.tcRegtime) ?? 0))
      .map((m) => {
        const ts = parseTs(m.tcRegtime);
        if (!ts) return null;
        const labelW = labelSpan(m);
        const flip = Boolean(span) && ts + labelW > lastTs;
        // 메모 색 — 기본 보라, 이상(tone: 'alert', 예: 통신 재연결)은 연빨강
        const alert = m.tone === 'alert';
        const lineColor = alert ? '#f19a9a' : '#805AD5';
        const labelBg = alert ? 'rgba(229, 115, 115, .62)' : 'rgba(128,90,213,.55)';
        const box = flip ? [ts - labelW, ts] : [ts, ts + labelW];
        let row = 0;
        while (span && (rowsUsed[row] ?? []).some(([a, b]) => box[0] < b && box[1] > a)) row += 1;
        (rowsUsed[row] = rowsUsed[row] ?? []).push(box);
        return {
          id: `memo-${m.tcCnt}`,
          value: ts, color: lineColor, width: 1.5, dashStyle: 'ShortDash', zIndex: 5,
          label: {
            useHTML: true,
            // span+<br/>로 두 줄을 쪼개면 인라인 요소 특성상 배경이 줄마다 따로 그려진다 —
            // div(블록)로 감싸야 배경 하나가 제목+내용 전체를 통째로 덮는다.
            text: `<div style="background:${labelBg};color:#fff;padding:3px 7px;border-radius:5px;font-size:11px;font-weight:600;white-space:nowrap;line-height:1.4">${esc(m.tcName || '')}${m.tcDesc ? `<div style="font-weight:400;font-size:10px;opacity:.92">${esc(m.tcDesc)}</div>` : ''}</div>`,
            // 플롯 맨 위에 붙지 않게 조금 내린다
            rotation: 0, align: flip ? 'right' : 'left', textAlign: flip ? 'right' : 'left', x: flip ? -4 : 4, y: 34 + row * 40,
          },
        };
      })
      .filter(Boolean);

    return {
      chart: {
        type: 'spline', animation: false, zoomType: 'x',
        // 배경은 카드(.trend-chart-card)가 칠한다 — 차트·플롯 영역을 투명하게 둬서 카드와 색 경계가 생기지 않게
        backgroundColor: 'transparent', plotBackgroundColor: 'rgba(255, 255, 255, 0.015)',
        panning: { enabled: true, type: 'x' }, panKey: 'shift',
        style: { fontFamily: "'Segoe UI','Malgun Gothic',sans-serif" },
      },
      title: { text: null },
      time: { timezone: LOCAL_TZ },
      xAxis: {
        type: 'datetime', lineColor: '#2d3d5a', tickColor: '#2d3d5a', gridLineColor: '#1a2840',
        labels: { format: '{value:%m/%d %H:%M}', style: { fontSize: '11px', color: '#8899bb' } },
        crosshair: { color: 'rgba(96,165,250,.4)' },
        plotLines,
      },
      yAxis: [
        { min: 0, max: 1000, tickInterval: 50, endOnTick: false, maxPadding: 0, title: { text: null }, gridLineColor: '#1a2840', labels: { format: '{value}', style: { fontSize: '10px', color: '#8899bb' } } },
        { min: 0, max: 2.0, tickInterval: 0.1, endOnTick: false, maxPadding: 0, opposite: true, title: { text: null }, gridLineColor: 'transparent', labels: { format: '{value:.2f}', style: { fontSize: '10px', color: '#4ADE80' } } },
        { min: 0, max: 10, tickInterval: 1, endOnTick: false, maxPadding: 0, opposite: true, title: { text: null }, gridLineColor: 'transparent', labels: { format: '{value:.1f}', style: { fontSize: '10px', color: '#22D3EE' } } },
      ],
      tooltip: {
        shared: true, backgroundColor: '#0d1628', borderColor: '#2d3d5a', borderRadius: 8,
        style: { color: '#d0ddf0' },
        formatter() {
          const d = new Date(this.x);
          const p2 = (n) => String(n).padStart(2, '0');
          const when = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
          let s = `<span style="font-size:10px;color:#8899bb">${when}</span><br/>`;
          this.points.forEach((p) => {
            const dec = p.series.userOptions.custom?.isCp ? 3 : (p.series.userOptions.custom?.isFlow ? 2 : 1);
            s += `<span style="color:${p.series.color}">●</span> ${p.series.name}: <b>${p.y.toFixed(dec)}</b><br/>`;
          });
          return s;
        },
      },
      legend: { enabled: true, backgroundColor: 'transparent', itemStyle: { fontSize: '12px', fontWeight: '600', color: '#c0cde0' }, itemHoverStyle: { color: '#ffffff' } },
      plotOptions: { spline: { turboThreshold: 10000 } },
      // 우측 상단 메뉴 버튼은 숨긴다 — 툴바에 이미 PNG/XLS 버튼이 따로 있어 중복이다.
      // exporting 자체는 켜둬야 downloadXLS() 등 export-data 모듈 API를 그대로 쓸 수 있다.
      exporting: { enabled: true, fallbackToExportServer: false, buttons: { contextButton: { enabled: false } } },
      credits: { enabled: false },
      series,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selList, chartRows, memos, memoVisible, tagColorMap, tags, chartBoxW]);

  // ── Alt+드래그 구간 평균 ──
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el) return undefined;

    const onDown = (e) => {
      if (!e.altKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      dragRef.current = { active: true, x0: e.clientX - rect.left, x1: e.clientX - rect.left };
      setAvgResult({ dragging: true, x0: dragRef.current.x0, x1: dragRef.current.x1 });
    };
    const onMove = (e) => {
      if (!dragRef.current.active) return;
      const rect = el.getBoundingClientRect();
      dragRef.current.x1 = e.clientX - rect.left;
      setAvgResult({ dragging: true, x0: dragRef.current.x0, x1: dragRef.current.x1 });
    };
    const onUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      const chart = chartRef.current?.chart;
      const x0px = Math.min(dragRef.current.x0, dragRef.current.x1);
      const x1px = Math.max(dragRef.current.x0, dragRef.current.x1);
      if (!chart || x1px - x0px < 5) { setAvgResult(null); return; }
      const t0 = chart.xAxis[0].toValue(x0px - chart.plotLeft);
      const t1 = chart.xAxis[0].toValue(x1px - chart.plotLeft);
      const inRange = chartRows.filter((row) => {
        const ts = parseTs(row.record_time || row.recordTime);
        return ts !== null && ts >= t0 && ts <= t1;
      });
      const rows = selList.map((t) => {
        const vals = inRange.map((row) => applyValueCorrection(parseFloat(getSnapshotValue(row, t)), t)).filter((v) => !isNaN(v));
        if (!vals.length) return null;
        return { name: t.trendName || t.tagName || t.colName, color: tagColor(t, tagColorMap, tags), avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) };
      }).filter(Boolean);
      setAvgResult(rows.length ? { x0: x0px, x1: x1px, count: inRange.length, rows } : null);
    };

    el.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [chartRows, selList, tagColorMap, tags]);

  // ── 메모 ──
  const openMemoModal = () => {
    const now = new Date();
    setMemoForm({ name: '', desc: '', time: toLocalInput(now) });
    setMemoModalOpen(true);
  };
  const saveMemo = async () => {
    if (!memoForm.name.trim()) { showToast('메모 제목을 입력하세요', 'error'); return; }
    try {
      // tb_temp_memo의 tc_user_code/tc_user_name은 NOT NULL이라 반드시 채워서 보내야 한다.
      // 이 앱은 서버 세션이 없어서(로그인 성공 시 사용자 정보만 내려주고 프론트가 브라우저에
      // 들고 있는 구조) 원본(sample_pro)처럼 세션에서 채울 수 없어 클라이언트가 직접 실어 보낸다.
      await createMemo({
        tcName: memoForm.name.trim(),
        tcDesc: memoForm.desc.trim(),
        tcRegtime: memoForm.time.replace('T', ' ') + ':00',
        tcUserCode: user?.userId,
        tcUserName: user?.userName,
      });
      setMemoModalOpen(false);
      fetchData();
    } catch (e) {
      showToast('메모 저장에 실패했습니다.', 'error');
    }
  };
  const toggleMemo = (tcCnt) => setMemoVisible((prev) => ({ ...prev, [tcCnt]: prev[tcCnt] === false }));
  const removeMemo = async (tcCnt) => {
    if (demo) { showToast('예시 데이터의 메모는 삭제할 수 없습니다.', 'error'); return; }
    if (!window.confirm('메모를 삭제하시겠습니까?')) return;
    try {
      await deleteMemo(tcCnt);
      fetchData();
    } catch (e) {
      showToast('메모 삭제에 실패했습니다.', 'error');
    }
  };

  // ── PNG / CSV·XLS 내보내기 ──
  const savePng = () => {
    if (!chartBoxRef.current) return;
    html2canvas(chartBoxRef.current, { backgroundColor: '#131b2c', scale: 2, useCORS: true, logging: false }).then((canvas) => {
      const a = document.createElement('a');
      const now = new Date();
      a.href = canvas.toDataURL('image/png');
      a.download = `trend_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
      a.click();
    });
  };
  const saveXls = () => { chartRef.current?.chart?.downloadXLS(); };

  // ── 트렌드 설정(태그 관리) 팝업 ──
  // 켤 때마다 활성/비활성 태그를 전부 새로 받아온다(메인 태그 목록은 enabled=1만 걸러둬서 재사용 불가).
  const fetchSettingsTags = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await getFullTagList();
      setSettingsTags(res.data ?? []);
    } catch (e) {
      showToast('트렌드 태그 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setSettingsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSettings = () => {
    setSettingsOpen(true);
    fetchSettingsTags();
  };

  // 팝업을 닫을 때 메인 화면의 태그 목록만 가볍게 다시 받는다 — 현재 보고 있는 설비 탭/선택은
  // 그대로 두고(마운트 시 초기 로직과 달리 첫 설비로 되돌리지 않는다) 목록만 최신화한다.
  const closeSettings = () => {
    setSettingsOpen(false);
    getTags().then((res) => setTags((res.data ?? []).filter((t) => t.enabled === 1))).catch(() => {});
  };

  const filteredSettingsTags = useMemo(() => {
    if (!settingsKeyword.trim()) return settingsTags;
    const k = settingsKeyword.trim().toLowerCase();
    return settingsTags.filter((t) =>
      t.tagName?.toLowerCase().includes(k) || t.trendName?.toLowerCase().includes(k) ||
      t.equipId?.toLowerCase().includes(k) || t.address?.toLowerCase().includes(k));
  }, [settingsTags, settingsKeyword]);

  const openSettingsCreate = () => {
    setSettingsEditing(null);
    setSettingsForm(EMPTY_SETTINGS_FORM);
    setSettingsFormError('');
    setSettingsFormOpen(true);
  };
  const openSettingsEdit = (tag) => {
    setSettingsEditing(tag);
    setSettingsForm({
      tagName: tag.tagName ?? '', address: tag.address ?? '', plcId: tag.plcId ?? '',
      colName: tag.colName ?? '', trendName: tag.trendName ?? '', equipId: tag.equipId ?? '',
      scale: tag.scale ?? '', enabled: tag.enabled ?? 1,
    });
    setSettingsFormError('');
    setSettingsFormOpen(true);
  };
  const handleSettingsDelete = async (tag) => {
    if (!window.confirm(`'${tag.tagName}' 태그를 삭제하시겠습니까? (스냅샷 컬럼은 데이터 보존을 위해 남습니다)`)) return;
    try {
      await deleteTrendTag(tag.tempId);
      showToast('삭제되었습니다.');
      fetchSettingsTags();
    } catch (e) {
      showToast(e.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };
  const handleSettingsToggleEnabled = async (tag) => {
    try {
      await updateTrendTag(tag.tempId, { ...tag, enabled: tag.enabled === 1 ? 0 : 1 });
      fetchSettingsTags();
    } catch (e) {
      showToast('상태 변경에 실패했습니다.', 'error');
    }
  };
  const handleSettingsSubmit = async (e) => {
    e.preventDefault();
    setSettingsFormError('');
    if (!settingsForm.tagName.trim()) { setSettingsFormError('태그 이름은 필수입니다.'); return; }
    if (!settingsForm.address.trim()) { setSettingsFormError('PLC 주소는 필수입니다.'); return; }
    if (!settingsForm.plcId.trim()) { setSettingsFormError('PLC ID는 필수입니다.'); return; }
    setSettingsSaving(true);
    try {
      if (settingsEditing) {
        await updateTrendTag(settingsEditing.tempId, settingsForm);
        showToast('수정되었습니다.');
      } else {
        await createTrendTag(settingsForm);
        showToast('등록되었습니다.');
      }
      setSettingsFormOpen(false);
      fetchSettingsTags();
    } catch (e) {
      setSettingsFormError(e.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const settingsColumns = useMemo(
    () => [
      {
        title: '태그', field: 'tagName', minWidth: 180,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          return `<div class="mes-identity-cell"><div class="mes-identity-text">
              <div class="mes-identity-name">${row.trendName || row.tagName || ''}</div>
              <div class="mes-identity-sub">${row.tagName ?? ''}</div>
            </div></div>`;
        },
      },
      { title: '설비', field: 'equipId', width: 80, hozAlign: 'center' },
      { title: '주소', field: 'address', width: 80 },
      { title: 'PLC', field: 'plcId', width: 130 },
      { title: '보정식', field: 'scale', width: 80, hozAlign: 'center' },
      {
        title: '사용', field: 'enabled', width: 70, hozAlign: 'center',
        formatter: (cell) => {
          const on = cell.getValue() === 1;
          return `<span class="mes-badge ${on ? 'mes-badge-success' : 'mes-badge-danger'}" style="cursor:pointer">${on ? 'ON' : 'OFF'}</span>`;
        },
        cellClick: (e, cell) => handleSettingsToggleEnabled(cell.getRow().getData()),
      },
      {
        title: '관리', field: 'tempId', width: 110, hozAlign: 'center', headerSort: false,
        formatter: () => '<div class="mes-row-actions"><button class="mes-btn mes-btn-ghost tbl-edit">수정</button><button class="mes-btn mes-btn-ghost tbl-delete">삭제</button></div>',
        cellClick: (e, cell) => {
          const btn = e.target.closest('button');
          if (!btn) return;
          const row = cell.getRow().getData();
          if (btn.classList.contains('tbl-edit')) openSettingsEdit(row);
          if (btn.classList.contains('tbl-delete')) handleSettingsDelete(row);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const periodLabel = isCustom
    ? `${fromTime.replace('T', ' ').slice(0, 16)} ~ ${toTime.replace('T', ' ').slice(0, 16)}`
    : PERIOD_LABEL[curPeriod];

  return (
    <div className="mes-page trend-page">
      <div className="trend-toolbar-card">
        <div className="trend-toolbar-row trend-title-row">
          <div className="trend-title-group">
            <IconChartLine size={16} />
            <h2 className="trend-title">TREND</h2>
            <span className="trend-title-desc">설비 온도/유량 트렌드 — {periodLabel}</span>
            {demo && <span className="trend-demo-badge">예시 데이터</span>}
          </div>
          {!isCustom && (
            <div className="trend-live-badge">
              <span className="dot" />
              LIVE
            </div>
          )}
        </div>

        <div className="trend-toolbar-sep" />

        <div className="trend-toolbar-row">
          <div className="trend-segmented">
            {Object.keys(PERIOD_LABEL).map((p) => (
              <button key={p} className={`trend-seg-btn${!isCustom && curPeriod === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>
                {PERIOD_LABEL[p].replace('최근 ', '')}
              </button>
            ))}
          </div>

          <div className="trend-divider" />

          <div className="trend-range-group">
            <IconCalendar size={15} />
            <input type="datetime-local" className="trend-input" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
            <span>~</span>
            <input type="datetime-local" className="trend-input" value={toTime} onChange={(e) => setToTime(e.target.value)} />
            <button className="trend-btn" onClick={applyCustomRange}>적용</button>
            <button className="trend-btn-icon" title="새로고침" onClick={fetchData}><IconRefresh size={15} /></button>
            <button
              type="button"
              className={`trend-btn trend-demo-btn${demo ? ' is-on' : ''}`}
              aria-pressed={demo}
              title={demo ? '실제 데이터로 돌아갑니다' : '1~6호기 예시 값으로 차트를 그려 봅니다(저장되지 않음)'}
              onClick={toggleDemo}
            >
              <IconFlask size={14} /> {demo ? '예시 데이터 끄기' : '예시 데이터 보기'}
            </button>
          </div>

          <div className="trend-actions">
            <button className="trend-btn" onClick={() => setKpiOpen((v) => !v)}>
              {kpiOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />} 현재 값
            </button>
            <button className="trend-btn" onClick={openSettings} disabled={demo} title={demo ? '예시 데이터 보기 중에는 설정할 수 없습니다' : undefined}><IconSettings size={15} /> 트렌드 설정</button>
            <button className="trend-btn" onClick={openMemoModal} disabled={demo} title={demo ? '예시 데이터 보기 중에는 메모를 남길 수 없습니다' : undefined}><IconPlus size={15} /> 메모</button>
            <button className="trend-btn" onClick={savePng}><IconCamera size={15} /> PNG</button>
            <button className="trend-btn" onClick={saveXls}><IconFileSpreadsheet size={15} /> XLS</button>
          </div>
        </div>

        <div className="trend-toolbar-sep" />

        <div className="trend-toolbar-row trend-equip-row">
          <span className="trend-row-label"><IconBuildingFactory2 size={13} /> 설비</span>
          <div className="trend-tabs">
            {EQUIP_TABS.map((eq) => (
              <button key={eq} className={`trend-tab${curEquip === eq ? ' active' : ''}`} onClick={() => setEquip(eq)}>
                {eq === 'ALL' ? '전체' : eq}
              </button>
            ))}
          </div>
        </div>
      </div>

      {kpiOpen && (
        <div className="trend-kpi-card">
          <div className="trend-kpi-header">현재 값{kpiData.length > 0 ? ` · ${kpiData.length}` : ''}</div>
          <div className="trend-kpi-grid">
            {kpiData.length === 0 && <div className="trend-chart-empty" style={{ padding: '10px 0', gridColumn: '1 / -1' }}>선택된 태그가 없습니다.</div>}
            {kpiData.map((k) => (
              <div key={k.key} className="trend-kpi-item" style={{ borderTopColor: k.color }}>
                <div className="trend-kpi-name" title={k.name}>{k.name}</div>
                {k.na ? <div className="trend-kpi-na">N/A</div> : (
                  <>
                    <div className="trend-kpi-last" style={{ color: k.color }}>{k.last}</div>
                    <div className="trend-kpi-meta">
                      <span>avg <b>{k.avg}</b></span><span>↓{k.min}</span><span>↑{k.max}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="trend-body-grid">
        <div className="trend-tag-panel">
          <div className="trend-panel-tabs">
            <button
              type="button"
              className={`trend-panel-tab${tagPanelTab === 'tags' ? ' active' : ''}`}
              onClick={() => setTagPanelTab('tags')}
            >
              표시 태그<span className="trend-tag-count">{selList.length}</span>
            </button>
            <button
              type="button"
              className={`trend-panel-tab${tagPanelTab === 'memo' ? ' active' : ''} memo`}
              onClick={() => setTagPanelTab('memo')}
            >
              메모<span className="trend-tag-count memo">{memos.length}</span>
            </button>
          </div>

          {tagPanelTab === 'tags' ? (
            <>
              <div className="trend-search-box">
                <IconSearch size={14} />
                <input placeholder="태그 검색" value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} />
              </div>
              <div className="trend-tag-bulk">
                <button onClick={() => selectAll(true)}>전체선택</button>
                <button onClick={() => selectAll(false)}>전체해제</button>
              </div>
              <div className="trend-tag-list">
                {filteredTagList.length === 0 && <div className="trend-tag-empty">태그 없음</div>}
                {filteredTagList.map((t) => {
                  const sel = !!selectedCols[t.colName];
                  const color = tagColor(t, tagColorMap, tags);
                  return (
                    <div key={t.colName} className={`trend-tag-item${sel ? ' selected' : ''}`} onClick={() => toggleTag(t.colName)}>
                      <div className="trend-tag-dot" style={{ background: color }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="trend-tag-name">{t.trendName || t.tagName}</div>
                        <div className="trend-tag-sub">{t.colName || t.tagName}</div>
                      </div>
                      <span className="trend-tag-value">{latestValueByTag[t.colName] ?? '—'}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="trend-tag-list">
              {memos.length === 0 && <div className="trend-tag-empty">등록된 메모가 없습니다.</div>}
              {memos.map((m) => {
                const vis = memoVisible[m.tcCnt] !== false;
                return (
                  <div key={m.tcCnt} className={`trend-memo-item${vis ? ' visible' : ' hidden'}`} onClick={() => toggleMemo(m.tcCnt)}>
                    <div className="trend-memo-item-top">
                      <span className="trend-memo-item-title">{m.tcName}</span>
                      <span className="trend-memo-item-x" onClick={(e) => { e.stopPropagation(); removeMemo(m.tcCnt); }}>✕</span>
                    </div>
                    {m.tcDesc && <div className="trend-memo-item-desc">{m.tcDesc}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="trend-chart-card">
          {tags.length === 0 ? (
            <div className="trend-chart-empty">
              등록된 태그가 없습니다.<br />상단 "트렌드 설정" 버튼에서 태그를 먼저 등록하세요.
            </div>
          ) : selList.length === 0 ? (
            <div className="trend-chart-empty">좌측에서 태그를 선택하세요</div>
          ) : loadError ? (
            <div className="trend-chart-error">데이터 로드 실패</div>
          ) : (
            <div ref={chartBoxRef} style={{ position: 'relative', flex: 1, minHeight: 0 }}>
              <HighchartsReact highcharts={Highcharts} options={chartOptions} ref={chartRef} containerProps={{ style: { height: '100%' } }} />
              {avgResult && !avgResult.dragging && (
                <div style={{
                  position: 'absolute', left: avgResult.x1 + 8, top: 40, zIndex: 10,
                  background: '#0d1628', border: '1px solid #2d3d5a', borderRadius: 8, padding: '10px 12px', minWidth: 180,
                  boxShadow: 'var(--mes-shadow-lg)',
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12, color: '#d0ddf0' }}>Alt-드래그 평균 ({avgResult.count}pts)</div>
                  {avgResult.rows.map((r) => (
                    <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 11, color: '#c0cde0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: '#d0ddf0' }}>{r.avg}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, color: '#6b7ba0', marginTop: 6, borderTop: '1px solid #2d3d5a', paddingTop: 4, cursor: 'pointer' }} onClick={() => setAvgResult(null)}>닫기</div>
                </div>
              )}
              {avgResult?.dragging && (
                <div style={{ position: 'absolute', left: Math.min(avgResult.x0, avgResult.x1), top: 0, width: Math.abs(avgResult.x1 - avgResult.x0), height: '100%', background: 'rgba(49,130,206,.1)', border: '1px solid rgba(49,130,206,.4)', pointerEvents: 'none' }} />
              )}
            </div>
          )}
        </div>
      </div>

      {memoModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="mes-card" style={{ width: 380 }}>
            <h3 style={{ marginBottom: 12 }}>메모 추가</h3>
            <div className="mes-field">
              <label>시각</label>
              <input type="datetime-local" value={memoForm.time} onChange={(e) => setMemoForm({ ...memoForm, time: e.target.value })} />
            </div>
            <div className="mes-field">
              <label>제목 *</label>
              <input value={memoForm.name} maxLength={10} onChange={(e) => setMemoForm({ ...memoForm, name: e.target.value })} />
            </div>
            <div className="mes-field">
              <label>설명</label>
              <input value={memoForm.desc} maxLength={100} onChange={(e) => setMemoForm({ ...memoForm, desc: e.target.value })} />
            </div>
            <div className="mes-modal-footer">
              <button className="mes-btn mes-btn-secondary" onClick={() => setMemoModalOpen(false)}>취소</button>
              <button className="mes-btn mes-btn-primary" onClick={saveMemo}>저장</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <Modal title="트렌드 설정" onClose={closeSettings} xl>
          <div className="mes-toolbar">
            <div className="mes-search">
              <IconSearch size={15} />
              <input placeholder="태그명·설비·주소 검색" value={settingsKeyword} onChange={(e) => setSettingsKeyword(e.target.value)} />
            </div>
            <span className="mes-page-desc">{settingsLoading ? '불러오는 중...' : `총 ${filteredSettingsTags.length}개`}</span>
            <button className="mes-btn mes-btn-primary" onClick={openSettingsCreate}>
              <IconPlus size={15} /> 태그 등록
            </button>
          </div>
          <DataTable data={filteredSettingsTags} columns={settingsColumns} height="58vh" />
        </Modal>
      )}

      {settingsFormOpen && (
        <Modal title={settingsEditing ? '태그 수정' : '태그 등록'} onClose={() => setSettingsFormOpen(false)}>
          <form onSubmit={handleSettingsSubmit}>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>태그 이름 *</label>
                <input value={settingsForm.tagName} onChange={(e) => setSettingsForm({ ...settingsForm, tagName: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>트렌드 표시명</label>
                <input value={settingsForm.trendName} onChange={(e) => setSettingsForm({ ...settingsForm, trendName: e.target.value })} placeholder="예) 침탄_PV_1" />
              </div>
              <div className="mes-field">
                <label>PLC 주소 *</label>
                <input value={settingsForm.address} onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })} placeholder="예) D0" />
              </div>
              <div className="mes-field">
                <label>PLC ID *</label>
                <input value={settingsForm.plcId} onChange={(e) => setSettingsForm({ ...settingsForm, plcId: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>설비</label>
                <input value={settingsForm.equipId} onChange={(e) => setSettingsForm({ ...settingsForm, equipId: e.target.value })} placeholder="예) MBF1" />
              </div>
              <div className="mes-field">
                <label>컬럼명 (비워두면 자동 생성)</label>
                <input value={settingsForm.colName} onChange={(e) => setSettingsForm({ ...settingsForm, colName: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>보정식</label>
                <input value={settingsForm.scale} onChange={(e) => setSettingsForm({ ...settingsForm, scale: e.target.value })} placeholder="+50 / -100 / *0.01 / /2" />
              </div>
              <div className="mes-field">
                <label>사용 여부</label>
                <select value={settingsForm.enabled} onChange={(e) => setSettingsForm({ ...settingsForm, enabled: Number(e.target.value) })}>
                  <option value={1}>사용</option>
                  <option value={0}>중지</option>
                </select>
              </div>
            </div>
            {settingsFormError && <div className="mes-error" style={{ marginTop: 4 }}>{settingsFormError}</div>}
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setSettingsFormOpen(false)}>취소</button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={settingsSaving}>{settingsSaving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
