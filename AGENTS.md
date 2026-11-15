# AGENTS.md

## 项目定位

这是一个可部署到 GitHub Pages 的纯静态医学情报仪表盘。前端页面读取 `data/*.json`，Node.js 脚本负责生成数据文件。

## 开发原则

- 保持纯静态优先，不引入后端服务器。
- 不在页面里硬编码 PubMed 检索式、排除规则或评分规则。
- 检索、评分、标签、中国机构关键词统一维护在 `scripts/config.mjs`。
- 不提交 API key、个人邮箱或 `.env`。
- 不调用付费 AI API，除非后续明确加入配置和降级策略。
- 页面必须在数据为空、字段缺失或单个数据源失败时正常显示。
- 任何自动摘要、标签、评分都只能作为阅读辅助。

## 数据约定

文献 JSON 使用稳定字段：

- `pmid`
- `title`
- `abstract`
- `englishSummary`
- `summaryZh`
- `journal`
- `publicationDate`
- `authors`
- `affiliations`
- `doi`
- `pubmedUrl`
- `publicationTypes`
- `relevance`
- `score`
- `scoreReasons`
- `topicTags`
- `studyTypeTags`
- `isChinaResearch`

临床试验 JSON 使用稳定字段：

- `nctId`
- `title`
- `condition`
- `intervention`
- `status`
- `phase`
- `studyType`
- `enrollment`
- `startDate`
- `completionDate`
- `locations`
- `sponsor`
- `trialUrl`

## 更新脚本规范

- `npm run update` 必须可重复运行。
- 单个数据源失败不得阻断其他数据源。
- 每次更新必须写入 `data/update-status.json`。
- 对外部 API 请求要控制速率、设置超时并记录错误。
- PubMed 中国研究只根据 affiliation 判断，不根据作者姓名判断。
- PubMed 更新失败时不得用空数组覆盖已有安全数据。
- ClinicalTrials.gov 更新失败时不得覆盖已有 `clinical-trials.json`。
- `data/weekly-brief.json` 只从现有 PubMed JSON 规则生成，不调用 AI。

## 前端规范

- 使用中文界面，必要英文医学术语保留。
- 维持专业、简洁、医学情报风格。
- 不依赖构建工具即可在 GitHub Pages 运行。
- 所有链接打开原始来源，例如 PubMed、DOI、ClinicalTrials.gov。
- 新页面应复用 `app.js` 里的数据加载、空状态和卡片模式。
- 首页统计与课题组研究专题放在精选工作台上方；论文“内容概述”和“入选理由”分开。内容规则复用 `lib/article-overview.js`，只据题名与研究目的概括研究问题，不推断结果或临床获益；缺少摘要时明确提示。
- 首页提供“精选速览/全部文献”两个可切换视图；精选默认10篇，可选5/10/20篇，完整结果按需加载并可搜索、筛选、分页。专题页面也保留 `view=all`。
- 精选规则集中在 `scripts/config.mjs` 的 `readingDigestConfig`，与完整抓取分离；按实际发表日期，不按记录修改日期冒充近期发表。
- JIF和分区统一维护在 `data/journal-metrics.json`，保留年份、口径和来源；默认精选使用已核实JCR Q1，不再用中科院分区作为门槛，两者不可互换。未知留空，不用SJR/CiteScore或估算值冒充JIF/JCR。
- 期刊匹配复用 `lib/journal-metrics.js`，不做刊名模糊包含匹配，不公开机构限制传播的指标整表。

## 医学免责声明

任何页面和文档都应明确：本项目仅作为情报聚合和阅读辅助，不构成医学建议，正式判断应回到原始论文、指南、临床试验登记和监管文件。
