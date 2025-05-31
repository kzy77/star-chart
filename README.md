# 原神风格3D卡片导航页

这是一个基于 Three.js 的原神风格3D导航页面，展示了一系列可交互的角色卡片，每个卡片链接到一个网站。

**在线演示:** [https://chunkj.dpdns.org/](https://chunkj.dpdns.org/)

## 特性

- 3D 角色卡片围绕椭圆轨迹动态旋转。
- 鼠标悬停在卡片上时，卡片放大，旋转暂停，并伴有音效。
- 点击卡片可在新标签页打开其关联的网站，并伴有音效。
- 动态背景系统：
    - 主背景图片从 `https://rand.mossia.top/` 随机获取。
    - 每个卡片的背景也独立从 `https://rand.mossia.top/` 随机获取。
- R18 内容开关：可以通过控制面板切换是否从API请求R18图片。
- 旋转速度控制：通过控制面板中的滑块调整卡片旋转的速度。
- 粒子效果和鼠标星光拖尾效果。
- 响应式设计，适配不同屏幕尺寸。
- 通过开发者工具（F12）可访问控制面板，用于切换背景、刷新卡片背景、切换R18模式和调整旋转速度。

## 项目结构

```
/
├── index.html        # HTML 主页面结构
├── style.css         # CSS 样式文件
├── main.js           # 主要的 JavaScript 和 Three.js 逻辑
├── config.js         # 角色卡片和网站链接的配置文件
├── README.md         # 项目说明文件
└── assets/           # (可选) 可能包含音效等静态资源
    └── ...
```

## 如何配置网站卡片

所有的角色卡片信息（包括名称、链接的网站URL、元素、稀有度、颜色、描述、神之眼、武器、地区以及图片URL）都在 `config.js` 文件中定义。

要添加、删除或修改卡片，请直接编辑 `config.js` 文件中的 `genshinCharacters` 数组。

**`genshinCharacters` 数组中每个对象的结构如下：**

```javascript
{
    name: '角色或网站名称',         // 显示在卡片上的名称
    url: 'https://example.com',   // 点击卡片后跳转的网址
    element: '元素类型',          // 例如：冰, 火, 雷, 岩, 风, 水
    rarity: 5,                    // 稀有度 (例如 4 或 5 星)，影响卡片辉光和样式
    color: '#HEXCOLOR',           // 与角色或网站主题相关的颜色代码
    description: '网站的简短描述',  // 显示在卡片上的描述文字
    vision: '神之眼属性',         // 例如：冰, 火, 雷 (通常与 element 一致)
    weapon: '武器类型',           // 例如：弓, 长柄武器, 法器
    region: '所属地区',           // 例如：璃月, 蒙德, 稻妻
    imageUrl: '占位符或实际图片URL' // 卡片头像的图片链接，会尝试通过代理加载
}
```

**示例：**

```javascript
// 在 config.js 文件中
export const genshinCharacters = [
    {
        name: '我的博客',
        url: 'https://myblog.com',
        element: '风',
        rarity: 5,
        color: '#2ECC71',
        description: '记录技术与生活',
        vision: '风',
        weapon: '法器',
        region: '网络空间',
        imageUrl: 'https://i.imgur.com/custom_avatar.jpg'
    },
    // ... 更多卡片配置
];
```

修改并保存 `config.js` 文件后，刷新浏览器页面即可看到更改。

## 如何运行

你可以通过以下几种方式在本地运行此项目：

**1. 使用 Node.js 和 npm (推荐):**

   *   **前提:** 确保你已经安装了 [Node.js](https://nodejs.org/) (它会包含 npm)。
   *   **安装依赖:** 在项目根目录下打开终端，运行以下命令来安装项目所需的依赖项 (例如 Vite 和 Three.js)：
       ```bash
       npm install
       ```
   *   **启动开发服务器:** 安装完依赖后，运行以下命令：
       ```bash
       npm run dev
       ```
       这个命令会使用 Vite 启动一个本地开发服务器。Vite 通常会自动在你的默认浏览器中打开项目，并且支持热模块替换 (HMR)，这意味着当你修改代码（例如 `main.js`, `config.js`, `style.css`）并保存时，页面会自动更新而无需手动刷新。
   *   你会在终端看到类似 `Local: http://localhost:5173/` (端口号可能不同) 的输出，这是你可以访问项目的本地地址。

**2. 使用简单的 HTTP 服务器 (备选方案):**

   *   由于项目使用了 ES6 模块 (`import`/`export`)，你需要通过一个本地 HTTP 服务器来运行 `index.html`，直接在浏览器中打开本地文件 (`file:///`) 可能无法正常工作。
   *   如果你安装了 Node.js，可以使用 `npx serve` 或 `http-server` 等工具在项目根目录启动一个服务器。
       ```bash
       npx serve . # 在当前目录启动服务器
       # 或者
       # npm install -g http-server
       # http-server .
       ```
   *   许多代码编辑器（如 VS Code）也提供了 Live Server 扩展，可以方便地启动本地服务器。
   *   在浏览器中打开服务器提供的地址 (通常是 `http://localhost:PORT`，例如 `http://localhost:8080` 或 `http://localhost:3000`)。

## 部署到 Cloudflare Pages (通过 GitHub)

你可以轻松地将此项目部署到 Cloudflare Pages，以获得免费的静态站点托管和全球 CDN 加速。

1.  **将项目推送到 GitHub 仓库：**
    *   确保你的项目已经是一个 Git 仓库，并且所有更改都已提交。
    *   在 GitHub 上创建一个新的仓库（可以是公开的或私有的）。
    *   将你的本地仓库关联到 GitHub 远程仓库，并推送代码。
        ```bash
        git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git
        git branch -M main
        git push -u origin main
        ```

2.  **在 Cloudflare Pages 中创建项目：**
    *   登录到你的 Cloudflare 仪表板。
    *   导航到 **Workers & Pages** > **创建应用程序** > **Pages** > **连接到 Git**。
    *   选择你刚刚推送代码的 GitHub 仓库。
    *   在"设置构建和部署"步骤中，Cloudflare 通常会自动检测到这是一个静态站点，因此你可能不需要更改构建设置。
        *   **框架预设 (Framework preset):** 选择 `None` 或留空 (因为这是一个纯静态HTML/CSS/JS项目，没有特定的构建过程)。
        *   **构建命令 (Build command):** 留空。
        *   **构建输出目录 (Build output directory):** 留空或设置为 `/` (表示项目的根目录就是部署内容)。
    *   点击"保存并部署 (Save and Deploy)"。

3.  **完成部署：**
    *   Cloudflare Pages 会自动从你的 GitHub 仓库拉取代码并进行部署。
    *   部署完成后，你将获得一个 `*.pages.dev` 的域名，你的导航页就可以通过这个链接访问了。
    *   之后，每当你向 GitHub 仓库的 `main` 分支推送新的提交时，Cloudflare Pages 都会自动重新部署你的站点。

## 注意事项

-   图片加载依赖于 `https://rand.mossia.top/` API 和 Imgur/Pixiv 等图床。如果API或图床不稳定，图片可能加载失败，此时会显示默认的渐变背景。
-   音效需要在用户首次与页面交互（如点击）后才能激活。
-   背景控制面板（包括R18切换）默认隐藏，在打开浏览器开发者工具 (F12) 后会自动显示在页面右下角。 **偷偷告诉你：打开开发者工具 (Debug 模式) 会有惊喜哦！**
-   卡片背景图片经过特殊处理，降低了亮度和对比度，避免图片过于刺眼，提高观感体验。
