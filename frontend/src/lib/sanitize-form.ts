/**
 * Strips empty strings from a form payload before sending to the API.
 * - Empty strings become omitted (undefined), so @IsOptional() on the backend skips them.
 * - Non-string values (numbers, booleans, arrays) are passed through unchanged.
 * - Strings are trimmed; trimmed empty strings are omitted.
 * Required fields that are truly empty are caught by Zod before this runs.
 */
export function sanitizeForm<T extends Record<string, any>>(data: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== '') result[key] = trimmed;
      // else: omit — backend @IsOptional will skip validation
    } else {
      result[key] = value;
    }
  }
  return result;
}
