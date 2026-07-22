// 永久下架系列名单。这里同时覆盖罗马字、英文、日文和常见中文译名。
// 新条目只要自身标题或关联作品标题命中，都会在写入数据库前被排除。
const BLOCKED_FRANCHISE_TERMS = Object.freeze([
  'chiikawa',
  'chiwaka',
  'ちいかわ',
  '吉伊卡哇',
  'boku no hero academia',
  'my hero academia',
  '僕のヒーローアカデミア',
  '我的英雄学院',
  '我的英雄学园',
  'ヒロアカ',
  'chikyuu daisuki! kikkun',
  '地球大好き!きっくん',
  '我爱地球! kikkun',
  "let's roll, cinnamoroll",
  'レッツロールシナモロール',
  "let's roll肉桂醇",
  'pan no akachan',
  'パンの赤ちゃん',
  '婴儿面包',
  'tomica & tom',
  'トミカとトム',
  'tomica和tom'
]);

const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('en-US');

function ownTitles(item) {
  return [
    item?.title_romaji,
    item?.title_native,
    item?.title_english,
    item?.title_chinese,
    item?.title?.romaji,
    item?.title?.native,
    item?.title?.english
  ];
}

function relatedTitles(item) {
  return (item?.relations?.edges || []).flatMap(edge => ownTitles(edge?.node));
}

function titleMatchesBlockedFranchise(value) {
  const title = normalize(value);
  return title.length > 0 && BLOCKED_FRANCHISE_TERMS.some(term => title.includes(normalize(term)));
}

function isPermanentlyBlockedAnime(item, includeRelations = true) {
  const titles = includeRelations ? [...ownTitles(item), ...relatedTitles(item)] : ownTitles(item);
  return titles.some(titleMatchesBlockedFranchise);
}

module.exports = {
  BLOCKED_FRANCHISE_TERMS,
  isPermanentlyBlockedAnime,
  titleMatchesBlockedFranchise
};
