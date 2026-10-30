# 开发与构建

## 运行

Node.js 24+，无 npm 运行依赖。

```bash
npm start
npm test
npm run check
```

默认端口 8780。可通过 `GUANLAN_PORT` 指定其他端口；MCP 配置需指向同一份源码与数据目录。`npm start` 使用 `--no-open`，手动在浏览器打开打印的地址。

## 主要模块

| 文件 | 职责 |
| --- | --- |
| `desktop.mjs` | 本机 HTTP、模型转发与媒体范围请求 |
| `project-store.mjs` | 项目、版本校验、历史和学习库保存 |
| `assistant-mcp.mjs` | stdio MCP 与图片、项目工具 |
| `link-import.mjs` | HTTPS 直链与公开分享页获取 |
| `dist/app.js` | 项目准备、候选切点、API 批次与工作台 |
| `dist/study-tools.mjs` | 人工修订、复核签名、局部切镜和方法规则 |
| `dist/workbench-tools.mjs` | 报告写回、学习库与局部镜头操作 |
| `dist/viewer/` | 同步播放器、逐镜与全片结构学习界面 |
| `dist/spreadsheet-export.mjs` | 带图与人工对照的 XLSX 导出 |

## Windows 免安装包

```bash
npm run runtime:fetch
npm run build:windows
```

第一步从官方固定版本地址下载运行组件，校验 SHA256，并保存原许可证与组件来源。第二步使用 Node.js 内置压缩库生成 Windows 运行文件包，输出到 `releases/`，同时生成 SHA256 校验文件。

打包前执行测试和源码检查。发布包使用明确文件白名单，不打包 `data/`、`.git`、`.openai/`、输出、日志、Key 或个人资料。不要从个人工作目录直接压缩整包上传。

## 贡献原则

优先维持旧项目可打开、人工记录不被模型覆盖、复核状态随相关证据变化而失效。修改数据结构时补充迁移或兼容读取；修改切点时保留受影响旧记录与可恢复备份。

浏览器中先用 `examples/` 的原创素材验证；接口流程使用本机模拟服务，真实付费测试由维护者按需要执行。测试不能将静帧推断标成已听核或已回看完整动态。
