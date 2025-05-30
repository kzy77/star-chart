/**
 * Cloudflare Functions中间件
 * 处理CORS和请求日志
 */

// 中间件函数，用于处理CORS和日志
export async function onRequest(context) {
  const { request, next } = context;
  
  // 获取请求URL和路径
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 记录详细API请求日志
  console.log(`[${new Date().toISOString()}] ${request.method} ${path}`);
  
  // 记录图片代理请求的详细信息
  if (path.includes('/api/image-proxy/')) {
    const isPixiv = path.includes('/pixiv/');
    console.log(`[中间件] ${isPixiv ? 'Pixiv' : '通用'}图片代理请求: ${path}`);
    
    // 针对图片类型请求的额外日志
    const referer = request.headers.get('Referer') || 'none';
    const userAgent = request.headers.get('User-Agent') || 'none';
    console.log(`[中间件] 请求头信息: Referer=${referer.substring(0, 100)}..., UA=${userAgent.substring(0, 50)}...`);
  }
  
  // 处理OPTIONS请求（预检请求）
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "86400" // 24小时缓存预检结果
      }
    });
  }
  
  // 继续处理非OPTIONS请求
  const response = await next();
  
  // 添加CORS头部到所有响应
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  
  // 为图片类型响应设置更长的缓存时间
  if (path.includes('/api/image-proxy/')) {
    // 如果没有明确设置缓存控制，则添加缓存控制
    if (!newResponse.headers.has("Cache-Control")) {
      newResponse.headers.set("Cache-Control", "public, max-age=86400"); // 缓存1天
    }
    // 图片类型响应添加额外头部
    newResponse.headers.set("X-Proxy-By", "Star-Chart-Image-Proxy");
  }
  
  return newResponse;
} 