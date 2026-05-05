# LiteAI TypeScript SDK

轻量级、零依赖的 TypeScript 客户端，用于调用 OpenAI 格式的大语言模型 API。支持文本对话、流式/非流式请求、自动重试、多模态视觉理解、图像生成、文本嵌入、文本转语音、语音识别、文件管理、批处理等。

[![npm version](https://img.shields.io/npm/v/liteai-ts.svg)](https://www.npmjs.com/package/liteai-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 特性

- ✅ **完全兼容 OpenAI API** – 支持聊天补全、图像生成、嵌入、语音、文件、批处理等标准接口
- ✅ **多平台适配** – 自动适配阿里云 DashScope、SiliconFlow 等平台，无需修改代码
- ✅ **流式 SSE 解析** – 支持不完整 JSON 拼接，稳定处理流式响应
- ✅ **自动重试** – 可恢复错误（429/5xx/网络超时）自动重试，支持指数退避
- ✅ **分级日志** – 业务日志（摘要/完整）与原始报文日志分离
- ✅ **日志时间占位符** – 文件名支持 `{YYYYMMDD_HHMMSS}` 等动态时间戳
- ✅ **性能统计** – 内置统计收集器，可按模型聚合请求次数、延迟、Token 消耗等
- ✅ **异步任务轮询** – 通用 `pollUntilComplete` 工具，简化批处理等长时间任务等待
- ✅ **代理支持** – 支持 HTTP/HTTPS 代理
- ✅ **零第三方依赖** – 仅使用 Node.js 原生模块（http、https、fs、crypto）
- ✅ **TypeScript 友好** – 完整的类型定义

---

## 安装

```bash
npm install liteai-ts
```

如果需要代理功能，请安装可选依赖：

```bash
npm install https-proxy-agent http-proxy-agent --save-optional
```

---

## 快速开始

```typescript
import { LiteAI } from 'liteai-ts';

const client = new LiteAI({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.openai.com/v1', // 可省略，默认为 OpenAI
});

// 非流式对话
const response = await client.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: false,
});
console.log(response.choices[0].message.content);

// 流式对话
const stream = await client.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Count to 5' }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

---

## 配置选项

`LiteAI` 构造函数接受以下配置：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | string | 必填 | API 密钥 |
| `baseUrl` | string | `https://api.openai.com/v1` | 基础 URL |
| `timeout` | number \| [number, number] | `60` | 超时秒数 |
| `maxRetries` | number | `3` | 最大重试次数 |
| `backoffFactor` | number | `1.0` | 退避因子 |
| `maxWait` | number | `60` | 最大等待秒数 |
| `logFile` | string | 无 | 业务日志文件路径（支持时间占位符） |
| `logLevel` | number | 无 | 日志级别（10=DEBUG,20=INFO,30=WARN,40=ERROR） |
| `logMode` | `'single' \| 'daily' \| 'append'` | `'single'` | 日志文件命名模式 |
| `consoleLog` | boolean | `false` | 是否输出到控制台 |
| `logDetail` | `1\|2\|3` | `2` | 详细程度（仅 DEBUG 时生效） |
| `verifySsl` | boolean | `true` | 是否验证 SSL 证书 |
| `proxy` | string | 无 | 代理地址，如 `http://127.0.0.1:7890` |
| `rawLogger` | `Logger` | 无 | 外部原始日志记录器 |
| `statsCollector` | `StatsCollector` | 无 | 性能统计收集器 |

---

## 核心功能

### 1. 聊天补全

```typescript
// 非流式
const resp = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
});

// 流式
const stream = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
});
```

### 2. 多模态视觉理解

```typescript
import { imageFileToBase64 } from 'liteai-ts';

const imageBase64 = await imageFileToBase64('./cat.jpg');
const resp = await client.chat.completions.create({
  model: 'gpt-4-vision-preview',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: '描述这张图片' },
      { type: 'image_url', image_url: { url: imageBase64 } }
    ]
  }],
});
```

### 3. 图像生成

```typescript
const result = await client.images.generate({
  model: 'dall-e-3',
  prompt: 'a cute cat',
  n: 1,
  size: '1024x1024',
  response_format: 'url',
});
console.log(result.data[0].url);
```

### 4. 文本嵌入

```typescript
const embedding = await client.embeddings.create({
  model: 'text-embedding-ada-002',
  input: 'Hello world',
});
console.log(embedding.data[0].embedding);
```

### 5. 文本转语音 (TTS)

```typescript
const audioBuffer = await client.audio.speech.create({
  model: 'tts-1',
  input: 'Hello world',
  voice: 'alloy',
});
fs.writeFileSync('output.mp3', audioBuffer);
```

### 6. 语音识别 (转录)

```typescript
const transcription = await client.audio.transcriptions.create({
  file: './meeting.mp3',
  model: 'whisper-1',
  language: 'zh',
});
console.log(transcription.text);
```

### 7. 文件管理

```typescript
// 上传文件
const file = await client.files.upload({
  file: './requests.jsonl',
  purpose: 'batch',
});
console.log(file.id);

// 列出文件
const files = await client.files.list('batch', 20);

// 下载文件内容
const content = await client.files.content(file.id);

// 删除文件
await client.files.delete(file.id);
```

### 8. 批处理 (Batch)

```typescript
// 创建批处理任务
const batch = await client.batches.create({
  input_file_id: file.id,
  endpoint: '/v1/chat/completions',
  completion_window: '24h',
});

// 轮询直到完成
import { pollUntilComplete } from 'liteai-ts';
const completed = await pollUntilComplete(
  () => client.batches.retrieve(batch.id),
  (b) => ['completed', 'failed', 'expired', 'cancelled'].includes(b.status),
  { interval: 5000, timeout: 3600000 }
);

// 下载结果
if (completed.output_file_id) {
  const result = await client.files.content(completed.output_file_id);
  fs.writeFileSync('output.jsonl', result);
}
```

### 9. 阿里云 OSS 临时上传（用于多模态模型）

```typescript
const ossUrl = await client.uploads.getTemporaryUrl({
  file: './image.png',
  model: 'qwen-vl-plus',
});
// 使用临时 URL 时必须添加请求头
const resp = await client.chat.completions.create({
  model: 'qwen-vl-plus',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: '这是什么？' },
      { type: 'image_url', image_url: { url: ossUrl } }
    ]
  }],
  headers: { 'X-DashScope-OssResourceResolve': 'enable' },
});
```

---

## 日志配置

### 时间占位符

日志文件名支持以下占位符，会在创建时自动替换为当前时间：

- `{YYYYMMDD_HHMMSS}` → `20260501_143052`
- `{YYYYMMDD_HHMM}` → `20260501_1430`
- `{YYYYMMDD}` → `20260501`
- `{HHMMSS}` → `143052`
- `{HHMM}` → `1430`

### 示例

```typescript
import { createLogger, LiteAI } from 'liteai-ts';

const rawLogger = createLogger({
  logFile: './logs/raw_{YYYYMMDD_HHMMSS}.log',
  logLevel: 10,
  consoleLog: false,
  logDetail: 3,
});

const client = new LiteAI({
  apiKey: '...',
  logFile: './logs/app_{YYYYMMDD_HHMM}.log',
  logLevel: 10,
  consoleLog: true,
  logDetail: 2,
  rawLogger,
});
```

---

## 性能统计

```typescript
import { SimpleStatsCollector } from 'liteai-ts';

const stats = new SimpleStatsCollector();
const client = new LiteAI({ apiKey: '...', statsCollector: stats });

// 多次调用后...
stats.printSummary();
// 输出示例：
// === LiteAI 统计摘要 ===
// https://api.openai.com/v1|gpt-3.5-turbo:
//   totalRequests: 10.00
//   successRate: 100.00%
//   avgDurationMs: 1234.56
//   totalTokens: 5000.00
```

---

## 错误处理

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

## 更多示例

完整示例代码位于 `examples/` 目录：

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
npm run embeddings
npm run tts
npm run transcribe
npm run files
npm run batches
```

---

## 开发

### 编译

```bash
npm run build
```

### 测试

```bash
npm test
```

### 清理

```bash
npm run clean
```

---

## 许可证

[MIT](LICENSE)

---


