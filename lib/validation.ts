import type { AppChatBackgroundStyle, ChatBackgroundPreset } from '@/types/social';

export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validateName(name: string, min: number, max: number): string | null {
  const normalized = normalizeName(name);

  if (normalized.length < min || normalized.length > max) {
    return `Name must be between ${min} and ${max} characters.`;
  }

  if (!/^[\p{L}\p{N} _.-]+$/u.test(normalized)) {
    return 'Name contains unsupported characters.';
  }

  return null;
}

export function validateMessage(text: string, maxLength: number): string | null {
  const normalized = text.trim();

  if (!normalized) {
    return 'Message cannot be empty.';
  }

  if (normalized.length > maxLength) {
    return `Message must be at most ${maxLength} characters.`;
  }

  return null;
}

export function validateRoomName(name: string, min: number, max: number): string | null {
  return validateName(name, min, max);
}

export function validateUsername(value: string): string | null {
  const normalized = normalizeName(value).toLowerCase();

  if (normalized.length < 3 || normalized.length > 24) {
    return 'Username must be between 3 and 24 characters.';
  }

  if (!/^[a-z0-9._-]+$/.test(normalized)) {
    return 'Username may only contain lowercase letters, numbers, dot, underscore, and dash.';
  }

  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8 || value.length > 128) {
    return 'Password must be between 8 and 128 characters.';
  }

  return null;
}

export function validateEmail(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > 190) {
    return 'Email is too long.';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'Email format is invalid.';
  }

  return null;
}

export function validateBio(value: string): string | null {
  if (value.length > 280) {
    return 'Bio must be at most 280 characters.';
  }

  return null;
}

export function validateNickname(value: string, min = 2, max = 32): string | null {
  return validateName(value, min, max);
}

export function validateHexColor(value: string): string | null {
  const normalized = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return 'Color must be a hex value like #38bdf8.';
  }
  return null;
}

export function validateThemePreset(value: string, allowed: readonly string[]): string | null {
  const normalized = value.trim();
  if (!allowed.includes(normalized)) {
    return 'Theme preset is invalid.';
  }
  return null;
}

const CHAT_BACKGROUND_PRESETS: ChatBackgroundPreset[] = ['aurora', 'sunset', 'midnight', 'forest', 'paper'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizedHex(value: unknown, fallback: string): string {
  const input = typeof value === 'string' ? value.trim() : '';
  return validateHexColor(input) ? fallback : input;
}

function normalizedAngle(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw)) {
    return 145;
  }
  return Math.max(0, Math.min(360, Math.round(raw)));
}

function normalizedImageDim(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw)) {
    return 58;
  }
  return Math.max(0, Math.min(88, Math.round(raw)));
}

function normalizedImageUrl(value: unknown): string {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input || input.length > 1200) {
    return '';
  }

  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function normalizeChatBackgroundStyle(value: unknown): AppChatBackgroundStyle | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === 'solid') {
    return {
      mode: 'solid',
      color: normalizedHex(value.color, '#0f172a')
    };
  }

  if (value.mode === 'gradient') {
    return {
      mode: 'gradient',
      gradientFrom: normalizedHex(value.gradientFrom, '#1a2740'),
      gradientTo: normalizedHex(value.gradientTo, '#020617'),
      gradientAngle: normalizedAngle(value.gradientAngle)
    };
  }

  if (value.mode === 'image') {
    return {
      mode: 'image',
      imageUrl: normalizedImageUrl(value.imageUrl),
      imageDim: normalizedImageDim(value.imageDim)
    };
  }

  const preset = CHAT_BACKGROUND_PRESETS.includes(value.preset as ChatBackgroundPreset)
    ? (value.preset as ChatBackgroundPreset)
    : 'aurora';
  return {
    mode: 'preset',
    preset
  };
}

export function validateChatBackgroundStyle(value: unknown): string | null {
  if (!isRecord(value)) {
    return 'Chat background style is invalid.';
  }

  const normalized = normalizeChatBackgroundStyle(value);
  if (!normalized) {
    return 'Chat background style is invalid.';
  }

  if (normalized.mode === 'image' && !normalized.imageUrl) {
    return 'Background image must be a valid http or https URL.';
  }

  return null;
}

export function validatePollQuestion(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return 'Poll question is required.';
  }
  if (normalized.length > 160) {
    return 'Poll question must be at most 160 characters.';
  }
  return null;
}

export function validatePollOptions(options: string[]): string | null {
  const normalized = [...new Set(options.map((item) => item.trim()).filter((item) => item.length > 0))];
  if (normalized.length < 2) {
    return 'Poll requires at least 2 options.';
  }
  if (normalized.length > 10) {
    return 'Poll supports at most 10 options.';
  }
  if (normalized.some((item) => item.length > 120)) {
    return 'Poll option must be at most 120 characters.';
  }
  return null;
}
