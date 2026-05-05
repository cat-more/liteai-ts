/**
 * LiteAI TypeScript SDK - 公共类型 (支持多模态和图像生成)
 */

// ========== 基础类型 ==========

export type Role = 'system' | 'user' | 'assistant';

/**
 * 文本内容块
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * 图片内容块 (OpenAI 兼容)
 * image_url 可以是 URL 或 base64 编码的 data:image/jpeg;base64,...
 */
export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

/**
 * 多模态内容联合类型
 */
export type ContentPart = TextContent | ImageContent;

/**
 * 聊天消息 (支持多模态)
 * - 当 content 为 string 时，向后兼容纯文本。
 * - 当 content 为 ContentPart[] 时，支持多模态。
 */
export interface ChatMessage {
  role: Role;
  content: string | ContentPart[] | null; // 允许 null（如 tool 消息）
  name?: string;
  tool_calls?: ToolCall[];    // assistant 消息中可能包含
  tool_call_id?: string;      // tool 消息中用于关联
}

// ========== 聊天补全（已有，保持不变） ==========

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ResponseFormatJSONObject {
  type: 'json_object';
}

export interface ResponseFormatJSONSchema {
  type: 'json_schema';
  json_schema: {
    name: string;
    description?: string;
    schema?: Record<string, any>;
    strict?: boolean;
  };
}

export type ResponseFormat = ResponseFormatJSONObject | ResponseFormatJSONSchema;

export interface ChatCompletionCreateParams {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  response_format?: ResponseFormat;
  tools?: Tool[];              // 新增
  tool_choice?: ToolChoice;    // 新增
  [key: string]: any;   // 保留其他扩展字段
}

// ========== 工具调用 (Tools / Function Calling) ==========
/**
 * 函数定义（OpenAI 标准）
 */
export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, any>; // JSON Schema 对象
}

/**
 * 工具定义（目前仅支持 function 类型）
 */
export interface Tool {
  type: 'function';
  function: FunctionDefinition;
}

/**
 * 工具选择策略
 * - 'none': 不调用任何工具
 * - 'auto': 模型自行决定是否调用以及调用哪个工具
 * - 指定函数：强制模型调用特定函数
 */
export type ToolChoice = 'none' | 'auto' | { type: 'function'; function: { name: string } };

/**
 * 工具调用（模型请求调用工具时返回）
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON 格式的参数字符串
  };
}

// ========== 图像生成 (OpenAI 兼容) ==========

/**
 * 图像生成请求参数
 * @see https://platform.openai.com/docs/api-reference/images/create
 */
export interface ImageGenerationParams {
  model?: string;               // 如 dall-e-3, 或平台自定义模型
  prompt: string;               // 图像描述
  n?: number;                   // 生成数量，默认 1
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  response_format?: 'url' | 'b64_json';
  style?: 'vivid' | 'natural';
  user?: string;
  negative_prompt?: string;      // 阿里云：反向提示词
  prompt_extend?: boolean;       // 阿里云：是否自动扩写提示词
  watermark?: boolean;           // 阿里云：是否添加水印
  seed?: number;                 // 阿里云：随机种子
  image?: string;                // 阿里云：以图生图的参考图 URL / 本地路径 (暂简单)
}

/**
 * 图像生成响应中的单个图片数据
 */
export interface ImageData {
  url?: string;                 // 当 response_format='url' 时存在
  b64_json?: string;            // 当 response_format='b64_json' 时存在
  revised_prompt?: string;      // 模型修改后的提示词（如 dall-e-3）
}

/**
 * 图像生成响应 (OpenAI 兼容)
 */
export interface ImageGenerationResponse {
  created: number;
  data: ImageData[];
}

// ========== 文件管理 (可选，用于 Assistants API，暂不实现完整) ==========
// 可后续扩展，先预留类型

export interface FileObject {
  id: string;
  bytes: number;
  created_at: number;
  filename: string;
  object: 'file';
  purpose: 'assistants' | 'fine-tune' | 'vision';
}

// ========== 通用类型 (已有) ==========

export type LogDetail = 1 | 2 | 3;
export type LogMode = 'single' | 'daily' | 'append';

export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  setLevel(level: number): void;
}

export interface RequestStats {
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

export interface StatsCollector {
  onRequestStart(requestId: string, baseUrl: string, model: string, stream: boolean): void;
  onRetry(requestId: string, attempt: number, wait: number, reason: string): void;
  onTtfb(requestId: string, ttfbMs: number): void;
  onRequestEnd(stats: RequestStats): void;
}

// ========== 嵌入向量 ==========

  export interface EmbeddingParams {
    model: string;
    // OpenAI 风格
    input?: string | string[];
    // 阿里云多模态风格
    contents?: Array<{
      text?: string;
      image?: string;
      video?: string;
      multi_images?: string[];
    }>;
    // 通用参数
    dimension?: number;
    encoding_format?: 'float' | 'base64';
    user?: string;
    // 阿里云专用
    text_type?: 'query' | 'document';
    res_level?: number;           // 0-3
    max_video_frames?: number;
    enable_fusion?: boolean;
    instruct?: string;
    fps?: number;
    // 标记
    multimodal?: boolean;         // 是否为多模态模型（需从 models.json 传入）
  }

export interface Embedding {
  object: 'embedding';
  index: number;
  embedding: number[] | string; // 如果 encoding_format='base64' 则为 string
}

export interface EmbeddingResponse {
  object: 'list';
  data: Embedding[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}



// ========== 文本转语音 (TTS) ==========
export interface AudioSpeechParams {
  model: string;
  // OpenAI 标准字段
  input?: string;
  voice?: string;
  speed?: number;
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'pcm';
  
  // 阿里云 DashScope 特有字段
  text?: string;                // 文本内容，与 input 互斥
  language_type?: string;       // 如 'Chinese', 'English'
  instructions?: string;        // 指令控制
  optimize_instructions?: boolean;
  stream?: boolean;
  
  // 允许扩展
  [key: string]: any;
}

export type AudioSpeechResponse = Buffer;


// ========== 音频转录（语音转文字） ==========
export interface AudioTranscriptionParams {
  file: Buffer | string;           // 音频文件：Buffer 或本地文件路径
  model: string;                   // 模型名称，如 'whisper-1'
  language?: string;               // 语言代码，如 'zh', 'en'
  prompt?: string;                 // 可选提示词
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;            // 0-1
  timestamp_granularities?: ('word' | 'segment')[];
}

export interface AudioTranscriptionResponse {
  text: string;                    // 当 response_format 为 'json' 或默认时
  task?: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}


// ========== 文件管理 ==========
export interface FileObject {
  id: string;
  bytes: number;
  created_at: number;
  filename: string;
  object: 'file';
  purpose: 'assistants' | 'fine-tune' | 'vision';
  deleted?: boolean;
  url?: string;
}

export interface FileListResponse {
  object: 'list';
  data: FileObject[];
}

export interface FileUploadParams {
  file: Buffer | string;
  purpose: 'assistants' | 'fine-tune' | 'vision' | 'batch';
  filename?: string;
}
export interface FileDeleteResponse {
  id: string;
  object: 'file';
  deleted: boolean;
}


// ========== 阿里云百炼 OSS 临时上传 ==========
export interface UploadPolicy {
  oss_access_key_id: string;
  signature: string;
  policy: string;
  upload_dir: string;
  upload_host: string;
  expire_in_seconds: number;
  max_file_size_mb: number;
  x_oss_object_acl: string;
  x_oss_forbid_overwrite: string;
}

export interface GetUploadUrlParams {
  model: string;          // 模型名称，如 'qwen-vl-plus'
}

export interface UploadToOssParams {
  file: Buffer | string;  // 文件内容或路径
  model: string;          // 模型名称
}


// ========== 批处理 (Batches) ==========
export interface Batch {
  id: string;
  object: 'batch';
  endpoint: string;
  input_file_id: string;
  completion_window: string;
  status: 'validating' | 'in_progress' | 'completed' | 'failed' | 'expired' | 'cancelling' | 'cancelled';
  output_file_id?: string;
  error_file_id?: string;
  created_at: number;
  completed_at?: number;
  expired_at?: number;
  cancelled_at?: number;
  cancelling_at?: number;
  request_counts: {
    total: number;
    completed: number;
    failed: number;
  };
  metadata?: Record<string, string>;
}

export interface BatchCreateParams {
  input_file_id: string;
  endpoint: string;          // 例如 '/v1/chat/completions'
  completion_window: string; // 例如 '24h'
  metadata?: Record<string, string>;
}

export interface BatchListResponse {
  object: 'list';
  data: Batch[];
  first_id?: string;
  last_id?: string;
  has_more: boolean;
}

