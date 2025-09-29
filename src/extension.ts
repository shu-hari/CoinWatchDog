import * as vscode from 'vscode';
import { MarketsProvider } from './marketsProvider';
import { PositionsProvider } from './positionsProvider';

let marketsProvider: MarketsProvider;
let positionsProvider: PositionsProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('CoinWatchDog 插件已激活');

    // 创建并注册Markets WebView提供器
    marketsProvider = new MarketsProvider(context.extensionUri);
    const marketsDisposable = vscode.window.registerWebviewViewProvider(
        MarketsProvider.viewType,
        marketsProvider
    );

    // 创建并注册Positions WebView提供器
    positionsProvider = new PositionsProvider(context.extensionUri);
    const positionsDisposable = vscode.window.registerWebviewViewProvider(
        PositionsProvider.viewType,
        positionsProvider
    );

    // 注册设置命令
    const settingsCommand = vscode.commands.registerCommand(
        'coinWatchDog.openSettings',
        () => {
            vscode.commands.executeCommand('workbench.action.openSettings', '@ext:CoinWatchDog.CoinWatchDog');
        }
    );

    // 注册市场刷新命令
    const refreshMarketsCommand = vscode.commands.registerCommand(
        'coinWatchDog.refreshMarkets',
        () => {
            marketsProvider.reset();
        }
    );

    // 注册仓位刷新命令
    const refreshPositionsCommand = vscode.commands.registerCommand(
        'coinWatchDog.refreshPositions',
        () => {
            positionsProvider.reset();
        }
    );

    // 监听配置变化
    const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        // 检查 markets 配置变更
        if (event.affectsConfiguration('coinWatchDog.markets')) {
            console.log('CoinWatchDog markets configuration changed');
            marketsProvider.onConfigurationChanged();
        }
        
        // 检查 exchangeCredentials 配置变更
        if (event.affectsConfiguration('coinWatchDog.exchangeCredentials')) {
            console.log('CoinWatchDog exchangeCredentials configuration changed');
            positionsProvider.onConfigurationChanged();
        }
    });

    context.subscriptions.push(
        marketsDisposable, 
        positionsDisposable, 
        settingsCommand, 
        refreshMarketsCommand, 
        refreshPositionsCommand, 
        configWatcher
    );
}

export function deactivate() {
    console.log('CoinWatchDog 插件已停用');
}