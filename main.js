import * as THREE from 'three';
import { genshinCharacters } from './config.js'; // 导入角色数据

let scene, camera, renderer;
let cards = [];
let cardMetas = [];
let particleSystem;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredCardIndex = null;
let starTrailCount = 0;
const MAX_STAR_TRAILS = 10;
let isR18ModeEnabled = false; // 新增：R18模式状态，默认为关闭
let rotationSpeed = 0.06; // 新增：卡片旋转速度系数，默认为0.06

// 音效系统
let audioContext;
let hoverSound, clickSound;

// 图片缓存系统
const imageCache = {
    images: [],
    lastFetchTime: 0,
    isFetching: false,
    CACHE_TIMEOUT: 5 * 60 * 1000, // 缓存有效期：5分钟
    MAX_CACHE_SIZE: 100, // 增加缓存容量
    BATCH_SIZE: 20, // API最大批量获取数量
    
    async getImages(count) {
        // 清理过期缓存
        this.cleanExpiredCache();
        
        // 如果缓存不足且没有正在获取中，进行一次性批量获取
        if (this.images.length < count && !this.isFetching) {
            // 计算需要获取的批次数
            const batchesNeeded = Math.ceil((count - this.images.length) / this.BATCH_SIZE);
            const promises = [];
            
            // 一次性发起所有批次的请求
            for (let i = 0; i < batchesNeeded; i++) {
                promises.push(this.prefetchImages());
            }
            
            // 等待所有请求完成
            await Promise.all(promises);
        }
        
        // 返回随机的图片集合
        return this.getRandomImages(count);
    },
    
    getRandomImages(count) {
        const shuffled = [...this.images].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, shuffled.length));
    },
    
    async prefetchImages() {
        if (this.isFetching) {
            return;
        }
        
        this.isFetching = true;
        try {
            // 始终请求最大数量以减少API调用次数
            const result = await fetchDuckMoImages({ num: this.BATCH_SIZE });
            
            if (result && result.data) {
                const processedImages = result.data.map(item => {
                    const originalUrl = item.urlsList.find(urlItem => urlItem.urlSize === 'regular');
                    return {
                        ...item,
                        pictureUrl: originalUrl ? originalUrl.url : item.urlsList[0]?.url || getFallbackImageUrl()
                    };
                });

                // 添加新图片到缓存，避免重复
                const newImages = processedImages.filter(img => 
                    !this.images.some(existing => existing.pictureUrl === img.pictureUrl)
                );
                this.images.push(...newImages);
                
                // 确保缓存不超过最大限制
                if (this.images.length > this.MAX_CACHE_SIZE) {
                    this.images = this.images.slice(-this.MAX_CACHE_SIZE);
                }
                this.lastFetchTime = Date.now();
                console.log(`📦 缓存已更新: ${this.images.length} 张图片`);
            }
        } catch (error) {
            console.error('获取新图片失败:', error);
        } finally {
            this.isFetching = false;
        }
    },
    
    cleanExpiredCache() {
        const now = Date.now();
        if (now - this.lastFetchTime > this.CACHE_TIMEOUT) {
            this.images = [];
            this.lastFetchTime = 0;
            console.log('🧹 清理过期缓存');
        }
    }
};

// 优化的 DuckMo API 请求函数
async function fetchDuckMoImages(options = {}) {
    const {
        num = 20, // 默认请求最大数量
        sizeList = ['regular'],
        dateAfter = null,
        dateBefore = null
    } = options;

    try {
        // 智能控制请求频率
        const now = Date.now();
        const minInterval = 2000; // 最小请求间隔2秒
        
        if (window.lastFetchTime && (now - window.lastFetchTime < minInterval)) {
            await new Promise(resolve => setTimeout(resolve, minInterval));
        }
        
        window.lastFetchTime = now;

        // 创建请求配置
        const requestConfig = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                num: 20, // 固定请求最大数量
                r18Type: isR18ModeEnabled ? 1 : 0, // 根据R18模式状态设置参数
                sizeList: ['regular'],
                ...(dateAfter && { dateAfter }),
                ...(dateBefore && { dateBefore })
            })
        };

        // 使用本地代理API，适配Cloudflare Functions
        const response = await fetch('/api/duckmo', requestConfig);
        
        if (!response.ok) {
            if (response.status === 429) {
                console.log('⚠️ API 请求过于频繁，切换到备用图片...');
                return { success: true, data: Array(num).fill().map(() => ({
                    urlsList: [{ url: getFallbackImageUrl(), urlSize: 'original' }],
                    xCreateDate: Date.now()
                }))};
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        // 如果返回的数据中有fallback标志，说明这是来自我们的代理函数的错误响应
        if (result.fallback) {
            console.log('⚠️ API 代理返回错误，切换到备用图片...', result.message);
            return { success: true, data: Array(num).fill().map(() => ({
                urlsList: [{ url: getFallbackImageUrl(), urlSize: 'original' }],
                xCreateDate: Date.now()
            }))};
        }

        console.log('图库API接口返回：{}', result);

        if (!result.success) {
            console.log('❌ DuckMo API 请求失败:', result.message);
            return null;
        }

        return result;
    } catch (error) {
        console.log('❌ DuckMo API 请求失败 ERROR:', error.message);
        return { success: true, data: Array(num).fill().map(() => ({
            urlsList: [{ url: getFallbackImageUrl(), urlSize: 'original' }],
            xCreateDate: Date.now()
        }))};
    }
}

// 从随机图片API获取图片URL
async function getRandomImageUrl() {
    try {
        // 优先使用 DuckMo API (通过代理)
        const duckMoImageUrl = await getDuckMoImageWithProxy();
        console.log('DuckMo API 获取图片URL:', duckMoImageUrl);
        if (duckMoImageUrl) {
            return duckMoImageUrl;
        }
        
        console.log('🔄 DuckMo API 失败，切换到备用图片模式');
        return getFallbackImageUrl(); // 确保这里返回的是一个有效的URL字符串
    } catch (error) {
        console.log('❌ 图片获取失败 (getRandomImageUrl):', error.message);
        return getFallbackImageUrl(); // 确保这里返回的是一个有效的URL字符串
    }
}

// 支持CORS的备用图片API函数
function getFallbackImageUrl() {
    // 扩展渐变色组合
    const colors = [
        ['#667eea', '#764ba2'],
        ['#f093fb', '#f5576c'], 
        ['#4facfe', '#00f2fe'],
        ['#43e97b', '#38f9d7'],
        ['#fa709a', '#fee140'],
        ['#a8edea', '#fed6e3'],
        ['#ff9a9e', '#fecfef'],
        ['#a18cd1', '#fbc2eb'],
        ['#fad0c4', '#ffd1ff'],
        ['#ffecd2', '#fcb69f'],
        ['#ff8177', '#b12a5b'],
        ['#48c6ef', '#6f86d6'],
        ['#0ba360', '#3cba92'],
        ['#f77062', '#fe5196']
    ];
    
    const randomColorPair = colors[Math.floor(Math.random() * colors.length)];
    
    // 增强SVG渐变效果
    const svgContent = `
        <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:${randomColorPair[0]};stop-opacity:1" />
                    <stop offset="50%" style="stop-color:${randomColorPair[1]};stop-opacity:0.8" />
                    <stop offset="100%" style="stop-color:${randomColorPair[0]};stop-opacity:1" />
                </linearGradient>
                <pattern id="pattern1" width="70" height="70" patternUnits="userSpaceOnUse">
                    <circle cx="35" cy="35" r="25" fill="url(#grad1)" opacity="0.3" />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grad1)" />
            <rect width="100%" height="100%" fill="url(#pattern1)" />
            <circle cx="400" cy="300" r="200" fill="url(#grad1)" opacity="0.4" />
        </svg>
    `;
    
    return 'data:image/svg+xml;base64,' + btoa(svgContent);
}

// 更新后的 getDuckMoImageWithProxy 函数
async function getDuckMoImageWithProxy() {
    try {
        // 获取当前卡片数量
        // 从缓存获取一张图片用于背景
        const cachedImages = await imageCache.getImages(1);
        
        if (cachedImages && cachedImages.length > 0) {
            const randomImageData = cachedImages[Math.floor(Math.random() * cachedImages.length)];
            
            if (randomImageData.pictureUrl) {
                // 处理图片URL，改为使用代理
                let proxyUrl = randomImageData.pictureUrl;
                
                // 检测URL是否是Pixiv
                if (proxyUrl.includes('pixiv.re') || proxyUrl.includes('pixiv.cat') || proxyUrl.includes('pixiv.net') || proxyUrl.includes('pximg.net')) {
                    // 提取Pixiv域名后的完整路径
                    try {
                        const urlObj = new URL(proxyUrl);
                        let fullPath = '';
                        
                        if (proxyUrl.includes('pixiv.re')) {
                            fullPath = urlObj.pathname.replace(/^\//, ''); // 移除开头的斜杠
                        } else if (proxyUrl.includes('pximg.net')) {
                            // 例如：https://i.pximg.net/img-original/img/2023/01/01/00/00/00/12345678_p0.jpg
                            // 转为：img-original/img/2023/01/01/00/00/00/12345678_p0.jpg
                            fullPath = urlObj.pathname.replace(/^\//, '');
                        } else {
                            // 其他Pixiv镜像站，尝试提取完整路径
                            fullPath = urlObj.pathname.replace(/^\//, '');
                        }
                        
                        // 使用代理处理图片，保留完整路径
                        proxyUrl = `/api/image-proxy/pixiv/${fullPath}${urlObj.search || ''}`;
                        console.log(`🖼️ Pixiv图片代理URL: ${proxyUrl}`);
                    } catch (e) {
                        console.log('URL解析错误，使用原始URL:', e.message);
                    }
                } else if (proxyUrl.includes('imgur.com')) {
                    // 提取imgur图片ID
                    try {
                        const urlObj = new URL(proxyUrl);
                        // 获取最后一部分作为图片ID
                        const pathParts = urlObj.pathname.split('/');
                        const imagePart = pathParts[pathParts.length - 1]; // 例如 "abcdef.jpg"
                        
                        // 使用代理处理图片
                        proxyUrl = `/api/image-proxy/${imagePart}${urlObj.search || ''}`;
                        console.log(`🖼️ Imgur图片代理URL: ${proxyUrl}`);
                    } catch (e) {
                        console.log('URL解析错误，使用原始URL:', e.message);
                    }
                }
                
                console.log(`🎨 获取到图片并使用代理: ${proxyUrl}`);
                return proxyUrl;
            }
        }
        return null;
    } catch (error) {
        console.log('❌ 图片请求失败:', error.message);
        return null;
    }
}

// 设置默认背景（不请求API）
function setDefaultBackground() {
    // 立即设置默认渐变背景
    document.body.style.background = `
        linear-gradient(135deg,
            #667eea 0%,
            #764ba2 25%,
            #f093fb 50%,
            #f5576c 75%,
            #4facfe 100%
        )
    `;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundAttachment = 'fixed';
    
    // 添加半透明覆盖层保持原神风格
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(
            135deg,
            rgba(138, 43, 226, 0.2) 0%,
            rgba(255, 20, 147, 0.1) 25%,
            rgba(0, 191, 255, 0.15) 50%,
            rgba(255, 215, 0, 0.1) 75%,
            rgba(50, 205, 50, 0.05) 100%
        );
        z-index: -2;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.8s ease-in-out;
    `;
    overlay.id = 'bg-overlay';
    
    // 删除旧的覆盖层
    const oldOverlay = document.getElementById('bg-overlay');
    if (oldOverlay) {
        oldOverlay.remove();
    }
    
    document.body.appendChild(overlay);
    
    // 显示覆盖层
    setTimeout(() => {
        overlay.style.opacity = '1';
        // 更新标题颜色以适应背景
        updateTitleColors();
    }, 100);
    
    console.log('✨ 默认背景已设置');
}

// 根据背景颜色动态调整标题颜色
function updateTitleColors() {
    // 获取页面上的h1标题和段落元素
    const title = document.querySelector('#info h1');
    const paragraphs = document.querySelectorAll('#info p');
    
    // 背景颜色分析
    if (document.body.style.backgroundImage && 
        document.body.style.backgroundImage !== 'none' &&
        !document.body.style.backgroundImage.includes('data:') && 
        !document.body.style.backgroundImage.includes('gradient')) {
        
        // 尝试从当前背景中提取URL
        let bgUrl = document.body.style.backgroundImage;
        bgUrl = bgUrl.replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
        
        if (bgUrl && !bgUrl.startsWith('data:')) {
            // 创建一个临时图像并获取其颜色
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = function() {
                try {
                    // 创建一个小型Canvas来分析主要颜色
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const size = 10; // 小尺寸，足够分析
                    canvas.width = size;
                    canvas.height = size;
                    
                    // 绘制并缩放图像以分析整体颜色
                    ctx.drawImage(img, 0, 0, size, size);
                    
                    // 采样顶部区域颜色（标题所在区域）
                    const topPixels = ctx.getImageData(0, 0, size, Math.floor(size/4)).data;
                    
                    // 计算平均颜色
                    let r = 0, g = 0, b = 0, count = 0;
                    for (let i = 0; i < topPixels.length; i += 4) {
                        r += topPixels[i];
                        g += topPixels[i+1];
                        b += topPixels[i+2];
                        count++;
                    }
                    
                    if (count > 0) {
                        r = Math.floor(r / count);
                        g = Math.floor(g / count);
                        b = Math.floor(b / count);
                        
                        // 计算颜色亮度
                        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                        
                        // 创建主题色和互补色
                        const mainColor = { r, g, b };
                        const compColor = getComplementaryColor(mainColor);
                        
                        // 应用高对比度渐变文本
                        applyGradientText(title, mainColor, compColor, brightness);
                        
                        // 为段落应用对比色，确保可读性
                        applyParagraphColors(paragraphs, brightness);
                    } else {
                        // 如果计算失败，使用默认渐变色
                        applyDefaultGradient(title, paragraphs);
                    }
                } catch (e) {
                    console.log('颜色分析失败，使用默认渐变:', e.message);
                    applyDefaultGradient(title, paragraphs);
                }
            };
            img.onerror = function() {
                console.log('背景图片加载失败，使用默认渐变');
                applyDefaultGradient(title, paragraphs);
            };
            img.src = bgUrl;
        } else {
            // URL 无效，使用默认渐变
            applyDefaultGradient(title, paragraphs);
        }
    } else {
        // 使用预定义的渐变
        applyDefaultGradient(title, paragraphs);
    }
}

// 获取互补色
function getComplementaryColor(color) {
    return { 
        r: 255 - color.r, 
        g: 255 - color.g, 
        b: 255 - color.b 
    };
}

// 应用渐变文本
function applyGradientText(element, color1, color2, brightness) {
    if (!element) return;
    
    // 确保渐变色足够亮以便于阅读
    const enhancedColor1 = enhanceColor(color1, brightness);
    const enhancedColor2 = enhanceColor(color2, brightness);
    
    // 应用渐变背景
    element.style.background = `linear-gradient(135deg, 
        rgb(${enhancedColor1.r}, ${enhancedColor1.g}, ${enhancedColor1.b}), 
        rgb(${enhancedColor2.r}, ${enhancedColor2.g}, ${enhancedColor2.b}))`;
    element.style.webkitBackgroundClip = 'text';
    element.style.backgroundClip = 'text';
    element.style.webkitTextFillColor = 'transparent';
    element.style.color = 'transparent';
    
    // 添加文字阴影，增强可读性
    element.style.textShadow = brightness < 128 ? 
        '0 2px 4px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.7)' : 
        '0 2px 4px rgba(0, 0, 0, 0.7), 0 0 8px rgba(0, 0, 0, 0.5)';
}

// 增强颜色使其更亮、更适合文本显示
function enhanceColor(color, backgroundBrightness) {
    const MIN_BRIGHTNESS = 200; // 确保颜色足够亮
    
    // 如果背景暗，增加颜色亮度
    if (backgroundBrightness < 128) {
        // 增加亮度但保持色调
        const currentBrightness = (color.r + color.g + color.b) / 3;
        if (currentBrightness < MIN_BRIGHTNESS) {
            const factor = MIN_BRIGHTNESS / Math.max(currentBrightness, 1);
            return {
                r: Math.min(255, Math.round(color.r * factor)),
                g: Math.min(255, Math.round(color.g * factor)),
                b: Math.min(255, Math.round(color.b * factor))
            };
        }
    }
    
    // 背景亮时，确保文字颜色足够深
    if (backgroundBrightness > 200) {
        const currentBrightness = (color.r + color.g + color.b) / 3;
        if (currentBrightness > 180) {
            const factor = 160 / Math.max(currentBrightness, 1);
            return {
                r: Math.round(color.r * factor),
                g: Math.round(color.g * factor),
                b: Math.round(color.b * factor)
            };
        }
    }
    
    return color;
}

// 为段落应用颜色
function applyParagraphColors(paragraphs, brightness) {
    if (!paragraphs || !paragraphs.length) return;
    
    paragraphs.forEach(p => {
        // 根据背景亮度决定文字颜色
        if (brightness < 128) {
            // 暗背景，使用亮色文字
            p.style.color = 'rgba(255, 255, 255, 0.9)';
            p.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.9), 0 0 5px rgba(0, 0, 0, 0.7)';
        } else {
            // 亮背景，使用深色文字
            p.style.color = 'rgba(30, 30, 30, 0.9)';
            p.style.textShadow = '0 1px 2px rgba(255, 255, 255, 0.7), 0 0 5px rgba(0, 0, 0, 0.5)';
        }
    });
}

// 应用默认渐变
function applyDefaultGradient(title, paragraphs) {
    if (!title) return;
    
    // 原神风格的明亮渐变色
    const genshinColors = [
        { r: 255, g: 215, b: 0 },   // 金色
        { r: 255, g: 105, b: 180 }, // 热粉色
        { r: 138, g: 43, b: 226 },  // 蓝紫色
        { r: 64, g: 224, b: 208 }   // 绿松石色
    ];
    
    // 随机选择两种颜色
    const color1 = genshinColors[Math.floor(Math.random() * genshinColors.length)];
    let color2;
    do {
        color2 = genshinColors[Math.floor(Math.random() * genshinColors.length)];
    } while (color1 === color2);
    
    // 应用渐变文本
    title.style.background = `linear-gradient(135deg, 
        rgb(${color1.r}, ${color1.g}, ${color1.b}), 
        rgb(${color2.r}, ${color2.g}, ${color2.b}))`;
    title.style.webkitBackgroundClip = 'text';
    title.style.backgroundClip = 'text';
    title.style.webkitTextFillColor = 'transparent';
    title.style.color = 'transparent';
    title.style.textShadow = '0 2px 4px rgba(0, 0, 0, 0.7)';
    
    // 为段落应用统一样式
    if (paragraphs && paragraphs.length) {
        paragraphs.forEach(p => {
            p.style.color = 'rgba(255, 255, 255, 0.9)';
            p.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.8), 0 0 5px rgba(0, 0, 0, 0.6)';
        });
    }
}

// 异步加载图片并应用到背景和卡片
async function loadAndApplyImages() {
    showNotification('🎨 正在为您获取精美图片...', 'info');
    
    // 计算需要获取的图片数量（卡片数量+1张用于背景）
    const requiredImages = genshinCharacters.length + 1;
    
    try {
        // 一次性获取所有需要的图片
        const images = await imageCache.getImages(requiredImages);
        
        if (images && images.length > 0) {
            console.log(`✅ 成功获取 ${images.length} 张图片`);
            
            // 从获取的图片中随机选择一张作为背景
            const bgImageData = images[Math.floor(Math.random() * images.length)];
            
            // 应用背景图片
            if (bgImageData && bgImageData.pictureUrl) {
                applyBackgroundImage(bgImageData.pictureUrl);
            }
            
            // 剩余图片随机分配给卡片
            const shuffledImages = [...images].sort(() => 0.5 - Math.random());
            for (let i = 0; i < genshinCharacters.length && i < shuffledImages.length; i++) {
                const character = genshinCharacters[i];
                const imageData = shuffledImages[i];
                
                if (imageData && imageData.pictureUrl) {
                    // 处理图片URL，使用代理
                    let proxyUrl = imageData.pictureUrl;
                    if (!proxyUrl.startsWith('/') && !proxyUrl.startsWith('data:')) {
                        // 检测URL类型并应用相应的代理
                        if (proxyUrl.includes('pixiv.re') || proxyUrl.includes('pixiv.cat') || proxyUrl.includes('pixiv.net') || proxyUrl.includes('pximg.net')) {
                            try {
                                const urlObj = new URL(proxyUrl);
                                // 提取Pixiv域名后的完整路径
                                let fullPath = '';
                                
                                if (proxyUrl.includes('pixiv.re')) {
                                    fullPath = urlObj.pathname.replace(/^\//, ''); // 移除开头的斜杠
                                } else if (proxyUrl.includes('pximg.net')) {
                                    fullPath = urlObj.pathname.replace(/^\//, '');
                                } else {
                                    // 其他Pixiv镜像站，尝试提取完整路径
                                    fullPath = urlObj.pathname.replace(/^\//, '');
                                }
                                
                                // 使用代理处理图片，保留完整路径
                                proxyUrl = `/api/image-proxy/pixiv/${fullPath}${urlObj.search || ''}`;
                                console.log(`✅ 卡片${i+1} Pixiv图片代理URL: ${proxyUrl}`);
                            } catch (e) {
                                console.log('URL解析错误，使用原始URL:', e.message);
                            }
                        } else if (proxyUrl.includes('imgur.com')) {
                            try {
                                const urlObj = new URL(proxyUrl);
                                // 获取最后一部分作为图片ID
                                const pathParts = urlObj.pathname.split('/');
                                const imagePart = pathParts[pathParts.length - 1];
                                proxyUrl = `/api/image-proxy/${imagePart}${urlObj.search || ''}`;
                                console.log(`✅ 卡片${i+1} Imgur图片代理URL: ${proxyUrl}`);
                            } catch (e) {
                                console.log('URL解析错误，使用原始URL:', e.message);
                            }
                        }
                    }
                    
                    character.backgroundImageUrl = proxyUrl;
                    
                    // 预加载卡片背景图片
                    const backgroundImg = new Image();
                    backgroundImg.crossOrigin = 'anonymous';
                    backgroundImg.onload = function() {
                        character.backgroundImage = backgroundImg;
                        updateCardTexture(i);
                    };
                    backgroundImg.onerror = function(e) {
                        console.log(`❌ 角色 ${character.name} 的背景图片加载失败:`, e.message);
                        console.log(`尝试的URL: ${proxyUrl}`);
                        updateCardTexture(i);
                    };
                    backgroundImg.src = proxyUrl;
                }
            }
            
            showNotification('✨ 图片加载完成！', 'success');
        } else {
            console.log('❌ 未能获取到图片，使用默认背景');
            showNotification('⚠️ 使用默认背景', 'warning');
        }
    } catch (error) {
        console.log('❌ 图片加载失败:', error.message);
        showNotification('⚠️ 图片加载失败，使用默认背景', 'warning');
    }
}

// 应用背景图片
function applyBackgroundImage(imageUrl) {
    if (!imageUrl) return;
    
    console.log('正在应用背景图片...');
    const bgImage = new Image();
    bgImage.crossOrigin = 'anonymous';
    
    // 处理可能的远程URL，转换为代理URL
    let proxyUrl = imageUrl;
    if (!imageUrl.startsWith('/') && !imageUrl.startsWith('data:')) {
        // 检测URL类型并应用相应的代理
        if (imageUrl.includes('pixiv.re') || imageUrl.includes('pixiv.cat') || imageUrl.includes('pixiv.net') || imageUrl.includes('pximg.net')) {
            try {
                const urlObj = new URL(imageUrl);
                // 提取Pixiv域名后的完整路径
                let fullPath = '';
                
                if (imageUrl.includes('pixiv.re')) {
                    fullPath = urlObj.pathname.replace(/^\//, ''); // 移除开头的斜杠
                } else if (imageUrl.includes('pximg.net')) {
                    fullPath = urlObj.pathname.replace(/^\//, '');
                } else {
                    // 其他Pixiv镜像站，尝试提取完整路径
                    fullPath = urlObj.pathname.replace(/^\//, '');
                }
                
                // 使用代理处理图片，保留完整路径
                proxyUrl = `/api/image-proxy/pixiv/${fullPath}${urlObj.search || ''}`;
                console.log(`🖼️ 背景Pixiv图片代理URL: ${proxyUrl}`);
            } catch (e) {
                console.log('URL解析错误，使用原始URL:', e.message);
            }
        } else if (imageUrl.includes('imgur.com')) {
            try {
                const urlObj = new URL(imageUrl);
                // 获取最后一部分作为图片ID
                const pathParts = urlObj.pathname.split('/');
                const imagePart = pathParts[pathParts.length - 1];
                proxyUrl = `/api/image-proxy/${imagePart}${urlObj.search || ''}`;
                console.log(`🖼️ 背景Imgur图片代理URL: ${proxyUrl}`);
            } catch (e) {
                console.log('URL解析错误，使用原始URL:', e.message);
            }
        }
    }
    
    bgImage.onload = function() {
        // 淡入效果
        document.body.style.transition = 'background-image 0.8s ease-in-out';
        
        // 应用背景图片
        document.body.style.backgroundImage = `url(${proxyUrl})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundAttachment = 'fixed';
        
        // 更新标题颜色以适应新背景
        setTimeout(updateTitleColors, 500);
        
        console.log('✨ 背景图片已更新!');
        showNotification('🌌 背景已切换！', 'success');
    };
    
    bgImage.onerror = function(e) {
        console.log('❌ 背景图片加载失败，保持默认背景:', e.message);
        console.log(`尝试的URL: ${proxyUrl}`);
    };
    
    bgImage.src = proxyUrl;
}

// 创建卡片（不加载背景图片）
function createCards() {
    const cardWidth = 24;
    const cardHeight = 30;
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.15; // 基础半径
    
    console.log('🎴 开始创建角色卡片...');
    
    for (let i = 0; i < genshinCharacters.length; i++) {
        const character = genshinCharacters[i];
        
        // 使用默认背景创建卡片
        const geometry = new THREE.PlaneGeometry(cardWidth, cardHeight);
        const texture = createCardTexture(character); // 不传入背景图片URL
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const card = new THREE.Mesh(geometry, material);
        
        // 3D椭圆轨迹，突出由远及近的视觉效果
        const angle = (i / genshinCharacters.length) * Math.PI * 2;
        const cardX = Math.cos(angle) * radius * 2.0;
        const cardZ = Math.sin(angle) * radius * 0.25;
        
        card.position.set(cardX, 0, cardZ);
        
        // 设置初始朝向
        const initialAngle = angle;
        if (initialAngle >= Math.PI * 0.3 && initialAngle <= Math.PI * 0.7) {
            card.rotation.set(0, 0, 0);
        } else {
            card.lookAt(cardX * 0.3, 0, cardZ * 0.3);
        }
        
        cardMetas.push({
            angle: angle,
            radius: radius,
            character: character,
            originalScale: 1,
            targetScale: 1,
            hovered: false
        });
        
        scene.add(card);
        cards.push(card);
    }
    
    console.log('✅ 卡片创建完成');
}

// 修改初始化函数
async function init() {
    // 从本地存储加载旋转速度设置
    try {
        const savedSpeed = localStorage.getItem('rotationSpeed');
        if (savedSpeed !== null) {
            rotationSpeed = parseFloat(savedSpeed);
            // 更新滑动条和显示值
            const speedSlider = document.getElementById('rotation-speed');
            const speedValue = document.getElementById('speed-value');
            if (speedSlider) speedSlider.value = rotationSpeed;
            if (speedValue) speedValue.textContent = rotationSpeed.toFixed(2);
        }
    } catch (e) {
        console.log('无法加载保存的旋转速度:', e.message);
    }
    
    // 从本地存储加载控制面板显示状态
    try {
        const panelHidden = localStorage.getItem('controlPanelHidden');
        // 默认为隐藏状态，除非明确设置为false
        if (panelHidden === 'false') {
            // 如果之前设置为显示，则显示控制面板
            const panel = document.getElementById('control-panel');
            const toggleIcon = document.getElementById('toggle-icon');
            const toggleBtn = document.getElementById('toggle-panel-btn');
            if (panel) {
                panel.classList.remove('panel-hidden');
                if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
                if (toggleBtn) toggleBtn.style.right = '220px'; // 控制面板显示时，按钮在左侧
            }
        } else {
            // 默认或设置为隐藏，确保按钮在右侧，面板隐藏
            const panel = document.getElementById('control-panel');
            const toggleIcon = document.getElementById('toggle-icon');
            const toggleBtn = document.getElementById('toggle-panel-btn');
            if (panel) panel.classList.add('panel-hidden');
            if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
            if (toggleBtn) toggleBtn.style.right = '20px';
            
            // 保存状态
            try {
                localStorage.setItem('controlPanelHidden', 'true');
            } catch (e) {
                console.log('无法保存控制面板状态:', e.message);
            }
        }
    } catch (e) {
        console.log('无法加载控制面板状态:', e.message);
    }
    
    // 先设置默认背景
    setDefaultBackground();
    
    // 初始化卡片旋转状态
    window.cardsPaused = false;
    window.pauseDuration = 0;
    window.hasShownPauseHint = false;
    
    // 场景
    scene = new THREE.Scene();
    
    // 相机
    const cardHeight = 30;
    const maxScale = 2.6;
    const maxCardHeight = cardHeight * maxScale;
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.15;
    const cameraDistance = Math.max(60, radius * 0.95 + maxCardHeight * 0.85);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 60, cameraDistance);
    camera.lookAt(0, 0, 0);
    
    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    document.body.appendChild(renderer.domElement);

    // 光源
    const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
    pointLight.position.set(0, 0, 25);
    scene.add(pointLight);
    
    // 添加彩色光源增强氛围
    const purpleLight = new THREE.PointLight(0x9370DB, 0.8, 50);
    purpleLight.position.set(-20, 10, 0);
    scene.add(purpleLight);
    
    const goldLight = new THREE.PointLight(0xFFD700, 0.8, 50);
    goldLight.position.set(20, 10, 0);
    scene.add(goldLight);
    
    initAudio();
    
    // 先创建带默认背景的卡片
    createCards();
    createParticleSystem();
    
    // 延迟显示音效启动提示
    setTimeout(() => {
        showNotification('🎵 点击任意地方启用音效！', 'info');
    }, 2000);
    
    // 异步加载图片并应用
    setTimeout(() => {
        loadAndApplyImages();
        
        // 初始化时适配标题颜色
        updateTitleColors();
    }, 1000);
    
    // 事件监听
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('click', onClick);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousemove', createStarTrail);
    
    animate();
}

// 将原始的setRandomBackground函数保留但修改为使用新函数
async function setRandomBackground() {
    showNotification('正在为您生成新的背景图，请稍候...', 'loading');
    try {
        const imageUrl = await getRandomImageUrl(); // 使用更新后的函数
        if (imageUrl) {
            applyBackgroundImage(imageUrl);
            showNotification('背景图片已更新！', 'success');
        } else {
            showNotification('无法获取背景图片，请稍后重试。', 'error');
            setDefaultBackground(); // 使用默认背景作为后备
        }
    } catch (error) {
        console.error('设置随机背景失败:', error);
        showNotification('设置背景图片时出错。', 'error');
        setDefaultBackground(); // 出错时也使用默认背景
    }
}

// 显示通知消息
function showNotification(message, type = 'info') {
    // 禁用所有通知
    return;
    
    // 以下代码不会执行
    // ... existing code ...
}

// 将函数暴露到全局作用域供HTML调用
window.setRandomBackground = setRandomBackground;

// 刷新所有卡片背景
async function refreshAllCardBackgrounds() {
    showNotification('正在刷新所有卡片背景...请稍候', 'loading');
    try {
        const imageObjects = await imageCache.getImages(cards.length); // 获取足够数量的图片
        
        if (!imageObjects || imageObjects.length < cards.length) {
            showNotification('获取卡片背景图不足，部分卡片可能使用默认背景。', 'warning');
        }

        const promises = cards.map(async (card, index) => {
            try {
                const imgObj = imageObjects[index % imageObjects.length]; // 循环使用获取到的图片
                const imageUrl = imgObj ? imgObj.pictureUrl : null;
                
                if (imageUrl) {
                    await setCardBackground(card.userData.metaIndex, imageUrl);
                } else {
                    console.warn(`卡片 ${index} 未能获取到背景图片，将使用默认背景`);
                    // 如果没有获取到图片，则使用默认背景
                    const character = cardMetas[card.userData.metaIndex];
                    const defaultTexture = createCardTexture(character, null, card.userData.isHovered);
                    card.material.map = defaultTexture;
                    card.material.needsUpdate = true;
                }
            } catch (error) {
                console.error(`刷新卡片 ${index} 背景失败:`, error);
                const character = cardMetas[card.userData.metaIndex];
                const defaultTexture = createCardTexture(character, null, card.userData.isHovered);
                card.material.map = defaultTexture;
                card.material.needsUpdate = true; 
            }
        });
        
        await Promise.all(promises);
        showNotification('所有卡片背景已刷新完毕！', 'success');
    } catch (error) {
        console.error('刷新所有卡片背景时发生错误:', error);
        showNotification('刷新卡片背景失败。', 'error');
    }
}

// 将刷新函数暴露到全局作用域
window.refreshAllCardBackgrounds = refreshAllCardBackgrounds;

// 创建默认卡片背景
function createDefaultCardBackground(ctx, character) {
    const bgGradient = ctx.createRadialGradient(128, 160, 50, 128, 160, 200);
    if (character.rarity === 5) {
        bgGradient.addColorStop(0, character.color + '99'); // 降低不透明度
        bgGradient.addColorStop(0.3, '#FFD70088'); // 降低不透明度
        bgGradient.addColorStop(0.6, '#8A2BE288'); // 降低不透明度
        bgGradient.addColorStop(1, '#0a0a1a');
    } else {
        bgGradient.addColorStop(0, character.color + '99'); // 降低不透明度
        bgGradient.addColorStop(0.4, '#9370DB88'); // 降低不透明度
        bgGradient.addColorStop(1, '#0a0a1a');
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 256, 320);
}

// 初始化音效
function initAudio() {
    // 现代浏览器需要用户交互才能启动AudioContext
    let audioInitialized = false;
    
    const startAudio = () => {
        if (audioInitialized) return;
        
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // 恢复音频上下文（如果被暂停）
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
            audioInitialized = true;
            console.log('✨ 音频系统已启动');
            showNotification('🎶 音效已启用！', 'success');
        } catch (e) {
            console.log('音频初始化失败:', e.message);
        }
    };
    
    // 监听用户的首次交互
    const initOnUserInteraction = () => {
        startAudio();
        // 移除事件监听器，只需要初始化一次
        document.removeEventListener('click', initOnUserInteraction);
        document.removeEventListener('touchstart', initOnUserInteraction);
        document.removeEventListener('keydown', initOnUserInteraction);
    };
    
    document.addEventListener('click', initOnUserInteraction);
    document.addEventListener('touchstart', initOnUserInteraction);
    document.addEventListener('keydown', initOnUserInteraction);
    
    try {
        hoverSound = () => {
            if (!audioContext || audioContext.state !== 'running') return;
            
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.setValueAtTime(800, audioContext.currentTime);
            gain.gain.setValueAtTime(0.1, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            osc.start();
            osc.stop(audioContext.currentTime + 0.1);
        };
        
        clickSound = () => {
            if (!audioContext || audioContext.state !== 'running') return;
            
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.setValueAtTime(523, audioContext.currentTime);
            gain.gain.setValueAtTime(0.1, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            osc.start();
            osc.stop(audioContext.currentTime + 0.3);
        };
    } catch (e) {
        console.log('音频初始化失败');
        hoverSound = clickSound = () => {};
    }
}

// 创建默认头像
function createDefaultAvatar(character) {
                const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    
    // 星空背景（极度淡化）
    const bgGradient = ctx.createRadialGradient(60, 60, 20, 60, 60, 60);
    bgGradient.addColorStop(0, character.color + '55'); // 大幅降低不透明度
    bgGradient.addColorStop(0.6, character.color + '33'); // 大幅降低不透明度
    bgGradient.addColorStop(1, '#0a0a1a');
    
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.arc(60, 60, 60, 0, Math.PI * 2);
    ctx.fill();
    
    // 添加星星点缀（极少且极淡）
    for (let i = 0; i < 5; i++) { // 显著减少数量
        const x = 10 + Math.random() * 100;
        const y = 10 + Math.random() * 100;
        const size = Math.random() * 1 + 0.5; // 更小的星星
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3 + 0.1})`; // 更低的不透明度
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 发光外圈（极度淡化）
    ctx.strokeStyle = character.color;
    ctx.globalAlpha = 0.3; // 全局降低不透明度
    ctx.lineWidth = 2; // 更细的线宽
    ctx.shadowColor = character.color;
    ctx.shadowBlur = 5; // 减小发光范围
    ctx.beginPath();
    ctx.arc(60, 60, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0; // 恢复不透明度
    
    // 内圈装饰（极度淡化）
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // 显著降低不透明度
    ctx.lineWidth = 1; // 更细的线宽
    ctx.beginPath();
    ctx.arc(60, 60, 48, 0, Math.PI * 2);
    ctx.stroke();
    
    // 元素符号背景（几乎透明）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; // 显著降低不透明度
    ctx.beginPath();
    ctx.arc(60, 60, 35, 0, Math.PI * 2);
    ctx.fill();
    
    // 元素符号（非常淡）
    ctx.globalAlpha = 0.15; // 全局降低不透明度
    let elementSymbol = '';
    switch(character.vision) {
        case '冰': elementSymbol = '❄️'; break;
        case '火': elementSymbol = '🔥'; break;
        case '雷': elementSymbol = '⚡'; break;
        case '岩': elementSymbol = '🗿'; break;
        case '风': elementSymbol = '💨'; break;
        case '水': elementSymbol = '💧'; break;
        default: elementSymbol = '✨';
    }
    
    ctx.font = '28px Arial'; // 稍小的字体
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(elementSymbol, 60, 70);
    ctx.globalAlpha = 1.0; // 恢复不透明度
    
    // 角落星级装饰（几乎不可见）
    if (character.rarity === 5) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)'; // 显著降低不透明度
        ctx.font = '10px Arial'; // 更小的字体
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const x = 60 + Math.cos(angle) * 45;
            const y = 60 + Math.sin(angle) * 45;
            ctx.fillText('★', x, y);
        }
    } else {
        ctx.fillStyle = 'rgba(147, 112, 219, 0.15)'; // 显著降低不透明度
        ctx.font = '8px Arial'; // 更小的字体
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
            const x = 60 + Math.cos(angle) * 45;
            const y = 60 + Math.sin(angle) * 45;
            ctx.fillText('★', x, y);
        }
    }
    
    return canvas;
}

// 修改createCardTexture函数，添加isHovered参数
function createCardTexture(character, backgroundImageUrl = null, isHovered = false) {
    // 高清渲染：分辨率提升2倍
    const scale = 2;
    const width = 256 * scale;
    const height = 320 * scale;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    // 非悬停状态：浅色渐变
    if (!isHovered) {
        // 简化背景，使用浅色渐变
        const bgGradient = ctx.createLinearGradient(0, 0, 256, 320);
        if (character.rarity === 5) {
            bgGradient.addColorStop(0, 'rgba(20, 20, 30, 0.3)'); // 浅色背景
            bgGradient.addColorStop(1, 'rgba(10, 10, 20, 0.2)'); // 浅色背景
        } else {
            bgGradient.addColorStop(0, 'rgba(20, 20, 30, 0.25)'); // 浅色背景
            bgGradient.addColorStop(1, 'rgba(10, 10, 20, 0.15)'); // 浅色背景
        }
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, 256, 320);
        
        // 如果有背景图片，绘制在浅色背景之上，但添加半透明效果
        if (backgroundImageUrl && character.backgroundImage) {
            try {
                // 半透明绘制图片，降低不透明度
                ctx.globalAlpha = 0.6; // 降至60%不透明度
                ctx.drawImage(character.backgroundImage, 0, 0, 256, 320);
                ctx.globalAlpha = 1.0; // 恢复不透明度
                
                // 添加更深的暗化层减少刺眼感
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(0, 0, 256, 320);
                
                // 添加轻微的渐变覆盖，确保文字可读
                const overlay = ctx.createLinearGradient(0, 100, 0, 320);
                overlay.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
                overlay.addColorStop(0.7, 'rgba(0, 0, 0, 0.5)');
                overlay.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
                ctx.fillStyle = overlay;
                ctx.fillRect(0, 100, 256, 220);
            } catch (e) {
                console.log(`${character.name}的背景图片加载失败:`, e.message);
            }
        }
    } 
    // 悬停状态：最大清晰度
    else {
        // 步骤1：如果有背景图片则使用，否则创建丰富的渐变背景
        if (backgroundImageUrl && character.backgroundImage) {
            try {
                // 完全不透明地绘制图片
                ctx.drawImage(character.backgroundImage, 0, 0, 256, 320);
                
                // 添加暗化滤镜以减少刺眼感
                ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
                ctx.fillRect(0, 0, 256, 320);
                
                // 添加轻微渐变覆盖确保文字可读性
                const gradient = ctx.createLinearGradient(0, 150, 0, 320);
                gradient.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
                gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.6)');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 150, 256, 170);
            } catch (e) {
                console.log(`${character.name}的背景图片加载失败:`, e.message);
                // 图片加载失败时使用丰富的渐变背景
                createRichGradientBackground(ctx, character);
            }
        } else {
            // 没有图片时创建丰富的渐变背景，而不是纯黑色
            createRichGradientBackground(ctx, character);
        }
    }
    
    // 共享部分：绘制卡片边框和内容
    // 卡片边框
    ctx.strokeStyle = character.rarity === 5 ? 
        (isHovered ? '#FFD700' : 'rgba(255, 215, 0, 0.4)') : 
        (isHovered ? '#9370DB' : 'rgba(147, 112, 219, 0.4)');
    ctx.lineWidth = isHovered ? 3 : 2;
    ctx.strokeRect(3, 3, 250, 314);
    
    // 左上角元素框
    drawElementBox(ctx, character, isHovered);
    
    // 角色名称
    drawTextWithOutline(
        ctx, 
        character.name, 
        128, 
        140, 
        isHovered ? 28 : 26, 
        isHovered ? '#FFFFFF' : 'rgba(255, 215, 0, 0.98)', 
        '#000000', 
        isHovered ? 4 : 3
    );
    
    // 武器类型
    drawTextWithOutline(
        ctx, 
        character.weapon, 
        128, 
        170, 
        isHovered ? 18 : 16, 
        isHovered ? '#B0E0FF' : 'rgba(150, 200, 255, 0.98)', 
        '#000000', 
        isHovered ? 3 : 2
    );
    
    // 地区
    drawTextWithOutline(
        ctx, 
        character.region, 
        128, 
        195, 
        isHovered ? 18 : 16, 
        isHovered ? '#DCC0FF' : 'rgba(190, 160, 255, 0.95)', 
        '#000000', 
        isHovered ? 3 : 2
    );
    
    // 星级
    drawStarRating(ctx, character.rarity, 215, isHovered);
    
    // 网站名称（描述）
    drawDescriptionBox(ctx, character, isHovered);
    
    // 创建纹理
                const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return texture;
}

// 更新绘制函数，支持悬停状态
function drawElementBox(ctx, character, isHovered) {
    // 设置元素颜色
    let elementColor;
    switch(character.vision) {
        case '冰': elementColor = isHovered ? '#50AAFF' : 'rgba(80, 170, 255, 0.9)'; break;
        case '火': elementColor = isHovered ? '#FF5050' : 'rgba(255, 100, 80, 0.9)'; break;
        case '雷': elementColor = isHovered ? '#B45AFF' : 'rgba(180, 90, 255, 0.9)'; break;
        case '岩': elementColor = isHovered ? '#FFB43C' : 'rgba(255, 180, 60, 0.9)'; break;
        case '风': elementColor = isHovered ? '#50E696' : 'rgba(80, 230, 150, 0.9)'; break;
        case '水': elementColor = isHovered ? '#3296FF' : 'rgba(50, 150, 255, 0.9)'; break;
        default: elementColor = isHovered ? '#C8C8C8' : 'rgba(200, 200, 200, 0.9)';
    }
    
    // 绘制六边形背景
    const size = 40;
    const x = 10;
    const y = 10;
    const centerX = x + size/2;
    const centerY = y + size/2;
    const radius = size/2;
    
    // 黑色背景
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) - Math.PI / 6;
        const pointX = centerX + radius * Math.cos(angle);
        const pointY = centerY + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(pointX, pointY);
        else ctx.lineTo(pointX, pointY);
    }
    ctx.closePath();
    ctx.fillStyle = isHovered ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.6)';
    ctx.fill();
    
    // 彩色边框
    ctx.strokeStyle = elementColor;
    ctx.lineWidth = isHovered ? 3 : 2;
    ctx.stroke();
    
    // 元素文字
    drawTextWithOutline(
        ctx, 
        character.vision, 
        centerX, 
        centerY + 8, 
        22, 
        elementColor, 
        '#000000', 
        isHovered ? 2 : 1.5
    );
}

function drawStarRating(ctx, rarity, y, isHovered) {
    const starColor = rarity === 5 ? 
        (isHovered ? '#FFD700' : 'rgba(255, 215, 0, 0.8)') : 
        (isHovered ? '#DDA0DD' : 'rgba(221, 160, 221, 0.8)');
    const centerX = 128;
    const starSpacing = 20;
    
    for (let i = 0; i < rarity; i++) {
        const starX = centerX - ((rarity - 1) * starSpacing / 2) + (i * starSpacing);
        drawTextWithOutline(
            ctx, 
            '★', 
            starX, 
            y, 
            isHovered ? 18 : 16, 
            starColor, 
            '#000000', 
            isHovered ? 2 : 1.5
        );
    }
}

function drawDescriptionBox(ctx, character, isHovered) {
    // 绘制背景框
    const boxWidth = 200;
    const boxHeight = 34;
    const boxX = (256 - boxWidth) / 2;
    const boxY = 250;
    
    // 黑色背景
    ctx.fillStyle = isHovered ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
    ctx.fill();
    
    // 彩色边框
    ctx.strokeStyle = character.rarity === 5 ? 
        (isHovered ? '#FFD700' : 'rgba(255, 215, 0, 0.5)') : 
        (isHovered ? '#B768FF' : 'rgba(183, 104, 255, 0.5)');
    ctx.lineWidth = isHovered ? 2 : 1.5;
    ctx.stroke();
    
    // 描述文字
    drawTextWithOutline(
        ctx, 
        character.description, 
        128, 
        boxY + 22, 
        isHovered ? 16 : 15,
        isHovered ? '#FFFFFF' : 'rgba(255, 255, 255, 0.9)', 
        '#000000', 
        isHovered ? 3 : 2
    );
}

// 新增：绘制带描边的文字
function drawTextWithOutline(ctx, text, x, y, fontSize, fillColor, outlineColor, outlineWidth) {
    ctx.textAlign = 'center';
    ctx.font = `bold ${fontSize}px Orbitron, Arial`;
    
    // 绘制描边
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(text, x, y);
    
    // 绘制填充
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
}

// 创建粒子系统
function createParticleSystem() {
    const particleCount = 250; // 稍微减少数量，避免过于拥挤
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        // 更零散的随机分布
        const angle = Math.random() * Math.PI * 2;
        const radius = 8 + Math.random() * 25; // 更大的分布范围
        
        positions[i * 3] = (Math.random() - 0.5) * 120; // 扩大X位置分布范围
        positions[i * 3 + 1] = (Math.random() - 0.5) * 60; // 扩大Y位置分布范围
        positions[i * 3 + 2] = (Math.random() - 0.5) * 40; // 扩大Z位置分布范围
        
        // 落叶式漂浮速度
        velocities[i * 3] = (Math.random() - 0.5) * 0.008; // 轻微左右摆动
        velocities[i * 3 + 1] = -Math.random() * 0.015; // 向下飘落
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.005; // 前后轻微移动
        
        // 颜色
        const color = new THREE.Color();
        const colorType = Math.random();
        if (colorType < 0.4) {
            color.setHex(0xFFD700); // 金色落叶
        } else if (colorType < 0.7) {
            color.setHex(0xFFA500); // 橙色落叶
        } else if (colorType < 0.85) {
            color.setHex(0xFF6347); // 红色落叶
            } else {
            color.setHex(0x90EE90); // 绿色落叶
        }
        
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    
    const material = new THREE.PointsMaterial({
        size: 1, // 增大粒子大小，使小卡片更明显
        transparent: true,
        opacity: 0.5, // 将透明度调整为50%
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
    });
    
    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
}

// 更新卡片纹理
function updateCardTexture(cardIndex) {
    if (cardIndex >= 0 && cardIndex < cards.length) {
        const character = genshinCharacters[cardIndex];
        const meta = cardMetas[cardIndex];
        const card = cards[cardIndex];
        const isHovered = meta.isHoveredNow || false;
        const newTexture = createCardTexture(character, character.backgroundImageUrl, isHovered);
        card.material.map = newTexture;
        card.material.needsUpdate = true;
        console.log(`✨ 角色 ${character.name} 的背景已更新`);
    }
}

function animate() {
    requestAnimationFrame(animate);
    const time = Date.now() * 0.001;
    
    // 更新粒子
    if (particleSystem) {
        const positions = particleSystem.geometry.attributes.position.array;
        const velocities = particleSystem.geometry.attributes.velocity.array;
        for (let i = 0; i < positions.length; i += 3) {
            const particleIndex = i / 3;
            
            // 落叶式飘动：加入风的摆动效果
            const windX = Math.sin(time * 0.8 + particleIndex * 0.2) * 0.002;
            const windZ = Math.cos(time * 0.6 + particleIndex * 0.15) * 0.001;
            
            positions[i] += velocities[i] + windX; // X轴：风的左右摆动
            positions[i + 1] += velocities[i + 1]; // Y轴：向下飘落
            positions[i + 2] += velocities[i + 2] + windZ; // Z轴：前后轻微移动
            
            // 边界检测和重置（落叶掉出屏幕后重新从顶部飘落）
            if (positions[i + 1] < -30 || Math.abs(positions[i]) > 70 || Math.abs(positions[i + 2]) > 30) {
                // 重新从顶部随机位置开始飘落
                positions[i] = (Math.random() - 0.5) * 120;
                positions[i + 1] = 30 + Math.random() * 15;
                positions[i + 2] = (Math.random() - 0.5) * 40;
            }
        }
        particleSystem.geometry.attributes.position.needsUpdate = true;
        
        // 整个粒子系统轻微摆动，像风中的落叶群
        particleSystem.rotation.y = Math.sin(time * 0.1) * 0.1;
    }
    
    // 处理卡片旋转的全局状态
    if (hoveredCardIndex !== null) {
        // 有卡片被悬停，记录暂停时间
        if (!window.cardsPaused) {
            window.pauseStartTime = time;
            window.cardsPaused = true;
        }
    } else {
        // 没有悬停，恢复旋转
        if (window.cardsPaused) {
            window.cardsPaused = false;
            window.pauseDuration = (window.pauseDuration || 0) + (time - window.pauseStartTime);
        }
    }
    
    // 更新卡片
    cards.forEach((card, i) => {
        const meta = cardMetas[i];
        
        if (hoveredCardIndex === i) {
            meta.targetScale = 2;
            meta.hovered = true;
            
            // 更新卡片纹理，使用悬停版本
            if (!meta.isHoveredNow) {
                meta.isHoveredNow = true;
                const character = genshinCharacters[i];
                const newTexture = createCardTexture(character, character.backgroundImageUrl, true);
                card.material.map = newTexture;
                card.material.needsUpdate = true;
            }
        } else {
            meta.targetScale = 1;
            meta.hovered = false;
            
            // 更新卡片纹理，使用非悬停版本
            if (meta.isHoveredNow) {
                meta.isHoveredNow = false;
                const character = genshinCharacters[i];
                const newTexture = createCardTexture(character, character.backgroundImageUrl, false);
                card.material.map = newTexture;
                card.material.needsUpdate = true;
            }
        }
        
        // 屏幕内逆时针旋转：当有卡片被悬停时停止旋转，靠近观察者时卡片最大
        let angle;
        if (window.cardsPaused) {
            // 卡片暂停时，使用暂停开始时的角度
            angle = meta.angle - (window.pauseStartTime - (window.pauseDuration || 0)) * rotationSpeed;
        } else {
            // 正常旋转，考虑累计的暂停时间
            angle = meta.angle - (time - (window.pauseDuration || 0)) * rotationSpeed;
        }
        
        // 3D椭圆轨迹，突出由远及近的视觉效果
        const radius = meta.radius;
        const cardX = Math.cos(angle) * radius * 2.0; // 按图片要求，进一步扩大水平椭圆
        const cardZ = Math.sin(angle) * radius * 0.25; // 按图片要求，更扁平的椭圆
        
        // 根据Z位置调整高度，远处卡片更高，近处卡片更低
        const depthFactor = (cardZ + radius * 0.25) / (radius * 0.5); // 0-1之间，适应新的Z轴范围
        const baseY = Math.sin(time * 1.2 + i * 0.4) * 1.5;
        const cardY = baseY + (1 - depthFactor) * 5; // 调整高度差异，适应更扁平的椭圆
        
        // 按图片标注调整卡片大小：底部最小0.6倍，左右两侧1.4倍，顶部最大3.5倍
        // 角度0为右侧，逆时针依次为顶部、左侧、底部
        const angleNormalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        let sizeMultiplier;
        const topMax = 3.5;
        const side = 1.4;
        const bottomMin = 0.6;
        if (angleNormalized >= 0 && angleNormalized < Math.PI * 0.5) {
            // 右侧到顶部：1.4 -> 3.0
            const t = angleNormalized / (Math.PI * 0.5);
            sizeMultiplier = side + (topMax - side) * t; // 右侧1.4，顶部3.0
        } else if (angleNormalized >= Math.PI * 0.5 && angleNormalized < Math.PI * 1.5) {
            // 顶部到左侧再到底部：3.0 -> 1.4 -> 0.6
            const t = (angleNormalized - Math.PI * 0.5) / Math.PI;
            if (angleNormalized < Math.PI) {
                // 顶部到左侧：3.0 -> 1.4
                sizeMultiplier = topMax + (side - topMax) * (t * 2);
            } else {
                // 左侧到底部：1.4 -> 0.6
                sizeMultiplier = side + (bottomMin - side) * ((t - 0.5) * 2);
            }
        } else {
            // 底部到右侧：0.6 -> 1.4
            const t = (angleNormalized - Math.PI * 1.5) / (Math.PI * 0.5);
            sizeMultiplier = bottomMin + (side - bottomMin) * t; // 底部0.6，右侧1.4
        }
        
        // 应用计算出的大小倍数
        const depthScale = sizeMultiplier;
        const perspectiveScale = meta.originalScale * depthScale;
        
        // 根据大小调整透明度：大的卡片更清晰，小的卡片稍微透明
        const depthOpacity = 0.4 + (sizeMultiplier / 1.6) * 0.6; // 根据大小调整透明度
        
        card.position.set(cardX, cardY, cardZ);
        
        // 根据位置调整卡片朝向，确保顶部时正面朝向观察者
        if (meta.hovered) {
            // 悬停时，始终让卡片正面朝向相机，确保正立
            card.lookAt(camera.position);
            // 将晃动频率从6降低到2，将幅度从0.15降低到0.05，使晃动更加轻微
            card.rotation.z = Math.sin(time * 1.5) * 0.03;
        } else if (angleNormalized >= Math.PI * 0.3 && angleNormalized <= Math.PI * 0.7) {
            // 在顶部附近时，让卡片正面朝向观察者（相机）
            card.lookAt(camera.position);
        } else {
            // 其他位置时，稍微朝向中心，营造3D效果
            const targetX = cardX * 0.3; // 部分朝向中心
            const targetY = cardY;
            const targetZ = cardZ * 0.3;
            card.lookAt(targetX, targetY, targetZ);
        }
        
        // 缩放动画
        meta.originalScale += (meta.targetScale - meta.originalScale) * 0.12;
        card.scale.setScalar(perspectiveScale);
        
        // 悬停效果
        if (meta.hovered) {
            // 悬停时的额外光效，减少闪烁频率，使效果更加平稳
            card.material.opacity = Math.min(1, depthOpacity + 0.2 + Math.sin(time * 3) * 0.05);
        } else {
            card.material.opacity = depthOpacity;
            card.rotation.z *= 0.95;
        }
    });

    renderer.render(scene, camera);
}

function onClick(event) {
    if (clickSound) clickSound();
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cards);
    
    if (intersects.length > 0) {
        const cardIndex = cards.indexOf(intersects[0].object);
        const character = cardMetas[cardIndex].character;
        showNotification(`🚀 正在打开 ${character.name} - ${character.description}`, 'info');
        window.open(character.url, '_blank');
    }
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cards);
    
    const prevHovered = hoveredCardIndex;
    
    if (intersects.length > 0) {
        hoveredCardIndex = cards.indexOf(intersects[0].object);
        if (prevHovered !== hoveredCardIndex && hoverSound) {
            hoverSound();
        }
        
        // 首次悬停提示
        if (!window.hasShownPauseHint) {
            window.hasShownPauseHint = true;
            showNotification('⏸️ 悬停时卡片已暂停旋转！', 'info');
        }
    } else {
        hoveredCardIndex = null;
    }
}

function createStarTrail(event) {
    if (starTrailCount >= MAX_STAR_TRAILS || Math.random() < 0.7) {
        return;
    }
    
    starTrailCount++;
    const star = document.createElement('div');
    star.className = 'star-trail';
    star.style.left = (event.clientX - 3) + 'px';
    star.style.top = (event.clientY - 3) + 'px';
    // 随机颜色
    const colors = ['#FFD700', '#9370DB', '#00FFFF'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    star.style.background = `radial-gradient(circle, ${randomColor} 0%, transparent 70%)`;
    star.style.boxShadow = `0 0 10px ${randomColor}`;
    document.body.appendChild(star);
    
    setTimeout(() => {
        if (star.parentNode) {
            star.parentNode.removeChild(star);
            starTrailCount--;
        }
    }, 1000);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// 检测F12是否打开
function isDevtoolsOpen() {
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    let opened = false;
    if (widthThreshold || heightThreshold) {
        opened = true;
    }
    if (window.devtools && window.devtools.open) {
        opened = true;
    }
    return opened;
}

// 只显示R18控制选项，当开发者工具打开时
function showR18ControlsIfDevtools() {
    const r18Controls = document.getElementById('r18-controls');
    if (!r18Controls) return;
    if (isDevtoolsOpen()) {
        r18Controls.style.display = 'flex';
    } else {
        r18Controls.style.display = 'none';
    }
}

// 初始化时立即隐藏
(function hideR18ControlsOnInit() {
    // 不再隐藏整个面板，只隐藏R18控制选项
    const r18Controls = document.getElementById('r18-controls');
    if (r18Controls) r18Controls.style.display = 'none';
})();

window.addEventListener('resize', showR18ControlsIfDevtools);
window.addEventListener('focus', showR18ControlsIfDevtools);
setTimeout(showR18ControlsIfDevtools, 800);

// 为没有图片的卡片创建丰富的渐变背景
function createRichGradientBackground(ctx, character) {
    // 根据角色稀有度和元素类型创建不同的渐变背景
    let primaryColor, secondaryColor;
    
    // 确定元素对应的主色调
    switch(character.vision) {
        case '冰': 
            primaryColor = '#50AAFF'; 
            secondaryColor = '#8AC5FF'; 
            break;
        case '火': 
            primaryColor = '#FF5050'; 
            secondaryColor = '#FF8070'; 
            break;
        case '雷': 
            primaryColor = '#B45AFF'; 
            secondaryColor = '#D78AFF'; 
            break;
        case '岩': 
            primaryColor = '#FFB43C'; 
            secondaryColor = '#FFCC70'; 
            break;
        case '风': 
            primaryColor = '#50E696'; 
            secondaryColor = '#80F0B0'; 
            break;
        case '水': 
            primaryColor = '#3296FF'; 
            secondaryColor = '#70B8FF'; 
            break;
        default: 
            // 默认使用稀有度决定颜色
            if (character.rarity === 5) {
                primaryColor = '#9370DB'; 
                secondaryColor = '#B19CD9';
            } else {
                primaryColor = '#6A5ACD'; 
                secondaryColor = '#9387E0';
            }
    }
    
    // 创建高质量渐变背景
    const gradient = ctx.createRadialGradient(128, 120, 30, 128, 140, 300);
    gradient.addColorStop(0, `rgba(${hexToRgb(primaryColor)}, 0.8)`);
    gradient.addColorStop(0.4, `rgba(${hexToRgb(secondaryColor)}, 0.6)`);
    gradient.addColorStop(0.8, `rgba(30, 30, 50, 0.8)`);
    gradient.addColorStop(1, 'rgba(20, 20, 30, 0.9)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 320);
    
    // 添加轻微的纹理效果
    addBackgroundTexture(ctx);
    
    // 添加底部文字区域渐变
    const textAreaGradient = ctx.createLinearGradient(0, 150, 0, 320);
    textAreaGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    textAreaGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.5)');
    textAreaGradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = textAreaGradient;
    ctx.fillRect(0, 150, 256, 170);
}

// 将16进制颜色转换为RGB格式
function hexToRgb(hex) {
    // 去掉#号
    hex = hex.replace('#', '');
    
    // 解析RGB值
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `${r}, ${g}, ${b}`;
}

// 添加背景纹理效果
function addBackgroundTexture(ctx) {
    // 添加微妙的点状纹理
    ctx.save();
    ctx.globalAlpha = 0.1;
    
    // 创建随机点状纹理
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 320;
        const size = Math.random() * 2 + 0.5;
        
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();
    }
    
    // 添加轻微的水平线条
    for (let i = 0; i < 10; i++) {
        const y = Math.random() * 320;
        const width = 50 + Math.random() * 150;
        const x = Math.random() * (256 - width);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(x, y, width, 0.5);
    }
    
    ctx.restore();
}

// 新增：切换R18模式的函数
async function toggleR18Mode(isChecked) {
    isR18ModeEnabled = isChecked;
    const modeText = isR18ModeEnabled ? "开启" : "关闭";
    showNotification(`R18模式已${modeText}。正在刷新背景图...`, 'info');
    
    // 清空现有图片缓存，以便获取新的R18或非R18图片
    imageCache.images = [];
    imageCache.lastFetchTime = 0;
    console.log('🧹 R18模式切换，已清空图片缓存');

    // 刷新主背景
    await setRandomBackground();
    // 刷新所有卡片背景
    await refreshAllCardBackgrounds();
    showNotification(`R18模式已${modeText}，背景图已刷新。`, 'success');
}

// 新增：调整旋转速度的函数
function adjustRotationSpeed(value) {
    rotationSpeed = parseFloat(value);
    // 更新显示值
    const speedValueElement = document.getElementById('speed-value');
    if (speedValueElement) {
        speedValueElement.textContent = rotationSpeed.toFixed(2);
    }
    // 可选：保存到本地存储
    try {
        localStorage.setItem('rotationSpeed', rotationSpeed);
    } catch (e) {
        console.log('无法保存旋转速度设置:', e.message);
    }
}

// 新增：控制面板切换函数
function toggleControlPanel() {
    const panel = document.getElementById('control-panel');
    const toggleBtn = document.getElementById('toggle-panel-btn');
    const toggleIcon = document.getElementById('toggle-icon');
    
    if (!panel) return;
    
    if (panel.classList.contains('panel-hidden')) {
        // 显示面板
        panel.classList.remove('panel-hidden');
        toggleIcon.textContent = '≡';
        toggleIcon.style.transform = 'rotate(0deg)';
        toggleBtn.style.right = '220px'; // 控制面板显示时，按钮位于左侧
        try {
            localStorage.setItem('controlPanelHidden', 'false');
        } catch (e) {
            console.log('无法保存控制面板状态:', e.message);
        }
    } else {
        // 隐藏面板
        panel.classList.add('panel-hidden');
        toggleIcon.textContent = '≡';
        toggleIcon.style.transform = 'rotate(180deg)';
        toggleBtn.style.right = '20px'; // 控制面板隐藏时，按钮移到右侧
        try {
            localStorage.setItem('controlPanelHidden', 'true');
        } catch (e) {
            console.log('无法保存控制面板状态:', e.message);
        }
    }
}

// 暴露给 HTML调用的函数
window.setRandomBackground = setRandomBackground;
window.refreshAllCardBackgrounds = refreshAllCardBackgrounds;
window.toggleR18Mode = toggleR18Mode; // 新增：暴露切换R18模式的函数
window.adjustRotationSpeed = adjustRotationSpeed; // 新增：暴露调整旋转速度的函数
window.toggleControlPanel = toggleControlPanel; // 新增：暴露控制面板切换函数

init();