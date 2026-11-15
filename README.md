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
data/journal-metrics.json
data/reading-candidates.json
data/reading-digest.json
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

可选源字段包括 `journalIssns` 与 `publicationDatePrecision`（day/month/year/unknown）；精选不把缺少日精度的出版日期伪装成最近7天/30天。

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

## 首页文献工作台与 JCR Q1 速览

首页可直接切换“精选速览/全部文献”，不必跳转页面。精选默认显示10篇，可自由选择5/10/20篇、研究方向与近7天/30天。完整文献按需加载，可选研究方向、发表时间（7天/30天/全部），搜索标题/摘要/期刊/作者；更多筛选中包含主题、研究类型、相关性、JCR分区、中国研究、隐藏综述和排序。按PMID去重并分页，每页20/50/100篇。专题二级页面也保留“精选速览/全部检索结果”。

- 时间按论文**实际发表日期**，可切换近7天/30天；不把 `mdat` 更新当成新发表。缺少日精度、未来日期、旧文不进精选。
- 每组最多保留20篇精选，默认展示10篇；首页跨方向最多20篇且同一方向最多10篇，避免单个方向占满。符合条件不足就按真实数量显示，不用旧文凑数；所有候选仍可在首页“全部文献”自由筛选。
- 精选只纳入 `high` 且标题/摘要直接符合专题规则、有来源JIF和已核实 **JCR 2025 Q1（2026发布版）** 的研究。此前的中科院分区门槛已撤下；中科院1区、JCR Q1、SJR Q1与新锐分区不可互换。
- 普通综述默认不入选；特别值得读的综述可在 `readingDigestConfig.exceptionalReviewPmids` 人工确认后加入，每组最多1篇，并受JIF、日期与相关性条件约束。病例、方案、社论、更正、撤稿等不入选。
- 研究类型先看 PubMed publication types，综述提及 RCT 不会因此作为 RCT 排到首位。课题组专题允许直接相关的基础、动物和体外研究，不强行按临床价值打分。

`scripts/update-reading-digest.mjs` 在每日更新中，额外对**已核实JCR Q1期刊**按 `pdat` 检索30天候选，因此不局限于原来的7天记录修改窗口。写入 `reading-candidates.json` 缓存，再与现有完整列表按PMID合并，生成 `reading-digest.json`。某方向网络失败会保留候选及上次成功时间、记录错误；页面明显提示未完全刷新，仍剔除已过期论文。长检索自动使用表单POST，避免URL过长；PubMed HTTP 200中的临时后端错误会有限重试，空错误列表不会被误判为失败。原完整JSON不被精选规则删减。

不联网重算精选：`npm run digest`。刷新近期候选：`node scripts/update-reading-digest.mjs --refresh`。全部筛选、数量与优质综述例外规则集中在 `scripts/config.mjs` 的 `readingDigestConfig`。周报的文献部分复用7天精选，临床试验规则不变。

### 期刊指标维护

`data/journal-metrics.json` 是**当前专题相关期刊的有限指标表，不是完整JCR数据库**。JCR/IF依据[尼古拉耶夫无机化学研究所公开JCR表](https://www.niic.nsc.ru/phocadownload/publications/2025/JCR_JournalImpactFactor_2026.pdf)，只核对现有近期专题涉及的期刊，记录ISSN、来源页码、JIF与 `JIF Quartile` 列。该来源按发布年命名：`JIF 2026` 列对应2025统计值；[大学图书馆发布说明](https://pg.edu.pl/en/gdansk-tech-library/2026-06/new-editions-journal-citation-reports-and-citescore)与[出版商数据](https://www.nature.com/ncomms/?hl=en-US)可核对统计年与发布年的区别。源表没有逐学科分区明细，页面不虚构学科或跨学科最优分位，正式使用请回到原始JCR。

保留的中科院2025大类分区来自[豫北医学院图书馆公开资料](https://lib.sqmc.edu.cn/2025/0902/c4233a126337/pagem.htm)，仅作参考，不再用于当前精选门槛。每条指标保留年份与具体来源，未知显示“待核实”。公开仓库不镜像整份指标数据库或原始附件。

新增期刊时，用准确刊名、别名或ISSN匹配，禁止模糊包含匹配（例如不能把 Biomaterials Advances 当成 Biomaterials）。记录格式参考已有条目：

- `impactFactor`: `value`、JIF统计年份 `year`、`sourceId`；数值必须来自可核对来源，不拿CiteScore、SJR或OpenAlex两年均引冒充。
- `jcr`: `quartile`（Q1/Q2/Q3/Q4）、指标年份 `year`、发布年份 `releaseYear`、`verified`、`sourceId`、可选来源页码 `page`。只有当前配置年份的已核实Q1进入精选，不从中科院分区推断。
- `cas`: 保留历史参考的分区、版本、范围和来源，与 `jcr` 独立，缺少也不影响JCR精选。
- `sources`: 与 `sourceId` 对应的公开来源名称、HTTP(S)链接；不要加入个人邮箱、账号或授权下载凭证。

未收录的期刊仍显示刊名，JIF/JCR分区标为“待核实”，**不推断为非Q1**，也不会伪造数值。若要提高覆盖率，应根据有权使用及公开的期刊信息补充所需条目；不要把机构限制传播的整表直接上传公开仓库。

分区版本依据及服务变更可参见[菏泽学院科研处2026年说明](https://kyc.hezeu.edu.cn/info/1040/4015.htm)。期刊指标只是阅读线索，不能保证单篇论文质量，正式判断仍需核对研究方法、原文和本机构认可的分区。

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

当前使用 `main` 根目录的分支型 Pages。更新 workflow 会在提交数据后显式请求 Pages 重建，并仅增加 `pages: write` 权限；不需要另存个人访问令牌。这一步确保自动更新后的 JSON 能同步到网站，因为内置 `GITHUB_TOKEN` 的提交不会自行触发 Pages 构建，参见 [GitHub 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。请先启用 Pages，再运行更新 workflow。

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
