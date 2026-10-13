import { useEffect, useRef } from 'react';
import { TabulatorFull as Tabulator } from 'tabulator-tables';

// 하단 페이지 영역이 기본값이면 "Showing 1-7 of 7 rows / Page Size / First Prev" 영어로 나온다
const LANGS = {
  ko: {
    data: { loading: '불러오는 중...', error: '불러오기 실패' },
    pagination: {
      page_size: '표시 개수',
      page_title: '페이지',
      first: '처음', first_title: '첫 페이지',
      last: '끝', last_title: '마지막 페이지',
      prev: '이전', prev_title: '이전 페이지',
      next: '다음', next_title: '다음 페이지',
      all: '전체',
    },
  },
};

// 셀은 가운데 정렬인데 헤더 제목만 왼쪽에 붙어 있으면 칸이 비뚤어 보인다 —
// headerHozAlign을 따로 안 준 컬럼은 셀 정렬을 그대로 따르게 한다(그룹 컬럼 포함).
function alignHeaders(cols) {
  return cols.map((c) => {
    const next = c.columns ? { ...c, columns: alignHeaders(c.columns) } : c;
    return next.hozAlign && !next.headerHozAlign ? { ...next, headerHozAlign: next.hozAlign } : next;
  });
}

function koCounter(pageSize, currentRow, currentPage, totalRows) {
  if (!totalRows) return '0건';
  const last = Math.min(currentRow + pageSize - 1, totalRows);
  return `${currentRow}–${last} / 총 ${totalRows.toLocaleString()}건`;
}

/**
 * tabulator-tables 초기화/해제/데이터 갱신을 감싸는 공용 테이블.
 * UserPage / AuthPage / LoginHistPage가 동일한 패턴으로 재사용한다.
 */
export default function DataTable({ data, columns, options, height = '520px', onTableReady }) {
  const elRef = useRef(null);
  const tableRef = useRef(null);
  const builtRef = useRef(false);

  useEffect(() => {
    builtRef.current = false;
    tableRef.current = new Tabulator(elRef.current, {
      data,
      columns: alignHeaders(columns),
      layout: 'fitColumns',
      height,
      // rowHeight는 고정하지 않는다 — 고정하면 "태그명 + 설명" 같은 두 줄 셀이 아래가 잘린다.
      // 한 줄 행은 셀 패딩(global.css)으로 40px이 된다. 고정 높이가 필요한 화면은 options로 넘긴다.
      placeholder: '데이터가 없습니다.',
      locale: 'ko',
      langs: LANGS,
      pagination: true,
      paginationSize: 10,
      paginationSizeSelector: [10, 20, 50, 100],
      paginationCounter: koCounter,
      ...options,
    });
    tableRef.current.on('tableBuilt', () => {
      builtRef.current = true;
      onTableReady?.(tableRef.current);
    });

    return () => {
      tableRef.current?.destroy();
      tableRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    if (builtRef.current) {
      table.replaceData(data);
    } else {
      table.on('tableBuilt', () => table.replaceData(data));
    }
  }, [data]);

  return (
    <div className="mes-table-wrap">
      <div ref={elRef} />
    </div>
  );
}
