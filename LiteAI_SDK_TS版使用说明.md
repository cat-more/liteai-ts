# LiteAI SDK TypeScript 版使用说明

**版本**：v0.6.5
**最后更新**：2026-05-13

---

## 1. 简介

LiteAI 是一个轻量级、零第三方依赖（可选代理除外）的 TypeScript 客户端，用于调用 OpenAI 格式的大语言模型 API。它支持：

- ✅ 文本对话（非流式/流式）
- ✅ 工具调用（Tools / Function Calling）
- ✅ 多模态视觉理解（图片描述）
- ✅ 图像生成（DALL‑E 及兼容平台，如阿里云通义万象）
- ✅ 文本嵌入向量（支持纯文本与多模态嵌入）
- ✅ 文本转语音（TTS，支持 OpenAI 与阿里云）
- ✅ 语音识别（音频转文字，支持 OpenAI 与 SiliconFlow）
- ✅ 文件管理（上传、列表、删除、下载）
- ✅ 模型列表（查询服务商支持的模型）
- ✅ 批处理（Batch API，异步处理大量请求）
- ✅ 阿里云 OSS 临时上传（获取 `oss://` 链接，用于多模态模型）
- ✅ 自动重试（429、5xx、网络错误）
- ✅ 分级日志 + 原始报文日志
- ✅ 性能统计收集器
- ✅ 异步任务轮询工具
- ✅ 代理支持

**适用环境**：Node.js 18+（TypeScript 或 CommonJS）

---

## 2. 安装

```bash
npm install liteai-ts
```

如果您需要代理功能，请额外安装可选依赖：

```bash
npm install https-proxy-agent http-proxy-agent --save-optional
```

---

## 3. 快速开始

### 3.1 初始化客户端

```typescript
import { LiteAI } from 'liteai-ts';

const client = new LiteAI({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.openai.com/v1',  // 可省略，默认为 OpenAI
  timeout: 60,           // 超时秒数
  maxRetries: 3,         // 最大重试次数
});
```

### 3.2 文本对话（非流式）

```typescript
const response = await client.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Tell me a joke.' }
  ],
  stream: false,
});

console.log(response.choices[0].message.content);
```

### 3.3 流式对话

```typescript
const stream = await client.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Count from 1 to 5.' }],
  stream: true,
}) as AsyncIterable<any>;

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) process.stdout.write(content);
}
console.log();
```

---

## 4. 配置参数

`LiteAI` 构造函数接受以下配置：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | string | **必填** | API 密钥 |
| `baseUrl` | string | `"https://api.openai.com/v1"` | 基础 URL（不应包含 `/chat/completions` 等端点） |
| `timeout` | number \| [number, number] | `300` | 整体超时秒数。数组时 `[连接超时, 读取超时]` |
| `maxRetries` | number | `3` | 最大重试次数（不含首次请求，即实际最多 4 次请求） |
| `backoffFactor` | number | `1.0` | 退避因子，等待时间 = `backoffFactor × 2^attempt` 秒 |
| `maxWait` | number | `120` | 单次最大等待秒数 |
| `logFile` | string | 无 | 业务日志文件路径，支持时间占位符 |
| `logLevel` | number | 无 | 日志级别：`10`(DEBUG), `20`(INFO), `30`(WARN), `40`(ERROR) |
| `logMode` | `'single'` \| `'daily'` \| `'append'` | `'single'` | 日志文件命名模式 |
| `consoleLog` | boolean | `false` | 是否同时输出到控制台 |
| `logDetail` | `1` \| `2` \| `3` | `2` | 详细程度：`1`=摘要，`2`=适中，`3`=完整（仅 `logLevel=10` 时生效） |
| `logTruncation` | `LogTruncationConfig` | 见下表 | 日志截断配置（仅 `logDetail=2` 时生效） |
| `verifySsl` | boolean | `true` | 是否验证 SSL 证书 |
| `proxy` | string | 无 | 代理地址，如 `http://127.0.0.1:7890`，支持认证：`http://user:pass@host:port` |
| `rawLogger` | `Logger` | 无 | 外部原始日志记录器，用于记录完整 HTTP 请求/响应报文 |
| `statsCollector` | `StatsCollector` | 无 | 性能统计收集器 |

**LogTruncationConfig 日志截断配置（logDetail=2 时生效）**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `structPrefix` | number | `100` | 结构化数据（JSON）每项前缀字数 |
| `structSuffix` | number | `50` | 结构化数据（JSON）每项后缀字数 |
| `unstructPrefix` | number | `300` | 非结构化数据（纯文本）前缀字数 |
| `unstructSuffix` | number | `100` | 非结构化数据（纯文本）后缀字数 |
| `streamPrefix` | number | `50` | 流式响应（SSE 行）前缀行数 |
| `streamSuffix` | number | `20` | 流式响应（SSE 行）后缀行数 |

---

## 5. 核心功能

### 5.1 文本对话（Chat Completions）

```typescript
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is AI?' }
  ],
  temperature: 0.7,
  max_tokens: 500,
  stream: false,
});
```

**请求参数（ChatCompletionCreateParams）**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | string | **必填** | 模型标识符 |
| `messages` | `ChatMessage[]` | **必填** | 消息列表 |
| `stream` | boolean | `false` | 是否使用流式响应 |
| `temperature` | number | 无 | 采样温度，0-2 之间，越高越随机 |
| `max_tokens` | number | 无 | 最大生成 token 数 |
| `top_p` | number | 无 | 核采样概率 |
| `frequency_penalty` | number | 无 | 频率惩罚，-2.0 到 2.0 |
| `presence_penalty` | number | 无 | 存在惩罚，-2.0 到 2.0 |
| `response_format` | `ResponseFormat` | 无 | 响应格式控制（json_object 或 json_schema） |
| `tools` | `Tool[]` | 无 | 工具定义列表 |
| `tool_choice` | `ToolChoice` | 无 | 工具选择策略：`'none'` \| `'auto'` \| `{ type: 'function', function: { name: string } }` |
| `[key: string]: any` | any | 无 | 其他扩展字段 |

**响应字段（ChatCompletionResponse）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 会话 ID |
| `model` | string | 实际使用的模型 |
| `choices[].message` | ChatMessage | assistant 的回复消息 |
| `choices[].finish_reason` | string | 结束原因（`stop`, `length`, `tool_calls` 等） |
| `usage.prompt_tokens` | number | 提示token数 |
| `usage.completion_tokens` | number | 生成token数 |
| `usage.total_tokens` | number | 总token数 |

### 5.2 工具调用（Tools / Function Calling）

```typescript
// 定义工具
const tools: Tool[] = [{
  type: 'function',
  function: {
    name: 'get_weather',
    description: '获取指定城市的天气',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称' }
      },
      required: ['city']
    }
  }
}];

const response = await client.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: [{ role: 'user', content: '北京今天天气怎么样？' }],
  tools,
  tool_choice: 'auto',  // 或 'none'，或强制指定 { type: 'function', function: { name: 'get_weather' } }
});

// 处理工具调用
const toolCall = response.choices[0].message.tool_calls?.[0];
if (toolCall) {
  const args = JSON.parse(toolCall.function.arguments);
  console.log(`调用工具: ${toolCall.function.name}, 参数: ${JSON.stringify(args)}`);
  // 执行工具并继续对话...
}
```

### 5.3 图像生成

```typescript
const result = await client.images.generate({
  model: 'dall-e-3',
  prompt: 'a cute cat',
  n: 1,
  size: '1024x1024',
  response_format: 'url',  // 或 'b64_json'
});

// 如果返回 url，可直接下载
console.log(result.data[0].url);
```

**请求参数（ImageGenerationParams）**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | string | `'dall-e-3'` | 图像生成模型 |
| `prompt` | string | **必填** | 图像描述文本 |
| `n` | number | `1` | 生成数量 |
| `size` | string | 无 | 图像尺寸：`'256x256'` \| `'512x512'` \| `'1024x1024'` \| `'1792x1024'` \| `'1024x1792'` |
| `quality` | string | 无 | 质量：`'standard'` \| `'hd'` |
| `response_format` | string | 无 | 返回格式：`'url'` \| `'b64_json'` |
| `style` | string | 无 | 风格：`'vivid'` \| `'natural'`（仅 DALL-E 3） |
| `user` | string | 无 | 用户标识 |
| `negative_prompt` | string | 无 | 反向提示词（阿里云） |
| `prompt_extend` | boolean | 无 | 是否自动扩写提示词（阿里云） |
| `watermark` | boolean | 无 | 是否添加水印（阿里云） |
| `seed` | number | 无 | 随机种子（阿里云） |
| `image` | string | 无 | 以图生图的参考图 URL（阿里云） |

**阿里云 DashScope 适配**：SDK 会自动检测 `baseUrl` 是否包含 `dashscope`，并转换请求/响应格式。您只需像调用 OpenAI 一样调用即可。

### 5.4 文本嵌入

```typescript
const embedding = await client.embeddings.create({
  model: 'text-embedding-ada-002',
  input: 'Hello world',
});

console.log(embedding.data[0].embedding); // 向量数组
```

**请求参数（EmbeddingParams）**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | string | **必填** | 嵌入模型 |
| `input` | string \| string[] | 无 | 待嵌入文本（OpenAI 风格） |
| `contents` | array | 无 | 阿里云多模态内容数组，每项可含 `text`/`image`/`video` |
| `dimension` | number | 无 | 向量维度 |
| `encoding_format` | string | 无 | 编码格式：`'float'` \| `'base64'` |
| `user` | string | 无 | 用户标识 |
| `text_type` | string | 无 | 文本类型（阿里云）：`'query'` \| `'document'` |
| `res_level` | number | 无 | 分辨率级别（阿里云）：0-3 |
| `max_video_frames` | number | 无 | 最大视频帧数 |
| `enable_fusion` | boolean | 无 | 是否启用融合 |
| `instruct` | string | 无 | 指令文本 |
| `fps` | number | 无 | 帧率 |
| `multimodal` | boolean | 无 | 是否为多模态模型 |

**阿里云多模态嵌入示例**：

```typescript
const embedding = await client.embeddings.create({
  model: 'tongyi-embedding-vision-flash-2026-03-06',
  input: '文本描述',          // 自动转换为 {text: ...}
  multimodal: true,          // SDK 自动适配
  dimension: 768,
});
```

### 5.5 文本转语音（TTS）

```typescript
const audioBuffer = await client.audio.speech.create({
  model: 'tts-1',
  input: 'Hello, welcome to LiteAI.',
  voice: 'alloy',
  speed: 1.0,
  response_format: 'mp3',
});

// 保存到文件
fs.writeFileSync('output.mp3', audioBuffer);
```

**请求参数（AudioSpeechParams）**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | string | **必填** | TTS 模型 |
| `input` | string | 无 | 待合成文本（OpenAI 风格，与 `text` 互斥） |
| `text` | string | 无 | 待合成文本（阿里云风格，与 `input` 互斥） |
| `voice` | string | 无 | 音色名称 |
| `speed` | number | 无 | 语速，0.25-4.0 |
| `response_format` | string | 无 | 音频格式：`'mp3'` \| `'opus'` \| `'aac'` \| `'flac'` \| `'pcm'` |
| `language_type` | string | 无 | 语言类型（阿里云）：如 `'Chinese'` \| `'English'` |
| `instructions` | string | 无 | 指令控制（阿里云） |
| `optimize_instructions` | boolean | 无 | 是否优化指令（阿里云） |
| `stream` | boolean | 无 | 是否流式返回（阿里云） |

**阿里云 TTS**：SDK 自动识别并适配，无需修改代码。

### 5.6 语音识别（音频转文字）

```typescript
const transcription = await client.audio.transcriptions.create({
  file: './meeting.mp3',   // 支持文件路径或 Buffer
  model: 'whisper-1',
  language: 'zh',
});

console.log(transcription.text);
```

**请求参数（AudioTranscriptionParams）**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `file` | Buffer \| string | **必填** | 音频文件（Buffer 或本地文件路径） |
| `model` | string | **必填** | 识别模型，如 `'whisper-1'` |
| `language` | string | 无 | 语言代码，如 `'zh'` \| `'en'` |
| `prompt` | string | 无 | 可选提示词，引导模型识别 |
| `response_format` | string | 无 | 返回格式：`'json'` \| `'text'` \| `'srt'` \| `'verbose_json'` \| `'vtt'` |
| `temperature` | number | 无 | 采样温度，0-1 |
| `timestamp_granularities` | array | 无 | 时间戳粒度：`'word'` \| `'segment'` |

**响应字段（AudioTranscriptionResponse）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | string | 转录文本 |
| `language` | string | 检测到的语言 |
| `duration` | number | 音频时长（秒） |
| `segments` | array | 段落信息（含时间戳） |
| `words` | array | 单词信息（含时间戳） |

### 5.7 文件管理

```typescript
// 上传文件（批处理输入文件格式为 JSONL）
const file = await client.files.upload({
  file: './requests.jsonl',
  purpose: 'batch',         // 或 'assistants', 'fine-tune', 'vision'
});

// 列出文件
const files = await client.files.list('batch', 20);
console.log(files.data);

// 获取文件信息
const fileInfo = await client.files.retrieve(file.id);

// 获取文件内容
const content = await client.files.content(file.id);
console.log(content.toString());

// 删除文件
await client.files.delete(file.id);
```

**文件上传参数（FileUploadParams）**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `file` | Buffer \| string | **必填** | 文件内容或本地路径 |
| `purpose` | string | **必填** | 文件用途：`'assistants'` \| `'fine-tune'` \| `'vision'` \| `'batch'` |
| `filename` | string | 无 | 自定义文件名 |

**文件列表参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `purpose` | string | 无 | 按用途过滤 |
| `limit` | number | 无 | 返回数量限制 |

### 5.8 模型列表

```typescript
const response = await client.models.list();

// 过滤模型
const gptModels = response.data.filter(m => m.id.includes('gpt'));
gptModels.forEach(m => {
  console.log(`ID: ${m.id}`);
  console.log(`  描述: ${m.description || '无'}`);
  console.log(`  上下文长度: ${m.context_length ?? '未知'}`);
  console.log(`  输入模态: ${m.input_modalities?.join(', ') || '无'}`);
  console.log(`  输出模态: ${m.output_modalities?.join(', ') || '无'}`);
  console.log(`  支持特性: ${m.supported_features?.join(', ') || '无'}`);
});
```

**注意**：不是所有服务商都支持 `/v1/models` 端点。建议使用 OpenAI、SenseNova 等支持该接口的平台。阿里云 DashScope、智谱 AI 等不支持此接口。

**ModelInfo 字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 模型标识符 |
| `name` | string | 模型名称 |
| `created` | number | 创建时间戳 |
| `description` | string | 功能描述 |
| `input_modalities` | string[] | 支持的输入模态，如 `["text", "image"]` |
| `output_modalities` | string[] | 支持的输出模态，如 `["text"]` |
| `context_length` | number | 最大上下文长度（token） |
| `max_output_length` | number | 单次最大输出长度（token） |
| `quantization` | string | 量化精度，如 `"fp8"` |
| `pricing` | `ModelPricing` | 定价信息 |
| `supported_sampling_parameters` | string[] | 支持的采样参数 |
| `supported_features` | string[] | 支持的功能，如 `["tools", "json_mode", "reasoning"]` |
| `datacenters` | `ModelDatacenter[]` | 数据中心信息 |

### 5.9 批处理（Batch）

```typescript
// 1. 上传输入文件
const inputFile = await client.files.upload({
  file: './requests.jsonl',
  purpose: 'batch',
});

// 2. 创建批处理任务
const batch = await client.batches.create({
  input_file_id: inputFile.id,
  endpoint: '/v1/chat/completions',
  completion_window: '24h',
});

// 3. 轮询直到完成
import { pollUntilComplete } from 'liteai-ts';
const completed = await pollUntilComplete(
  () => client.batches.retrieve(batch.id),
  (b) => ['completed', 'failed', 'expired', 'cancelled'].includes(b.status),
  { interval: 5000, timeout: 3600000 }
);

// 4. 下载结果
if (completed.output_file_id) {
  const resultBuffer = await client.files.content(completed.output_file_id);
  fs.writeFileSync('output.jsonl', resultBuffer);
}

// 其他操作
const batches = await client.batches.list(20);  // 列出批处理任务
await client.batches.cancel(batch.id);           // 取消批处理
```

**批处理创建参数（BatchCreateParams）**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `input_file_id` | string | **必填** | 上传的输入文件 ID |
| `endpoint` | string | **必填** | API 端点，如 `'/v1/chat/completions'` |
| `completion_window` | string | **必填** | 完成时间窗口，如 `'24h'` |
| `metadata` | object | 无 | 自定义元数据 |

**Batch 对象字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 批处理 ID |
| `status` | string | 状态：`validating` \| `in_progress` \| `completed` \| `failed` \| `expired` \| `cancelling` \| `cancelled` |
| `input_file_id` | string | 输入文件 ID |
| `output_file_id` | string | 输出文件 ID（完成后） |
| `error_file_id` | string | 错误文件 ID（失败时） |
| `request_counts` | object | 请求统计：`{ total, completed, failed }` |

### 5.10 阿里云 OSS 临时上传（用于多模态模型）

```typescript
const ossUrl = await client.uploads.getTemporaryUrl({
  file: './image.png',
  model: 'qwen-vl-plus',   // 模型必须与文件用途一致
});

console.log(ossUrl); // oss://dashscope-instant/.../image.png

// 使用临时 URL 调用视觉模型时，必须添加请求头
const response = await client.chat.completions.create({
  model: 'qwen-vl-plus',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: '这是什么？' },
      { type: 'image_url', image_url: { url: ossUrl } }
    ]
  }],
  headers: { 'X-DashScope-OssResourceResolve': 'enable' }  // 必须！
});
```

### 5.11 多模态视觉理解（图像输入）

```typescript
// 本地图片转 Base64
import { imageFileToBase64 } from 'liteai-ts';
const imageBase64 = await imageFileToBase64('./cat.jpg');

const response = await client.chat.completions.create({
  model: 'gpt-4-vision-preview',
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image' },
        { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } }
      ]
    }
  ],
  max_tokens: 500,
});

console.log(response.choices[0].message.content);
```

---

## 6. 高级功能

### 6.1 日志配置

```typescript
import { createLogger } from 'liteai-ts';

const rawLogger = createLogger({
  logFile: './logs/raw_{YYYYMMDD_HHMMSS}.log',
  logLevel: 10,
  consoleLog: true,
});

const client = new LiteAI({
  apiKey: '...',
  logFile: './logs/app_{YYYYMMDD_HHMM}.log',
  logLevel: 10,
  logDetail: 2,   // 摘要模式
  rawLogger,
});
```

**时间占位符**：

| 占位符 | 说明 |
|--------|------|
| `{YYYYMMDD_HHMMSS}` | 年月日时分秒，如 `20260513_143022` |
| `{YYYYMMDD_HHMM}` | 年月日时分，如 `20260513_1430` |
| `{YYYYMMDD}` | 年月日，如 `20260513` |
| `{HHMMSS}` | 时分秒，如 `143022` |
| `{HHMM}` | 时分，如 `1430` |

**日志详细程度（logDetail）**：

| 值 | 说明 |
|----|------|
| `1` | 仅摘要：SSE 总行数 |
| `2` | 适中：少量行（≤20全显示，否则省略中间部分） |
| `3` | 完整：所有 SSE 行全部显示 |

### 6.2 性能统计

```typescript
import { SimpleStatsCollector } from 'liteai-ts';

const stats = new SimpleStatsCollector();
const client = new LiteAI({ apiKey: '...', statsCollector: stats });

// 执行多次调用后...
stats.printSummary();

// 获取统计摘要
const summary = stats.getSummary('gpt-4', 'https://api.openai.com/v1');
console.log(summary);

// 重置统计
stats.reset();
```

**统计字段**：

| 字段 | 说明 |
|------|------|
| `totalRequests` | 总请求数 |
| `successRate` | 成功率 |
| `failedRequests` | 失败请求数 |
| `totalRetries` | 总重试次数 |
| `avgDurationMs` | 平均响应时间（毫秒） |
| `avgTtfbMs` | 平均首字节时间（毫秒） |
| `totalTokens` | 总 token 数 |
| `avgTokensPerRequest` | 平均每次请求 token 数 |
| `streamRequests` | 流式请求数 |
| `nonStreamRequests` | 非流式请求数 |

### 6.3 代理支持

```typescript
const client = new LiteAI({
  apiKey: '...',
  proxy: 'http://127.0.0.1:7890',  // 支持认证：http://user:pass@host:port
});
```

**注意**：需要安装可选依赖 `https-proxy-agent` 和 `http-proxy-agent`。

### 6.4 异步任务轮询

```typescript
import { pollUntilComplete } from 'liteai-ts';

const result = await pollUntilComplete(
  async () => ({ status: 'pending' }), // 实际 fetcher
  (data) => data.status === 'done',
  {
    interval: 1000,         // 轮询间隔（毫秒）
    timeout: 30000,         // 总超时（毫秒），0 表示永不超时
    maxAttempts: 10,        // 最大尝试次数，Infinity 表示无限制
    onRetry: (attempt, result) => console.log(`第${attempt}次尝试`)
  }
);
```

**PollOptions 参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `interval` | number | `2000` | 轮询间隔（毫秒） |
| `timeout` | number | `0` | 总超时时间（毫秒），0 表示永不超时 |
| `maxAttempts` | number | `Infinity` | 最大尝试次数 |
| `onRetry` | function | 无 | 每次轮询后的回调函数 |

---

## 7. 错误处理

```typescript
import { APICallError, ConfigurationError, RetryExhausted, SSEParseError } from 'liteai-ts';

try {
  await client.chat.completions.create({...});
} catch (err) {
  if (err instanceof APICallError) {
    console.error(`HTTP ${err.statusCode}: ${err.message}`);
    console.error(err.responseText);  // 原始响应体
  } else if (err instanceof ConfigurationError) {
    console.error('配置错误', err.message);
  } else if (err instanceof RetryExhausted) {
    console.error('重试次数耗尽', err.message);
  } else if (err instanceof SSEParseError) {
    console.error('SSE 解析错误', err.message);
  } else {
    console.error(err);
  }
}
```

**错误类说明**：

| 类 | 说明 |
|----|------|
| `LiteAIError` | 基类 |
| `ConfigurationError` | 配置错误（如 API key 为空） |
| `APICallError` | API 调用错误，含 `statusCode` 和 `responseText` |
| `RetryExhausted` | 重试次数耗尽 |
| `SSEParseError` | SSE 流式响应解析错误 |

**可重试的错误状态码**：408, 409, 429, 500, 502, 503, 504

---

## 8. 辅助工具

### 8.1 图片工具

```typescript
import { imageFileToBase64, normalizeImageUrl } from 'liteai-ts';

// 将本地图片转换为 Base64 Data URL
const base64 = await imageFileToBase64('./cat.jpg');
// 返回: "data:image/jpeg;base64,/9j/4AAQ..."

// 标准化图片 URL（自动判断类型）
const url = await normalizeImageUrl('https://example.com/image.jpg');  // 直接返回
const url2 = await normalizeImageUrl('./local.jpg');                      // 转换为 Base64
```

### 8.2 多部分表单

```typescript
import { createMultipartForm } from 'liteai-ts';

const { body, contentType } = createMultipartForm({
  fields: { name: 'test', type: 'image' },
  files: [{
    fieldName: 'file',
    filename: 'image.png',
    contentType: 'image/png',
    data: fs.readFileSync('./image.png'),
  }],
});

// 使用：设置 Content-Type 为 contentType，将 body 作为请求体发送
```

---

## 9. 常见问题

### Q1：如何判断模型支持哪些能力？

您可以在 `models.json` 中自定义标记（如 `vision: true`, `generation: true`），然后在代码中读取配置选择模型。

### Q2：阿里云临时 URL 报错"InvalidParameter"？

请确保在调用视觉模型时，请求头添加了 `X-DashScope-OssResourceResolve: enable`。

### Q3：SiliconFlow 上传文件失败？

SiliconFlow 的 `purpose` 只能为 `batch`，且文件必须是 `.jsonl` 格式。SDK 会自动转换，但文件格式需用户保证。

### Q4：流式响应偶尔乱码或中断？

SDK 已内置缓存拼接机制，会自动处理 TCP 拆包导致的不完整 JSON。若频繁发生，请检查网络稳定性或降低并发。

### Q5：如何获取原始 HTTP 响应头？

目前 SDK 不直接暴露响应头，但可以通过 `rawLogger` 记录原始报文。若需要编程获取，可扩展 `request` 方法返回 header。

### Q6：批处理任务超时怎么办？

使用 `pollUntilComplete` 时增大 `timeout` 参数，默认 1 小时。对于大批量任务建议分批处理。

### Q7：如何同时使用多个服务商？

创建多个 `LiteAI` 客户端实例，分别配置不同的 `baseUrl` 和 `apiKey`。

---

## 10. 示例代码

完整示例位于 GitHub 仓库的 `examples/` 目录：

| 文件 | 说明 |
|------|------|
| `basic.ts` | 文本对话（流式/非流式） |
| `vision.ts` | 多模态视觉理解 |
| `image-gen.ts` | 图像生成（支持阿里云） |
| `embeddings.ts` | 文本与多模态嵌入 |
| `tts.ts` | 文本转语音 |
| `transcription.ts` | 语音识别 |
| `files.ts` | 文件管理 |
| `batches.ts` | 批处理（含轮询） |
| `upload-oss.ts` | 阿里云 OSS 临时上传 |
| `models.ts` | 模型列表查询 |

运行示例：

```bash
npm run example        # 文本对话
npm run vision        # 视觉理解
npm run image-gen     # 图像生成
npm run embeddings    # 嵌入向量
npm run tts           # 文本转语音
npm run transcribe    # 语音识别
npm run files         # 文件管理
npm run batches       # 批处理
npm run upload-oss    # OSS临时上传
npm run models        # 模型列表
```

---

## 11. TypeScript 类型参考

### 11.1 核心类型

```typescript
// 消息角色
type Role = 'system' | 'user' | 'assistant';

// 聊天消息（支持多模态）
interface ChatMessage {
  role: Role;
  content: string | ContentPart[] | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// 内容块
type ContentPart = TextContent | ImageContent;

interface TextContent {
  type: 'text';
  text: string;
}

interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

// 工具调用
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON 字符串
  };
}
```

### 11.2 日志与统计

```typescript
interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  setLevel(level: number): void;
}

interface RequestStats {
  requestId: string;
  baseUrl: string;
  model: string;
  stream: boolean;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  ttfbMs?: number;
  statusCode: number;
  success: boolean;
  errorType?: string;
  retryCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  sseChunkCount: number;
  sseBytes: number;
}

interface StatsCollector {
  onRequestStart(requestId: string, baseUrl: string, model: string, stream: boolean): void;
  onRetry(requestId: string, attempt: number, wait: number, reason: string): void;
  onTtfb(requestId: string, ttfbMs: number): void;
  onRequestEnd(stats: RequestStats): void;
}
```

---

## 12. 更新日志

### v0.6.5 (2026-05-13)
- 新增 `models.list` API，查询服务商支持的模型列表
- 新增 `batches.cancel` 方法，取消进行中的批处理任务
- 优化流式响应解析健壮性

### v0.6.4
- 改善流式响应的缓存拼接机制
- 修复重试统计问题

### v0.6.3
- 新增 `models.list` API
- 改善 `streamResponse` 健壮性

### v0.6.1
- 新增 `models.list` API

### v0.5.0 → v0.6.0
- 新增多模态嵌入（阿里云）
- 新增 TTS（阿里云）
- 新增语音识别
- 新增文件管理完整功能
- 新增批处理功能
- 新增性能统计收集器
- 新增异步任务轮询工具