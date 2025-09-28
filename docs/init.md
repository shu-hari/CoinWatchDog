# 插件 webview 初始化逻辑需要进行一些调整，以下是初始化逻辑流程，请结合已有实现进行调整：

## 初始化流程
- webview 注册成功后
- 这时 webview 不应该直接展示 html 内容，而是应该显示一个 loading icon 动画。
- 随后，对应的 provider 还是 setupExchange 方法，进行交易所的校验和初始化。
- market setupExchange
    - 检测是否配置 markets.exchangeId 配置项
        - 未配置
            - loading icon 消失
            - 展示引导配置的提示语
        - 已配置
            - 后台校验 markets.exchangeId 对应的交易所是否支持
                - 成功
                    - 如果没有配置 markets.watchSymbols 配置项，loading icon 消失，展示引导配置提示语
                    - 配置了 markets.watchSymbols 配置项，loading icon 消失，正常展示
                - 失败
                    - Vscode 推送异常信息提示，loading icon 消失，market view 界面展示“出了点问题”提示语 + icon
- position setupExchange
    - 检测是否配置 exchangeCredentials 配置项
        - 未配置
            - loading icon 消失
            - 展示引导配置提示语
        - 已配置
            - 后台校验 exchangeCredentials 配置项对应的交易所是否支持
                - 成功
                    - loading icon 消失
                    - 显示仓位信息
                - 失败
                    - Vscode 提示异常信息，loading icon 消失，position view 界面展示“出了点问题”提示语 + icon

## loading icon 动画 要求
- 使用 CSS 动画实现
- 动画效果为圆形旋转
- loading 动画显示隐藏需要走 postMessage 机制，通过 vscode 的 api 进行控制
- loading 动画的样式需要与 webview 的样式保持一致
- loading 动画元素是一个水平居中的浮动元素，z-index 高于 webview 的元素
- loading 动画元素出现是从视图外面顶部下拉出来，带有一定弹性动画效果，最后停留在 webview 距离顶部 50px 的地方，类似安卓下拉刷新动画效果
- loading 动画元素消失时，需要从顶部向上回弹，带有一定弹性动画效果，最后消失在视图外面，类似安卓下拉刷新动画效果

## 其他说明
1、每次配置变更时都显示 loading
2、引导文字内容里面，可以包含比如“settings”文字，点击可以直接跳转到设置
3、错误文字内容里面，可以包含比如“reload”文字，点击调用 reset 方法，同时显示 loading