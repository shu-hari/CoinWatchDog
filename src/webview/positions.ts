// Positions WebView TypeScript 代码
/// <reference path="./types.ts" />

const positionsVSCode = acquireVsCodeApi();

// 消息监听器
window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;

  if (message.command === 'updatePositions') {
    updatePositionsDisplay(message.data);
  }
});

function updatePositionsDisplay(positions: Position[]): void {
  const container = document.getElementById('positions-container') as HTMLElement;

  if (positions.length === 0) {
    container.innerHTML = '<div class="no-positions">No open positions</div>';
    return;
  }

  let html = '';
  positions.forEach(position => {
    const sideClass = position.side === 'long' ? 'side-long' : 'side-short';
    const sideText = position.side.charAt(0).toUpperCase() + position.side.slice(1).toLowerCase();
    const marginModeText = position.marginMode.charAt(0).toUpperCase() + position.marginMode.slice(1).toLowerCase();
    const pnlColor = position.unrealizedPnl >= 0 ? '#25a750' : '#ca3f64';
    const pnlPercentColor = position.percentage >= 0 ? '#25a750' : '#ca3f64';

    const formatNumber = (num: number): string => {
      return num ? parseFloat(num.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    };

    const formatPrice = (num: number): string => {
      return num ? parseFloat(num.toString()).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
    };

    const formatPercentage = (num: number): string => {
      return num ? `${num.toFixed(2)}%` : '0.00%';
    };

    const formatPnLWithSign = (num: number): string => {
      if (num > 0) return `+${formatNumber(num)}`;
      if (num < 0) return `-${formatNumber(Math.abs(num))}`;
      return formatNumber(num);
    };

    const formatPnLPercentWithSign = (num: number): string => {
      if (num > 0) return `+${formatPercentage(num)}`;
      if (num < 0) return `-${formatPercentage(Math.abs(num))}`;
      return formatPercentage(num);
    };

    // 解析合约符号，提取基础部分（如 BTCUSDT）
    const baseSymbol = position.symbol.replace(/[:/].*$/, '');
    const isPerp = position.info?.instType === 'SWAP';
    const ccy = position.info?.ccy;
    const displaySymbol = isPerp ? `${baseSymbol} Perp` : position.symbol;

    html += `
      <div class="position-card">
        <div class="position-header">
          <div class="position-title">
            <div class="position-symbol">${displaySymbol}</div>
            <div class="position-badges">
              <span class="position-side ${sideClass}">${sideText}</span>
              <span class="margin-mode">${marginModeText}</span>
              <span class="leverage">${position.leverage}x</span>
            </div>
          </div>
        </div>
        <div class="position-metrics">
          <div class="pnl-section">
            <div class="pnl-item">
              <div class="pnl-label">PnL (${ccy})</div>
              <div class="pnl-value" style="color: ${pnlColor}">${formatPnLWithSign(position.unrealizedPnl)}</div>
            </div>
            <div class="pnl-item">
              <div class="pnl-label">PnL%</div>
              <div class="pnl-value" style="color: ${pnlPercentColor}">${formatPnLPercentWithSign(position.percentage)}</div>
            </div>
          </div>
          <div class="position-grid">
            <div class="grid-item">
              <div class="grid-label">Size (${ccy})</div>
              <div class="grid-value">${formatNumber(position.notional || position.contracts)}</div>
            </div>
            <div class="grid-item">
              <div class="grid-label">Margin (${ccy})</div>
              <div class="grid-value">${formatNumber(position.initialMargin)}</div>
            </div>
            <div class="grid-item">
              <div class="grid-label">Maintenance margin ratio</div>
              <div class="grid-value">${formatPercentage(position.maintenanceMarginPercentage * 100)}</div>
            </div>
            <div class="grid-item">
              <div class="grid-label">Entry price</div>
              <div class="grid-value">${formatPrice(position.entryPrice)}</div>
            </div>
            <div class="grid-item">
              <div class="grid-label">Mark price</div>
              <div class="grid-value">${formatPrice(position.markPrice)}</div>
            </div>
            <div class="grid-item">
              <div class="grid-label">Liq. price</div>
              <div class="grid-value">${formatPrice(position.liquidationPrice)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}