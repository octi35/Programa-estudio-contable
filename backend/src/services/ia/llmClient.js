/**
 * Cliente LLM genérico sobre APIs compatibles con OpenAI chat-completions.
 *
 * Default: Groq (https://console.groq.com — tier gratuito, modelos Llama,
 * sin tarjeta). Configurable por env para apuntar a cualquier endpoint
 * compatible (OpenRouter, Together, Ollama local, etc.):
 *
 *   LLM_API_KEY      → API key (en Groq es gratis)
 *   LLM_BASE_URL     → default https://api.groq.com/openai/v1
 *   LLM_MODEL        → default llama-3.3-70b-versatile (chat + tools)
 *   LLM_VISION_MODEL → default meta-llama/llama-4-scout-17b-16e-instruct (imágenes)
 */

const BASE_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'llama-3.3-70b-versatile';
const VISION_MODEL = process.env.LLM_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';

const habilitado = () => Boolean(API_KEY);

/**
 * POST /chat/completions. `payload` sigue el formato OpenAI
 * (messages, tools, response_format, etc.).
 */
async function chatCompletion(payload) {
  if (!API_KEY) {
    throw Object.assign(new Error('LLM no configurado (falta LLM_API_KEY / GROQ_API_KEY)'), { statusCode: 503 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '');
      const err = new Error(`LLM API ${res.status}: ${cuerpo.slice(0, 300)}`);
      err.statusCode = res.status === 429 ? 429 : 502;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatCompletion, habilitado, MODEL, VISION_MODEL };
