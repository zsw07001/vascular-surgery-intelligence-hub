# 血管外科情报中枢 / Vascular Surgery Intelligence Hub

一个纯静态的医学专题情报仪表盘，用于聚合血管外科相关文献、临床试验、指南共识、器械/监管动态和中国研究线索。当前阶段已接入 PubMed 文献抓取和 ClinicalTrials.gov API v2 临床试验抓取。

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
- `scripts/update-all.mjs` 会调用真实 PubMed 和 ClinicalTrials.gov 更新流程。

## 数据文件

```text
data/latest-research.json
data/high-impact-research.json
data/china-research.json
data/clinical-trials.json
data/guidelines.json
data/device-regulatory.json
data/safety.json
data/conference-news.json
data/weekly-brief.json
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

## PubMed 数量与更新口径

首页“近 7 天更新文献”是当前检索式按 PubMed `mdat`（记录修改日期）命中的完整结果，不是每天新增论文数；其中可能包含早先发表、近期被 PubMed 修改的论文。列表上的日期仍是论文发表日期。

- 原先的 `maxRecords: 200` 已移除。`searchPageSize` 和 `fetchBatchSize` 仅控制单次请求大小，不限制总收录数。
- ESearch 使用 History 快照、相同排序和 `retstart` 逐页读取 PMID，再分批 EFetch。只有全部 PMID 与解析后的文献逐一核对完整，才替换现有 JSON。
- `data/update-status.json` 的 `pubmed.retrieval` 记录实际命中数、入库数和是否完整；`pubmed.lastSuccessfulUpdate` 记录最后成功同步时间。
- “本次新入库 / 内容变更”与上一次成功的完整快照比较。新入库指首次进入本站当前窗口的 PMID，内容变更指同一 PMID 的标题、摘要、期刊、日期、作者、机构、DOI 或 publication type 发生变化；评分或标签规则调整不计为原文变更。
- 首次从旧版 200 条上限迁移，或检索式/窗口发生变化时，先建立基线，不把补抓的旧论文误称为当天新增。移出 7 天窗口也不代表论文被撤回。
- 真正的零命中会显示 0 和空状态；API 错误、分页缺失或不完整 XML 会保留上次成功数据并显示错误。PubMed ESearch 单次查询有 9,999 个 PMID 的限制，超出时会明确报错并保留旧数据，需缩小窗口/检索范围。

参数依据：[NCBI E-utilities 参数说明](https://www.ncbi.nlm.nih.gov/sites/books/NBK25499/)。可运行 `npm test` 验证多页抓取、零结果、失败保留与更新计数。

## 课题组研究专题

首页和 `pages/topics.html` 提供四个独立方向，详情复用文献页的搜索、主题/研究类型筛选、相关性筛选和分页：

- 氢气治疗与脑缺血再灌注：纳入两个主题及其交叉研究，可用主题标签分开查看。
- 血流震颤与血管功能检测：血流诱导振动、血管壁运动、声学/振动检测、体外血流模型及功能评价；这里不是血管内冲击波治疗。
- 可降解支架：可吸收/可降解支架、镁锌铁与聚合物材料，覆盖冠脉、外周、其他应用和基础材料证据。
- 神经与血管电信号互调：神经、内皮、平滑肌、周细胞、电生理、离子通道与信号耦联。

检索式、主题标签和专题匹配评分集中在 `scripts/config.mjs` 的 `researchDirectionsConfig`。默认窗口是近 30 天（`mdat`），随每日 Actions 更新，完整分页抓取，不使用血管外科主检索式的冠脉/脑血管/动物排除规则。专题高相关只代表主题匹配度，不代表临床证据等级。

`scripts/update-research-directions.mjs` 写入 `data/research-directions.json` 和四个 `data/topic-*.json`。每个方向单独处理错误并保留旧数据，实际命中数、入库数、最后成功时间和错误也会进入数据状态页。专题之间可能包含同一 PMID，单个专题内部去重。

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

当前 workflow 会运行 PubMed 和 ClinicalTrials.gov 更新脚本。如果 GitHub Actions 中没有配置 `NCBI_EMAIL`，脚本会跳过真实 PubMed 抓取并保留现有文献数据；ClinicalTrials.gov 不需要 API key。建议在仓库 Secrets 中配置 `NCBI_EMAIL`，并可选配置 `NCBI_TOOL`。

## 人工复核建议

自动分类和评分只能作为阅读优先级线索。建议人工复核：

- `relevance` 为 `review` 的论文
- 高分但主题边界模糊的论文
- 病例报告、基础研究和动物研究
- 中国研究筛选结果，尤其是 affiliation 缺失或机构名称不规范时
- ClinicalTrials.gov 状态、地点和申办方字段

## 每周精选

`data/weekly-brief.json` 由 `npm run update` 根据现有 PubMed JSON 规则生成，不调用 AI。当前包括优先阅读、中国研究、待复核队列和主题趋势。

## 下一阶段

建议下一阶段实现：

1. 抽样复核 PubMed 标签、评分和中国机构筛选。
2. 根据复核结果微调 `scripts/config.mjs`。
3. 继续优化 ClinicalTrials.gov 主题词和状态筛选。
4. 后续再接入指南、器械监管和人工复核工作流。
