import {createClient} from '@supabase/supabase-js';

const $ = selector => document.querySelector(selector);
const config = window.CLOUD_CONFIG;
const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
const usernameInput = $('#username');
const passwordInput = $('#password');
const authStatus = $('#auth-status');
let mode = 'login';
let currentUser = null;
const usernameToEmail = value => `${value.toLowerCase()}@classroom-qr.invalid`;

function status(message, error = false) {authStatus.textContent = message; authStatus.classList.toggle('error', error);}
function setMode(next) {
  mode = next;
  $('#login-tab').setAttribute('aria-selected', String(mode === 'login'));
  $('#signup-tab').setAttribute('aria-selected', String(mode === 'signup'));
  $('#confirm-wrap').hidden = mode !== 'signup';
  $('#confirm-password').required = mode === 'signup';
  passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('#auth-title').textContent = mode === 'signup' ? '처음 오셨나요?' : '다시 만나요.';
  $('#auth-submit').textContent = mode === 'signup' ? '가입하기 ↗' : '로그인하기 ↗';
  status('');
}
function showSession(session) {
  currentUser = session?.user || null;
  $('#auth-view').hidden = !!currentUser;
  $('#qr-view').hidden = !currentUser;
  if (currentUser) $('#session-user').textContent = `${currentUser.email.split('@')[0]}님, 안녕하세요.`;
  else {
    $('#qr-ready').hidden = true;
    $('#qr-empty').hidden = false;
    $('#qr-url').value = '';
    $('#qr-result-url').textContent = '';
    const canvas = $('#qr-canvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }
}
$('#login-tab').addEventListener('click', () => setMode('login'));
$('#signup-tab').addEventListener('click', () => setMode('signup'));
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!/^[a-z0-9_]{4,24}$/.test(username)) return status('아이디는 영문·숫자·밑줄 4~24자로 입력해 주세요.', true);
  if (password.length < 8) return status('비밀번호는 8자 이상 입력해 주세요.', true);
  if (mode === 'signup' && password !== $('#confirm-password').value) return status('비밀번호 확인이 일치하지 않습니다.', true);
  $('#auth-submit').disabled = true;
  status(mode === 'signup' ? '가입하고 있어요…' : '로그인하고 있어요…');
  try {
    const credentials = {email:usernameToEmail(username), password};
    const {data, error} = mode === 'signup' ? await supabase.auth.signUp(credentials) : await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
    if (!data.session) {
      if (mode === 'signup') throw new Error('이 아이디는 사용할 수 없습니다. 다른 아이디로 시도하거나 담당 교사에게 문의하세요.');
      throw new Error('로그인 세션을 만들지 못했습니다.');
    }
    passwordInput.value = '';
    $('#confirm-password').value = '';
    showSession(data.session);
    status('');
  } catch (error) {
    const code = error.code || '';
    status(code === 'invalid_credentials' ? '아이디 또는 비밀번호를 확인해 주세요.' : code === 'user_already_exists' ? '이미 사용 중인 아이디입니다.' : code.includes('rate') ? '잠시 후 다시 시도해 주세요.' : code === 'email_not_confirmed' ? '계정 설정을 확인해야 합니다. 담당 교사에게 문의하세요.' : error.message || '로그인하지 못했습니다.', true);
  } finally {$('#auth-submit').disabled = false;}
});
$('#logout').addEventListener('click', async () => {
  const {error} = await supabase.auth.signOut();
  if (error) return alert('로그아웃하지 못했습니다. 다시 시도해 주세요.');
  showSession(null);
});
supabase.auth.onAuthStateChange((_event, session) => showSession(session));
supabase.auth.getSession().then(({data, error}) => {if (!error) showSession(data.session); else status('로그인 상태를 확인하지 못했습니다.', true);});

$('#qr-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!currentUser) return;
  $('#qr-error').textContent = '';
  $('#qr-ready').hidden = true;
  $('#qr-empty').hidden = false;
  let url;
  try {url = new URL($('#qr-url').value.trim()); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();}
  catch {$('#qr-error').textContent = 'http:// 또는 https://로 시작하는 올바른 웹주소를 입력해 주세요.'; return;}
  try {
    const qrcode = window.qrcode;
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const qr = qrcode(0, 'M');
    qr.addData(url.href);
    qr.make();
    const canvas = $('#qr-canvas');
    const context = canvas.getContext('2d');
    const modules = qr.getModuleCount();
    const cells = modules + 8;
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (qr.isDark(row, col)) {
      const x = Math.floor((col + 4) * canvas.width / cells), y = Math.floor((row + 4) * canvas.height / cells);
      context.fillRect(x, y, Math.floor((col + 5) * canvas.width / cells) - x, Math.floor((row + 5) * canvas.height / cells) - y);
    }
    $('#qr-result-url').textContent = url.href;
    $('#qr-ready').hidden = false;
    $('#qr-empty').hidden = true;
  } catch {$('#qr-error').textContent = '주소가 너무 길어 QR로 만들지 못했습니다. 더 짧은 주소를 사용해 주세요.';}
});
$('#qr-download').addEventListener('click', () => {
  if (!currentUser || $('#qr-ready').hidden) return;
  const link = document.createElement('a'); link.href = $('#qr-canvas').toDataURL('image/png'); link.download = 'classroom-qr.png'; link.click();
});
