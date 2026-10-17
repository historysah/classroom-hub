(() => {
  'use strict';
  const useServer = location.origin === 'http://127.0.0.1:4174';

  const $ = selector => document.querySelector(selector);
  const launch = $('#diary-launch');
  const app = $('#diary-app');
  const form = $('#diary-form');
  const list = $('#diary-list');
  const status = $('#diary-status');
  const dateInput = $('#diary-date');
  const titleInput = $('#diary-entry-title');
  const bodyInput = $('#diary-body');
  const saveButton = $('#diary-save');
  const deleteButton = $('#diary-delete');
  let entries = [];
  let selectedId = null;
  let savedDraft = '';
  let folderStore = null;
  let rememberedFolder = null;

  function handleDatabase(action) {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('브라우저 폴더 기억 기능을 사용할 수 없습니다.'));
      const request = indexedDB.open('classroom-hub-diary-folder', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('settings', action.type);
        const item = action.type === 'readwrite'
          ? transaction.objectStore('settings').put(action.value, 'folder')
          : transaction.objectStore('settings').get('folder');
        item.onsuccess = () => resolve(item.result);
        item.onerror = () => reject(item.error);
        transaction.oncomplete = () => database.close();
        transaction.onabort = () => database.close();
      };
    });
  }

  function draft() {
    return JSON.stringify([dateInput.value, titleInput.value, bodyInput.value]);
  }

  function mayLeaveDraft() {
    return draft() === savedDraft || confirm('저장하지 않은 내용이 있습니다. 다른 일기로 이동할까요?');
  }

  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  function resetEditor() {
    selectedId = null;
    form.reset();
    dateInput.value = today();
    $('#diary-form-title').innerHTML = '새 일기 쓰기<span class="heading-dot">.</span>';
    saveButton.innerHTML = '일기 저장하기 <span aria-hidden="true">↗</span>';
    deleteButton.hidden = true;
    setStatus('');
    savedDraft = draft();
    renderList();
  }

  function renderList() {
    list.replaceChildren();
    $('#diary-count').textContent = `${entries.length}개의 기록`;
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'diary-list-empty';
      empty.textContent = '아직 저장된 일기가 없어요. 첫 기록을 남겨 보세요.';
      list.append(empty);
      return;
    }
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'diary-list-item';
      button.classList.toggle('active', entry.id === selectedId);
      button.setAttribute('aria-label', `${entry.entryDate} ${entry.title} 열기`);
      const date = document.createElement('span');
      date.className = 'diary-list-date';
      date.textContent = entry.entryDate;
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const preview = document.createElement('span');
      preview.className = 'diary-list-preview';
      preview.textContent = entry.body.replace(/\s+/g, ' ').slice(0, 70);
      button.append(date, title, preview);
      button.addEventListener('click', () => {
        if (!mayLeaveDraft()) return;
        selectedId = entry.id;
        dateInput.value = entry.entryDate;
        titleInput.value = entry.title;
        bodyInput.value = entry.body;
        $('#diary-form-title').innerHTML = '일기 다시 보기<span class="heading-dot">.</span>';
        saveButton.innerHTML = '변경 저장하기 <span aria-hidden="true">↗</span>';
        deleteButton.hidden = false;
        setStatus('');
        savedDraft = draft();
        renderList();
        titleInput.focus();
      });
      list.append(button);
    }
  }

  async function api(path, options) {
    if (!useServer) {
      if (!folderStore) throw new Error('일기 폴더를 먼저 선택해 주세요.');
      const method = options?.method || 'GET';
      const id = Number(path.match(/^\/api\/diary\/(\d+)$/)?.[1]);
      if (method === 'GET' && path === '/api/diary') return {entries:folderStore.list()};
      if (method === 'POST' && path === '/api/diary') return {entry:await folderStore.create(JSON.parse(options.body))};
      if (method === 'PUT' && id) return {entry:await folderStore.update(id, JSON.parse(options.body))};
      if (method === 'DELETE' && id) return {deleted:await folderStore.remove(id)};
      throw new Error('지원하지 않는 일기 요청입니다.');
    }
    const response = await fetch(path, {cache:'no-store', ...options});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '일기장을 사용할 수 없습니다.');
    return result;
  }

  async function loadEntries() {
    try {
      entries = (await api('/api/diary')).entries;
      renderList();
    } catch {
      setStatus('일기 파일을 읽지 못했습니다. 저장 프로그램을 다시 실행해 주세요.', true);
    }
  }

  function activate() {
    launch.hidden = true;
    app.hidden = false;
    resetEditor();
    loadEntries();
  }

  if (useServer) activate();
  else {
    const connect = $('#diary-connect');
    const connectStatus = $('#diary-connect-status');
    const supported = typeof window.showDirectoryPicker === 'function' && typeof globalThis.initSqlJs === 'function' && window.isSecureContext !== false;
    connect.hidden = !supported;
    $('#diary-browser-fallback').hidden = supported;
    if (supported) {
      handleDatabase({type:'readonly'}).then(async handle => {
        if (!handle) return;
        rememberedFolder = handle;
        if (await handle.queryPermission({mode:'readwrite'}) === 'granted') {
          folderStore = await globalThis.ClassroomDiaryFolderStore.open(handle);
          activate();
        } else {
          connect.textContent = '기존 일기 폴더 다시 연결 ↗';
          connectStatus.textContent = '브라우저가 폴더 접근을 다시 확인할 수 있습니다.';
        }
      }).catch(() => {rememberedFolder = null;});
      connect.addEventListener('click', async () => {
        connect.disabled = true;
        connectStatus.textContent = '폴더를 연결하고 있어요…';
        try {
          let handle = rememberedFolder;
          if (handle && await handle.requestPermission({mode:'readwrite'}) !== 'granted') {
            rememberedFolder = null;
            connectStatus.textContent = '다시 눌러 저장 폴더를 선택해 주세요.';
            return;
          }
          if (!handle) handle = await window.showDirectoryPicker({id:'classroom-hub-diary', mode:'readwrite'});
          folderStore = await globalThis.ClassroomDiaryFolderStore.open(handle);
          rememberedFolder = handle;
          handleDatabase({type:'readwrite', value:handle}).catch(() => {});
          activate();
        } catch (error) {
          rememberedFolder = null;
          if (error?.name === 'AbortError') connectStatus.textContent = '폴더 선택을 취소했습니다.';
          else connectStatus.textContent = '폴더를 연결하지 못했습니다. data 폴더를 선택해 다시 시도해 주세요.';
        } finally { connect.disabled = false; }
      });
    }
  }
  $('#diary-new').addEventListener('click', () => {if (!mayLeaveDraft()) return; resetEditor(); titleInput.focus();});

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const entry = {entryDate:dateInput.value, title:titleInput.value.trim(), body:bodyInput.value.trim()};
    if (!entry.entryDate || !entry.title || !entry.body) {
      setStatus('날짜, 제목, 내용을 모두 입력해 주세요.', true);
      return;
    }
    saveButton.disabled = true;
    setStatus('저장하고 있어요…');
    try {
      const editing = selectedId !== null;
      const path = editing ? `/api/diary/${selectedId}` : '/api/diary';
      const result = await api(path, {method:editing ? 'PUT' : 'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});
      selectedId = result.entry.id;
      entries = (await api('/api/diary')).entries;
      renderList();
      deleteButton.hidden = false;
      $('#diary-form-title').innerHTML = '일기 다시 보기<span class="heading-dot">.</span>';
      saveButton.innerHTML = '변경 저장하기 <span aria-hidden="true">↗</span>';
      savedDraft = draft();
      setStatus('일기를 로컬 폴더에 저장했어요.');
    } catch (error) {
      setStatus(error.message || '저장하지 못했습니다.', true);
    } finally {
      saveButton.disabled = false;
    }
  });

  deleteButton.addEventListener('click', async () => {
    if (selectedId === null || !confirm('이 일기를 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.')) return;
    deleteButton.disabled = true;
    try {
      await api(`/api/diary/${selectedId}`, {method:'DELETE'});
      entries = (await api('/api/diary')).entries;
      resetEditor();
      setStatus('일기를 삭제했어요.');
    } catch (error) {
      setStatus(error.message || '삭제하지 못했습니다.', true);
    } finally {
      deleteButton.disabled = false;
    }
  });
})();
