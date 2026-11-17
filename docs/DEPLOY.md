# 部署到 GitHub Pages

目标：把应用发布成一个公开网址，任何人点开就能用自己的材料测试，彼此数据互不可见（因为每个人的数据只在自己的浏览器内存里）。

按顺序做完下面五节，大约 10 分钟。

---

## 一、需要上传哪些东西

仓库根目录下必须存在这些文件，缺一个 Actions 就会构建失败：

| 路径 | 作用 | 必需 |
|---|---|---|
| `index.html` | 页面入口 | 是 |
| `package.json` | 依赖与脚本 | 是 |
| `package-lock.json` | 锁定依赖版本，`npm ci` 依赖它 | **是** |
| `tsconfig.json` | TypeScript 配置 | 是 |
| `vite.config.ts` | 构建配置（`base: './'` 就在这里） | 是 |
| `src/` | 全部源码 | 是 |
| `.github/workflows/deploy.yml` | 自动构建部署的工作流 | 是 |
| `tests/` | 单测，工作流里会先跑，不过就不部署 | 建议 |
| `README.md`、`docs/` | 说明文档 | 可选 |
| `.gitignore` | 防止把 `node_modules` 传上去 | 建议 |

**绝对不要上传**：`node_modules/`（几万个文件、几百 MB）、`dist/`（构建产物，Actions 里会重新生成）、`.tmp/`。

`.gitignore` 已经排除了这三个目录，用命令行操作不会误传。

---

## 二、两个硬门槛

这两条不满足，后面怎么做都不会成功：

1. **仓库必须是 Public。** GitHub 免费账号只能为公开仓库开启 Pages；私有仓库需要付费版。你的材料不会因为代码公开而泄露——是否公开代码和数据是两件事，数据从来没上传过。
2. **默认分支必须是 `main`。** 工作流只在 `main` 分支推送时触发。GitHub 现在新建仓库默认就是 `main`，如果是 `master`，要么改名，要么改 `deploy.yml` 里的 `branches:`。

---

## 三、方式 A：命令行（推荐）

在项目目录下依次执行。把 `<你的用户名>` 和 `<仓库名>` 换成实际值。

```bash
# 1. 初始化仓库并提交
git init
git add .
git commit -m "feat: 尽调材料可逆脱敏工具"

# 2. 切到 main 分支
git branch -M main

# 3. 关联远程仓库（先在 GitHub 网页上建好一个空仓库，不要勾选 README）
git remote add origin https://github.com/<你的用户名>/<仓库名>.git

# 4. 推送
git push -u origin main
```

推送成功后直接跳到第五节。

**为什么推荐这条路径**：`git add .` 会自动遵守 `.gitignore`，不会误传 `node_modules`。后续改代码也只需要 `git add . && git commit -m "..." && git push`，Actions 会自动重新部署。

---

## 四、方式 B：网页上传

不想装 git 也可以用，但**有一个坑必须避开**：网页上传支持拖文件夹，如果把整个项目文件夹拖进去，`node_modules` 也会被一起上传，几万个文件会直接失败。

所以要么先在本地把 `node_modules`、`dist`、`.tmp` 移出项目目录，要么一个一个手动建文件。

不推荐这条路径，只在实在无法使用命令行时采用。

---

## 五、部署与验证

### 1. 看构建是否成功

推送后打开仓库的 **Actions** 标签页，应该看到一个 `Deploy to GitHub Pages` 的任务在跑：

```
build  →  npm ci  →  npm test  →  npm run build  →  upload artifact
deploy →  发布
```

绿灯大约需要 1–3 分钟。**`npm test` 失败会阻断部署**，这是故意的：还原链路一旦坏掉，发上去的版本会静默产出错误的终稿。

### 2. 确认 Pages 已启用

打开 **Settings → Pages**，`Source` 应该是 **GitHub Actions**（工作流里带了 `enablement: true`，正常情况下会自动设置）。

如果这里显示的是 `Deploy from a branch`，改成 `GitHub Actions`，然后到 Actions 页手动重跑一次（`Re-run all jobs`）。

### 3. 拿到网址

格式固定为：

```
https://<你的用户名>.github.io/<仓库名>/
```

例如仓库叫 `dd-mask`、用户名 `alice`，网址就是 `https://alice.github.io/dd-mask/`。

首次部署后可能要等 30–60 秒才能打开，期间会 404，属正常。

---

## 六、确认「别人真的能用」

自己打开能跑，不等于别人能跑。发链接前按这张表过一遍：

| 检查项 | 怎么做 | 期望 |
|---|---|---|
| 手机能开 | 把链接发到微信并打开 | 能正常显示（不要用需要登录的浏览器） |
| 无痕窗口能开 | 浏览器开无痕窗口访问 | 正常，说明不依赖任何本地缓存或登录态 |
| 示例能跑通 | 点「载入示例」（清单自动列出 6 个主体并默认全选）→「开始识别与脱敏」 | 出现 23 个实体、左右双栏对比 |
| 导出能用 | 第 3 步点复制或下载 | 提示词文本框有默认内容、可修改；复制得到「提示词 + 含 `〔机构_1〕` 的脱敏稿」 |
| 还原能通 | 把脱敏稿粘回第 4 步 | 第 5 步显示还原成功、无残留 |
| 断网可用 | 打开页面后断网，再走一遍流程 | 功能完全不受影响（证明没有网络请求） |

最后一条是隐私承诺的实证：如果代码里偷偷发了请求，断网后必然报错。

---

## 七、常见失败

| 现象 | 原因 | 处理 |
|---|---|---|
| Actions 报 `Get Pages site failed` | 仓库没开 Pages，且自动启用失败 | Settings → Pages → Source 手动选 GitHub Actions，再重跑 |
| Actions 报 `npm ci` 失败 | `package-lock.json` 缺失或与 `package.json` 不一致 | 本地跑 `npm install` 后重新提交 lock 文件 |
| Actions 报 `npm test` 失败 | 单测挂了 | 本地 `npm test` 复现，修好再推 |
| 页面打开是空白 | 资源 404，通常是路径问题 | 确认 `vite.config.ts` 里是 `base: './'`，且没有手动改过 |
| 打开是 GitHub 404 页 | 仓库是 private，或 Pages 未启用 | 改成 public，或按上一条启用 Pages |
| 样式全部丢失 | CSS 没加载，同上路径问题 | 同上 |
| 推送后 Actions 没触发 | 默认分支不是 `main` | 改分支名，或改 `deploy.yml` 的 `branches` |

---

## 八、一个现实限制

`github.io` 在中国大陆的访问不稳定，部分网络环境下会超时。如果测试对象主要在国内，建议加一个备用域名或换托管平台。这个应用是纯静态产物，`dist/` 目录可以直接扔到任何静态托管上（Vercel、Netlify、Cloudflare Pages、对象存储），不需要任何服务端配置。
