# Laphiny 项目守则

> 所有接入本项目的 Hermes agent（Laper、Arilphin、Derux 等）必须遵守此文件。

## 铁律：构建命令

**永远只用 `npm run web:build`，禁止直接运行 `npx expo export --platform web`。**

原因：Expo web 构建输出的路径不包含子路径前缀（如 `/_expo/...`），但项目部署在 `https://nianxxz.site/laphiny/` 下，所有资源必须带 `/laphiny/` 前缀。`npm run web:build` 内置了 Python 脚本自动替换路径。

如果忘了这一步 → 页面白屏（JS 404）。

## 部署流程

```
cd /root/laphiny
npm run web:build   # 构建 + 路径修正
# 构建完成后 dist/ 即为 web root，nginx 直接指向此目录，无需复制
```

## 部署验证（每次构建后必做）

```bash
# 1. 确认 index.html 中的路径带 /laphiny/ 前缀
grep -o 'src="[^"]*"' /root/laphiny/dist/index.html
# 预期：src="/laphiny/_expo/static/js/web/index-*.js"

# 2. 本地测试
curl -sk -o /dev/null -w '%{http_code} %{size_download}' \
  http://127.0.0.1:8080/laphiny/_expo/static/js/web/index-*.js
# 预期：200 + ~1MB

# 3. 外部测试（从服务器）
curl -sk -o /dev/null -w '%{http_code} %{size_download}' \
  https://nianxxz.site/laphiny/_expo/static/js/web/index-*.js
# 预期：200 + ~1MB
```

## 平板 nginx 配置

文件：`/etc/nginx/sites-enabled/laphiny`

关键配置：
- `root /root/laphiny/dist;`
- `rewrite ^/laphiny/(.*) /$1 break;` — 剥离 `/laphiny/` 前缀使文件路径匹配 filesystem
- API 代理：`/hermes-api/ → 127.0.0.1:8642`，`/laper-api/ → 127.0.0.1:8642`，`/arilphin-api/ → 127.0.0.1:8644`

修改后：`nginx -t && nginx -s reload`

## 服务器 nginx 配置

文件：`/etc/nginx/conf.d/nianxxz-ssl.conf`

```
location ^~ /laphiny/ {
    proxy_pass http://127.0.0.1:8680;  # → frp laphiny-web 隧道 → 平板 8080
    proxy_set_header Host $host;
    proxy_set_header Origin "";
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```

## frp 隧道

平板 frpc：`laphiny-web` → 服务器 frps 端口 8680

## 分支与协作

- 主分支：`main`，已开启保护（禁止 force push / 分支删除）
- 流程：Laper 开发 → 提 PR → Flor 审阅 → squash merge → 构建上线
- 详见 `flor-laper-code-review-workflow` skill

## 群聊系统提示

群聊中每个 member 收到的 system prompt 由 `App.tsx` 的 `buildChatHistory` / `buildChatHistoryForDelegation` 函数注入。修改群聊行为规则时改这两个函数，不要分发给各 agent 的 skill 文件。
