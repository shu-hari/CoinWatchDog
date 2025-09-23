// 代理配置辅助函数
export function applyProxyConfig(exchange: any, proxyUrl: string) {
  if (!proxyUrl) {
    return; // 没有配置代理，跳过
  }

  try {
    const url = new URL(proxyUrl);
    const protocol = url.protocol.slice(0, -1); // 移除末尾的 ':'

    switch (protocol) {
      case 'http':
        exchange.httpProxy = proxyUrl;
        exchange.wsProxy = proxyUrl;
        break;
      case 'https':
        exchange.httpsProxy = proxyUrl;
        exchange.wsProxy = proxyUrl;
        break;
      case 'socks':
      case 'socks5':
      case 'socks5h':
        exchange.socksProxy = proxyUrl;
        exchange.wsSocksProxy = proxyUrl;
        break;
      default:
        console.warn(`Unsupported proxy protocol: ${protocol}`);
    }

    console.log(`Applied proxy configuration: ${proxyUrl}`);
  } catch (error) {
    console.error('Invalid proxy URL format:', proxyUrl, error);
  }
}
