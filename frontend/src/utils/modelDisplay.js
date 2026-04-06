/**
 * Format OpenRouter model ID thành friendly display name.
 * VD: "qwen/qwen3-235b-a22b-2507" → "Qwen3 235B A22B 2507"
 *     "google/gemini-3-flash-preview" → "Gemini 3 Flash Preview"
 *     "qwen/qwen3.6-plus:free" → "Qwen3.6 Plus (free)"
 */
export function modelDisplayName(raw) {
  return raw
    .replace(/^[^/]+\//, '')          // strip provider prefix: "qwen/" "google/"
    .replace(/:free$/, ' (free)')      // ":free" → " (free)"
    .replace(/:(\w+)$/, ' ($1)')       // other suffixes
    .replace(/[-_]/g, ' ')             // dashes/underscores → spaces
    .replace(/\b\w/g, c => c.toUpperCase())  // Title Case
}

/**
 * Trả về emoji icon phù hợp với provider từ model ID.
 */
export function modelIcon(raw) {
  if (raw.startsWith('google/'))      return '✨'
  if (raw.startsWith('qwen/'))        return '🌟'
  if (raw.startsWith('meta-llama/'))  return '🦙'
  if (raw.startsWith('mistralai/'))   return '🌬️'
  if (raw.startsWith('deepseek/'))    return '🧠'
  return '🤖'
}
