/**
 * Cloudflare Function处理DuckMo API请求
 * 解决405 Method Not Allowed错误
 */
export async function onRequest(context) {
  // 获取请求方法和请求体
  const { request } = context;
  const method = request.method;
  
  // 设置目标API URL
  const targetUrl = "https://api.mossia.top/duckMo";
  
  try {
    // 读取请求体（如果有）
    let requestBody = null;
    if (method === "POST") {
      requestBody = await request.json();
    }
    
    // 构建请求选项
    const fetchOptions = {
      method: method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Cloudflare-Worker",
      }
    };
    
    // 如果是POST请求，添加请求体
    if (method === "POST" && requestBody) {
      fetchOptions.body = JSON.stringify(requestBody);
    }
    
    // 发送请求到目标API
    const response = await fetch(targetUrl, fetchOptions);
    
    // 检查响应状态
    if (!response.ok) {
      // 如果状态不是2xx，记录错误日志并返回错误信息
      console.error(`API请求失败: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({
          success: false,
          message: `API请求失败: ${response.status} ${response.statusText}`,
          fallback: true
        }),
        {
          status: 200, // 我们返回200而不是传递错误状态，以避免前端处理复杂性
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        }
      );
    }
    
    // 读取API响应
    const data = await response.json();
    
    // 返回成功响应
    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  } catch (error) {
    // 处理任何错误
    console.error(`代理请求出错: ${error.message}`);
    return new Response(
      JSON.stringify({
        success: false,
        message: `代理请求出错: ${error.message}`,
        fallback: true
      }),
      {
        status: 200, // 我们返回200以允许前端正常处理
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      }
    );
  }
} 