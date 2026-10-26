# AGENTS.md — 库库AI 每日签到（CDP 项目）

## 定位
本项目用 **CDP（Chrome DevTools Protocol）模拟 UI**，为库库AI PC 客户端（GenFlowPro，Electron）
自动完成 2026-10 改版后的「金秋厚礼」活动：每日签到 + 与库库聊聊热门话题×3 + 召唤任一专家并发起对话 + 浏览10s知识广场 + 抽奖（1.6.30 已适配：入口为首页活动浮标 `.activity-banner`，类名 `pc-*`）。零第三方依赖，需 Node ≥ 18。

## 怎么跑
```bat
run-once.bat                              :: 关闭库库AI -> 带调试端口重启 -> 签到+对话领积分
node src/auto-checkin.mjs --port 9333     :: 前台直跑（库库AI 已在 9333 上运行时）
install-schedule.bat 10:10                :: 注册每日计划任务（KukuDailyCheckin）
```
退出码：0 成功/部分成功；2 今日已全部完成（无需重复）；1 失败（未登录、找不到活动页等）。任一已启用任务未完成时 `status=partial` 并在 detail 列出。

## 技术栈与约定
- Node ESM，`.mjs`；只用内置 `fetch` / 全局 `WebSocket`；不引第三方包。
- 元素定位以**文本语义 + 位置**为主（抗 CSS 类名改版），见 `src/auto-checkin.mjs` 的 `PAGE_HELPERS`。
- 默认调试端口 **9333**（9222 常被其它 Electron 应用占用）；被占用会自动改用备用端口。
- `.bat` 一律 ASCII + CRLF（含中文的 bat 在 GBK 控制台会乱码/报错，提示语用英文）。

## 关键事实（已实地验证）
- 计划任务注册走 `install-schedule.ps1`（纯 ASCII，bat 转调它）：任务 `KukuDailyCheckin` 为**交互式**
  （当前用户、不保存密码；登录/锁屏会话可跑、注销不触发）+ `-StartWhenAvailable` 错过补跑。
  免登录的 `每日登录` 兜底走姊妹脱机项目。
- **活动入口（1.6.30 改了）**：首页 `#/workbench/new-task` 右上角活动浮标 `.activity-banner`（`[data-testid="new-task-activity-banner"]`，按钮内是活动图）→ 点击后主窗口内嵌 OOPIF iframe `kuku.baidu.com/operation/activitys/kukuPcSignAct/main`（旧版 1.6.22 是账户菜单「签到领奖」，更旧是 `comps/view/<id>`）。脚本按 URL 匹配附着（`/json`）；注意会话页 hash 为 `new-task?session_id=...`，不能只判子串。
- 每日签到：点 `.pc-sign-btn`（旧 `.kuku-sign-in__btn`）；已签判定 `.pc-sign-btn.is-signed` / `.pc-sign-cell--today-signed`（旧 `.kuku-sign-in__day--todaySigned`）。
- **任务卡「去完成」是 IMG**：`.pc-kuku-task-card__btn` 的 `src` 决定状态（`btn_todo.png` 可点 / `btn_done.png` 已完成 / `btn_invite.png` 需好友）。必须先 `scrollIntoView({block:'center'})` 再按 rect 点；活动 iframe 视口只有 ~604px 高，不滚动点不到。
- 与库库聊聊热门话题(对话)：点该卡 `__btn`「去完成」→ 活动关闭并跳到新任务 → 在输入框发消息才计入 `N/3`。**新任务输入框会预填推荐语，发之前必须清空**（Ctrl+A + Backspace）。默认 prompt「回复我【1】 别说别的别思考」省 token。已有 3/3 时按钮为 `btn_done`，脚本返回 `already`。
- 召唤任意专家并发起对话：任务卡「去完成」→专家页；页内 `button「召唤」` 必须用 **JS `.click()`**（真实坐标无效）→跳到 new-task 输入框发消息；默认消息「只回复数字1」(`--summon-message` 可改)。已完成时卡片 icon 为 `btn_done`（脚本直接返回 already）。
- 浏览10s知识广场：点该任务卡 `__btn`「去完成」→跳 `#/workbench/knowledge-square`（每日1次，+1 抽奖机会）。
- 抽奖（1.6.30）：`.pc-prize-entry`（有次数时非 `-empty`，文案“剩N次”）→点击打开弹窗，**打开时会先自动抽一次**（按“剩余数减少”计入）→ 循环 **JS `.click()`** 点 `.pc-prize-btn`（真实坐标不生效）→剩余0 后 `.pc-prize-close`。剩余数取 `.pc-prize-btn-count`/按钮文案的“剩余N次”。

## 与脱机方案的分工（重要）
- **本项目 = CDP**：需要打开客户端、靠 UI 领取，是库库签到的可靠主路径。
- **姊妹项目 `ai-ide-daily-checkin\checkin_kuku.py` 的脱机方案已失效**：旧 `freepoint`(纯cookie) 于 2026-10 下线；
  新活动的接口都带 App 注入的 `window.jsToken`，脱机无法生成 → 库库只能走本项目 CDP。

## 安全红线
- 只读登录态、不打印 cookie/token 明文、不改 refresh token。调试端口只监听 127.0.0.1。
- 会话残留（`_*` 调试脚本、`_kuku_asar/` 反编译产物）属一次性工件，收尾时应经确认后清理。
