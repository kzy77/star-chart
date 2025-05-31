# 原神风格3D卡片导航页

这是一个基于 Three.js 的原神风格3D导航页面，展示了一系列可交互的角色卡片，每个卡片链接到一个网站。

## 特性

- 3D 角色卡片围绕椭圆轨迹动态旋转。
- 鼠标悬停在卡片上时，卡片放大，旋转暂停，并伴有音效。
- 点击卡片可在新标签页打开其关联的网站，并伴有音效。
- 动态背景系统：
    - 主背景图片从 `https://rand.mossia.top/` 随机获取。
    - 每个卡片的背景也独立从 `https://rand.mossia.top/` 随机获取。
- R18 内容开关：可以通过控制面板切换是否从API请求R18图片。
- 粒子效果和鼠标星光拖尾效果。
- 响应式设计，适配不同屏幕尺寸。
- 通过开发者工具（F12）可访问控制面板，用于切换背景、刷新卡片背景和切换R18模式。

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

1.  确保你的项目包含 `index.html`, `style.css`, `main.js`, 和 `config.js` 文件。
2.  由于项目使用了 ES6 模块 (`import`/`export`)，你需要通过一个本地 HTTP 服务器来运行 `index.html`，直接在浏览器中打开本地文件 (`file:///`) 可能无法正常工作。
    *   如果你安装了 Node.js，可以使用 `npx serve` 或 `http-server` 等工具在项目根目录启动一个服务器。
    *   许多代码编辑器（如 VS Code）也提供了 Live Server 扩展，可以方便地启动本地服务器。
3.  在浏览器中打开服务器提供的地址 (通常是 `http://localhost:PORT`，例如 `http://localhost:8080` 或 `http://localhost:5500`)。

## 注意事项

-   图片加载依赖于 `https://rand.mossia.top/` API 和 Imgur/Pixiv 等图床。如果API或图床不稳定，图片可能加载失败，此时会显示默认的渐变背景。
-   音效需要在用户首次与页面交互（如点击）后才能激活。
-   背景控制面板（包括R18切换）默认隐藏，在打开浏览器开发者工具 (F12) 后会自动显示在页面右下角。
