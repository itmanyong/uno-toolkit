import { define } from "rstack";

define.doc({
  root: "docs",
  title: "Uno Toolkit 文档",
  description: "三个构建期转换插件的使用文档：功能说明、安装配置与完整示例。",
  lang: "zh",
  logoText: "uno-toolkit",
  themeConfig: {
    nav: [
      { text: "开始使用", link: "/guide/" },
      {
        text: "插件文档",
        items: [
          { text: "JSX 指令", link: "/plugins/jsx-directive" },
          { text: "样式分层", link: "/plugins/style-layer" },
          { text: "Signals 转换", link: "/plugins/signals-transform" },
        ],
      },
      { text: "可运行示例", link: "/guide/examples" },
    ],
    sidebar: {
      "/": [
        {
          text: "入门",
          items: [
            { text: "开始使用", link: "/guide/" },
            { text: "可运行示例", link: "/guide/examples" },
          ],
        },
        {
          text: "插件文档",
          items: [
            { text: "@uno-pc/jsx-directive", link: "/plugins/jsx-directive" },
            { text: "@uno-pc/style-layer", link: "/plugins/style-layer" },
            {
              text: "@uno-pc/signals-transform",
              link: "/plugins/signals-transform",
            },
          ],
        },
      ],
    },
    footer: {
      message: "Uno Toolkit · 构建期转换插件",
    },
  },
});
