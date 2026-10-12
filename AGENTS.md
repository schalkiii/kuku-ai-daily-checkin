# AGENTS.md — 库库AI 每日签到（CDP 项目）

## 定位
本项目用 **CDP（Chrome DevTools Protocol）模拟 UI**，为库库AI PC 客户端（GenFlowPro，Electron）
自动完成两项每日积分：`每日登录`(+50) 与 `完成一次对话`(+50)。零第三方依赖，需 Node ≥ 18。

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
- 两个奖励都是「两段式」：对话任务先 `去完成`→发消息→服务端**延迟**翻成 `领取50`；
  脚本发消息后用 `waitForClaimable` 轮询到「领取」再点，避免过早判 `not_claimable`（竞态修复）。
  窗口内没翻牌记 `pending_claim`（今日已对话，明日可领），不算失败。
- 领取是网络请求，一律用轮询验证按钮变 `明日再来`，不用固定 sleep。

## 与脱机方案的分工（重要）
- **本项目 = CDP**：需要打开客户端、靠 UI 领取，是库库签到的可靠主路径。
- **纯接口脱机领取在姊妹项目**：`D:\workspace\ai-ide-daily-checkin\checkin_kuku.py`
  （读 `%APPDATA%\baidugenflowpro\Network\Cookies` 的 BDUSS+genflowpro STOKEN，
  直调 `freepoint/homenew` + `/rewardClaim`；鉴权仅靠 Cookie，无签名）。
  改脱机侧代码需在那个项目里做。

## 安全红线
- 只读登录态、不打印 cookie/token 明文、不改 refresh token。调试端口只监听 127.0.0.1。
- 会话残留（`_*` 调试脚本、`_kuku_asar/` 反编译产物）属一次性工件，收尾时应经确认后清理。
