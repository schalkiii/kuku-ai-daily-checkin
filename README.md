# 库库AI 每日自动签到 + 对话领积分

> 本地库库AI PC 客户端（GenFlowPro，Electron）的每日签到 + 活动任务自动化脚本，基于 Chrome DevTools Protocol（CDP），零第三方依赖。
> 思路参考 [schalkiii/trae-daily-checkin](https://github.com/schalkiii/trae-daily-checkin)，针对库库AI 的界面做了适配。

库库AI（百度文库 / 百度网盘出品的 AI 办公智能体，英文 GenFlow）的每日福利自 **2026-10 改版**为「金秋厚礼」活动（旧 `freepoint` 每日登录/对话各 +50 已下线）：

- **每日签到**：连签 7 天解锁网盘 SVIP（+积分/抽奖机会）
- **与库库AI对话**（每日 3 次）：每次 积分 +10、抽奖机会 +1
- **浏览知识广场**（每日 1 次）：抽奖机会 +1
- **抽奖**：消耗所有剩余抽奖机会赢奖品（1.6.22 新 UI 已适配：`.pc-prize-entry` → 弹窗 `.pc-prize-btn`）

本脚本每天自动完成签到、3 次对话、浏览知识广场并抽奖，可推送到飞书群，也支持注册成 Windows 计划任务自动运行（CDP 需登录/锁屏会话；真正免登录的无人值守兜底见文末「脱机 / 纯接口领取」章节）。

---

## 快速开始

```bat
:: 1) 一键：关闭库库AI -> 带调试端口重启 -> 完成签到 + 对话领积分
run-once.bat

:: 2)（可选）注册每天定时自动运行，例如每天 10:10
install-schedule.bat 10:10

:: 卸载定时任务
uninstall-schedule.bat
```

> 前提：本机已安装库库AI PC 客户端并已登录百度账号。脚本会自动定位安装路径（默认 `%APPDATA%\Baidu\KukuAI\GenFlowPro.exe`），无需手填。

---

## 它是怎么工作的

1. **判断是不是"套壳 Web"**：库库AI PC 客户端安装目录里有 `chrome_100_percent.pak`、`v8_context_snapshot.bin`、`icudtl.dat`、`libEGL.dll`、`LICENSE.electron.txt` 等文件，主进程 `GenFlowPro.exe` 版本信息 `CompanyName=baidu / ProductName=GenFlowPro`。确认是 **Electron（Chrome 146 / Electron 41）**，界面全是 DOM，可用 Web 自动化操控。

2. **开启调试端口**：Electron 本质是 Chromium，支持 `--remote-debugging-port` 远程调试开关。实测库库AI 接受该开关：
   ```
   GenFlowPro.exe --remote-debugging-port=9333
   ```
   随后 `http://127.0.0.1:9333/json` 可看到主窗口 page：
   `file:///.../app.asar/out/renderer/index.html#/workbench/new-task`

3. **活动是内嵌 iframe**：点左下角头像 → 账户菜单 **「签到领奖」** → 打开活动页（新版 1.6.22 为 `https://kuku.baidu.com/operation/activitys/kukuPcSignAct/main`，旧版为 `comps/view/<id>`；脚本按二者之一匹配附着）。活动业务接口都带 App 注入的 `window.jsToken`，**无法脱机**。

4. **四类动作**（脚本用文本语义 + 类名定位，抗改版）：
   | 动作 | 定位方式 |
   | --- | --- |
   | 每日签到 | `.pc-sign-btn`（旧版 `.kuku-sign-in__btn`），点击签到；已签判定 `.pc-sign-btn.is-signed` / `.pc-sign-cell--today-signed`（旧 `.kuku-sign-in__day--todaySigned`） |
   | 与库库聊聊热门话题(对话) | 任务卡 `.pc-kuku-task-card`（旧 `.kuku-task-card`，标题含“聊聊热门话题/对话”）的 `__btn`「去完成」→ 跳到新任务 → 输入框 `.tiptap/.ProseMirror/[contenteditable]` 发消息回车，才计入 `N/3` |
   | 浏览10s知识广场 | 任务卡（标题含“浏览”）的 `__btn`「去完成」→ 跳到 `#/workbench/knowledge-square`（每日1次，+1 抽奖机会） |
   | 抽奖 | `.pc-prize-entry`（有次数时非 `-empty`）→ 弹窗 `.pc-prize-dialog` → 循环 JS 点 `.pc-prize-btn`（转一次）→ 剩余0 后 `.pc-prize-close` 关闭 |

   > ⚠️ 对话任务**必须先在活动页点「去完成」再发消息**才计数；平时直接聊天不归属到活动（实测：点「去完成」后发一条 → `0/3→1/3`）。抽奖/对话/浏览都靠同一个活动 iframe。

5. 所有点击/输入都通过 CDP 的 `Input.dispatchMouseEvent` / `Input.insertText` / `Input.dispatchKeyEvent` 派发**真实事件**，与参考项目一致（前端框架对 DOM 合成事件不响应）。

---

## 命令行参数

```bat
node src/auto-checkin.mjs [选项]
```

| 参数 | 作用 | 默认 |
| --- | --- | --- |
| `--dir <path>` / `--exe <path>` | 库库AI 安装目录或 GenFlowPro.exe 路径 | 自动定位 |
| `--port <n>` | CDP 调试端口（被占用会自动改用备用端口） | 9333 |
| `--force` | 库库AI 在运行但无调试端口时，强制关闭并带端口重启 | 关 |
| `--profile <path>` | 用独立 user-data-dir 启动（隔离测试，不影响主账号） | 默认账号 |
| `--close` | 完成后关闭库库AI 进程（适合无人值守） | 关 |
| `--message <text>` | 对话任务发送的消息内容 | `回复我【1】 别说别的别思考` |
| `--chat-times <n>` | 对话任务轮数（活动计"与库库AI对话 N/3"，每轮点"去完成"再发一条） | 3 |
| `--max-draws <n>` | 抽奖最多消耗次数上限 | 12 |
| `--skip-chat` | 跳过对话任务 | 关 |
| `--skip-checkin` | 跳过每日签到 | 关 |
| `--skip-browse` | 跳过浏览知识广场 | 关 |
| `--skip-lottery` | 跳过抽奖 | 关 |
| `--feishu <url>` | 结果推送飞书群机器人 webhook（也可 config.json / 环境变量） | 不推送 |
| `--no-push` | 只执行、不推送飞书 | 关 |
| `--help` | 查看全部参数 | — |

**优先级**：命令行参数 > 环境变量 > `config.json` > 默认值。
环境变量：`KUKUCHECKIN_EXE` / `KUKUCHECKIN_PORT` / `KUKUCHECKIN_FORCE_RELAUNCH` / `KUKUCHECKIN_USER_DATA_DIR` / `KUKUCHECKIN_CLOSE` / `KUKUCHECKIN_FEISHU_WEBHOOK` / `KUKUCHECKIN_CHAT_MESSAGE`。

### 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功（含部分成功，如只领到一项） |
| 1 | 失败/异常（未登录、找不到按钮、领取校验不通过等） |
| 2 | 今日签到已领取（无需重复；对话/浏览/抽奖按当日情况顺带处理） |

---

## 每日自动运行（Windows 任务计划）

一键注册（推荐）：

```bat
install-schedule.bat 10:10
```

内部实际调用 `install-schedule.ps1`（纯 ASCII）注册，带 `-StartWhenAvailable`：错过时点（关机/睡眠）后开机或登录时尽快补跑一次，而非跳过当天。

它注册一个名为 `KukuDailyCheckin` 的计划任务，每天定点执行 `scheduled-run.bat`：先彻底关闭库库AI → 带 `--remote-debugging-port` 重启（失败重试）→ 轮询端口就绪 → 运行 `node src\auto-checkin.mjs --force --close`，从根上绕开 Electron 单实例锁竞态。运行日志追加到 `logs\checkin.log`。

> 登录模式：CDP 要把库库AI 的 Electron 界面跑起来，只能在**有桌面的登录会话**里执行，因此任务是**交互式**（当前用户、不保存 Windows 密码）。**锁屏可跑**（会话仍在），**注销则不触发**。注：库库活动改版后**已无法脱机**（新活动需 App 注入的 jsToken），所以无人登录时库库领不到；姊妹项目 `ai-ide-daily-checkin` 的脱机方案对库库已失效，仅 Qoder / Trae / WorkBuddy 可无人登录运行。

卸载：`uninstall-schedule.bat`。

---

## 飞书推送（可选）

1. 飞书建群 → 群设置 → 群机器人 → 添加"自定义机器人"，复制 webhook（需**未开启签名校验**）。
2. 三种配置方式（优先级 命令行 > 环境变量 > config.json）：
   - `config.json`（推荐，不进版本库）：把 `config.example.json` 复制为 `config.json`，填 `feishuWebhook`。
   - 环境变量：`setx KUKUCHECKIN_FEISHU_WEBHOOK "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"`
   - 命令行：`node src/auto-checkin.mjs --feishu "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx"`
3. 推送失败只打印 `[WARN]`，不影响签到本身与退出码；未配置则跳过。

---

## 常见问题

1. **端口 9222 打不开 / 连到别的应用**：9222 常被其它 Electron 应用（如 Lenovo Vantage）占用。本脚本默认用 **9333**，且会校验端口是否属于库库AI（User-Agent 含 `KuKuGenFlow`），被占用时自动改用备用端口。
2. **`--force` 等待调试端口超时**：Electron 单实例锁竞态。标准解法是先彻底关闭再带端口重启——`run-once.bat` / `scheduled-run.bat` 已内置该流程。
3. **`status=not_logged_in`**：库库AI 未登录，需先在客户端手动登录一次（登录态会持久化，之后脚本复用）。
4. **`status=activity_not_found` / `checkin=no_sign_control`**：多为界面改版或活动入口变化（活动是 `kuku.baidu.com/comps/view` iframe，需点账户菜单「签到领奖」打开）。看 `[RESULT]` 输出与 `logs\checkin.log`，并人工在库库AI 里确认活动页能否打开。
5. **`.bat` 乱码 / 命令报错**：所有 `.bat` 为 ASCII + CRLF（无 BOM）。含中文的 `.bat` 在中文 Windows（GBK 代码页）会被误解析，故提示语一律用英文。

---

## 脱机 / 纯接口领取（另见姊妹项目）

本项目**保持 CDP 方式**。⚠️ **2026-10-15 库库活动改版后，库库已无法脱机领取**：旧 `freepoint` 接口（`homenew`/`rewardClaim`/`taskComplete`，纯 cookie 无签名）已下线——`homenew` 现返回空 `activities`；新「金秋厚礼」活动的接口都带一个 App 注入的 `window.jsToken`（128位 hex，cookie/URL 里都没有），**脱机无法生成**，只能在真实页面里点。

因此：
- 库库的签到/对话/浏览/抽奖**全部走本项目 CDP**。
- 姊妹项目 [`ai-ide-daily-checkin`](file:///D:/workspace/ai-ide-daily-checkin) 的 `checkin_kuku.py` 对库库现在是**安全 no-op**（领不到但不报错）；该项目的脱机方案仍适用于 Qoder / Trae / WorkBuddy 三家。

---

## 安全与限制

- 调试端口只监听 `127.0.0.1`，本机安全；但本机任意进程都能连接，公用电脑不建议长期开启。
- CSS 类名 / 菜单文案可能随库库AI 更新变化，脚本用"活动 iframe + 类名（`kuku-sign-in__btn` / `kuku-task-card__btn` / `kuku-reward-btn`）+ 文本语义"多重定位抗改版；但活动是季节性的，改版后可能失效，看日志状态人工确认。
- 对话任务会真实发消息（默认 3 次，`--chat-times` 可调，`--skip-chat` 跳过）。

---

## 文件说明

```
kuku-ai-daily-checkin/
├── package.json
├── README.md
├── config.example.json           # 复制为 config.json 后填写（webhook 等）
├── launch-with-debug.bat         # 带调试端口启动库库AI（自动定位，双击可用）
├── run-once.bat                  # 一键：带端口重启 + 签到 + 对话领积分（手动，含 pause）
├── scheduled-run.bat             # 非交互版一键：供计划任务调用（无 pause，写日志）
├── install-schedule.bat          # 注册每日定时任务（转调 install-schedule.ps1）
├── install-schedule.ps1          # 纯 ASCII 注册 KukuDailyCheckin：交互式 + StartWhenAvailable
├── uninstall-schedule.bat        # 删除定时任务
├── logs/                         # 定时运行日志（已 gitignore）
├── scripts/
│   ├── locate-kuku.ps1           # 定位 GenFlowPro.exe（进程/注册表/常见目录）
│   ├── relaunch-with-debug.ps1   # 强制重启并开放调试端口（复用 locate-kuku）
│   ├── close-kuku.ps1            # 关闭库库AI 并等待进程全部退出（释放单实例锁）
│   └── wait-debug-port.ps1       # 轮询等待调试端口就绪
└── src/
    └── auto-checkin.mjs          # 主脚本：CDP 连接 + 签到 + 对话领积分 + 飞书推送
```
