// Cloudflare Worker 代理代码
// 用于代理 Vercel 项目到 workers.dev 域名

export default {
  async fetch(request, env, ctx) {
    const targetHost = "你的项目名.vercel.app";
    
    const url = new URL(request.url);
    url.hostname = targetHost;
    
    const headers = new Headers(request.headers);
    headers.set('Host', targetHost);
    
    const modifiedRequest = new Request(url.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: 'follow'
    });
    
    try {
      const response = await fetch(modifiedRequest);
      const newResponse = new Response(response.body, response);
      
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.delete('X-Frame-Options');
      
      return newResponse;
    } catch (error) {
      return new Response('代理请求失败: ' + error.message, {
        status: 502,
        headers: { 
          'Content-Type': 'text/plain; charset=utf-8' 
        }
      });
    }
  },
};
