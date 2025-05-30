/**
 * Cloudflare Function处理图片代理请求
 * 解决图片跨域问题
 */
export async function onRequest(context) {
  // 获取请求路径参数
  const { request, params } = context;
  const path = params.path || [];
  const fullPath = Array.isArray(path) ? path.join('/') : path;
  
  // 判断图片类型
  let targetUrl = "";
  if (request.url.includes('/image-proxy/pixiv/')) {
    // Pixiv图片代理
    targetUrl = `https://i.pixiv.re/${fullPath}`;
  } else {
    // 通用图片代理
    targetUrl = `https://i.imgur.com/${fullPath}`;
  }
  
  try {
    // 创建请求选项
    const fetchOptions = {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://www.pixiv.net/"
      }
    };
    
    // 发送请求获取图片
    const response = await fetch(targetUrl, fetchOptions);
    
    // 检查响应状态
    if (!response.ok) {
      console.error(`图片请求失败: ${response.status} ${response.statusText}`);
      return new Response(`图片请求失败: ${response.status}`, { 
        status: 404,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    
    // 读取图片数据
    const imageData = await response.arrayBuffer();
    
    // 获取原始响应的Content-Type
    const contentType = response.headers.get("Content-Type") || "image/jpeg";
    
    // 返回图片响应
    return new Response(imageData, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=1800", // 缓存30分钟
        "X-Proxy-By": "Star-Chart-Image-Proxy"
      }
    });
  } catch (error) {
    console.error(`图片代理错误: ${error.message}`);
    return new Response(`图片代理错误: ${error.message}`, { 
      status: 500,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
} 