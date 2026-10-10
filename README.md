# 库库AI 每日自动签到 + 对话领积分

> 本地库库AI PC 客户端（GenFlowPro，Electron）的每日签到 + 完成对话自动化脚本，基于 Chrome DevTools Protocol（CDP），零第三方依赖。
> 思路参考 [schalkiii/trae-daily-checkin](https://github.com/schalkiii/trae-daily-checkin)，针对库库AI 的界面与"两段式"领积分流程做了完整适配。

库库AI（百度文库 / 百度网盘出品的 AI 办公智能体，英文 GenFlow）有两项每日福利，各 **+50 积分**：

- **每日登录（签到）**
- **完成一次对话**

本脚本每天自动帮你把这两项积分领到手，可推送到飞书群，也支持注册成 Windows 计划任务做到完全无人值守。

---

## 快速开始

```bat
:: 1) 一键：关闭库库AI -> 带调试端口重启 -> 完成签到 + 对话领积分
run-once.bat

:: 2)（可选）注册每天定时自动运行，例如每天 12:00
install-schedule.bat 12:00

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

3. **定位关键元素**（脚本用**文本语义**为主，抗 CSS 类名变化）：
   | 元素 | 定位方式 |
   | --- | --- |
   | 左下角账户头像 | 靠近左下角的 `img.rounded-full`（小尺寸），兜底用左下角短文本 `role=button`（用户名） |
   | 账户"免费领积分"菜单 | 点头像弹出的菜单，内含 `<li>` 任务行 |
   | 每日登录（签到）行按钮 | `<li>` 文本含"每日登录" → 其 `<button>` |
   | 完成一次对话行按钮 | `<li>` 文本含"完成一次对话" → 其 `<button>` |
   | 对话输入框 | `.tiptap / .ProseMirror / [contenteditable=true]` |

4. **两段式领积分流程**（关键差异点）：每个奖励的按钮有 3 种文案状态：
   | 任务 | 未达成 | 可领取 | 已领取 |
   | --- | --- | --- | --- |
   | 每日登录 | —（登录即达成） | `领取50` | `明日再来` |
   | 完成一次对话 | `去完成` | `领取50` | `明日再来` |

   脚本流程：
   - 打开账户菜单（**状态感知**，已开则不重复点，避免把菜单点关）。
   - 若"完成一次对话"=`去完成`：聚焦输入框 → 输入一句话 → 回车（真实创建一次对话会话）→ 按钮变为 `领取50` → 点击领取。
   - 若"每日登录"/"对话"=`领取50`：直接点击领取。
   - 领取后轮询验证按钮是否变成 `明日再来`（签到/领取是网络请求，用轮询而非固定等待）。

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
| `--message <text>` | 对话任务发送的消息内容 | `你好，请用一句话介绍库库AI` |
| `--skip-chat` | 只签到，不做对话 | 关 |
| `--skip-checkin` | 只做对话，不签到 | 关 |
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
| 2 | 今日签到与对话均已领取，无需重复操作 |

---

## 每日自动运行（Windows 任务计划）

一键注册（推荐）：

```bat
install-schedule.bat 12:00
```

它注册一个名为 `KukuDailyCheckin` 的计划任务，每天定点执行 `scheduled-run.bat`：先彻底关闭库库AI → 带 `--remote-debugging-port` 重启（失败重试）→ 轮询端口就绪 → 运行 `node src\auto-checkin.mjs --force --close`，从根上绕开 Electron 单实例锁竞态。运行日志追加到 `logs\checkin.log`。

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
4. **`status=menu_not_found` / 按钮点了没变 `明日再来`**：多为网络/接口失败或界面改版。脚本已用文本语义兜底定位；仍失败时看 `[RESULT]` 输出与 `logs\checkin.log`，并人工在库库AI 里确认签到入口。
5. **`.bat` 乱码 / 命令报错**：所有 `.bat` 为 ASCII + CRLF（无 BOM）。含中文的 `.bat` 在中文 Windows（GBK 代码页）会被误解析，故提示语一律用英文。

---

## 安全与限制

- 调试端口只监听 `127.0.0.1`，本机安全；但本机任意进程都能连接，公用电脑不建议长期开启。
- CSS 类名 / 菜单文案可能随库库AI 更新变化，脚本用"文本语义（每日登录 / 完成一次对话 / 领取 / 明日再来）+ 位置"多重定位抗改版。
- 对话任务会真实发送一条消息给 AI（可能触发一次智能体任务）。可用 `--message` 自定义内容，或 `--skip-chat` 跳过。

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
├── install-schedule.bat          # 注册每日定时任务
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
