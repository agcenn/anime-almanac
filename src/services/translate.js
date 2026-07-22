const config = require('../config');

const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

function detectLanguage(source) {
  if (/[\u3040-\u30ff]/u.test(source)) return 'ja';
  if (/[\uac00-\ud7af]/u.test(source)) return 'ko';
  return 'en';
}

function hasChineseText(source) {
  const text = String(source || '');
  if (/[\u3040-\u30ff\uac00-\ud7af]/u.test(text)) return false;
  const hanCount = (text.match(/\p{Script=Han}/gu) || []).length;
  const letterCount = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  return hanCount >= 4 && hanCount / Math.max(letterCount, 1) >= 0.18;
}

// MyMemory 单段限制为 500 字节；调用者应先把长文本切成更小的段落。
async function translateText(source) {
  const text = String(source || '').trim();
  if (!text) return null;
  if (Buffer.byteLength(text, 'utf8') > 480) throw new Error('翻译文本超过单段字节限制');
  const url = new URL(config.myMemoryEndpoint);
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${detectLanguage(text)}|zh-CN`);
  url.searchParams.set('mt', '1');
  const response = await fetch(url, { signal: AbortSignal.timeout(config.titleTranslationTimeoutMs) });
  if (!response.ok) throw new Error(`翻译接口 HTTP ${response.status}`);
  const result = await response.json();
  const translated = result.responseData?.translatedText?.trim();
  if (!translated || /MYMEMORY WARNING/i.test(translated) || normalize(translated) === normalize(text)) return null;
  return translated.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
}

module.exports = { hasChineseText, translateText };
