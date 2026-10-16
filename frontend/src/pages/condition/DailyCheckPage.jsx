import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  IconClipboardCheck, IconSearch, IconPlus, IconTrash, IconFileSpreadsheet, IconLock,
  IconDeviceTablet, IconChevronLeft, IconChevronRight, IconEdit, IconCheck,
} from '@tabler/icons-react';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useSidebar } from '../../context/SidebarContext';
import { getListByYm, updateField, insertRow, deleteRow, uploadImage, viewImageUrl } from '../../api/condition/dailyCheckApi';
import './DailyCheckPage.css';

function pad(n) {
  return String(n).padStart(2, '0');
}

function currentYm() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

const VALUE_TYPE_LABEL = { check: 'OK/NG', number: '숫자', text: '문자' };

// Tabulator 컬럼 field(camelCase)와 실제 DB 컬럼명(snake_case)이 다른 필드만 매핑한다.
// d01~d31은 그대로 일치해서 매핑이 필요 없다.
const DB_FIELD_MAP = { dTitle: 'd_title', dDesc: 'd_desc', dBigo: 'd_bigo', valueType: 'value_type' };
function toDbField(field) {
  return DB_FIELD_MAP[field] ?? field;
}

// Tabulator formatter는 HTML 문자열만 받으므로 React 아이콘 컴포넌트 대신 인라인 SVG를 쓴다.
const DC_IMAGE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>' +
  '<path d="M21 15l-5-5L5 21"/></svg>';

// 항목(행)의 valueType이 number/text일 때 1~31일 셀 편집기 — 행마다 고정 타입이라
// cell.getRow().getData()로 판단한다. check 타입은 편집기 없이 셀 클릭 한 번으로
// 바로 순환(빈값→OK→NG→빈값)하도록 별도 처리한다(아래 cellClick 참고).
function dailyValueEditor(cell, onRendered, success, cancel) {
  const valueType = cell.getRow().getData().valueType || 'text';
  const input = document.createElement('input');
  input.type = valueType === 'number' ? 'number' : 'text';
  input.value = cell.getValue() ?? '';
  input.className = 'dc-cell-input';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      success(input.value);
    } else if (e.key === 'Escape') {
      cancel();
    }
  });
  input.addEventListener('blur', () => success(input.value));
  onRendered(() => {
    input.focus();
    input.select();
  });
  return input;
}

function dailyValueFormatter(cell) {
  const valueType = cell.getRow().getData().valueType || 'text';
  const v = cell.getValue();
  if (!v) return '';
  if (valueType === 'check') {
    const cls = v === 'OK' ? 'dc-badge-ok' : v === 'NG' ? 'dc-badge-ng' : '';
    return `<span class="dc-value-badge ${cls}">${v}</span>`;
  }
  return v;
}

export default function DailyCheckPage() {
  const [ym, setYm] = useState(currentYm());
  const [ymInput, setYmInput] = useState(currentYm());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tabletMode, setTabletMode] = useState(false);
  // 편집 모드 — 켜야 항목(행) 추가·삭제와 항목명·항목설명·타입 수정이 된다.
  // 평소에는 날짜 칸 값 입력만 되게 해서 항목명을 실수로 고치는 일을 막는다.
  const [editMode, setEditMode] = useState(false);
  const [tabletCenterDay, setTabletCenterDay] = useState(() => new Date().getDate());
  const [insertModalOpen, setInsertModalOpen] = useState(false);
  const [insertYm, setInsertYm] = useState(currentYm());
  const [viewerFile, setViewerFile] = useState(null);
  const { toast, showToast } = useToast();
  const permission = usePermission('/condition/dailyCheck');
  const canEditItems = permission.canCreate || permission.canUpdate || permission.canDelete;
  const { setCollapsed: setSidebarCollapsed } = useSidebar();
  const tableRef = useRef(null);
  const uploadCntRef = useRef(null);
  const fileInputRef = useRef(null);
  const gridWrapRef = useRef(null);
  const [gridWidth, setGridWidth] = useState(0);

  // 태블릿 모드에서 날짜 칸 너비를 "남는 폭 ÷ 날짜 수"로 직접 계산해 꽉 채우기 위해 실제 폭을 잰다
  // (Tabulator fitColumns는 frozen 컬럼과 섞이면 남는 폭을 안 채워주는 걸 확인해서 이 방식으로 대체).
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (width) setGridWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 이 화면을 벗어날 때는 태블릿 모드 여부와 무관하게 사이드바를 항상 펼친 상태로 되돌린다
  // (접힌 채로 다른 화면까지 넘어가면 혼란스러우므로).
  useEffect(() => () => setSidebarCollapsed(false), [setSidebarCollapsed]);

  // 뒤늦게 도착한 이전 요청 응답이 최신 데이터를 덮어쓰지 않도록 순번으로 막는다
  // (StrictMode의 effect 이중 실행, 월 빠르게 전환 등에서 순서 역전을 방지).
  const fetchSeqRef = useRef(0);
  const fetchList = useCallback(
    async (targetYm) => {
      const seq = ++fetchSeqRef.current;
      setLoading(true);
      try {
        const res = await getListByYm(targetYm);
        if (seq !== fetchSeqRef.current) return;
        setRows(res.data ?? []);
      } catch (e) {
        if (seq === fetchSeqRef.current) showToast('목록을 불러오지 못했습니다.', 'error');
      } finally {
        if (seq === fetchSeqRef.current) setLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    fetchList(ym);
    // 월이 바뀌면 태블릿 모드 기준일도 그 월에 맞게 다시 잡는다(현재 월이면 오늘, 아니면 15일).
    const days = daysInMonth(ym);
    setTabletCenterDay(ym === currentYm() ? Math.min(new Date().getDate(), days) : Math.min(15, days));
  }, [ym, fetchList]);

  const handleCellEdited = useCallback(
    (cell) => {
      const field = toDbField(cell.getField());
      const value = cell.getValue();
      const cnt = cell.getRow().getData().cnt;
      updateField(cnt, field, value ?? '').catch(() => {
        showToast('저장에 실패했습니다.', 'error');
        fetchList(ym);
      });
    },
    [fetchList, showToast, ym]
  );
  // DataTable에 생성자 옵션으로 cellEdited를 넘기면 실제 편집 시 호출되지 않는 걸 확인해서
  // (직접 실험으로 검증), onTableReady에서 table.on('cellEdited', ...)으로 직접 구독한다.
  // ref로 감싸는 이유는 테이블이 재생성되지 않아도 항상 최신 클로저를 타게 하기 위함.
  const handleCellEditedRef = useRef(handleCellEdited);
  handleCellEditedRef.current = handleCellEdited;

  const openUploadPicker = useCallback((cnt) => {
    uploadCntRef.current = cnt;
    fileInputRef.current?.click();
  }, []);

  const handleFileChosen = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const cnt = uploadCntRef.current;
      if (!file || !cnt) return;
      try {
        await uploadImage(cnt, file);
        showToast('첨부파일이 등록되었습니다.');
        fetchList(ym);
      } catch (err) {
        showToast('파일 업로드에 실패했습니다.', 'error');
      }
    },
    [fetchList, showToast, ym]
  );

  const handleDeleteSelected = useCallback(async () => {
    const selected = tableRef.current?.getSelectedData() ?? [];
    if (selected.length === 0) {
      showToast('삭제할 행을 선택해주세요.', 'error');
      return;
    }
    if (!window.confirm(`선택한 ${selected.length}건을 삭제하시겠습니까?`)) return;
    try {
      await Promise.all(selected.map((r) => deleteRow(r.cnt)));
      showToast('삭제되었습니다.');
      fetchList(ym);
    } catch (e) {
      showToast('삭제에 실패했습니다.', 'error');
    }
  }, [fetchList, showToast, ym]);

  const handleInsertSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      try {
        await insertRow(insertYm);
        showToast('행이 추가되었습니다.');
        setInsertModalOpen(false);
        setYm(insertYm);
        setYmInput(insertYm);
        // setYm은 insertYm이 현재 조회 중인 월과 같으면(=값이 안 바뀌면) effect가 재실행되지
        // 않아 새로 추가한 행이 화면에 안 보인다 — 그래서 항상 명시적으로 한 번 더 불러온다.
        fetchList(insertYm);
      } catch (e2) {
        showToast('행 추가에 실패했습니다.', 'error');
      }
    },
    [insertYm, showToast, fetchList]
  );

  const handleExportExcel = useCallback(() => {
    if (!rows.length) {
      showToast('내보낼 데이터가 없습니다.', 'error');
      return;
    }
    const days = daysInMonth(ym);
    const sheetData = rows.map((r) => {
      const item = { 항목명: r.dTitle, 항목설명: r.dDesc, 타입: VALUE_TYPE_LABEL[r.valueType] ?? '문자' };
      for (let d = 1; d <= days; d++) item[`${d}일`] = r[`d${pad(d)}`] ?? '';
      item.비고 = r.dBigo;
      return item;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 8 }, ...Array(days).fill({ wch: 6 }), { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, ym);
    XLSX.writeFile(wb, `일상점검일지_${ym}.xlsx`);
  }, [rows, ym, showToast]);

  const dayWindow = useMemo(() => {
    const days = daysInMonth(ym);
    if (!tabletMode) return Array.from({ length: days }, (_, i) => i + 1);
    const start = Math.max(1, tabletCenterDay - 5);
    const end = Math.min(days, tabletCenterDay + 5);
    const list = [];
    for (let d = start; d <= end; d++) list.push(d);
    return list;
  }, [ym, tabletMode, tabletCenterDay]);

  const columns = useMemo(() => {
    const canEdit = permission.canUpdate;
    // 항목 자체(항목명·설명·타입)는 편집 모드에서만 고친다
    const canEditItem = canEdit && editMode;
    const todayCol = ym === currentYm() ? new Date().getDate() : null;
    // 태블릿 모드: 고정 컬럼들 너비를 뺀 나머지를 날짜 수만큼 나눠 화면을 꽉 채운다.
    const FROZEN_WIDTH = (permission.canDelete && editMode ? 52 : 0) + 56 + 260 + 76 + (editMode ? 80 : 0) + 60 + 16;
    const tabletDayWidth = gridWidth
      ? Math.max(90, Math.floor((gridWidth - FROZEN_WIDTH) / dayWindow.length))
      : 90;
    const dayColumns = dayWindow.map((d) => ({
      title: `${d}`,
      field: `d${pad(d)}`,
      width: tabletMode ? tabletDayWidth : 56,
      hozAlign: 'center',
      headerSort: false,
      cssClass: d === todayCol ? 'dc-today-col' : undefined,
      // check 타입은 Tabulator 편집기를 쓰지 않고 클릭 한 번으로 빈값→OK→NG→빈값 순환시킨다
      // (number/text만 editable로 열어서 커서가 있는 입력창이 뜨게 한다).
      editable: (cell) => canEdit && cell.getRow().getData().valueType !== 'check',
      editor: canEdit ? dailyValueEditor : false,
      formatter: dailyValueFormatter,
      cellClick: (e, cell) => {
        if (!canEdit) {
          showToast('수정 권한이 없습니다.', 'error');
          return;
        }
        if (cell.getRow().getData().valueType !== 'check') return;
        const current = cell.getValue();
        const next = current === 'OK' ? 'NG' : current === 'NG' ? '' : 'OK';
        cell.setValue(next);
        const cnt = cell.getRow().getData().cnt;
        updateField(cnt, toDbField(cell.getField()), next).catch(() => {
          showToast('저장에 실패했습니다.', 'error');
          fetchList(ym);
        });
      },
    }));
    const cols = [];
    if (permission.canDelete && editMode) {
      // 40px면 체크박스 옆에 말줄임(…)이 생겨서 조금 넓힌다
      cols.push({ formatter: 'rowSelection', titleFormatter: 'rowSelection', hozAlign: 'center', headerSort: false, width: 52, frozen: true });
    }
    cols.push(
      { title: '순번', formatter: 'rownum', width: 56, frozen: true, headerSort: false, hozAlign: 'center' },
      { title: '항목명', field: 'dTitle', width: 260, resizable: true, frozen: true, headerSort: false, editable: () => canEditItem, editor: canEditItem ? 'input' : false, cssClass: canEditItem ? 'dc-item-editable' : undefined },
      { title: '항목설명', field: 'dDesc', width: 180, resizable: true, frozen: true, headerSort: false, editable: () => canEditItem, editor: canEditItem ? 'input' : false, cssClass: canEditItem ? 'dc-item-editable' : undefined, visible: !tabletMode },
    );
    return [
      ...cols,
      {
        title: '타입',
        field: 'valueType',
        width: 76,
        frozen: true,
        hozAlign: 'center',
        headerSort: false,
        editable: () => canEditItem,
        editor: canEditItem ? 'list' : false,
        editorParams: { values: VALUE_TYPE_LABEL },
        cssClass: canEditItem ? 'dc-item-editable' : undefined,
        formatter: (cell) => {
          const v = cell.getValue() || 'text';
          return `<span class="dc-type-badge dc-type-${v}">${VALUE_TYPE_LABEL[v] ?? '문자'}</span>`;
        },
      },
      {
        title: '첨부',
        field: 'imgUrl',
        width: 80,
        hozAlign: 'center',
        headerSort: false,
        // 파일 올리기는 편집 모드에서만 — 보기('파일' 칸)는 항상
        visible: editMode,
        formatter: () => '<button type="button" class="dc-upload-btn" title="파일 첨부">첨부</button>',
        cellClick: (e, cell) => {
          if (!canEdit) return;
          openUploadPicker(cell.getRow().getData().cnt);
        },
      },
      {
        title: '파일',
        field: 'imgUrl',
        width: 60,
        hozAlign: 'center',
        headerSort: false,
        formatter: (cell) => {
          const v = cell.getValue();
          return v ? `<button type="button" class="dc-file-link" title="첨부파일 보기">${DC_IMAGE_ICON}</button>` : '';
        },
        cellClick: (e, cell) => {
          const v = cell.getValue();
          if (v) setViewerFile(v);
        },
      },
      ...dayColumns,
      { title: '비고', field: 'dBigo', width: 160, editable: () => canEdit, editor: canEdit ? 'input' : false, visible: !tabletMode },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayWindow, tabletMode, editMode, permission.canUpdate, permission.canDelete, openUploadPicker, gridWidth]);

  // 수정 권한이 없을 때의 이중 안전장치 — Tabulator가 생성하는 에디터 DOM을 즉시 제거한다.
  // (1차 방어는 위 컬럼의 editable 콜백 — 이건 만일을 대비한 보조 장치)
  useEffect(() => {
    const allowed = permission.canUpdate;
    if (allowed || permission.loading) return undefined;
    const blockEdit = (e) => {
      const cell = e.target.closest?.('.tabulator-cell');
      if (cell) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('dblclick', blockEdit, true);
    document.addEventListener('keydown', blockEdit, true);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('.tabulator-editing, input.tabulator-editor, textarea.tabulator-editor, .dc-check-editor')) {
            node.remove();
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('dblclick', blockEdit, true);
      document.removeEventListener('keydown', blockEdit, true);
      observer.disconnect();
    };
  }, [permission.canUpdate, permission.loading]);

  const options = useMemo(
    () => ({
      layout: 'fitData',
      pagination: false,
      selectable: true,
      rowHeight: tabletMode ? 60 : 44,
    }),
    [tabletMode]
  );

  if (!permission.loading && !permission.canRead) {
    return (
      <div className="mes-page">
        <div className="mes-card" style={{ padding: 32, textAlign: 'center', color: 'var(--mes-text-faint)' }}>
          <IconLock size={20} style={{ marginBottom: 8 }} />
          <div>이 화면에 대한 조회 권한이 없습니다.</div>
        </div>
      </div>
    );
  }

  const days = daysInMonth(ym);

  return (
    <div className={`mes-page mes-page-fill${tabletMode ? ' dc-tablet-mode' : ''}`}>
      <div className="mes-page-header">
        <div className="mes-page-heading">
          <div className="mes-page-icon">
            <IconClipboardCheck size={20} />
          </div>
          <div>
            <h2 className="mes-page-title">일상점검일지</h2>
            <p className="mes-page-desc">월별 고정 점검 항목에 대해 1~31일 값을 기록·관리합니다.</p>
          </div>
        </div>
      </div>

      <div className="mes-card mes-card-fill">
        <div className="mes-toolbar">
          <input type="month" className="mes-field-inline" value={ymInput} onChange={(e) => setYmInput(e.target.value)} />
          <button
            className="mes-btn mes-btn-secondary"
            onClick={() => {
              setYm(ymInput);
              // ymInput이 현재 ym과 같으면 setYm만으로는 재조회 effect가 안 돌아서 명시적으로 같이 호출한다.
              fetchList(ymInput);
            }}
          >
            <IconSearch size={15} /> 조회
          </button>
          <button
            className={tabletMode ? 'mes-btn mes-btn-primary' : 'mes-btn mes-btn-secondary'}
            onClick={() => {
              const next = !tabletMode;
              setTabletMode(next);
              // 태블릿 모드는 그리드 공간을 최대한 넓혀야 해서 좌측 메뉴도 같이 접는다.
              setSidebarCollapsed(next);
            }}
          >
            <IconDeviceTablet size={15} /> 태블릿 모드
          </button>
          {tabletMode && (
            <div className="dc-day-nav">
              <button
                type="button"
                className="mes-btn mes-btn-ghost"
                disabled={tabletCenterDay <= 1}
                onClick={() => setTabletCenterDay((d) => Math.max(1, d - 1))}
              >
                <IconChevronLeft size={14} />
              </button>
              <span>{dayWindow[0]}일 ~ {dayWindow[dayWindow.length - 1]}일</span>
              <button
                type="button"
                className="mes-btn mes-btn-ghost"
                disabled={tabletCenterDay >= days}
                onClick={() => setTabletCenterDay((d) => Math.min(days, d + 1))}
              >
                <IconChevronRight size={14} />
              </button>
            </div>
          )}
          {canEditItems && (
            <button
              type="button"
              className={editMode ? 'mes-btn mes-btn-primary' : 'mes-btn mes-btn-secondary'}
              aria-pressed={editMode}
              title={editMode ? '편집을 마치고 일반 입력으로 돌아갑니다' : '항목 추가·삭제와 항목명 수정'}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? <><IconCheck size={15} /> 편집 완료</> : <><IconEdit size={15} /> 편집</>}
            </button>
          )}
          {editMode && (
            <>
              <button
                type="button"
                className="mes-btn mes-btn-secondary"
                disabled={!permission.canCreate}
                onClick={() => {
                  setInsertYm(ym);
                  setInsertModalOpen(true);
                }}
              >
                <IconPlus size={15} /> 행추가
              </button>
              <button type="button" className="mes-btn mes-btn-secondary" disabled={!permission.canDelete} onClick={handleDeleteSelected}>
                <IconTrash size={15} /> 행삭제
              </button>
              <span className="dc-edit-hint">항목명·항목설명·타입 클릭해 수정 · 첨부로 파일 올리기</span>
            </>
          )}
          <button className="mes-btn mes-btn-secondary" onClick={handleExportExcel}>
            <IconFileSpreadsheet size={15} /> 엑셀다운로드
          </button>
          <span className="mes-page-desc" style={{ marginLeft: 'auto' }}>
            {loading ? '불러오는 중...' : `${ym} · 총 ${rows.length}건`}
          </span>
        </div>

        <div className="dc-grid-wrap" ref={gridWrapRef}>
          <DataTable
            data={rows}
            columns={columns}
            options={options}
            height="100%"
            onTableReady={(table) => {
              tableRef.current = table;
              table.on('cellEdited', (cell) => handleCellEditedRef.current(cell));
            }}
          />
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFileChosen} />

      {insertModalOpen && (
        <Modal title="행 추가" onClose={() => setInsertModalOpen(false)}>
          <form onSubmit={handleInsertSubmit}>
            <div className="mes-field">
              <label>년-월</label>
              <input type="month" value={insertYm} onChange={(e) => setInsertYm(e.target.value)} required />
            </div>
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setInsertModalOpen(false)}>
                취소
              </button>
              <button type="submit" className="mes-btn mes-btn-primary">
                저장
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewerFile && (
        <Modal title="첨부파일 보기" onClose={() => setViewerFile(null)} xl>
          <iframe title="첨부파일" src={viewImageUrl(viewerFile)} className="dc-viewer-iframe" />
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
