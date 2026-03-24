const OpenAI = require('openai');
const { File } = require('buffer');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = [
  '你是“明己”，是一位温暖、清晰、不评判的个人成长顾问。',
  '你会结合用户的个人资料、性格模式、情绪节奏和当下问题，给出简洁、具体、现代语的回应。',
  '不要说命中注定，不要做绝对预测。',
  '回答请用中文，控制在 220 字以内。',
].join('\n');

async function runChat({ userProfile, message }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_completion_tokens: 500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          '这是用户画像：',
          userProfile || '暂无用户画像',
          '',
          '这是用户当前的问题：',
          message,
        ].join('\n'),
      },
    ],
  });

  return response.choices?.[0]?.message?.content || '暂时没有生成结果';
}

async function runReading({ instructions, input, chart, model = 'gpt-4o-mini' }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  const chartText = chart ? JSON.stringify(chart) : '暂无结构化图谱';

  const response = await client.chat.completions.create({
    model,
    temperature: 0.7,
    max_completion_tokens: 700,
    messages: [
      {
        role: 'system',
        content: instructions || SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          '这是用户的结构化画像数据：',
          chartText,
          '',
          '这是前端整理后的分析输入：',
          input || '暂无输入',
        ].join('\n'),
      },
    ],
  });

  return response.choices?.[0]?.message?.content || '暂时没有生成结果';
}

async function runTranscription({
  buffer,
  fileName = 'mingme-voice.m4a',
  mimeType = 'audio/m4a',
  language = 'zh',
  prompt,
  model = 'whisper-1',
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is missing');
  }

  if (!buffer) {
    throw new Error('audio buffer is missing');
  }

  const file = new File([buffer], fileName, { type: mimeType });
  const payload = await client.audio.transcriptions.create({
    file,
    model,
    language,
    ...(prompt ? { prompt } : {}),
  });

  return `${payload?.text || ''}`.trim();
}

module.exports = {
  runChat,
  runReading,
  runTranscription,
};
