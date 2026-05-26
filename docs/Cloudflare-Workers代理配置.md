# Cloudflare Workers 反向代理配置指南

本指南帮助你使用 Cloudflare Workers 免费代理你的 Vercel 项目，实现零成本部署。

## 前置条件

- 已在 Vercel 部署项目
- 知道你的 Vercel 项目域名（例如：`wavemod.vercel.app`）

---

## 步骤 1：注册 Cloudflare 账号

1. 访问 https://cloudflare.com
2. 点击右上角 "Sign Up"
3. 输入邮箱和密码
4. 验证邮箱

---

## 步骤 2：创建 Worker

1. 登录 Cloudflare 控制台
2. 左侧菜单找到 "Workers & Pages"
3. 点击 "Create application"
4. 选择 "Create Worker"
5. 给 Worker 起个名字，例如：`wavemod-proxy`
6. 点击 "Deploy"

---

## 步骤 3：编辑 Worker 代码

部署后会自动打开编辑器，点击右上角 "Edit Code"，替换默认代码为：

```javascript
export default {
  async fetch(request, env, ctx) {
    // 替换成你的 Vercel 项目域名
    const targetHost = "你的项目名.vercel.app";
    
    const url = new URL(request.url);
    url.host = targetHost;
    
    const modifiedRequest = new Request(url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });
    
    const response = await fetch(modifiedRequest);
    
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.delete('X-Frame-Options');
    
    return newResponse;
  },
};
```

**重要：把 `你的项目名.vercel.app` 替换成你实际的 Vercel 域名。**

---

## 步骤 4：保存并部署

1. 点击右上角 "Save and Deploy"
2. 等待部署完成（几秒钟）
3. 部署成功后会显示你的 Worker 地址，例如：

```text
https://wavemod-proxy.你的用户名.workers.dev
```

---

## 步骤 5：测试访问

在浏览器访问你的 Worker 地址，应该能看到你的 Vercel 项目页面。

---

## 步骤 6：更新 Supabase 配置

在 Supabase 控制台：

1. Authentication → URL Configuration
2. 添加 Site URL：`https://wavemod-proxy.你的用户名.workers.dev`
3. 添加 Redirect URLs：
   - `https://wavemod-proxy.你的用户名.workers.dev/auth/callback`
   - 保留原来的 Vercel 域名作为备用

---

## 步骤 7：更新 Vercel 环境变量（可选）

如果你想让 Worker 地址成为主域名：

在 Vercel 控制台：

1. Settings → Environment Variables
2. 找到 `NEXT_PUBLIC_SITE_URL`
3. 修改为：`https://wavemod-proxy.你的用户名.workers.dev`
4. 保存后会自动重新部署

---

## 完整的 Worker 代码（增强版）

如果需要更好的兼容性，可以用这个增强版：

```javascript
export default {
  async fetch(request, env, ctx) {
    const targetHost = "你的项目名.vercel.app";
    const url = new URL(request.url);
    url.host = targetHost;
    
    const modifiedRequest = new Request(url, {
      method: request.method,
      headers: request.headers,
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
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  },
};
```

---

## 预期效果

部署完成后：

```text
✓ 成本：完全免费（0 元）
✓ 部署时间：5 分钟
✓ 中国访问：大部分地区可访问
✓ 速度：比直连 Vercel 稍快
✓ 域名：xxx.workers.dev
```

---

## 注意事项

### workers.dev 域名限制

```text
⚠️ 部分地区可能被墙
⚠️ 移动网络可能不稳定
⚠️ 域名不够专业
```

### Cloudflare Workers 免费限制

```text
✓ 每天 100,000 次请求
✓ 每次请求最多 10ms CPU 时间
✓ 每次请求最多 128MB 内存
```

对于个人项目完全够用。

---

## 常见问题

### Worker 地址访问不了

可能原因：
1. workers.dev 在你的地区被墙
2. 网络问题
3. Worker 代码配置错误

解决方法：
1. 换个网络试试（WiFi / 4G / 5G）
2. 检查 Worker 代码中的 targetHost 是否正确
3. 查看 Worker 日志（在 Cloudflare 控制台）

### 登录回调失败

检查：
1. Supabase Redirect URLs 是否包含 Worker 地址
2. Worker 代码中的 targetHost 是否正确
3. Vercel 项目是否正常运行

### 图片加载慢

Worker 只代理 HTML，图片仍然走 Vercel。

优化方法：
1. 配置阿里云 OSS + CDN
2. 或者买域名 + 香港服务器

### 部分页面无法访问

可能原因：
1. Vercel 项目本身有问题
2. Worker 代理配置不完整

解决方法：
1. 先访问原 Vercel 域名确认项目正常
2. 检查 Worker 日志
3. 使用增强版 Worker 代码

---

## 后续优化

如果觉得 workers.dev 域名不稳定，可以：

### 方案 A：买便宜域名（推荐）

```text
阿里云 .xyz 域名：6-10 元/年
阿里云 .top 域名：8-15 元/年
```

买域名后可以：
1. 绑定到 Cloudflare Workers
2. 或者直接用 Cloudflare DNS + Vercel

### 方案 B：买香港服务器

```text
香港轻量服务器：24-30 元/月
```

这是最稳定的方案。

---

## 绑定自定义域名到 Worker（可选）

如果你买了域名，可以绑定到 Worker：

1. 在 Cloudflare 控制台
2. 进入你的 Worker
3. 点击 "Settings" → "Triggers"
4. 点击 "Add Custom Domain"
5. 输入你的域名（例如：`api.你的域名.com`）
6. 保存

这样就可以用自己的域名访问了。

---

## 架构图

```text
中国用户
  ↓
Cloudflare Workers（免费代理）
  ↓
Vercel（海外边缘节点）
  ↓
Next.js 应用
  ↓
┌─────────────┬────────────────┐
│ Supabase    │ 阿里云 OSS      │
│ Auth/DB     │ 图片/MOD文件     │
└─────────────┴────────────────┘
```

---

## 成本对比

| 方案 | 成本 | 中国访问速度 | 稳定性 |
|------|------|------------|--------|
| Vercel 直连 | 0 元 | 慢（300-800ms） | 一般 |
| Vercel + Workers | 0 元 | 较快（150-400ms） | 较好 |
| Vercel + 域名 | 10 元/月 | 较快（150-400ms） | 好 |
| 香港服务器 | 30 元/月 | 快（30-80ms） | 很好 |

---

## 总结

Cloudflare Workers 反向代理方案：

```text
✓ 完全免费
✓ 5 分钟搞定
✓ 不用买域名
✓ 不用备案
✓ 大部分地区可访问
✓ 比直连 Vercel 快

⚠️ workers.dev 域名部分地区不稳定
⚠️ 不如自定义域名专业
⚠️ 有免费额度限制（但够用）
```

---

## 技术支持

如遇到问题：

1. 查看 Cloudflare Workers 文档：https://developers.cloudflare.com/workers/
2. 查看 Worker 日志（在 Cloudflare 控制台）
3. 检查 Vercel 项目是否正常
4. 检查 Supabase 配置

---

## 下一步

配置完成后，你可以：

1. 分享 Worker 地址给用户测试
2. 监控 Worker 使用情况
3. 如果稳定，考虑买域名绑定
4. 如果不稳定，考虑香港服务器方案
