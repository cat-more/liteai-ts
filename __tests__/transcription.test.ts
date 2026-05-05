import nock from 'nock';
import { LiteAI, AudioTranscriptionResponse } from '../src';

describe('LiteAI Audio Transcriptions', () => {
  afterEach(() => nock.cleanAll());

  it('should transcribe audio file (multipart)', async () => {
    const mockResponse: AudioTranscriptionResponse = {
      text: 'Hello world',
    };

    // 由于 multipart 请求体复杂，我们只拦截路径并返回固定响应
    const scope = nock('https://api.openai.com')
      .post('/v1/audio/transcriptions')
      .reply(200, mockResponse);

    const client = new LiteAI({ apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' });
    const result = await client.audio.transcriptions.create({
      file: Buffer.from('fake audio data'),
      model: 'whisper-1',
    });

    expect(result.text).toBe('Hello world');
    scope.done();
  });
});
