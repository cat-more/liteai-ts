import nock from 'nock';
import { LiteAI, Batch } from '../src';

describe('LiteAI Batches', () => {
  const baseUrl = 'https://api.openai.com/v1';
  const apiKey = 'test-key';
  let client: LiteAI;

  beforeEach(() => {
    client = new LiteAI({ apiKey, baseUrl });
  });

  afterEach(() => nock.cleanAll());

  it('should create a batch', async () => {
    const mockBatch: Batch = {
      id: 'batch_abc123',
      object: 'batch',
      endpoint: '/v1/chat/completions',
      input_file_id: 'file-xyz',
      completion_window: '24h',
      status: 'validating',
      created_at: Date.now(),
      request_counts: { total: 100, completed: 0, failed: 0 },
    };
    nock(baseUrl)
      .post('/batches', (body) => {
        expect(body.input_file_id).toBe('file-xyz');
        expect(body.endpoint).toBe('/v1/chat/completions');
        return true;
      })
      .reply(200, mockBatch);
    const batch = await client.batches.create({
      input_file_id: 'file-xyz',
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    });
    expect(batch.id).toBe('batch_abc123');
  });

  it('should retrieve a batch', async () => {
    const mockBatch: Batch = {
      id: 'batch_abc123',
      object: 'batch',
      endpoint: '/v1/chat/completions',
      input_file_id: 'file-xyz',
      completion_window: '24h',
      status: 'completed',
      output_file_id: 'file-out',
      created_at: Date.now(),
      request_counts: { total: 100, completed: 100, failed: 0 },
    };
    nock(baseUrl).get('/batches/batch_abc123').reply(200, mockBatch);
    const batch = await client.batches.retrieve('batch_abc123');
    expect(batch.status).toBe('completed');
    expect(batch.output_file_id).toBe('file-out');
  });

  it('should list batches', async () => {
    const mockList = {
      object: 'list',
      data: [
        { id: 'batch1', status: 'completed', request_counts: { total: 10, completed: 10, failed: 0 } },
        { id: 'batch2', status: 'in_progress', request_counts: { total: 20, completed: 5, failed: 0 } },
      ],
      has_more: false,
    };
    nock(baseUrl).get('/batches?limit=10').reply(200, mockList);
    const result = await client.batches.list(10);
    expect(result.data.length).toBe(2);
    expect(result.data[0].id).toBe('batch1');
  });

  it('should cancel a batch', async () => {
    const mockBatch: Batch = {
      id: 'batch_abc123',
      object: 'batch',
      endpoint: '/v1/chat/completions',
      input_file_id: 'file-xyz',
      completion_window: '24h',
      status: 'cancelling',
      created_at: Date.now(),
      request_counts: { total: 50, completed: 10, failed: 0 },
    };
    nock(baseUrl).post('/batches/batch_abc123/cancel').reply(200, mockBatch);
    const batch = await client.batches.cancel('batch_abc123');
    expect(batch.status).toBe('cancelling');
  });
});