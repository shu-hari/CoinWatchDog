# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CoinWatchDog is a VS Code extension for monitoring OKX cryptocurrency prices and trading positions. It provides real-time market data and position tracking through webview panels in the VS Code sidebar.

## Build and Development Commands

```bash
# Compile TypeScript and copy resources for development
npm run compile

# Watch for changes during development (runs TypeScript watcher + resource watcher in parallel)
npm run watch

# Prepare for VS Code extension publishing
npm run vscode:prepublish
```

## Architecture

### Core Components

The extension follows a provider-based architecture with two main WebView providers:

- **MarketsProvider** (`src/marketsProvider.ts`): Handles cryptocurrency price monitoring using CCXT WebSocket connections
- **PositionsProvider** (`src/positionsProvider.ts`): Manages trading position monitoring (requires OKX API credentials)

### Extension Entry Point

`src/extension.ts` serves as the main activation point:
- Registers both WebView providers
- Sets up configuration change listeners
- Manages provider lifecycle

### WebView Structure

The extension uses a dual-environment approach for webview resources:
- **Development**: Resources served from `dist/webview/` (after compilation)
- **Production**: Resources served from `src/webview/` (direct source)

WebView files are organized as:
- HTML templates: `src/webview/*.html`
- JavaScript controllers: `src/webview/*.ts`
- Shared styles: `src/webview/shared.css`
- Type definitions: `src/webview/types.ts`

### Configuration Management

The extension uses VS Code's configuration system with the `coinWatchDog` namespace:
- `okx.apiKey`, `okx.secret`, `okx.passphrase`: OKX API credentials for position monitoring
- `monitoredCoins`: Array of cryptocurrency pairs to track (defaults to ETH/USDT, SOL/USDT)

### Real-time Data Flow

1. **Markets**: Uses CCXT Pro `watchTicker()` for real-time price updates via WebSocket
2. **Positions**: Uses CCXT Pro `watchPositions()` for live position monitoring (authenticated)
3. **Message Passing**: Bidirectional communication between extension and webviews via `postMessage()`

## Key Dependencies

- **ccxt.pro**: Cryptocurrency exchange API library for WebSocket connections
- **@types/vscode**: VS Code extension API types
- **chokidar-cli**: File watching for resource copying during development

## Development Notes

- TypeScript compilation outputs to `dist/` directory
- Resource copying is handled by `copy-resources` script during build
- The extension automatically detects development vs production environment based on `dist/` directory existence
- Both providers handle configuration changes dynamically and restart monitoring as needed
- Error handling includes retry mechanisms for WebSocket connections

## Extension Manifest

The extension contributes:
- Activity bar container "CoinWatchDog" with graph icon
- Two webview panels: "Markets" and "Positions"
- Configuration schema for API credentials and monitored coins
- Activation on view creation for both panels


## 代码规范

### 基本原则

- 使用中文编写代码注释和文档。
- 始终声明每个变量和函数的类型（包括参数和返回值）。
  - 避免使用 any。
  - 如有必要，请创建类型。
- 使用 JSDoc 注释公开类和方法。
- 函数内部不要留空行。
- 每个文件只导出一个内容。

### 命名规范

- 类名使用 PascalCase（大驼峰）。
- 变量、函数和方法使用 camelCase（小驼峰）。
- 文件和目录名使用 kebab-case（短横线）。
- 环境变量使用 UPPERCASE（全大写）。
  - 避免“魔法数字”，定义为常量。
- 每个函数名以动词开头。
- 布尔变量使用动词。例如：isLoading、hasError、canDelete 等。
- 使用完整单词，避免缩写和拼写错误。
  - 除了标准缩写如 API、URL 等。
  - 除了公认的缩写：
    - i, j 用于循环
    - err 表示错误
    - ctx 表示上下文
    - req, res, next 表示中间件函数参数

### 函数规范

- 这里提到的“函数”同样适用于“方法”。
- 编写简短、单一职责的函数，指令数少于 20 行。
- 函数命名以动词加描述形式。
  - 返回布尔值的函数使用 isX、hasX、canX 等。
  - 不返回值的函数使用 executeX、saveX 等。
- 避免嵌套结构，方式包括：
  - 提前判断并返回。
  - 抽取为工具函数。
- 使用高阶函数（如 map、filter、reduce 等）以避免嵌套。
  - 简单函数（少于 3 行）使用箭头函数。
  - 非简单函数使用具名函数。
- 使用默认参数值，避免对 null 或 undefined 的检查。
- 使用 RO-RO（对象入参、对象返回）方式减少参数数量：
  - 多个参数使用对象传入。
  - 多个结果使用对象返回。
  - 明确声明输入输出类型。
- 保持函数单层抽象。

### 数据处理

- 避免滥用原始类型，使用组合类型封装数据。
- 避免在函数中进行数据校验，使用带有内部验证的类。
- 数据处理倾向不可变性：
  - 不变数据使用 readonly。
  - 不变字面量使用 as const。

### 类规范

- 遵循 SOLID 原则。
- 优先使用组合而非继承。
- 使用接口定义契约。
- 编写小而专一的类：
  - 不超过 200 行指令。
  - 不超过 10 个公开方法。
  - 不超过 10 个属性。

### 异常处理

- 使用异常处理预期外的错误。
- 若捕获异常，目的应是：
  - 修复预期问题；
  - 添加上下文信息；
  - 其他情况交由全局处理器处理。

### 其他

- 每次编写跟 ccxt 相关代码都先 use context7 查看 ccxt 的文档，确保代码的正确性。