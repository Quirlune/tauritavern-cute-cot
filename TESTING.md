# 验证方式

## 无依赖逻辑测试

Node.js 20+，在仓库根目录执行 `npm test`。

## 原生消息处理类 + 浏览器

脚本读取 TauriTavern 2.2.0 的原始类代码，放入最小宿主夹具。周围 UI、网络和保存函数被替身替换；实际的流式清理顺序、reasoning 生命周期、正文格式化调用点和当前候选回复同步逻辑来自原始类。

这比只模拟扩展回调更接近真实接入，但不等于运行完整 APK 或真实模型请求。

1. 将 TauriTavern 仓库检出到 `v2.2.0`。
2. 在本扩展根目录执行 `npm install --no-save playwright`。
3. 设置 `TAURITAVERN_SOURCE` 为上游的 `src` 目录，`CHROME_PATH` 为本机 Chrome/Chromium 路径。也可以运行 `npx playwright install chromium` 后省略 `CHROME_PATH`。
4. 在本扩展根目录运行 `node scripts/test-host.mjs`。

PowerShell 示例：

```powershell
$env:TAURITAVERN_SOURCE = 'D:/Projects/TauriTavern/src'
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/test-host.mjs
```

测试报告和截图写入 `test-artifacts/`，不纳入 Git。

脚本会验证正文清理/格式化函数没有接收到思考测试标记，思考面板没有由模型文本产生的 HTML 元素，思考时展开、结束后折叠，手动展开存在动画中间帧，思考视口不超过设定高度且能跟随滚动，虚拟化节点重建后保留独立面板，390px 视口无横向溢出，以及入口模块与设置表单可以使用。

## Android 实机回归建议

安装后用自己的模型执行一次带标记的流式回复，再发下一轮消息检查实际提示词。手动停止一次生成，切换一次候选回复；在长聊天里滚动离开再返回该消息。实机的 WebView、模型接口和其他扩展组合不在桌面夹具的覆盖范围内。
