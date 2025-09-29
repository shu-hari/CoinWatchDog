import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const ccxt = require("ccxt").pro;

export class MarketsProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "marketsView";
  private _view?: vscode.WebviewView;
  private exchange: any;
  private watchingSymbols: WatchingSymbols = {};
  private isMarketWatching = false;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.setupExchange();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      []
    );

    this.startMarketWatching();
  }

  private async handleMessage(message: any) {
    switch (message.command) {
      case "searchCoins":
        this.handleSymbolSearch(message.query);
        break;
      case "addCoin":
        this.handleAddSymbol(message.symbol);
        break;
      case "removeCoin":
        this.handleRemoveSymbol(message.symbol);
        break;
    }
  }

  private handleSymbolSearch(query: string) {
    if (!this.exchange.markets || !query) {
      this.sendSearchResults([]);
      return;
    }

    const results = Object.keys(this.exchange.markets)
      .filter(
        (symbol) =>
          symbol.includes("/USDT") &&
          (symbol.toLowerCase().includes(query.toLowerCase()) ||
            this.exchange.markets[symbol].base
              ?.toLowerCase()
              .includes(query.toLowerCase()))
      )
      .map((symbol) => ({
        symbol,
        base: this.exchange.markets[symbol].base,
        quote: this.exchange.markets[symbol].quote,
        isPerp: this.exchange.markets[symbol].info?.instType === "SWAP",
      }));

    this.sendSearchResults(results);
  }

  private sendSearchResults(results: any[]) {
    if (this._view) {
      this._view.webview.postMessage({
        command: "searchResults",
        data: results,
      });
    }
  }

  private async handleAddSymbol(symbol: string) {
    if (!symbol || this.watchingSymbols.hasOwnProperty(symbol)) {
      return;
    }

    const config = vscode.workspace.getConfiguration("coinWatchDog");
    const watchSymbols = config.get<string[]>("markets.watchSymbols")!;

    if (!watchSymbols.includes(symbol)) {
      const updatedSymbols = [...watchSymbols, symbol];
      await config.update(
        "markets.watchSymbols",
        updatedSymbols,
        vscode.ConfigurationTarget.Global
      );
    }

    this.addSymbolWatching(symbol);
  }

  private async handleRemoveSymbol(symbol: string) {
    const config = vscode.workspace.getConfiguration("coinWatchDog");
    const watchSymbols = config.get<string[]>("markets.watchSymbols")!;

    const updatedSymbols = watchSymbols.filter((coin) => coin !== symbol);

    await config.update(
      "markets.watchSymbols",
      updatedSymbols,
      vscode.ConfigurationTarget.Global
    );

    this.removeSymbolWatching(symbol);
  }

  private setupExchange() {
    const config = vscode.workspace.getConfiguration("coinWatchDog");
    const exchangeId = config.get<string>("markets.exchangeId")!;

    this.exchange = null;
    this.validateExchange(exchangeId);
  }

  private async validateExchange(exchangeId: string) {
    try {
      if (!ccxt.exchanges.includes(exchangeId)) {
        vscode.window.showErrorMessage(
          `Exchange '${exchangeId}' is not supported`
        );
      }

      const ExchangeClass = ccxt[exchangeId];

      const exchangeConfig: any = {
        enableRateLimit: true,
        sandbox: false,
      };

      const tempExchange = new ExchangeClass(exchangeConfig);

      if (!tempExchange.has["watchTicker"]) {
        vscode.window.showWarningMessage(
          `Exchange '${exchangeId}' does not support real-time ticker watching. Please choose a different exchange.`
        );
        return;
      }

      // 加载市场数据
      await tempExchange.loadMarkets();
      console.log(
        "TempExchange markets loaded successfully",
        tempExchange.markets
      );

      this.exchange = tempExchange;

      console.log(
        `Exchange '${exchangeId}' configured and tested successfully`
      );

      vscode.window.showInformationMessage(
        `Exchange '${exchangeId}' connected successfully.`
      );

      this.sendExchangeIdUpdate(exchangeId);

      this.startMarketWatching();
    } catch (error) {
      console.error("Exchange validation/testing failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      vscode.window.showErrorMessage(
        `Failed to connect to ${exchangeId}: ${errorMessage}`
      );
      this.exchange = null;
    }
  }

  private async startMarketWatching() {
    if (!this.exchange) {
      console.error("No exchange configured for Markets view");
      return;
    }

    if (this.isMarketWatching) {
      console.log("Market watching already running");
      return;
    }

    try {
      this.isMarketWatching = true;

      if (!this.exchange.markets) {
        console.log("Markets not loaded, loading...");
        await this.exchange.loadMarkets();
        console.log("Markets loaded successfully", this.exchange.markets);
      }

      const config = vscode.workspace.getConfiguration("coinWatchDog");
      const watchSymbols = config.get<string[]>("markets.watchSymbols")!;

      for (const symbol of watchSymbols) {
        this.addSymbolWatching(symbol);
      }
      console.log("Market watching started successfully");
    } catch (error) {
      console.error("Failed to start market watching:", error);
    }
  }

  private async addSymbolWatching(symbol: string) {
    if (this.watchingSymbols.hasOwnProperty(symbol)) {
      return;
    }

    if (!this.exchange.markets[symbol]) {
      console.error(`Symbol ${symbol} not found in markets`);
      return;
    }

    this.watchingSymbols[symbol] = {
      last: 0,
      percentage: 0,
      symbol: symbol,
      info: null,
    };

    this.watchSymbol(symbol);
  }

  private removeSymbolWatching(symbol: string) {
    delete this.watchingSymbols[symbol];
    this.sendMarketsUpdate();
  }

  private async watchSymbol(symbol: string) {
    while (this.watchingSymbols.hasOwnProperty(symbol)) {
      try {
        const ticker = await this.exchange.watchTicker(symbol);

        // 如果配置中已经删除了，立即停止监听
        if (!this.watchingSymbols.hasOwnProperty(symbol)) {
          break;
        }

        const newTickerData = {
          last: ticker.last || 0,
          percentage: ticker.percentage || 0,
          symbol: symbol,
          info: ticker.info || null,
        };

        // 只有价格或涨跌幅变化时才更新UI，但不影响监听状态
        const currentData = this.watchingSymbols[symbol];
        if (
          currentData.last !== newTickerData.last ||
          currentData.percentage !== newTickerData.percentage
        ) {
          this.watchingSymbols[symbol] = newTickerData;
          this.sendMarketsUpdate();
        }
      } catch (error) {
        console.error(`Error watching ${symbol}:`, error);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    console.log(`Stopped watching ${symbol}`);
  }

  private sendMarketsUpdate() {
    if (this._view) {
      this._view.webview.postMessage({
        command: "updatePrices",
        data: this.watchingSymbols,
      });
    }
  }

  private sendExchangeIdUpdate(exchangeId: string) {
    if (this._view) {
      this._view.webview.postMessage({
        command: "updateExchangeId",
        exchangeId: exchangeId,
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // 根据环境选择路径
    const webviewDir = "dist/webview";

    // 读取HTML模板文件
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      webviewDir,
      "markets.html"
    );
    let htmlContent = fs.readFileSync(htmlPath, "utf8");

    // 获取资源URIs
    const sharedCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, webviewDir, "shared.css")
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, webviewDir, "markets.js")
    );

    // 替换模板变量
    htmlContent = htmlContent.replace(
      "{{sharedCssPath}}",
      sharedCssUri.toString()
    );
    htmlContent = htmlContent.replace("{{jsPath}}", jsUri.toString());

    // 获取交易所ID：优先使用已初始化的交易所ID，否则从配置中获取
    const config = vscode.workspace.getConfiguration("coinWatchDog");
    const exchangeId =
      this.exchange?.id || config.get<string>("markets.exchangeId")!;
    htmlContent = htmlContent.replace("{{exchangeId}}", exchangeId);

    return htmlContent;
  }

  /**
   * 同步监控符号列表
   * 移除不再需要监控的符号，添加新需要监控的符号
   */
  private syncWatchingSymbols(watchSymbols: string[]) {
    const currentSymbols = Object.keys(this.watchingSymbols);

    // 移除不再监控的符号
    for (const symbol of currentSymbols) {
      if (!watchSymbols.includes(symbol)) {
        this.removeSymbolWatching(symbol);
      }
    }

    // 添加新监控的符号
    for (const symbol of watchSymbols) {
      if (!this.watchingSymbols.hasOwnProperty(symbol)) {
        this.addSymbolWatching(symbol);
      }
    }
  }

  public reset() {
    this.watchingSymbols = {};
    this.isMarketWatching = false;
    this.setupExchange();
  }

  public onConfigurationChanged() {
    const config = vscode.workspace.getConfiguration("coinWatchDog");
    const exchangeId = config.get<string>("markets.exchangeId")!;
    const watchSymbols = config.get<string[]>("markets.watchSymbols")!;

    const currentExchangeId = this.exchange?.id;
    if (currentExchangeId !== exchangeId) {
      console.log(
        `Exchange changed from ${currentExchangeId} to ${exchangeId}, reinitializing...`
      );

      this.reset();
      return;
    }

    this.syncWatchingSymbols(watchSymbols);
  }
}
