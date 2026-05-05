import { LiteAI } from '../src';
import * as path from 'path';

async function main() {
  const client = new LiteAI({
    apiKey: 'sk-',  // 请替换为真实 API Key
    baseUrl: 'https://dashscope.aliyuncs.com',
  });

  const ossUrl = await client.uploads.getTemporaryUrl({
    file: './myimages/cat.png',
    model: 'qwen-vl-plus',
  });
  console.log('临时URL (有效48小时):', ossUrl);
  // 在调用视觉模型时，需要在 header 中添加 X-DashScope-OssResourceResolve: enable
}

main().catch(console.error);