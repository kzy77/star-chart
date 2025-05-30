/**
 * Cloudflare Function处理Pixiv图片代理请求
 * 专门处理Pixiv图片，添加正确的Referer头
 */
export async function onRequest(context) {
  // 获取请求路径参数
  const { request, params, env } = context;
  const path = params.path || [];
  const fullPath = Array.isArray(path) ? path.join('/') : path;
  
  // 构建Pixiv反代URL
  let targetUrl = `https://i.pixiv.re/${fullPath}`;
  
  // 添加请求调试日志
  console.log(`[Pixiv代理] 处理请求: ${fullPath}`);
  console.log(`[Pixiv代理] 目标URL: ${targetUrl}`);
  
  try {
    // 创建请求选项，添加必要的头信息
    const fetchOptions = {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://www.pixiv.net/", // Pixiv需要此Referer头
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Cache-Control": "no-cache"
      }
    };
    
    // 发送请求获取图片
    const response = await fetch(targetUrl, fetchOptions);
    
    // 检查响应状态
    if (!response.ok) {
      console.error(`[Pixiv代理] 图片请求失败: ${response.status} ${response.statusText}`);
      
      // 尝试备用格式和备用服务
      // 备用尝试1: 检查是否是master1200格式，尝试转换为原始格式
      if (fullPath.includes('_master1200.jpg')) {
        console.log(`[Pixiv代理] 尝试备用原始格式`);
        let backupPath = fullPath.replace('_master1200.jpg', '.jpg');
        let backupUrl = `https://i.pixiv.re/${backupPath}`;
        
        console.log(`[Pixiv代理] 备用URL 1: ${backupUrl}`);
        const backupResponse1 = await fetch(backupUrl, fetchOptions);
        
        if (backupResponse1.ok) {
          console.log(`[Pixiv代理] 备用原始格式成功!`);
          return createImageResponse(backupResponse1);
        }
        
        // 备用尝试2: 尝试pximg.net原始域名
        // 例如：从 img-master/img/2024/06/30/08/47/53/120104287_p1_master1200.jpg
        // 转为：https://i.pximg.net/img-original/img/2024/06/30/08/47/53/120104287_p1.jpg
        if (fullPath.includes('img-master')) {
          console.log(`[Pixiv代理] 尝试pximg.net原始域名`);
          
          // 获取路径中关键部分
          const pathMatch = fullPath.match(/img\/(.+?)\/(\d+)_p\d+_master1200\.jpg/);
          if (pathMatch) {
            const datePath = pathMatch[1]; // 例如 2024/06/30/08/47/53
            const imageId = pathMatch[2]; // 例如 120104287
            const pMatch = fullPath.match(/_p(\d+)_master1200\.jpg/);
            const pNum = pMatch ? pMatch[1] : "0"; // 获取p数字，默认p0
            
            const originalPath = `img-original/img/${datePath}/${imageId}_p${pNum}.jpg`;
            const pxImgUrl = `https://i.pximg.net/${originalPath}`;
            
            console.log(`[Pixiv代理] 备用URL 2 (pximg): ${pxImgUrl}`);
            const backupResponse2 = await fetch(pxImgUrl, {
              ...fetchOptions,
              headers: {
                ...fetchOptions.headers,
                "Referer": "https://www.pixiv.net/"
              }
            });
            
            if (backupResponse2.ok) {
              console.log(`[Pixiv代理] pximg.net原始域名成功!`);
              return createImageResponse(backupResponse2);
            }
          }
        }
      }
      
      // 备用尝试3: 如果是短路径格式(只有ID)，尝试查找完整路径
      if (!fullPath.includes('/') && fullPath.match(/^\d+_p\d+(_master1200)?\.jpg$/)) {
        console.log(`[Pixiv代理] 检测到短路径格式，尝试推断完整路径`);
        // 这里可以实现查询或推断完整路径的逻辑
        // 由于没有数据库，这里只是示例
      }
      
      // 如果所有尝试都失败，返回错误响应
      return new Response(`Pixiv图片请求失败: ${response.status} ${response.statusText}，路径: ${fullPath}`, {
        status: response.status,
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
        }
      });
    }
    
    // 成功获取图片，返回代理响应
    return createImageResponse(response);
  } catch (error) {
    console.error(`[Pixiv代理] 处理错误:`, error);
    
    // 返回友好的错误响应
    return new Response(`图片代理失败: ${error.message}，路径: ${fullPath}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    });
  }
}

// 辅助函数：创建图片响应
function createImageResponse(originalResponse) {
  // 获取原始响应的头部
  const headers = new Headers(originalResponse.headers);
  
  // 设置CORS和缓存相关头部
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Cache-Control", "public, max-age=86400"); // 缓存1天
  
  // 返回带有修改过的头部的新响应
  return new Response(originalResponse.body, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers
  });
} 