# 血管外科情报中枢 / Vascular Surgery Intelligence Hub

一个纯静态的医学专题情报仪表盘，用于聚合血管外科相关文献、临床试验、指南共识、器械/监管动态和中国研究线索。当前阶段已接入 PubMed 文献抓取；ClinicalTrials.gov 暂时保留 mock data。

> 本项目仅作为情报聚合和阅读辅助，不构成医学建议。正式临床、科研、产品或监管判断应回到原始论文、指南、临床试验登记和监管文件。

## 本地运行

```bash
npm install
npm run update
npm run dev
```

打开本地预览：

```text
http://localhost:4173
```

如果端口被占用，可以指定端口：

```bash
PORT=5173 npm run dev
```

## 项目结构

```text
index.html
styles.css
app.js
pages/
data/
scripts/
.github/workflows/update-data.yml
README.md
AGENTS.md
```

核心约定：

- 页面只读取 `data/*.json`，不依赖后端服务器。
- `app.js` 负责加载 JSON、渲染卡片、搜索、筛选和空状态。
- `scripts/config.mjs` 集中维护 PubMed 检索式、排除规则、评分规则、标签规则和中国机构关键词。
- `scripts/update-all.mjs` 会调用真实 PubMed 更新流程；ClinicalTrials.gov 暂未接入。

## 数据文件

```text
data/latest-research.json
data/high-impact-research.json
data/china-research.json
data/clinical-trials.json
data/guidelines.json
data/device-regulatory.json
data/update-status.json
```

文献对象应至少包含：

- `pmid`
- `title`
- `abstract`
- `journal`
- `publicationDate`
- `authors`
- `affiliations`
- `doi`
- `pubmedUrl`
- `publicationTypes`
- `topicTags`
- `studyTypeTags`
- `relevance`
- `score`
- `scoreReasons`
- `summaryZh`
- `englishSummary`
- `isChinaResearch`
- `source`

## 修改检索式

编辑 `scripts/config.mjs`：

- `pubmedConfig.includeTerms`：血管外科主题检索词
- `pubmedConfig.excludeTerms`：排除规则
- `scoringConfig`：相关性评分
- `topicTagRules`：主题标签
- `studyTypeTagRules`：研究类型标签
- `chinaAffiliationKeywords`：中国机构关键词
- `clinicalTrialsConfig.topics`：ClinicalTrials.gov 检索主题

不要把检索式或排除规则写进页面文件。

## NCBI 配置

接入 PubMed E-utilities 时，复制 `.env.example` 为 `.env` 并填写：

```text
NCBI_EMAIL=
NCBI_TOOL=vascular-surgery-intelligence-hub
```

不要提交 `.env`，不要把 API key 或个人邮箱写进代码。

## GitHub Pages 部署

这是纯静态站，可以在 GitHub 仓库设置中启用 Pages：

1. 打开仓库 Settings。
2. 进入 Pages。
3. Source 选择部署分支，例如 `main`。
4. 目录选择 `/root`。
5. 保存后访问 GitHub Pages URL。

如果后续改成 GitHub Actions 发布，也可以保留静态文件结构，无需后端服务。

## GitHub Actions 自动更新

`.github/workflows/update-data.yml` 会每天运行：

```bash
npm install
npm run update
```

当前 workflow 会运行 PubMed 更新脚本。如果 GitHub Actions 中没有配置 `NCBI_EMAIL`，脚本会跳过真实 PubMed 抓取并保留现有数据。建议在仓库 Secrets 中配置 `NCBI_EMAIL`，并可选配置 `NCBI_TOOL`。

## 人工复核建议

自动分类和评分只能作为阅读优先级线索。建议人工复核：

- `relevance` 为 `review` 的论文
- 高分但主题边界模糊的论文
- 病例报告、基础研究和动物研究
- 中国研究筛选结果，尤其是 affiliation 缺失或机构名称不规范时
- ClinicalTrials.gov 状态、地点和申办方字段

## 下一阶段

建议下一阶段实现：

1. 抽样复核 PubMed 标签、评分和中国机构筛选。
2. 根据复核结果微调 `scripts/config.mjs`。
3. `scripts/update-clinicaltrials.mjs`：接入 ClinicalTrials.gov API v2。
4. 后续再接入指南、器械监管和人工复核工作流。
