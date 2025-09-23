import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { applyProxyConfig } from './utils';

const ccxt = require('ccxt').pro;

export class MarketsProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'marketsView';
  private _view?: vscode.WebviewView;
  private exchange: any;
  private watchingSymbols: { [symbol: string]: any } = {};

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.setupExchange();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      undefined,
      []
    );

    this.startPriceMonitoring();
  }

  private async handleMessage(message: any) {
    switch (message.command) {
      case 'searchCoins':
        this.handleCoinSearch(message.query);
        break;
      case 'addCoin':
        this.handleAddCoin(message.symbol);
        break;
      case 'removeCoin':
        this.handleRemoveCoin(message.symbol);
        break;
    }
  }

  private handleCoinSearch(query: string) {
    if (!this.exchange.markets || !query) {
      this.sendSearchResults([]);
      return;
    }

    const results = Object.keys(this.exchange.markets)
      .filter(symbol =>
        symbol.includes('/USDT') &&
        (symbol.toLowerCase().includes(query.toLowerCase()) ||
         this.exchange.markets[symbol].base?.toLowerCase().includes(query.toLowerCase()))
      )
      // .slice(0, 10)
      .map(symbol => ({
        symbol,
        base: this.exchange.markets[symbol].base,
        quote: this.exchange.markets[symbol].quote,
        isPerp: this.exchange.markets[symbol].info?.instType === 'SWAP'
      }));

    this.sendSearchResults(results);
  }

  private sendSearchResults(results: any[]) {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'searchResults',
        data: results
      });
    }
  }

  private async handleAddCoin(symbol: string) {
    if (!symbol || this.watchingSymbols.hasOwnProperty(symbol)) {
      return;
    }

    const config = vscode.workspace.getConfiguration('coinWatchDog');
    const watchSymbols = config.get<string[]>('markets.watchSymbols')!;

    if (!watchSymbols.includes(symbol)) {
      const updatedSymbols = [...watchSymbols, symbol];
      await config.update('markets.watchSymbols', updatedSymbols, vscode.ConfigurationTarget.Global);
    }

    this.addCoinMonitoring(symbol);
  }

  private async handleRemoveCoin(symbol: string) {
    const config = vscode.workspace.getConfiguration('coinWatchDog');
    const watchSymbols = config.get<string[]>('markets.watchSymbols')!;

    const updatedSymbols = watchSymbols.filter(coin => coin !== symbol);

    await config.update('markets.watchSymbols', updatedSymbols, vscode.ConfigurationTarget.Global);
    this.removeCoinMonitoring(symbol);
  }

  private setupExchange() {
    const config = vscode.workspace.getConfiguration('coinWatchDog');
    const exchangeId = config.get<string>('markets.exchangeId')!;

    this.exchange = null;
    this.validateAndTestExchangeConfig(exchangeId);
  }

  private async validateAndTestExchangeConfig(exchangeId: string) {
    try {
      if (!ccxt.exchanges.includes(exchangeId)) {
        throw new Error(`Exchange '${exchangeId}' is not supported by CCXT. Supported exchanges: ${ccxt.exchanges.slice(0, 10).join(', ')}...`);
      }

      const ExchangeClass = ccxt[exchangeId];

      const exchangeConfig: any = {
        enableRateLimit: true,
        sandbox: false
      };

      const tempExchange = new ExchangeClass(exchangeConfig);

      // 应用代理配置
      const config = vscode.workspace.getConfiguration('coinWatchDog');
      const proxyUrl = config.get<string>('proxy')!;
      applyProxyConfig(tempExchange, proxyUrl);

      // 测试API连接
      await tempExchange.loadMarkets();

      if (!tempExchange.has['watchTicker']) {
        throw new Error(`Exchange '${exchangeId}' does not support real-time ticker watching`);
      }

      this.exchange = tempExchange;
      console.log(`Exchange '${exchangeId}' configured and tested successfully`);

      vscode.window.showInformationMessage(
        `Exchange '${exchangeId}' connected successfully! Market monitoring is ready.`
      );

      this.startPriceMonitoring();

    } catch (error) {
      console.error('Exchange validation/testing failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      vscode.window.showErrorMessage(`Failed to connect to ${exchangeId}: ${errorMessage}`);
      this.exchange = null;
    }
  }

  private async startPriceMonitoring() {
    if (!this.exchange) {
      console.error('No exchange configured for Markets view');
      return;
    }

    try {
      console.log('Loading markets...');
      await this.exchange.loadMarkets();
      console.log('Markets loaded successfully', this.exchange.markets);

      const config = vscode.workspace.getConfiguration('coinWatchDog');
      const watchSymbols = config.get<string[]>('markets.watchSymbols')!;

      for (const symbol of watchSymbols) {
        this.addCoinMonitoring(symbol);
      }
    } catch (error) {
      console.error('Failed to start price monitoring:', error);
    }
  }

  private async addCoinMonitoring(symbol: string) {
    if (this.watchingSymbols.hasOwnProperty(symbol)) {
      return;
    }

    if (!this.exchange.markets[symbol]) {
      console.error(`Symbol ${symbol} not found in markets`);
      return;
    }

    const market = this.exchange.markets[symbol];
    this.watchingSymbols[symbol] = {
      last: 0,
      percentage: 0,
      symbol: symbol,
      base: market.base,
      quote: market.quote,
      type: market.type,
      info: null
    };
    this.watchSymbol(symbol);
  }

  private removeCoinMonitoring(symbol: string) {
    delete this.watchingSymbols[symbol];
    this.updateWebview();
  }

  private async watchSymbol(symbol: string) {
    while (this.watchingSymbols.hasOwnProperty(symbol)) {
      try {
        const ticker = await this.exchange.watchTicker(symbol);

        if (!this.watchingSymbols.hasOwnProperty(symbol)) {
          // 如果配置中已经删除了，立即停止监听
          break;
        }

        const newTickerData = {
          last: ticker.last || 0,
          percentage: ticker.percentage || 0,
          symbol: symbol,
          base: this.watchingSymbols[symbol].base,
          quote: this.watchingSymbols[symbol].quote,
          type: this.watchingSymbols[symbol].type,
          info: ticker.info || null
        };

        // 只有价格或涨跌幅变化时才更新UI，但不影响监听状态
        const currentData = this.watchingSymbols[symbol];
        if (currentData.last !== newTickerData.last ||
            currentData.percentage !== newTickerData.percentage) {
          this.watchingSymbols[symbol] = newTickerData;
          this.updateWebview();
        }
      } catch (error) {
        console.error(`Error watching ${symbol}:`, error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    console.log(`Stopped watching ${symbol}`);
  }

  private updateWebview() {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updatePrices',
        data: this.watchingSymbols
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // 动态检测环境：开发环境有 dist 目录，发布环境没有
    const distPath = path.join(this._extensionUri.fsPath, 'dist');
    const isDevelopment = fs.existsSync(distPath);

    // 根据环境选择路径
    const webviewDir = isDevelopment ? 'dist/webview' : 'webview';

    // 读取HTML模板文件
    const htmlPath = path.join(this._extensionUri.fsPath, webviewDir, 'markets.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // 获取资源URIs
    const sharedCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, webviewDir, 'shared.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, webviewDir, 'markets.js')
    );

    // 替换模板变量
    htmlContent = htmlContent.replace('{{sharedCssPath}}', sharedCssUri.toString());
    htmlContent = htmlContent.replace('{{jsPath}}', jsUri.toString());
    
    // 获取交易所ID：优先使用已初始化的交易所ID，否则从配置中获取
    const config = vscode.workspace.getConfiguration('coinWatchDog');
    const exchangeId = this.exchange?.id || config.get<string>('markets.exchangeId')!;
    htmlContent = htmlContent.replace('{{exchangeId}}', exchangeId);

    return htmlContent;
  }

  public onConfigurationChanged() {
    console.log('Markets configuration changed');

    const config = vscode.workspace.getConfiguration('coinWatchDog');
    const exchangeId = config.get<string>('markets.exchangeId')!;
    const watchSymbols = config.get<string[]>('markets.watchSymbols')!;

    const currentExchangeId = this.exchange?.id || 'okx';
    if (currentExchangeId !== exchangeId) {
      console.log(`Exchange changed from ${currentExchangeId} to ${exchangeId}, reinitializing...`);

      this.watchingSymbols = {};
      this.setupExchange();
      return;
    }

    const currentSymbols = Object.keys(this.watchingSymbols);

    for (const symbol of currentSymbols) {
      if (!watchSymbols.includes(symbol)) {
        this.removeCoinMonitoring(symbol);
      }
    }

    for (const symbol of watchSymbols) {
      if (!this.watchingSymbols.hasOwnProperty(symbol)) {
        this.addCoinMonitoring(symbol);
      }
    }
  }
}