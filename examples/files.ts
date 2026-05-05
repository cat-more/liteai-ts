/**
 * LiteAI SDK - 文件管理示例
 * 
 * 用法：
 *   npm run files -- upload ./example.txt assistants   # 上传文件
 *   npm run files -- list                              # 列出所有文件
 *   npm run files -- retrieve file-xxx                 # 获取文件信息
 *   npm run files -- delete file-xxx                   # 删除文件
 *   npm run files -- content file-xxx ./downloaded.txt # 下载文件内容
 */

import * as fs from 'fs';
import * as path from 'path';
import { LiteAI, createLogger } from '../src';

interface ModelConfig {
  id: string;
  name: string;
  files?: boolean;          // 自定义标记：是否支持文件管理 API
  purpose?: string;         // 或使用 purpose 字段（如 'assistants'）
  [key: string]: any;
}

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
}

interface ModelsJson {
  models: { providers: Record<string, ProviderConfig> };
}

/**
 * 获取第一个支持文件管理的模型（files: true 或 purpose 包含 'assistants'）
 */
function getFileCapableModel(): { baseUrl: string; apiKey: string; model: ModelConfig } {
  const configPath = path.join(__dirname, '../models.json');
  if (!fs.existsSync(configPath)) throw new Error(`配置文件不存在: ${configPath}`);
  const config: ModelsJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const providers = config.models.providers;

  for (const provider of Object.values(providers)) {
    for (const model of provider.models) {
      // 判断是否支持文件管理 API
      if (model.files === true || model.purpose === 'assistants') {
        return { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model };
      }
    }
  }
  throw new Error(
    '没有找到支持文件管理的模型。请在 models.json 中为某个模型添加 "files": true 或 "purpose": "assistants" 标记。'
  );
}

async function getClient() {
  const { baseUrl, apiKey, model } = getFileCapableModel();
  console.log(`使用模型: ${model.name || model.id} (${baseUrl})`);

  const logDir = path.join(__dirname, '../logs/files');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const rawLogger = createLogger({
    logFile: path.join(logDir, '{YYYYMMDD_HHMMSS}_raw.log'),
    logLevel: 10,
    consoleLog: false,
    logDetail: 3,
  });
  const client = new LiteAI({
    apiKey,
    baseUrl,
    logFile: path.join(logDir, '{YYYYMMDD_HHMM}_files.log'),
    logLevel: 10,
    consoleLog: true,
    rawLogger,
  });
  return client;
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];
  if (!action) {
    console.error('Usage: npm run files -- <action> [params...]');
    console.error('Actions: upload, list, retrieve, delete, content');
    process.exit(1);
  }

  const client = await getClient();

  switch (action) {
    case 'upload': {
      const filePath = args[1];
      const purpose = args[2] as 'assistants' | 'fine-tune' | 'vision';
      if (!filePath || !purpose) {
        console.error('Upload: need filePath and purpose (assistants/fine-tune/vision)');
        process.exit(1);
      }
      const result = await client.files.upload({ file: filePath, purpose });
      console.log('Uploaded file:', result);
      break;
    }
    case 'list': {
      const purpose = args[1] as 'assistants' | 'fine-tune' | 'vision' | undefined;
      const files = await client.files.list(purpose);
      console.log('Files:', files.data);
      break;
    }
    case 'retrieve': {
      const fileId = args[1];
      if (!fileId) { console.error('Need fileId'); process.exit(1); }
      const file = await client.files.retrieve(fileId);
      console.log('File info:', file);
      break;
    }
    case 'delete': {
      const fileId = args[1];
      if (!fileId) { console.error('Need fileId'); process.exit(1); }
      const result = await client.files.delete(fileId);
      console.log('Delete result:', result);
      break;
    }
    case 'content': {
      const fileId = args[1];
      const outputPath = args[2];
      if (!fileId || !outputPath) {
        console.error('Need fileId and outputPath');
        process.exit(1);
      }
      const buffer = await client.files.content(fileId);
      fs.writeFileSync(outputPath, buffer);
      console.log(`File content saved to ${outputPath} (${buffer.length} bytes)`);
      break;
    }
    default:
      console.error(`Unknown action: ${action}`);
  }
}

main().catch(console.error);