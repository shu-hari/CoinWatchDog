import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { applyProxyConfig } from './utils';

const ccxt = require('ccxt').pro;

interface ExchangeCredentials {
  exchangeId: string;
  apiKey: string;
  secret: string;
  passphrase: string;
}

export class PositionsProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'positionsView';
  private _view?: vscode.WebviewView;
  private authenticatedExchange: any;
  private positionsData: any[] = [];
  private isPositionWatching = false;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.setupAuthenticatedExchange();
  }

  private setupAuthenticatedExchange() {
    const config = vscode.workspace.getConfiguration('coinWatchDog');
    const credentials = config.get<ExchangeCredentials>('exchangeCredentials')!;

    // 重置交易所实例
    this.authenticatedExchange = null;

    // 检查是否所有必要配置都已填写
    if (!credentials.exchangeId || !credentials.apiKey || !credentials.secret) {
      // 配置不完整，直接返回，不进行验证
      console.log('Exchange configuration incomplete, waiting for user to complete settings');
      return;
    }

    // 配置完整，开始验证和测试
    this.validateAndTestExchangeConfig(credentials);
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

    // 处理webview消息
    webviewView.webview.onDidReceiveMessage(
      message => this.handleMessage(message),
      undefined,
      []
    );

    // 开始监控持仓（如果有API配置）
    this.startPositionMonitoring();
  }

  private async handleMessage(message: any) {
    switch (message.command) {
      default:
        // No specific message handling needed for positions view
        break;
    }
  }

  private async validateAndTestExchangeConfig(credentials: ExchangeCredentials) {
    try {
      // 验证交易所是否被CCXT支持
      if (!ccxt.exchanges.includes(credentials.exchangeId)) {
        vscode.window.showErrorMessage(
          `Exchange '${credentials.exchangeId}' is not supported by CCXT. Supported exchanges: ${ccxt.exchanges.slice(0, 10).join(', ')}...`
        );
        return;
      }

      // 构建配置对象
      const exchangeConfig: any = {
        apiKey: credentials.apiKey,
        secret: credentials.secret,
        enableRateLimit: true,
        sandbox: false
      };

      // 某些交易所需要 passphrase (如 OKX)
      if (credentials.passphrase) {
        exchangeConfig.password = credentials.passphrase;
      }

      const tempExchange = new ccxt[credentials.exchangeId](exchangeConfig);

      // 应用代理配置
      const config = vscode.workspace.getConfiguration('coinWatchDog');
      const proxyUrl = config.get<string>('proxy')!;
      applyProxyConfig(tempExchange, proxyUrl);

      // 检查所需凭据
      tempExchange.checkRequiredCredentials();

      // 测试API连接
      await tempExchange.loadMarkets();

      // 检查是否支持positions相关功能
      if (!tempExchange.has['fetchPositions'] && !tempExchange.has['watchPositions']) {
        vscode.window.showWarningMessage(
          `Exchange '${credentials.exchangeId}' does not support positions monitoring. Please choose a different exchange.`
        );
        return;
      }

      // 验证成功，设置为正式交易所实例
      this.authenticatedExchange = tempExchange;
      console.log(`Exchange '${credentials.exchangeId}' configured and tested successfully`);

      // 显示成功通知
      vscode.window.showInformationMessage(
        `Exchange '${credentials.exchangeId}' connected successfully! Position monitoring is ready.`
      );

      // 验证成功后立即启动监控
      this.startPositionMonitoring();

    } catch (error) {
      console.error('Exchange validation/testing failed:', error);

      // 直接显示API返回的错误消息
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      vscode.window.showErrorMessage(
        `Failed to connect to ${credentials.exchangeId}: ${errorMessage}`
      );
    }
  }

  private updatePositions() {
    if (this._view) {
      this._view.webview.postMessage({
        command: 'updatePositions',
        data: this.positionsData
      });
    }
  }

  private async startPositionMonitoring() {
    if (!this.authenticatedExchange) {
      console.log('No exchange configured for positions monitoring');
      return;
    }

    if (this.isPositionWatching) {
      console.log('Position monitoring already running');
      return;
    }

    try {
      // 确保市场数据已加载
      if (!this.authenticatedExchange.markets) {
        await this.authenticatedExchange.loadMarkets();
      }

      // 开始监控持仓
      this.isPositionWatching = true;
      this.watchPositions();
      console.log('Position monitoring started successfully');
    } catch (error) {
      console.error('Failed to start position monitoring:', error);
      this.isPositionWatching = false;

      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      vscode.window.showErrorMessage(`Failed to start position monitoring: ${errorMessage}`);
    }
  }

  private async watchPositions() {
    while (this.isPositionWatching && this.authenticatedExchange) {
      try {
        const positions = await this.authenticatedExchange.watchPositions();
        console.log("🚀 ~ PositionsProvider ~ watchPositions ~ positions:", positions)
        // 过滤出有持仓的数据
        this.positionsData = positions.filter((pos: any) =>
          pos.contracts && pos.contracts > 0
        );
        console.log('Received positions:', this.positionsData.length);
        this.updatePositions();
      } catch (error) {
        console.error('Error watching positions:', error);

        // 严重错误：API凭据问题，停止监控
        if (error instanceof Error) {
          if (error.message.includes('Invalid API-key') ||
              error.message.includes('Invalid signature') ||
              error.message.includes('Invalid passphrase')) {
            this.isPositionWatching = false;
            vscode.window.showErrorMessage(
              `API credentials became invalid: ${error.message}. Please refresh your API keys in settings.`
            );
            break;
          } else if (error.message.includes('Rate limit')) {
            console.log('Rate limit hit, waiting longer before retry...');
            await new Promise(resolve => setTimeout(resolve, 30000)); // 等待30秒
            continue;
          } else if (error.message.includes('Network') ||
                     error.message.includes('timeout') ||
                     error.message.includes('ECONNRESET')) {
            console.log('Network error, retrying in 10 seconds...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            continue;
          } else {
            console.log('Unknown error, retrying in 15 seconds...');
            await new Promise(resolve => setTimeout(resolve, 15000));
            continue;
          }
        } else {
          console.log('Non-Error exception, retrying in 10 seconds...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          continue;
        }
      }
    }
    this.isPositionWatching = false;
    console.log('Position monitoring stopped');
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // 动态检测环境：开发环境有 dist 目录，发布环境没有
    const distPath = path.join(this._extensionUri.fsPath, 'dist');
    const isDevelopment = fs.existsSync(distPath);

    // 根据环境选择路径
    const webviewDir = isDevelopment ? 'dist/webview' : 'webview';

    // 读取HTML模板文件
    const htmlPath = path.join(this._extensionUri.fsPath, webviewDir, 'positions.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    // 获取资源URIs
    const sharedCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, webviewDir, 'shared.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, webviewDir, 'positions.js')
    );

    // 替换模板变量
    htmlContent = htmlContent.replace('{{sharedCssPath}}', sharedCssUri.toString());
    htmlContent = htmlContent.replace('{{jsPath}}', jsUri.toString());
    
    // 获取交易所ID：优先使用已初始化的交易所ID，否则从配置中获取
    const config = vscode.workspace.getConfiguration('coinWatchDog');
    const credentials = config.get<ExchangeCredentials>('exchangeCredentials')!;
    const exchangeId = this.authenticatedExchange?.id || credentials?.exchangeId || 'Not configured';
    htmlContent = htmlContent.replace('{{exchangeId}}', exchangeId);

    return htmlContent;
  }

  public onConfigurationChanged() {
    console.log('Positions configuration changed, updating authenticated exchange');

    // 停止当前的持仓监控
    this.isPositionWatching = false;

    // 重新设置认证交易所
    this.setupAuthenticatedExchange();

    // 重新开始持仓监控
    setTimeout(() => {
      this.startPositionMonitoring();
    }, 1000); // 延迟1秒确保旧的监控已停止
  }
}