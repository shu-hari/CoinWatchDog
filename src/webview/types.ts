// VSCode WebView 共享类型定义

interface VSCodeAPI {
  postMessage(message: any): void;
}

declare const acquireVsCodeApi: () => VSCodeAPI;

// Markets 相关接口
interface WatchingSymbols {
  [symbol: string]: TickerData;
}

interface TickerData {
  last: number;          // 最新价格
  percentage: number;    // 涨跌幅百分比
  symbol: string;        // 交易对符号
  info: any;             // 原始交易所信息，包含 instType 等字段
}

interface SearchResult {
  symbol: string;
  base: string;
  quote: string;
  isPerp: boolean;
}

// Positions 相关接口
interface Position {
  symbol: string;           // 交易对符号
  side: string;            // 'long' 或 'short'
  marginMode: 'isolated' | 'cross';       // 是否隔离保证金模式
  contracts: number;       // 合约数量
  contractSize: number;    // 合约大小
  entryPrice: number;      // 入场价格
  markPrice: number;       // 标记价格
  liquidationPrice: number; // 强平价格
  leverage: number;        // 杠杆倍数
  initialMargin: number;   // 初始保证金
  maintenanceMargin: number; // 维持保证金
  maintenanceMarginPercentage: number; // 维持保证金比例
  unrealizedPnl: number;   // 未实现盈亏
  percentage: number;      // 盈亏百分比
  notional: number;        // 名义价值（Size in USDT）
  info: any;               // 原始交易所信息，包含 instType 等字段
}