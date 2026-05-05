/**
 * 辅助函数：URL 拼接、重试等待计算、Header 脱敏、图片编码
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 安全拼接 base_url 和 path，避免重复
 */
export function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  if (base.endsWith('/' + p) || base === p) {
    return base;
  }
  return `${base}/${p}`;
}

/**
 * 解析 Retry-After 头
 */
export function parseRetryAfter(retryAfter: string | undefined): number | null {
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (!isNaN(seconds)) return seconds;
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    const wait = (date - Date.now()) / 1000;
    return wait > 0 ? wait : null;
  }
  return null;
}

/**
 * 计算退避等待时间（秒）
 */
export function calculateWait(
  attempt: number,
  backoffFactor: number,
  maxWait: number,
  retryAfter: number | null
): number {
  if (retryAfter !== null && retryAfter > 0) {
    return Math.min(retryAfter, maxWait);
  }
  let wait = backoffFactor * Math.pow(2, attempt);
  wait = Math.min(wait, maxWait);
  wait += wait * Math.random() * 0.1;
  return wait;
}

/**
 * 对 API Key 进行部分脱敏
 */
function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return '***';
  }
  const prefix = key.slice(0, 4);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * 脱敏 headers（隐藏 Authorization）
 */
export function safeHeaders(headers: Record<string, string>): Record<string, string> {
  const safe = { ...headers };
  const auth = safe['Authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    const maskedToken = maskApiKey(token);
    safe['Authorization'] = `Bearer ${maskedToken}`;
  }
  return safe;
}

/**
 * 延迟函数（毫秒）
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 将本地图片文件转换为 Base64 Data URL (兼容 OpenAI 图像输入格式)
 * @param filePath 图片文件路径 (支持 jpg, png, webp, gif 等)
 * @returns data:image/xxx;base64,...
 */
export async function imageFileToBase64(filePath: string): Promise<string> {
  const data = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const mimeType = ext === 'jpg' ? 'jpeg' : ext; // jpg -> jpeg
  const base64 = data.toString('base64');
  return `data:image/${mimeType};base64,${base64}`;
}

/**
 * 将 URL 或 Base64 字符串标准化为 OpenAI 可接受的 image_url 字段
 * 如果已经是 data:image/...;base64, 或 http(s):// 开头，直接返回；
 * 否则假设是本地路径，尝试转换为 Base64。
 * 注意：此函数会触发同步文件读取（可改用异步），这里提供异步版本。
 */
export async function normalizeImageUrl(input: string): Promise<string> {
  if (input.startsWith('data:image/') || input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }
  // 假设是本地文件路径
  return await imageFileToBase64(input);
}

// ========== multipart/form-data 相关 ==========

/**
 * 多部分表单中的文件项
 */
export interface MultipartFile {
  fieldName: string;   // 表单字段名，如 'file'
  filename: string;    // 上传的文件名
  contentType: string; // MIME 类型，如 'image/png' 或 'application/octet-stream'
  data: Buffer;        // 文件内容（二进制）
}

/**
 * 构建 multipart/form-data 的选项
 */
export interface MultipartFormOptions {
  fields?: Record<string, string>; // 普通文本字段
  files?: MultipartFile[];         // 文件字段
}

/**
 * 构建 multipart/form-data 请求体（零依赖，纯 Buffer 拼接）
 * @returns { body: Buffer, contentType: string } 请求体 Buffer 和 Content-Type 头值
 */
export function createMultipartForm(options: MultipartFormOptions): { body: Buffer; contentType: string } {
  const boundary = `----LiteAIFormBoundary${Date.now()}${Math.random().toString(36)}`;
  const CRLF = '\r\n';
  const parts: Buffer[] = [];

  // 1. 普通字段
  if (options.fields) {
    for (const [key, value] of Object.entries(options.fields)) {
      parts.push(Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
        `${value}${CRLF}`
      ));
    }
  }

  // 2. 文件字段
  if (options.files) {
    for (const file of options.files) {
      parts.push(Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"${CRLF}` +
        `Content-Type: ${file.contentType}${CRLF}${CRLF}`
      ));
      parts.push(file.data);
      parts.push(Buffer.from(CRLF));
    }
  }

  // 3. 结束边界
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));

  const body = Buffer.concat(parts);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  return { body, contentType };
}



// ========== 异步任务轮询工具 ==========

export interface PollOptions {
  interval?: number;        // 轮询间隔（毫秒），默认 2000
  timeout?: number;         // 总超时时间（毫秒），默认 0 表示永不超时
  maxAttempts?: number;     // 最大尝试次数，默认 Infinity
  onRetry?: (attempt: number, result: any) => void; // 每次轮询后的回调
}

/**
 * 轮询异步任务直到完成（或超时/达到最大次数）
 * @param fetcher 获取当前任务状态的异步函数
 * @param isComplete 判断任务是否完成的函数（返回 true 表示完成）
 * @param options 配置选项
 * @returns Promise<TaskResult> 最终的任务结果
 * @throws {Error} 超时或超过最大尝试次数时抛出错误
 */
export async function pollUntilComplete<T>(
  fetcher: () => Promise<T>,
  isComplete: (result: T) => boolean,
  options?: PollOptions
): Promise<T> {
  const {
    interval = 2000,
    timeout = 0,
    maxAttempts = Infinity,
    onRetry,
  } = options || {};

  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    attempt++;
    if (attempt > maxAttempts) {
      throw new Error(`Polling exceeded max attempts (${maxAttempts})`);
    }
    if (timeout > 0 && Date.now() - startTime > timeout) {
      throw new Error(`Polling timeout after ${timeout}ms`);
    }

    const result = await fetcher();
    if (isComplete(result)) {
      return result;
    }

    if (onRetry) {
      onRetry(attempt, result);
    }

    await sleep(interval);
  }
}



