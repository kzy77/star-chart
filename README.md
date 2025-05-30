# 🌟 原神风格3D导航页

一个炫酷的原神风格3D导航页面，使用Three.js实现卡片椭圆轨迹运动，带有发光效果、粒子特效和原神风格音效。

## ✨ 特性

- 🎮 **原神风格卡片** - 13个原神角色主题的导航卡片
- 🌌 **3D椭圆运动** - 卡片从左往右沿椭圆轨迹优雅运动
- ✨ **粒子特效** - 金色、紫色、青色星光粒子围绕轨迹
- 🔊 **音效系统** - 悬停和点击时的原神风格音效
- 💫 **鼠标拖尾** - 跟随鼠标的炫彩星光拖尾
- 🌈 **发光效果** - 卡片边缘发光和悬停特效
- 📱 **响应式设计** - 适配各种屏幕尺寸

## 🎯 角色列表

包含13个热门原神角色：
- **5星角色**: 甘雨、胡桃、雷电将军、钟离、魈、八重神子、温迪、刻晴、迪卢克
- **4星角色**: 芭芭拉、菲谢尔、香菱、北斗

每个角色卡片包含：
- 角色名称
- 元素属性 (冰/火/雷/岩/风/水)
- 武器类型
- 所属地区
- 星级评定
- 对应的网站链接

## 🚀 快速开始

1. **克隆项目**
   ```bash
   git clone [your-repo-url]
   cd star-chart
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动开发服务器**
   ```bash
   npm run dev
   ```

4. **访问页面**
   打开浏览器访问 `http://localhost:5173`

## 🖼️ 添加原神卡片人物图片
通过图床API动态随机生成

## 🎨 自定义配置

### 修改运动方向

在 `main.js` 的 `animate()` 函数中：
```javascript
// 从左往右（当前）
const angle = meta.angle - time * 0.3;

// 从右往左
const angle = meta.angle + time * 0.3;
```

### 调整运动速度

```javascript
// 更快
const angle = meta.angle - time * 0.5;

// 更慢
const angle = meta.angle - time * 0.1;
```

### 修改粒子数量

```javascript
// 在 createParticleSystem() 函数中
const particleCount = 200; // 增加或减少数量
```

### 自定义网站链接

修改 `genshinCharacters` 数组中各角色的 `url` 字段：

```javascript
{
    name: '甘雨',
    url: 'https://your-website.com',
    // ... 其他属性
}
```

## 📁 项目结构

```
star-chart/
├── index.html          # 主页面
├── main.js             # 主要逻辑和Three.js代码
├── style.css           # 样式文件
├── package.json        # 项目配置
├── vite.config.js      # Vite配置
├── images/             # 图片文件夹
│   └── characters/     # 角色头像文件夹
└── README.md           # 项目说明
```

## 🛠️ 技术栈

- **Three.js** - 3D渲染引擎
- **Vite** - 构建工具
- **Web Audio API** - 音效系统
- **Canvas API** - 图片生成
- **CSS3** - 样式和动画

## 🎵 音效说明

- **悬停音效**: 800Hz短音，模拟原神UI音效
- **点击音效**: 523Hz和弦音，类似原神确认音效
- **自动启用**: 首次交互后自动激活音频上下文

## 🔧 性能优化

- 限制星光拖尾数量（最多10个）
- 优化粒子系统渲染
- 使用Canvas纹理缓存
- 响应式布局适配

## 🐛 常见问题

**Q: 音效不播放？**
A: 现代浏览器需要用户交互后才能播放音频，请先点击页面任意位置。

**Q: 图片不显示？**
A: 确保图片路径正确，文件名与代码中的角色名完全匹配。

**Q: 卡片运动太快/太慢？**
A: 修改 `animate()` 函数中的时间系数 `time * 0.3`。

**Q: 性能卡顿？**
A: 可以减少粒子数量或关闭某些视觉效果。

## 📄 开源协议

MIT License - 可自由使用和修改

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**享受你的原神风格导航页吧！** ✨🎮

## 原神风格3D卡片导航

### 简介

使用Three.js实现的原神风格3D卡片导航，带有复杂轨道运动、星空背景和交互效果。卡片加载Pixiv和其他图片源的精美图片作为背景。

### 功能特点

- 3D椭圆轨迹卡片展示，带有流畅的动画效果
- API图片自动加载并应用为卡片背景
- 图片缓存系统，减少API请求
- 悬停暂停轨道动画，点击卡片跳转到对应网站
- 粒子系统营造星空氛围
- 音效系统增强交互体验
- 响应式设计，适配不同屏幕尺寸

### 本地开发

1. 安装依赖

```bash
npm install
```

2. 启动开发服务器

```bash
npm run dev
```

3. 构建项目

```bash
npm run build
```

### Cloudflare Pages部署

本项目支持直接部署到Cloudflare Pages。以下是部署步骤：

1. Fork本仓库或上传代码到你自己的Git仓库
2. 在Cloudflare Pages创建一个新项目
3. 连接到你的Git仓库
4. 设置构建命令为 `npm run build`
5. 设置构建输出目录为 `dist`
6. 点击部署

部署完成后，Cloudflare Pages会自动处理以下功能：
- 通过Cloudflare Functions处理API请求
- 代理Pixiv和其他图片源以解决跨域问题
- 提供全球CDN加速

### API和图片代理

本项目使用以下API和代理路径：

- `/api/duckmo` - DuckMo图片API代理
- `/api/image-proxy/pixiv/[完整路径]` - Pixiv图片代理，支持完整路径
  - 例如：`/api/image-proxy/pixiv/img-master/img/2024/06/30/08/47/53/120104287_p1_master1200.jpg`
  - 自动将 `i.pixiv.re` 域名后的完整路径添加到代理路径中
- `/api/image-proxy/[图片ID]` - Imgur等通用图片代理

这些路径在本地开发和Cloudflare部署环境中都能正常工作。

### Pixiv图片代理支持的格式

Pixiv图片代理会智能处理不同格式的图片URL，包括：

1. **master1200格式**：`img-master/img/YYYY/MM/DD/HH/MM/SS/IMAGE_ID_pNUM_master1200.jpg`
2. **原始格式**：`img-original/img/YYYY/MM/DD/HH/MM/SS/IMAGE_ID_pNUM.jpg`

代理服务会自动尝试多种URL格式以确保能够成功获取图片，包括：
- 尝试从 `i.pixiv.re` 获取原图
- 尝试从 `i.pximg.net` 获取原图 
- 支持自动转换 master1200 到原始图片格式

### 高级定制

1. **添加/修改角色卡片**

在`main.js`中修改`genshinCharacters`数组，每个对象代表一个卡片。

```javascript
{
  name: '甘雨',            // 显示名称
  url: 'https://example.com', // 点击跳转地址
  element: '冰',          // 元素类型
  rarity: 5,              // 稀有度（星级）
  color: '#4A90E2',       // 主题色
  description: '服务描述', // 描述文本
  vision: '冰',           // 神之眼类型
  weapon: '弓',           // 武器类型
  region: '璃月'           // 地区
}
```

2. **自定义背景**

你可以修改`setDefaultBackground`函数来自定义默认背景样式。

### 许可证

此项目为MIT许可证，详见LICENSE文件。