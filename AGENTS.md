# AGENTS.md — 库库AI 每日签到（CDP 项目）

## 定位
本项目用 **CDP（Chrome DevTools Protocol）模拟 UI**，为库库AI PC 客户端（GenFlowPro，Electron）
自动完成 2026-10 改版后的「金秋厚礼」活动：每日签到 + 与库库聊聊热门话题×3 + 浏览10s知识广场 + 抽奖（1.6.22 已适配 pc-* 类名）。零第三方依赖，需 Node ≥ 18。

## 怎么跑
```bat
run-once.bat                              :: 关闭库库AI -> 带调试端口重启 -> 签到+对话领积分
node src/auto-checkin.mjs --port 9333     :: 前台直跑（库库AI 已在 9333 上运行时）
install-schedule.bat 10:10                :: 注册每日计划任务（KukuDailyCheckin）
```
退出码：0 成功/部分成功；2 今日签到已领（无需重复）；1 失败（未登录、找不到活动页等）。

## 技术栈与约定
- Node ESM，`.mjs`；只用内置 `fetch` / 全局 `WebSocket`；不引第三方包。
- 元素定位以**文本语义 + 位置**为主（抗 CSS 类名改版），见 `src/auto-checkin.mjs` 的 `PAGE_HELPERS`。
- 默认调试端口 **9333**（9222 常被其它 Electron 应用占用）；被占用会自动改用备用端口。
- `.bat` 一律 ASCII + CRLF（含中文的 bat 在 GBK 控制台会乱码/报错，提示语用英文）。

## 关键事实（已实地验证）
- 计划任务注册走 `install-schedule.ps1`（纯 ASCII，bat 转调它）：任务 `KukuDailyCheckin` 为**交互式**
  （当前用户、不保存密码；登录/锁屏会话可跑、注销不触发）+ `-StartWhenAvailable` 错过补跑。
  免登录的 `每日登录` 兜底走姊妹脱机项目。
- 活动是账户菜单点「签到领奖」打开的内嵌 iframe：1.6.22 为 `kuku.baidu.com/operation/activitys/kukuPcSignAct/main`（类名 `pc-*`），旧版为 `comps/view/<id>`；脚本按二者之一匹配附着（`/json`）。
- 每日签到：点 `.pc-sign-btn`（旧 `.kuku-sign-in__btn`）；已签判定 `.pc-sign-btn.is-signed` / `.pc-sign-cell--today-signed`（旧 `.kuku-sign-in__day--todaySigned`）。
- 与库库聊聊热门话题(对话)：**必须先点该 `.pc-kuku-task-card` 的 `__btn`「去完成」**(关活动跳新任务)→再发消息→才计入 `N/3`（实测 0/3→1/3）。默认 prompt「回复我【1】 别说别的别思考」省 token。
- 浏览10s知识广场：点该任务卡 `__btn`「去完成」→跳 `#/workbench/knowledge-square`（每日1次，+1 抽奖机会）。
- 抽奖（1.6.22）：`.pc-prize-entry`（有次数时非 `-empty`）→弹窗 `.pc-prize-dialog` →循环 **JS `.click()`** 点 `.pc-prize-btn`（真实坐标不生效）→剩余0 后 `.pc-prize-close`。剩余数取 `.pc-prize-btn-count` 的“剩余N次”。

## 与脱机方案的分工（重要）
- **本项目 = CDP**：需要打开客户端、靠 UI 领取，是库库签到的可靠主路径。
- **姊妹项目 `ai-ide-daily-checkin\checkin_kuku.py` 的脱机方案已失效**：旧 `freepoint`(纯cookie) 于 2026-10 下线；
  新活动的接口都带 App 注入的 `window.jsToken`，脱机无法生成 → 库库只能走本项目 CDP。

## 安全红线
- 只读登录态、不打印 cookie/token 明文、不改 refresh token。调试端口只监听 127.0.0.1。
- 会话残留（`_*` 调试脚本、`_kuku_asar/` 反编译产物）属一次性工件，收尾时应经确认后清理。
