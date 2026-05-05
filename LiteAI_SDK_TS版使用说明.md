# LiteAI SDK TypeScript 版使用说明

**版本**：v0.5.0  
**最后更新**：2026-05-01

---

## 1. 简介

LiteAI 是一个轻量级、零第三方依赖的 TypeScript 客户端，用于调用 OpenAI 格式的大语言模型 API。它支持：

- ✅ 文本对话（非流式/流式）
- ✅ 多模态视觉理解（图片描述）
- ✅ 图像生成（DALL‑E 及兼容平台，如阿里云通义万象）
- ✅ 文本嵌入向量（支持纯文本与多模态嵌入）
- ✅ 文本转语音（TTS，支持 OpenAI 与阿里云）
- ✅ 语音识别（音频转文字，支持 OpenAI 与 SiliconFlow）
- ✅ 文件管理（上传、列表、删除、下载）
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
| `apiKey` | string | 必填 | API 密钥 |
| `baseUrl` | string | `"https://api.openai.com/v1"` | 基础 URL（不应包含 `/chat/completions`） |
| `timeout` | number \| [number, number] | `60` | 整体超时（秒） |
| `maxRetries` | number | `3` | 最大重试次数（不含首次） |
| `backoffFactor` | number | `1.0` | 退避因子，等待时间 = `backoffFactor * 2^attempt` 秒 |
| `maxWait` | number | `60` | 单次最大等待秒数 |
| `logFile` | string | 无 | 业务日志文件路径（支持时间占位符） |
| `logLevel` | number | 无 | 日志级别：`10`(DEBUG), `20`(INFO), `30`(WARN), `40`(ERROR) |
| `logMode` | `'single'` \| `'daily'` \| `'append'` | `'single'` | 日志文件命名模式 |
| `consoleLog` | boolean | `false` | 是否同时输出到控制台 |
| `logDetail` | `1`\|`2`\|`3` | `2` | 详细程度（仅 `logLevel=10` 时生效） |
| `verifySsl` | boolean | `true` | 是否验证 SSL 证书 |
| `proxy` | string | 无 | 代理地址，如 `http://127.0.0.1:7890` |
| `rawLogger` | `Logger` | 无 | 外部原始日志记录器 |
| `statsCollector` | `StatsCollector` | 无 | 性能统计收集器 |

---

## 5. 核心功能

### 5.1 图像生成

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

**阿里云 DashScope 适配**：SDK 会自动检测 `baseUrl` 是否包含 `dashscope`，并转换请求/响应格式。您只需像调用 OpenAI 一样调用即可。

### 5.2 文本嵌入

```typescript
const embedding = await client.embeddings.create({
  model: 'text-embedding-ada-002',
  input: 'Hello world',
});

console.log(embedding.data[0].embedding); // 向量数组
```

**阿里云多模态嵌入**：支持图像、视频等多模态内容。传入 `contents` 数组或 `multimodal: true` 标记。

```typescript
const embedding = await client.embeddings.create({
  model: 'tongyi-embedding-vision-flash-2026-03-06',
  input: '文本描述',          // 自动转换为 {text: ...}
  multimodal: true,          // 可选，SDK 自动适配
  dimension: 768,
});
```

### 5.3 文本转语音（TTS）

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

**阿里云 TTS**：SDK 自动识别并适配，无需修改代码。

### 5.4 语音识别（音频转文字）

```typescript
const transcription = await client.audio.transcriptions.create({
  file: './meeting.mp3',   // 支持文件路径或 Buffer
  model: 'whisper-1',
  language: 'zh',
});

console.log(transcription.text);
```

### 5.5 文件管理

```typescript
// 上传文件（批处理输入文件格式为 JSONL）
const file = await client.files.upload({
  file: './requests.jsonl',
  purpose: 'batch',         // 或 'assistants', 'fine-tune'
});

// 列出文件
const files = await client.files.list('batch', 20);
console.log(files.data);

// 获取文件内容
const content = await client.files.content(file.id);
console.log(content.toString());

// 删除文件
await client.files.delete(file.id);
```

### 5.6 批处理（Batch）

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
```

### 5.7 阿里云 OSS 临时上传（用于多模态模型）

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

### 5.8 多模态视觉理解（图像输入）

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

### 6.2 性能统计

```typescript
import { SimpleStatsCollector } from 'liteai-ts';

const stats = new SimpleStatsCollector();
const client = new LiteAI({ apiKey: '...', statsCollector: stats });

// 执行多次调用后...
stats.printSummary();
```

### 6.3 代理支持

```typescript
const client = new LiteAI({
  apiKey: '...',
  proxy: 'http://127.0.0.1:7890',  // 支持认证：http://user:pass@host:port
});
```

### 6.4 异步任务轮询

```typescript
import { pollUntilComplete } from 'liteai-ts';

const result = await pollUntilComplete(
  async () => ({ status: 'pending' }), // 实际 fetcher
  (data) => data.status === 'done',
  { interval: 1000, timeout: 30000, onRetry: (attempt) => console.log(`第${attempt}次尝试`) }
);
```

---

## 7. 错误处理

```typescript
import { APICallError, ConfigurationError, RetryExhausted } from 'liteai-ts';

try {
  await client.chat.completions.create({...});
} catch (err) {
  if (err instanceof APICallError) {
    console.error(`HTTP ${err.statusCode}: ${err.message}`);
    console.error(err.responseText);
  } else if (err instanceof ConfigurationError) {
    console.error('配置错误', err.message);
  } else {
    console.error(err);
  }
}
```

---

## 8. 常见问题

### Q1：如何判断模型支持哪些能力？

您可以在 `models.json` 中自定义标记（如 `vision: true`, `generation: true`），然后在代码中读取配置选择模型。

### Q2：阿里云临时 URL 报错“InvalidParameter”？

请确保在调用视觉模型时，请求头添加了 `X-DashScope-OssResourceResolve: enable`。

### Q3：SiliconFlow 上传文件失败？

SiliconFlow 的 `purpose` 只能为 `batch`，且文件必须是 `.jsonl` 格式。SDK 会自动转换，但文件格式需用户保证。

### Q4：流式响应偶尔乱码或中断？

SDK 已内置缓存拼接机制，通常会自行修复。若频繁发生，请检查网络稳定性或降低并发。

### Q5：如何获取原始 HTTP 响应头？

目前 SDK 不直接暴露响应头，但可以通过 `rawLogger` 记录原始报文。若需要编程获取，可扩展 `request` 方法返回 header。

---

## 9. 示例代码仓库

完整示例位于 GitHub 仓库的 `examples/` 目录：

- `basic.ts` – 文本对话（流式/非流式）
- `vision.ts` – 多模态视觉理解
- `image-gen.ts` – 图像生成（支持阿里云）
- `embeddings.ts` – 文本与多模态嵌入
- `tts.ts` – 文本转语音
- `transcription.ts` – 语音识别
- `files.ts` – 文件管理
- `batches.ts` – 批处理（含轮询）
- `upload-oss.ts` – 阿里云 OSS 临时上传

运行示例：

```bash
npm run example
npm run vision
npm run image-gen
# 等等
```

---

