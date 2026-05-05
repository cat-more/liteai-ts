import nock from 'nock';
import { LiteAI } from '../src';

describe('LiteAI Embeddings', () => {
  afterEach(() => nock.cleanAll());

  it('should send correct request and parse response', async () => {
    const mockResponse = {
      object: 'list',
      data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
      model: 'text-embedding-ada-002',
      usage: { prompt_tokens: 10, total_tokens: 10 }
    };

    nock('https://api.openai.com')
      .post('/v1/embeddings')
      .reply(200, mockResponse);

    const client = new LiteAI({ apiKey: 'test-key' });
    const result = await client.embeddings.create({
      model: 'text-embedding-ada-002',
      input: 'Hello world'
    });

    expect(result.data[0].embedding).toEqual([0.1, 0.2]);
  });
});