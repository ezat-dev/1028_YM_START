import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconSearch, IconChartLine, IconDatabase } from '@tabler/icons-react';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { getFullList, createTag, updateTag, deleteTag, getSnapshots } from '../../api/monitoring/trendSettingsApi';

const EMPTY_FORM = {
  tagName: '',
  address: '',
  plcId: '',
  colName: '',
  trendName: '',
  equipId: '',
  scale: '',
  enabled: 1,
};

export default function TrendSettingsPage() {
  const [tags, setTags] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFullList();
      setTags(res.data ?? []);
    } catch (e) {
      showToast('트렌드 태그 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await getSnapshots(20);
      setSnapshots(res.data ?? []);
    } catch (e) {
      // 스냅샷 로그는 부가 정보라 실패해도 태그 목록은 그대로 보여준다
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchTags();
    fetchSnapshots();
  }, [fetchTags, fetchSnapshots]);

  const filteredTags = useMemo(() => {
    if (!keyword.trim()) return tags;
    const k = keyword.trim().toLowerCase();
    return tags.filter(
      (t) =>
        t.tagName?.toLowerCase().includes(k) ||
        t.trendName?.toLowerCase().includes(k) ||
        t.equipId?.toLowerCase().includes(k) ||
        t.address?.toLowerCase().includes(k)
    );
  }, [tags, keyword]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (tag) => {
    setEditing(tag);
    setForm({
      tagName: tag.tagName ?? '',
      address: tag.address ?? '',
      plcId: tag.plcId ?? '',
      colName: tag.colName ?? '',
      trendName: tag.trendName ?? '',
      equipId: tag.equipId ?? '',
      scale: tag.scale ?? '',
      enabled: tag.enabled ?? 1,
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleDelete = async (tag) => {
    if (!window.confirm(`'${tag.tagName}' 태그를 삭제하시겠습니까? (스냅샷 컬럼은 데이터 보존을 위해 남습니다)`)) return;
    try {
      await deleteTag(tag.tempId);
      showToast('삭제되었습니다.');
      fetchTags();
    } catch (e) {
      showToast(e.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleToggleEnabled = async (tag) => {
    try {
      await updateTag(tag.tempId, { ...tag, enabled: tag.enabled === 1 ? 0 : 1 });
      fetchTags();
    } catch (e) {
      showToast('상태 변경에 실패했습니다.', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.tagName.trim()) { setFormError('태그 이름은 필수입니다.'); return; }
    if (!form.address.trim()) { setFormError('PLC 주소는 필수입니다.'); return; }
    if (!form.plcId.trim()) { setFormError('PLC ID는 필수입니다.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateTag(editing.tempId, form);
        showToast('수정되었습니다.');
      } else {
        await createTag(form);
        showToast('등록되었습니다.');
      }
      setModalOpen(false);
      fetchTags();
    } catch (e) {
      setFormError(e.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const enabled = tags.filter((t) => t.enabled === 1).length;
    const equipCount = new Set(tags.map((t) => t.equipId).filter(Boolean)).size;
    return { total: tags.length, enabled, equipCount };
  }, [tags]);

  const columns = useMemo(
    () => [
      {
        title: '태그',
        field: 'tagName',
        minWidth: 200,
        formatter: (cell) => {
          const row = cell.getRow().getData();
          return `<div class="mes-identity-cell">
              <div class="mes-identity-text">
                <div class="mes-identity-name">${row.trendName || row.tagName || ''}</div>
                <div class="mes-identity-sub">${row.tagName ?? ''}</div>
              </div>
            </div>`;
        },
      },
      { title: '설비', field: 'equipId', width: 90, hozAlign: 'center' },
      { title: '주소', field: 'address', width: 90 },
      { title: 'PLC', field: 'plcId', width: 150 },
      { title: '컬럼명', field: 'colName', width: 160 },
      { title: '보정식', field: 'scale', width: 90, hozAlign: 'center' },
      {
        title: '사용',
        field: 'enabled',
        width: 80,
        hozAlign: 'center',
        formatter: (cell) => {
          const on = cell.getValue() === 1;
          return `<span class="mes-badge ${on ? 'mes-badge-success' : 'mes-badge-danger'}" style="cursor:pointer">${on ? 'ON' : 'OFF'}</span>`;
        },
        cellClick: (e, cell) => handleToggleEnabled(cell.getRow().getData()),
      },
      {
        title: '관리',
        field: 'tempId',
        width: 120,
        hozAlign: 'center',
        headerSort: false,
        formatter: () =>
          '<div class="mes-row-actions"><button class="mes-btn mes-btn-ghost tbl-edit">수정</button><button class="mes-btn mes-btn-ghost tbl-delete">삭제</button></div>',
        cellClick: (e, cell) => {
          const btn = e.target.closest('button');
          if (!btn) return;
          const row = cell.getRow().getData();
          if (btn.classList.contains('tbl-edit')) openEdit(row);
          if (btn.classList.contains('tbl-delete')) handleDelete(row);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const snapshotCols = snapshots.length
    ? Object.keys(snapshots[0]).filter((k) => k !== 'snapshot_id').slice(0, 8)
    : [];

  return (
    <div className="mes-page">
      <div className="mes-page-header">
        <div className="mes-page-heading">
          <div className="mes-page-icon">
            <IconChartLine size={20} />
          </div>
          <div>
            <h2 className="mes-page-title">트렌드 설정</h2>
            <p className="mes-page-desc">TREND 차트에 표시할 온도 태그 등록·관리 (ez_scada.tb_temp_tag 실데이터)</p>
          </div>
        </div>
        <button className="mes-btn mes-btn-primary" onClick={openCreate}>
          <IconPlus size={16} /> 태그 등록
        </button>
      </div>

      <div className="mes-stat-grid">
        <div className="mes-stat-card">
          <div className="mes-stat-icon" style={{ background: 'var(--mes-accent-soft)', color: 'var(--mes-accent-dark)' }}>
            <IconChartLine size={17} />
          </div>
          <div>
            <div className="mes-stat-value">{stats.total}</div>
            <div className="mes-stat-label">전체 태그</div>
          </div>
        </div>
        <div className="mes-stat-card">
          <div className="mes-stat-icon" style={{ background: 'var(--mes-success-soft)', color: 'var(--mes-success)' }}>
            <IconChartLine size={17} />
          </div>
          <div>
            <div className="mes-stat-value">{stats.enabled}</div>
            <div className="mes-stat-label">사용 중</div>
          </div>
        </div>
        <div className="mes-stat-card">
          <div className="mes-stat-icon" style={{ background: 'var(--mes-accent-soft)', color: 'var(--mes-accent-dark)' }}>
            <IconDatabase size={17} />
          </div>
          <div>
            <div className="mes-stat-value">{stats.equipCount}</div>
            <div className="mes-stat-label">설비 수</div>
          </div>
        </div>
      </div>

      <div className="mes-card">
        <div className="mes-toolbar">
          <div className="mes-search">
            <IconSearch size={15} />
            <input
              placeholder="태그명·설비·주소 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <span className="mes-page-desc">{loading ? '불러오는 중...' : `총 ${filteredTags.length}개`}</span>
        </div>
        <DataTable data={filteredTags} columns={columns} height="480px" />
      </div>

      {snapshots.length > 0 && (
        <div className="mes-card" style={{ marginTop: 16 }}>
          <div className="mes-page-desc" style={{ marginBottom: 8, fontWeight: 600 }}>
            최근 스냅샷 로그 (실시간 폴링 값, 최근 {snapshots.length}건)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="mes-plain-table">
              <thead>
                <tr>
                  <th>시각</th>
                  {snapshotCols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.slice(0, 10).map((row) => (
                  <tr key={row.snapshot_id}>
                    <td>{String(row.record_time ?? '').replace('T', ' ').slice(0, 19)}</td>
                    {snapshotCols.map((c) => (
                      <td key={c}>{row[c] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? '태그 수정' : '태그 등록'} onClose={() => setModalOpen(false)} large>
          <form onSubmit={handleSubmit}>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>태그 이름 *</label>
                <input value={form.tagName} onChange={(e) => setForm({ ...form, tagName: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>트렌드 표시명</label>
                <input value={form.trendName} onChange={(e) => setForm({ ...form, trendName: e.target.value })} placeholder="예) 침탄_PV_1" />
              </div>
              <div className="mes-field">
                <label>PLC 주소 *</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="예) D0" />
              </div>
              <div className="mes-field">
                <label>PLC ID *</label>
                <input value={form.plcId} onChange={(e) => setForm({ ...form, plcId: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>설비</label>
                <input value={form.equipId} onChange={(e) => setForm({ ...form, equipId: e.target.value })} placeholder="예) MBF1" />
              </div>
              <div className="mes-field">
                <label>컬럼명 (비워두면 자동 생성)</label>
                <input value={form.colName} onChange={(e) => setForm({ ...form, colName: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>보정식</label>
                <input value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })} placeholder="+50 / -100 / *0.01 / /2" />
              </div>
              <div className="mes-field">
                <label>사용 여부</label>
                <select value={form.enabled} onChange={(e) => setForm({ ...form, enabled: Number(e.target.value) })}>
                  <option value={1}>사용</option>
                  <option value={0}>중지</option>
                </select>
              </div>
            </div>
            {formError && <div className="mes-error" style={{ marginTop: 4 }}>{formError}</div>}
            <div className="mes-modal-footer">
              <button type="button" className="mes-btn mes-btn-secondary" onClick={() => setModalOpen(false)}>
                취소
              </button>
              <button type="submit" className="mes-btn mes-btn-primary" disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <Toast toast={toast} />
    </div>
  );
}
