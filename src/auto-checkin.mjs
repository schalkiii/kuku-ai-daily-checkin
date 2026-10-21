#!/usr/bin/env node
/**
 * 库库AI (GenFlowPro) 每日自动签到 + 对话领积分自动化脚本
 *
 * 参考 https://github.com/schalkiii/trae-daily-checkin 的实现思路，
 * 针对本地库库AI PC 客户端（Electron）通过 Chrome DevTools Protocol (CDP) 操控 DOM。
 *
 * 活动（2026-10 改版后）：账户菜单点「签到领奖」打开 kuku.baidu.com/comps/view 活动页（“金秋厚礼”），本脚本自动做满：
 *   1) 每日签到：连签 7 天解锁网盘 SVIP（点 img.kuku-sign-in__btn）
 *   2) 与库库AI对话 ×3：先点任务卡「去完成」再发消息才计入（积分 +10/次 + 抽奖机会）
 *   3) 浏览知识广场：点「去完成」跳知识广场（每日1次，+1 抽奖机会）
 *   4) 抽奖：点抽奖按钮转一次→点“开心收下”→循环到剩余0次（邀请需他人，不自动）
 * 旧 freepoint(daily_login/daily_chat 各 +50) 已下线（homenew 现返回空 activities）。
 *
 * 零第三方依赖，需 Node.js >= 18（内置 fetch 与全局 WebSocket）。
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ----------------------------------------------------------------------------
// 配置解析：命令行参数 > 环境变量 > config.json > 默认值
// ----------------------------------------------------------------------------

const DEFAULT_PORT = '9333'; // 9222 常被其它 Electron 应用（如 Lenovo Vantage）占用，默认用 9333
const EXE_NAME = 'GenFlowPro.exe';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { args.help = true; continue; }
    const flag = a.replace(/^--?/, '');
    if (a.startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[flag] = argv[++i];
    } else {
      args[flag] = true;
    }
  }
  return args;
}

function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

const argv = parseArgs(process.argv);
const cfg = loadConfig();
const env = process.env;
const pick = (argKey, envKey, cfgKey, def) =>
  argv[argKey] ?? env[envKey] ?? cfg[cfgKey] ?? def;

const OPTS = {
  help: !!argv.help,
  exe: pick('dir', 'KUKUCHECKIN_EXE', 'kukuExe', pick('exe', null, null, null)),
  port: String(pick('port', 'KUKUCHECKIN_PORT', 'debugPort', DEFAULT_PORT)),
  force: !!argv.force || env.KUKUCHECKIN_FORCE_RELAUNCH === '1',
  close: !!argv.close || env.KUKUCHECKIN_CLOSE === '1',
  profile: pick('profile', 'KUKUCHECKIN_USER_DATA_DIR', 'userDataDir', null),
  feishu: pick('feishu', 'KUKUCHECKIN_FEISHU_WEBHOOK', 'feishuWebhook', null),
  noPush: !!argv['no-push'],
  skipChat: !!argv['skip-chat'],
  skipCheckin: !!argv['skip-checkin'],
  skipBrowse: !!argv['skip-browse'],
  skipLottery: !!argv['skip-lottery'],
  maxDraws: Number(pick('max-draws', 'KUKUCHECKIN_MAX_DRAWS', 'maxDraws', '40')),
  chatTimes: Number(pick('chat-times', 'KUKUCHECKIN_CHAT_TIMES', 'chatTimes', '3')),  // 活动“与库库AI对话 N/3”，每轮需先点“去完成”再发消息才计数
  message: pick('message', 'KUKUCHECKIN_CHAT_MESSAGE', 'chatMessage', '回复我【1】 别说别的别思考'),
};

// ----------------------------------------------------------------------------
// 定位库库AI 可执行文件（自定义路径 -> 运行中进程 -> 注册表 -> 常见目录）
// ----------------------------------------------------------------------------

function isExe(p) { try { return fs.statSync(p).isFile() && /genflowpro\.exe$/i.test(p); } catch { return false; } }

function locateFromProcess() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='${EXE_NAME}'\\" | Select-Object -ExpandProperty ExecutablePath"`,
      { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    for (const line of out.split(/\r?\n/)) {
      const t = line.trim();
      if (isExe(t)) return t;
    }
  } catch { /* ignore */ }
  return null;
}

function locateFromRegistry() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "$p=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');foreach($k in $p){Get-ItemProperty $k -ErrorAction SilentlyContinue|Where-Object {$_.DisplayName -match '库库|GenFlow|KukuAI'}|ForEach-Object{$_.InstallLocation;$_.DisplayIcon}}"`,
      { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    for (const line of out.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (isExe(t)) return t;
      const cand = path.join(t, EXE_NAME);
      if (isExe(cand)) return cand;
    }
  } catch { /* ignore */ }
  return null;
}

function locateFromCommonDirs() {
  const bases = [
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Baidu', 'KukuAI'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs'),
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    os.homedir(),
  ];
  for (const base of bases) {
    if (!base || !fs.existsSync(base)) continue;
    const direct = path.join(base, EXE_NAME);
    if (isExe(direct)) return direct;
    // 有限深度扫描（3 层）
    try {
      const out = execSync(
        `powershell -NoProfile -Command "Get-ChildItem -LiteralPath '${base.replace(/'/g, "''")}' -Recurse -Depth 3 -Filter '${EXE_NAME}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName"`,
        { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] }
      );
      const t = out.trim().split(/\r?\n/)[0];
      if (isExe(t)) return t;
    } catch { /* ignore */ }
  }
  return null;
}

function locateKuku() {
  if (OPTS.exe) {
    const p = OPTS.exe;
    if (isExe(p)) return p;
    const cand = path.join(p, EXE_NAME);
    if (isExe(cand)) return cand;
  }
  return locateFromProcess() || locateFromRegistry() || locateFromCommonDirs();
}

// ----------------------------------------------------------------------------
// 进程管理：关闭 / 带调试端口启动
// ----------------------------------------------------------------------------

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function log(...a) { console.log(...a); }
function info(...a) { console.log('[INFO]', ...a); }
function ok(...a) { console.log('[OK]', ...a); }
function warn(...a) { console.log('[WARN]', ...a); }

function listKukuPids() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='${EXE_NAME}'\\" | ForEach-Object { $_.ProcessId }"`,
      { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

async function closeKuku(waitMs = 30000) {
  const pids = listKukuPids();
  if (!pids.length) return true;
  info('关闭已运行的库库AI 进程：', pids.join(', '));
  try { execSync(`taskkill /IM ${EXE_NAME} /T /F`, { stdio: 'ignore', timeout: 15000 }); } catch { /* ignore */ }
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!listKukuPids().length) { ok('All GenFlowPro processes exited.'); return true; }
    await sleep(800);
  }
  warn('关闭超时，仍有残留进程（继续尝试连接）');
  return false;
}

function launchKuku(exePath, port, profile) {
  const args = [`--remote-debugging-port=${port}`];
  if (profile) args.push(`--user-data-dir=${profile}`);
  info('启动库库AI：', exePath, args.join(' '));
  const child = spawn(exePath, args, { detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

// ----------------------------------------------------------------------------
// CDP HTTP 端点探测
// ----------------------------------------------------------------------------

async function httpJson(url, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(to); }
}

function isKukuVersion(v) {
  const s = JSON.stringify(v || {});
  return /KuKuGenFlow|GenFlow|KukuAI/i.test(s);
}

async function probePort(port) {
  try {
    const v = await httpJson(`http://127.0.0.1:${port}/json/version`);
    return { open: true, isKuku: isKukuVersion(v), version: v };
  } catch { return { open: false, isKuku: false, version: null }; }
}

async function waitForPageTarget(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const list = await httpJson(`http://127.0.0.1:${port}/json`, 4000);
      const pages = list.filter((t) => t.type === 'page');
      const main = pages.find((p) => /renderer[\\/]index\.html|index\.html/i.test(p.url)) || pages[0];
      if (main && main.webSocketDebuggerUrl) return main;
      last = list;
    } catch { /* ignore */ }
    await sleep(1000);
  }
  throw new Error('未找到库库AI 主窗口 page target（可能仍在启动或界面未渲染）。最后结果：' + JSON.stringify(last || null).slice(0, 300));
}

// ----------------------------------------------------------------------------
// 极简 CDP 客户端（针对单个 page target）
// ----------------------------------------------------------------------------

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (e) => reject(new Error('CDP WebSocket 连接失败')));
      this.ws.addEventListener('message', (ev) => {
        let d; try { d = JSON.parse(ev.data); } catch { return; }
        if (d.id && this.pending.has(d.id)) { this.pending.get(d.id)(d); this.pending.delete(d.id); }
      });
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP 超时: ${method}`)); }, 20000);
      this.pending.set(id, (msg) => { clearTimeout(timer); resolve(msg.result ?? msg); if (msg.error) reject(new Error(msg.error.message)); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 200));
    return r.result ? r.result.value : undefined;
  }
  async clickAt(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  async insertText(text) { await this.send('Input.insertText', { text }); }
  async pressEnter() {
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await sleep(30);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

// ----------------------------------------------------------------------------
// 页面内定位脚本（文本语义为主，抗 CSS 类名变化）
// ----------------------------------------------------------------------------

const PAGE_HELPERS = String.raw`
window.__kuku = (() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const rect = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  function center(r) { return { x: Math.round(r[0] + r[2] / 2), y: Math.round(r[1] + r[3] / 2) }; }
  function avatar() {
    const imgs = [...document.querySelectorAll('img')].filter((el) => {
      const r = el.getBoundingClientRect();
      return vis(el) && r.width <= 48 && r.bottom > window.innerHeight - 120 && r.x < 140 &&
        ((el.className || '').toString().includes('rounded-full') || r.width <= 40);
    });
    if (imgs[0]) return center(rect(imgs[0]));
    const nameBtn = [...document.querySelectorAll('[role="button"],button')].find((el) => {
      const r = el.getBoundingClientRect();
      return vis(el) && r.bottom > window.innerHeight - 120 && r.x < 260 && n(el.textContent).length > 0 && n(el.textContent).length < 24;
    });
    if (nameBtn) return center(rect(nameBtn));
    return null;
  }
  function tasks() {
    const out = { login: null, conv: null };
    for (const li of document.querySelectorAll('li')) {
      const t = n(li.textContent);
      const b = li.querySelector('button');
      if (!b) continue;
      if (t.includes('每日登录')) out.login = { btn: n(b.textContent), r: rect(b) };
      else if (t.includes('完成一次对话')) out.conv = { btn: n(b.textContent), r: rect(b) };
    }
    return out;
  }
  function menuOpen() { const t = tasks(); return !!(t.login || t.conv); }
  function loginPrompt() {
    // 判断是否处于未登录（出现登录/扫码入口，且没有任务行）
    const body = n(document.body.textContent);
    if (menuOpen()) return false;
    const hasMenu = [...document.querySelectorAll('[data-state="open"],[role="menu"],[role="dialog"]')]
      .some((el) => { const r = el.getBoundingClientRect(); return r.width > 120 && r.height > 80; });
    if (!hasMenu) return false;
    const t = n((() => { const el = [...document.querySelectorAll('[data-state="open"],[role="menu"],[role="dialog"]')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 120 && r.height > 80; } ); return el ? el.textContent : ''; })());
    return (t.includes('登录') || t.includes('扫码')) && !t.includes('退出登录') && !t.includes('每日登录');
  }
  function input() {
    const el = [...document.querySelectorAll('.tiptap,.ProseMirror,[contenteditable="true"]')]
      .find((e) => { const r = e.getBoundingClientRect(); return r.width > 100 && r.height > 0; });
    return el ? center(rect(el)) : null;
  }
  function editorText() { const el = document.querySelector('.tiptap,.ProseMirror,[contenteditable="true"]'); return el ? n(el.textContent) : null; }
  function hash() { return location.hash; }
  return { avatar, tasks, menuOpen, loginPrompt, input, editorText, hash };
})();
true;
`;

// ----------------------------------------------------------------------------
// 业务动作
// ----------------------------------------------------------------------------

// 清掉可能遮挡左下角头像的浮层（如“V1.6.x 可更新”更新提示卡）。只点关闭×，绝不点“更新”。
async function dismissBlockers(cdp) {
  const c = await cdp.eval(String.raw`(() => {
    const n=s=>(s||'').replace(/\s+/g,' ').trim();
    const card=[...document.querySelectorAll('div,section')].find(e=>{const r=e.getBoundingClientRect();const t=n(e.textContent);return r.width>120&&r.width<600&&r.height>40&&r.height<240&&r.bottom>innerHeight-340&&r.x<420&&/可更新|新版本已准备就绪/.test(t);});
    if(!card)return null;
    const cb=[...card.querySelectorAll('button,[role="button"],span,div,i,svg')].find(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.width<=36&&r.height<=36&&/^(×|✕|✖|x|X|关闭)$/.test(n(e.textContent));});
    const target=cb||card.querySelector('[class*="close"],[aria-label*="关闭"],[aria-label*="close"]');
    if(target){const r=target.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};}
    const r=card.getBoundingClientRect();return {x:Math.round(r.right-14),y:Math.round(r.top+14)};
  })()`);
  if(c){ await cdp.clickAt(c.x, c.y); await sleep(600); return true; }
  return false;
}

async function clickAvatar(cdp) {
  await dismissBlockers(cdp);            // 先清掉“更新提示”等遮挡头像的浮层
  const av = await cdp.eval('window.__kuku.avatar()');
  if (!av) throw new Error('未找到左下角账户头像入口');
  await cdp.clickAt(av.x, av.y);
  await sleep(1200);
}

// 账户菜单里的“签到领奖”行会打开 comps 活动页（注意“每日领奖”是积分明细，别点错）。
async function clickActivityEntry(cdp) {
  const c = await cdp.eval(String.raw`(() => {
    const n=(s)=>(s||'').replace(/\s+/g,' ').trim();
    const el=[...document.querySelectorAll('button,a,[role="button"],div,span,li')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<80&&/签到领奖|签到领取|立即签到|每日签到/.test(n(e.textContent));}).sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height)[0];
    if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
  })()`);
  if (c) { await cdp.clickAt(c.x, c.y); await sleep(1500); }
  return !!c;
}

async function closeMenu(cdp) { await dismissOverlay(cdp); }

async function dismissOverlay(cdp) {
  try {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  } catch { /* ignore */ }
  await sleep(400);
}

// 活动是内嵌在账户弹窗里的 kuku.baidu.com/comps/view/<id> iframe（独立 CDP target）。
async function findCompsTarget(port, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const list = await httpJson(`http://127.0.0.1:${port}/json`);
      const fr = list.find((t) => /comps\/view/.test(t.url || ''));
      if (fr && fr.webSocketDebuggerUrl) return fr;
    } catch { /* ignore */ }
    await sleep(500);
  }
  return null;
}

async function attachComps(port, timeoutMs = 8000) {
  const fr = await findCompsTarget(port, timeoutMs);
  if (!fr) return null;
  const ac = new CDP(fr.webSocketDebuggerUrl);
  await ac.connect();
  await ac.send('Runtime.enable');
  await ac.send('Page.enable');
  return ac;
}

// 每日签到：点击 comps 活动内的签到按钮（img.kuku-sign-in__btn）；今天已签则页内存在 .kuku-sign-in__day--todaySigned。
async function doSignIn(ac) {
  const probe = String.raw`(() => {
    const b = document.querySelector('.kuku-sign-in__btn');
    const r = b && b.getBoundingClientRect();
    return { signed: !!document.querySelector('.kuku-sign-in__day--todaySigned'),
      hasBtn: !!b, x: r ? Math.round(r.x + r.width / 2) : 0, y: r ? Math.round(r.y + r.height / 2) : 0 };
  })()`;
  const isSigned = () => ac.eval(`!!document.querySelector('.kuku-sign-in__day--todaySigned')`);
  for (let i = 0; i < 24; i++) {
    const st = await ac.eval(probe);
    if (st && st.signed) return 'already_signed';
    if (st && st.hasBtn) {
      await ac.clickAt(st.x, st.y);
      for (let j = 0; j < 10; j++) {
        await sleep(800);
        if (await isSigned()) return 'signed';
      }
      return 'clicked_unverified';
    }
    await sleep(600);
  }
  return 'no_sign_control';
}

// 对话任务：活动要求先点“与库库AI对话”卡的“去完成”（会关闭活动并跳到新任务），再发消息才计入 N/3。
const COMPS_SCROLL_EVAL = String.raw`(() => {const tl=document.querySelector('.kuku-task-list');if(tl)tl.scrollIntoView({block:'center'});const sc=[...document.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+100&&/auto|scroll/.test(getComputedStyle(e).overflowY));if(sc)sc.scrollTop+=500;else window.scrollBy(0,500);})()`;
const CHAT_GO_EVAL = String.raw`(() => {const n=(s)=>(s||'').replace(/\s+/g,' ').trim();const card=[...document.querySelectorAll('.kuku-task-card')].find(x=>/对话/.test(n((x.querySelector('.kuku-task-card__title')||{}).textContent)));if(!card)return null;const btn=card.querySelector('.kuku-task-card__btn')||card.querySelector('[class*="btn"]');if(!btn)return null;const r=btn.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`;

async function doChats(cdp, port, n, message) {
  let done = 0;
  for (let k = 0; k < n; k++) {
    await clickAvatar(cdp);            // 开账户菜单
    await clickActivityEntry(cdp);     // 签到领奖 -> 打开 comps 活动
    const ac = await attachComps(port, 8000);
    if (ac) {
      for (let i = 0; i < 6; i++) { await ac.eval(COMPS_SCROLL_EVAL); await sleep(350); }
      const b = await ac.eval(CHAT_GO_EVAL);
      if (b && b.x) await ac.clickAt(b.x, b.y);   // 点“去完成”：关闭活动、回到新任务
      ac.close();
      await sleep(2500);
    }
    const r = await doConversation(cdp, message);
    if (r.status !== 'sent') break;
    done++;
    await sleep(1500);
  }
  return done;
}

// 附着活动页：轮询点“签到领奖”入口并附着 comps iframe，失败重试（菜单/活动异步渲染时更稳）。
async function attachActivity(cdp, port) {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (let i = 0; i < 12; i++) { if (await clickActivityEntry(cdp)) break; await sleep(600); }
    const ac = await attachComps(port, 10000);
    if (ac) return ac;
    await dismissOverlay(cdp); await sleep(1000);
    await clickAvatar(cdp);            // 重试：重新打开菜单
  }
  return null;
}
// 打开活动页（先点头像，再附着），返回其 CDP 或 null。
async function openActivity(cdp, port) {
  await clickAvatar(cdp);
  return await attachActivity(cdp, port);
}

const CARD_GO_EVAL = (kw) => `(() => {const n=(s)=>(s||'').replace(/\\s+/g,' ').trim();const card=[...document.querySelectorAll('.kuku-task-card')].find(x=>n((x.querySelector('.kuku-task-card__title')||{}).textContent).includes(${JSON.stringify(kw)}));if(!card)return null;const btn=card.querySelector('.kuku-task-card__btn')||card.querySelector('[class*="btn"]');if(!btn)return null;const r=btn.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`;
const LOTTERY_BTN_EVAL = String.raw`(() => {const b=document.querySelector('.kuku-btn-box .kuku-btn')||document.querySelector('.kuku-lottery .kuku-btn');if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`;
const REM_EVAL = String.raw`+((document.body.innerText||'').match(/剩余\s*(\d+)\s*次/)||[])[1]||0`;
const PRIZE_CLOSE_RECT_EVAL = String.raw`(() => {const p=document.querySelector('.kuku-reward-pop');if(!p)return null;const pr=p.getBoundingClientRect();const cs=getComputedStyle(p);if(!(pr.height>10&&cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity>0.1))return null;const b=document.querySelector('.kuku-reward-btn')||document.querySelector('.kuku-reward-close');if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`;
const POP_VISIBLE_EVAL = String.raw`(() => {const p=document.querySelector('.kuku-reward-pop');if(!p)return false;const r=p.getBoundingClientRect();const cs=getComputedStyle(p);return r.height>10&&cs.display!=='none'&&cs.visibility!=='hidden'&&+cs.opacity>0.1;})()`;

// 浏览知识广场：点该任务卡“去完成”→跳到知识广场页（计入“每日限1次”，+1 抽奖机会）。
async function doBrowse(cdp, port) {
  const ac = await openActivity(cdp, port);
  if (!ac) return 'no_activity';
  for (let i = 0; i < 6; i++) { await ac.eval(COMPS_SCROLL_EVAL); await sleep(300); }
  const b = await ac.eval(CARD_GO_EVAL('浏览'));
  let st = 'no_btn';
  if (b && b.x) { await ac.clickAt(b.x, b.y); st = 'browsed'; }
  ac.close();
  await sleep(2000);
  return st;
}

// 关闭中奖弹窗：这些组件不认 JS .click()，必须用真实鼠标事件点“开心收下”。
async function closePrize(ac) {
  const p = await ac.eval(PRIZE_CLOSE_RECT_EVAL);
  if (p) { await ac.clickAt(p.x, p.y); await sleep(900); return true; }
  return false;
}

// 抽奖：只要“剩余>0”就继续；每轮先真实点击关掉遗留中奖弹窗，再点抽奖；以“结果弹窗可见”计一次成功。
async function doLottery(cdp, port, maxDraws) {
  const ac = await openActivity(cdp, port);
  if (!ac) return 'no_activity';
  await ac.eval(`window.scrollTo(0,0)`).catch(() => {});
  let drawn = 0;
  for (let i = 0; i < maxDraws; i++) {
    await closePrize(ac);                                                // 真实点击关掉遗留中奖弹窗
    let rem = 0;                                                          // 读剩余（重试等渲染）
    for (let r = 0; r < 6; r++) { rem = await ac.eval(REM_EVAL); if (rem > 0) break; await sleep(700); }
    if (!rem || rem <= 0) break;
    const btn = await ac.eval(LOTTERY_BTN_EVAL);
    if (!btn) break;
    await sleep(500);
    await ac.clickAt(btn.x, btn.y);
    let popped = false;                                                   // 等中奖弹窗“可见”=抽成了
    for (let k = 0; k < 16; k++) { await sleep(500); if (await ac.eval(POP_VISIBLE_EVAL)) { popped = true; break; } }
    if (!popped) break;                                                   // 没弹=没抽成/次数已尽，停
    drawn++;
    await closePrize(ac);                                                 // 真实点击“开心收下”
    await sleep(1200);
  }
  ac.close();
  return drawn;
}

// 完成一次对话：聚焦输入框 -> 输入消息 -> 回车 -> 等待会话创建
async function doConversation(cdp, message) {
  await closeMenu(cdp);
  const input = await cdp.eval('window.__kuku.input()');
  if (!input) return { status: 'input_not_found' };
  await cdp.clickAt(input.x, input.y);
  await sleep(400);
  await cdp.insertText(message);
  await sleep(400);
  const typed = await cdp.eval('window.__kuku.editorText()');
  if (!typed || !typed.includes(message.slice(0, 6))) return { status: 'type_failed', typed };
  const beforeHash = await cdp.eval('window.__kuku.hash()');
  await cdp.pressEnter();
  // 等待 URL 出现 session_id（会话被创建）或编辑器清空
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await sleep(800);
    const h = await cdp.eval('window.__kuku.hash()');
    if (/session_id=/.test(h) && h !== beforeHash) return { status: 'sent', hash: h };
    const nowText = await cdp.eval('window.__kuku.editorText()');
    if (nowText === '' || nowText === null) return { status: 'sent', hash: h };
  }
  return { status: 'unknown', beforeHash };
}

// ----------------------------------------------------------------------------
// 飞书推送
// ----------------------------------------------------------------------------

async function pushFeishu(webhook, payloadText) {
  if (!webhook) return;
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text: payloadText } }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.code && j.code !== 0) warn('飞书返回非零码：', JSON.stringify(j));
    else ok('飞书通知已发送');
  } catch (e) { warn('飞书通知发送失败：', e.message); }
}

// ----------------------------------------------------------------------------
// 确保调试端口可用并连接
// ----------------------------------------------------------------------------

async function ensureConnection() {
  const port = OPTS.port;
  let probe = await probePort(port);

  if (probe.open && probe.isKuku) {
    ok(`调试端口 ${port} 已开放且属于库库AI`);
  } else if (probe.open && !probe.isKuku) {
    warn(`端口 ${port} 被其它应用占用（非库库AI），尝试切换端口`);
    let found = null;
    for (const cand of [9334, 9335, 9336, 9337, 9338]) {
      const p = await probePort(String(cand));
      if (p.open && p.isKuku) { found = String(cand); break; }
      if (p.open && !p.isKuku) continue;
      launchKuku(locateKuku(), cand, OPTS.profile);
      const pp = await waitPortUp(String(cand), 40000);
      if (pp.open && pp.isKuku) { found = String(cand); break; }
    }
    if (!found) throw new Error(`端口 ${port} 被占用，且未能在备用端口启动库库AI`);
    OPTS.port = found;
    ok(`改用调试端口 ${found}`);
  } else {
    // 端口未开放：确认 exe 后启动
    const exe = locateKuku();
    if (!exe) throw new Error('未找到库库AI 客户端（GenFlowPro.exe）。请用 --dir 指定安装路径。');
    const running = listKukuPids().length > 0;
    if (running) {
      info('库库AI 正在运行但未开放调试端口。');
      if (!OPTS.force) {
        // 给一个恢复观察窗口（无人值守启动偶发主进程自愈）
        for (let i = 0; i < 10; i++) { await sleep(2000); probe = await probePort(port); if (probe.open && probe.isKuku) break; }
        if (!(probe.open && probe.isKuku)) {
          throw new Error('库库AI 在运行但没有调试端口。加 --force 可自动关闭并带端口重启（受 Electron 单实例锁限制，推荐用 run-once.bat / scheduled-run.bat）。');
        }
      } else {
        await closeKuku();
      }
    }
    // 带端口启动（若 --force 关闭后，或本来就没运行）
    if (!(await probePort(port)).open) {
      await closeKuku(15000); // 确保彻底关闭，规避单实例锁竞态
      const ex = locateKuku();
      launchKuku(ex, port, OPTS.profile);
      const up = await waitPortUp(port, 45000);
      if (!up.open || !up.isKuku) throw new Error(`等待调试端口 ${port} 超时`);
      ok(`调试端口 ${port} 已就绪`);
    }
  }

  const target = await waitForPageTarget(OPTS.port);
  info('连接 CDP page:', target.title, '|', target.url);
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.eval(PAGE_HELPERS);
  // 等待主窗口把账户头像渲染出来（登录后异步初始化）
  for (let i = 0; i < 30; i++) {
    if (await cdp.eval('!!window.__kuku.avatar()')) break;
    await sleep(1000);
  }
  return cdp;
}

async function waitPortUp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = { open: false, isKuku: false };
  while (Date.now() < deadline) {
    last = await probePort(port);
    if (last.open) return last;
    await sleep(1000);
  }
  return last;
}

// ----------------------------------------------------------------------------
// 主流程
// ----------------------------------------------------------------------------

async function main() {
  if (OPTS.help) { printHelp(); process.exit(0); }

  const result = {
    status: 'unknown',
    checkin: null,   // 每日签到（连签送 SVIP）
    chat: null,      // 与库库AI对话（积分+10/次）
    browse: null,    // 浏览知识广场（+1 抽奖机会）
    lottery: null,   // 抽奖（消耗剩余次数）
    detail: '',
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
  };

  let cdp, ac;
  try {
    cdp = await ensureConnection();

    // 点左下角头像 -> 弹出账户菜单；再点“签到领奖”行打开 comps 活动页
    await clickAvatar(cdp);
    if (await cdp.eval('window.__kuku.loginPrompt()')) {
      result.status = 'not_logged_in';
      result.detail = '库库AI 未登录，需先手动登录后再运行';
      await finish(cdp, result, ac);
      return;
    }
    // 附着活动页（kuku.baidu.com/comps/view）；仅在需要签到时把失败当致命（其余步骤各自会重新打开活动）
    ac = await attachActivity(cdp, OPTS.port);
    if (!ac && !OPTS.skipCheckin) {
      result.status = 'activity_not_found';
      result.detail = '未能打开/附着活动页(kuku.baidu.com/comps/view)，入口或界面可能再次改版，需人工确认';
      await finish(cdp, result, ac);
      return;
    }

    // ---- 每日签到 ----
    if (!OPTS.skipCheckin) result.checkin = await doSignIn(ac);
    if (ac) { ac.close(); ac = null; await dismissOverlay(cdp); }   // 收起活动弹窗，回主界面

    // ---- 对话任务（每轮点"去完成"再发消息）----
    if (!OPTS.skipChat) {
      const sent = await doChats(cdp, OPTS.port, OPTS.chatTimes, OPTS.message);
      result.chat = sent > 0 ? ('sent_' + sent) : 'none';
    }
    // ---- 浏览知识广场 ----
    if (!OPTS.skipBrowse) result.browse = await doBrowse(cdp, OPTS.port);
    // ---- 抽奖（消耗所有剩余次数）----
    if (!OPTS.skipLottery) { const d = await doLottery(cdp, OPTS.port, OPTS.maxDraws); result.lottery = (typeof d === 'number') ? ('drawn_' + d) : d; }

    const notes = [];
    if (!OPTS.skipCheckin) notes.push('签到:' + result.checkin);
    if (!OPTS.skipChat) notes.push('对话:' + result.chat);
    if (!OPTS.skipBrowse) notes.push('浏览:' + result.browse);
    if (!OPTS.skipLottery) notes.push('抽奖:' + result.lottery);
    result.detail = notes.join('；');

    if (!OPTS.skipCheckin) {
      if (result.checkin === 'signed') result.status = 'success';
      else if (result.checkin === 'already_signed') result.status = 'already_done';
      else result.status = 'failed';
    } else {
      result.status = (!OPTS.skipChat && String(result.chat).startsWith('sent')) ? 'success' : 'skipped';
    }
    await finish(cdp, result, ac);
  } catch (e) {
    result.status = 'failed';
    result.detail = (result.detail ? result.detail + '；' : '') + '错误: ' + e.message;
    console.error('[ERROR]', e.stack || e.message);
    if (ac) ac.close();
    if (cdp) cdp.close();
    await report(result);
    process.exit(1);
  }
}

async function finish(cdp, result, ac) {
  try { if (ac) ac.close(); } catch { /* ignore */ }
  try { if (cdp) await dismissOverlay(cdp); } catch { /* ignore */ }
  if (cdp) cdp.close();
  await report(result);
  if (OPTS.close) {
    info('--close：签到完成后关闭库库AI');
    await closeKuku(15000);
  }
  const code = (result.status === 'success' || result.status === 'partial' || result.status === 'skipped') ? 0
    : result.status === 'already_done' ? 2
    : 1;
  process.exit(code);
}

async function report(result) {
  console.log('\n[RESULT] ' + JSON.stringify(result, null, 2));
  if (!OPTS.noPush && OPTS.feishu) {
    const emoji = result.status === 'success' ? '✅' : result.status === 'already_done' ? 'ℹ️' : result.status === 'partial' ? '🟡' : '❌';
    const text = `${emoji} 库库AI 自动签到\n状态: ${result.status}\n签到: ${result.checkin || '-'}\n对话: ${result.chat || '-'}\n浏览: ${result.browse || '-'}\n抽奖: ${result.lottery || '-'}\n详情: ${result.detail}\n时间: ${result.time}`;
    await pushFeishu(OPTS.feishu, text);
  }
}

function printHelp() {
  console.log(`库库AI (GenFlowPro) 每日自动签到 + 对话领积分

用法: node src/auto-checkin.mjs [选项]

选项:
  --dir <path> / --exe <path>  库库AI 安装目录或 GenFlowPro.exe 路径（不传则自动定位）
  --port <n>                   CDP 调试端口（默认 ${DEFAULT_PORT}；被占用会自动改用备用端口）
  --force                      库库AI 在运行但无调试端口时，强制关闭并带端口重启
  --profile <path>             使用独立 user-data-dir 启动（隔离测试，不影响主账号）
  --close                      签到完成后关闭库库AI 进程（适合无人值守）
  --message <text>             对话任务发送的消息内容（默认：“回复我【1】 别说别的别思考”）
  --chat-times <n>             对话任务轮数（活动计“与库库AI对话 N/3”，每轮点“去完成”再发一条，默认 3）
  --max-draws <n>              抽奖最多消耗次数上限（默认 12）
  --skip-chat                  跳过对话任务
  --skip-checkin               跳过每日签到
  --skip-browse                跳过浏览知识广场
  --skip-lottery               跳过抽奖
  --feishu <url>               签到结果推送飞书群机器人 webhook（也可 config.json / 环境变量）
  --no-push                    只执行、不推送飞书
  --help                       显示本帮助

环境变量: KUKUCHECKIN_EXE / KUKUCHECKIN_PORT / KUKUCHECKIN_FORCE_RELAUNCH /
          KUKUCHECKIN_USER_DATA_DIR / KUKUCHECKIN_CLOSE / KUKUCHECKIN_FEISHU_WEBHOOK /
          KUKUCHECKIN_CHAT_MESSAGE
优先级: 命令行参数 > 环境变量 > config.json > 默认值

退出码: 0 成功(含部分成功) | 1 失败/异常 | 2 今日已签到且对话已领(无需重复)
`);
}

main();
