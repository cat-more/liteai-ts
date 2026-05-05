import nock from 'nock';
import * as fs from 'fs';
import * as path from 'path';
import { LiteAI, ChatCompletionResponse, EmbeddingResponse, ImageGenerationResponse } from '../src';

// 加载 models.json
const modelsJsonPath = path.join(__dirname, '../models.json');
const modelsJson = JSON.parse(fs.readFileSync(modelsJsonPath, 'utf-8'));

// 辅助函数：获取第一个满足能力的模型，并同时返回是否为阿里云
function getFirstModelWithCapability(capability: string): {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  isAliyun: boolean;
} {
  const providers = modelsJson.models.providers;
  for (const provider of Object.values(providers) as any[]) {
    for (const model of provider.models) {
      if (model[capability] === true) {
        const isAliyun = provider.baseUrl.includes('dashscope.aliyuncs.com');
        return {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          modelId: model.id,
          isAliyun,
        };
      }
    }
  }
  // 如果没有标记能力，返回第一个模型
  const firstProvider = Object.values(providers)[0] as any;
  const firstModel = firstProvider.models[0];
  const isAliyun = firstProvider.baseUrl.includes('dashscope.aliyuncs.com');
  return {
    baseUrl: firstProvider.baseUrl,
    apiKey: firstProvider.apiKey,
    modelId: firstModel.id,
    isAliyun,
  };
}

describe('LiteAI - 5 modules integration (nock)', () => {
  afterEach(() => nock.cleanAll());

  // 1. 聊天补全
  it('should call chat completions with correct request', async () => {
    const { baseUrl, apiKey, modelId, isAliyun } = getFirstModelWithCapability('chat');
    const client = new LiteAI({ apiKey, baseUrl });

    const mockResponse: ChatCompletionResponse = {
      id: 'test-id',
      object: 'chat.completion',
      created: Date.now(),
      model: modelId,
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
    };

    let scope: nock.Scope;
    if (isAliyun) {
      // 阿里云聊天补全路径（多模态生成接口）
      scope = nock(baseUrl)
        .post('/services/aigc/multimodal-generation/generation', (body) => {
          expect(body.model).toBe(modelId);
          // 阿里云消息格式不同，这里简化验证
          expect(body.input.messages[0].content[0].text).toBe('Hi');
          return true;
        })
        .reply(200, {
          output: {
            choices: [{ message: { content: [{ text: 'Hello!' }] } }],
          },
        });
    } else {
      // OpenAI 标准
      scope = nock(baseUrl)
        .post('/chat/completions', (body) => {
          expect(body.model).toBe(modelId);
          expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
          expect(body.stream).toBe(false);
          return true;
        })
        .reply(200, mockResponse);
    }

    const result = await client.chat.completions.create({
      model: modelId,
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false,
    }) as any;

    if (isAliyun) {
      expect(result.choices[0].message.content).toBe('Hello!');
    } else {
      expect(result.choices[0].message.content).toBe('Hello!');
    }
    scope.done();
  });

  // 2. 嵌入
  it('should call embeddings with correct request', async () => {
    const { baseUrl, apiKey, modelId, isAliyun } = getFirstModelWithCapability('embedding');
    const client = new LiteAI({ apiKey, baseUrl });

    const mockResponse: EmbeddingResponse = {
      object: 'list',
      data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] }],
      model: modelId,
      usage: { prompt_tokens: 10, total_tokens: 10 },
    };

    let scope: nock.Scope;
    if (isAliyun) {
      // 阿里云多模态嵌入
      scope = nock(baseUrl)
        .post('/services/embeddings/multimodal-embedding/multimodal-embedding', (body) => {
          expect(body.model).toBe(modelId);
          expect(body.input.contents[0].text).toBe('test text');
          return true;
        })
        .reply(200, {
          output: {
            embeddings: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
          },
          usage: { total_tokens: 10 },
        });
    } else {
      // OpenAI 标准
      scope = nock(baseUrl)
        .post('/embeddings', (body) => {
          expect(body.model).toBe(modelId);
          expect(body.input).toBe('test text');
          return true;
        })
        .reply(200, mockResponse);
    }

    const result = await client.embeddings.create({
      model: modelId,
      input: 'test text',
    });

    expect(result.data[0].embedding).toEqual([0.1, 0.2, 0.3]);
    scope.done();
  });

  // 3. 图像生成
it('should call image generation with correct request', async () => {
  const { baseUrl, apiKey, modelId, isAliyun } = getFirstModelWithCapability('generation');

  const client = new LiteAI({ apiKey, baseUrl });

  // 拦截所有 POST 请求，打印实际请求的 URL 和请求体，并动态响应
  const scope = nock(/.*/)
    .post(/.*/)
    .reply(200, (uri, requestBody) => {
      let body: any;
      if (typeof requestBody === 'string') {
        body = JSON.parse(requestBody);
      } else if (Buffer.isBuffer(requestBody)) {
        body = JSON.parse(requestBody.toString());
      } else {
        body = requestBody;
      }
      
      // 验证模型
      expect(body.model).toBe(modelId);
      // 验证提示词（根据请求体结构动态检查）
      const promptText = body.prompt || body.input?.messages?.[0]?.content?.[0]?.text;
      expect(promptText).toBe('a cat');
      
      // 返回模拟响应（根据请求格式选择合适的响应结构）
      if (body.prompt !== undefined) {
        // OpenAI 格式
        return {
          created: Date.now(),
          data: [{ url: 'https://example.com/image.png' }],
        };
      } else {
        // 阿里云格式
        return {
          output: {
            choices: [{ message: { content: [{ image: 'https://example.com/image.png' }] } }],
          },
        };
      }
    });

  const result = await client.images.generate({
    model: modelId,
    prompt: 'a cat',
    n: 1,
  });

  expect(result.data[0].url).toBe('https://example.com/image.png');
  scope.done();
});


  // 4. 文本转语音（TTS）
  it('should call TTS with correct request', async () => {
    const { baseUrl, apiKey, modelId, isAliyun } = getFirstModelWithCapability('tts');
    const client = new LiteAI({ apiKey, baseUrl });

    const audioBuffer = Buffer.from('fake audio data');
    let scope: nock.Scope;
    if (isAliyun) {
      // 阿里云 TTS 使用多模态生成接口，响应包含 audio.url
      scope = nock(baseUrl)
        .post('/services/aigc/multimodal-generation/generation', (body) => {
          expect(body.model).toBe(modelId);
          expect(body.input.text).toBe('Hello world');
          return true;
        })
        .reply(200, {
          output: {
            audio: { url: 'https://example.com/audio.mp3' },
          },
        });
      // 还需要 mock 音频下载请求
      nock('https://example.com')
        .get('/audio.mp3')
        .reply(200, audioBuffer);
    } else {
      scope = nock(baseUrl)
        .post('/audio/speech', (body) => {
          expect(body.model).toBe(modelId);
          expect(body.input).toBe('Hello world');
          expect(body.voice).toBe('alloy');
          return true;
        })
        .reply(200, audioBuffer, { 'Content-Type': 'audio/mpeg' });
    }

    const result = await client.audio.speech.create({
      model: modelId,
      input: 'Hello world',
      voice: 'alloy',
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toBe('fake audio data');
    scope.done();
  });

  // 5. 视觉（多模态补全）
  it('should call vision chat completions with image_url', async () => {
    const { baseUrl, apiKey, modelId, isAliyun } = getFirstModelWithCapability('vision');
    const client = new LiteAI({ apiKey, baseUrl });

    let scope: nock.Scope;
    if (isAliyun) {
      scope = nock(baseUrl)
        .post('/services/aigc/multimodal-generation/generation', (body) => {
          expect(body.model).toBe(modelId);
          const content = body.input.messages[0].content;
          expect(content[0].text).toBe('Describe this image');
          expect(content[1].image).toBeDefined();
          return true;
        })
        .reply(200, {
          output: {
            choices: [{ message: { content: [{ text: 'A cat' }] } }],
          },
        });
    } else {
      scope = nock(baseUrl)
        .post('/chat/completions', (body) => {
          expect(body.model).toBe(modelId);
          const content = body.messages[0].content;
          expect(content[0].type).toBe('text');
          expect(content[1].type).toBe('image_url');
          expect(content[1].image_url.url).toBe('data:image/png;base64,xxx');
          return true;
        })
        .reply(200, {
          id: 'vis-id',
          object: 'chat.completion',
          created: Date.now(),
          model: modelId,
          choices: [{ index: 0, message: { role: 'assistant', content: 'A cat' }, finish_reason: 'stop' }],
        });
    }

    const result = await client.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
          ],
        },
      ],
      stream: false,
    }) as any;

    expect(result.choices[0].message.content).toBe('A cat');
    scope.done();
  });
});