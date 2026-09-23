const tech = /\b(?:node|comfyui|workflow|cuda|vram|gpu|oom|timeout|failed|error|invalid|missing|connection|refused|reset|aborted|cancelled|status|http|https|ws|json|ffmpeg|python|ollama|econnrefused|etimedout|enoent|eacces)\b|\b\d+(?:\.\d+)?\b|\b[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b|\b[A-Za-z_][A-Za-z0-9]*_[A-Za-z0-9_]+\b|\b[A-Za-z]:\\[^\s]+|\/[\w.@-]+(?:\/[\w.@-]+)+/gi
const t = (m) => (m.match(tech) ?? []).join(' ') || '[details redacted]'
console.log('fox:', JSON.stringify(t('The quick brown fox jumps over the lazy dog')))
console.log('dog:', JSON.stringify(t('dog')))
console.log('ab:', JSON.stringify(t('ab')))
console.log('prose:', JSON.stringify(t('a cute puppy playing in the garden')))
console.log('mixed:', JSON.stringify(t('a cute puppy playing but CUDA oom')))
