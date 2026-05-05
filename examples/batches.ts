/**
 * LiteAI SDK - 批处理 (Batch) 示例
 * 
 * 流程：
 * 1. 上传 JSONL 文件（purpose='batch'）
 * 2. 创建批处理任务
 * 3. 轮询任务状态直到完成
 * 4. 下载结果文件
 * 
 * 用法：
 *   npm run batches -- upload ./requests.jsonl   # 上传文件并创建批处理
 *   npm run batches -- list                     # 列出所有批处理任务
 *   npm run batches -- retrieve <batchId>       # 查询任务状态
 *   npm run batches -- cancel <batchId>         # 取消任务
 *   npm run batches -- download <fileId>        # 下载结果文件
 */

import * as fs from 'fs';
import * as path from 'path';
import { LiteAI, createLogger, Batch, BatchListResponse } from '../src';
import { pollUntilComplete } from '../src';

interface ModelConfig {
  id: string;
  name: string;
  files?: boolean;   // 支持文件管理的模型
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

// 获取支持文件管理的模型（用于初始化客户端）
function getFileCapableModel(): { baseUrl: string; apiKey: string; model: ModelConfig } {
  const configPath = path.join(__dirname, '../models.json');
  if (!fs.existsSync(configPath)) throw new Error(`配置文件不存在: ${configPath}`);
  const config: ModelsJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const providers = config.models.providers;
  for (const provider of Object.values(providers)) {
    for (const model of provider.models) {
      if (model.files === true || model.purpose === 'assistants') {
        return { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model };
      }
    }
  }
  throw new Error('没有找到支持文件管理的模型。请配置 files: true 的模型。');
}

// 日志目录
const logDir = path.join(__dirname, '../logs/batches');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const rawLogger = createLogger({
  logFile: path.join(logDir, '{YYYYMMDD_HHMMSS}_raw.log'),
  logLevel: 10,
  consoleLog: false,
  logDetail: 3,
});

async function getClient() {
  const { baseUrl, apiKey, model } = getFileCapableModel();
  console.log(`使用模型: ${model.name || model.id} (${baseUrl})`);
  const client = new LiteAI({
    apiKey,
    baseUrl,
    logFile: path.join(logDir, '{YYYYMMDD_HHMM}_batches.log'),
    logLevel: 10,
    consoleLog: true,
    rawLogger,
  });
  return client;
}

// 轮询任务状态直到完成或失败
// async function waitForBatch(client: LiteAI, batchId: string, intervalMs: number = 5000): Promise<Batch> {
//   while (true) {
//     const batch = await client.batches.retrieve(batchId);
//     console.log(`[${new Date().toISOString()}] 状态: ${batch.status}, 已完成: ${batch.request_counts.completed}/${batch.request_counts.total}`);
//     if (batch.status === 'completed' || batch.status === 'failed' || batch.status === 'expired' || batch.status === 'cancelled') {
//       return batch;
//     }
//     await new Promise(resolve => setTimeout(resolve, intervalMs));
//   }
// }
import { pollUntilComplete } from '../src';

// 之前的 waitForBatch 可改为更简洁的实现
async function waitForBatch(client: LiteAI, batchId: string, options?: { interval?: number; timeout?: number }) {
  return pollUntilComplete(
    () => client.batches.retrieve(batchId),
    (batch) => ['completed', 'failed', 'expired', 'cancelled'].includes(batch.status),
    {
      interval: options?.interval || 5000,
      timeout: options?.timeout || 3600000, // 默认1小时
      onRetry: (attempt, batch) => {
        console.log(`[轮询 #${attempt}] 状态: ${batch.status}, 已完成: ${batch.request_counts.completed}/${batch.request_counts.total}`);
      }
    }
  );
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];
  if (!action) {
    console.error('用法: npm run batches -- <action> [params...]');
    console.error('Actions: upload, list, retrieve, cancel, download');
    process.exit(1);
  }

  const client = await getClient();

  switch (action) {
    case 'upload': {
      const filePath = args[1];
      if (!filePath) {
        console.error('请提供 JSONL 文件路径');
        process.exit(1);
      }
      // 1. 上传文件
      const fileObj = await client.files.upload({ file: filePath, purpose: 'batch' });
      console.log('文件上传成功:', fileObj.id);
      // 2. 创建批处理任务
      const batch = await client.batches.create({
        input_file_id: fileObj.id,
        endpoint: '/v1/chat/completions',
        completion_window: '24h',
      });
      console.log('批处理任务已创建:', batch.id);
      // 3. 等待完成
      console.log('等待批处理完成...');
      const completedBatch = await waitForBatch(client, batch.id);
      if (completedBatch.status === 'completed' && completedBatch.output_file_id) {
        console.log('批处理完成，结果文件ID:', completedBatch.output_file_id);
        // 4. 下载结果文件
        const buffer = await client.files.content(completedBatch.output_file_id);
        const outputPath = `batch_output_${Date.now()}.jsonl`;
        fs.writeFileSync(outputPath, buffer);
        console.log(`结果已保存到: ${outputPath}`);
      } else {
        console.log(`批处理最终状态: ${completedBatch.status}`);
        if (completedBatch.error_file_id) {
          const errorBuffer = await client.files.content(completedBatch.error_file_id);
          console.log('错误文件内容:', errorBuffer.toString());
        }
      }
      break;
    }
    case 'list': {
      const limit = args[1] ? parseInt(args[1], 10) : 20;
      const result = await client.batches.list(limit);
      console.log('批处理任务列表:');
      result.data.forEach(b => {
        console.log(`- ${b.id} [${b.status}] ${b.request_counts.completed}/${b.request_counts.total}`);
      });
      break;
    }
    case 'retrieve': {
      const batchId = args[1];
      if (!batchId) { console.error('需要 batchId'); process.exit(1); }
      const batch = await client.batches.retrieve(batchId);
      console.log(JSON.stringify(batch, null, 2));
      break;
    }
    case 'cancel': {
      const batchId = args[1];
      if (!batchId) { console.error('需要 batchId'); process.exit(1); }
      const batch = await client.batches.cancel(batchId);
      console.log(`已取消批处理: ${batch.id}, 状态: ${batch.status}`);
      break;
    }
    case 'download': {
      const fileId = args[1];
      const outputPath = args[2] || `download_${Date.now()}.jsonl`;
      if (!fileId) { console.error('需要 fileId'); process.exit(1); }
      const buffer = await client.files.content(fileId);
      fs.writeFileSync(outputPath, buffer);
      console.log(`文件已保存到: ${outputPath}`);
      break;
    }
    default:
      console.error(`未知操作: ${action}`);
  }
}

main().catch(console.error);