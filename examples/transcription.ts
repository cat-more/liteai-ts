/**
 * LiteAI SDK - 音频转录示例（语音转文字）
 * 使用支持语音识别的模型（如 whisper-1）
 * 
 * 用法：
 *   npx ts-node examples/transcription.ts [模型序号] [音频文件路径]
 *   npm run transcribe -- 1 ./audio.mp3
 */

import * as fs from 'fs';
import * as path from 'path';
import { LiteAI, createLogger, AudioTranscriptionParams } from '../src';

interface ModelConfig {
  id: string;
  name: string;
  transcription?: boolean;   // 标记是否支持语音识别
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

function getTranscriptionModels(): { baseUrl: string; apiKey: string; model: ModelConfig }[] {
  const configPath = path.join(__dirname, '../models.json');
  if (!fs.existsSync(configPath)) throw new Error(`配置文件不存在: ${configPath}`);
  const content = fs.readFileSync(configPath, 'utf-8');
  const config: ModelsJson = JSON.parse(content);
  const result: { baseUrl: string; apiKey: string; model: ModelConfig }[] = [];
  for (const provider of Object.values(config.models.providers)) {
    for (const model of provider.models) {
      if (model.transcription === true || model.id?.startsWith('whisper-')) {
        result.push({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model });
      }
    }
  }
  if (result.length === 0) throw new Error('没有配置任何支持语音识别的模型（transcription: true 或模型 id 以 whisper- 开头）');
  return result;
}

function getArgs(): { index: number; filePath: string } {
  const args = process.argv.slice(2);
  let index = 1;
  let filePath = '';
  if (args.length >= 1) index = parseInt(args[0], 10) || 1;
  if (args.length >= 2) filePath = args[1];
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('请提供有效的音频文件路径');
    process.exit(1);
  }
  return { index, filePath };
}

const logDir = path.join(__dirname, '../logs/transcription');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const rawLogger = createLogger({
  logFile: path.join(logDir, '{YYYYMMDD_HHMMSS}_raw.log'),
  logLevel: 10,
  consoleLog: false,
  logDetail: 3,
});

async function main() {
  try {
    const models = getTranscriptionModels();
    const { index, filePath } = getArgs();
    if (index < 1 || index > models.length) throw new Error(`无效序号 ${index}，共 ${models.length} 个转录模型`);
    const { baseUrl, apiKey, model } = models[index - 1];
    console.log(`使用转录模型: ${model.name || model.id}`);
    console.log(`音频文件: ${filePath}`);

    const client = new LiteAI({
      apiKey,
      baseUrl,
      timeout: 120,
      logFile: path.join(logDir, '{YYYYMMDD_HHMM}_transcription.log'),
      consoleLog: true,
      logLevel: 10,
    });

    const params: AudioTranscriptionParams = {
      file: filePath,      // 支持文件路径或 Buffer
      model: model.id,
      language: 'zh',      // 可选
      response_format: 'json',
    };

    const result = await client.audio.transcriptions.create(params);
    console.log('转录结果:', result.text);
    if (result.segments) {
      console.log('分段详情:', JSON.stringify(result.segments, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

main();