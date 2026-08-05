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
- `supabase/04_carts_and_tracking.sql` — 登录用户购物车持久化（carts 表）+ 订单物流单号字段，跟 03 一样是幂等的，直接执行
- `supabase/05_multi_image_products.sql` — 商品支持多张图片（images 字段），同样幂等直接执行
- `supabase/02_seed_products.sql` — 默认 60 款商品的种子数据，建完表之后跑一次
- `scripts/` — 生成种子 SQL 用的脚本，正常使用用不到
- `legacy-dc/` — 最早从 Claude Design 导出的版本，仅存档

## 上线需要的账号

网站依赖三个外部服务，每个都要注册账号（免费额度都够小店用），把关键信息填进 `.env`（本地）和 Netlify 后台的环境变量里（线上）：

1. **Supabase**（数据库 + 登录）
   - 打开 supabase.com 注册，新建一个 Project
   - Project Settings → API：复制 `Project URL` 和 `anon public` key
   - SQL Editor：依次粘贴执行 `supabase/01_schema.sql`、`supabase/02_seed_products.sql`、`supabase/03_customer_accounts_and_admin_roles.sql`、`supabase/04_carts_and_tracking.sql`、`supabase/05_multi_image_products.sql`
     - 执行 03 之前，把文件里 `insert into admins (user_id) select id from auth.users where email = '你的管理员邮箱@example.com'` 这行的邮箱换成你后台登录用的邮箱
   - Authentication → Users → Add User：手动建一个管理员账号（邮箱+密码），这就是登录后台用的账号（记得也要在上面那步把它加进 `admins` 白名单，不然改完权限后台反而进不去）
   - **客户 Google 一键登录**（可选，不配也不影响邮箱验证码登录）：
     1. 去 Google Cloud Console 建一个 OAuth 2.0 客户端（Web application 类型）
     2. 在 Supabase 项目的 URL（Project Settings → API → 里能看到）后面加 `/auth/v1/callback`，填到 Google OAuth 客户端的"已获授权的重定向 URI"里
     3. 拿到 Google 的 Client ID 和 Client Secret，粘贴到 Supabase 后台 Authentication → Providers → Google，打开开关
   - **客户邮箱验证码登录，让发件人显示为 beautychoicebymm@gmail.com**（可选，不配的话默认用 Supabase 自带的发信地址，功能一样能用，只是发件人不是你的邮箱）：
     1. 去 Google 账号安全设置开启两步验证，然后生成一个"应用专用密码"（App Password）——**这个密码只能你自己在 Google 后台生成、只能你自己填进 Supabase，不要发给任何人（包括我）**
     2. Supabase 后台 Authentication → Settings → SMTP Settings，打开 Custom SMTP，host 填 `smtp.gmail.com`，端口 465，用户名填 `beautychoicebymm@gmail.com`，密码填上一步生成的应用专用密码
     3. Authentication → Email Templates → Magic Link，确认模板里包含 `{{ .Token }}`（这样邮件里才会有 6 位数验证码，不只是一个点击链接）

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
- **测试期运费设为 0**（`src/main.js` 里 `SHIPPING_FLAT`），正式上线前记得改回来。
- **客户账号**：Google 登录或邮箱验证码登录，登录后可以在"我的账号"页看自己的历史订单。谁是后台管理员由 `admins` 表决定（不是"只要登录就是管理员"），新增管理员需要在 Supabase SQL Editor 里手动把对应邮箱的 `user_id` 加进 `admins` 表。
- **购物车持久化**：登录用户的购物车会自动同步进 `carts` 表，换设备/刷新页面/退出重登都不会丢；未登录访客的购物车还是只存在当前会话里，不会持久化。
- **物流单号**：后台"订单管理"每个订单卡片下面有个输入框可以填物流单号，填完客户在"我的订单"页就能看到。
- **商品多图**：后台商品行点"详情"能管理一个商品的所有图片（增删、设封面），前台商品详情页会显示缩略图切换。第一张图是封面图，首页/商店的商品卡片只显示封面图。
- **服务条款/隐私政策是 AI 起草的初稿**（`src/legal-content.js`），参考了你提供的模板，替换成了 beautychoice 的实际情况（Netlify 托管、PayPal 收款、Supabase 存储、Manitoba/Canada 法律管辖）。这不是律师审核过的文件，正式当作法律文件依赖之前，建议找一个熟悉加拿大/Manitoba 消费者保护和隐私法规（PIPEDA）的律师看一遍，尤其是退换货条款那部分——目前写的是"拆封/使用过的商品不接受退换，到货损坏7天内联系我们"，这是我按美甲这类贴身佩戴商品的常见做法猜的，不代表这就是你想要的政策，需要你确认或修改。
- 目前只做了英文版服务条款/隐私政策（法律文本没有做中/法文翻译）——法律文件的翻译准确性要求很高，错译风险不小，所以没有像其他页面一样做三语，这两页无论切换到哪个语言都显示英文正文。
