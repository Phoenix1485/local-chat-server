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