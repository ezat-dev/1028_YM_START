import { useMemo, useState } from 'react';
import './SimpleTable.css';

/**
 * Tabulator를 쓰지 않는 순수 CSS Grid 기반 표.
 *
 * 컬럼 폭: width는 "기준 폭"이다. 화면이 넓으면 모든 컬럼이 width 비율대로 같이 늘어나고
 * (예전처럼 마지막 컬럼 혼자 남는 폭을 다 먹어서 '비고'만 휑하게 넓어지지 않는다),
 * 좁으면 width의 85%까지 줄어든 뒤 그 아래로는 가로 스크롤이 생긴다.
 * No·체크박스처럼 폭이 60px 이하이거나 fixed: true인 컬럼은 늘어나지 않는다.
 *
 * 헤더 행과 모든 바디 행은 같은 폭(100%, 최소 minWidth)을 가지므로 트랙 계산 결과가
 * 항상 같아 컬럼이 어긋나지 않는다.
 *
 * columns: [{ key, title, width, align?, fixed?, sortValue?(row), render?(row, index), onCellClick?(row) }]
 */
export default function SimpleTable({
  columns,
  data,
  rowKey,
  onRowDoubleClick,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  loading = false,
  emptyText = '데이터가 없습니다.',
}) {
  const [sort, setSort] = useState(null);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    return [...data].sort((a, b) => {
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * sort.dir;
      if (av > bv) return 1 * sort.dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort]);

  const { gridTemplate, minWidth } = useMemo(() => {
    const parts = selectable ? ['40px'] : [];
    let min = selectable ? 40 : 0;
    columns.forEach((c) => {
      if (c.fixed || c.width <= 60) {
        parts.push(`${c.width}px`);
        min += c.width;
      } else {
        const shrink = Math.round(c.width * 0.85);
        parts.push(`minmax(${shrink}px, ${c.width}fr)`);
        min += shrink;
      }
    });
    return { gridTemplate: parts.join(' '), minWidth: min };
  }, [columns, selectable]);

  const rowStyle = { gridTemplateColumns: gridTemplate, minWidth };

  const allSelected = selectable && data.length > 0 && data.every((r) => selectedKeys?.has(rowKey(r)));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? new Set() : new Set(data.map(rowKey)));
  };

  const toggleOne = (key) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    onSelectionChange(next);
  };

  const handleSortClick = (col) => {
    if (!col.sortValue) return;
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 1 };
      if (prev.dir === 1) return { key: col.key, dir: -1 };
      return null;
    });
  };

  return (
    <div className="stbl-wrap">
      <div className="stbl-scroll-x">
      <div className="stbl-header-row" style={rowStyle}>
        {selectable && (
          <div className="stbl-cell stbl-check-cell">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="전체 선택" />
          </div>
        )}
        {columns.map((col) => (
          <div
            key={col.key}
            className={`stbl-cell stbl-head-cell${col.sortValue ? ' sortable' : ''}`}
            style={{ justifyContent: alignToJustify(col.align) }}
            onClick={() => handleSortClick(col)}
          >
            <span>{col.title}</span>
            {col.sortValue && (
              <span className={`stbl-sort-arrow${sort?.key === col.key ? ' active' : ''}`}>
                {sort?.key === col.key && sort.dir === -1 ? '▼' : '▲'}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="stbl-body">
        {loading ? (
          <div className="stbl-empty">불러오는 중...</div>
        ) : sorted.length === 0 ? (
          <div className="stbl-empty">{emptyText}</div>
        ) : (
          sorted.map((row, idx) => {
            const key = rowKey(row);
            const selected = !!selectedKeys?.has(key);
            return (
              <div
                key={key}
                className={`stbl-row${selected ? ' selected' : ''}`}
                style={rowStyle}
                onDoubleClick={() => onRowDoubleClick?.(row)}
              >
                {selectable && (
                  <div className="stbl-cell stbl-check-cell" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected} onChange={() => toggleOne(key)} aria-label="행 선택" />
                  </div>
                )}
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className={`stbl-cell${col.onCellClick ? ' clickable' : ''}`}
                    style={{ justifyContent: alignToJustify(col.align) }}
                    onClick={col.onCellClick ? (e) => { e.stopPropagation(); col.onCellClick(row); } : undefined}
                  >
                    {col.render ? col.render(row, idx) : displayValue(row[col.key])}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
      </div>
    </div>
  );
}

// 값이 비어 있으면 빈 칸 대신 흐린 '-' — 빈 칸은 '로딩 중인가?' 하고 헷갈린다
function displayValue(v) {
  if (v === null || v === undefined || v === '') return <span className="stbl-null">-</span>;
  return v;
}

function alignToJustify(align) {
  if (align === 'right') return 'flex-end';
  if (align === 'center') return 'center';
  return 'flex-start';
}
