import * as THREE from 'three';

let scene, camera, renderer;
let cards = [];
let cardMetas = [];
let particleSystem;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredCardIndex = null;
let starTrailCount = 0;
const MAX_STAR_TRAILS = 10;

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
        // 默认优先使用Pixiv反代
        const pixivUrl = await getDuckMoImageWithProxy();
        console.log('Pixiv反代获取图片URL:', pixivUrl);
        if (pixivUrl) {
            return pixivUrl;
        }
        
        console.log('🔄 切换到备用图片模式');
        return getFallbackImageUrl();
    } catch (error) {
        console.log('❌ 图片获取失败:', error.message);
        return getFallbackImageUrl();
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
    }, 100);
    
    console.log('✨ 默认背景已设置');
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
    setDefaultBackground();
    
    // 异步加载外部图片
    setTimeout(async () => {
        try {
            // 尝试从缓存获取一张图片
            const cachedImages = await imageCache.getImages(1);
            if (cachedImages && cachedImages.length > 0) {
                const imageUrl = cachedImages[0].pictureUrl;
                if (imageUrl) {
                    applyBackgroundImage(imageUrl);
                    return;
                }
            }
        } catch (error) {
            console.log('获取缓存图片失败:', error.message);
        }
    }, 500);
}

// 显示通知消息
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? 'rgba(76, 175, 80, 0.9)' : 
                     type === 'warning' ? 'rgba(255, 152, 0, 0.9)' : 
                     'rgba(33, 150, 243, 0.9)'};
        color: white;
        padding: 12px 24px;
        border-radius: 25px;
        font-family: 'Orbitron', sans-serif;
        font-size: 14px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        opacity: 0;
        transition: all 0.3s ease-in-out;
        pointer-events: none;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(-50%) translateY(10px)';
    }, 100);
    
    // 自动隐藏
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 将函数暴露到全局作用域供HTML调用
window.setRandomBackground = setRandomBackground;

// 刷新所有卡片背景
async function refreshAllCardBackgrounds() {
    console.log('🎨 开始刷新所有卡片背景...');
    showNotification('🎨 正在为所有角色重新加载背景图片...', 'info');
    
    // 计算需要获取的图片数量等于卡片数量
    const requiredImages = genshinCharacters.length;
    
    try {
        // 一次性获取所有需要的图片
        const images = await imageCache.getImages(requiredImages);
        
        if (images && images.length > 0) {
            let loadedCount = 0;
            const totalCards = genshinCharacters.length;
            
            // 随机分配图片给卡片
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
                                console.log(`♻️ 刷新卡片${i+1} Pixiv图片代理URL: ${proxyUrl}`);
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
                                console.log(`♻️ 刷新卡片${i+1} Imgur图片代理URL: ${proxyUrl}`);
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
                        loadedCount++;
                        
                        // 所有卡片加载完成
                        if (loadedCount === Math.min(totalCards, shuffledImages.length)) {
                            showNotification('✨ 所有角色背景已更新完成！', 'success');
                        }
                    };
                    backgroundImg.onerror = function(e) {
                        console.log(`❌ 角色 ${character.name} 的背景图片加载失败:`, e.message);
                        console.log(`尝试的URL: ${proxyUrl}`);
                        character.backgroundImage = null;
                        updateCardTexture(i);
                        loadedCount++;
                        
                        if (loadedCount === Math.min(totalCards, shuffledImages.length)) {
                            showNotification('⚠️ 部分背景加载失败，已使用默认背景', 'warning');
                        }
                    };
                    backgroundImg.src = proxyUrl;
                }
            }
        } else {
            console.log('❌ 未能获取到图片，使用默认背景');
            showNotification('⚠️ 使用默认背景', 'warning');
        }
    } catch (error) {
        console.log('❌ 图片加载失败:', error.message);
        showNotification('⚠️ 图片加载失败，使用默认背景', 'warning');
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

// 原神人物数据，结合你的网站链接
const genshinCharacters = [
    { 
        name: '甘雨', 
        url: 'https://docker.chunkj.dpdns.org', 
        element: '冰', 
        rarity: 5, 
        color: '#4A90E2', 
        description: 'Docker加速服务',
        vision: '冰',
        weapon: '弓',
        region: '璃月',
        imageUrl: 'https://i.pixiv.re/img-original/img/2023/10/24/00/01/01/112799095_p0.jpg'
    },
    { 
        name: '胡桃', 
        url: 'https://gh-proxy.chunkj.dpdns.org', 
        element: '火', 
        rarity: 5, 
        color: '#E74C3C', 
        description: 'GitHub加速服务',
        vision: '火',
        weapon: '长柄武器',
        region: '璃月',
        imageUrl: 'https://i.imgur.com/placeholder2.jpg'
    },
    { 
        name: '雷电将军', 
        url: 'https://rss-gpt.chunkj.dpdns.org', 
        element: '雷', 
        rarity: 5, 
        color: '#9B59B6', 
        description: 'RSS智能订阅',
        vision: '雷',
        weapon: '剑',
        region: '稻妻',
        imageUrl: 'https://i.imgur.com/placeholder3.jpg'
    },
    { 
        name: '钟离', 
        url: 'https://sub-web-plus.chunkj.dpdns.org', 
        element: '岩', 
        rarity: 5, 
        color: '#F39C12', 
        description: '订阅格式转换',
        vision: '岩',
        weapon: '长柄武器',
        region: '璃月',
        imageUrl: 'https://i.imgur.com/placeholder4.jpg'
    },
    { 
        name: '魈', 
        url: 'https://supersonic.chunkj.dpdns.org', 
        element: '风', 
        rarity: 5, 
        color: '#2ECC71', 
        description: '音乐流媒体',
        vision: '风',
        weapon: '长柄武器',
        region: '璃月',
        imageUrl: 'https://i.imgur.com/placeholder5.jpg'
    },
    { 
        name: '八重神子', 
        url: 'https://docker.chunkj.us.to', 
        element: '雷', 
        rarity: 5, 
        color: '#E91E63', 
        description: '备用加速服务',
        vision: '雷',
        weapon: '法器',
        region: '稻妻',
        imageUrl: 'https://i.imgur.com/placeholder6.jpg'
    },
    { 
        name: '温迪', 
        url: 'https://gh-fast.chunkj.dpdns.org', 
        element: '风', 
        rarity: 5, 
        color: '#00BCD4', 
        description: '备用代码加速',
        vision: '风',
        weapon: '弓',
        region: '蒙德',
        imageUrl: 'https://i.imgur.com/placeholder7.jpg'
    },
    { 
        name: '刻晴', 
        url: 'https://snake.chunkj.dpdns.org', 
        element: '雷', 
        rarity: 5, 
        color: '#9C27B0', 
        description: '经典小游戏',
        vision: '雷',
        weapon: '剑',
        region: '璃月',
        imageUrl: 'https://i.imgur.com/placeholder8.jpg'
    },
    { 
        name: '迪卢克', 
        url: 'https://yang.chunkj.dpdns.org', 
        element: '火', 
        rarity: 5, 
        color: '#FF5722', 
        description: '热门消除游戏',
        vision: '火',
        weapon: '双手剑',
        region: '蒙德',
        imageUrl: 'https://i.imgur.com/placeholder9.jpg'
    },
    { 
        name: '芭芭拉', 
        url: 'https://tophub.you.hidns.vip', 
        element: '水', 
        rarity: 4, 
        color: '#2196F3', 
        description: '热点新闻聚合',
        vision: '水',
        weapon: '法器',
        region: '蒙德',
        imageUrl: 'https://i.imgur.com/placeholder10.jpg'
    },
    { 
        name: '菲谢尔', 
        url: 'https://tophub.chunkj.us.to', 
        element: '雷', 
        rarity: 4, 
        color: '#673AB7', 
        description: '备用热点服务',
        vision: '雷',
        weapon: '弓',
        region: '蒙德',
        imageUrl: 'https://i.imgur.com/placeholder11.jpg'
    },
    { 
        name: '香菱', 
        url: 'https://tv.chunkj.dpdns.org', 
        element: '火', 
        rarity: 4, 
        color: '#FF9800', 
        description: '在线电视直播',
        vision: '火',
        weapon: '长柄武器',
        region: '璃月',
        imageUrl: 'https://i.imgur.com/placeholder12.jpg'
    },
    { 
        name: '北斗', 
        url: 'https://today.chunkj.dpdns.org', 
        element: '雷', 
        rarity: 4, 
        color: '#3F51B5', 
        description: '热点备用服务',
        vision: '雷',
        weapon: '双手剑',
        region: '璃月',
        imageUrl: 'https://i.imgur.com/placeholder13.jpg'
    }
];

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

// 创建卡片纹理
function createCardTexture(character, backgroundImageUrl = null) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    
    // 第1层：始终先绘制默认渐变背景作为基础层，但更淡
    // 简化背景，减少渐变强度
    const bgGradient = ctx.createLinearGradient(0, 0, 256, 320);
    if (character.rarity === 5) {
        bgGradient.addColorStop(0, 'rgba(20, 20, 30, 0.3)'); // 极淡的背景
        bgGradient.addColorStop(1, 'rgba(10, 10, 20, 0.2)'); // 几乎透明
    } else {
        bgGradient.addColorStop(0, 'rgba(20, 20, 30, 0.25)'); // 极淡的背景
        bgGradient.addColorStop(1, 'rgba(10, 10, 20, 0.15)'); // 几乎透明
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 256, 320);
    
    // 第2层：如果有背景图片，绘制在默认背景之上，完全不透明
    if (backgroundImageUrl && character.backgroundImage) {
        try {
            // 完全不透明地绘制图片
            ctx.globalAlpha = 0.98; // 几乎完全不透明
            ctx.drawImage(character.backgroundImage, 0, 0, 256, 320);
            ctx.globalAlpha = 1.0; // 恢复完全不透明
            
            // 添加极其微弱的渐变边缘，确保文字在浅色背景上也可读
            const overlay = ctx.createRadialGradient(128, 160, 100, 128, 160, 200);
            overlay.addColorStop(0, 'rgba(0, 0, 0, 0)'); // 中心完全透明
            overlay.addColorStop(0.8, 'rgba(0, 0, 0, 0.1)'); // 边缘几乎透明
            overlay.addColorStop(1, 'rgba(0, 0, 0, 0.2)'); // 边缘稍微暗一点
            ctx.fillStyle = overlay;
            ctx.fillRect(0, 0, 256, 320);
        } catch (e) {
            console.log(`${character.name}的背景图片可能导致安全问题:`, e.message);
            // 发生错误时不做额外处理，因为默认背景已经绘制
        }
    }
    
    // 第3层：微小细节，几乎不可见
    ctx.globalAlpha = 0.05; // 极低的不透明度
    // 在边缘添加极细微的装饰点
    for (let i = 0; i < 5; i++) { // 非常少的点
        const x = Math.random() * 256;
        const y = 10 + Math.random() * 300;
        const size = Math.random() * 0.8 + 0.3; // 极小的点
        ctx.fillStyle = `rgba(255, 255, 255, 0.15)`; // 极低的不透明度
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0; // 恢复不透明度
    
    // 第4层：极简边框，几乎不可见
    ctx.strokeStyle = character.rarity === 5 ? 'rgba(255, 215, 0, 0.15)' : 'rgba(147, 112, 219, 0.15)';
    ctx.lineWidth = 2; // 很细的线宽
    ctx.globalAlpha = 0.3; // 全局降低不透明度
    ctx.strokeRect(6, 6, 244, 308);
    ctx.globalAlpha = 1.0; // 恢复不透明度
    
    // 第5层：绘制头像（简化版）
    // 绘制简单的圆形头像背景
    ctx.beginPath();
    ctx.arc(128, 60, 40, 0, Math.PI * 2);
    ctx.fillStyle = character.rarity === 5 ? 'rgba(20, 20, 40, 0.4)' : 'rgba(20, 20, 40, 0.3)';
    ctx.fill();
    
    // 添加简单的元素符号
    ctx.globalAlpha = 0.08; // 极低的不透明度
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
    
    ctx.font = '24px Arial'; // 更小的字体
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(elementSymbol, 128, 70);
    ctx.globalAlpha = 1.0; // 恢复不透明度
    
    // 第6层：文字内容（金色系，提高可读性）
    // 角色名称（淡金色）
    ctx.font = 'bold 24px Orbitron, Arial';
    const goldNameColor = 'rgba(255, 223, 150, 0.98)'; // 淡金色
    ctx.fillStyle = goldNameColor;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'; // 强阴影确保在任何背景上可读
    ctx.shadowBlur = 12; // 大阴影模糊半径
    ctx.fillText(character.name, 128, 140);
    
    // 元素/武器信息（淡蓝色）
    ctx.font = '16px Orbitron, Arial';
    const infoColor = 'rgba(180, 230, 255, 0.95)'; // 淡蓝色
    ctx.fillStyle = infoColor;
    ctx.shadowBlur = 10; // 保持较强阴影
    ctx.fillText(`${character.vision} · ${character.weapon}`, 128, 165);
    
    // 地区（浅紫色）
    ctx.font = '14px Orbitron, Arial';
    const regionColor = 'rgba(220, 190, 255, 0.9)'; // 浅紫色
    ctx.fillStyle = regionColor;
    ctx.shadowBlur = 8; // 保持较强阴影
    ctx.fillText(character.region, 128, 185);
    
    // 星级（非常微弱）
    const starY = 220;
    ctx.globalAlpha = 0.25; // 全局极低不透明度
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; // 加强星星阴影
    ctx.shadowBlur = 3; // 较小阴影模糊半径
    for (let i = 0; i < character.rarity; i++) {
        const starX = 128 - (character.rarity - 1) * 12 + i * 24;
        ctx.fillStyle = 'rgba(255, 223, 150, 0.6)'; // 淡金色星星
        ctx.font = '16px Arial'; // 更小的星星
        ctx.fillText('★', starX, starY);
    }
    ctx.globalAlpha = 1.0; // 恢复不透明度
    
    // 描述（淡金色）
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 10;
    ctx.font = '13px Orbitron, Arial';
    ctx.fillStyle = 'rgba(255, 223, 150, 0.9)'; // 淡金色，与角色名称统一
    ctx.fillText(character.description, 128, 260);
    ctx.shadowBlur = 0; // 清除阴影效果
    
    // 纯净简约风格，去除所有多余的装饰元素
    
    // 创建纹理，并确保设置crossOrigin
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    return texture;
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
        size: 4, // 增大粒子大小，使小卡片更明显
        transparent: true,
        opacity: 0.8, // 稍微提高不透明度，使其更明显
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
        const card = cards[cardIndex];
        const newTexture = createCardTexture(character, character.backgroundImageUrl);
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
        } else {
            meta.targetScale = 1;
            meta.hovered = false;
        }
        
        // 屏幕内逆时针旋转：当有卡片被悬停时停止旋转，靠近观察者时卡片最大
        let angle;
        if (window.cardsPaused) {
            // 卡片暂停时，使用暂停开始时的角度
            angle = meta.angle - (window.pauseStartTime - (window.pauseDuration || 0)) * 0.3;
        } else {
            // 正常旋转，考虑累计的暂停时间
            angle = meta.angle - (time - (window.pauseDuration || 0)) * 0.3;
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
            card.rotation.z = Math.sin(time * 6) * 0.15;
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
            // 悬停时的额外闪烁效果
            card.material.opacity = Math.min(1, depthOpacity + 0.2 + Math.sin(time * 10) * 0.1);
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

function showRandomBgPanelIfDevtools() {
    const panel = document.getElementById('background-switcher');
    if (!panel) return;
    if (isDevtoolsOpen()) {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

// 初始化时立即隐藏
(function hideRandomBgPanelOnInit() {
    const panel = document.getElementById('background-switcher');
    if (panel) panel.style.display = 'none';
})();

window.addEventListener('resize', showRandomBgPanelIfDevtools);
window.addEventListener('focus', showRandomBgPanelIfDevtools);
setTimeout(showRandomBgPanelIfDevtools, 800);

init();