# Agent Hosting 主流平台竞品调研

> 调研日期：2026-07-29
>
> 资料范围：阿里云、腾讯云、火山引擎及少量全球平台的官方公开资料
>
> 用途：支撑 Agent Hosting / Agent PaaS 立项与产品设计，不代表最终技术方案

## 1. 执行摘要

主流平台已经形成一条相对稳定的 Agent 托管产品链：

```text
Agent 制品
  → 运行时配置
  → 托管部署
  → 调试
  → 不可变版本
  → 稳定 Endpoint
  → 会话或实例路由
  → 弹性与实例
  → 日志、指标和发布治理
```

三个国内平台的共同点：

- 都把“运行时”作为独立产品对象，而不是直接向用户展示 Kubernetes 工作负载。
- 都允许通过容器镜像交付 Agent。
- 都在创建阶段提供资源、环境变量、网络、身份或凭证配置。
- 都在部署后提供平台访问地址，域名证书不是首次部署的必要条件。
- 都把实例和可观测放在运行时详情中。
- 阿里 AgentRun 和火山 AgentKit 都显式强调版本与发布；腾讯云函数依托函数版本体系。
- 会话亲和、会话隔离和会话持久化是三种不同能力，不应混称为“会话管理”。

对本项目最重要的结论：

> 应模仿的是“镜像到生产 Endpoint 的完整、自助、可治理旅程”，而不是复制模型、Prompt、工具、Memory、Knowledge 和安全沙箱等大而全能力。

## 2. 产品类别必须先分清

| 类别 | 解决的问题 | 代表产品 | 与本项目关系 |
|---|---|---|---|
| Agent 应用托管 | 把 Agent Web 服务部署为稳定、可扩缩、可观测的生产 Endpoint | 阿里 AgentRun、腾讯云函数 Agent 执行引擎、火山 AgentKit Runtime | 直接竞品 |
| Agent 执行沙箱 | 为一次任务或一个会话创建隔离计算环境，支持代码、浏览器、文件和桌面操作 | 腾讯 Agent Runtime / Agent 沙箱、阿里云沙箱、AWS AgentCore session isolation | 非当前 MVP |
| Agent 构建平台 | 管理 Prompt、模型、工具、知识、记忆和工作流 | 百炼、AgentKit 全平台、Foundry Agent Service | 相邻产品 |
| 通用应用 PaaS | 托管普通 Web、函数或容器应用 | 函数计算、云函数、容器应用平台 | 底层能力来源 |

腾讯官方尤其清晰地展示了这个分界：

- [Agent Runtime](https://cloud.tencent.com/document/product/1814/129423) 更接近 Agent 的云端工作环境或工具执行底座。
- [Agent 执行引擎](https://cloud.tencent.com/document/product/583/123905) 才更接近长期对外服务的 Agent Hosting。

本项目应保持在第二列第一类，不把浏览器、代码执行、快照和文件系统沙箱混进 MVP。

## 3. 横向对比

| 维度 | 阿里 AgentRun | 腾讯云函数 Agent 执行引擎 | 火山 AgentKit Runtime | 对本项目的启示 |
|---|---|---|---|---|
| 核心对象 | AgentRuntime、Version、Endpoint、Instance | Agent 应用、函数版本/别名、会话、实例 | Runtime、Version、Release、Instance | 以运行环境为一级对象 |
| 目标制品 | 代码包、在线代码、OCI 镜像 | 以 WebServer 镜像为主，也可借普通函数支持代码 | 自定义或公共镜像 | MVP 只接收 OCI 镜像 |
| 创建页 | 名称、制品、启动、资源、变量、网络、日志、探针、角色、凭证 | 名称、地域、镜像、内存、变量、网络、日志、会话/隔离 | 名称、镜像、实例范围、网络、IAM、认证、观测、规格、并发、变量 | 使用渐进式向导和高级配置 |
| 资源表达 | CPU、内存、磁盘、会话并发 | 内存档位及函数并发 | CPU、内存、min/max、实例并发 | 普通用户选择 RuntimePlan |
| 会话 | Header、Cookie、MCP；亲和、隔离、生命周期和持久化均可扩展 | Header、Cookie、Query、MCP；可显式 Session 与隔离 | `session_id` 主要是应用协议；另有会话资源 | MVP 只做 Header 尽力亲和，不做 Session 资源 |
| 版本发布 | 不可变版本、Endpoint 主/次版本与权重 | 函数版本、别名和灰度 | 草稿与线上分离；全量、灰度、回滚 | MVP 必须有 Revision 和回滚，灰度可后置 |
| 默认入口 | 平台 HTTPS Endpoint | 默认函数 URL | 平台 `/invoke` URL | 首次部署自动给平台 HTTPS 地址 |
| 自定义域名 | 标准域名、路由、CNAME、证书 | 自定义域名、CNAME、HTTPS、WAF | 当前核心 Runtime 旅程未见域名证书字段 | 域名作为部署后可选动作 |
| Secret / 身份 | 集中凭证对象和 RAM 执行角色 | 环境变量、CAM/函数临时身份 | API Key/OAuth 入站、IAM Role 出站 | 环境变量和 Secret 引用必须分开 |
| 健康检查 | 可配 HTTP 路径与阈值 | Agent 向导使用固定端口与启动窗口；沙箱产品支持显式探针 | 通过应用接入契约处理，创建页不显式暴露 | 本项目提供标准 HTTP 探针和默认值 |
| 实例操作 | 弹性与实例、实例指标 | 实例、会话与单实例指标 | 实例页和 WebShell，倾向声明式管理 | 实例主要用于观察与替换，不让用户逐个创建 |
| 可观测 | 请求、成功率、延迟、日志、Trace、Token | CLS 日志、CPU/内存/网络和请求指标 | 请求、延迟、带宽、CPU、内存、实例数、日志 | MVP 内置基础指标和日志跳转 |

## 4. 阿里云 AgentRun

### 4.1 价值主张与目标用户

AgentRun 覆盖无代码、低代码和高代码，但与本项目最可比的是高代码与自定义镜像路径。其核心价值是让开发者不用自行拼装执行环境、弹性、会话、版本、凭证和观测。

官方资料：

- [什么是 AgentRun](https://help.aliyun.com/zh/functioncompute/what-is-agentrun)
- [通过代码创建 Agent](https://help.aliyun.com/zh/functioncompute/create-agent-by-code-high-code)

### 4.2 容器镜像业务旅程

1. 首次使用完成服务角色授权。
2. 进入 Agent 运行时，选择“创建 Agent → 通过代码创建”。
3. 填写名称和描述。
4. 选择容器镜像及版本，填写监听端口；镜像入口默认使用 Dockerfile。
5. 配置 CPU、内存、会话并发和空闲超时。
6. 配置环境变量、VPC/公网访问、日志、健康检查、执行角色和访问凭证。
7. 开始部署，在详情页调试。
8. 发布不可变版本。
9. 创建 Endpoint，选择主版本；可选次版本与流量权重。
10. 使用平台 HTTPS 地址和 `X-AgentRun-Session-ID` 调用。
11. 可选生成 UI 或绑定自定义域名。
12. 在实例、日志和监控页面持续运维。

官方步骤：[高代码创建完整流程](https://help.aliyun.com/zh/functioncompute/create-agent-by-code-high-code)

### 4.3 创建字段

- 基本信息：名称、描述、工作空间和资源组。
- 制品：本地 ZIP、OSS、在线代码、容器镜像。
- 容器：镜像地址/仓库/版本、端口。
- 资源：CPU、内存、磁盘和单实例会话并发。
- 配置：普通环境变量。
- 网络：VPC、交换机、安全组和公网出站。
- 身份：执行角色。
- 凭证：API Key、JWT、Basic、AK/SK、自定义 Header 等集中凭证。
- 日志：自动或自定义 SLS。
- 健康：HTTP 路径、初始延迟、间隔、超时和阈值。
- Endpoint：目标版本、权重和公网开关。

字段级资料：

- [CreateAgentRuntimeInput](https://help.aliyun.com/en/functioncompute/api-agentrun-2025-09-10-struct-createagentruntimeinput)
- [ContainerConfiguration](https://help.aliyun.com/en/functioncompute/api-agentrun-2025-09-10-struct-containerconfiguration)
- [HealthCheckConfiguration](https://help.aliyun.com/en/functioncompute/api-agentrun-2025-09-10-struct-healthcheckconfiguration)
- [NetworkConfiguration](https://help.aliyun.com/en/functioncompute/api-agentrun-2025-09-10-struct-networkconfiguration)
- [Endpoint 配置](https://help.aliyun.com/en/functioncompute/api-agentrun-2025-09-10-struct-createagentruntimeendpointinput)

### 4.4 域名与证书

默认 Endpoint 已可用于调用。自定义域名是部署后动作：

1. 创建标准域名；
2. 可选择云证书或手工 PEM；
3. 配置 CNAME；
4. 配置 Path、HTTP 方法、Agent 和 Endpoint；
5. 查看 DNS、SSL 与绑定状态。

本项目不应复制“粘贴私钥”的体验，应只引用企业证书资产。

官方资料：[AgentRun 自定义域名](https://help.aliyun.com/en/functioncompute/custom-domains-agentrun)

### 4.5 页面结构

- 概览与配置；
- 代码与调试；
- 版本与灰度；
- 集成与发布；
- 弹性与实例；
- 基础监控、日志和链路。

由于本项目不托管源码，“代码与调试”应改成“测试调用”，支持请求编辑、SSE 响应和日志联动。

## 5. 腾讯云

### 5.1 两条完全不同的旅程

腾讯的 Agent Runtime / Agent 沙箱面向任务和隔离执行；云函数 Agent 执行引擎面向 Agent Web 服务托管。立项材料应引用后者作为直接竞品，不用前者的桌面、浏览器、代码执行能力扩大范围。

官方资料：

- [Agent Runtime 应用场景](https://cloud.tencent.com/document/product/1814/129424)
- [Agent 运行时应用创建](https://cloud.tencent.com/document/product/583/123906)

### 5.2 Agent 执行引擎旅程

1. 完成云函数、镜像仓库、日志等授权。
2. 准备 WebServer 容器镜像。
3. 进入 Serverless 控制台的 Agent 区域并创建应用。
4. 填写名称、地域和镜像。
5. 选择资源规格，配置环境变量。
6. 配置公网与 VPC。
7. 配置日志投递。
8. 配置实例隔离、会话 Key、会话并发、请求并发和生命周期。
9. 提交部署并取得默认访问地址。
10. 可选绑定自定义域名和 HTTPS。
11. 从详情页查看日志、会话、实例和监控。

腾讯页面是一张纵向分区长表单。它验证了配置项完整性，但内部平台可以通过四步向导降低认知负担。

### 5.3 会话配置

腾讯将会话配置表达为业务字段：

- 标识来源：Header、Cookie、Query、MCP SSE、MCP Streamable HTTP；
- Key 名；
- 单实例会话上限；
- 会话生命周期和空闲超时；
- 单实例请求并发；
- 空闲动作；
- 是否一会话一实例。

官方资料：

- [基于会话模式并发管理](https://cloud.tencent.com/document/product/583/123889)
- [会话生命周期](https://cloud.tencent.com/document/product/583/123890)
- [实例安全隔离](https://cloud.tencent.com/document/product/583/123891)

本项目已选择“多会话共享实例 + Header 尽力亲和 + 状态外置”，所以无需腾讯式 Session CRUD、暂停恢复或一会话一实例。

### 5.4 页面与运维

详情页包括：

- 默认访问地址；
- 应用配置；
- 日志；
- 会话；
- 运行实例；
- 实例 CPU、内存、网络和请求指标。

官方资料：

- [实例级监控](https://cloud.tencent.com/document/product/583/121435)
- [日志投递](https://cloud.tencent.com/document/product/583/52644)
- [自定义域名](https://cloud.tencent.com/document/product/583/110861)

注意：Agent 执行引擎公开文档目前仍标记为内测，不能把其所有规模和成熟度表述当成已验证事实。

## 6. 火山引擎 AgentKit

### 6.1 产品定位

AgentKit 是覆盖构建、部署、运行、工具、记忆、知识、网关、评测和观测的完整平台。其“智能体运行时”才是本项目直接参照对象。

官方资料：

- [AgentKit 产品页](https://www.volcengine.com/product/agentkit)
- [AgentKit 文档](https://www.volcengine.com/docs/86681?lang=zh)
- [运行时概述](https://www.volcengine.com/docs/86681/1844854)

### 6.2 真实操作旅程

1. 准备镜像、VPC、IAM、模型或观测等依赖。
2. 进入“智能体运行时 → 创建智能体”。
3. 在一页式表单中配置名称、镜像、实例范围、网络、入站认证、IAM Role、观测、资源、并发和环境变量。
4. 提交后获得平台访问地址，并自动形成 V1。
5. 在在线测试页编辑 Method、Header 和 Body，也可通过 CLI/curl 调用 `/invoke`。
6. 编辑镜像、资源、模型、变量或组件后，变更先处于待发布状态。
7. 点击发布，查看变更对比，选择全量或灰度。
8. 查看新旧版本、发布比例、实例、实时日志和发布记录。
9. 可调整灰度、全量、取消、重试或回退。
10. 从详情页查看实例、WebShell、监控和日志。

官方资料：

- [创建运行时](https://www.volcengine.com/docs/86681/1844831)
- [调用与在线测试](https://www.volcengine.com/docs/86681/2122004)
- [发布运行时](https://www.volcengine.com/docs/86681/2173218)
- [查看发布过程](https://www.volcengine.com/docs/86681/2179038)
- [查看发布记录](https://www.volcengine.com/docs/86681/2179034)

### 6.3 创建字段

- 名称；
- 自定义镜像或公共镜像；
- 最小、最大实例；
- 公网或 VPC/子网；
- 公网出口；
- IAM Role；
- API Key 或 OAuth JWT；
- 观测服务与安全围栏；
- 模型与关联组件；
- CPU、内存和单实例并发；
- 环境变量；
- 项目和标签。

当前核心创建页没有显式暴露自定义端口、启动命令、探针、自定义域名或证书；这些更多由 Runtime 接入契约和平台统一入口处理。

### 6.4 配置与发布分离

AgentKit 最值得借鉴的产品决定是：

- 编辑配置不会立即改变线上；
- 发布前展示变更；
- 每次发布产生完整独立版本；
- 线上有明确稳定版本；
- 发布失败可以查看实例日志、重试或回退。

本项目可以把 Environment 草稿与不可变 Revision 分离；MVP 支持全量发布和回滚，任意权重灰度后置。

### 6.5 页面与观测

详情页结构：

```text
配置信息
关联组件
实例管理
监控
日志
版本管理
  ├─ 版本信息
  └─ 发布记录
```

运行时监控包含请求次数、请求分布、平均延迟、响应带宽、CPU、内存和实例数量；日志页支持时间、查询、原始结果和下载。

官方资料：

- [运行时监控](https://www.volcengine.com/docs/86681/2164880)
- [运行日志](https://www.volcengine.com/docs/86681/1844827)
- [实例 WebShell](https://www.volcengine.com/docs/86681/2272053)

## 7. 全球平台补充

### AWS AgentCore Runtime

AWS 将 Runtime 定义为框架和模型无关的 Agent 托管环境，负责伸缩、Session、安全和观测；部署更新会形成新版本，并通过 Endpoint 控制版本指向。

- [How AgentCore Runtime works](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-how-it-works.html)
- [Runtime 与 Harness 的边界](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-vs-runtime.html)

AWS 默认更强调每 Session 隔离计算，与本项目的多会话共享实例不同。

### Microsoft Foundry Hosted Agents

Foundry 将用户 Agent 打包为容器，平台负责 Endpoint、身份、会话、伸缩、观测和生命周期，并提供 OpenAI Responses 或通用 Invocations 协议。

- [Hosted Agents 概念](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agents)
- [Hosted Agent Runtime Contract](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/hosted-agent-contract)

它证明了“容器 + 稳定协议 + 托管身份 + 观测”是成熟产品组合，但其一会话一沙箱和持久化文件系统不适合本项目 MVP。

### Runtime、Gateway、Policy 与 Guardrail 的分层趋势

进一步调研显示，主流产品并不把全部治理能力塞进 Runtime：

- AWS AgentCore Runtime 负责托管与网络边界，AgentCore Gateway 可成为 Agent 的不可绕过入口；Policy 在 Agent 代码之外基于身份、Tool 和结构化参数做确定性允许/拒绝，每次决策进入审计日志。[AgentCore Policy](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy.html)
- AWS 对任意 HTTP Runtime 应用 Guardrails 时要求提供 OpenAPI 或 Smithy Schema；MCP/A2A 因协议已经结构化，可使用默认 Schema。这证明 Hosting 层无法自动理解任意容器内的业务动作。[Runtime Gateway Target](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-http-runtime.html)
- 腾讯云函数负责 Agent 应用托管；独立的 AI Agent 安全网关提供模型/MCP 接入、正反向代理、流量控制、提示词/敏感内容规则和安全日志。Agent、模型或 MCP 流量需要显式接入网关，不是运行时自动获得这些能力。[产品概述](https://cloud.tencent.com/document/product/1627/78608)、[快速入门](https://cloud.tencent.com/document/product/1627/78612)
- 腾讯 Agent Runtime 的 NetworkMode 与 NetworkPolicy 可以约束出站目标，但它属于任务/工具沙箱产品，并不能替代面向最终用户身份和高危 Tool 参数的业务授权。[Agent Runtime 网络模式](https://cloud.tencent.com/document/product/1814/132216)、[NetworkPolicy](https://cloud.tencent.com/document/product/1814/132217)
- 火山 AgentKit 在运行时详情提供安全围栏、安全概览和攻击日志，但官方仍以“在 Agent 中集成安全围栏”为独立步骤；攻击日志覆盖算力消耗、提示词攻击、模型滥用、敏感数据和话题控制。[集成安全围栏](https://www.volcengine.com/docs/86681/2178840)、[攻击日志](https://www.volcengine.com/docs/86681/2178843)
- 阿里 AgentRun 原生提供 API Key/JWT/Basic、VPC 与公网开关；消费者授权、限流和 AI 内容防护位于 AI 网关，细粒度出站依赖 NAT/云防火墙。MCP Tool Hook 可以在调用前后接入客户自己的判定服务，但只覆盖经过 AgentRun MCP 代理的调用。[AgentRun 高代码创建](https://help.aliyun.com/zh/functioncompute/create-agent-by-code-high-code)、[Agent API 策略与插件](https://help.aliyun.com/zh/api-gateway/ai-gateway/user-guide/configure-policies-and-plug-ins)、[AI 安全防护](https://help.aliyun.com/zh/api-gateway/ai-gateway/user-guide/content-security-protection/)、[MCP Tool Hook](https://help.aliyun.com/zh/functioncompute/mcp-tool-hook)
- 阿里 AgentLoop 可以关联会话、模型、工具以及进程/文件/网络风险，但它是检测、审计和调查能力，不是已经证明可拦截任意 AgentRun 调用的在线策略边界。[AgentLoop AI Agent 审计](https://help.aliyun.com/zh/document_detail/3045691.html)

在控制面审计方面也应保持证据边界：阿里 ActionTrail 已覆盖 FC、ACK、ACR 等通用云产品，但当前公开支持列表和 FC 审计事件清单尚未明确列出 AgentRun 专用 OpenAPI 事件。因此本项目不能假设底层产品会自动形成“谁发布了哪个 Agent Revision”的业务审计，仍应原生记录并关联底层执行证据。[ActionTrail 支持的云服务](https://help.aliyun.com/zh/actiontrail/product-overview/services-that-work-with-actiontrail)、[FC 审计事件](https://help.aliyun.com/zh/functioncompute/fc/user-guide/audit-events-of-function-compute)

对本项目的启示是：控制面审计、工作负载安全基线和网络 Profile 属于 Hosting 核心；Prompt 与工具语义护栏应通过标准 Gateway 或 Agent 集成完成。提示词检测是概率性风险判断，高危动作授权则必须是基于身份、Tool 和参数的确定性策略，二者不可互相替代。

## 8. 产品设计结论

### 应当进入 MVP

- 运行环境列表和创建向导；
- OCI 镜像 URI、Digest、拉取凭证引用；
- RuntimePlan；
- 普通参数和 Secret 引用；
- HTTP 端口和健康检查；
- Ingress、Egress、身份和日志 Profile；
- 控制面操作与平台自动执行审计；
- 工作负载安全基线；
- 平台默认 HTTPS Endpoint；
- Header 会话亲和；
- 不可变 Revision、发布记录、全量更新和回滚；
- 实例、部署阶段、失败原因；
- 请求、错误、延迟、CPU、内存和实例指标；
- 日志与 Request ID 联动；
- 租户专属集群注册与简单放置。

### 应当后置

- Cookie、Query、MCP 等多种亲和协议；
- 显式 Session 管理；
- 一会话一实例；
- 会话级存储；
- 自动缩容到零；
- 任意权重灰度；
- WebShell；
- 自助上传证书私钥；
- 自研提示词攻击和内容安全检测引擎；
- 通用 Tool / MCP Policy Engine 与高危动作人工审批；
- 自建模型、工具、Memory、Knowledge、A2A 和安全沙箱；可集成企业已有短期任务服务。

### 页面核心原则

详情首页必须立即回答六个问题：

1. Agent 当前可用吗？
2. 调用地址是什么？
3. 当前运行哪个 Revision 和镜像 Digest？
4. 就绪实例与期望实例是多少？
5. 最近发布成功了吗？
6. 如果失败，下一步应该看什么？
