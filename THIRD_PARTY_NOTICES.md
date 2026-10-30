# 第三方组件与来源

项目自有代码及原创示意素材采用 MIT。下列组件保留各自许可证；不因与观澜一起分发而改为 MIT。

| 组件 | 用途 | 固定版本 / 来源 | 许可文件 |
| --- | --- | --- | --- |
| Node.js | Windows 本机服务与 MCP 运行时 | [v24.22.1](https://nodejs.org/dist/v24.22.1/) / [源码](https://github.com/nodejs/node/tree/v24.22.1) | 发布包 `runtime/NODE-LICENSE.txt`，包含依赖声明 |
| yt-dlp | 公开分享页的视频获取 | [2026.10.26](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26) / [源码](https://github.com/yt-dlp/yt-dlp/tree/2026.10.26) | 发布包 `runtime/links/LICENSE.txt` 与 `THIRD_PARTY_LICENSES.txt` |

yt-dlp 源码采用 Unlicense；其 Windows 独立程序还包含采用其他许可的第三方组件，完整声明随包保留。对应源码、构建及许可说明可从该固定版本的官方仓库、[第三方声明](https://github.com/yt-dlp/yt-dlp/blob/2026.10.26/THIRD_PARTY_LICENSES.txt)和发布页获取。运行组件的下载来源与校验值也保存在 `runtime/links/NOTICE.txt`。

项目通过命令行调用原版 yt-dlp，没有修改或移除其版权与许可信息；没有附带 FFmpeg。公开链接支持范围取决于源站与组件能力。

本项目与同作者的 [观澜 AI 导演工作台](https://github.com/XiaoWuheng/guanlan-ai-director) 分开维护，借鉴其方法归档与人工审阅流程。没有把个人课程库、私人知识资料或用户影片加入此仓库。

README 的结构参考了 LosslessCut、PySceneDetect 等公开视频工具的下载、示例与限制说明组织方式，没有复制其品牌图像，也未集成它们的引擎。
