// ============================================================================
// tags.js — "PLC 태그 관리" 화면 로직
// ============================================================================
// 서버(같은 오리진, 5050)의 /api/admin/* CRUD + 엑셀 API만 호출한다. 값 읽기/쓰기(/api/foldertag/*)는
// 이 화면의 책임이 아니다 — 여기는 태그 "정의"(이름/주소/PLC)만 관리한다.
// ============================================================================

// ── 공용: fetch 래퍼(JSON) + 업로드 래퍼(FormData) + 토스트 ────────────────────
async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(url, opt);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '알 수 없는 오류');
  return json;
}

// FormData는 브라우저가 boundary를 직접 채워야 하므로 Content-Type을 절대 수동 지정하지 않는다.
async function uploadFile(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || '업로드 실패');
  return json;
}

let toastTimer = null;
function showToast(message, type) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast' + (type ? ' is-' + type : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }
document.querySelectorAll('[data-close-modal]').forEach(btn =>
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));

function showImportResult({ inserted, updated, errors }) {
  const box = document.getElementById('importResultBody');
  box.innerHTML = `
    <div class="ir-summary">
      <div class="ir-stat"><b>${inserted}</b>신규 등록</div>
      <div class="ir-stat"><b>${updated}</b>수정됨</div>
      <div class="ir-stat"><b>${errors.length}</b>실패</div>
    </div>
    ${errors.length ? `<div class="ir-errors">${errors.map(e => `<div>${escapeHtml(e)}</div>`).join('')}</div>` : ''}`;
  openModal('importResultBackdrop');
}

// 복제 시 이름/주소 끝 숫자를 +1 한다. 문자열 어디에 있든 "마지막 숫자 덩어리"를 찾아 늘리고
// 자리수(0채움)는 유지한다 — 예: "name_241"→"name_242", "No.1 Zone"→"No.2 Zone", "D340"→"D341".
// 숫자가 아예 없으면 "_2"를 붙인다. 결과는 항상 저장 전에 사용자가 폼에서 확인/수정할 수 있으므로,
// X04A 같은 16진수 표기 주소처럼 완벽하지 않을 수 있는 경우도 실제 저장 전에 걸러진다.
function incrementTrailingNumber(str) {
  const m = String(str).match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return str + '_2';
  const [, prefix, digits, suffix] = m;
  const next = (BigInt(digits) + 1n).toString().padStart(digits.length, '0');
  return prefix + next + suffix;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function badge(enabled) {
  return `<span class="badge ${enabled ? 'badge-on' : 'badge-off'}">${enabled ? '사용' : '중지'}</span>`;
}

// PLC 관리 탭 전용 인라인 SVG 아이콘 — 오프라인 공장 PC에서도 항상 동일하게 보이도록
// 아이콘 폰트/CDN 없이 마크업에 직접 심어서 쓴다(이모지 대체).
const ICON = {
  edit: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.83l-1.17-1.17a2 2 0 0 0-2.83 0L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg class="icon" viewBox="0 0 24 24"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>',
  alertTriangle: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 4 3 20h18Z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/></svg>',
  checkCircle: '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12.5 9.5 17 19 7"/></svg>',
  bulb: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M8 14.5A5 5 0 1 1 16 14.5c-.8 1-1.5 1.8-1.5 3H9.5c0-1.2-.7-2-1.5-3Z"/></svg>',
  wrench: '<svg class="icon" viewBox="0 0 24 24"><path d="M14.5 6.5a3.5 3.5 0 0 0-4.6 4L4 16.4 7.6 20l5.9-5.9a3.5 3.5 0 0 0 4-4.6l-2.6 2.6-2-2Z"/></svg>',
  copy: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 9h9a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 21H9a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 9 9Z"/><path d="M6 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V6"/></svg>',
  antenna: '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><path d="M12 13.4V19M9.5 19h5"/></svg>',
  folder: '<svg class="icon" viewBox="0 0 24 24"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h4l1.5 2h7A1.5 1.5 0 0 1 19.5 9.5v7A1.5 1.5 0 0 1 18 18H5.5A1.5 1.5 0 0 1 4 16.5v-9Z"/></svg>',
  thermo: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 14.5V5.5a2 2 0 1 0-4 0v9a4 4 0 1 0 4 0Z"/><path d="M10 8h1.5"/></svg>',
  bell: '<svg class="icon" viewBox="0 0 24 24"><path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
  info: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/></svg>'
};

// ── 검색 + 정렬 공용 헬퍼 ───────────────────────────────────────────────────
// searchKeys에 있는 필드들을 한꺼번에 대소문자 무시 부분일치로 검색하고, sort가 있으면 그다음 정렬한다.
function filterAndSort(list, searchTerm, searchKeys, sort) {
  let out = list;
  if (searchTerm) {
    const q = searchTerm.trim().toLowerCase();
    if (q) out = out.filter(item => searchKeys.some(k => String(item[k] ?? '').toLowerCase().includes(q)));
  }
  if (sort && sort.key) {
    out = [...out].sort((a, b) => {
      let av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'string' || typeof bv === 'string') { av = String(av ?? '').toLowerCase(); bv = String(bv ?? '').toLowerCase(); }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }
  return out;
}

// 클릭 한 번으로 정렬 상태 토글 + 화살표 표시. 헤더는 고정(재렌더 안 됨)이라 리스너는 한 번만 붙인다.
function setupSortableHeaders(tableId, sortState, onChange) {
  document.querySelectorAll(`#${tableId} th.sortable`).forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortState.key === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      else { sortState.key = key; sortState.dir = 'asc'; }
      document.querySelectorAll(`#${tableId} th.sortable`).forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      onChange();
    });
  });
}

// 검색창은 입력할 때마다(버튼 없이) 바로 반영 — 타이핑 중 매번 재계산해도 데이터가 로컬 배열이라 부담 없다.
function bindLiveSearch(inputId, onChange) {
  document.getElementById(inputId).addEventListener('input', onChange);
}

// ── 탭 전환 ───────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('is-active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('is-active');
    // "실시간 모니터링" 탭에 처음 들어오거나 다시 들어올 때마다, 다음 주기적 갱신을 기다리지 않고
    // 바로 한 번 최신값을 가져온다(탭을 오래 떠나있었으면 그만큼 화면이 낡아있으므로).
    if (btn.dataset.tab === 'monitor') refreshAllMonitor();
    if (btn.dataset.tab === 'plc') refreshPollStatus();
  });
});

// ── 실시간 모니터링 안의 하위 탭(모니터링/알람/온도) 전환 ───────────────────────
document.querySelectorAll('.subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('is-active'));
    document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.getElementById('sub' + btn.dataset.subtab).classList.add('is-active');
  });
});

// ── PLC 드롭다운(3개 폼 공용) 채우기 ───────────────────────────────────────
async function loadPlcOptions() {
  const { plcs } = await api('GET', '/api/admin/plcs');
  const selects = [document.getElementById('ftPlcSelect'), document.getElementById('ttPlcSelect'), document.getElementById('atPlcSelect'), document.getElementById('stPlcSelect'), document.getElementById('dwPlcSelect')];
  const optionsHtml = '<option value="">PLC 선택...</option>' + plcs.map(p =>
    `<option value="${escapeHtml(p.plcId)}">${escapeHtml(p.plcId)} — ${escapeHtml(p.label)}${p.enabled ? '' : ' (비활성)'}</option>`
  ).join('');
  selects.forEach(sel => { sel.innerHTML = optionsHtml; });
}

// ============================================================================
// 0) PLC 관리 (tb_plc)
// ============================================================================
let plcs = [];
let plcEditId = null; // null=새로 만들기, 문자열이면 그 plcId를 수정 중
let plcSearch = '';
const plcSort = { key: null, dir: 'asc' };
const PLC_DEFAULT_PORT = { LS: 2004, MITSUBISHI: 6004, MODBUS_TCP: 502 };

async function loadPlcs() {
  const { plcs: list } = await api('GET', '/api/admin/plcs');
  plcs = list;
  renderPlcTable();
}

function renderPlcTable() {
  const body = document.getElementById('plcBody');
  const empty = document.getElementById('plcEmpty');
  const view = filterAndSort(plcs, plcSearch, ['plcId', 'label', 'ip'], plcSort);
  document.getElementById('plcCount').textContent = `총 ${view.length}건` + (view.length !== plcs.length ? ` (전체 ${plcs.length}건 중)` : '');
  if (view.length === 0) {
    body.innerHTML = '';
    empty.hidden = false;
    empty.textContent = plcs.length === 0 ? 'PLC가 없습니다. "+ 새 PLC"로 추가하세요.' : '검색 결과가 없습니다.';
    return;
  }
  empty.hidden = true;
  body.innerHTML = view.map(p => `
    <tr>
      <td class="name-col">${escapeHtml(p.plcId)}</td>
      <td>${escapeHtml(p.label)}</td>
      <td><span class="addr">${escapeHtml(p.ip)}</span></td>
      <td>${p.port}</td>
      <td>${escapeHtml(p.plcType)}</td>
      <td>${badge(p.enabled)}</td>
      <td class="row-actions">
        <button class="row-icon-btn" data-act="edit" title="수정">${ICON.edit}</button>
        <button class="row-icon-btn is-danger" data-act="del" title="삭제">${ICON.trash}</button>
      </td>
    </tr>`).join('');
  [...body.children].forEach((tr, i) => {
    const p = view[i];
    tr.querySelector('[data-act=edit]').addEventListener('click', () => openPlcModal(p));
    tr.querySelector('[data-act=del]').addEventListener('click', () => deletePlc(p));
  });
}

function openPlcModal(editing) {
  plcEditId = editing ? editing.plcId : null;
  document.getElementById('plcModalTitle').textContent = editing ? 'PLC 수정' : '새 PLC';
  const idInput = document.getElementById('plcIdInput');
  idInput.value = editing ? editing.plcId : '';
  idInput.disabled = !!editing;
  document.getElementById('plcIdHint').hidden = !!editing;
  document.getElementById('plcLabelInput').value = editing ? editing.label : '';
  document.getElementById('plcIpInput').value = editing ? editing.ip : '';
  document.getElementById('plcTypeSelect').value = editing ? editing.plcType : 'LS';
  document.getElementById('plcPortInput').value = editing ? editing.port : 2004;
  document.getElementById('plcEnabledInput').checked = editing ? !!editing.enabled : true;
  openModal('plcModalBackdrop');
}
document.getElementById('plcAddBtn').addEventListener('click', () => openPlcModal(null));

// 타입을 바꾸면 관례적인 기본 포트로 자동 채워준다 — 수정 모드에서는 기존 포트를 건드리지 않는다.
document.getElementById('plcTypeSelect').addEventListener('change', e => {
  if (plcEditId) return;
  const def = PLC_DEFAULT_PORT[e.target.value];
  if (def) document.getElementById('plcPortInput').value = def;
});

document.getElementById('plcForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    plcId: document.getElementById('plcIdInput').value,
    ip: document.getElementById('plcIpInput').value,
    port: Number(document.getElementById('plcPortInput').value) || 0,
    plcType: document.getElementById('plcTypeSelect').value,
    label: document.getElementById('plcLabelInput').value,
    enabled: document.getElementById('plcEnabledInput').checked
  };
  try {
    if (plcEditId) await api('PUT', `/api/admin/plcs/${encodeURIComponent(plcEditId)}`, body);
    else await api('POST', '/api/admin/plcs', body);
    closeModal('plcModalBackdrop');
    await loadPlcs();
    await loadPlcOptions();
    showToast('저장했습니다', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

// 삭제 전에 이 PLC를 참조하는 태그가 몇 개인지 미리 조회해서 확인창에 보여준다 — folders_tags/tb_temp_tag는
// FK가 없어 삭제해도 조용히 고아 참조로 남고, tb_alarm_tag만 FK(SET NULL)라 자동으로 연결만 끊어진다.
async function deletePlc(p) {
  let warn = `"${p.plcId}" PLC를 삭제할까요?`;
  try {
    const u = await api('GET', `/api/admin/plcs/${encodeURIComponent(p.plcId)}/usage`);
    const total = u.folderTags + u.tempTags + u.alarmTags;
    if (total > 0) {
      warn = `"${p.plcId}"를 쓰는 태그가 모니터링 ${u.folderTags}개 · 온도 ${u.tempTags}개 · 알람 ${u.alarmTags}개 있습니다. ` +
        `삭제하면 이 태그들은 더 이상 값을 읽지 못하게 됩니다(알람 태그는 PLC 연결만 자동으로 비워지고 태그 자체는 남습니다). 정말 삭제할까요?`;
    }
  } catch (e) { /* 사용량 확인 실패해도 삭제 자체는 진행 가능하게 둔다 */ }
  if (!confirm(warn)) return;
  try {
    await api('DELETE', `/api/admin/plcs/${encodeURIComponent(p.plcId)}`);
    await loadPlcs();
    await loadPlcOptions();
    showToast('PLC를 삭제했습니다', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

bindLiveSearch('plcSearch', () => { plcSearch = document.getElementById('plcSearch').value; renderPlcTable(); });

// 폴더 트리(부모/자식) 렌더링 — folders(모니터링 태그)와 tb_alarm_folder(알람) 양쪽에서 공용으로 쓴다.
// items: [{id, name, parentId}], depth 2단계까지만 들여쓰기(그 이상은 같은 폭 유지).
function renderFolderTree(listEl, items, selectedId, handlers, allLabel) {
  listEl.innerHTML = '';
  if (allLabel) {
    const allLi = document.createElement('li');
    allLi.className = 'folder-row is-all' + (selectedId === 'ALL' ? ' is-selected' : '');
    allLi.innerHTML = `<span class="fr-name">${escapeHtml(allLabel)}</span>`;
    allLi.addEventListener('click', () => handlers.onSelect({ id: 'ALL' }));
    listEl.appendChild(allLi);
  }
  const byParent = new Map();
  items.forEach(it => {
    const pid = it.parentId ?? null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(it);
  });
  const seen = new Set(); // 순환 참조 방어(자기참조 등 이상 데이터로 인한 무한루프 방지)
  function renderLevel(parentId, depth) {
    const children = byParent.get(parentId) || [];
    children.forEach(it => {
      if (seen.has(it.id)) return;
      seen.add(it.id);
      const li = document.createElement('li');
      li.className = 'folder-row depth-' + Math.min(depth, 2) + (it.id === selectedId ? ' is-selected' : '');
      li.innerHTML = `<span class="fr-name">${escapeHtml(it.name)}</span>
        <span class="fr-actions">
          <button data-act="rename" title="이름 변경">${ICON.edit}</button>
          <button data-act="delete" title="삭제">${ICON.trash}</button>
        </span>`;
      li.querySelector('.fr-name').addEventListener('click', () => handlers.onSelect(it));
      li.querySelector('[data-act=rename]').addEventListener('click', e => { e.stopPropagation(); handlers.onRename(it); });
      li.querySelector('[data-act=delete]').addEventListener('click', e => { e.stopPropagation(); handlers.onDelete(it); });
      listEl.appendChild(li);
      renderLevel(it.id, depth + 1);
    });
  }
  renderLevel(null, 0);
  if (items.length === 0 && !allLabel) listEl.innerHTML = '<li style="padding:14px;color:var(--text-faint);font-size:12.5px;">폴더가 없습니다</li>';
}

function fillFolderSelect(selectEl, folders, idKey, nameKey, selectedValue) {
  selectEl.innerHTML = '<option value="">폴더 선택...</option>' +
    folders.map(f => `<option value="${f[idKey]}">${escapeHtml(f[nameKey])}</option>`).join('');
  if (selectedValue != null && selectedValue !== 'ALL') selectEl.value = String(selectedValue);
}

// ============================================================================
// 1) 모니터링 태그 (folders / folders_tags)
// ============================================================================
let folders = [];
let selectedFolderId = 'ALL';
let folderTags = [];               // 서버에서 받은 원본
let folderTagEditId = null;        // null=새로 만들기, 숫자면 그 id를 수정 중
let folderTagSearch = '';
const folderTagSort = { key: null, dir: 'asc' };
// 태그가 수천~수만 개일 때 한 번에 다 그리면 DOM 노드가 너무 많아져 브라우저가 버벅인다(실측:
// 12,046건일 때 DOM 요소 27만 개) — 페이지당 100개만 그린다. 실시간 모니터링 표(monFolderXxx)와
// 별개 상태다 — 서로 다른 표라 페이지가 독립적으로 움직여야 한다.
const FOLDER_TAG_PAGE_SIZE = 100;
let folderTagPage = 1;

async function loadFolders() {
  const { folders: list } = await api('GET', '/api/admin/folders');
  folders = list;
  renderFolderTree(document.getElementById('folderList'), folders, selectedFolderId, folderTreeHandlers());
  const sel = document.getElementById('folderParentSelect');
  sel.innerHTML = '<option value="">(최상위)</option>' + folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  // 더블워드/문자열 태그도 같은 folders 테이블을 공유해서 쓴다 — 여기서 폴더가 바뀌면
  // 그쪽 트리/선택창도 같이 갱신.
  if (typeof renderDwFolderTree === 'function') renderDwFolderTree();
  const dwSel = document.getElementById('dwFolderSelect');
  if (dwSel) dwSel.innerHTML = folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  if (typeof renderStringFolderTree === 'function') renderStringFolderTree();
  const stSel = document.getElementById('stFolderSelect');
  if (stSel) stSel.innerHTML = folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
}

async function selectFolder(id) {
  selectedFolderId = id;
  folderTagPage = 1;   // 다른 폴더로 옮기면 이전 폴더에서 보던 페이지 번호가 의미 없어짐
  const f = id === 'ALL' ? null : folders.find(x => x.id === id);
  document.getElementById('folderTagsTitle').innerHTML =
    (id === 'ALL' ? `${ICON.antenna} 전체 모니터링 태그` : `${ICON.folder} ${escapeHtml(f ? f.name : '')}`) + ' <span class="table-tag">folders_tags</span>';
  document.getElementById('docFolderId').textContent = id === 'ALL' ? '4' : id;
  updateFolderTagExportLink();
  renderFolderTree(document.getElementById('folderList'), folders, selectedFolderId, folderTreeHandlers());
  await loadFolderTags();
}
// 폴더 삭제는 DB가 ON DELETE CASCADE라 안의 태그(+하위 폴더)까지 조용히 같이 지워진다(막아주지 않음) —
// 그래서 지우기 전에 반드시 실제 태그 개수를 확인해서 확인창에 숫자로 보여준다.
function folderTreeHandlers() {
  return {
    onSelect: f => selectFolder(f.id),
    onRename: async f => {
      const name = prompt('새 폴더 이름', f.name);
      if (!name || name.trim() === f.name) return;
      try { await api('PUT', `/api/admin/folders/${f.id}`, { name: name.trim(), parentId: f.parentId }); await loadFolders(); showToast('폴더 이름을 변경했습니다', 'success'); }
      catch (e) { showToast(e.message, 'error'); }
    },
    onDelete: async f => {
      let warn = `"${f.name}" 폴더를 삭제할까요?`;
      try {
        const { tags } = await api('GET', `/api/admin/foldertags?folderId=${f.id}`);
        if (tags.length > 0) warn = `"${f.name}" 폴더를 삭제하면 안에 있는 태그 ${tags.length}개도 함께 삭제됩니다(복구 불가). 정말 삭제할까요?`;
      } catch (e) { /* 개수 확인 실패해도 삭제 자체는 계속 진행 가능하게 둔다 */ }
      if (!confirm(warn)) return;
      try {
        await api('DELETE', `/api/admin/folders/${f.id}`);
        if (selectedFolderId === f.id) { selectedFolderId = 'ALL'; }
        await loadFolders();
        await loadFolderTags();
        showToast('폴더를 삭제했습니다', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    }
  };
}

function updateFolderTagExportLink() {
  const qs = selectedFolderId === 'ALL' ? '' : `?folderId=${selectedFolderId}`;
  document.getElementById('folderTagExportBtn').href = '/api/admin/foldertags/export' + qs;
}

async function loadFolderTags() {
  const qs = selectedFolderId === 'ALL' ? '' : `?folderId=${selectedFolderId}`;
  const { tags } = await api('GET', '/api/admin/foldertags' + qs);
  folderTags = tags;
  renderFolderTagTable();
}

function renderFolderTagTable() {
  const body = document.getElementById('folderTagBody');
  const empty = document.getElementById('folderTagEmpty');
  const view = filterAndSort(folderTags, folderTagSearch, ['name', 'address'], folderTagSort);
  document.getElementById('folderTagCount').textContent = `총 ${view.length}건` + (view.length !== folderTags.length ? ` (전체 ${folderTags.length}건 중)` : '');

  const totalPages = Math.max(1, Math.ceil(view.length / FOLDER_TAG_PAGE_SIZE));
  folderTagPage = Math.min(Math.max(1, folderTagPage), totalPages);
  const startIdx = (folderTagPage - 1) * FOLDER_TAG_PAGE_SIZE;
  const pageRows = view.slice(startIdx, startIdx + FOLDER_TAG_PAGE_SIZE);
  updatePagerUI('folder-tag-pager', folderTagPage, totalPages);

  if (view.length === 0) {
    body.innerHTML = '';
    empty.hidden = false;
    empty.textContent = folderTags.length === 0 ? '태그가 없습니다. "+ 새 태그"로 추가하세요.' : '검색 결과가 없습니다.';
    return;
  }
  empty.hidden = true;
  body.innerHTML = pageRows.map(t => `
    <tr>
      <td class="id-col">${t.id}</td>
      <td class="name-col">${escapeHtml(t.name)}</td>
      <td><span class="addr">${escapeHtml(t.address)}</span></td>
      <td class="truncate-col" title="${escapeHtml(t.folderName)}">${escapeHtml(t.folderName)}</td>
      <td class="truncate-col" title="${escapeHtml(t.plcId)}">${escapeHtml(t.plcId)}</td>
      <td>${escapeHtml(t.type)}</td>
      <td>${badge(t.enabled)}</td>
      <td class="row-actions">
        <button class="row-icon-btn" data-act="usage" title="URL 사용법">${ICON.info}</button>
        <button class="row-icon-btn" data-act="edit" title="수정">${ICON.edit}</button>
        <button class="row-icon-btn" data-act="dup" title="복제">${ICON.copy}</button>
        <button class="row-icon-btn is-danger" data-act="del" title="삭제">${ICON.trash}</button>
      </td>
    </tr>`).join('');
  [...body.children].forEach((tr, i) => {
    const t = pageRows[i];
    tr.querySelector('[data-act=usage]').addEventListener('click', () => openTagUsageModal(t));
    tr.querySelector('[data-act=edit]').addEventListener('click', () => openFolderTagModal(t));
    tr.querySelector('[data-act=dup]').addEventListener('click', () => openFolderTagModal(null, t));
    tr.querySelector('[data-act=del]').addEventListener('click', async () => {
      if (!confirm(`"${t.name}" 태그를 삭제할까요?`)) return;
      try { await api('DELETE', `/api/admin/foldertags/${t.id}`); await loadFolderTags(); showToast('태그를 삭제했습니다', 'success'); }
      catch (e) { showToast(e.message, 'error'); }
    });
  });
}

// 태그 행 하나(t: {id,name,address,plcId,folderId,type,...})의 실제 값으로 URL 예시를 채운
// "이 태그, 나중에 어떻게 가져다 쓰나요?" 모달을 연다. origin은 지금 이 화면이 열려 있는
// 바로 그 서버라, 뜬 URL을 그대로 복사해서 테스트하면 맞게 동작한다.
function openTagUsageModal(t) {
  const origin = location.origin;
  const deviceMatch = String(t.address || '').match(/^[A-Za-z]+/);
  const device = deviceMatch ? deviceMatch[0].toUpperCase() : '';
  // 실제 폴링/쓰기는 folders_tags.type 컬럼을 보지 않고 주소 앞글자만으로 WORD/BIT를 가른다
  // (PlcService.ReadWordsBatchAsync·Program.cs write 핸들러와 동일한 규칙) — 여기서도 그대로 재현한다.
  const isBit = /^[MLXYBS]/.test(device);
  const realType = isBit ? 'BIT' : 'WORD';
  const typeMismatch = t.type && realType !== String(t.type).toUpperCase();

  const memTag = '<span class="table-tag">메모리</span>';
  const liveTag = '<span class="table-tag is-live">실시간</span>';
  const writeTag = '<span class="table-tag is-write">쓰기</span>';

  document.getElementById('tagUsageModalTitle').textContent = `"${t.name}" — URL 사용법`;
  document.getElementById('tagUsageBody').innerHTML = `
    <p><strong>메모리(캐시)</strong>는 서버가 2초마다 미리 읽어둔 값을 그대로 돌려줘서 PLC와 새로 통신하지 않고, <strong>실시간</strong>은 호출하는 그 순간 PLC와 직접 통신합니다. 화면 갱신·반복 호출엔 메모리 쪽을, "지금 이 순간 진짜 값"이 필요할 때만 실시간 쪽을 쓰세요.</p>

    <p><strong>① 이 태그 값 조회</strong> ${memTag}</p>
    ${codeBlockRow(`${origin}/api/foldertag/value/by-name?name=${encodeURIComponent(t.name)}`)}

    <p><strong>② 같은 폴더 태그 전체 조회</strong> ${memTag}</p>
    ${codeBlockRow(`${origin}/api/foldertag/values?folderId=${t.folderId}`)}

    <p><strong>③ PLC 주소로 직접 조회</strong> (이름 대신 PLC+주소로) ${memTag}</p>
    ${codeBlockRow(`${origin}/api/foldertag/value/by-address?plcId=${encodeURIComponent(t.plcId)}&address=${encodeURIComponent(t.address)}`)}

    <p><strong>④ 지금 이 순간 PLC에서 즉시 읽기</strong> ${liveTag}</p>
    ${codeBlockRow(`${origin}/api/foldertag/read/by-address?plcId=${encodeURIComponent(t.plcId)}&address=${encodeURIComponent(t.address)}`)}
    <p class="field-hint">캐시(①~③)보다 최신이지만 PLC와 새로 통신합니다 — 화면에서 몇 초마다 반복 호출하는 용도로는 쓰지 마세요. X/Y 같은 접점 주소의 8진수/16진수 변환도 자동으로 처리됩니다.</p>

    <p><strong>⑤ 값 쓰기</strong> ${writeTag} — ⚠️ 실제 설비 PLC에 값을 내보내는 되돌릴 수 없는 동작입니다.</p>
    ${codeBlockRow(`${origin}/api/foldertag/write/by-name?name=${encodeURIComponent(t.name)}&value=${isBit ? 1 : 0}`)}
    <p class="field-hint">
      ${isBit ? '이 태그는 BIT로 처리되어 0(OFF) 또는 1(ON)만 의미가 있습니다 — 0이 아닌 값은 전부 ON으로 처리됨.' : '위 value 자리에 원하는 숫자를 넣어 호출하세요.'}
      이름이 다른 폴더에도 등록돼 있으면 쓰기는 거부되고 후보 목록만 옵니다 — 그때는 <code>&folderId=${t.folderId}</code>를 추가해 다시 호출하세요.
    </p>
    ${typeMismatch ? `<p class="docs-note">등록된 타입은 "${escapeHtml(t.type)}"이지만, 주소 앞글자가 "${escapeHtml(device)}"라 실제로는 <b>${realType}</b>로 처리됩니다 — 등록된 타입 값은 참고용일 뿐 실제 통신에는 쓰이지 않습니다.</p>` : ''}
  `;
  openModal('tagUsageModalBackdrop');
}

// URL 한 줄 + 복사 버튼을 담은 코드 블록 HTML을 만든다.
function codeBlockRow(url) {
  const id = 'cbUrl' + Math.random().toString(36).slice(2, 9);
  return `<div class="code-block-row">
    <pre class="code-block" id="${id}">GET ${escapeHtml(url)}</pre>
    <button type="button" class="btn btn-sm btn-ghost copy-url-btn" data-target="${id}" data-url="${escapeHtml(url)}">복사</button>
  </div>`;
}

// 클립보드 권한이 없는 폐쇄망 환경도 있어(공장 PC), 실패하면 텍스트만 선택해 Ctrl+C로
// 수동 복사할 수 있게 해둔다 — 어느 쪽이든 버튼을 누르면 결과를 보여준다.
document.addEventListener('click', e => {
  const btn = e.target.closest('.copy-url-btn');
  if (!btn) return;
  const finish = ok => {
    const original = '복사';
    btn.textContent = ok ? '복사됨' : '선택됨';
    setTimeout(() => { btn.textContent = original; }, 1400);
  };
  const selectFallback = () => {
    const el = document.getElementById(btn.dataset.target);
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(btn.dataset.url).then(() => finish(true)).catch(() => { selectFallback(); finish(false); });
  } else {
    selectFallback();
    finish(false);
  }
});

// ── 공용 페이지네이션 컨트롤 헬퍼 — 표마다 독립된 page 변수를 쓰지만, 위/아래 버튼 배선과
// 화면 갱신 로직은 동일해서 pagerClass(예: 'folder-tag-pager')로 묶어 재사용한다.
function wirePager(pagerClass, getPage, setPage, onChange) {
  document.querySelectorAll('.' + pagerClass).forEach(pager => {
    pager.querySelector('[data-act=first]').addEventListener('click', () => { setPage(1); onChange(); });
    pager.querySelector('[data-act=prev]').addEventListener('click', () => { setPage(getPage() - 1); onChange(); });
    pager.querySelector('[data-act=next]').addEventListener('click', () => { setPage(getPage() + 1); onChange(); });
    pager.querySelector('[data-act=last]').addEventListener('click', () => { setPage(Infinity); onChange(); });
    pager.querySelector('.pagination-page-input').addEventListener('change', e => { setPage(Number(e.target.value)); onChange(); });
  });
}
function updatePagerUI(pagerClass, page, totalPages) {
  document.querySelectorAll(`.${pagerClass} .pager-total-pages`).forEach(el => el.textContent = totalPages);
  document.querySelectorAll(`.${pagerClass} .pagination-page-input`).forEach(el => {
    if (document.activeElement !== el) el.value = page;
  });
  document.querySelectorAll(`.${pagerClass} [data-act=first], .${pagerClass} [data-act=prev]`).forEach(b => b.disabled = page <= 1);
  document.querySelectorAll(`.${pagerClass} [data-act=next], .${pagerClass} [data-act=last]`).forEach(b => b.disabled = page >= totalPages);
}
wirePager('folder-tag-pager', () => folderTagPage, p => { folderTagPage = p; }, renderFolderTagTable);

// editing: 수정 대상 태그(있으면 수정 모드) / dupFrom: 복제 원본(있으면 이름·주소 +1 해서 새로 만들기)
function openFolderTagModal(editing, dupFrom) {
  folderTagEditId = editing ? editing.id : null;
  const src = editing || dupFrom;
  document.getElementById('folderTagModalTitle').textContent = editing ? '모니터링 태그 수정' : (dupFrom ? '태그 복제 (내용 확인 후 저장)' : '새 모니터링 태그');
  const defaultFolder = src ? src.folderId : (selectedFolderId === 'ALL' ? null : selectedFolderId);
  fillFolderSelect(document.getElementById('ftFolderSelect'), folders, 'id', 'name', defaultFolder);
  document.getElementById('ftNameInput').value = editing ? src.name : (dupFrom ? incrementTrailingNumber(src.name) : '');
  document.getElementById('ftAddressInput').value = editing ? src.address : (dupFrom ? incrementTrailingNumber(src.address) : '');
  document.getElementById('ftPlcSelect').value = src ? src.plcId : '';
  document.getElementById('ftTypeSelect').value = src ? src.type : 'WORD';
  document.getElementById('ftEnabledInput').checked = src ? !!src.enabled : true;
  openModal('folderTagModalBackdrop');
}
document.getElementById('folderTagAddBtn').addEventListener('click', () => openFolderTagModal(null, null));
document.getElementById('folderTagForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    folderId: Number(document.getElementById('ftFolderSelect').value),
    name: document.getElementById('ftNameInput').value,
    address: document.getElementById('ftAddressInput').value,
    plcId: document.getElementById('ftPlcSelect').value,
    type: document.getElementById('ftTypeSelect').value,
    enabled: document.getElementById('ftEnabledInput').checked
  };
  if (!body.folderId) { showToast('폴더를 선택하세요', 'error'); return; }
  try {
    if (folderTagEditId) await api('PUT', `/api/admin/foldertags/${folderTagEditId}`, body);
    else await api('POST', '/api/admin/foldertags', body);
    closeModal('folderTagModalBackdrop');
    await loadFolderTags();
    showToast('저장했습니다', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

document.getElementById('folderAddBtn').addEventListener('click', () => {
  document.getElementById('folderModalTitle').textContent = '새 폴더';
  document.getElementById('folderForm').dataset.target = 'foldertag';
  document.getElementById('folderNameInput').value = '';
  document.getElementById('folderParentSelect').innerHTML = '<option value="">(최상위)</option>' +
    folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  openModal('folderModalBackdrop');
});
// 이 모달은 "새 폴더 만들기" 전용이다 — 이름 변경은 트리에서 ✎ 버튼(prompt)으로 바로 처리한다.
document.getElementById('folderForm').addEventListener('submit', async e => {
  e.preventDefault();
  const target = e.target.dataset.target; // 'foldertag' | 'alarmfolder'
  const name = document.getElementById('folderNameInput').value;
  const parentId = document.getElementById('folderParentSelect').value || null;
  try {
    if (target === 'alarmfolder') {
      await api('POST', '/api/admin/alarmfolders', { folderName: name, parentId });
      await loadAlarmFolders();
    } else {
      await api('POST', '/api/admin/folders', { name, parentId });
      await loadFolders();
    }
    closeModal('folderModalBackdrop');
    showToast('저장했습니다', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

bindLiveSearch('folderTagSearch', () => { folderTagSearch = document.getElementById('folderTagSearch').value; folderTagPage = 1; renderFolderTagTable(); });

document.getElementById('folderTagImportBtn').addEventListener('click', () => document.getElementById('folderTagImportFile').click());
document.getElementById('folderTagImportFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const qs = selectedFolderId === 'ALL' ? '' : `?folderId=${selectedFolderId}`;
  try {
    const result = await uploadFile('/api/admin/foldertags/import' + qs, fd);
    await loadFolderTags();
    showImportResult(result);
  } catch (e) { showToast(e.message, 'error'); }
  e.target.value = '';
});

// ============================================================================
// 2) 온도 태그 (tb_temp_tag)
// ============================================================================
let tempTags = [];
let selectedEquipId = null; // null = 전체
let tempTagEditId = null;
let tempTagSearch = '';
const tempTagSort = { key: null, dir: 'asc' };

async function loadEquipIds() {
  const { equipIds } = await api('GET', '/api/admin/temptags/equipids');
  const listEl = document.getElementById('equipList');
  listEl.innerHTML = '';
  const allLi = document.createElement('li');
  allLi.className = 'folder-row is-all' + (selectedEquipId === null ? ' is-selected' : '');
  allLi.innerHTML = '<span class="fr-name">(전체)</span>';
  allLi.addEventListener('click', () => selectEquip(null));
  listEl.appendChild(allLi);
  equipIds.forEach(eq => {
    const li = document.createElement('li');
    li.className = 'folder-row depth-0' + (selectedEquipId === eq ? ' is-selected' : '');
    li.innerHTML = `<span class="fr-name">${escapeHtml(eq)}</span>`;
    li.addEventListener('click', () => selectEquip(eq));
    listEl.appendChild(li);
  });
  // 태그 등록 폼의 datalist도 같이 채워둔다
  document.getElementById('equipIdList').innerHTML = equipIds.map(eq => `<option value="${escapeHtml(eq)}">`).join('');
}
async function selectEquip(eq) {
  selectedEquipId = eq;
  document.getElementById('tempTagsTitle').innerHTML = (eq ? `${ICON.thermo} ${escapeHtml(eq)}` : `${ICON.thermo} 전체 온도 태그`) + ' <span class="table-tag">tb_temp_tag</span>';
  updateTempTagExportLink();
  await loadEquipIds();
  await loadTempTags();
}
function updateTempTagExportLink() {
  document.getElementById('tempTagExportBtn').href = '/api/admin/temptags/export' + (selectedEquipId ? `?equipId=${encodeURIComponent(selectedEquipId)}` : '');
}

async function loadTempTags() {
  const qs = selectedEquipId ? `?equipId=${encodeURIComponent(selectedEquipId)}` : '';
  const { tags } = await api('GET', '/api/admin/temptags' + qs);
  tempTags = tags;
  renderTempTagTable();
}

function renderTempTagTable() {
  const body = document.getElementById('tempTagBody');
  const view = filterAndSort(tempTags, tempTagSearch, ['tagName', 'address'], tempTagSort);
  document.getElementById('tempTagCount').textContent = `총 ${view.length}건` + (view.length !== tempTags.length ? ` (전체 ${tempTags.length}건 중)` : '');
  body.innerHTML = view.map(t => `
    <tr>
      <td class="id-col">${t.tempId}</td>
      <td class="name-col">${escapeHtml(t.tagName)}</td>
      <td><span class="addr">${escapeHtml(t.address)}</span></td>
      <td class="truncate-col" title="${escapeHtml(t.plcId)}">${escapeHtml(t.plcId)}</td>
      <td><span class="col">${escapeHtml(t.colName)}</span></td>
      <td>${escapeHtml(t.trendName)}</td>
      <td class="mono">${escapeHtml(t.scale || '—')}</td>
      <td>${escapeHtml(t.equipId || '—')}</td>
      <td>${badge(t.enabled)}</td>
      <td class="row-actions">
        <button class="row-icon-btn" data-act="edit" title="수정">${ICON.edit}</button>
        <button class="row-icon-btn" data-act="dup" title="복제">${ICON.copy}</button>
        <button class="row-icon-btn is-danger" data-act="del" title="삭제">${ICON.trash}</button>
      </td>
    </tr>`).join('');
  [...body.children].forEach((tr, i) => {
    const t = view[i];
    tr.querySelector('[data-act=edit]').addEventListener('click', () => openTempTagModal(t));
    tr.querySelector('[data-act=dup]').addEventListener('click', () => openTempTagModal(null, t));
    tr.querySelector('[data-act=del]').addEventListener('click', async () => {
      if (!confirm(`"${t.tagName}" 태그를 삭제할까요? (tb_temp_snapshot의 "${t.colName}" 컬럼과 과거 데이터는 보존됩니다)`)) return;
      try { await api('DELETE', `/api/admin/temptags/${t.tempId}`); await loadTempTags(); showToast('태그를 삭제했습니다', 'success'); }
      catch (e) { showToast(e.message, 'error'); }
    });
  });
}

function openTempTagModal(editing, dupFrom) {
  tempTagEditId = editing ? editing.tempId : null;
  const src = editing || dupFrom;
  document.getElementById('tempTagModalTitle').textContent = editing ? '온도 태그 수정' : (dupFrom ? '태그 복제 (내용 확인 후 저장)' : '새 온도 태그');
  document.getElementById('ttNameInput').value = editing ? src.tagName : (dupFrom ? incrementTrailingNumber(src.tagName) : '');
  document.getElementById('ttAddressInput').value = editing ? src.address : (dupFrom ? incrementTrailingNumber(src.address) : '');
  document.getElementById('ttPlcSelect').value = src ? src.plcId : '';
  document.getElementById('ttColNameInput').value = editing ? src.colName : (dupFrom ? incrementTrailingNumber(src.colName) : '');
  document.getElementById('ttTrendNameInput').value = editing ? src.trendName : (dupFrom ? incrementTrailingNumber(src.trendName) : '');
  document.getElementById('ttScaleInput').value = src ? (src.scale || '') : '';
  document.getElementById('ttEquipIdInput').value = src ? (src.equipId || (selectedEquipId || '')) : (selectedEquipId || '');
  document.getElementById('ttEnabledInput').checked = src ? !!src.enabled : true;
  openModal('tempTagModalBackdrop');
}
document.getElementById('tempTagAddBtn').addEventListener('click', () => openTempTagModal(null, null));
document.getElementById('tempTagForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    tagName: document.getElementById('ttNameInput').value,
    address: document.getElementById('ttAddressInput').value,
    plcId: document.getElementById('ttPlcSelect').value,
    colName: document.getElementById('ttColNameInput').value,
    trendName: document.getElementById('ttTrendNameInput').value,
    scale: document.getElementById('ttScaleInput').value || null,
    equipId: document.getElementById('ttEquipIdInput').value || null,
    enabled: document.getElementById('ttEnabledInput').checked
  };
  try {
    const result = tempTagEditId
      ? await api('PUT', `/api/admin/temptags/${tempTagEditId}`, body)
      : await api('POST', '/api/admin/temptags', body);
    closeModal('tempTagModalBackdrop');
    await loadEquipIds();
    await loadTempTags();
    await loadSnapshotColumns();
    // 컬럼명 변경이 충돌해서 과거 데이터를 못 옮긴 경우(드묾) — 서버가 warning으로 알려준다.
    if (result && result.warning) showToast(result.warning, 'error');
    else showToast('저장했습니다 — tb_temp_snapshot 컬럼도 확인해보세요', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

async function loadSnapshotColumns() {
  try {
    const { columns } = await api('GET', '/api/admin/tempsnapshot/columns');
    document.getElementById('snapshotColumnsBox').textContent = columns.length ? columns.join(', ') : '(아직 없음)';
  } catch (e) { document.getElementById('snapshotColumnsBox').textContent = '조회 실패: ' + e.message; }
}

bindLiveSearch('tempTagSearch', () => { tempTagSearch = document.getElementById('tempTagSearch').value; renderTempTagTable(); });

document.getElementById('tempTagImportBtn').addEventListener('click', () => document.getElementById('tempTagImportFile').click());
document.getElementById('tempTagImportFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const result = await uploadFile('/api/admin/temptags/import', fd);
    await loadEquipIds();
    await loadTempTags();
    await loadSnapshotColumns();
    showImportResult(result);
  } catch (e) { showToast(e.message, 'error'); }
  e.target.value = '';
});

// ============================================================================
// 3) 알람 태그 (tb_alarm_folder / tb_alarm_tag)
// ============================================================================
let alarmFolders = [];
let selectedAlarmFolderId = 'ALL';
let alarmTags = [];
let alarmTagEditId = null;
let alarmTagSearch = '';
const alarmTagSort = { key: null, dir: 'asc' };

async function loadAlarmFolders() {
  const { folders: list } = await api('GET', '/api/admin/alarmfolders');
  // 백엔드는 DB 컬럼명 그대로(folderId/folderName)를 주므로, 폴더/알람폴더 공용인
  // renderFolderTree가 기대하는 {id,name,parentId} 모양으로 여기서 한 번 정규화한다.
  alarmFolders = list.map(f => ({ id: f.folderId, name: f.folderName, parentId: f.parentId }));
  renderFolderTree(document.getElementById('alarmFolderList'), alarmFolders, selectedAlarmFolderId, alarmFolderTreeHandlers(), '(전체)');
}
function alarmFolderTreeHandlers() {
  return {
    onSelect: f => selectAlarmFolder(f.id),
    onRename: async f => {
      const name = prompt('새 폴더 이름', f.name);
      if (!name || name.trim() === f.name) return;
      try { await api('PUT', `/api/admin/alarmfolders/${f.id}`, { folderName: name.trim(), parentId: f.parentId }); await loadAlarmFolders(); }
      catch (e) { showToast(e.message, 'error'); }
    },
    onDelete: async f => {
      let warn = `"${f.name}" 알람 폴더를 삭제할까요?`;
      try {
        const { tags } = await api('GET', `/api/admin/alarmtags?folderId=${f.id}`);
        if (tags.length > 0) warn = `"${f.name}" 폴더를 삭제하면 안에 있는 알람 태그 ${tags.length}개도 함께 삭제됩니다(복구 불가). 정말 삭제할까요?`;
      } catch (e) { /* 개수 확인 실패해도 삭제 자체는 계속 진행 가능하게 둔다 */ }
      if (!confirm(warn)) return;
      try {
        await api('DELETE', `/api/admin/alarmfolders/${f.id}`);
        if (selectedAlarmFolderId === f.id) { selectedAlarmFolderId = 'ALL'; }
        await loadAlarmFolders();
        await loadAlarmTags();
        showToast('폴더를 삭제했습니다', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    }
  };
}
async function selectAlarmFolder(id) {
  selectedAlarmFolderId = id;
  const f = id === 'ALL' ? null : alarmFolders.find(x => x.id === id);
  document.getElementById('alarmTagsTitle').innerHTML =
    (id === 'ALL' ? `${ICON.bell} 전체 알람 태그` : `${ICON.bell} ${escapeHtml(f ? f.name : '')}`) + ' <span class="table-tag">tb_alarm_tag</span>';
  updateAlarmTagExportLink();
  renderFolderTree(document.getElementById('alarmFolderList'), alarmFolders, selectedAlarmFolderId, alarmFolderTreeHandlers(), '(전체)');
  await loadAlarmTags();
}
function updateAlarmTagExportLink() {
  const qs = selectedAlarmFolderId === 'ALL' ? '' : `?folderId=${selectedAlarmFolderId}`;
  document.getElementById('alarmTagExportBtn').href = '/api/admin/alarmtags/export' + qs;
}

async function loadAlarmTags() {
  const qs = selectedAlarmFolderId === 'ALL' ? '' : `?folderId=${selectedAlarmFolderId}`;
  const { tags } = await api('GET', '/api/admin/alarmtags' + qs);
  alarmTags = tags;
  renderAlarmTagTable();
}

function renderAlarmTagTable() {
  const body = document.getElementById('alarmTagBody');
  const empty = document.getElementById('alarmTagEmpty');
  const view = filterAndSort(alarmTags, alarmTagSearch, ['tagName', 'address', 'alarmMsg'], alarmTagSort);
  document.getElementById('alarmTagCount').textContent = `총 ${view.length}건` + (view.length !== alarmTags.length ? ` (전체 ${alarmTags.length}건 중)` : '');
  if (view.length === 0) {
    body.innerHTML = '';
    empty.hidden = false;
    empty.textContent = alarmTags.length === 0 ? '알람 태그가 없습니다. "+ 새 태그"로 추가하세요.' : '검색 결과가 없습니다.';
    return;
  }
  empty.hidden = true;
  body.innerHTML = view.map(t => `
    <tr>
      <td class="id-col">${t.tagId}</td>
      <td class="name-col">${escapeHtml(t.tagName)}</td>
      <td><span class="addr">${escapeHtml(t.address)}</span></td>
      <td class="truncate-col" title="${escapeHtml(t.folderName)}">${escapeHtml(t.folderName)}</td>
      <td class="truncate-col" title="${escapeHtml(t.plcId)}">${escapeHtml(t.plcId)}</td>
      <td>${escapeHtml(t.alarmMsg)}</td>
      <td>${t.level}</td>
      <td>${badge(t.enabled)}</td>
      <td class="row-actions">
        <button class="row-icon-btn" data-act="edit" title="수정">${ICON.edit}</button>
        <button class="row-icon-btn" data-act="dup" title="복제">${ICON.copy}</button>
        <button class="row-icon-btn is-danger" data-act="del" title="삭제">${ICON.trash}</button>
      </td>
    </tr>`).join('');
  [...body.children].forEach((tr, i) => {
    const t = view[i];
    tr.querySelector('[data-act=edit]').addEventListener('click', () => openAlarmTagModal(t));
    tr.querySelector('[data-act=dup]').addEventListener('click', () => openAlarmTagModal(null, t));
    tr.querySelector('[data-act=del]').addEventListener('click', async () => {
      if (!confirm(`"${t.tagName}" 알람 태그를 삭제할까요?`)) return;
      try { await api('DELETE', `/api/admin/alarmtags/${t.tagId}`); await loadAlarmTags(); showToast('태그를 삭제했습니다', 'success'); }
      catch (e) { showToast(e.message, 'error'); }
    });
  });
}

function openAlarmTagModal(editing, dupFrom) {
  alarmTagEditId = editing ? editing.tagId : null;
  const src = editing || dupFrom;
  document.getElementById('alarmTagModalTitle').textContent = editing ? '알람 태그 수정' : (dupFrom ? '태그 복제 (내용 확인 후 저장)' : '새 알람 태그');
  const defaultFolder = src ? src.folderId : (selectedAlarmFolderId === 'ALL' ? null : selectedAlarmFolderId);
  fillFolderSelect(document.getElementById('atFolderSelect'), alarmFolders, 'id', 'name', defaultFolder);
  document.getElementById('atNameInput').value = editing ? src.tagName : (dupFrom ? incrementTrailingNumber(src.tagName) : '');
  document.getElementById('atAddressInput').value = editing ? src.address : (dupFrom ? incrementTrailingNumber(src.address) : '');
  document.getElementById('atPlcSelect').value = src ? src.plcId : '';
  document.getElementById('atMsgInput').value = src ? src.alarmMsg : '';
  document.getElementById('atLevelInput').value = src ? src.level : 1;
  document.getElementById('atEnabledInput').checked = src ? !!src.enabled : true;
  openModal('alarmTagModalBackdrop');
}
document.getElementById('alarmTagAddBtn').addEventListener('click', () => openAlarmTagModal(null, null));
document.getElementById('alarmTagForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    folderId: Number(document.getElementById('atFolderSelect').value),
    tagName: document.getElementById('atNameInput').value,
    address: document.getElementById('atAddressInput').value,
    plcId: document.getElementById('atPlcSelect').value,
    alarmMsg: document.getElementById('atMsgInput').value,
    level: Number(document.getElementById('atLevelInput').value) || 1,
    enabled: document.getElementById('atEnabledInput').checked
  };
  if (!body.folderId) { showToast('폴더를 선택하세요', 'error'); return; }
  try {
    if (alarmTagEditId) await api('PUT', `/api/admin/alarmtags/${alarmTagEditId}`, body);
    else await api('POST', '/api/admin/alarmtags', body);
    closeModal('alarmTagModalBackdrop');
    await loadAlarmTags();
    showToast('저장했습니다', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

document.getElementById('alarmFolderAddBtn').addEventListener('click', () => {
  document.getElementById('folderModalTitle').textContent = '새 알람 폴더';
  document.getElementById('folderForm').dataset.target = 'alarmfolder';
  document.getElementById('folderNameInput').value = '';
  document.getElementById('folderParentSelect').innerHTML = '<option value="">(최상위)</option>' +
    alarmFolders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  openModal('folderModalBackdrop');
});

bindLiveSearch('alarmTagSearch', () => { alarmTagSearch = document.getElementById('alarmTagSearch').value; renderAlarmTagTable(); });

document.getElementById('alarmTagImportBtn').addEventListener('click', () => document.getElementById('alarmTagImportFile').click());
document.getElementById('alarmTagImportFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const qs = selectedAlarmFolderId === 'ALL' ? '' : `?folderId=${selectedAlarmFolderId}`;
  try {
    const result = await uploadFile('/api/admin/alarmtags/import' + qs, fd);
    await loadAlarmTags();
    showImportResult(result);
  } catch (e) { showToast(e.message, 'error'); }
  e.target.value = '';
});

// ============================================================================
// 3.5) 문자열 태그 (tb_string_tag) — 더블워드 태그와 마찬가지로 folders 테이블을 공유해서 폴더로 묶는다.
//      값은 StringTagMonitorService가 30초 주기로 미리 읽어 디코딩해둔 최신값을 그대로 보여준다.
// ============================================================================
let stringTags = [];
let selectedStringFolderId = 'ALL';
let stringTagEditId = null;
let stringTagSearch = '';
const stringTagSort = { key: null, dir: 'asc' };

// 한글 등 비아스키 문자를 쓰면 서버가 Encoding.ASCII.GetBytes에서 조용히 '?'로 바꿔버려서
// 알아볼 수 없는 값이 PLC에 써진다 — API 왕복 없이 입력 즉시 막아 빠르게 알려준다
// (서버도 동일 검사를 하므로 우회해서 호출해도 안전하다).
function isAsciiOnly(s) { return /^[\x20-\x7E]*$/.test(s); }

function renderStringFolderTree() {
  const el = document.getElementById('stringFolderList');
  if (!el) return;
  renderFolderTree(el, folders, selectedStringFolderId, stringFolderTreeHandlers(), '(전체)');
}

function stringFolderTreeHandlers() {
  return {
    onSelect: f => selectStringFolder(f.id),
    onRename: async f => {
      const name = prompt('새 폴더 이름', f.name);
      if (!name || name.trim() === f.name) return;
      try { await api('PUT', `/api/admin/folders/${f.id}`, { name: name.trim(), parentId: f.parentId }); await loadFolders(); showToast('폴더 이름을 변경했습니다', 'success'); }
      catch (e) { showToast(e.message, 'error'); }
    },
    onDelete: async f => {
      let warn = `"${f.name}" 폴더를 삭제할까요?`;
      try {
        const { tags } = await api('GET', `/api/admin/stringtags?folderId=${f.id}`);
        if (tags.length > 0) warn = `"${f.name}" 폴더를 삭제하면 안에 있는 문자열 태그 ${tags.length}개도 함께 삭제됩니다(복구 불가). 이 폴더를 다른 태그 종류가 같이 쓰고 있다면 그쪽도 영향받습니다. 정말 삭제할까요?`;
      } catch (e) { /* 개수 확인 실패해도 삭제 자체는 계속 진행 가능하게 둔다 */ }
      if (!confirm(warn)) return;
      try {
        await api('DELETE', `/api/admin/folders/${f.id}`);
        if (selectedStringFolderId === f.id) selectedStringFolderId = 'ALL';
        await loadFolders();
        await loadStringTags();
        showToast('폴더를 삭제했습니다', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    }
  };
}

async function selectStringFolder(id) {
  selectedStringFolderId = id;
  const f = id === 'ALL' ? null : folders.find(x => x.id === id);
  document.getElementById('stringTagsTitle').innerHTML =
    (id === 'ALL' ? '전체 문자열 태그' : escapeHtml(f ? f.name : '')) + ' <span class="table-tag">tb_string_tag</span>';
  renderStringFolderTree();
  updateStringTagExportLink();
  await loadStringTags();
}

function updateStringTagExportLink() {
  const qs = selectedStringFolderId === 'ALL' ? '' : `?folderId=${selectedStringFolderId}`;
  document.getElementById('stringTagExportBtn').href = '/api/admin/stringtags/export' + qs;
}
document.getElementById('stringFolderAddBtn').addEventListener('click', async () => {
  const name = prompt('새 폴더 이름');
  if (!name || !name.trim()) return;
  try { await api('POST', '/api/admin/folders', { name: name.trim(), parentId: null }); await loadFolders(); showToast('폴더를 추가했습니다', 'success'); }
  catch (e) { showToast(e.message, 'error'); }
});

async function loadStringTags() {
  const qs = selectedStringFolderId === 'ALL' ? '' : `?folderId=${selectedStringFolderId}`;
  const { tags } = await api('GET', '/api/admin/stringtags' + qs);
  stringTags = tags;
  renderStringTagTable();
}

function renderStringTagTable() {
  const body = document.getElementById('stringTagBody');
  const view = filterAndSort(stringTags, stringTagSearch, ['tagName', 'address'], stringTagSort);
  document.getElementById('stringTagCount').textContent = `총 ${view.length}건` + (view.length !== stringTags.length ? ` (전체 ${stringTags.length}건 중)` : '');
  body.innerHTML = view.map(t => `
    <tr>
      <td class="id-col">${t.stringId}</td>
      <td class="name-col">${escapeHtml(t.tagName)}</td>
      <td><span class="addr">${escapeHtml(t.address)}</span></td>
      <td class="truncate-col" title="${escapeHtml(t.plcId)}">${escapeHtml(t.plcId)}</td>
      <td>${t.wordCount}</td>
      <td>${t.byteOrder === 'LOW_FIRST' ? '하위바이트 먼저' : '상위바이트 먼저'}</td>
      <td class="mono">${t.value != null && t.value !== '' ? escapeHtml(t.value) : '—'}</td>
      <td>${badge(t.enabled)}</td>
      <td class="row-actions">
        <button class="row-icon-btn" data-act="usage" title="API 사용법">${ICON.info}</button>
        <button class="row-icon-btn" data-act="write" title="값 쓰기">${ICON.wrench}</button>
        <button class="row-icon-btn" data-act="edit" title="수정">${ICON.edit}</button>
        <button class="row-icon-btn is-danger" data-act="del" title="삭제">${ICON.trash}</button>
      </td>
    </tr>`).join('');
  [...body.children].forEach((tr, i) => {
    const t = view[i];
    tr.querySelector('[data-act=usage]').addEventListener('click', () => openStringTagUsageModal(t));
    tr.querySelector('[data-act=edit]').addEventListener('click', () => openStringTagModal(t));
    tr.querySelector('[data-act=del]').addEventListener('click', async () => {
      if (!confirm(`"${t.tagName}" 태그를 삭제할까요?`)) return;
      try { await api('DELETE', `/api/admin/stringtags/${t.stringId}`); await loadStringTags(); showToast('태그를 삭제했습니다', 'success'); }
      catch (e) { showToast(e.message, 'error'); }
    });
    tr.querySelector('[data-act=write]').addEventListener('click', async () => {
      const value = prompt(`"${t.tagName}"에 쓸 문자열 (최대 ${t.wordCount * 2}자, 아스키 문자만 — 한글 불가)`, t.value || '');
      if (value === null) return;
      if (!isAsciiOnly(value)) { showToast('아스키(영문/숫자/기호) 문자만 쓸 수 있습니다 — 한글 등은 불가합니다', 'error'); return; }
      try {
        const result = await api('GET', `/api/admin/stringtags/write/by-name?name=${encodeURIComponent(t.tagName)}&value=${encodeURIComponent(value)}&folderId=${t.folderId}`);
        if (result.truncated) showToast('입력한 문자열이 너무 길어 일부가 잘렸습니다(그래도 썼습니다)', 'error');
        else showToast('값을 썼습니다', 'success');
        await loadStringTags();
      } catch (e) { showToast(e.message, 'error'); }
    });
  });
}

// 문자열 태그 하나(t)의 실제 값으로 URL 예시를 채운 "API 사용법" 모달 — 폴더 태그의
// openTagUsageModal과 같은 모달(tagUsageModalBackdrop)을 그대로 재사용한다(제목/본문만 교체).
function openStringTagUsageModal(t) {
  const origin = location.origin;
  const memTag = '<span class="table-tag">메모리</span>';
  const writeTag = '<span class="table-tag is-write">쓰기</span>';

  document.getElementById('tagUsageModalTitle').textContent = `"${t.tagName}" — API 사용법`;
  document.getElementById('tagUsageBody').innerHTML = `
    <p>문자열 태그는 <b>StringTagMonitorService</b>가 30초마다 미리 읽어 디코딩해둔 값을 메모리에만 들고 있습니다 — 아래 조회는 PLC와 새로 통신하지 않고 그 메모리 값을 그대로 돌려줍니다.</p>

    <p><strong>① 이 태그 값 조회</strong> ${memTag}</p>
    ${codeBlockRow(`${origin}/api/admin/stringtags?name=${encodeURIComponent(t.tagName)}`)}

    <p><strong>② 전체 문자열 태그 목록 조회</strong> ${memTag}</p>
    ${codeBlockRow(`${origin}/api/admin/stringtags`)}

    <p><strong>③ 값 쓰기</strong> ${writeTag} — ⚠️ 실제 설비 PLC에 값을 내보내는 되돌릴 수 없는 동작입니다. 문자열을 워드 ${t.wordCount}개(최대 ${t.wordCount * 2}자)로 인코딩해서 순서대로 씁니다.</p>
    ${codeBlockRow(`${origin}/api/admin/stringtags/write/by-name?name=${encodeURIComponent(t.tagName)}&value=${encodeURIComponent(t.value || '')}&folderId=${t.folderId}`)}
    <p class="field-hint">위 value 자리에 원하는 문자열을 넣어 호출하세요(URL 인코딩 필요). 등록된 워드 개수(${t.wordCount})×2자를 넘으면 뒷부분이 잘리고 <code>truncated:true</code>가 함께 옵니다. 같은 이름이 다른 폴더에도 있으면 folderId 없이는 거부되니 위처럼 항상 같이 넘기세요.</p>
  `;
  openModal('tagUsageModalBackdrop');
}

function openStringTagModal(editing) {
  stringTagEditId = editing ? editing.stringId : null;
  document.getElementById('stringTagModalTitle').textContent = editing ? '문자열 태그 수정' : '새 문자열 태그';
  document.getElementById('stFolderSelect').value = editing ? editing.folderId : (selectedStringFolderId !== 'ALL' ? selectedStringFolderId : (folders[0] ? folders[0].id : ''));
  document.getElementById('stNameInput').value = editing ? editing.tagName : '';
  document.getElementById('stAddressInput').value = editing ? editing.address : '';
  document.getElementById('stPlcSelect').value = editing ? editing.plcId : '';
  document.getElementById('stWordCountInput').value = editing ? editing.wordCount : 8;
  document.getElementById('stByteOrderInput').value = editing ? editing.byteOrder : 'HIGH_FIRST';
  document.getElementById('stEnabledInput').checked = editing ? !!editing.enabled : true;
  openModal('stringTagModalBackdrop');
}
document.getElementById('stringTagAddBtn').addEventListener('click', () => openStringTagModal(null));
document.getElementById('stringTagForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    folderId: parseInt(document.getElementById('stFolderSelect').value, 10),
    tagName: document.getElementById('stNameInput').value,
    address: document.getElementById('stAddressInput').value,
    plcId: document.getElementById('stPlcSelect').value,
    wordCount: parseInt(document.getElementById('stWordCountInput').value, 10),
    byteOrder: document.getElementById('stByteOrderInput').value,
    enabled: document.getElementById('stEnabledInput').checked
  };
  try {
    if (stringTagEditId) await api('PUT', `/api/admin/stringtags/${stringTagEditId}`, body);
    else await api('POST', '/api/admin/stringtags', body);
    closeModal('stringTagModalBackdrop');
    await loadStringTags();
    showToast('저장했습니다', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

bindLiveSearch('stringTagSearch', () => { stringTagSearch = document.getElementById('stringTagSearch').value; renderStringTagTable(); });

document.getElementById('stringTagImportBtn').addEventListener('click', () => document.getElementById('stringTagImportFile').click());
document.getElementById('stringTagImportFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const qs = selectedStringFolderId === 'ALL' ? '' : `?folderId=${selectedStringFolderId}`;
  try {
    const result = await uploadFile('/api/admin/stringtags/import' + qs, fd);
    await loadStringTags();
    showImportResult(result);
  } catch (e) { showToast(e.message, 'error'); }
  e.target.value = '';
});

// ============================================================================
// 3.6) 더블워드 태그 (dw_folders_tags) — folders 테이블을 모니터링 태그와 공유해서 폴더로 묶는다.
//      값은 DoubleWordTagMonitorService가 30초 주기로 미리 읽어 합쳐둔 최신값을 그대로 보여준다.
// ============================================================================
let dwTags = [];
let selectedDwFolderId = 'ALL';
let dwTagEditId = null;
let dwTagSearch = '';
const dwTagSort = { key: null, dir: 'asc' };

function renderDwFolderTree() {
  const el = document.getElementById('dwFolderList');
  if (!el) return;
  renderFolderTree(el, folders, selectedDwFolderId, dwFolderTreeHandlers(), '(전체)');
}

// 폴더 자체(추가/이름변경/삭제)는 모니터링 태그와 같은 /api/admin/folders를 그대로 쓴다 —
// folders 테이블을 공유하기 때문에 여기서 바꿔도 loadFolders()가 양쪽 트리를 함께 갱신한다.
function dwFolderTreeHandlers() {
  return {
    onSelect: f => selectDwFolder(f.id),
    onRename: async f => {
      const name = prompt('새 폴더 이름', f.name);
      if (!name || name.trim() === f.name) return;
      try { await api('PUT', `/api/admin/folders/${f.id}`, { name: name.trim(), parentId: f.parentId }); await loadFolders(); showToast('폴더 이름을 변경했습니다', 'success'); }
      catch (e) { showToast(e.message, 'error'); }
    },
    onDelete: async f => {
      let warn = `"${f.name}" 폴더를 삭제할까요?`;
      try {
        const { tags } = await api('GET', `/api/admin/dwtags?folderId=${f.id}`);
        if (tags.length > 0) warn = `"${f.name}" 폴더를 삭제하면 안에 있는 더블워드 태그 ${tags.length}개도 함께 삭제됩니다(복구 불가). 이 폴더를 모니터링 태그가 같이 쓰고 있다면 그쪽도 영향받습니다. 정말 삭제할까요?`;
      } catch (e) { /* 개수 확인 실패해도 삭제 자체는 계속 진행 가능하게 둔다 */ }
      if (!confirm(warn)) return;
      try {
        await api('DELETE', `/api/admin/folders/${f.id}`);
        if (selectedDwFolderId === f.id) selectedDwFolderId = 'ALL';
        await loadFolders();
        await loadDwTags();
        showToast('폴더를 삭제했습니다', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    }
  };
}

async function selectDwFolder(id) {
  selectedDwFolderId = id;
  const f = id === 'ALL' ? null : folders.find(x => x.id === id);
  document.getElementById('dwTagsTitle').innerHTML =
    (id === 'ALL' ? '전체 더블워드 태그' : escapeHtml(f ? f.name : '')) + ' <span class="table-tag">dw_folders_tags</span>';
  renderDwFolderTree();
  updateDwTagExportLink();
  await loadDwTags();
}

function updateDwTagExportLink() {
  const qs = selectedDwFolderId === 'ALL' ? '' : `?folderId=${selectedDwFolderId}`;
  document.getElementById('dwTagExportBtn').href = '/api/admin/dwtags/export' + qs;
}

async function loadDwTags() {
  const qs = selectedDwFolderId === 'ALL' ? '' : `?folderId=${selectedDwFolderId}`;
  const { tags } = await api('GET', '/api/admin/dwtags' + qs);
  dwTags = tags;
  renderDwTagTable();
}

function renderDwTagTable() {
  const body = document.getElementById('dwTagBody');
  const empty = document.getElementById('dwTagEmpty');
  const view = filterAndSort(dwTags, dwTagSearch, ['name', 'address'], dwTagSort);
  document.getElementById('dwTagCount').textContent = `총 ${view.length}건` + (view.length !== dwTags.length ? ` (전체 ${dwTags.length}건 중)` : '');
  if (view.length === 0) { body.innerHTML = ''; empty.hidden = false; return; }
  empty.hidden = true;
  body.innerHTML = view.map(t => `
    <tr>
      <td class="id-col">${t.id}</td>
      <td class="name-col">${escapeHtml(t.name)}</td>
      <td><span class="addr">${escapeHtml(t.address)}</span></td>
      <td class="truncate-col" title="${escapeHtml(t.plcId)}">${escapeHtml(t.plcId)}</td>
      <td>${t.wordCount}</td>
      <td class="mono">${escapeHtml(t.wordOrder)}</td>
      <td>${t.signed ? '있음' : '없음'}</td>
      <td class="mono">${t.value != null ? t.value : '—'}</td>
      <td>${badge(t.enabled)}</td>
      <td class="row-actions">
        <button class="row-icon-btn" data-act="usage" title="API 사용법">${ICON.info}</button>
        <button class="row-icon-btn" data-act="write" title="값 쓰기">${ICON.wrench}</button>
        <button class="row-icon-btn" data-act="edit" title="수정">${ICON.edit}</button>
        <button class="row-icon-btn is-danger" data-act="del" title="삭제">${ICON.trash}</button>
      </td>
    </tr>`).join('');
  [...body.children].forEach((tr, i) => {
    const t = view[i];
    tr.querySelector('[data-act=usage]').addEventListener('click', () => openDwTagUsageModal(t));
    tr.querySelector('[data-act=edit]').addEventListener('click', () => openDwTagModal(t));
    tr.querySelector('[data-act=del]').addEventListener('click', async () => {
      if (!confirm(`"${t.name}" 태그를 삭제할까요?`)) return;
      try { await api('DELETE', `/api/admin/dwtags/${t.id}`); await loadDwTags(); showToast('태그를 삭제했습니다', 'success'); }
      catch (e) { showToast(e.message, 'error'); }
    });
    tr.querySelector('[data-act=write]').addEventListener('click', async () => {
      const input = prompt(`"${t.name}"에 쓸 정수값 (${t.signed ? '부호있음' : '부호없음'}, ${t.wordCount * 16}비트)`, t.value != null ? String(t.value) : '0');
      if (input === null) return;
      if (!/^-?\d+$/.test(input.trim())) { showToast('정수만 입력할 수 있습니다', 'error'); return; }
      try {
        await api('GET', `/api/admin/dwtags/write/by-name?name=${encodeURIComponent(t.name)}&value=${encodeURIComponent(input.trim())}&folderId=${t.folderId}`);
        showToast('값을 썼습니다', 'success');
        await loadDwTags();
      } catch (e) { showToast(e.message, 'error'); }
    });
  });
}

function openDwTagModal(editing) {
  dwTagEditId = editing ? editing.id : null;
  document.getElementById('dwTagModalTitle').textContent = editing ? '더블워드 태그 수정' : '새 더블워드 태그';
  document.getElementById('dwFolderSelect').value = editing ? editing.folderId : (selectedDwFolderId !== 'ALL' ? selectedDwFolderId : (folders[0] ? folders[0].id : ''));
  document.getElementById('dwNameInput').value = editing ? editing.name : '';
  document.getElementById('dwAddressInput').value = editing ? editing.address : '';
  document.getElementById('dwPlcSelect').value = editing ? editing.plcId : '';
  document.getElementById('dwWordCountInput').value = editing ? editing.wordCount : 2;
  document.getElementById('dwWordOrderInput').value = editing ? editing.wordOrder : '0,1';
  document.getElementById('dwSignedInput').checked = editing ? !!editing.signed : true;
  document.getElementById('dwEnabledInput').checked = editing ? !!editing.enabled : true;
  openModal('dwTagModalBackdrop');
}
document.getElementById('dwTagAddBtn').addEventListener('click', () => openDwTagModal(null));
document.getElementById('dwFolderAddBtn').addEventListener('click', async () => {
  const name = prompt('새 폴더 이름');
  if (!name || !name.trim()) return;
  try { await api('POST', '/api/admin/folders', { name: name.trim(), parentId: null }); await loadFolders(); showToast('폴더를 추가했습니다', 'success'); }
  catch (e) { showToast(e.message, 'error'); }
});
// 신규 등록 화면에서 워드 개수를 바꾸면, 아직 손대지 않은 워드 순서 기본값도 그 개수에 맞춰 다시 채운다.
document.getElementById('dwWordCountInput').addEventListener('change', () => {
  if (dwTagEditId) return;
  const n = parseInt(document.getElementById('dwWordCountInput').value, 10);
  if (n >= 2 && n <= 4) document.getElementById('dwWordOrderInput').value = Array.from({ length: n }, (_, i) => i).join(',');
});
document.getElementById('dwTagForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    folderId: parseInt(document.getElementById('dwFolderSelect').value, 10),
    name: document.getElementById('dwNameInput').value,
    address: document.getElementById('dwAddressInput').value,
    plcId: document.getElementById('dwPlcSelect').value,
    wordCount: parseInt(document.getElementById('dwWordCountInput').value, 10),
    wordOrder: document.getElementById('dwWordOrderInput').value,
    signed: document.getElementById('dwSignedInput').checked,
    enabled: document.getElementById('dwEnabledInput').checked
  };
  try {
    if (dwTagEditId) await api('PUT', `/api/admin/dwtags/${dwTagEditId}`, body);
    else await api('POST', '/api/admin/dwtags', body);
    closeModal('dwTagModalBackdrop');
    await loadDwTags();
    showToast('저장했습니다', 'success');
  } catch (e) { showToast(e.message, 'error'); }
});

function openDwTagUsageModal(t) {
  const origin = location.origin;
  const memTag = '<span class="table-tag">메모리</span>';
  const writeTag = '<span class="table-tag is-write">쓰기</span>';
  document.getElementById('tagUsageModalTitle').textContent = `"${t.name}" — API 사용법`;
  document.getElementById('tagUsageBody').innerHTML = `
    <p>더블워드 태그는 <b>DoubleWordTagMonitorService</b>가 30초마다 미리 읽어 합쳐둔 값을 메모리에만 들고 있습니다 — 아래 조회는 PLC와 새로 통신하지 않고 그 메모리 값을 그대로 돌려줍니다.</p>

    <p><strong>① 이 태그 값 조회</strong> ${memTag}</p>
    ${codeBlockRow(`${origin}/api/admin/dwtags?name=${encodeURIComponent(t.name)}`)}

    <p><strong>② 이 폴더 전체 목록 조회</strong> ${memTag}</p>
    ${codeBlockRow(`${origin}/api/admin/dwtags?folderId=${t.folderId}`)}

    <p><strong>③ 값 쓰기</strong> ${writeTag} — ⚠️ 실제 설비 PLC에 값을 내보내는 되돌릴 수 없는 동작입니다. 정수를 워드 ${t.wordCount}개로 쪼개서 순서대로 씁니다.</p>
    ${codeBlockRow(`${origin}/api/admin/dwtags/write/by-name?name=${encodeURIComponent(t.name)}&value=${t.value != null ? t.value : 0}&folderId=${t.folderId}`)}
    <p class="field-hint">위 value 자리에 원하는 정수를 넣어 호출하세요. ${t.signed ? '부호있는' : '부호없는'} ${t.wordCount * 16}비트 범위를 벗어나면 에러로 거부됩니다. 같은 이름이 다른 폴더에도 있으면 folderId 없이는 거부되니 위처럼 항상 같이 넘기세요.</p>
  `;
  openModal('tagUsageModalBackdrop');
}

bindLiveSearch('dwTagSearch', () => { dwTagSearch = document.getElementById('dwTagSearch').value; renderDwTagTable(); });

document.getElementById('dwTagImportBtn').addEventListener('click', () => document.getElementById('dwTagImportFile').click());
document.getElementById('dwTagImportFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const qs = selectedDwFolderId === 'ALL' ? '' : `?folderId=${selectedDwFolderId}`;
  try {
    const result = await uploadFile('/api/admin/dwtags/import' + qs, fd);
    await loadDwTags();
    showImportResult(result);
  } catch (e) { showToast(e.message, 'error'); }
  e.target.value = '';
});

// ============================================================================
// 4) 실시간 모니터링 — PLC를 새로 두드리지 않고 서버가 이미 폴링해서 메모리(또는 최근 스냅샷)에
//    들고 있는 값만 주기적으로 다시 물어봐서 화면을 갱신한다. 값 자체는 서버가 2초(모니터링/알람)
//    ·30초(온도) 주기로 이미 갱신해두므로, 여기 새로고침 주기는 "화면이 그 값을 얼마나 빨리
//    따라가 보여줄지"일 뿐이지 PLC 통신 빈도와는 무관하다.
// ============================================================================
function isMonitorTabActive() { return document.getElementById('tab-monitor').classList.contains('is-active'); }
function isPlcTabActive() { return document.getElementById('tab-plc').classList.contains('is-active'); }

// PLC 관리 화면 우측 — 백그라운드 폴링 두 서비스가 실제로 PLC별로 어떻게 묶여서 도는지,
// 한 바퀴에 몇 ms 걸리는지, 최근 실패가 있었는지를 그대로 보여준다(PLC를 새로 두드리지 않음).
function pollGroupRowHtml(g, chunkSizeConfig) {
  const chunkTotal = g.chunkTotal || 0;
  const chunkFail  = g.chunkFail || 0;
  const chunkOk    = chunkTotal - chunkFail;
  // chunkTotal은 "태그 개수"가 아니라 "이번 사이클에 실제로 PLC를 왕복한 횟수"다 — 주소가
  // 얼마나 흩어져 있느냐에 따라 태그 수천 개가 청크 몇십 개로 뭉칠 수도, 수백 개로 쪼개질
  // 수도 있어서, 눈으로 "2초 안에 몇 번 통신해서 몇 번 다 성공했는지"를 바로 보여준다.
  const chunkChip = chunkTotal > 0
    ? `<span class="poll-group-chip ${chunkFail > 0 ? 'is-fail' : 'is-ok'}">청크 ${chunkOk}/${chunkTotal} 성공${chunkFail > 0 ? ` (${chunkFail}건 실패)` : ''}</span>`
    : '';
  return `
    <div class="poll-group-row">
      <span class="poll-group-plc">${escapeHtml(g.plcLabel)} <span class="write-log-time">(${escapeHtml(g.plcId)})</span></span>
      <span class="poll-group-chip">폴더 <b>${g.folderTagCount}</b>개</span>
      <span class="poll-group-chip">알람 <b>${g.alarmTagCount}</b>개</span>
      <span class="poll-group-chip">폴더+알람 <b>${g.folderTagCount + g.alarmTagCount}</b>개 → 청크당 최대 <b>${chunkSizeConfig}</b>개씩 읽음</span>
      ${chunkChip}
    </div>`;
}

// ms를 초 단위 문자열로 — 주기(intervalMs)는 항상 딱 떨어지는 값이라 소수점 없이,
// 실측 소요시간은 ms 단위 정밀도가 의미 있어서 소수점 3자리까지 보여준다.
function msToSecExact(ms) { return `${(ms / 1000).toFixed(3)}초`; }
function msToSecRound(ms) { return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}초`; }

// 한 바퀴 소요시간 추이 스파크라인 — 축/눈금 없이 모양만 보여주고, 값은 호버 시 초 단위로 알려준다.
// 데이터셋 개수가 항상 1개로 고정이라(온도 트렌드와 달리 설비별로 늘었다 줄었다 하지 않음)
// 매번 새로 만들 필요 없이 인스턴스 하나를 계속 재사용한다.
const pollChartInstances = {};   // 'live' | 'temp' → Chart 인스턴스
const POLL_CHART_COLORS = { live: '#4c6fef', temp: '#1fae6e' };

function renderPollChart(key, canvasId, history) {
  const canvas = document.getElementById(canvasId);
  const labels = history.map(h => h.at);
  const values = history.map(h => h.ms);

  let chart = pollChartInstances[key];
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.update('none');
    return;
  }

  const color = POLL_CHART_COLORS[key];
  chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{
      data: values, borderColor: color, backgroundColor: color + '22',
      borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 3, fill: true, spanGaps: true
    }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
      plugins: {
        legend: { display: false },
        tooltip: { displayColors: false, callbacks: {
          title: () => '',
          label: ctx => `${(ctx.parsed.y / 1000).toFixed(3)}초`
        } }
      }
    }
  });
  pollChartInstances[key] = chart;
}

async function refreshPollStatus() {
  if (!isPlcTabActive()) return;
  try {
    const { live, temp, failures } = await api('GET', '/api/admin/monitor/pollstatus');

    document.getElementById('pollLiveInterval').textContent = `주기 ${msToSecRound(live.intervalMs)}`;
    document.getElementById('pollLiveDuration').textContent = msToSecExact(live.lastCycleDurationMs);
    document.getElementById('pollLiveLastAt').textContent = live.lastPollAt ? formatUpdatedAt(live.lastPollAt) : '아직 없음';
    renderPollChart('live', 'pollLiveChart', live.durationHistory || []);
    const liveGroups = document.getElementById('pollLiveGroups');
    liveGroups.innerHTML = live.groups.length
      ? live.groups.map(g => pollGroupRowHtml(g, live.chunkSize)).join('')
      : '<div class="poll-group-empty">등록된 폴더/알람 태그가 없습니다.</div>';

    document.getElementById('pollTempInterval').textContent = `주기 ${msToSecRound(temp.intervalMs)}`;
    document.getElementById('pollTempDuration').textContent = msToSecExact(temp.lastCycleDurationMs);
    document.getElementById('pollTempLastAt').textContent = temp.lastPollAt ? formatUpdatedAt(temp.lastPollAt) : '아직 없음';
    renderPollChart('temp', 'pollTempChart', temp.durationHistory || []);
    document.getElementById('pollTempGroups').innerHTML = temp.tagCount > 0
      ? `<div class="poll-group-row"><span class="poll-group-chip">온도 태그 <b>${temp.tagCount}</b>개 (같은 PLC끼리 묶어서 읽음)</span></div>`
      : '<div class="poll-group-empty">등록된 온도 태그가 없습니다.</div>';

    const failureStrip = document.getElementById('pollFailureStrip');
    const failureLabel = document.getElementById('pollFailureStripLabel');
    const failureList = document.getElementById('pollFailureList');
    failureStrip.classList.toggle('is-ok', failures.length === 0);
    failureStrip.classList.toggle('is-alert', failures.length > 0);
    // "최근 실패 없음"만 보면 이번 사이클에 청크(PLC 왕복)가 몇 개나 돌았는지, 그게 진짜 다
    // 끝났는지 알 수 없다는 피드백 — live.groups 전체를 합산해서 바로 옆에 붙여 보여준다.
    const chunkTotal = (live.groups || []).reduce((s, g) => s + (g.chunkTotal || 0), 0);
    const chunkFail  = (live.groups || []).reduce((s, g) => s + (g.chunkFail || 0), 0);
    const chunkNote = chunkTotal > 0 ? ` · 이번 사이클 청크 ${chunkTotal - chunkFail}/${chunkTotal} 성공` : '';
    failureLabel.innerHTML = failures.length > 0
      ? `${ICON.alertTriangle} 최근 실패 ${failures.length}건${chunkNote}`
      : `${ICON.checkCircle} 최근 실패 없음${chunkNote}`;
    failureList.innerHTML = failures.map(f => `
      <div class="poll-failure-row">
        <div class="poll-failure-meta">${formatUpdatedAt(f.at)} · ${escapeHtml(f.source)} · ${escapeHtml(f.plcId)}${f.device ? ' · ' + escapeHtml(f.device) : ''}</div>
        ${escapeHtml(f.message)}
      </div>`).join('');

    renderDiagnosis(live, temp, failures);
    document.getElementById('pollStatusUpdatedAt').textContent = formatUpdatedAt(new Date().toISOString());
  } catch (e) { showToast('폴링 상태 조회 실패: ' + e.message, 'error'); }
}
setInterval(() => { if (isPlcTabActive()) refreshPollStatus(); }, 3000);

// 규칙 기반 진단 — 별도 AI API 없이, 실제 실패 메시지 문구·연속실패 횟수·최근 몇 초간 지속됐는지를
// 그 자리에서 분석해서 "지금 뭐가 문제인지"를 문장으로 요약한다. tb_plc(그룹 라벨)와
// 방금 받은 실패 이력만 가지고 판단하므로 매 새로고침(3초)마다 최신 상태로 다시 계산된다.
function diagnoseFailureGroup(plcId, label, list) {
  const msgs = list.map(f => f.message).join(' ');
  let reason = '통신 실패';
  let tip = '연결 상태를 확인해보세요.';
  if (msgs.includes('거부')) {
    reason = '연결 거부 — PLC가 꺼져있거나 IP·포트가 다른 것으로 보입니다';
    tip = 'PLC 전원, tb_plc에 등록된 IP·포트, 네트워크 케이블/방화벽을 확인해보세요.';
  } else if (msgs.includes('락 획득')) {
    reason = '내부 대기 지연 — 다른 요청이 같은 PLC 연결을 오래 붙잡고 있습니다';
    tip = '보통 일시적입니다. 계속되면 그 PLC 자체 응답이 원래 느린 건 아닌지 확인해보세요.';
  } else if (msgs.includes('타임아웃')) {
    reason = '응답 없음(타임아웃) — 연결은 되지만 PLC가 제때 응답하지 않습니다';
    tip = 'PLC 부하나 케이블·스위치 쪽 간헐적 단절 가능성을 확인해보세요.';
  }

  let maxStreak = 0;
  list.forEach(f => {
    const m = f.message.match(/연속실패 (\d+)회/);
    if (m) maxStreak = Math.max(maxStreak, parseInt(m[1], 10));
  });
  const spanSec = Math.round((new Date(list[0].at) - new Date(list[list.length - 1].at)) / 1000);
  const streakText = maxStreak > 0 ? `연속 ${maxStreak}회 실패` : `최근 ${list.length}건 실패`;
  const durationText = spanSec > 1 ? `, ${spanSec}초째 지속 중` : '';

  return `
    <div class="poll-diagnosis-item is-problem">
      <b>${escapeHtml(label)}</b> <span class="write-log-time">(${escapeHtml(plcId)})</span> — ${reason}<br>
      ${streakText}${durationText}
      <span class="diag-tip">${ICON.bulb} ${tip}</span>
    </div>`;
}

let aiNoteActive = false;   // true가 되면(AI 분석 성공) 3초마다 도는 규칙 기반 갱신이 그 내용을 덮어쓰지 않는다.

function renderDiagnosis(live, temp, failures) {
  if (aiNoteActive) return;   // 지금 보여주는 게 AI 분석 결과라면 규칙 기반 내용으로 되돌리지 않는다.
  const body = document.getElementById('pollDiagnosisBody');
  body.className = 'poll-diagnosis-body';
  const byPlc = {};
  failures.forEach(f => {
    if (f.plcId === '(전체)') return;   // 옛 방식의 뭉뚱그려진 로그(지금은 거의 안 나옴)는 진단에서 제외
    (byPlc[f.plcId] ||= []).push(f);
  });

  const items = Object.entries(byPlc).map(([plcId, list]) => {
    const group = live.groups.find(g => g.plcId === plcId);
    return diagnoseFailureGroup(plcId, group ? group.plcLabel : plcId, list);
  });

  const okGroups = live.groups.filter(g => !byPlc[g.plcId]);
  if (okGroups.length > 0) {
    items.push(`
      <div class="poll-diagnosis-item is-ok">
        ${okGroups.map(g => escapeHtml(g.plcLabel)).join(', ')} 정상 통신 중 (한 바퀴 ${msToSecExact(live.lastCycleDurationMs)})
      </div>`);
  }

  body.innerHTML = items.length > 0
    ? items.join('')
    : '<div class="poll-diagnosis-item is-ok">현재 모든 PLC가 정상 통신 중입니다.</div>';
}

// "AI로 분석" 버튼 — 누른 시점의 최신 폴링 상태를 다시 받아서(오래된 값 안 쓰게) 로컬 Ollama에게
// 그대로 넘기고, 자연어로 된 설명을 받아온다. PLC/DB는 새로 두드리지 않는다(이미 있는 상태 요약만 사용).
// 성공하면 aiNoteActive를 켜서, 이후 3초마다 도는 규칙 기반 진단이 이 내용을 덮어쓰지 않게 한다.
document.getElementById('pollAiAskBtn').addEventListener('click', async () => {
  const btn = document.getElementById('pollAiAskBtn');
  const out = document.getElementById('pollDiagnosisBody');
  btn.disabled = true;
  out.className = 'poll-diagnosis-body is-loading';
  out.textContent = 'DB와 최근 이력을 살펴보는 중... (로컬 모델이라 몇 초~몇십 초 걸릴 수 있습니다)';
  try {
    const status = await api('GET', '/api/admin/monitor/pollstatus');
    const res = await fetch('/api/admin/monitor/ai-diagnosis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(status)
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'AI 분석 실패');
    out.className = 'poll-diagnosis-body is-ai';
    out.textContent = json.analysis || '(빈 응답)';
    aiNoteActive = true;
  } catch (e) {
    out.className = 'poll-diagnosis-body is-error';
    out.textContent = '분석 실패: ' + e.message;
  } finally {
    btn.disabled = false;
  }
});

// ============================================================================
// AI 채팅(자연어 조작) — 서버(/api/admin/chat)가 Ollama의 tool-calling으로 어떤 동작인지
// 해석해서, 조회는 바로 실행한 결과를 자연어로 요약해 돌려주고, 값쓰기/온도 태그 추가처럼
// 실제 설비·DB에 영향을 주는 "쓰기"는 곧장 실행하지 않고 "이 동작을 실행할까요?"만 돌려준다.
// 대화 상태(chatTranscript)는 서버가 무상태이므로 여기서만 들고 있다가 매번 전체를 다시 보낸다.
// ============================================================================
let chatTranscript = [];       // 서버가 돌려준 messages 배열을 그대로 이어받아 들고 있는다.
let chatPending = null;        // 확인 대기 중인 "쓰기" 동작 — { name, arguments, description }
let chatBusy = false;
let chatLastToolsUsed = null;  // 방금 도착한 답변을 만드는 데 쓰인 도구 이름들(마지막 메시지 옆에만 표시)
let chatLocalError = null;     // 네트워크/서버 오류 — 실제 대화가 아니므로 chatTranscript에는 안 남기고 화면에만 보여준다.

function renderChatMessages() {
  const wrap = document.getElementById('chatMessages');
  const parts = [];

  chatTranscript.forEach((m, i) => {
    if (m.role !== 'user' && m.role !== 'assistant') return;   // tool 메시지(원본 JSON)는 화면에 그대로 노출하지 않는다.
    if (m.role === 'assistant' && !m.content) return;          // 도구 호출만 담긴 빈 assistant 메시지는 건너뛴다.

    const isLast = i === chatTranscript.length - 1;
    const toolsNote = (isLast && m.role === 'assistant' && chatLastToolsUsed && chatLastToolsUsed.length > 0)
      ? `<div class="chat-tools-used">${ICON.wrench} ${chatLastToolsUsed.map(escapeHtml).join(', ')} 사용함</div>`
      : '';
    parts.push(`
      <div class="chat-msg is-${m.role}">
        ${toolsNote}
        <div class="chat-bubble">${escapeHtml(m.content)}</div>
      </div>`);
  });

  if (chatBusy) {
    // 확인 실행 중일 수도 있으므로(chatPending이 아직 안 지워졌을 수 있음) busy를 최우선으로 본다 —
    // 응답 오는 동안 확인 카드가 그대로 남아있으면 실행 버튼을 중복 클릭할 수 있기 때문.
    parts.push('<div class="chat-msg is-assistant chat-thinking"><div class="chat-bubble">생각 중...</div></div>');
  } else if (chatPending) {
    parts.push(`
      <div class="chat-confirm-card">
        <div class="chat-confirm-label">${ICON.alertTriangle} 실행 확인</div>
        <div class="chat-confirm-desc">${escapeHtml(chatPending.description)}</div>
        <div class="chat-confirm-actions">
          <button type="button" class="btn btn-sm btn-ghost" data-chat-action="cancel">취소</button>
          <button type="button" class="btn btn-sm btn-primary" data-chat-action="confirm">실행</button>
        </div>
      </div>`);
  } else if (chatLocalError) {
    parts.push(`<div class="chat-msg is-assistant is-error"><div class="chat-bubble">${ICON.alertTriangle} ${escapeHtml(chatLocalError)}</div></div>`);
  }

  document.getElementById('chatEmpty').hidden = parts.length > 0;
  wrap.querySelectorAll('.chat-msg, .chat-confirm-card').forEach(el => el.remove());
  wrap.insertAdjacentHTML('beforeend', parts.join(''));
  wrap.scrollTop = wrap.scrollHeight;
}

function setChatBusy(busy) {
  chatBusy = busy;
  document.getElementById('chatInput').disabled = busy;
  document.getElementById('chatSendBtn').disabled = busy;
  renderChatMessages();
}

async function runChatTurn(payload) {
  chatLocalError = null;
  setChatBusy(true);
  try {
    const res = await api('POST', '/api/admin/chat', payload);
    chatTranscript = res.messages;
    chatPending = res.pendingConfirm || null;
    chatLastToolsUsed = (!chatPending && res.toolsUsed && res.toolsUsed.length > 0) ? res.toolsUsed : null;
  } catch (e) {
    // 네트워크/서버 오류는 실제 대화가 아니므로 chatTranscript에는 남기지 않는다(다음에 그대로 Ollama에게
    // 다시 보내지는 히스토리를 오염시키지 않기 위함) — 화면에만 별도로 보여준다.
    chatLocalError = e.message;
  } finally {
    setChatBusy(false);
    document.getElementById('chatInput').focus();
  }
}

document.getElementById('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  if (chatBusy || chatPending) return;   // 확인 대기 중에는 실행/취소부터 정리해야 다음 요청을 보낼 수 있다.
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  chatTranscript.push({ role: 'user', content: text });
  chatLastToolsUsed = null;
  runChatTurn({ messages: chatTranscript });
});

document.getElementById('chatMessages').addEventListener('click', e => {
  const action = e.target.dataset.chatAction;
  if (!action) return;
  if (action === 'cancel') {
    chatTranscript.pop();   // 확인 대기 중이던 assistant의 tool_calls 메시지를 되돌린다(서버에는 보내지 않음).
    chatPending = null;
    renderChatMessages();
  } else if (action === 'confirm') {
    runChatTurn({ messages: chatTranscript, confirm: true });
  } else if (action === 'example') {
    // 예시 칩 클릭 — 바로 전송하지 않고 입력창에 채우기만 한다(쓰기 예시를 실수로 바로 실행하지 않도록).
    const input = document.getElementById('chatInput');
    input.value = e.target.dataset.chatText || e.target.textContent.trim();
    input.focus();
  }
});

function formatUpdatedAt(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour12: false });
}

// 설비 하나에 태그가 여러 개일 수 있어(예: BCF1 = 1존+2존), 카드 하나(=설비 하나) 안에
// 태그별 선을 색깔로 구분해서 Chart.js 그래프 하나에 같이 그린다(vendor/chart.umd.min.js,
// CDN 없이 로컬 파일 — 공장 PC라 인터넷이 항상 되리라는 보장이 없어서).
const TREND_COLORS = ['#0f6d8c', '#c0392b', '#b9770e', '#1e8449', '#6c5ce7', '#e17055', '#0984e3', '#636e72'];
const tempChartInstances = new Map(); // 설비명 → Chart 인스턴스. 매번 새로 만들지 않고 데이터만 갱신해서
                                       // 30초마다 차트가 깜빡이며 다시 그려지는 걸 막는다.

// 1일을 넘는 기간(24시간/3일/7일)을 고르면 시:분만으로는 어느 날인지 알 수 없어서 날짜도 같이 찍는다.
function shortTimeLabel(iso, includeDate) {
  const opts = includeDate
    ? { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { hour12: false, hour: '2-digit', minute: '2-digit' };
  return new Date(iso).toLocaleString('ko-KR', opts);
}

// 태그마다 스냅샷 행이 살짝 어긋나 있어도(널 스킵 등으로 개수가 다를 수 있음) 안전하게 맞추려고,
// 그룹 전체 타임스탬프의 합집합을 x축으로 놓고 태그별 값을 그 위치에 맞춰 채운다(없으면 null).
function buildAlignedSeries(groupTags, includeDate) {
  const labelSet = new Set();
  groupTags.forEach(t => (t.series || []).forEach(p => labelSet.add(p.t)));
  const rawLabels = [...labelSet].sort();
  const namedSeries = groupTags.map(t => {
    const map = new Map((t.series || []).map(p => [p.t, p.v]));
    return { name: t.trendName || t.tagName, values: rawLabels.map(l => (map.has(l) ? map.get(l) : null)) };
  });
  return { labels: rawLabels.map(l => shortTimeLabel(l, includeDate)), namedSeries };
}

function makeTempDataset(name, values, colorIdx) {
  const color = TREND_COLORS[colorIdx % TREND_COLORS.length];
  return {
    label: name, data: values, borderColor: color, backgroundColor: color + '1a',
    borderWidth: 2, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, fill: false, spanGaps: true
  };
}

function buildTempChartConfig(labels, namedSeries) {
  const style = getComputedStyle(document.documentElement);
  const gridColor = style.getPropertyValue('--border-soft').trim();
  const textColor = style.getPropertyValue('--text-faint').trim();
  return {
    type: 'line',
    data: { labels, datasets: namedSeries.map((s, i) => makeTempDataset(s.name, s.values, i)) },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
        y: { grid: { color: gridColor }, ticks: { color: textColor } }
      },
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }
    }
  };
}

// 카드+캔버스 DOM은 있으면 재사용, 없으면 새로 만든다 — Chart 인스턴스도 있으면 데이터만 갱신(update),
// 없으면 새로 생성한다. 이렇게 해야 30초 자동 갱신마다 차트를 통째로 지웠다 새로 그리지 않는다.
function ensureTempCard(equip, tagCount) {
  let card = document.querySelector(`.trend-card[data-equip="${CSS.escape(equip)}"]`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'trend-card';
    card.dataset.equip = equip;
    card.innerHTML = `
      <div class="trend-card-head">
        <span class="trend-card-name"></span>
        <span class="trend-card-equip"></span>
      </div>
      <div class="trend-chart-wrap"><canvas></canvas></div>
      <div class="trend-legend"></div>`;
    document.getElementById('monTempGrid').appendChild(card);
  }
  card.querySelector('.trend-card-name').textContent = equip;
  card.querySelector('.trend-card-name').title = equip;
  card.querySelector('.trend-card-equip').textContent = `${tagCount}개 태그`;
  return card;
}

function renderOrUpdateTempChart(card, labels, namedSeries) {
  const equip = card.dataset.equip;
  const canvas = card.querySelector('canvas');
  let chart = tempChartInstances.get(equip);
  if (chart && chart.data.datasets.length === namedSeries.length) {
    chart.data.labels = labels;
    namedSeries.forEach((s, i) => { chart.data.datasets[i].data = s.values; chart.data.datasets[i].label = s.name; });
    chart.update('none'); // 'none' = 애니메이션 없이 즉시 갱신(30초마다 매번 애니메이션 돌면 산만함)
  } else {
    if (chart) chart.destroy(); // 태그 구성(개수)이 바뀐 경우만 새로 생성
    chart = new Chart(canvas.getContext('2d'), buildTempChartConfig(labels, namedSeries));
    tempChartInstances.set(equip, chart);
  }
}

// ── 4-1) 모니터링 태그 실시간 값 ──────────────────────────────────────────
function populateMonitorFolderSelect() {
  const sel = document.getElementById('monFolderSelect');
  const current = sel.value || 'ALL';
  sel.innerHTML = '<option value="ALL">전체 폴더</option>' + folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === current) ? current : 'ALL';
}
document.getElementById('monFolderSelect').addEventListener('change', () => { monFolderPage = 1; refreshMonitorFolder(); });

// 표에서 클릭으로 고른 태그들 — 오른쪽 값쓰기 패널이 이 태그들을 대상으로 동작한다.
// 엑셀처럼: 클릭=단일 선택(기준점 이동), Shift+클릭=기준점~클릭 범위 선택, Ctrl/Cmd+클릭=개별 추가·제거.
let monFolderTags = [];
let selectedWriteTagIds = new Set();
let writeAnchorIndex = null;

// ── 페이지당 100개 — 태그가 수천~수만 개일 때 한 번에 다 그리면 브라우저가 버벅인다 ──────
const MON_FOLDER_PAGE_SIZE = 100;
let monFolderSearch = '';
let monFolderPage = 1;
let monFolderPageRows = [];   // 지금 화면에 실제로 그려진 행들 — 클릭 인덱스가 이 배열 기준(전체가 아님)

bindLiveSearch('monFolderSearch', () => {
  monFolderSearch = document.getElementById('monFolderSearch').value;
  monFolderPage = 1;   // 검색어가 바뀌면 결과 집합이 바뀌니 1페이지로
  renderMonFolderTable();
});

document.querySelectorAll('.mon-folder-pager').forEach(pager => {
  pager.querySelector('[data-act=first]').addEventListener('click', () => goToMonFolderPage(1));
  pager.querySelector('[data-act=prev]').addEventListener('click', () => goToMonFolderPage(monFolderPage - 1));
  pager.querySelector('[data-act=next]').addEventListener('click', () => goToMonFolderPage(monFolderPage + 1));
  pager.querySelector('[data-act=last]').addEventListener('click', () => goToMonFolderPage(Infinity));
  pager.querySelector('.pagination-page-input').addEventListener('change', e => goToMonFolderPage(Number(e.target.value)));
});

function goToMonFolderPage(page) {
  monFolderPage = page;   // 실제 범위 클램프는 renderMonFolderTable이 총 페이지 수를 안 뒤에 한다
  renderMonFolderTable();
}

// 값쓰기 패널 하단의 최근 이력 — 값쓰기 성공 직후 + 주기적으로 다시 불러온다.
// 조회 실패는 조용히 무시한다(이력 조회가 안 된다고 값쓰기 화면 자체가 막히면 안 됨).
async function refreshWriteLog() {
  try {
    const { logs } = await api('GET', '/api/admin/monitor/taglog?limit=30');
    const list = document.getElementById('writeLogList');
    if (!logs || logs.length === 0) {
      list.innerHTML = '<div class="write-log-empty">아직 기록된 값 변경 이력이 없습니다</div>';
      return;
    }
    list.innerHTML = logs.map(l => {
      const time = new Date(l.writtenAt).toLocaleString('ko-KR',
        { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const label = l.tagName || l.address;
      return `
      <div class="write-log-row">
        <span class="write-log-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
        <span class="write-log-time">${time}</span>
        <div class="write-log-detail">
          <span>${escapeHtml(l.address)}</span>
          <span class="write-log-old">${l.oldValue === null ? '—' : l.oldValue}</span>
          <span class="write-log-arrow">→</span>
          <span class="write-log-new">${l.newValue}</span>
        </div>
      </div>`;
    }).join('');
  } catch (e) { /* 무시 */ }
}

async function refreshMonitorFolder() {
  const folderId = document.getElementById('monFolderSelect').value;
  const qs = folderId === 'ALL' ? '' : `?folderId=${folderId}`;
  try {
    const { tags, lastPollAt } = await api('GET', '/api/admin/monitor/foldertags' + qs);
    monFolderTags = tags;
    document.getElementById('monFolderUpdatedAt').textContent = formatUpdatedAt(lastPollAt);
    // 폴더 전환 등으로 표에서 사라진 태그는 선택에서도 정리한다.
    const stillValidIds = new Set(tags.map(t => t.id));
    [...selectedWriteTagIds].forEach(id => { if (!stillValidIds.has(id)) selectedWriteTagIds.delete(id); });
    renderMonFolderTable();
    // 값쓰기 패널을 열어둔 채로 표가 갱신되면, 선택된 태그들의 "현재값" 표시도 최신으로 따라가게 한다.
    renderWritePanel(false);
  } catch (e) { showToast('모니터링 값 갱신 실패: ' + e.message, 'error'); }
}

// ID·태그이름·주소·값으로 검색 후 100개씩 페이지를 잘라서 그린다 — 실제 폴링(2.5초 자동 갱신)이
// 매번 이 함수를 다시 부르지만, DOM에는 최대 100행만 남으므로 태그가 몇만 개여도 버벅이지 않는다.
function renderMonFolderTable() {
  const body = document.getElementById('monFolderBody');
  const empty = document.getElementById('monFolderEmpty');
  const view = filterAndSort(monFolderTags, monFolderSearch, ['id', 'name', 'address', 'value'], null);

  const totalPages = Math.max(1, Math.ceil(view.length / MON_FOLDER_PAGE_SIZE));
  monFolderPage = Math.min(Math.max(1, monFolderPage), totalPages);
  const startIdx = (monFolderPage - 1) * MON_FOLDER_PAGE_SIZE;
  monFolderPageRows = view.slice(startIdx, startIdx + MON_FOLDER_PAGE_SIZE);

  document.getElementById('monFolderCount').textContent =
    `총 ${view.length}건` + (view.length !== monFolderTags.length ? ` (전체 ${monFolderTags.length}건 중)` : '');

  document.querySelectorAll('.mon-folder-total-pages').forEach(el => el.textContent = totalPages);
  document.querySelectorAll('.mon-folder-pager .pagination-page-input').forEach(el => {
    if (document.activeElement !== el) el.value = monFolderPage;   // 입력 중이면 덮어쓰지 않음
  });
  document.querySelectorAll('.mon-folder-pager [data-act=first], .mon-folder-pager [data-act=prev]')
    .forEach(b => b.disabled = monFolderPage <= 1);
  document.querySelectorAll('.mon-folder-pager [data-act=next], .mon-folder-pager [data-act=last]')
    .forEach(b => b.disabled = monFolderPage >= totalPages);

  if (view.length === 0) {
    body.innerHTML = '';
    empty.hidden = false;
    empty.textContent = monFolderTags.length === 0 ? '표시할 태그가 없습니다.' : '검색 결과가 없습니다.';
    return;
  }
  empty.hidden = true;
  body.innerHTML = monFolderPageRows.map(t => `
    <tr data-writable data-id="${t.id}" class="${selectedWriteTagIds.has(t.id) ? 'is-write-selected' : ''}">
      <td class="id-col">${t.id}</td>
      <td class="name-col">${escapeHtml(t.name)}</td>
      <td><span class="addr">${escapeHtml(t.address)}</span></td>
      <td class="truncate-col" title="${escapeHtml(t.folderName)}">${escapeHtml(t.folderName)}</td>
      <td class="val-col">${t.value === null ? '—' : t.value}</td>
    </tr>`).join('');
  [...body.children].forEach((tr, i) => tr.addEventListener('click', e => handleWriteRowClick(e, i)));
}

function handleWriteRowClick(e, index) {
  const tag = monFolderPageRows[index];
  if (!tag) return;
  if (e.shiftKey && writeAnchorIndex !== null) {
    // Shift 범위선택은 지금 페이지에 보이는 행 기준으로만 동작한다 — 다른 페이지 행은 화면에
    // 없어서 "범위"라는 개념 자체가 성립하지 않는다.
    const [lo, hi] = writeAnchorIndex < index ? [writeAnchorIndex, index] : [index, writeAnchorIndex];
    selectedWriteTagIds = new Set(monFolderPageRows.slice(lo, hi + 1).map(t => t.id));
  } else if (e.ctrlKey || e.metaKey) {
    if (selectedWriteTagIds.has(tag.id)) selectedWriteTagIds.delete(tag.id);
    else selectedWriteTagIds.add(tag.id);
    writeAnchorIndex = index;
  } else {
    selectedWriteTagIds = new Set([tag.id]);
    writeAnchorIndex = index;
  }
  document.querySelectorAll('#monFolderBody tr').forEach(tr =>
    tr.classList.toggle('is-write-selected', selectedWriteTagIds.has(Number(tr.dataset.id))));
  renderWritePanel(true);
}

// refillValue: 사용자가 방금 선택을 바꿔서 다시 그리는 경우에만 입력창을 채운다.
// 2초 주기 자동 새로고침으로 다시 그릴 때도 매번 채우면 입력 중인 값이 계속 지워지기 때문에 false로 호출.
function renderWritePanel(refillValue) {
  const selected = monFolderTags.filter(t => selectedWriteTagIds.has(t.id));
  const empty = document.getElementById('writePanelEmpty');
  const form = document.getElementById('writePanelForm');
  if (selected.length === 0) { empty.hidden = false; form.hidden = true; return; }
  empty.hidden = true;
  form.hidden = false;
  document.getElementById('writeSelCount').textContent =
    selected.length === 1 ? `"${selected[0].name}" 선택됨` : `${selected.length}개 태그 선택됨`;
  document.getElementById('writeSelList').innerHTML = selected.map(t => `
    <div class="write-sel-row" data-id="${t.id}">
      <span class="write-sel-id">#${t.id}</span>
      <span class="write-sel-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
      <span class="write-sel-addr">${escapeHtml(t.address)}</span>
      <span class="write-sel-val">${t.value === null ? '—' : t.value}</span>
    </div>`).join('');
  document.getElementById('writeSubmitBtn').textContent = selected.length === 1 ? '쓰기' : `${selected.length}개에 쓰기`;
  if (refillValue) {
    const input = document.getElementById('writeValueInput');
    input.value = selected.length === 1 && selected[0].value !== null ? selected[0].value : '';
    input.focus();
  }
}

// folderId를 같이 보내서, 같은 이름의 태그가 다른 폴더에도 있어 모호해지는 경우를 막는다.
// 선택된 태그가 여럿이면 같은 값을 순서대로 각각에 써서(엑셀 범위 채우기와 동일한 효과) 일괄 반영한다.
document.getElementById('writePanelForm').addEventListener('submit', async e => {
  e.preventDefault();
  const selected = monFolderTags.filter(t => selectedWriteTagIds.has(t.id));
  if (selected.length === 0) return;
  const value = document.getElementById('writeValueInput').value;
  if (value === '') { showToast('값을 입력하세요', 'error'); return; }
  let okCount = 0, failCount = 0;
  for (const tag of selected) {
    try {
      const qs = `?name=${encodeURIComponent(tag.name)}&value=${encodeURIComponent(value)}&folderId=${tag.folderId}`;
      const res = await fetch('/api/foldertag/write/by-name' + qs);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '쓰기 실패');
      // 백그라운드 폴러가 캐시를 갱신할 다음 2초 주기를 기다리지 않고, 방금 쓴 값(서버가 쓰기 직후
      // 다시 읽어 검증한 값)으로 표를 바로 낙관적으로 갱신한다.
      const written = json.value ?? Number(value);
      tag.value = written;
      const row = document.querySelector(`#monFolderBody tr[data-id="${tag.id}"]`);
      if (row) row.querySelector('.val-col').textContent = written;
      okCount++;
    } catch (err) { failCount++; }
  }
  renderWritePanel(false);
  if (failCount === 0) showToast(`${okCount}개 태그에 ${value} 썼습니다`, 'success');
  else if (okCount === 0) showToast(`${failCount}개 태그 쓰기 모두 실패`, 'error');
  else showToast(`${okCount}개 성공 / ${failCount}개 실패`, 'error');
  const panel = document.getElementById('writePanel');
  panel.classList.add('is-flash');
  setTimeout(() => panel.classList.remove('is-flash'), 700);
  await refreshMonitorFolder();
  refreshWriteLog();
});

// ── 4-2) 알람 태그 실시간 상태 ──────────────────────────────────────────
function populateMonitorAlarmFolderSelect() {
  const sel = document.getElementById('monAlarmFolderSelect');
  const current = sel.value || 'ALL';
  sel.innerHTML = '<option value="ALL">전체 폴더</option>' + alarmFolders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === current) ? current : 'ALL';
}
document.getElementById('monAlarmFolderSelect').addEventListener('change', refreshMonitorAlarm);

function alarmStatusBadge(isOn) {
  if (isOn === null || isOn === undefined) return `<span class="badge badge-alarm-unknown">확인중</span>`;
  return isOn ? `<span class="badge badge-alarm-on">ON</span>` : `<span class="badge badge-alarm-off">OFF</span>`;
}

// 카드 클릭으로 고른 알람 태그들 — 모니터링 태그 표와 동일한 엑셀 스타일 다중선택.
// 클릭=단일 선택(기준점 이동), Shift+클릭=기준점~클릭 범위, Ctrl/Cmd+클릭=개별 추가·제거.
let monAlarmTags = [];
let selectedAlarmTagIds = new Set();
let alarmAnchorIndex = null;

async function refreshMonitorAlarm() {
  const folderId = document.getElementById('monAlarmFolderSelect').value;
  const qs = folderId === 'ALL' ? '' : `?folderId=${folderId}`;
  try {
    const { tags, lastPollAt } = await api('GET', '/api/admin/monitor/alarmtags' + qs);
    monAlarmTags = tags;
    const grid = document.getElementById('monAlarmGrid');
    const empty = document.getElementById('monAlarmEmpty');
    document.getElementById('monAlarmCount').textContent = `총 ${tags.length}건`;
    document.getElementById('monAlarmUpdatedAt').textContent = formatUpdatedAt(lastPollAt);
    // 폴더 전환 등으로 목록에서 사라진 태그는 선택에서도 정리한다.
    const stillValidIds = new Set(tags.map(t => t.tagId));
    [...selectedAlarmTagIds].forEach(id => { if (!stillValidIds.has(id)) selectedAlarmTagIds.delete(id); });
    if (tags.length === 0) { grid.innerHTML = ''; empty.hidden = false; renderAlarmSelCtrl(); return; }
    empty.hidden = true;
    grid.innerHTML = tags.map(t => `
      <div class="alarm-card${t.isOn ? ' is-on' : ''}${selectedAlarmTagIds.has(t.tagId) ? ' is-selected' : ''}" data-tag-id="${t.tagId}">
        <div class="alarm-card-top">
          <span class="alarm-card-name" title="${escapeHtml(t.tagName)}">${escapeHtml(t.tagName)}</span>
          ${alarmStatusBadge(t.isOn)}
        </div>
        <div class="alarm-card-msg">${escapeHtml(t.alarmMsg)}</div>
        <div class="alarm-card-meta">
          <span class="addr">${escapeHtml(t.address)}</span>
          <span class="alarm-card-folder" title="${escapeHtml(t.folderName)}">${escapeHtml(t.folderName)}</span>
          <div class="alarm-write-btns">
            <button type="button" class="alarm-write-btn${t.isOn ? ' is-active' : ''}" data-value="1" title="1 쓰기">1</button>
            <button type="button" class="alarm-write-btn${t.isOn === false ? ' is-active' : ''}" data-value="0" title="0 쓰기">0</button>
          </div>
          <span class="alarm-card-level">Lv.${t.level}</span>
        </div>
      </div>`).join('');
    [...grid.children].forEach((card, i) => {
      card.querySelectorAll('.alarm-write-btn').forEach(btn =>
        btn.addEventListener('click', e => { e.stopPropagation(); writeAlarmValue(tags[i], Number(btn.dataset.value)); }));
      card.addEventListener('click', e => handleAlarmCardClick(e, i));
    });
    renderAlarmSelCtrl();
  } catch (e) { showToast('알람 상태 갱신 실패: ' + e.message, 'error'); }
}

function handleAlarmCardClick(e, index) {
  const tag = monAlarmTags[index];
  if (!tag) return;
  if (e.shiftKey && alarmAnchorIndex !== null) {
    const [lo, hi] = alarmAnchorIndex < index ? [alarmAnchorIndex, index] : [index, alarmAnchorIndex];
    selectedAlarmTagIds = new Set(monAlarmTags.slice(lo, hi + 1).map(t => t.tagId));
  } else if (e.ctrlKey || e.metaKey) {
    if (selectedAlarmTagIds.has(tag.tagId)) selectedAlarmTagIds.delete(tag.tagId);
    else selectedAlarmTagIds.add(tag.tagId);
    alarmAnchorIndex = index;
  } else {
    selectedAlarmTagIds = new Set([tag.tagId]);
    alarmAnchorIndex = index;
  }
  document.querySelectorAll('#monAlarmGrid .alarm-card').forEach(card =>
    card.classList.toggle('is-selected', selectedAlarmTagIds.has(Number(card.dataset.tagId))));
  renderAlarmSelCtrl();
}

function renderAlarmSelCtrl() {
  const n = selectedAlarmTagIds.size;
  document.getElementById('alarmSelCount').textContent = n > 0 ? `${n}개 선택` : '선택 없음';
  document.getElementById('alarmBatchOnBtn').disabled = n === 0;
  document.getElementById('alarmBatchOffBtn').disabled = n === 0;
}

// 확인창 없이 바로 쓴다 — folders_tags에 등록 안 된 주소라도 plcId+address로 직접 쓸 수 있는
// 기존 엔드포인트(/api/foldertag/write/by-address)를 그대로 재사용한다.
async function writeAlarmValue(tag, value) {
  try {
    const qs = `?plcId=${encodeURIComponent(tag.plcId)}&address=${encodeURIComponent(tag.address)}&value=${value}`;
    const res = await fetch('/api/foldertag/write/by-address' + qs);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '쓰기 실패');
    showToast(`"${tag.tagName}"에 ${value} 썼습니다`, 'success');
    await refreshMonitorAlarm();
    refreshWriteLog();
  } catch (e) { showToast('쓰기 실패: ' + e.message, 'error'); }
}

// 선택된 알람 태그 전체에 같은 값을 순서대로 써서(엑셀 범위 채우기와 동일한 효과) 일괄 반영한다.
async function writeAlarmValuesBatch(tags, value) {
  if (tags.length === 0) return;
  let okCount = 0, failCount = 0;
  for (const tag of tags) {
    try {
      const qs = `?plcId=${encodeURIComponent(tag.plcId)}&address=${encodeURIComponent(tag.address)}&value=${value}`;
      const res = await fetch('/api/foldertag/write/by-address' + qs);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '쓰기 실패');
      okCount++;
    } catch (e) { failCount++; }
  }
  if (failCount === 0) showToast(`${okCount}개 태그에 ${value} 썼습니다`, 'success');
  else if (okCount === 0) showToast(`${failCount}개 태그 쓰기 모두 실패`, 'error');
  else showToast(`${okCount}개 성공 / ${failCount}개 실패`, 'error');
  await refreshMonitorAlarm();
  refreshWriteLog();
}
document.getElementById('alarmBatchOnBtn').addEventListener('click', () =>
  writeAlarmValuesBatch(monAlarmTags.filter(t => selectedAlarmTagIds.has(t.tagId)), 1));
document.getElementById('alarmBatchOffBtn').addEventListener('click', () =>
  writeAlarmValuesBatch(monAlarmTags.filter(t => selectedAlarmTagIds.has(t.tagId)), 0));

// ── 4-3) 온도 태그 트렌드 ──────────────────────────────────────────
async function populateMonitorTempEquipSelect() {
  const { equipIds } = await api('GET', '/api/admin/temptags/equipids');
  const sel = document.getElementById('monTempEquipSelect');
  const current = sel.value || '';
  sel.innerHTML = '<option value="">전체 설비</option>' + equipIds.map(eq => `<option value="${escapeHtml(eq)}">${escapeHtml(eq)}</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === current) ? current : '';
}
document.getElementById('monTempEquipSelect').addEventListener('change', refreshMonitorTemp);
// 30초 자동 갱신을 기다리지 않고, 방금 등록/수정한 온도 태그를 바로 확인하고 싶을 때 쓰는 수동 새로고침.
document.getElementById('monTempRefreshBtn').addEventListener('click', refreshMonitorTemp);

// 설비(equip_id) 기준으로 묶어서 카드 하나 = 설비 하나로 보여준다. equip_id를 안 적어둔
// 태그들은 "(설비 미지정)"으로 따로 묶어서 누락도 눈에 보이게 한다.
function groupTempTagsByEquip(tags) {
  const groups = new Map();
  for (const t of tags) {
    const key = t.equipId || '(설비 미지정)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return groups;
}

const TEMP_RANGE_LABELS = { 60: '1시간', 180: '3시간', 360: '6시간', 1440: '24시간', 4320: '3일', 10080: '7일' };
let monTempRangeMins = 360;   // 기본 6시간

document.querySelectorAll('#monTempRangeGroup .range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#monTempRangeGroup .range-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    monTempRangeMins = Number(btn.dataset.mins);
    document.getElementById('monTempRangeLabel').textContent = `tb_temp_snapshot 최근 ${TEMP_RANGE_LABELS[monTempRangeMins]}`;
    refreshMonitorTemp();
  });
});

async function refreshMonitorTemp() {
  const equipId = document.getElementById('monTempEquipSelect').value;
  const qs = `?minutes=${monTempRangeMins}` + (equipId ? `&equipId=${encodeURIComponent(equipId)}` : '');
  const includeDate = monTempRangeMins >= 1440;   // 24시간 이상이면 자정을 넘나들 수 있어 날짜도 같이 표시
  try {
    const { tags } = await api('GET', '/api/admin/monitor/temptags' + qs);
    const grid = document.getElementById('monTempGrid');
    const empty = document.getElementById('monTempEmpty');
    const groups = groupTempTagsByEquip(tags);
    document.getElementById('monTempCount').textContent = `총 ${groups.size}개 설비 (태그 ${tags.length}개)`;
    document.getElementById('monTempUpdatedAt').textContent = formatUpdatedAt(new Date().toISOString());
    if (tags.length === 0) {
      grid.innerHTML = ''; empty.hidden = false;
      tempChartInstances.forEach(c => c.destroy()); tempChartInstances.clear();
      return;
    }
    empty.hidden = true;

    // 더 이상 존재하지 않는 설비의 카드/차트는 정리한다(태그를 지우거나 설비명을 바꾼 경우).
    const currentEquips = new Set(groups.keys());
    grid.querySelectorAll('.trend-card').forEach(card => {
      if (!currentEquips.has(card.dataset.equip)) {
        tempChartInstances.get(card.dataset.equip)?.destroy();
        tempChartInstances.delete(card.dataset.equip);
        card.remove();
      }
    });

    for (const [equip, groupTags] of groups) {
      const card = ensureTempCard(equip, groupTags.length);
      const { labels, namedSeries } = buildAlignedSeries(groupTags, includeDate);
      renderOrUpdateTempChart(card, labels, namedSeries);
      card.querySelector('.trend-legend').innerHTML = groupTags.map((t, i) => `
        <div class="trend-legend-item">
          <span class="legend-dot" style="background:${TREND_COLORS[i % TREND_COLORS.length]}"></span>
          <span class="legend-name" title="${escapeHtml(t.tagName)}">${escapeHtml(t.trendName || t.tagName)}</span>
          <b>${t.current === null ? '값 없음' : t.current.toFixed(1)}</b>
        </div>`).join('');
    }
  } catch (e) { showToast('온도 트렌드 갱신 실패: ' + e.message, 'error'); }
}

// 문자열 태그 관리 탭(GET /api/admin/stringtags)과 같은 엔드포인트를 그대로 재사용한다 —
// 값 자체가 StringTagMonitorService의 메모리 캐시라 여기서 다시 조회해도 PLC 통신은 없다.
async function refreshMonitorString() {
  try {
    const { tags, lastPollAt } = await api('GET', '/api/admin/stringtags');
    const body = document.getElementById('monStringBody');
    const empty = document.getElementById('monStringEmpty');
    document.getElementById('monStringCount').textContent = `총 ${tags.length}건`;
    document.getElementById('monStringUpdatedAt').textContent = formatUpdatedAt(lastPollAt);
    if (tags.length === 0) { body.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    body.innerHTML = tags.map(t => `
      <tr>
        <td class="id-col">${t.stringId}</td>
        <td class="name-col">${escapeHtml(t.tagName)}</td>
        <td><span class="addr">${escapeHtml(t.address)}</span></td>
        <td class="truncate-col" title="${escapeHtml(t.plcId)}">${escapeHtml(t.plcId)}</td>
        <td class="mono is-dblclick-write" data-string-id="${t.stringId}" title="더블클릭하면 값을 쓸 수 있습니다">${t.value != null && t.value !== '' ? escapeHtml(t.value) : '—'}</td>
      </tr>`).join('');
    [...body.children].forEach((tr, i) => {
      const t = tags[i];
      tr.querySelector('.is-dblclick-write').addEventListener('dblclick', async () => {
        const value = prompt(`"${t.tagName}"에 쓸 문자열 (최대 ${t.wordCount * 2}자, 아스키 문자만 — 한글 불가)`, t.value || '');
        if (value === null) return;
        if (!isAsciiOnly(value)) { showToast('아스키(영문/숫자/기호) 문자만 쓸 수 있습니다 — 한글 등은 불가합니다', 'error'); return; }
        try {
          const result = await api('GET', `/api/admin/stringtags/write/by-name?name=${encodeURIComponent(t.tagName)}&value=${encodeURIComponent(value)}&folderId=${t.folderId}`);
          if (result.truncated) showToast('입력한 문자열이 너무 길어 일부가 잘렸습니다(그래도 썼습니다)', 'error');
          else showToast('값을 썼습니다', 'success');
          await refreshMonitorString();
        } catch (e) { showToast(e.message, 'error'); }
      });
    });
  } catch (e) { showToast(e.message, 'error'); }
}

async function refreshMonitorDw() {
  try {
    const { tags, lastPollAt } = await api('GET', '/api/admin/dwtags');
    const body = document.getElementById('monDwBody');
    const empty = document.getElementById('monDwEmpty');
    document.getElementById('monDwCount').textContent = `총 ${tags.length}건`;
    document.getElementById('monDwUpdatedAt').textContent = formatUpdatedAt(lastPollAt);
    if (tags.length === 0) { body.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    body.innerHTML = tags.map(t => `
      <tr>
        <td class="id-col">${t.id}</td>
        <td class="name-col">${escapeHtml(t.name)}</td>
        <td><span class="addr">${escapeHtml(t.address)}</span></td>
        <td class="truncate-col" title="${escapeHtml(t.plcId)}">${escapeHtml(t.plcId)}</td>
        <td class="mono is-dblclick-write" data-dw-id="${t.id}" title="더블클릭하면 값을 쓸 수 있습니다">${t.value != null ? t.value : '—'}</td>
      </tr>`).join('');
    [...body.children].forEach((tr, i) => {
      const t = tags[i];
      tr.querySelector('.is-dblclick-write').addEventListener('dblclick', async () => {
        const input = prompt(`"${t.name}"에 쓸 정수값 (${t.signed ? '부호있음' : '부호없음'}, ${t.wordCount * 16}비트)`, t.value != null ? String(t.value) : '0');
        if (input === null) return;
        if (!/^-?\d+$/.test(input.trim())) { showToast('정수만 입력할 수 있습니다', 'error'); return; }
        try {
          await api('GET', `/api/admin/dwtags/write/by-name?name=${encodeURIComponent(t.name)}&value=${encodeURIComponent(input.trim())}&folderId=${t.folderId}`);
          showToast('값을 썼습니다', 'success');
          await refreshMonitorDw();
        } catch (e) { showToast(e.message, 'error'); }
      });
    });
  } catch (e) { showToast(e.message, 'error'); }
}

async function refreshAllMonitor() {
  if (!isMonitorTabActive()) return;
  await Promise.all([refreshMonitorFolder(), refreshMonitorAlarm(), refreshMonitorTemp(), refreshMonitorString(), refreshMonitorDw()]);
  refreshWriteLog();
}

// 값 자체는 서버가 2초/30초 주기로 이미 갱신해두므로, 화면 새로고침은 그 주기에 맞춘다
// (모니터링·알람은 2초 — 서버 폴링 주기(PlcMonitor:IntervalMs)와 동일, 온도·문자열은 1분 — 화면 로드 후 요청된 주기).
setInterval(() => { if (isMonitorTabActive()) { refreshMonitorFolder(); refreshMonitorAlarm(); refreshWriteLog(); } }, 2000);
setInterval(() => { if (isMonitorTabActive()) refreshMonitorTemp(); }, 60000);
setInterval(() => { if (isMonitorTabActive()) refreshMonitorString(); }, 60000);
setInterval(() => { if (isMonitorTabActive()) refreshMonitorDw(); }, 60000);

// ============================================================================
// 초기 로딩
// ============================================================================
(async function init() {
  // 정렬 헤더는 정적 마크업이라 한 번만 연결한다.
  setupSortableHeaders('plcTable', plcSort, renderPlcTable);
  setupSortableHeaders('folderTagTable', folderTagSort, renderFolderTagTable);
  setupSortableHeaders('tempTagTable', tempTagSort, renderTempTagTable);
  setupSortableHeaders('alarmTagTable', alarmTagSort, renderAlarmTagTable);
  setupSortableHeaders('stringTagTable', stringTagSort, renderStringTagTable);
  setupSortableHeaders('dwTagTable', dwTagSort, renderDwTagTable);

  try {
    await loadPlcOptions();
    await loadPlcs();
    await loadFolders();
    updateFolderTagExportLink();
    await selectFolder('ALL');          // 모니터링 태그 화면은 처음부터 "전체"로 시작
    populateMonitorFolderSelect();
    await loadEquipIds();
    updateTempTagExportLink();
    await loadTempTags();
    await loadSnapshotColumns();
    await populateMonitorTempEquipSelect();
    await loadAlarmFolders();
    updateAlarmTagExportLink();
    await selectAlarmFolder('ALL');
    populateMonitorAlarmFolderSelect();
    // 실시간 모니터링의 알람 서브탭은 "전체"(238개) 대신 첫 폴더로 좁혀서 시작한다 — 그게 더 쓸모있다.
    if (alarmFolders.length > 0) document.getElementById('monAlarmFolderSelect').value = alarmFolders[0].id;
    await selectStringFolder('ALL');
    await selectDwFolder('ALL');
    await refreshPollStatus();          // PLC 관리가 기본 진입 탭이라 첫 화면부터 바로 채워준다
  } catch (e) {
    showToast('초기 로딩 실패: ' + e.message, 'error');
  }
})();
