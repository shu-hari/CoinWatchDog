// Markets WebView TypeScript 代码
/// <reference path="./types.ts" />

const marketsVSCode = acquireVsCodeApi();
let searchTimeout: NodeJS.Timeout;

const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchDropdown = document.getElementById('search-dropdown') as HTMLElement;

// 搜索相关函数
searchInput.addEventListener('input', (e: Event) => {
  const target = e.target as HTMLInputElement;
  const query = target.value.trim();

  clearTimeout(searchTimeout);

  if (query.length < 2) {
    hideSearchDropdown();
    return;
  }

  searchTimeout = setTimeout(() => {
    marketsVSCode.postMessage({
      command: 'searchCoins',
      query: query
    });
  }, 300);
});

searchInput.addEventListener('focus', () => {
  if (searchInput.value.trim().length >= 2) {
    showSearchDropdown();
  }
});

document.addEventListener('click', (e: Event) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.search-container')) {
    hideSearchDropdown();
  }
});

function showSearchDropdown(): void {
  searchDropdown.classList.add('show');
}

function hideSearchDropdown(): void {
  searchDropdown.classList.remove('show');
}

function marketsAddCoin(symbol: string): void {
  marketsVSCode.postMessage({
    command: 'addCoin',
    symbol: symbol
  });
  searchInput.value = '';
  hideSearchDropdown();
}

function marketsRemoveCoin(symbol: string): void {
  marketsVSCode.postMessage({
    command: 'removeCoin',
    symbol: symbol
  });
}

// 消息监听器
window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;

  if (message.command === 'updatePrices') {
    updateMarketsDisplay(message.data);
  } else if (message.command === 'searchResults') {
    displaySearchResults(message.data);
  } else if (message.command === 'updateExchangeId') {
    updateMarketsExchangeId(message.exchangeId);
  }
});

function displaySearchResults(results: SearchResult[]): void {
  if (!results || results.length === 0) {
    searchDropdown.innerHTML = '<div class="no-results">No results found</div>';
    showSearchDropdown();
    return;
  }

  let html = '';
  results.forEach(result => {
    html += `
      <div class="search-item" onclick="marketsAddCoin('${result.symbol}')">
        <div class="search-item-left">
          <div class="search-symbol">${result.symbol} ${result.isPerp ? '<span class="perp-badge">Perp</span>' : ''}</div>
        </div>
        <div class="search-add">+</div>
      </div>
    `;
  });

  searchDropdown.innerHTML = html;
  showSearchDropdown();
}

function updateMarketsDisplay(watchingSymbols: WatchingSymbols): void {
  const container = document.getElementById('markets-container') as HTMLElement;
  const symbols = Object.keys(watchingSymbols);

  if (symbols.length === 0) {
    container.innerHTML = '<div class="tip-text">No coins being watched. Search and add coins above.</div>';
    return;
  }

  // 检查是否需要重新生成DOM结构
  const existingCards = container.querySelectorAll('.market-card');
  const existingSymbols = Array.from(existingCards).map(card => {
    return card.getAttribute('data-symbol') || '';
  });

  // 如果币种列表发生变化，才重新生成整个HTML
  if (existingSymbols.length !== symbols.length ||
    !symbols.every(symbol => existingSymbols.includes(symbol))) {

    let html = '';
    symbols.forEach(symbol => {
      const tickerData = watchingSymbols[symbol];
      const isPerpetual = tickerData.info && tickerData.info.instType === "SWAP";
      const changeClass = tickerData.percentage >= 0 ? 'positive' : 'negative';
      const changePrefix = tickerData.percentage >= 0 ? '+' : '';
      const [base, quote] = isPerpetual ? tickerData.symbol.split(':')[0].split('/') : tickerData.symbol.split('/');
      const symbolText = `${base}<span class="quote">/${quote}</span>`;
  
      html += `
        <div class="market-card" data-symbol="${symbol}">
          <button class="remove-btn" onclick="marketsRemoveCoin('${symbol}')" title="Remove ${symbol}">×</button>
          <div class="market-header">
            <div class="market-left">
              <div class="market-symbol" data-symbol="${symbol}">
                ${ symbolText }
              </div>
              <div class="market-badges" data-symbol="${symbol}">
                ${ isPerpetual ? '<span class="perp-badge">Perp</span>' : ''}
              </div>
            </div>
            <div class="market-right">
              <div class="market-price" data-symbol="${symbol}">
                ${tickerData.last === 0 ? '<span class="loading">Loading...</span>' : tickerData.last.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
              </div>
              <div class="market-change ${changeClass}" data-symbol="${symbol}">
                ${tickerData.percentage === 0 ? '' : `${changePrefix}${tickerData.percentage.toFixed(2)}%`}
              </div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } else {
    // 增量更新：只更新价格和涨跌幅，Perp标签仅在状态变化时更新
    symbols.forEach(symbol => {
      const tickerData = watchingSymbols[symbol];
      const priceElement = container.querySelector(`.market-price[data-symbol="${symbol}"]`) as HTMLElement;
      const changeElement = container.querySelector(`.market-change[data-symbol="${symbol}"]`) as HTMLElement;
      const badgesElement = container.querySelector(`.market-badges[data-symbol="${symbol}"]`) as HTMLElement;
      const symbolElement = container.querySelector(`.market-symbol[data-symbol="${symbol}"]`) as HTMLElement;

      // 更新价格
      if (priceElement) {
        priceElement.innerHTML = tickerData.last === 0 ?
          '<span class="loading">Loading...</span>' :
          tickerData.last.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
      }

      // 更新涨跌幅
      if (changeElement) {
        const changeClass = tickerData.percentage >= 0 ? 'positive' : 'negative';
        const changePrefix = tickerData.percentage >= 0 ? '+' : '';
        changeElement.className = `market-change ${changeClass}`;
        changeElement.textContent = tickerData.percentage === 0 ? '' : `${changePrefix}${tickerData.percentage.toFixed(2)}%`;
      }

      // 智能更新Perp标签：只有状态真正变化时才更新
      if (badgesElement) {
        const isPerpetual = tickerData.info && tickerData.info.instType === "SWAP";
        const hasPerpBadge = badgesElement.querySelector('.perp-badge') !== null;

        // 只有当Perp状态发生变化时才更新HTML
        if (isPerpetual !== hasPerpBadge) {
          badgesElement.innerHTML = isPerpetual ? '<span class="perp-badge">Perp</span>' : '';
        }
      }

      // 智能更新符号：只有内容真正变化时才更新DOM
      if (symbolElement) {
        const isPerpetual = tickerData.info && tickerData.info.instType === "SWAP";
        const [base, quote] = isPerpetual ? tickerData.symbol.split(':')[0].split('/') : tickerData.symbol.split('/');
        const symbolText = `${base}<span class="quote">/${quote}</span>`;
        
        // 只有当符号内容发生变化时才更新HTML
        if (symbolElement.innerHTML !== symbolText) {
          symbolElement.innerHTML = symbolText;
        }
      }
    });
  }
}

function updateMarketsExchangeId(exchangeId: string): void {
  const exchangeNameElement = document.getElementById('exchange-name') as HTMLElement;
  if (exchangeNameElement && exchangeNameElement.textContent !== exchangeId) {
    exchangeNameElement.textContent = exchangeId;
  }
}