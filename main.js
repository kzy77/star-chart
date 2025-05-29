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
                // 添加新图片到缓存，避免重复
                const newImages = result.data.filter(img => 
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

        const response = await fetch('https://api.mossia.top/duckMo/x', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                num: 20, // 固定请求最大数量
                ...(dateAfter && { dateAfter }),
                ...(dateBefore && { dateBefore })
            })
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.log('⚠️ API 请求过于频繁，切换到备用图片...');
                return { success: true, data: Array(num).fill().map(() => ({
                    url: getFallbackImageUrl(),
                    pictureUrl: getFallbackImageUrl(),
                    xCreateDate: Date.now()
                }))};
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (!result.success) {
            console.log('❌ DuckMo API 请求失败:', result.message);
            return null;
        }

        return result;
    } catch (error) {
        console.log('❌ DuckMo API 请求失败:', error.message);
        return null;
    }
}

// 从随机图片API获取图片URL
async function getRandomImageUrl() {
    try {
        // 默认优先使用Pixiv反代
        const pixivUrl = await getDuckMoImageWithProxy();
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
        const currentCardCount = cards.length;
        
        // 从缓存获取图片
        const cachedImages = await imageCache.getImages(currentCardCount);
        
        if (cachedImages && cachedImages.length > 0) {
            const randomImageData = cachedImages[Math.floor(Math.random() * cachedImages.length)];
            
            if (randomImageData.pictureUrl) {
                // 使用反代服务来避免CORS和防盗链问题
                const proxyUrl = randomImageData.pictureUrl.replace('https://i.pixiv.re/', 'https://i.pixiv.cat/');
                console.log(`🎨 获取到Pixiv图片: ${randomImageData.url}`);
                console.log(`📅 创建时间: ${new Date(randomImageData.xCreateDate).toLocaleString()}`);
                return proxyUrl;
            }
        }
        return null;
    } catch (error) {
        console.log('❌ DuckMo API请求失败:', error.message);
        return null;
    }
}

// 设置随机背景图片
async function setRandomBackground() {
    let selectedImage = await getRandomImageUrl();
    let corsAttempted = false;
    
    // 显示加载提示
    console.log('正在加载新背景...');
    
    function loadBackgroundImage(withCors = true) {
        // 创建背景图片元素
        const bgImage = new Image();
        
        // 设置crossOrigin以避免canvas污染（如果需要）
        if (withCors) {
            bgImage.crossOrigin = 'anonymous';
        }
        
        bgImage.onload = function() {
            // 淡入效果
            document.body.style.transition = 'background-image 0.8s ease-in-out';
            
            // 应用背景图片
            document.body.style.backgroundImage = `url(${selectedImage})`;
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
            
            // 延迟显示覆盖层
            setTimeout(() => {
                overlay.style.opacity = '1';
            }, 100);
            
            console.log('✨ 随机背景已更换!');
            
            // 显示切换成功提示
            showNotification('🌌 背景已切换！', 'success');
        };
        
        bgImage.onerror = function() {
            console.log(`❌ 背景图片加载失败${withCors ? '(CORS)' : ''}，尝试下一张...`);
            
            // 如果是CORS错误且还没有尝试过不设置CORS，则重试
            if (withCors && !corsAttempted) {
                corsAttempted = true;
                console.log('🔄 尝试不设置CORS重新加载...');
                loadBackgroundImage(false);
                return;
            }
            
            showNotification('⚠️ 背景加载失败，重试中...', 'warning');
            
            // 多次重试机制
            let retryCount = 0;
            const maxRetries = 3;
            
            function retryLoad() {
                retryCount++;
                if (retryCount <= maxRetries) {
                    console.log(`🔄 第${retryCount}次重试...`);
                    getRandomImageUrl().then(newUrl => {
                        selectedImage = newUrl;
                        corsAttempted = false; // 重置CORS尝试标志
                        loadBackgroundImage(true);
                    });
                    return; // 避免执行下面的代码
                } else {
                    console.log('❌ 达到最大重试次数，使用默认渐变背景');
                    showNotification('使用默认背景', 'info');
                    // 设置默认渐变背景
                    document.body.style.background = `
                        linear-gradient(135deg, 
                            #667eea 0%, 
                            #764ba2 25%, 
                            #f093fb 50%, 
                            #f5576c 75%, 
                            #4facfe 100%
                        )
                    `;
                }
            }
            
            setTimeout(() => {
                retryLoad();
            }, 1000);
        };
        
        bgImage.src = selectedImage;
    }
    
    // 开始加载背景图片
    loadBackgroundImage(true);
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
    
    let loadedCount = 0;
    const totalCards = genshinCharacters.length;
    
    for (let i = 0; i < genshinCharacters.length; i++) {
        const character = genshinCharacters[i];
        // 为每个角色分配新的随机背景图片
        const newBackgroundImageUrl = await getRandomImageUrl();
        character.backgroundImageUrl = newBackgroundImageUrl;
        
        // 预加载新的背景图片
        const backgroundImg = new Image();
        // 设置crossOrigin以避免canvas污染
        backgroundImg.crossOrigin = 'anonymous';
        backgroundImg.onload = function() {
            character.backgroundImage = backgroundImg;
            updateCardTexture(i);
            loadedCount++;
            
            // 所有卡片加载完成
            if (loadedCount === totalCards) {
                showNotification('✨ 所有角色背景已更新完成！', 'success');
            }
        };
        backgroundImg.onerror = function() {
            console.log(`角色 ${character.name} 的背景图片加载失败，使用默认背景`);
            // 尝试重新获取不同的图片
            let retryCount = 0;
            function retryCardBackground() {
                retryCount++;
                if (retryCount <= 2) {
                    console.log(`🔄 为${character.name}重试背景图片加载...`);
                    getRandomImageUrl().then(newBgUrl => {
                        character.backgroundImageUrl = newBgUrl;
                        backgroundImg.src = newBgUrl;
                    });
                } else {
                    console.log(`❌ ${character.name}的背景图片多次加载失败，使用默认背景`);
                    character.backgroundImage = null;
                    updateCardTexture(i);
                    loadedCount++;
                    
                    if (loadedCount === totalCards) {
                        showNotification('⚠️ 部分背景加载失败，已使用默认背景', 'warning');
                    }
                }
            }
            setTimeout(retryCardBackground, 500);
        };
        backgroundImg.src = newBackgroundImageUrl;
    }
}

// 将刷新函数暴露到全局作用域
window.refreshAllCardBackgrounds = refreshAllCardBackgrounds;

// 创建默认卡片背景
function createDefaultCardBackground(ctx, character) {
    const bgGradient = ctx.createRadialGradient(128, 160, 50, 128, 160, 200);
    if (character.rarity === 5) {
        bgGradient.addColorStop(0, character.color + 'FF');
        bgGradient.addColorStop(0.3, '#FFD700DD');
        bgGradient.addColorStop(0.6, '#8A2BE2BB');
        bgGradient.addColorStop(1, '#0a0a1a');
    } else {
        bgGradient.addColorStop(0, character.color + 'FF');
        bgGradient.addColorStop(0.4, '#9370DBDD');
        bgGradient.addColorStop(1, '#0a0a1a');
    }
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 256, 320);
}

// 原神人物数据，结合你的网站链接
const genshinCharacters = [
    { 
        name: '甘雨', 
        url: 'https://docker-hub.chunkj.dpdns.org', 
        element: '冰', 
        rarity: 5, 
        color: '#4A90E2', 
        description: 'Docker加速服务',
        vision: '冰',
        weapon: '弓',
        region: '璃月',
        imageUrl: 'https://i.imgur.com/placeholder1.jpg'
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
        url: 'https://docker-fast.chunkj.dpdns.org', 
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
    
    // 星空背景
    const bgGradient = ctx.createRadialGradient(60, 60, 20, 60, 60, 60);
    bgGradient.addColorStop(0, character.color + 'FF');
    bgGradient.addColorStop(0.6, character.color + 'AA');
    bgGradient.addColorStop(1, '#0a0a1a');
    
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.arc(60, 60, 60, 0, Math.PI * 2);
    ctx.fill();
    
    // 添加星星点缀
    for (let i = 0; i < 15; i++) {
        const x = 10 + Math.random() * 100;
        const y = 10 + Math.random() * 100;
        const size = Math.random() * 2 + 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.8 + 0.2})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 发光外圈
    ctx.strokeStyle = character.color;
    ctx.lineWidth = 4;
    ctx.shadowColor = character.color;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(60, 60, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // 内圈装饰
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(60, 60, 48, 0, Math.PI * 2);
    ctx.stroke();
    
    // 元素符号背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.arc(60, 60, 35, 0, Math.PI * 2);
    ctx.fill();
    
    // 元素符号
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
    
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(elementSymbol, 60, 70);
    
    // 角落星级装饰
    if (character.rarity === 5) {
        ctx.fillStyle = '#FFD700';
        ctx.font = '12px Arial';
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const x = 60 + Math.cos(angle) * 45;
            const y = 60 + Math.sin(angle) * 45;
            ctx.fillText('★', x, y);
        }
    } else {
        ctx.fillStyle = '#9370DB';
        ctx.font = '10px Arial';
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
    
    // 如果有背景图片，先绘制背景图片
    if (backgroundImageUrl && character.backgroundImage) {
        try {
            // 检查图片是否会导致canvas污染
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 1;
            testCanvas.height = 1;
            const testCtx = testCanvas.getContext('2d');
            testCtx.drawImage(character.backgroundImage, 0, 0, 1, 1);
            // 尝试获取图像数据，如果失败说明canvas被污染了
            testCtx.getImageData(0, 0, 1, 1);
            
            // 绘制背景图片
            ctx.drawImage(character.backgroundImage, 0, 0, 256, 320);
            
            // 添加半透明的角色主题色覆盖层
            const overlay = ctx.createRadialGradient(128, 160, 50, 128, 160, 200);
            if (character.rarity === 5) {
                overlay.addColorStop(0, character.color + '66');
                overlay.addColorStop(0.3, '#FFD70044');
                overlay.addColorStop(0.6, '#8A2BE244');
                overlay.addColorStop(1, '#0a0a1a99');
            } else {
                overlay.addColorStop(0, character.color + '66');
                overlay.addColorStop(0.4, '#9370DB44');
                overlay.addColorStop(1, '#0a0a1a99');
            }
            ctx.fillStyle = overlay;
            ctx.fillRect(0, 0, 256, 320);
        } catch (e) {
            console.log(`${character.name}的背景图片可能导致安全问题，使用默认渐变背景:`, e.message);
            // 回退到原来的渐变背景
            createDefaultCardBackground(ctx, character);
        }
    } else {
        // 创建默认渐变背景
        createDefaultCardBackground(ctx, character);
    }
    
    // 添加更多星空背景纹理
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 320;
        const size = Math.random() * 3 + 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.8 + 0.2})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 添加流星效果
    for (let i = 0; i < 3; i++) {
        const startX = Math.random() * 256;
        const startY = Math.random() * 100;
        const endX = startX + 30 + Math.random() * 50;
        const endY = startY + 20 + Math.random() * 30;
        
        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    
    // 添加元素主题装饰
    ctx.globalAlpha = 0.3;
    let decorPattern = '';
    switch(character.vision) {
        case '冰':
            // 冰晶图案
            for (let i = 0; i < 8; i++) {
                const x = 20 + Math.random() * 216;
                const y = 20 + Math.random() * 280;
                ctx.fillStyle = '#87CEEB';
                ctx.font = '16px Arial';
                ctx.fillText('❄', x, y);
            }
            break;
        case '火':
            // 火焰图案
            for (let i = 0; i < 6; i++) {
                const x = 20 + Math.random() * 216;
                const y = 20 + Math.random() * 280;
                ctx.fillStyle = '#FF6347';
                ctx.font = '14px Arial';
                ctx.fillText('🔥', x, y);
            }
            break;
        case '雷':
            // 闪电图案
            for (let i = 0; i < 5; i++) {
                const x = 20 + Math.random() * 216;
                const y = 20 + Math.random() * 280;
                ctx.fillStyle = '#9370DB';
                ctx.font = '18px Arial';
                ctx.fillText('⚡', x, y);
            }
            break;
        case '岩':
            // 岩石图案
            for (let i = 0; i < 4; i++) {
                const x = 20 + Math.random() * 216;
                const y = 20 + Math.random() * 280;
                ctx.fillStyle = '#DAA520';
                ctx.font = '16px Arial';
                ctx.fillText('🗿', x, y);
            }
            break;
        case '风':
            // 风之图案
            for (let i = 0; i < 7; i++) {
                const x = 20 + Math.random() * 216;
                const y = 20 + Math.random() * 280;
                ctx.fillStyle = '#40E0D0';
                ctx.font = '14px Arial';
                ctx.fillText('💨', x, y);
            }
            break;
        case '水':
            // 水滴图案
            for (let i = 0; i < 6; i++) {
                const x = 20 + Math.random() * 216;
                const y = 20 + Math.random() * 280;
                ctx.fillStyle = '#4169E1';
                ctx.font = '14px Arial';
                ctx.fillText('💧', x, y);
            }
            break;
    }
    ctx.globalAlpha = 1;
    
    // 发光边框
    ctx.strokeStyle = character.rarity === 5 ? '#FFD700' : '#9370DB';
    ctx.lineWidth = 6;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 20;
    ctx.strokeRect(6, 6, 244, 308);
    ctx.shadowBlur = 0;
    
    // 双重边框效果
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 236, 300);
    
    // 绘制默认头像
    const avatarCanvas = createDefaultAvatar(character);
    ctx.drawImage(avatarCanvas, 88, 20, 80, 80);
    
    // 添加更强的发光效果到头像
    ctx.strokeStyle = character.color;
    ctx.lineWidth = 4;
    ctx.shadowColor = character.color;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(128, 60, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // 角色名称
    ctx.font = 'bold 22px Orbitron, Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(character.name, 128, 140);
    
    // 元素/武器信息
    ctx.font = '16px Orbitron, Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(`${character.vision} · ${character.weapon}`, 128, 165);
    
    // 地区
    ctx.font = '14px Orbitron, Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(character.region, 128, 185);
    
    // 星级
    const starY = 220;
    for (let i = 0; i < character.rarity; i++) {
        const starX = 128 - (character.rarity - 1) * 12 + i * 24;
        ctx.fillStyle = '#FFD700';
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        ctx.font = '20px Arial';
        ctx.fillText('★', starX, starY);
    }
    ctx.shadowBlur = 0;
    
    // 描述
    ctx.font = '13px Orbitron, Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(character.description, 128, 260);
    
    // 装饰元素
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 280);
    ctx.lineTo(216, 280);
    ctx.stroke();
    
    // 左上角
    ctx.fillRect(6, 6, 30, 6);
    ctx.fillRect(6, 6, 6, 30);
    ctx.fillRect(12, 12, 15, 3);
    ctx.fillRect(12, 12, 3, 15);
    
    // 右上角
    ctx.fillRect(220, 6, 30, 6);
    ctx.fillRect(244, 6, 6, 30);
    ctx.fillRect(229, 12, 15, 3);
    ctx.fillRect(241, 12, 3, 15);
    
    // 左下角
    ctx.fillRect(6, 308, 30, 6);
    ctx.fillRect(6, 284, 6, 30);
    ctx.fillRect(12, 299, 15, 3);
    ctx.fillRect(12, 287, 3, 15);
    
    // 右下角
    ctx.fillRect(220, 308, 30, 6);
    ctx.fillRect(244, 284, 6, 30);
    ctx.fillRect(229, 299, 15, 3);
    ctx.fillRect(241, 287, 3, 15);
    
    return new THREE.CanvasTexture(canvas);
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

// 创建卡片
async function createCards() {
    const cardWidth = 24;
    const cardHeight = 30;
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.15; // 进一步缩小基础半径，确保完整轨迹可见
    
    console.log('🎨 开始为角色加载随机背景图片...');
    
    let loadedCount = 0;
    const totalCards = genshinCharacters.length;
    
    for (let i = 0; i < genshinCharacters.length; i++) {
        const character = genshinCharacters[i];
        // 为每个角色分配随机背景图片
        const backgroundImageUrl = await getRandomImageUrl();
        character.backgroundImageUrl = backgroundImageUrl;
        
        // 预加载背景图片
        const backgroundImg = new Image();
        // 设置crossOrigin以避免canvas污染
        backgroundImg.crossOrigin = 'anonymous';
        backgroundImg.onload = function() {
            character.backgroundImage = backgroundImg;
            // 背景图片加载完成后重新创建纹理
            updateCardTexture(i);
        };
        backgroundImg.onerror = function() {
            console.log(`角色 ${character.name} 的背景图片加载失败，使用默认背景`);
            // 尝试重新获取不同的图片
            let retryCount = 0;
            function retryCardBackground() {
                retryCount++;
                if (retryCount <= 2) {
                    console.log(`🔄 为${character.name}重试背景图片加载...`);
                    getRandomImageUrl().then(newBgUrl => {
                        character.backgroundImageUrl = newBgUrl;
                        backgroundImg.src = newBgUrl;
                    });
                } else {
                    console.log(`❌ ${character.name}的背景图片多次加载失败，使用默认背景`);
                    character.backgroundImage = null;
                    updateCardTexture(i);
                    loadedCount++;
                    
                    if (loadedCount === totalCards) {
                        showNotification('⚠️ 部分背景加载失败，已使用默认背景', 'warning');
                    }
                }
            }
            setTimeout(retryCardBackground, 500);
        };
        backgroundImg.src = backgroundImageUrl;
        
        const geometry = new THREE.PlaneGeometry(cardWidth, cardHeight);
        const texture = createCardTexture(character, backgroundImageUrl);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        const card = new THREE.Mesh(geometry, material);
        
        // 3D椭圆轨迹，突出由远及近的视觉效果
        const angle = (i / genshinCharacters.length) * Math.PI * 2;
        const cardX = Math.cos(angle) * radius * 2.0; // 按图片要求，进一步扩大水平椭圆
        const cardZ = Math.sin(angle) * radius * 0.25; // 按图片要求，更扁平的椭圆
        
        card.position.set(cardX, 0, cardZ);
        
        // 设置初始朝向
        const initialAngle = angle;
        if (initialAngle >= Math.PI * 0.3 && initialAngle <= Math.PI * 0.7) {
            // 顶部区域正面朝向观察者
            card.rotation.set(0, 0, 0);
        } else {
            // 其他位置稍微朝向中心
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

async function init() {
    // 设置随机背景图片
    await setRandomBackground();
    
    // 初始化卡片旋转状态
    window.cardsPaused = false;
    window.pauseDuration = 0;
    window.hasShownPauseHint = false;
    
    // 场景
    scene = new THREE.Scene();
    
    // 相机
    // 计算最大卡片高度
    const cardHeight = 30;
    const maxScale = 2.6;
    const maxCardHeight = cardHeight * maxScale;
    // 计算椭圆轨迹最大半径
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.15;
    // 再次缩短相机距离
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
    await createCards();
    createParticleSystem();
    
    // 延迟显示音效启动提示
    setTimeout(() => {
        showNotification('🎵 点击任意地方启用音效！', 'info');
    }, 2000);
    
    // 显示API更新通知
    setTimeout(() => {
        showNotification('🛡️ 已优化为最安全的无跨域API！', 'success');
    }, 4000);
    
    // 事件监听
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('click', onClick);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousemove', createStarTrail);
    
    animate();
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
            meta.targetScale = 1.4;
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
        if (angleNormalized >= Math.PI * 0.3 && angleNormalized <= Math.PI * 0.7) {
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
            card.rotation.z = Math.sin(time * 6) * 0.15;
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