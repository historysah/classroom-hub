(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const catalog = Array.isArray(window.ClassroomToolCatalog) ? window.ClassroomToolCatalog : [];
  const storageKey = 'classroom-hub-plans-v1';
  const oldStorageKey = 'classroom-hub-tools-v1';
  const cards = $('#cards');
  const dialog = $('#tool-dialog');
  const form = $('#tool-form');
  let editingId = null;
  let plans = [];

  function cleanPlan(value) {
    if (!value || typeof value.name !== 'string') return null;
    const name = value.name.trim().slice(0, 32);
    if (!name) return null;
    return {
      id: typeof value.id === 'string' ? value.id : String(Date.now()),
      name,
      description: typeof value.description === 'string' ? value.description.trim().slice(0, 90) : ''
    };
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(oldStorageKey) || '[]');
    if (Array.isArray(saved)) plans = saved.map(cleanPlan).filter(Boolean);
  } catch { $('#storage-notice').hidden = false; }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(plans));
      return true;
    } catch { $('#storage-notice').hidden = false; return false; }
  }

  function renderCards() {
    const readyCards = catalog.map((tool, index) => `
      <article class="tool-card">
        <div class="tool-card-top"><span class="tool-no">NO. ${String(index + 1).padStart(2, '0')}</span><span class="tool-kind">${escapeHtml(tool.category || '내부 프로그램')}</span></div>
        <div class="tool-icon" aria-hidden="true">${escapeHtml(tool.icon || '✳')}</div>
        <div><h3>${escapeHtml(tool.name)}</h3><p>${escapeHtml(tool.description)}</p>
          <div class="tool-card-bottom"><a class="tool-open" href="#${encodeURIComponent(tool.id)}">도구 열기 ↗</a></div>
        </div>
      </article>`).join('');
    const planCards = plans.map((plan, index) => `
      <article class="tool-card plan-card">
        <div class="tool-card-top"><span class="tool-no">PLAN ${String(index + 1).padStart(2, '0')}</span><span class="tool-kind">준비 중</span></div>
        <div class="tool-icon" aria-hidden="true">${['✳', '◈', '✦'][index % 3]}</div>
        <div><h3>${escapeHtml(plan.name)}</h3><p>${escapeHtml(plan.description || '앞으로 허브 안에 만들 프로그램이에요.')}</p>
          <div class="tool-card-bottom"><span class="plan-status">개발 전</span>
            <div class="tool-card-menu"><button class="icon-button" type="button" data-edit="${escapeHtml(plan.id)}" aria-label="${escapeHtml(plan.name)} 계획 수정">✎</button><button class="icon-button" type="button" data-delete="${escapeHtml(plan.id)}" aria-label="${escapeHtml(plan.name)} 계획 삭제">×</button></div>
          </div>
        </div>
      </article>`).join('');
    cards.innerHTML = readyCards + planCards;
  }

  function route() {
    let id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { id = ''; }
    const tool = catalog.find(item => item.id === id && document.getElementById(item.viewId));
    $('#home-view').hidden = Boolean(tool);
    document.querySelectorAll('[data-tool-view]').forEach(view => {
      view.hidden = !tool || view.id !== tool.viewId;
    });
    document.querySelectorAll('[data-nav]').forEach(link => {
      const active = link.dataset.nav === (tool ? tool.id : 'home');
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = tool ? `${tool.name} — 교실 도구함` : '교실 도구함 — 수업을 위한 작은 도구들';
    window.scrollTo(0, 0);
  }

  function openDialog(plan = null) {
    editingId = plan?.id || null;
    form.reset();
    $('#tool-name').value = plan?.name || '';
    $('#tool-description').value = plan?.description || '';
    $('#tool-error').textContent = '';
    $('#dialog-title').textContent = plan ? '프로그램 계획 수정' : '프로그램 계획 추가';
    dialog.showModal();
    $('#tool-name').focus();
  }

  window.addEventListener('hashchange', route);
  route();
  renderCards();
  $('#add-tool').addEventListener('click', () => openDialog());
  $('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  cards.addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    if (edit) {
      const plan = plans.find(item => item.id === edit.dataset.edit);
      if (plan) openDialog(plan);
    }
    if (remove) {
      const plan = plans.find(item => item.id === remove.dataset.delete);
      if (plan && confirm(`'${plan.name}' 계획을 삭제할까요?`)) {
        plans = plans.filter(item => item.id !== plan.id);
        persist();
        renderCards();
      }
    }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = $('#tool-name').value.trim();
    const description = $('#tool-description').value.trim();
    if (!name) { $('#tool-error').textContent = '프로그램 이름을 입력해 주세요.'; return; }
    if (editingId) plans = plans.map(item => item.id === editingId ? {...item, name, description} : item);
    else plans.push({id:globalThis.crypto?.randomUUID?.() || String(Date.now()), name, description});
    persist();
    renderCards();
    dialog.close();
  });
})();
