# AI DevKit

> [English](./README.md) | 中文

**AI 编程智能体的控制平面。**

![](agent-console-showcase.jpg)

AI DevKit 为 Claude Code、Codex CLI、Gemini CLI、opencode、Pi、Cursor、GitHub Copilot、Devin 等编程智能体提供同一个操作层：一份配置、一个控制台、本地记忆检索、跨智能体通信，以及由 `dev-lifecycle` 带领的可组合工程技能。

- **一份配置适配每个智能体** — `.ai-devkit.json` 协调团队使用的编程工具配置
- **一个控制台查看运行会话** — `agent console` 是实时 TUI 仪表盘，可以跨提供方监督本地智能体
- **跨智能体通信** — `agent send` 可以把提示词、日志和测试输出发送给运行中的智能体
- **不膨胀上下文的记忆检索** — `@ai-devkit/memory` 用本地 SQLite 保存决策、约定和修复经验，智能体只在需要时搜索，而不是把所有内容塞进每个提示词
- **可组合工程技能** — `dev-lifecycle`、`verify`、`tdd`、审查、调试、安全、文档和简化技能组合成可靠工作流

未来不是一个 AI 编程助手，而是多个智能体协作。AI DevKit 是让它们可管理的层。

运行 `npx ai-devkit@latest init` 后，你的项目会获得：

| 你需要的能力 | AI DevKit 安装的内容 |
|-------------|----------------------|
| 单一配置源 | 为你选择的智能体和工作流生成 `.ai-devkit.json` |
| 运行中智能体可见 | `agent list`、`agent detail` 和 `agent console` |
| 可寻址的智能体 | `agent send`、`--stdin`、`--wait`，以及支持场景下的智能体分组 |
| 基于检索的记忆 | 通过 MCP 和 CLI 暴露的本地 SQLite 记忆，只在有用时搜索 |
| 可组合的高级工程师式工作流 | `dev-lifecycle` 加上验证、TDD、调试、审查、安全、文档和简化技能 |

[![npm version](https://img.shields.io/npm/v/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![npm downloads](https://img.shields.io/npm/dt/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![GitHub stars](https://img.shields.io/github/stars/Codeaholicguy/ai-devkit.svg?style=social)](https://github.com/Codeaholicguy/ai-devkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 适合谁

适合 AI 编程设置已经从一个助手变成一支小而混乱的智能体团队的开发者：

- 多个终端里跑着不同智能体，却没有统一控制面
- 每个工具都要单独维护 `CLAUDE.md` / `.cursor/rules` / `AGENTS.md` / MCP 设置
- 很难把上下文、日志或后续任务发送给运行中的智能体
- 智能体忘记昨天已经确定的项目约定
- 构建还是红的，智能体却说“功能已经成功实现”
- 智能体没有计划就直接改代码，最后实现了错误的东西

没有 AI DevKit 时，你的智能体强大但分散。有了 AI DevKit，它们会拥有共享配置、控制面、可搜索记忆、通信路径，以及随项目一起工作的可复用技能，同时不会膨胀每个提示词的上下文。

| 没有 AI DevKit | 使用 AI DevKit |
|----------------|----------------|
| 你把智能体当作孤立终端标签页管理 | 通过 `ai-devkit agent console` 统一监督 |
| 你手工维护每个智能体配置 | 一份配置协调智能体文件、技能和 MCP 设置 |
| 你手动在会话之间复制日志和上下文 | `agent send` 把提示词和 stdin 路由到运行中的智能体 |
| 你在每次聊天里重复项目规则 | 智能体只在有用时检索相关记忆和文档 |
| 智能体从提示词直接跳到代码 | `dev-lifecycle` 引导需求、设计、计划、实现、测试和审查 |
| “完成”只是智能体停止编辑 | “完成”需要最新验证输出 |

## 30 秒开始

```bash
npx ai-devkit@latest init
```

一个向导。选择你的智能体，安装你需要的控制平面组件，让每个工具使用同一套操作模型。它写入的是项目本地文件，你可以审查并提交。智能体列表或工作流变化时，可以重新运行。

初始化后，你的项目会获得：

```text
your-project/
├── .ai-devkit.json              # 单一配置源，可以反复运行 init 更新
├── .claude/                     # 或 .cursor/、.codex/ 等你选择的智能体目录
│   ├── skills/                  # dev-lifecycle、verify、memory、tdd 等
│   └── settings.json            # MCP 服务配置，包括 @ai-devkit/memory
└── docs/ai/
    ├── requirements/            # 阶段 1：要构建什么，为什么构建
    ├── design/                  # 阶段 2：如何实现
    ├── planning/                # 阶段 3：任务拆解和执行计划
    ├── implementation/          # 阶段 4：实现记录
    └── testing/                 # 阶段 5：测试策略
```

## 像基础设施一样操作智能体

AI DevKit 带有智能体控制平面，适合日常多智能体开发：

```bash
# 列出跨提供方运行中的会话
ai-devkit agent list

# 打开实时终端 UI
ai-devkit agent console

# 向运行中的会话发送提示词，并等待响应
ai-devkit agent send "run the tests and report back" --id <agent-name> --wait

# 把多行输出传给运行中的智能体
npm test 2>&1 | ai-devkit agent send --id <agent-name> --stdin

# 向保存好的智能体分组发送提示词
ai-devkit agent send "review this branch for release risk" --group reviewers

# 通过 Telegram 接入会话，从手机操作智能体
ai-devkit channel start telegram --agent <agent-name> --daemon
```

适合长时间任务、多提供方协作、定时检查、审查循环，或从外部渠道远程控制智能体。

## 添加不膨胀上下文的记忆

AI DevKit memory 是用于保存项目决策、编码约定和可复用修复经验的本地 SQLite 知识库。智能体可以在任务需要上下文时检索它，而不是把所有事实都塞进每个提示词。

```bash
# 保存可复用项目约定
ai-devkit memory store \
  --title "API handlers return DTOs" \
  --content "REST handlers should return response DTOs instead of domain entities." \
  --tags "api,backend" \
  --scope "repo:codeaholicguy/ai-devkit"

# 在相关工作前搜索
ai-devkit memory search --query "API response convention"
```

## 用技能组合工程工作流

控制平面本身已经有价值。对于更大或风险更高的改动，AI DevKit 还会安装可组合技能，让智能体更像一个工程团队。

`dev-lifecycle` 是锚点技能。它引导智能体经过需求、设计、计划、实现、测试和审查。其他技能可以接入这个流程：

- `memory` 检索相关项目知识，而不是把所有上下文塞进会话
- `verify` 阻止没有最新测试或构建证据的完成声明
- `tdd` 在行为变化时推动测试优先实现
- `structured-debug` 让调试可复现，而不是猜测和乱改
- `security-review`、`document-code` 和 `simplify-implementation` 在任务需要时增加聚焦审查

### 获取完整工程工作流栈

把 [`templates/senior-engineer.yaml`](./templates/senior-engineer.yaml) 保存到本地，然后运行：

```bash
ai-devkit init --template ./senior-engineer.yaml
```

它把内置技能与来自 Anthropic、Vercel 等来源的精选技能组合在一起：TDD、前端设计、Web 应用测试、文档协作、React 最佳实践、安全审查等。

## 一个功能，从头到尾

```text
你：    使用 dev-lifecycle 技能，为 Google OAuth 登录开始需求澄清

智能体：搜索记忆里已有的认证约定。询问范围、用户、成功标准等
        澄清问题。创建
        docs/ai/{requirements,design,planning}/feature-oauth-login.md
        到功能 worktree。停止，不直接写代码。

你：    审查 feature-oauth-login 的设计

智能体：按需求文档审查设计文档。发现缺口，提出修复建议，
        在任何代码写入前处理问题。

你：    执行 feature-oauth-login 的实现计划

智能体：按 planning 文档逐项执行任务。每完成一项就更新进度。
        `verify` 技能会阻止没有最新测试/构建输出的任务被标记完成。

你：    审查当前 diff

智能体：按设计文档审查 diff，包括范围膨胀、缺失测试、
        需求中提到的边界情况，然后你再推送。
```

## 智能体行为会发生什么变化

上面的流程由八个内置技能驱动，每个技能都对应真实 AI 编程会话中的一个失败模式：

| 失败模式 | AI DevKit 的行为 |
|----------|------------------|
| 智能体过早开始写代码 | `dev-lifecycle` 强制经过需求、设计、计划、实现、测试和审查 |
| 智能体没有证据就说“完成” | `verify` 阻止没有最新测试/构建证据的完成声明 |
| 智能体忘记项目决策 | `memory` 提供跨会话、跨项目的本地可搜索知识库 |
| 新行为没有测试就上线 | `tdd` 推动测试优先实现 |
| 调试变成猜测和乱改 | `structured-debug` 要求复现、假设、修复和验证 |
| 现有代码不透明 | `document-code` 映射入口点、依赖和行为 |
| 实现变得臃肿 | `simplify-implementation` 在代码发布前降低复杂度 |
| 文档难以理解 | `technical-writer` 按新手用户清晰度审查文档 |

需要更多能力？`ai-devkit skill add <registry> <skill>` 可以从 30+ 发布方拉取技能，包括 Anthropic、Vercel、Supabase、Microsoft、Google。

## 跨编程智能体工作

一份 `.ai-devkit.json` 配置全部智能体。团队新增智能体时，不需要重写规则。

| 智能体 | 配置支持 | 远程控制 |
|--------|----------|----------|
| [Claude Code](https://www.anthropic.com/claude-code) | yes | yes |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | yes | yes |
| [Codex CLI](https://github.com/openai/codex) | yes | yes |
| [Grok Build CLI](https://x.ai/cli) | yes | yes |
| [Junie](https://www.jetbrains.com/junie/) | yes | — |
| [Cline](https://cline.bot/) | yes | — |
| [Devin](https://devin.ai/) | yes | — |
| [opencode](https://opencode.ai/) | yes | testing |
| [Pi](https://pi.dev) | yes | yes |
| [Cursor](https://cursor.sh/) | yes | — |
| [GitHub Copilot](https://code.visualstudio.com/) | yes | — |
| [Antigravity](https://antigravity.google/) | yes | — |
| [Amp](https://ampcode.com/) | yes | — |
| [Kilo Code](https://github.com/Kilo-Org/kilocode) | yes | — |
| [Roo Code](https://roocode.com/) | testing | — |

**配置支持** — `ai-devkit init` 写入智能体配置，包括规则、MCP 服务、技能和斜杠命令，让它加入同一个操作层。
**远程控制** — 通过 `ai-devkit agent send` 驱动运行中的会话，并把它们接入外部渠道。

## 与 `CLAUDE.md`、`.cursor/rules`、`AGENTS.md` 有什么不同？

这些文件是智能体反复读取的静态说明。AI DevKit 提供的是**操作层**：生成配置、控制台、跨智能体消息、本地可搜索记忆、阶段文档、按需加载的技能和验证门禁。规则仍然重要，但 AI DevKit 让规则可以跨工具执行。

| 静态规则文件 | AI DevKit |
|--------------|-----------|
| 告诉某个智能体你偏好什么 | 跨支持的智能体协调配置 |
| 不显示当前有哪些会话在运行 | 列出、检查并控制实时会话 |
| 无法把工作发送到另一个会话 | 把提示词、stdin 和渠道消息路由到智能体 |
| 依赖智能体记住每条规则 | 存储并搜索可复用项目知识 |
| 不能证明任务已经完成 | 要求最新命令输出才能声明完成 |

## 这不是什么

- **不是更聪明的 LLM。** 差的模型仍然差。AI DevKit 提升的是流程下限，不是模型原始能力。
- **不是 Claude Code、Codex、Cursor、Gemini CLI 或 opencode 的替代品。** AI DevKit 配置、监督并协调你已经在使用的智能体。
- **不是“帮我自动写完整功能”的魔法按钮。** 你仍然要审查需求文档、接受设计、阅读 diff。工作流让这种审查变得可行，因为你有可以指向的工件，而不是只能翻聊天记录。
- **不是托管服务。** MIT 许可，本地运行，没有遥测。记忆是你磁盘上的 SQLite 文件。智能体控制面与已经在使用的智能体 SDK 通信。

## 文档与社区

- 完整指南、工作流模式、技能编写 → **[ai-devkit.com/docs](https://ai-devkit.com/docs/)**
- 发布记录 → **[CHANGELOG.md](./CHANGELOG.md)**
- 贡献指南 → **[CONTRIBUTING.md](./CONTRIBUTING.md)**

```bash
git clone https://github.com/Codeaholicguy/ai-devkit.git
cd ai-devkit && npm install && npm run build
```

## 许可证

MIT
