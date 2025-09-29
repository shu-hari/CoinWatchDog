import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

const ccxt = require("ccxt").pro;

interface ExchangeCredentials {
  exchangeId: string;
  apiKey: string;
  secret: string;
  passphrase: string;
}

export class PositionsProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "positionsView";
  private _view?: vscode.WebviewView;
  private exchange: any;
  private watchingPositions: WatchingPositions = {};
  private isPositionWatching = false;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.setupExchange();
  }

  private setupExchange() {
    const config = vscode.workspace.getConfiguration("coinWatchDog");
    const credentials = config.get<ExchangeCredentials>("exchangeCredentials")!;

    this.exchange = null;

    if (!credentials.exchangeId || !credentials.apiKey || !credentials.secret) {
      console.log(
        "Exchange configuration incomplete, waiting for user to complete settings"
      );
      return;
    }

    // 配置完整，开始验证和测试
    this.validateExchange(credentials);
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

    // 处理webview消息
    webviewView.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      []
    );

    this.startPositionWatching();
  }

  private async handleMessage(message: any) {
    switch (message.command) {
      default:
        // No specific message handling needed for positions view
        break;
    }
  }

  private async validateExchange(credentials: ExchangeCredentials) {
    try {
      if (!ccxt.exchanges.includes(credentials.exchangeId)) {
        vscode.window.showErrorMessage(
          `Exchange '${credentials.exchangeId}' is not supported`
        );
        return;
      }

      const exchangeConfig: any = {
        apiKey: credentials.apiKey,
        secret: credentials.secret,
        enableRateLimit: true,
        sandbox: false,
      };

      // 某些交易所需要 passphrase (如 OKX)
      if (credentials.passphrase) {
        exchangeConfig.password = credentials.passphrase;
      }

      const tempExchange = new ccxt[credentials.exchangeId](exchangeConfig);

      if (!tempExchange.has["watchPositions"]) {
        vscode.window.showWarningMessage(
          `Exchange '${credentials.exchangeId}' does not support positions watching. Please choose a different exchange.`
        );
        return;
      }

      // 检查所需凭据
      tempExchange.checkRequiredCredentials();

      this.exchange = tempExchange;
      console.log(
        `Exchange '${credentials.exchangeId}' configured and tested successfully`
      );

      vscode.window.showInformationMessage(
        `Exchange '${credentials.exchangeId}' connected successfully.`
      );

      this.sendExchangeIdUpdate(credentials.exchangeId);

      this.startPositionWatching();
    } catch (error) {
      console.error("Exchange validation/testing failed:", error);

      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      vscode.window.showErrorMessage(
        `Failed to connect to ${credentials.exchangeId}: ${errorMessage}`
      );
    }
  }

  private sendPositionsUpdate() {
    if (this._view) {
      this._view.webview.postMessage({
        command: "updatePositions",
        data: this.watchingPositions,
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

  private async startPositionWatching() {
    if (!this.exchange) {
      console.log("No exchange configured for positions monitoring");
      return;
    }

    if (this.isPositionWatching) {
      console.log("Position watching already running");
      return;
    }

    try {
      this.isPositionWatching = true;
      this.watchPositions();
      console.log("Position watching started successfully");
    } catch (error) {
      console.error("Failed to start position watching:", error);

      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      vscode.window.showErrorMessage(
        `Failed to start position watching: ${errorMessage}`
      );
    }
  }

  private async watchPositions() {
    while (this.exchange) {
      try {
        const positions = await this.exchange.watchPositions();

        // 过滤出有持仓的数据
        this.watchingPositions = positions.filter(
          (pos: any) => pos.contracts && pos.contracts > 0
        );
        console.log("Received positions:", this.watchingPositions.length);
        this.sendPositionsUpdate();
      } catch (error) {
        console.error("Error watching positions:", error);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    console.log("Position watching stopped");
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // 根据环境选择路径
    const webviewDir = "dist/webview";

    // 读取HTML模板文件
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      webviewDir,
      "positions.html"
    );
    let htmlContent = fs.readFileSync(htmlPath, "utf8");

    // 获取资源URIs
    const sharedCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, webviewDir, "shared.css")
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, webviewDir, "positions.js")
    );

    // 替换模板变量
    htmlContent = htmlContent.replace(
      "{{sharedCssPath}}",
      sharedCssUri.toString()
    );
    htmlContent = htmlContent.replace("{{jsPath}}", jsUri.toString());

    // 获取交易所ID：优先使用已初始化的交易所ID，否则从配置中获取
    const config = vscode.workspace.getConfiguration("coinWatchDog");
    const credentials = config.get<ExchangeCredentials>("exchangeCredentials")!;
    const exchangeId =
      this.exchange?.id || credentials?.exchangeId || "Not configured";
    htmlContent = htmlContent.replace("{{exchangeId}}", exchangeId);

    return htmlContent;
  }

  public reset() {
    this.watchingPositions = {};
    this.isPositionWatching = false;
    this.setupExchange();
  }

  public onConfigurationChanged() {
    const config = vscode.workspace.getConfiguration("coinWatchDog");
    const credentials = config.get<ExchangeCredentials>("exchangeCredentials")!;

    if (
      credentials.exchangeId !== this.exchange?.id ||
      credentials.apiKey !== this.exchange?.apiKey ||
      credentials.secret !== this.exchange?.secret ||
      credentials.passphrase !== this.exchange?.password
    ) {
      console.log(
        `Exchange changed from ${this.exchange?.id} to ${credentials.exchangeId}, reinitializing...`
      );

      this.reset();
      return;
    }
  }
}
