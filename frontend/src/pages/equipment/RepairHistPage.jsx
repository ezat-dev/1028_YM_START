import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  IconHammer, IconPlus, IconTrash, IconFileSpreadsheet, IconEdit, IconListDetails, IconCircleCheck, IconInfoCircle,
} from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getList as getEquipmentList } from '../../api/base/equipmentApi';
import { getRepairList, getRepair, createRepair, updateRepair, deleteRepairs } from '../../api/equipment/repairHistApi';
import {
  daysAgo, nextDay, toLocalInput, fmtDt, inputDt, who, won, fmtDur, QUICK,
  FormAudit, AttachEditor, AttachList, ClipCount, applyAttachChanges,
} from './equipHistShared';
import '../../styles/downtime.css';
import '../../styles/equipHist.css';

/*
 * 설비관리 > 수리이력관리 — 고장 발생 → 원인·조치 → 수리 → 복구·시운전 → 비용까지 한 건으로 남긴다.
 *  - 상태가 '완료'면 설비이력관리에 '수리' 이력이 자동 등록(수정하면 같이 고쳐지고, 완료가 아니게 되면 빠진다)
 *  - 교체 부품 여러 줄, 첨부파일 여러 개, 총 수리비 = 부품비 + 외주비
 *  - ?open={repairId} 로 들어오면 그 수리 상세를 바로 연다(설비이력 상세의 '수리이력 열기')
 */

export const REPAIR_STATUSES = [
  { value: '접수', tone: 'st-recv' },
  { value: '진행', tone: 'st-doing' },
  { value: '완료', tone: 'st-done' },
  { value: '보류', tone: 'st-hold' },
  { value: '재수리필요', tone: 'st-redo' },
];
const ST_TONE = Object.fromEntries(REPAIR_STATUSES.map((s) => [s.value, s.tone]));

// 고장 유형 — 열처리 설비에서 자주 나는 것 + 분류
const FAIL_SUGGEST = ['히터 단선', '열전대 이상', '과온 알람', '컨베이어 모터 고장', '인버터 이상', 'PLC 통신 오류', '전기', '기계', '온도', '통신', '기타'];

function Status({ value }) {
  return <span className={`eqh-status is-${ST_TONE[value] ?? 'st-recv'}`}><i />{value}</span>;
}

export default function RepairHistPage() {
  const [equipments, setEquipments] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/equipment/repairHist');
  const [searchParams, setSearchParams] = useSearchParams();

  const [fromSel, setFromSel] = useState(() => daysAgo(89));
  const [toSel, setToSel] = useState(() => daysAgo(0));
  const [equipSel, setEquipSel] = useState('');
  const [kindSel, setKindSel] = useState('');
  const [keywordSel, setKeywordSel] = useState('');
  const [query, setQuery] = useState(() => ({ from: daysAgo(89), to: daysAgo(0), equipId: '', status: '', repairKind: '', keyword: '' }));

  const [detailId, setDetailId] = useState(() => (searchParams.get('open') ? Number(searchParams.get('open')) : null));
  const [form, setForm] = useState(null);

  useEffect(() => {
    getEquipmentList('', '', '')
      .then((res) => setEquipments(res.data ?? []))
      .catch(() => showToast('설비 목록을 불러오지 못했습니다.', 'error'));
    // ?open= 은 한 번 쓰고 지운다(새로고침해도 다시 안 뜨게)
    if (searchParams.get('open')) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchRows = useCallback(() => {
    setLoading(true);
    getRepairList({
      from: `${query.from}T00:00:00`,
      to: `${nextDay(query.to)}T00:00:00`,
      equipId: query.equipId,
      status: query.status,
      repairKind: query.repairKind,
      keyword: query.keyword,
    })
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('수리이력을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleSearch = (over = {}) => {
    const from = over.from ?? fromSel;
    const to = over.to ?? toSel;
    setQuery({
      from: from <= to ? from : to,
      to: from <= to ? to : from,
      equipId: equipSel,
      status: over.status ?? query.status,
      repairKind: kindSel,
      keyword: keywordSel.trim(),
    });
  };
  const applyQuick = (q) => {
    const from = q.from();
    const to = daysAgo(0);
    setFromSel(from);
    setToSel(to);
    handleSearch({ from, to });
  };
  const activeQuick = QUICK.find((q) => q.from() === fromSel && toSel === daysAgo(0))?.key;

  const summary = useMemo(() => {
    const byStatus = Object.fromEntries(REPAIR_STATUSES.map((s) => [s.value, 0]));
    let cost = 0;
    let downSum = 0;
    let downN = 0;
    rows.forEach((r) => {
      if (byStatus[r.status] != null) byStatus[r.status] += 1;
      cost += r.totalCost ?? 0;
      if (r.downMin != null) { downSum += r.downMin; downN += 1; }
    });
    return { byStatus, cost, avgDown: downN ? Math.round(downSum / downN) : null };
  }, [rows]);

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) { showToast('삭제할 수리이력을 선택해주세요.', 'error'); return; }
    const done = rows.filter((r) => selectedKeys.has(r.repairId) && r.status === '완료').length;
    const msg = `선택한 ${selectedKeys.size}건을 삭제하시겠습니까?\n교체 부품·첨부파일도 함께 삭제됩니다.${done ? `\n완료 ${done}건은 설비이력에 등록된 '수리' 이력도 같이 지워집니다.` : ''}`;
    if (!window.confirm(msg)) return;
    try {
      await deleteRepairs(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchRows();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheet = rows.map((r, i) => ({
      No: i + 1, 수리번호: r.repairNo, 고장발생일시: fmtDt(r.failDt), 설비코드: r.equipCode, 설비명: r.equipName,
      고장유형: r.failType, 알람코드: r.alarmCode, 고장증상: r.symptom, 원인: r.cause, 조치: r.action,
      수리담당자: r.repairerName, 수리구분: r.repairKind, 외주업체: r.vendorName,
      수리시작: fmtDt(r.startDt), 수리완료: fmtDt(r.endDt), 복구일시: fmtDt(r.recoverDt), 시운전: r.testResult,
      상태: r.status, '비가동(분)': r.downMin, 부품비: r.partCost, 외주비: r.outsourceCost, 총수리비: r.totalCost,
      등록자: r.regUserName, 등록자ID: r.regUserId, 등록일시: fmtDt(r.regDt),
    }));
    const ws = XLSX.utils.json_to_sheet(sheet);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '수리이력');
    XLSX.writeFile(wb, `수리이력_${query.from}_${query.to}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 46, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'repairNo', title: '수리번호', width: 124, align: 'center', sortValue: (r) => r.repairNo, render: (r) => <span className="eqh-no">{r.repairNo}</span> },
    { key: 'failDt', title: '고장 발생일시', width: 128, align: 'center', sortValue: (r) => r.failDt, render: (r) => <span className="dtm-num">{fmtDt(r.failDt)}</span> },
    { key: 'equipCode', title: '설비코드', width: 76, align: 'center', sortValue: (r) => r.equipCode, render: (r) => <b className="eqh-code">{r.equipCode}</b> },
    { key: 'equipName', title: '설비명', width: 120, sortValue: (r) => r.equipName, render: (r) => <span className="eqh-ellipsis" title={r.equipName}>{r.equipName}</span> },
    { key: 'failType', title: '고장 유형', width: 118, sortValue: (r) => r.failType, render: (r) => <span className="eqh-ellipsis" title={r.failType}><b>{r.failType}</b></span> },
    {
      key: 'symptom', title: '고장 내용', width: 210,
      render: (r) => (
        <span className="eqh-title-cell">
          <span className="eqh-ellipsis eqh-sub" title={r.symptom}>{r.symptom || '-'}</span>
          <ClipCount n={r.attachCount} />
        </span>
      ),
    },
    { key: 'repairerName', title: '수리 담당자', width: 92, align: 'center', sortValue: (r) => r.repairerName, render: (r) => r.repairerName || <span className="dtm-empty">-</span> },
    {
      key: 'repairKind', title: '수리 구분', width: 104, sortValue: (r) => r.repairKind,
      render: (r) => (
        <span className={`eqh-kind${r.repairKind === '외주' ? ' is-out' : ''}`}>
          <span>{r.repairKind}</span>
          {r.repairKind === '외주' && r.vendorName && <small title={r.vendorName}>{r.vendorName}</small>}
        </span>
      ),
    },
    { key: 'status', title: '수리 상태', width: 100, align: 'center', sortValue: (r) => r.status, render: (r) => <Status value={r.status} /> },
    {
      key: 'recoverDt', title: '복구일시', width: 128, align: 'center', sortValue: (r) => r.recoverDt ?? '9999',
      render: (r) => (r.recoverDt ? <span className="dtm-num" title={r.downMin != null ? `고장~복구 ${fmtDur(r.downMin)}` : undefined}>{fmtDt(r.recoverDt)}</span> : <span className="dtm-empty">-</span>),
    },
    { key: 'totalCost', title: '수리 비용', width: 104, align: 'right', sortValue: (r) => r.totalCost, render: (r) => (r.totalCost ? <span className="eqh-cost">{won(r.totalCost)}</span> : <span className="dtm-empty">-</span>) },
    {
      key: 'detail', title: '상세', width: 64, align: 'center', fixed: true,
      render: (r) => <button type="button" className="eqh-detail-btn" onClick={() => setDetailId(r.repairId)} aria-label={`${r.repairNo} 상세`}><IconListDetails size={15} /></button>,
    },
  ], []);

  return (
    <div className="mes-page dtm-page eqh-page mes-page-fill">
      <div className="dtm-header-card">
        <div className="dtm-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon"><IconHammer size={20} /></div>
            <div>
              <h2 className="mes-page-title">수리이력관리</h2>
              <p className="mes-page-desc">고장 발생부터 원인·조치·복구·비용까지 기록합니다. 완료된 수리는 설비이력관리에 &lsquo;수리&rsquo; 이력으로 자동 등록됩니다. 행을 더블클릭하면 상세를 봅니다.</p>
            </div>
          </div>
          <div className="dtm-header-right">
            <button type="button" className="mes-btn mes-btn-primary" disabled={!permission.canCreate} title={!permission.canCreate ? '등록 권한이 없습니다' : undefined} onClick={() => setForm({ editing: null })}>
              <IconPlus size={15} /> 수리 등록
            </button>
          </div>
        </div>

        <div className="dtm-header-sep" />

        <div className="dtm-header-controls">
          <div className="dtm-quick" role="group" aria-label="기간 빠른 선택">
            {QUICK.map((q) => (
              <button key={q.key} type="button" className={activeQuick === q.key ? 'is-on' : ''} onClick={() => applyQuick(q)}>{q.label}</button>
            ))}
          </div>
          <div className="dtm-dates">
            <input type="date" className="mes-field-inline" value={fromSel} max={toSel} onChange={(e) => setFromSel(e.target.value)} aria-label="시작일" />
            <span aria-hidden="true">~</span>
            <input type="date" className="mes-field-inline" value={toSel} min={fromSel} onChange={(e) => setToSel(e.target.value)} aria-label="종료일" />
          </div>
          <select className="mes-field-inline" value={equipSel} onChange={(e) => setEquipSel(e.target.value)} aria-label="설비">
            <option value="">전체 설비</option>
            {equipments.map((e) => <option key={e.equipId} value={e.equipId}>{e.equipCode} {e.equipName}</option>)}
          </select>
          <select className="mes-field-inline" value={kindSel} onChange={(e) => setKindSel(e.target.value)} aria-label="수리 구분">
            <option value="">자체 + 외주</option>
            <option value="자체">자체</option>
            <option value="외주">외주</option>
          </select>
          <input
            className="mes-field-inline dtm-keyword"
            placeholder="번호·고장·알람·담당자·업체"
            value={keywordSel}
            onChange={(e) => setKeywordSel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button type="button" className="mes-btn mes-btn-secondary" onClick={() => handleSearch()}>조회</button>
          <div className="dtm-header-spacer" />
          {permission.canDelete && (
            <button type="button" className="mes-btn mes-btn-danger" onClick={handleDeleteSelected}>
              <IconTrash size={15} /> 선택 삭제
            </button>
          )}
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleExportExcel} disabled={rows.length === 0}>
            <IconFileSpreadsheet size={15} /> 엑셀
          </button>
        </div>

        {/* 상태 칩(누르면 그 상태만) + 비용·복구시간 요약 */}
        <div className="eqh-chips" role="group" aria-label="수리 상태">
          <button type="button" className={`eqh-chip${!query.status ? ' is-on' : ''}`} onClick={() => handleSearch({ status: '' })}>
            전체 <b>{query.status ? '' : rows.length}</b>
          </button>
          {REPAIR_STATUSES.map((s) => (
            <button key={s.value} type="button" className={`eqh-chip is-${s.tone}${query.status === s.value ? ' is-on' : ''}`} onClick={() => handleSearch({ status: query.status === s.value ? '' : s.value })}>
              <i />{s.value} {!query.status && <b>{summary.byStatus[s.value]}</b>}
            </button>
          ))}
          <span className="eqh-chips-sep" aria-hidden="true" />
          <span className="eqh-chips-stat">총 수리비<b>{won(summary.cost)}</b></span>
          <span className="eqh-chips-stat">평균 고장~복구<b>{fmtDur(summary.avgDown)}</b></span>
        </div>
      </div>

      <div className="mes-card mes-card-fill dtm-table-card">
        <div className="dtm-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.repairId}
            onRowDoubleClick={(r) => setDetailId(r.repairId)}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="조회 기간에 등록된 수리이력이 없습니다."
          />
        </div>
      </div>

      {detailId != null && (
        <RepairDetail
          repairId={detailId}
          permission={permission}
          onClose={() => setDetailId(null)}
          onEdit={(row) => { setDetailId(null); setForm({ editing: row }); }}
          onDeleted={() => { setDetailId(null); showToast('삭제되었습니다.'); fetchRows(); }}
          showToast={showToast}
        />
      )}

      {form && (
        <RepairForm
          editing={form.editing}
          equipments={equipments}
          user={user}
          onClose={() => setForm(null)}
          onSaved={(msg, id) => { setForm(null); showToast(msg); fetchRows(); if (id) setDetailId(id); }}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}

/* ───────────────────────── 상세 ───────────────────────── */

function Flow({ label, v }) {
  return <div><span>{label}</span><b className={v ? '' : 'is-none'}>{v ? fmtDt(v) : '-'}</b></div>;
}

function RepairDetail({ repairId, permission, onClose, onEdit, onDeleted, showToast }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getRepair(repairId)
      .then((res) => setR(res.data))
      .catch((err) => setError(err.response?.data?.message ?? '상세를 불러오지 못했습니다.'));
  }, [repairId]);

  const remove = async () => {
    const extra = r.status === '완료' ? "\n설비이력에 등록된 '수리' 이력도 같이 지워집니다." : '';
    if (!window.confirm(`${r.repairNo} 수리이력을 삭제하시겠습니까?\n교체 부품·첨부파일도 함께 삭제됩니다.${extra}`)) return;
    try {
      await deleteRepairs([r.repairId]);
      onDeleted();
    } catch (err) {
      showToast(err.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  return (
    <Modal title={r ? `수리이력 상세 — ${r.repairNo}` : '수리이력 상세'} onClose={onClose} large className="eqh-modal eqh-modal-wide">
      {!r ? (
        <div className="eqh-detail-loading">{error || '불러오는 중…'}</div>
      ) : (
        <div className="eqh-detail">
          <div className="eqh-detail-head">
            <Status value={r.status} />
            <h4>[{r.failType}] {r.symptom || '고장 내용 없음'}</h4>
          </div>
          {r.status === '완료' && (
            <div className="eqh-note"><IconCircleCheck size={15} /> 설비이력관리에 &lsquo;수리&rsquo; 이력으로 등록되어 있습니다.</div>
          )}

          <dl className="eqh-dl is-3">
            <div><dt>설비</dt><dd><b>{r.equipCode}</b> {r.equipName}</dd></div>
            <div><dt>고장 유형</dt><dd>{r.failType}</dd></div>
            <div><dt>알람 코드</dt><dd>{r.alarmCode || '-'}</dd></div>
            <div><dt>수리 담당자</dt><dd>{r.repairerName || '-'}</dd></div>
            <div><dt>수리 구분</dt><dd>{r.repairKind}{r.repairKind === '외주' && r.vendorName && <small>{r.vendorName}</small>}</dd></div>
            <div><dt>시운전</dt><dd>{r.testResult || '미실시'}</dd></div>
          </dl>

          <section className="eqh-sec">
            <h5>진행 시간</h5>
            <div className="eqh-flow">
              <Flow label="고장 발생" v={r.failDt} />
              <Flow label="수리 시작" v={r.startDt} />
              <Flow label="수리 완료" v={r.endDt} />
              <Flow label="정상 복구" v={r.recoverDt} />
            </div>
            <div className="eqh-flow-sum">
              <span>고장~복구 <b>{fmtDur(r.downMin)}</b></span>
              <span>수리 작업 <b>{fmtDur(r.workMin)}</b></span>
            </div>
          </section>

          <div className="eqh-detail-cols">
            <section className="eqh-sec">
              <h5>원인 분석</h5>
              {r.cause ? <p className="eqh-pre">{r.cause}</p> : <p className="eqh-detail-empty">입력된 내용이 없습니다.</p>}
            </section>
            <section className="eqh-sec">
              <h5>조치 내용</h5>
              {r.action ? <p className="eqh-pre">{r.action}</p> : <p className="eqh-detail-empty">입력된 내용이 없습니다.</p>}
            </section>
          </div>

          <section className="eqh-sec">
            <h5>교체 부품 <small>{r.parts?.length ?? 0}</small></h5>
            {r.parts?.length ? (
              <table className="eqh-parts-view">
                <thead><tr><th style={{ width: 40 }}>#</th><th>부품명</th><th>품번</th><th className="is-num" style={{ width: 80 }}>수량</th></tr></thead>
                <tbody>
                  {r.parts.map((p, i) => (
                    <tr key={p.partId}><td>{i + 1}</td><td>{p.partName}</td><td>{p.partNo || '-'}</td><td className="is-num">{Number(p.qty)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="eqh-detail-empty">교체한 부품이 없습니다.</p>}
          </section>

          <section className="eqh-sec">
            <h5>비용</h5>
            <div className="eqh-costs">
              <span>부품비<b>{won(r.partCost)}</b></span>
              <span>외주비<b>{won(r.outsourceCost)}</b></span>
              <span className="is-total">총 수리비<b>{won(r.totalCost)}</b></span>
            </div>
          </section>

          <section className="eqh-sec">
            <h5>첨부파일 <small>{r.attachments?.length ?? 0}</small></h5>
            <AttachList items={r.attachments} />
          </section>

          <dl className="eqh-dl">
            <div><dt>등록</dt><dd>{who(r.regUserName, r.regUserId) || '-'} · {fmtDt(r.regDt)}</dd></div>
            <div><dt>마지막 수정</dt><dd>{r.updUserName || r.updUserId ? `${who(r.updUserName, r.updUserId)} · ${fmtDt(r.updDt)}` : '-'}</dd></div>
          </dl>
        </div>
      )}
      <div className="mes-modal-footer">
        {r && permission.canDelete && (
          <button type="button" className="mes-btn mes-btn-danger eqh-footer-left" onClick={remove}><IconTrash size={15} /> 삭제</button>
        )}
        <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>닫기</button>
        {r && permission.canUpdate && (
          <button type="button" className="mes-btn mes-btn-primary" onClick={() => onEdit(r)}><IconEdit size={15} /> 수정</button>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────────── 등록 / 수정 ───────────────────────── */

const toNum = (s) => {
  const n = Number(String(s ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const commas = (n) => (n ? Number(n).toLocaleString('ko-KR') : '');

function RepairForm({ editing, equipments, user, onClose, onSaved }) {
  const now = new Date();
  now.setSeconds(0, 0);
  const e0 = editing ?? {};
  const [f, setF] = useState(() => ({
    equipId: editing ? String(e0.equipId) : '',
    failDt: editing ? inputDt(e0.failDt) : toLocalInput(now),
    failType: e0.failType ?? '',
    alarmCode: e0.alarmCode ?? '',
    symptom: e0.symptom ?? '',
    cause: e0.cause ?? '',
    action: e0.action ?? '',
    repairerName: e0.repairerName ?? user?.userName ?? '',
    repairKind: e0.repairKind ?? '자체',
    vendorName: e0.vendorName ?? '',
    startDt: inputDt(e0.startDt),
    endDt: inputDt(e0.endDt),
    recoverDt: inputDt(e0.recoverDt),
    testResult: e0.testResult ?? '',
    status: e0.status ?? '접수',
    partCost: e0.partCost ?? 0,
    outsourceCost: e0.outsourceCost ?? 0,
  }));
  const [parts, setParts] = useState(() => (e0.parts?.length ? e0.parts.map((p) => ({ partName: p.partName, partNo: p.partNo ?? '', qty: String(Number(p.qty)) })) : []));
  const [attach, setAttach] = useState(() => ({ saved: e0.attachments ?? [], removed: new Set(), pending: [] }));
  const [attachMsg, setAttachMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setVal = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const equipOptions = equipments.filter((e) => e.useYn === 'Y' || e.equipId === editing?.equipId);
  const total = toNum(f.partCost) + (f.repairKind === '외주' ? toNum(f.outsourceCost) : 0);
  const nowInput = () => { const d = new Date(); d.setSeconds(0, 0); return toLocalInput(d); };

  const setPart = (i, k, v) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.equipId) { setError('설비를 선택하세요.'); return; }
    if (!f.failDt) { setError('고장 발생일시를 입력하세요.'); return; }
    if (!f.failType.trim()) { setError('고장 유형을 입력하세요.'); return; }
    if (f.startDt && f.startDt < f.failDt) { setError('수리 시작일시는 고장 발생일시 이후여야 합니다.'); return; }
    if (f.startDt && f.endDt && f.endDt < f.startDt) { setError('수리 완료일시는 수리 시작일시 이후여야 합니다.'); return; }
    if (f.recoverDt && f.recoverDt < f.failDt) { setError('복구일시는 고장 발생일시 이후여야 합니다.'); return; }
    if (f.status === '완료' && !f.endDt && !f.recoverDt) { setError('완료로 저장하려면 수리 완료일시나 복구일시를 입력하세요.'); return; }
    const badQty = parts.find((p) => p.partName.trim() && !(Number(p.qty) > 0));
    if (badQty) { setError(`부품 수량을 확인하세요. (${badQty.partName.trim()})`); return; }

    const body = {
      ...f,
      equipId: Number(f.equipId),
      failType: f.failType.trim(),
      startDt: f.startDt || null,
      endDt: f.endDt || null,
      recoverDt: f.recoverDt || null,
      vendorName: f.repairKind === '외주' ? f.vendorName.trim() : '',
      partCost: toNum(f.partCost),
      outsourceCost: f.repairKind === '외주' ? toNum(f.outsourceCost) : 0,
      parts: parts.filter((p) => p.partName.trim()).map((p) => ({ partName: p.partName.trim(), partNo: p.partNo.trim(), qty: Number(p.qty) })),
    };
    setSaving(true);
    let id = editing?.repairId;
    try {
      if (editing) {
        await updateRepair(id, { ...body, updUserId: user?.loginId ?? '', updUserName: user?.userName ?? '' });
      } else {
        const res = await createRepair({ ...body, regUserId: user?.loginId ?? '', regUserName: user?.userName ?? '' });
        id = res.data.repairId;
      }
    } catch (err) {
      setError(err.response?.data?.message ?? '저장에 실패했습니다.');
      setSaving(false);
      return;
    }
    const linkMsg = f.status === '완료' ? ' 설비이력에도 반영했습니다.' : '';
    try {
      await applyAttachChanges('REPAIR', id, attach, user);
      onSaved(`${editing ? '수정' : '등록'}되었습니다.${linkMsg}`, id);
    } catch (err) {
      onSaved(`수리이력은 저장했지만 첨부파일 처리에 실패했습니다: ${err.response?.data?.message ?? '네트워크 오류'}`, id);
    }
  };

  return (
    <Modal title={editing ? `수리이력 수정 — ${editing.repairNo}` : '수리 등록'} onClose={onClose} large className="eqh-modal eqh-modal-wide">
      <form onSubmit={submit} className="dtm-form">
        {/* 기본 */}
        <fieldset className="eqh-fs">
          <legend>기본 정보</legend>
          <div className="eqh-grid-2">
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-equip">설비 *</label>
              <select id="rp-equip" className="dtm-input" value={f.equipId} onChange={set('equipId')}>
                <option value="">설비를 선택하세요</option>
                {equipOptions.map((e) => <option key={e.equipId} value={e.equipId}>{e.equipCode} · {e.equipName}</option>)}
              </select>
            </div>
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-fail-dt">고장 발생일시 *</label>
              <input id="rp-fail-dt" type="datetime-local" className="dtm-input" value={f.failDt} onChange={set('failDt')} />
            </div>
          </div>
          <div className="dtm-form-row">
            <div className="dtm-form-label">수리 상태 *</div>
            <div className="eqh-pick" role="radiogroup" aria-label="수리 상태">
              {REPAIR_STATUSES.map((s) => (
                <button key={s.value} type="button" role="radio" aria-checked={f.status === s.value} className={`eqh-pick-opt is-${s.tone}${f.status === s.value ? ' is-on' : ''}`} onClick={() => setVal('status', s.value)}>
                  <i />{s.value}
                </button>
              ))}
            </div>
            {f.status === '완료' && (
              <div className="eqh-note"><IconInfoCircle size={15} /> 완료로 저장하면 설비이력관리에 &lsquo;수리&rsquo; 이력이 자동 등록됩니다.</div>
            )}
            {editing?.status === '완료' && f.status !== '완료' && (
              <div className="eqh-note is-warn"><IconInfoCircle size={15} /> 완료가 아니게 저장하면 설비이력의 &lsquo;수리&rsquo; 이력은 빠집니다.</div>
            )}
          </div>
        </fieldset>

        {/* 고장 */}
        <fieldset className="eqh-fs">
          <legend>고장 정보</legend>
          <div className="eqh-grid-2">
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-fail-type">고장 유형 *</label>
              <input id="rp-fail-type" className="dtm-input" value={f.failType} maxLength={50} onChange={set('failType')} placeholder="직접 입력하거나 아래에서 고르세요" />
              <div className="eqh-suggest">
                {FAIL_SUGGEST.map((s) => (
                  <button key={s} type="button" className={f.failType === s ? 'is-on' : ''} onClick={() => setVal('failType', s)}>{s}</button>
                ))}
              </div>
            </div>
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-alarm">알람 코드</label>
              <input id="rp-alarm" className="dtm-input" value={f.alarmCode} maxLength={50} onChange={set('alarmCode')} placeholder="예) AL-HT-03" />
            </div>
          </div>
          <div className="dtm-form-row">
            <label className="dtm-form-label" htmlFor="rp-symptom">고장 증상</label>
            <textarea id="rp-symptom" className="dtm-input" rows={2} maxLength={500} value={f.symptom} onChange={set('symptom')} placeholder="예) 3존 승온 지연, 설정 900℃ 대비 860℃에서 정체" />
          </div>
        </fieldset>

        {/* 조치 */}
        <fieldset className="eqh-fs">
          <legend>원인 · 조치</legend>
          <div className="eqh-grid-2">
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-cause">원인 분석</label>
              <textarea id="rp-cause" className="dtm-input" rows={3} value={f.cause} onChange={set('cause')} />
            </div>
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-action">조치 내용</label>
              <textarea id="rp-action" className="dtm-input" rows={3} value={f.action} onChange={set('action')} />
            </div>
          </div>
          <div className="dtm-form-row">
            <div className="dtm-form-label">교체 부품 <span className="dtm-form-hint">{parts.filter((p) => p.partName.trim()).length}개</span></div>
            <div className="eqh-parts">
              {parts.length > 0 && (
                <div className="eqh-part-row eqh-part-head" aria-hidden="true"><span>#</span><span>부품명</span><span>품번</span><span>수량</span><span /></div>
              )}
              {parts.map((p, i) => (
                <div key={i} className="eqh-part-row">
                  <span>{i + 1}</span>
                  <input className="dtm-input" value={p.partName} maxLength={100} onChange={(e) => setPart(i, 'partName', e.target.value)} placeholder="부품명" aria-label={`${i + 1}번 부품명`} />
                  <input className="dtm-input" value={p.partNo} maxLength={100} onChange={(e) => setPart(i, 'partNo', e.target.value)} placeholder="품번" aria-label={`${i + 1}번 품번`} />
                  <input className="dtm-input" type="number" min="0" step="any" value={p.qty} onChange={(e) => setPart(i, 'qty', e.target.value)} aria-label={`${i + 1}번 수량`} />
                  <button type="button" className="eqh-icon-x" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} aria-label={`${i + 1}번 부품 빼기`}>✕</button>
                </div>
              ))}
              <button type="button" className="eqh-add-row" onClick={() => setParts((ps) => [...ps, { partName: '', partNo: '', qty: '1' }])}>
                <IconPlus size={14} /> 부품 추가
              </button>
            </div>
          </div>
        </fieldset>

        {/* 수리 · 복구 */}
        <fieldset className="eqh-fs">
          <legend>수리 · 복구</legend>
          <div className="eqh-grid-3">
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-repairer">수리 담당자</label>
              <input id="rp-repairer" className="dtm-input" value={f.repairerName} maxLength={50} onChange={set('repairerName')} />
            </div>
            <div className="dtm-form-row">
              <div className="dtm-form-label">수리 구분</div>
              <div className="eqh-pick" role="radiogroup" aria-label="수리 구분">
                {['자체', '외주'].map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={f.repairKind === k} className={`eqh-pick-opt${f.repairKind === k ? ' is-on' : ''}`} onClick={() => setVal('repairKind', k)}>{k}</button>
                ))}
              </div>
            </div>
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-vendor">외주 업체</label>
              <input id="rp-vendor" className="dtm-input" value={f.repairKind === '외주' ? f.vendorName : ''} maxLength={100} disabled={f.repairKind !== '외주'} onChange={set('vendorName')} placeholder={f.repairKind === '외주' ? '업체명' : '자체 수리'} />
            </div>
          </div>
          <div className="eqh-grid-3">
            {[['startDt', '수리 시작'], ['endDt', '수리 완료'], ['recoverDt', '정상 가동 복구']].map(([k, label]) => (
              <div key={k} className="dtm-form-row">
                <label className="dtm-form-label" htmlFor={`rp-${k}`}>
                  {label}
                  <button type="button" className="dtm-form-hint eqh-now-btn" onClick={() => setVal(k, nowInput())}>지금</button>
                </label>
                <input id={`rp-${k}`} type="datetime-local" className="dtm-input" value={f[k]} min={f.failDt} onChange={set(k)} />
              </div>
            ))}
          </div>
          <div className="dtm-form-row">
            <div className="dtm-form-label">시운전 결과</div>
            <div className="eqh-pick" role="radiogroup" aria-label="시운전 결과">
              {[['', '미실시'], ['정상', '정상'], ['이상', '이상']].map(([v, label]) => (
                <button key={label} type="button" role="radio" aria-checked={f.testResult === v} className={`eqh-pick-opt${v === '정상' ? ' is-st-done' : v === '이상' ? ' is-st-redo' : ''}${f.testResult === v ? ' is-on' : ''}`} onClick={() => setVal('testResult', v)}>{label}</button>
              ))}
            </div>
          </div>
        </fieldset>

        {/* 비용 */}
        <fieldset className="eqh-fs">
          <legend>비용</legend>
          <div className="eqh-grid-3">
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-part-cost">부품비</label>
              <div className="eqh-money">
                <input id="rp-part-cost" className="dtm-input" inputMode="numeric" value={commas(toNum(f.partCost))} onChange={(e) => setVal('partCost', toNum(e.target.value))} placeholder="0" />
              </div>
            </div>
            <div className="dtm-form-row">
              <label className="dtm-form-label" htmlFor="rp-out-cost">외주비</label>
              <div className="eqh-money">
                <input id="rp-out-cost" className="dtm-input" inputMode="numeric" disabled={f.repairKind !== '외주'} value={f.repairKind === '외주' ? commas(toNum(f.outsourceCost)) : ''} onChange={(e) => setVal('outsourceCost', toNum(e.target.value))} placeholder={f.repairKind === '외주' ? '0' : '자체 수리'} />
              </div>
            </div>
            <div className="dtm-form-row">
              <div className="dtm-form-label">총 수리비 <span className="dtm-form-hint">자동 계산</span></div>
              <div className="eqh-total"><b>{won(total)}</b></div>
            </div>
          </div>
        </fieldset>

        {/* 첨부 */}
        <fieldset className="eqh-fs">
          <legend>첨부파일<small>고장 사진·알람 화면·견적서·작업보고서 등 여러 개</small></legend>
          <AttachEditor state={attach} setState={setAttach} onError={setAttachMsg} />
          {attachMsg && <p className="dtm-form-empty">{attachMsg}</p>}
        </fieldset>

        <FormAudit editing={editing} user={user} />

        {error && <div className="mes-error" style={{ marginTop: 4 }}>{error}</div>}
        <div className="mes-modal-footer">
          <button type="button" className="mes-btn mes-btn-secondary" onClick={onClose}>취소</button>
          <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : editing ? '저장' : '등록'}</button>
        </div>
      </form>
    </Modal>
  );
}
