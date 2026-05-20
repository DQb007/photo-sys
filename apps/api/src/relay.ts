import { config } from './config.js';

export interface GenerateImageInput {
  prompt: string;
  size?: string;
  quality?: string;
  count: number;
  referenceImages?: Array<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }>;
}

export interface RelayImage {
  base64: string;
  mimeType: string;
}

export async function generateImages(input: GenerateImageInput): Promise<RelayImage[]> {
  if (!config.OPENAI_BASE_URL || !config.OPENAI_API_KEY) {
    throw new Error('Relay API is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);

  try {
    const response = input.referenceImages?.length
      ? await requestImageEdit(input, controller.signal)
      : await requestImageGeneration(input, controller.signal);

    const responseText = await response.text();
    const payload = parseRelayResponse(responseText);

    if (!response.ok) {
      const detail = payload?.error?.message || shortText(responseText);
      const message = detail
        ? `Relay API failed with ${response.status}: ${detail}`
        : `Relay API failed with ${response.status}`;
      throw new Error(message);
    }

    const images = payload?.data
      ?.map((item) => normalizeRelayImage(item))
      .filter((item): item is RelayImage => Boolean(item));

    if (!images?.length) {
      throw new Error('Relay API returned no image data');
    }

    return images;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Relay API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestImageGeneration(input: GenerateImageInput, signal: AbortSignal) {
  const url = new URL('/v1/images/generations', config.OPENAI_BASE_URL).toString();
  const body: Record<string, unknown> = {
    model: config.IMAGE_MODEL,
    prompt: input.prompt,
    n: input.count
  };

  if (input.size) body.size = input.size;
  if (input.quality) body.quality = input.quality;

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  });
}

async function requestImageEdit(input: GenerateImageInput, signal: AbortSignal) {
  if (!input.referenceImages?.length) {
    throw new Error('Reference image is required for image edit request');
  }

  const url = new URL('/v1/images/edits', config.OPENAI_BASE_URL).toString();
  const form = new FormData();
  form.set('model', config.IMAGE_MODEL);
  form.set('prompt', input.prompt);
  form.set('n', String(input.count));

  if (input.size) form.set('size', input.size);
  if (input.quality) form.set('quality', input.quality);

  for (const referenceImage of input.referenceImages) {
    const arrayBuffer = referenceImage.buffer.buffer.slice(
      referenceImage.buffer.byteOffset,
      referenceImage.buffer.byteOffset + referenceImage.buffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: referenceImage.mimeType });
    form.append('image', blob, referenceImage.filename);
  }

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`
    },
    body: form,
    signal
  });
}

export async function testRelayConnection() {
  if (!config.OPENAI_BASE_URL || !config.OPENAI_API_KEY) {
    throw new Error('Relay API is not configured');
  }

  const url = new URL('/v1/models', config.OPENAI_BASE_URL).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Relay API test failed with ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

interface RelayResponseItem {
  b64_json?: string;
  image_base64?: string;
  mime_type?: string;
}

interface RelayResponse {
  data?: RelayResponseItem[];
  error?: {
    message?: string;
  };
}

function parseRelayResponse(text: string): RelayResponse | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as RelayResponse;
  } catch {
    return null;
  }
}

function shortText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 240);
}

function normalizeRelayImage(item: RelayResponseItem): RelayImage | null {
  const base64 = item.b64_json || item.image_base64;
  if (!base64) return null;
  return {
    base64,
    mimeType: item.mime_type || 'image/png'
  };
}
