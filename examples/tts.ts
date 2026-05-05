/**
 * LiteAI SDK - 文本转语音 (TTS) 示例（兼容 OpenAI 和阿里云，支持自动目录/文件处理）
 * 
 * 用法：
 *   npm run tts -- 1 "你好世界"                        # 保存到 ./myaudio/speech_xxx.mp3
 *   npm run tts -- 1 "你好" ./myaudio/hello.mp3       # 保存到指定文件
 *   npm run tts -- 1 "你好" ./myaudio/                # 保存到目录，自动命名
 */

import * as fs from 'fs';
import * as path from 'path';
import { LiteAI, createLogger, AudioSpeechParams } from '../src';

interface ModelConfig {
  id: string;
  name: string;
  tts?: boolean;
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

function getTTSModels(): { baseUrl: string; apiKey: string; model: ModelConfig }[] {
  const configPath = path.join(__dirname, '../models.json');
  if (!fs.existsSync(configPath)) throw new Error(`配置文件不存在: ${configPath}`);
  const content = fs.readFileSync(configPath, 'utf-8');
  const config: ModelsJson = JSON.parse(content);
  const result: { baseUrl: string; apiKey: string; model: ModelConfig }[] = [];
  for (const provider of Object.values(config.models.providers)) {
    for (const model of provider.models) {
      if (model.tts === true || model.id?.startsWith('tts-')) {
        result.push({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model });
      }
    }
  }
  if (result.length === 0) throw new Error('没有配置任何支持 TTS 的模型（tts: true 或模型 id 以 tts- 开头）');
  return result;
}

function getArgs(): { index: number; text: string; outputPath: string } {
  const args = process.argv.slice(2);
  let index = 1;
  let text = '你好，欢迎使用 LiteAI 文本转语音功能。';
  let outputPath = '';
  if (args.length >= 1) index = parseInt(args[0], 10) || 1;
  if (args.length >= 2) text = args[1];
  if (args.length >= 3) outputPath = args[2];
  if (outputPath === '') outputPath = './myaudio/';
  return { index, text, outputPath };
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  try {
    const models = getTTSModels();
    const { index, text, outputPath } = getArgs();
    if (index < 1 || index > models.length) throw new Error(`无效序号 ${index}，共 ${models.length} 个 TTS 模型`);
    const { baseUrl, apiKey, model } = models[index - 1];
    console.log(`使用 TTS 模型: ${model.name || model.id}`);
    console.log(`文本: ${text}`);
    console.log(`输出路径: ${outputPath}`);

    const logDir = path.join(__dirname, '../logs/tts');
    ensureDir(logDir);

    const client = new LiteAI({
      apiKey,
      baseUrl,
      timeout: 60,
      logFile: path.join(logDir, '{YYYYMMDD_HHMM}_tts.log'),
      consoleLog: true,
      logLevel: 10,
    });

    const params: AudioSpeechParams = {
      model: model.id,
      input: text,
      voice: 'Cherry',   // 阿里云支持 Cherry，OpenAI 支持 alloy 等
      speed: 1.0,
      response_format: 'mp3',
    };

    const audioBuffer = await client.audio.speech.create(params);

    // 确定保存路径
    let finalPath: string;
    const parsed = path.parse(outputPath);
    if (parsed.ext === '') {
      const dir = outputPath.replace(/[/\\]$/, '');
      ensureDir(dir);
      finalPath = path.join(dir, `speech_${Date.now()}.mp3`);
    } else {
      ensureDir(path.dirname(outputPath));
      finalPath = outputPath;
      if (!finalPath.match(/\.(mp3|opus|aac|flac|pcm|wav)$/i)) finalPath += '.mp3';
    }

    fs.writeFileSync(finalPath, audioBuffer);
    console.log(`音频已保存到: ${finalPath} (${audioBuffer.length} 字节)`);
  } catch (err) {
    console.error(err);
  }
}

main();