# AGENTS.md — 库库AI 每日签到（CDP 项目）

## 定位
本项目用 **CDP（Chrome DevTools Protocol）模拟 UI**，为库库AI PC 客户端（GenFlowPro，Electron）
自动完成 2026-10 改版后的「金秋厚礼」活动：每日签到(连签7天送网盘SVIP) + 与库库AI对话×3(积分+10/次)。零第三方依赖，需 Node ≥ 18。

## 怎么跑
```bat
run-once.bat                              :: 关闭库库AI -> 带调试端口重启 -> 签到+对话领积分
node src/auto-checkin.mjs --port 9333     :: 前台直跑（库库AI 已在 9333 上运行时）
install-schedule.bat 12:00                :: 注册每日计划任务（KukuDailyCheckin）
```
退出码：0 成功/部分成功；2 今日两项均已领；1 失败（未登录、找不到按钮等）。

## 技术栈与约定
- Node ESM，`.mjs`；只用内置 `fetch` / 全局 `WebSocket`；不引第三方包。
- 元素定位以**文本语义 + 位置**为主（抗 CSS 类名改版），见 `src/auto-checkin.mjs` 的 `PAGE_HELPERS`。
- 默认调试端口 **9333**（9222 常被其它 Electron 应用占用）；被占用会自动改用备用端口。
- `.bat` 一律 ASCII + CRLF（含中文的 bat 在 GBK 控制台会乱码/报错，提示语用英文）。

## 关键事实（已实地验证）
- 计划任务注册走 `install-schedule.ps1`（纯 ASCII，bat 转调它）：任务 `KukuDailyCheckin` 为**交互式**
  （当前用户、不保存密码；登录/锁屏会话可跑、注销不触发）+ `-StartWhenAvailable` 错过补跑。
  免登录的 `每日登录` 兜底走姊妹脱机项目。
- 活动是账户菜单点「签到领奖」打开的内嵌 iframe `kuku.baidu.com/comps/view/<id>`（独立 CDP target，按 comps/view 匹配附着）。
- 每日签到：点活动内 `img.kuku-sign-in__btn`；已签判定 = 页内存在 `.kuku-sign-in__day--todaySigned`（实测连签数会 +1）。
- 与库库AI对话：**必须先在活动页点该任务卡的「去完成」**(会关闭活动跳到新任务)→再在输入框发消息→才计入 `N/3`；平时直接聊天不归属活动（实测 0/3→1/3）。默认 prompt 用「回复我【1】 别说别的别思考」省 token。

## 与脱机方案的分工（重要）
- **本项目 = CDP**：需要打开客户端、靠 UI 领取，是库库签到的可靠主路径。
- **姊妹项目 `ai-ide-daily-checkin\checkin_kuku.py` 的脱机方案已失效**：旧 `freepoint`(纯cookie) 于 2026-10 下线；
  新活动的接口都带 App 注入的 `window.jsToken`，脱机无法生成 → 库库只能走本项目 CDP。

## 安全红线
- 只读登录态、不打印 cookie/token 明文、不改 refresh token。调试端口只监听 127.0.0.1。
- 会话残留（`_*` 调试脚本、`_kuku_asar/` 反编译产物）属一次性工件，收尾时应经确认后清理。
