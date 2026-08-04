# beautychoice

穿戴甲电商网站。原生 HTML/CSS/JS（无前端框架），数据库/登录用 Supabase，收款用 PayPal，联系表单用 Formspree，部署在 Netlify。

## 本地开发

```bash
npm install
cp .env.example .env   # 然后把 .env 里的值填成真实的
npm run dev
```

前台 http://localhost:5173，后台 http://localhost:5173/admin.html。

## 构建

```bash
npm run build   # 产物在 dist/
```

## 目录结构

- `index.html` + `src/main.js` — 前台
- `admin.html` + `src/admin.js` — 后台（商品管理 + 订单管理，需要登录）
- `src/products-data.js` — 静态内容：甲型分类 + 三语文案
- `src/products-api.js` / `src/orders-api.js` — 读写 Supabase 的商品/订单数据
- `src/supabase-client.js` / `src/paypal.js` / `src/formspree.js` — 三个外部服务的接入封装
- `public/assets/products/` — 60 张默认商品实拍图（静态文件，不在数据库里）
- `supabase/01_schema.sql` — 建表 + 权限策略，第一次上线前在 Supabase SQL Editor 里跑一次
- `supabase/02_seed_products.sql` — 默认 60 款商品的种子数据，建完表之后跑一次
- `scripts/` — 生成种子 SQL 用的脚本，正常使用用不到
- `legacy-dc/` — 最早从 Claude Design 导出的版本，仅存档

## 上线需要的账号

网站依赖三个外部服务，每个都要注册账号（免费额度都够小店用），把关键信息填进 `.env`（本地）和 Netlify 后台的环境变量里（线上）：

1. **Supabase**（数据库 + 后台登录）
   - 打开 supabase.com 注册，新建一个 Project
   - Project Settings → API：复制 `Project URL` 和 `anon public` key
   - SQL Editor：依次粘贴执行 `supabase/01_schema.sql`、`supabase/02_seed_products.sql`
   - Authentication → Users → Add User：手动建一个管理员账号（邮箱+密码），这就是登录后台用的账号

2. **PayPal**（真实收款）
   - developer.paypal.com 登录（没有 PayPal 账号就先注册一个）
   - My Apps & Credentials → Create App，先用 **Sandbox** 环境测试，拿到 Client ID
   - 测试没问题后，切到 **Live** 环境再建一个 App，拿到正式 Client ID 替换测试用的

3. **Formspree**（联系表单）
   - formspree.io 注册，New Form
   - 拿到表单地址 `https://formspree.io/f/xxxxxxx` 里的那串 ID

4. **Netlify**（部署托管）
   - netlify.com 注册（可以直接用 GitHub 账号登录）
   - Site settings → Environment variables：把 `.env.example` 里那几个变量填进去（用 Live/正式的 key，不是测试用的）
   - 部署方式见下面

## 部署到 Netlify

两种方式都可以：

- **拖拽部署**（最简单，适合先上线看看）：本地跑 `npm run build`，把生成的 `dist/` 文件夹直接拖到 Netlify 后台的 "Deploys" 页面。以后每次更新代码，重新 build 再拖一次。
- **连接 Git 仓库**（推荐，长期维护更省心）：把这个项目推到 GitHub，Netlify 里 "Import from Git" 连上这个仓库，Build command 填 `npm run build`，Publish directory 填 `dist`。以后 push 代码会自动重新部署。

## 说明与限制

- 订单目前没有自动发确认邮件给客户（没接邮件服务），下单成功页只显示确认信息，实际发货需要店主自己在后台"订单管理"里看。
- PayPal 走的是客户端直接下单确认（没有服务端二次校验订单金额），对小店够用，但严格来说不如带后端验证的方案防作弊。
- 商品图片上传后存在 Supabase Storage 的 `product-images` 桶里，是公开可读的。
