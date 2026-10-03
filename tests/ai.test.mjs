import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, answerQuestion, AIError } from '../dist/ai.js';

const plan = { goal: 'Organize a community garden', context: 'Budget is $200', tasks: ['Ask neighbors about space'], nextSteps: ['Measure the plot'], followups: [], informationNeeded: ['What is the available space?'] };
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;

function reply(content, extra = {}) {
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) }, ...extra }] }), { status: 200 });
}

test('real AI contract and failures', async t => {
  try {
    process.env.OPENAI_API_KEY = 'test-only';
    await t.test('arbitrary plan request reaches provider with schema and server key', async () => {
      globalThis.fetch = async (url, init) => {
        assert.equal(url, 'https://api.openai.com/v1/chat/completions');
        assert.equal(init.headers.Authorization, 'Bearer test-only');
        const body = JSON.parse(init.body);
        assert.equal(body.messages[1].content, 'Help me organize a community garden for $200');
        assert.equal(body.response_format.json_schema.strict, true);
        assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
        return reply(plan);
      };
      assert.deepEqual(await generatePlan('Help me organize a community garden for $200'), plan);
    });
    await t.test('answers use their own schema', async () => {
      const answer = { answer: 'Plants need light', explanation: 'Light supports photosynthesis', uncertainties: [], recommendedActions: [], followUpQuestions: [] };
      globalThis.fetch = async (_, init) => {
        assert.equal(JSON.parse(init.body).response_format.json_schema.name, 'lifepilot_answer');
        return reply(answer);
      };
      assert.deepEqual(await answerQuestion('Why do plants need light?'), answer);
    });
    await t.test('invalid inputs make no provider calls', async () => {
      globalThis.fetch = async () => { assert.fail('unexpected provider call'); };
      for (const input of [null, '', '  ', 'x'.repeat(1001)]) {
        await assert.rejects(generatePlan(input), error => error instanceof AIError && error.status === 400);
      }
    });
    await t.test('missing key fails explicitly', async () => {
      delete process.env.OPENAI_API_KEY;
      await assert.rejects(generatePlan('a garden'), error => error.status === 503);
      process.env.OPENAI_API_KEY = 'test-only';
    });
    await t.test('provider authentication, billing, and server failures', async () => {
      for (const [status, expected] of [[401,503],[403,503],[429,503],[500,502]]) {
        globalThis.fetch = async () => new Response('{}', { status });
        await assert.rejects(generatePlan('a garden'), error => error.status === expected);
      }
    });
    await t.test('malformed, incomplete and refused responses never become fake plans', async () => {
      for (const response of [reply({ goal: 'incomplete' }), reply(plan, { finish_reason: 'length' }), reply(plan, { message: { refusal: 'refused' } }), new Response('{bad json')]) {
        globalThis.fetch = async () => response;
        await assert.rejects(generatePlan('a garden'), error => [422,502].includes(error.status));
      }
      globalThis.fetch = async () => { throw new Error('network down'); };
      await assert.rejects(generatePlan('a garden'), error => error.status === 502);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('plan revisions carry original constraints and completed work', async () => {
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    globalThis.fetch = async (_, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.messages.length, 3);
      const context = body.messages[1].content;
      assert.match(context, /\$200/);
      assert.match(context, /Measure the plot/);
      assert.equal(body.messages[2].content, 'My budget is now $100');
      return reply(plan);
    };
    const revision = { originalRequest: 'Garden with $200 and four volunteers', plan, completedTasks: ['Measure the plot'] };
    assert.deepEqual(await generatePlan('My budget is now $100', revision), plan);
    await assert.rejects(async () => generatePlan('Update', { bad: true }), error => error.status === 400);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
  }
});

test('photo and PDF inputs reach the provider as actual multimodal content', async () => {
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-only';
  try {
    const image = { name: 'photo.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') };
    const pdf = { name: 'quote.pdf', mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\nexample').toString('base64') };
    globalThis.fetch = async (_, init) => {
      const body = JSON.parse(init.body);
      const content = body.messages.at(-1).content;
      assert.equal(content[0].text, 'Explain my quote and photo');
      assert.equal(content.find(part => part.type === 'image_url').image_url.url, image.dataUrl);
      assert.deepEqual(content.find(part => part.type === 'file').file, { filename: 'quote.pdf', file_data: pdf.dataUrl });
      return reply({ answer: 'Example', explanation: '', uncertainties: [], recommendedActions: [], followUpQuestions: [] });
    };
    await answerQuestion('Explain my quote and photo', [image, pdf]);
    globalThis.fetch = async () => { assert.fail('Invalid attachment must not reach the provider'); };
    for (const files of [
      [{ ...image, dataUrl: 'https://example.com/photo.png' }],
      [{ ...image, mimeType: 'application/msword' }],
      [{ ...image, dataUrl: 'data:image/png;base64,' + Buffer.from('not a PNG').toString('base64') }],
      [image, image, image, image],
      [{ ...pdf, dataUrl: 'data:application/pdf;base64,' + Buffer.from('%PDF-' + 'x'.repeat(5 * 1024 * 1024)).toString('base64') }]
    ]) await assert.rejects(answerQuestion('Explain', files), error => error.status === 400);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
  }
});
