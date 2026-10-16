import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconThermometer, IconPlus, IconTrash, IconFileSpreadsheet, IconBell } from '@tabler/icons-react';
import SimpleTable from '../../components/ui/SimpleTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermission';
import { useAuth } from '../../context/AuthContext';
import { getList, createSensor, updateSensor, deleteSensors } from '../../api/condition/sensorApi';
import SensorDueAlert, { pickDue, isHiddenToday, ALERT_DAYS } from './SensorDueAlert';
import './SensorPage.css';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 4 }, (_, i) => CURRENT_YEAR - 2 + i);
const SENSOR_TYPES = ['열전대', '센서'];

const EMPTY_FORM = { year: CURRENT_YEAR, equipName: '', sensorType: '열전대', zoneName: '', changeDate: '', nextChangeDate: '', remark: '' };

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// 구분별 교체 주기(년) — 열전대는 매년, 센서는 2년
const CYCLE_YEARS = { 열전대: 1, 센서: 2 };
// 존구분 입력 추천
const ZONE_SUGGEST = {
  열전대: ['퀜칭로 1존', '퀜칭로 2존', '퀜칭로 3존', '퀜칭로 4존', '퀜칭로 5존', '템퍼링로 1존', '템퍼링로 2존', '템퍼링로 3존', '템퍼링로 4존', '템퍼링로 5존'],
  센서: ['CP 센서(산소 프로브)', '퀜칭유 온도센서', '퀜칭유 레벨센서', '로내 압력센서'],
};

function addOneYear(dateStr, years = 1) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y + years, m - 1, d);
  if (dt.getMonth() !== m - 1) dt.setDate(0); // 2/29 등 → 평년이면 말일로 보정
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function TypeTag({ value }) {
  return (
    <span className="sen-type-tag">
      <span className={`sen-type-dot ${value === '센서' ? 'sensor' : 'thermocouple'}`} />
      {value}
    </span>
  );
}

function ZoneTag({ value }) {
  if (!value) return <span className="sen-empty">-</span>;
  return (
    <span className="sen-zone-tag">
      <span className="sen-zone-dot" />
      {value}
    </span>
  );
}

function NextDateText({ value }) {
  if (!value) return <span className="sen-empty">-</span>;
  const d = daysUntil(value);
  const cls = d !== null && d < 0 ? 'sen-date-danger' : d !== null && d <= 30 ? 'sen-date-warning' : 'sen-date';
  return <span className={cls}>{value}</span>;
}

function DateText({ value }) {
  return value ? <span className="sen-date">{value}</span> : <span className="sen-empty">-</span>;
}

function MetaText({ value }) {
  return value ? <span className="sen-meta-text" title={value}>{value}</span> : <span className="sen-empty">-</span>;
}

export default function SensorPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const [yearSel, setYearSel] = useState(CURRENT_YEAR);
  const [typeSel, setTypeSel] = useState('');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [sensorType, setSensorType] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const { toast, showToast } = useToast();
  const { user } = useAuth();
  const permission = usePermission('/condition/sensor');

  // 차기교체일자 알림 — 들어올 때 한 번 확인한다(작년 행까지 봐야 2년 주기 센서도 잡힌다)
  const [dueItems, setDueItems] = useState([]);
  const [dueOpen, setDueOpen] = useState(false);
  const loadDue = useCallback((openIfAny) => {
    Promise.all([getList(CURRENT_YEAR - 1), getList(CURRENT_YEAR)])
      .then(([prev, cur]) => {
        const due = pickDue([...(prev.data ?? []), ...(cur.data ?? [])]);
        setDueItems(due);
        if (openIfAny && due.length > 0 && !isHiddenToday()) setDueOpen(true);
      })
      .catch(() => {});
  }, []);
  useEffect(() => { loadDue(true); }, [loadDue]);

  const fetchList = useCallback(() => {
    setLoading(true);
    getList(year, sensorType)
      .then((res) => setRows(res.data ?? []))
      .catch(() => showToast('목록을 불러오지 못했습니다.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, sensorType]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleSearch = () => {
    setYear(yearSel);
    setSensorType(typeSel);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, year: yearSel });
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = useCallback((rowData) => {
    if (!permission.canUpdate) return;
    setEditing(rowData);
    setForm({
      year: rowData.year,
      equipName: rowData.equipName || '',
      sensorType: rowData.sensorType || '열전대',
      zoneName: rowData.zoneName || '',
      changeDate: rowData.changeDate || '',
      nextChangeDate: rowData.nextChangeDate || '',
      remark: rowData.remark || '',
    });
    setFormError('');
    setFormOpen(true);
  }, [permission.canUpdate]);

  // 교체일자를 넣으면 차기교체일자를 구분별 주기(열전대 1년·센서 2년)로 채운다
  const handleChangeDateInput = (value) => {
    setForm((prev) => ({ ...prev, changeDate: value, nextChangeDate: addOneYear(value, CYCLE_YEARS[prev.sensorType] ?? 1) }));
  };
  const setNextAfter = (years) => {
    setForm((prev) => (prev.changeDate ? { ...prev, nextChangeDate: addOneYear(prev.changeDate, years) } : prev));
  };
  // 설비명 추천 — 지금 목록에 있는 설비명
  const equipSuggest = useMemo(() => [...new Set(rows.map((r) => r.equipName).filter(Boolean))].sort(), [rows]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.equipName.trim()) { setFormError('설비명을 입력하세요.'); return; }
    if (!form.zoneName.trim()) { setFormError('존구분(설치위치)을 입력하세요.'); return; }

    const payload = {
      year: form.year,
      equipName: form.equipName.trim(),
      sensorType: form.sensorType,
      zoneName: form.zoneName.trim(),
      changeDate: form.changeDate,
      nextChangeDate: form.nextChangeDate,
      remark: form.remark,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateSensor(editing.id, payload);
        showToast('수정되었습니다.');
      } else {
        await createSensor({ ...payload, regUserName: user?.userName ?? '' });
        showToast('등록되었습니다.');
      }
      setFormOpen(false);
      fetchList();
      loadDue(false);
    } catch (err) {
      setFormError(err.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedKeys.size === 0) {
      showToast('삭제할 행을 선택해주세요.', 'error');
      return;
    }
    if (!window.confirm(`선택한 ${selectedKeys.size}건을 삭제하시겠습니까?`)) return;
    try {
      await deleteSensors(Array.from(selectedKeys));
      showToast('삭제되었습니다.');
      setSelectedKeys(new Set());
      fetchList();
      loadDue(false);
    } catch (err) {
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const handleExportExcel = () => {
    const sheetData = rows.map((r) => ({
      연도: r.year,
      설비명: r.equipName,
      구분: r.sensorType,
      존구분: r.zoneName,
      이전교체일자: r.prevChangeDate || '',
      교체일자: r.changeDate || '',
      차기교체일자: r.nextChangeDate || '',
      등록자: r.regUserName || '',
      비고: r.remark || '',
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${year}년`);
    XLSX.writeFile(wb, `열전대센서관리_${year}.xlsx`);
  };

  const columns = useMemo(() => [
    { key: 'no', title: 'No', width: 50, align: 'center', render: (r, idx) => idx + 1 },
    { key: 'equipName', title: '설비명', width: 150, sortValue: (r) => r.equipName, render: (r) => <span className="sen-equip-name">{r.equipName}</span> },
    { key: 'sensorType', title: '구분', width: 100, align: 'center', sortValue: (r) => r.sensorType, render: (r) => <TypeTag value={r.sensorType} /> },
    { key: 'zoneName', title: '존구분', width: 180, sortValue: (r) => r.zoneName, render: (r) => <ZoneTag value={r.zoneName} /> },
    { key: 'prevChangeDate', title: '이전교체일자', width: 120, align: 'center', render: (r) => <MetaText value={r.prevChangeDate} /> },
    { key: 'changeDate', title: '교체일자', width: 120, align: 'center', sortValue: (r) => r.changeDate, render: (r) => <DateText value={r.changeDate} /> },
    { key: 'nextChangeDate', title: '차기교체일자', width: 130, align: 'center', sortValue: (r) => r.nextChangeDate, render: (r) => <NextDateText value={r.nextChangeDate} /> },
    { key: 'regUserName', title: '등록자', width: 100, align: 'center', render: (r) => <MetaText value={r.regUserName} /> },
    { key: 'remark', title: '비고', width: 260, render: (r) => <MetaText value={r.remark} /> },
  ], []);

  return (
    <div className="mes-page sen-page mes-page-fill">
      <div className="sen-header-card">
        <div className="sen-header-top">
          <div className="mes-page-heading">
            <div className="mes-page-icon sen-page-icon">
              <IconThermometer size={20} />
            </div>
            <div>
              <h2 className="mes-page-title">열전대/센서 관리</h2>
              <p className="mes-page-desc">설비/존(zone)별 열전대·센서 교체이력을 연도 단위로 관리합니다.</p>
            </div>
          </div>
          <div className="sen-header-actions">
            <button
              type="button"
              className={`mes-btn mes-btn-secondary sen-due-btn${dueItems.length ? ' has-due' : ''}`}
              onClick={() => setDueOpen(true)}
              disabled={dueItems.length === 0}
              title={dueItems.length ? `차기교체일자가 ${ALERT_DAYS}일 이내이거나 지난 항목` : '교체 시기가 다가온 항목이 없습니다'}
            >
              <IconBell size={15} /> 교체 알림
              {dueItems.length > 0 && <span className="sen-due-count">{dueItems.length}</span>}
            </button>
            <button
              type="button"
              className="mes-btn mes-btn-primary"
              disabled={!permission.canCreate}
              title={!permission.canCreate ? '등록 권한이 없습니다' : undefined}
              onClick={openCreate}
            >
              <IconPlus size={15} /> 추가
            </button>
          </div>
        </div>

        <div className="sen-header-sep" />

        <div className="sen-header-controls">
          <select className="mes-field-inline" value={yearSel} onChange={(e) => setYearSel(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="mes-field-inline" value={typeSel} onChange={(e) => setTypeSel(e.target.value)}>
            <option value="">전체 구분</option>
            {SENSOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleSearch}>조회</button>
          <span className="sen-doc-count">총 {rows.length}건</span>
          <div className="sen-header-spacer" />
          {permission.canDelete && (
            <button type="button" className="mes-btn mes-btn-danger" onClick={handleDeleteSelected}>
              <IconTrash size={15} /> 선택 삭제
            </button>
          )}
          <button type="button" className="mes-btn mes-btn-secondary" onClick={handleExportExcel}>
            <IconFileSpreadsheet size={15} /> 엑셀
          </button>
        </div>
      </div>

      <div className="mes-card mes-card-fill sen-table-card">
        <div className="sen-table-wrap">
          <SimpleTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.id}
            onRowDoubleClick={openEdit}
            selectable={permission.canDelete}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            loading={loading}
            emptyText="등록된 교체이력이 없습니다."
          />
        </div>
      </div>

      {formOpen && (
        <Modal title={editing ? '열전대/센서 교체이력 수정' : '열전대/센서 교체이력 등록'} onClose={() => setFormOpen(false)} large className="sen-modal">
          <form onSubmit={handleSubmit} className="sen-form">
            <div className="sen-form-grid">
              <div className="mes-field">
                <label htmlFor="sen-year">연도 *</label>
                <select id="sen-year" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}>
                  {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
              </div>
              <div className="mes-field">
                <span className="sen-label">구분 *</span>
                <div className="sen-pick" role="radiogroup" aria-label="구분">
                  {SENSOR_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={form.sensorType === t}
                      className={`sen-pick-opt${form.sensorType === t ? ' is-on' : ''}`}
                      onClick={() => setForm({ ...form, sensorType: t })}
                    >
                      <span className={`sen-type-dot ${t === '센서' ? 'sensor' : 'thermocouple'}`} />{t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mes-field">
                <label htmlFor="sen-equip">설비명 *</label>
                <input id="sen-equip" list="sen-equip-list" value={form.equipName} onChange={(e) => setForm({ ...form, equipName: e.target.value })} placeholder="예) 연속열처리로 1호기" />
                <datalist id="sen-equip-list">{equipSuggest.map((n) => <option key={n} value={n} />)}</datalist>
              </div>
              <div className="mes-field">
                <label htmlFor="sen-zone">존구분(설치위치) *</label>
                <input id="sen-zone" list="sen-zone-list" value={form.zoneName} onChange={(e) => setForm({ ...form, zoneName: e.target.value })} placeholder={form.sensorType === '센서' ? '예) 퀜칭유 온도센서' : '예) 퀜칭로 1존'} />
                <datalist id="sen-zone-list">{(ZONE_SUGGEST[form.sensorType] ?? []).map((z) => <option key={z} value={z} />)}</datalist>
              </div>

              <div className="mes-field">
                <label htmlFor="sen-change">교체일자</label>
                <input id="sen-change" type="date" value={form.changeDate} onChange={(e) => handleChangeDateInput(e.target.value)} />
                {editing && <span className="mes-hint">이전 교체 {editing.prevChangeDate || '없음'}</span>}
              </div>
              <div className="mes-field">
                <label htmlFor="sen-next">
                  차기교체일자
                  <span className="sen-cycle" role="group" aria-label="교체일자 기준으로 채우기">
                    {[1, 2].map((n) => (
                      <button key={n} type="button" disabled={!form.changeDate} onClick={() => setNextAfter(n)}>+{n}년</button>
                    ))}
                  </span>
                </label>
                <input id="sen-next" type="date" value={form.nextChangeDate} onChange={(e) => setForm({ ...form, nextChangeDate: e.target.value })} />
                <span className="mes-hint">교체일자를 넣으면 {form.sensorType === '센서' ? '2년' : '1년'} 뒤로 자동 입력 · 직접 조정 가능</span>
              </div>

              <div className="mes-field sen-field-full">
                <label htmlFor="sen-remark">비고</label>
                <textarea id="sen-remark" rows={3} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="예) K타입 Φ8×600 교체, 보호관 함께 교체" />
              </div>
            </div>
            {formError && <div className="mes-error">{formError}</div>}
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setFormOpen(false)}>취소</button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </Modal>
      )}

      {dueOpen && (
        <SensorDueAlert
          items={dueItems}
          canEdit={permission.canUpdate}
          onPick={(row) => {
            setDueOpen(false);
            if (row.year === CURRENT_YEAR) { openEdit(row); return; }
            // 작년 행(2년 주기 센서 등)이면 올해 교체 행을 새로 만든다 — 작년 기록은 그대로 둔다
            setEditing(null);
            setForm({ ...EMPTY_FORM, year: CURRENT_YEAR, equipName: row.equipName, sensorType: row.sensorType, zoneName: row.zoneName });
            setFormError('');
            setFormOpen(true);
          }}
          onClose={() => setDueOpen(false)}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
