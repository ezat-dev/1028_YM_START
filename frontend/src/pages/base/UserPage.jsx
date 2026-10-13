import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconPlus, IconSearch, IconUsers, IconUserCheck, IconUserOff, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import Modal from '../../components/ui/Modal';
import Toast from '../../components/ui/Toast';
import { useToast } from '../../hooks/useToast';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { getList, createUser, updateUser, deleteUser } from '../../api/base/userApi';

const EMPTY_FORM = {
  loginId: '',
  password: '',
  userName: '',
  deptName: '',
  phone: '',
  email: '',
  useYn: 'Y',
};

const COLUMNS = [
  { key: 'userName', label: '사용자', sortable: true },
  { key: 'deptName', label: '부서', sortable: true },
  { key: 'phone', label: '연락처', sortable: false, align: 'center' },
  { key: 'email', label: '이메일', sortable: false },
  { key: 'useYn', label: '상태', sortable: true, align: 'center' },
  { key: 'regDt', label: '등록일', sortable: true, align: 'center' },
  { key: 'actions', label: '관리', sortable: false, align: 'center' },
];

function formatDt(v) {
  return v ? String(v).replace('T', ' ').slice(0, 16) : '';
}

export default function UserPage() {
  const [users, setUsers] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const { toast, showToast } = useToast();
  const { visibleCount, onScroll, reset: resetVisible } = useInfiniteScroll();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getList({ page: 1, size: 1000 });
      setUsers(res.data?.content ?? []);
    } catch (e) {
      showToast('사용자 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    if (!keyword.trim()) return users;
    const k = keyword.trim().toLowerCase();
    return users.filter(
      (u) => u.loginId?.toLowerCase().includes(k) || u.userName?.toLowerCase().includes(k)
    );
  }, [users, keyword]);

  const sortedUsers = useMemo(() => {
    if (!sortKey) return filteredUsers;
    const list = [...filteredUsers];
    list.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'ko');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredUsers, sortKey, sortDir]);

  useEffect(() => { resetVisible(); }, [keyword, resetVisible]);

  const pagedUsers = useMemo(() => sortedUsers.slice(0, visibleCount), [sortedUsers, visibleCount]);

  const toggleSort = (col) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
  };

  const openCreate = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({
      loginId: user.loginId ?? '',
      password: '',
      userName: user.userName ?? '',
      deptName: user.deptName ?? '',
      phone: user.phone ?? '',
      email: user.email ?? '',
      useYn: user.useYn ?? 'Y',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`'${user.userName}(${user.loginId})' 사용자를 삭제하시겠습니까?`)) return;
    try {
      await deleteUser(user.userId);
      showToast('삭제되었습니다.');
      fetchUsers();
    } catch (e) {
      showToast(e.response?.data?.message ?? '삭제에 실패했습니다.', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!editingUser && (!form.loginId.trim() || !form.password.trim())) {
      setFormError('아이디와 비밀번호는 필수입니다.');
      return;
    }
    if (!form.userName.trim()) {
      setFormError('이름은 필수입니다.');
      return;
    }
    setSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.userId, form);
        showToast('수정되었습니다.');
      } else {
        await createUser(form);
        showToast('등록되었습니다.');
      }
      setModalOpen(false);
      fetchUsers();
    } catch (e) {
      setFormError(e.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => {
    const active = users.filter((u) => u.useYn === 'Y').length;
    return { total: users.length, active, inactive: users.length - active };
  }, [users]);

  return (
    <div className="mes-page mes-page-fill">
      <div className="mes-page-header">
        <div className="mes-page-heading">
          <div className="mes-page-icon">
            <IconUsers size={20} />
          </div>
          <div>
            <h2 className="mes-page-title">사용자관리</h2>
            <p className="mes-page-desc">시스템에 접속하는 사용자 계정을 등록·관리합니다.</p>
          </div>
        </div>
        <button className="mes-btn mes-btn-primary" onClick={openCreate}>
          <IconPlus size={16} /> 사용자 등록
        </button>
      </div>

      <div className="mes-stat-grid">
        <div className="mes-stat-card">
          <div className="mes-stat-icon" style={{ background: 'var(--mes-accent-soft)', color: 'var(--mes-accent-dark)' }}>
            <IconUsers size={17} />
          </div>
          <div>
            <div className="mes-stat-value">{stats.total}</div>
            <div className="mes-stat-label">전체 사용자</div>
          </div>
        </div>
        <div className="mes-stat-card">
          <div className="mes-stat-icon" style={{ background: 'var(--mes-success-soft)', color: 'var(--mes-success)' }}>
            <IconUserCheck size={17} />
          </div>
          <div>
            <div className="mes-stat-value">{stats.active}</div>
            <div className="mes-stat-label">사용 중</div>
          </div>
        </div>
        <div className="mes-stat-card">
          <div className="mes-stat-icon" style={{ background: 'var(--mes-danger-soft)', color: 'var(--mes-danger)' }}>
            <IconUserOff size={17} />
          </div>
          <div>
            <div className="mes-stat-value">{stats.inactive}</div>
            <div className="mes-stat-label">중지</div>
          </div>
        </div>
      </div>

      <div className="mes-card mes-card-fill">
        <div className="mes-toolbar">
          <div className="mes-search">
            <IconSearch size={15} />
            <input
              placeholder="아이디 또는 이름 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <span className="mes-page-desc">{loading ? '불러오는 중...' : `총 ${filteredUsers.length}명`}</span>
        </div>

        <div className="mes-table-scroll" onScroll={onScroll}>
          <table className="mes-plain-table mes-table-fixed">
            <colgroup>
              {/* 한 칸이 남는 폭을 독차지하지 않도록 비율로 고르게 나눈다 (합 100%) */}
              <col style={{ width: '18%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={col.sortable ? 'sortable' : undefined}
                    style={col.align ? { textAlign: col.align } : undefined}
                    onClick={() => toggleSort(col)}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="sort-arrow">
                        {sortDir === 'asc' ? <IconArrowUp size={11} /> : <IconArrowDown size={11} />}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedUsers.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="mes-table-empty">데이터가 없습니다.</td></tr>
              )}
              {pagedUsers.map((u) => (
                <tr key={u.userId}>
                  <td>
                    <div className="mes-identity-cell">
                      <div className="mes-avatar">{(u.userName ?? '?').slice(0, 1)}</div>
                      <div className="mes-identity-text">
                        <div className="mes-identity-name">{u.userName}</div>
                        <div className="mes-identity-sub">{u.loginId}</div>
                      </div>
                    </div>
                  </td>
                  <td>{u.deptName}</td>
                  <td style={{ textAlign: 'center' }}>{u.phone}</td>
                  <td className="truncate">{u.email}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`mes-badge ${u.useYn === 'Y' ? 'mes-badge-success' : 'mes-badge-danger'}`}>
                      {u.useYn === 'Y' ? '사용' : '중지'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{formatDt(u.regDt)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div className="mes-row-actions" style={{ justifyContent: 'center' }}>
                      <button className="mes-btn mes-btn-ghost" onClick={() => openEdit(u)}>수정</button>
                      <button className="mes-btn mes-btn-ghost" onClick={() => handleDelete(u)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mes-scroll-status">
          {sortedUsers.length === 0 ? '0명' : `${Math.min(visibleCount, sortedUsers.length)} / 총 ${sortedUsers.length}명 표시 중`}
          {visibleCount < sortedUsers.length && ' · 스크롤하여 더 보기'}
        </div>
      </div>

      {modalOpen && (
        <Modal
          title={editingUser ? '사용자 수정' : '사용자 등록'}
          onClose={() => setModalOpen(false)}
          large
        >
          <form onSubmit={handleSubmit}>
            <div className="mes-form-grid">
              <div className="mes-field">
                <label>아이디</label>
                <input
                  value={form.loginId}
                  disabled={!!editingUser}
                  onChange={(e) => setForm({ ...form, loginId: e.target.value })}
                  placeholder="로그인에 사용할 아이디"
                />
              </div>
              <div className="mes-field">
                <label>비밀번호{editingUser && ' (변경 시에만 입력)'}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingUser ? '변경하지 않으면 비워두세요' : ''}
                />
              </div>
              <div className="mes-field">
                <label>이름</label>
                <input value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>부서</label>
                <input value={form.deptName} onChange={(e) => setForm({ ...form, deptName: e.target.value })} />
              </div>
              <div className="mes-field">
                <label>연락처</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" />
              </div>
              <div className="mes-field">
                <label>이메일</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
              </div>
              <div className="mes-field mes-field-full">
                <label>사용 여부</label>
                <select value={form.useYn} onChange={(e) => setForm({ ...form, useYn: e.target.value })}>
                  <option value="Y">사용</option>
                  <option value="N">중지</option>
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
