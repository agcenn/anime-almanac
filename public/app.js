const state = { mode: 'upcoming', scope: 'current', origin: 'jp', page: 1, pages: 1, loading: false, meta: null };
const seasonLabels = { WINTER: '冬', SPRING: '春', SUMMER: '夏', FALL: '秋' };
const formatLabels = { TV: '电视动画', TV_SHORT: '电视短篇', MOVIE: '动画电影', OVA: '原创影像动画', ONA: '网络动画', SPECIAL: '特别篇', MUSIC: '音乐动画' };
const sourceLabels = { ORIGINAL: '原创企划', MANGA: '漫画', LIGHT_NOVEL: '轻小说', VISUAL_NOVEL: '视觉小说', VIDEO_GAME: '电子游戏', OTHER: '其他', NOVEL: '小说', DOUJINSHI: '同人作品', ANIME: '动画作品', WEB_NOVEL: '网络小说', LIVE_ACTION: '真人作品', GAME: '游戏', COMIC: '漫画', MULTIMEDIA_PROJECT: '多媒体企划', PICTURE_BOOK: '绘本' };
const genreLabels = { Action: '动作', Adventure: '冒险', Comedy: '喜剧', Drama: '剧情', Fantasy: '奇幻', Horror: '恐怖', 'Mahou Shoujo': '魔法少女', Mecha: '机甲', Music: '音乐', Mystery: '悬疑', Psychological: '心理', Romance: '恋爱', 'Sci-Fi': '科幻', 'Slice of Life': '日常', Sports: '运动', Supernatural: '超自然', Thriller: '惊悚' };
const $ = selector => document.querySelector(selector);
const escapeHtml = text => String(text ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const cleanText = text => escapeHtml(text || '暂无中文简介，等待资料源更新。').replace(/\n/g, '<br>');
// 主标题只展示正式中文译名；尚未公布的作品不以英文或罗马字冒充中文名。
const titleOf = item => item.title_chinese || '中文译名待公布';
const originOf = item => ['CN', 'TW', 'HK'].includes(item.country_of_origin) ? '国创动画' : item.country_of_origin === 'JP' ? '日本番剧' : item.country_of_origin === 'KR' ? '韩国动画' : '其他地区';
const genresOf = genres => [...new Set((genres || []).map(genre => genreLabels[genre] || '其他题材'))].join(' / ') || '未分类';

function daysUntil(date) {
  if (!date) return null;
  return Math.ceil((new Date(`${date}T00:00:00`) - new Date()) / 86400000);
}
function airDateLabel(date) {
  if (!date) return '日期待定';
  const weekdays = '日一二三四五六';
  const weekday = weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${date.replace(/-/g, '.')} · 周${weekday}`;
}
function statusInfo(item) {
  if (item.status === 'HIATUS') return ['延期 / 暂停', 'alert'];
  if (!item.start_date && item.status === 'NOT_YET_RELEASED') return ['未定档', 'alert'];
  if (item.status === 'NOT_YET_RELEASED') return ['即将播出', ''];
  if (item.status === 'RELEASING') return ['放送中', ''];
  return ['已播出', ''];
}
function card(item) {
  const [status, kind] = statusInfo(item), days = daysUntil(item.start_date);
  const countdown = item.status === 'NOT_YET_RELEASED' && days !== null ? `<span class="countdown">${days > 0 ? `还有 ${days} 天` : days === 0 ? '今天开播' : '日期待定'}</span>` : '';
  return `<article class="anime-card" data-id="${item.id}" tabindex="0"><div class="poster"><img src="${escapeHtml(item.cover_large || '')}" alt="${escapeHtml(titleOf(item))}封面" loading="lazy"><span class="badge ${kind}">${status}</span>${countdown}</div><p class="card-meta"><span class="origin-mark">${originOf(item)}</span> · ${item.season_year || '待定'} ${seasonLabels[item.season] || ''} · ${formatLabels[item.format] || '其他动画'}</p><h3 class="card-title">${escapeHtml(titleOf(item))}</h3><p class="card-native">${escapeHtml(item.title_native || item.title_romaji)}</p><div class="airdate-row"><span>首播</span><strong>${airDateLabel(item.start_date)}</strong></div></article>`;
}

function updateSectionTitle() {
  if (state.mode === 'archive') {
    $('#sectionTitle').textContent = '作品資料庫';
    return;
  }
  const quarter = state.meta?.currentQuarter;
  const scope = state.scope === 'current' ? `${quarter?.year || ''}${seasonLabels[quarter?.season] || ''}季 · 本季度` : '未来季度';
  $('#sectionTitle').textContent = `${scope} · ${state.origin === 'jp' ? '日本番剧' : '国创动画'}`;
}

function updateViewControls() {
  const isUpcoming = state.mode === 'upcoming';
  $('#scheduleControls').classList.toggle('hidden', !isUpcoming);
  document.querySelectorAll('.archive-filter').forEach(element => element.classList.toggle('hidden', isUpcoming));
  updateSectionTitle();
}

async function load(reset = true) {
  if (state.loading) return; state.loading = true;
  if (reset) { state.page = 1; $('#grid').innerHTML = ''; }
  const params = new URLSearchParams({ page: state.page, limit: 25 });
  if (state.mode === 'upcoming') {
    params.set('scope', state.scope);
    params.set('origin', state.origin);
  } else {
    params.set('status', 'archive');
    for (const id of ['year','season']) if ($(`#${id}`).value) params.set(id, $(`#${id}`).value);
  }
  if ($('#format').value) params.set('format', $('#format').value);
  if ($('#search').value.trim()) params.set('q', $('#search').value.trim());
  try {
    const response = await fetch(`/api/anime?${params}`), data = await response.json();
    $('#grid').insertAdjacentHTML('beforeend', data.items.map(card).join(''));
    // 横版原图不再强行放大裁成竖版，完整展示可避免低清封面进一步模糊。
    $('#grid').querySelectorAll('.poster img:not([data-quality-ready])').forEach(image => {
      image.dataset.qualityReady = 'true';
      const applyCoverFit = () => {
        const isWide = image.naturalWidth / image.naturalHeight > 0.9;
        const isLowResolution = image.naturalWidth < 360;
        image.classList.toggle('quality-fit', isWide || isLowResolution);
      };
      if (image.complete && image.naturalWidth) applyCoverFit();
      else image.addEventListener('load', applyCoverFit, { once: true });
    });
    state.pages = data.pagination.pages;
    $('#resultInfo').textContent = `共 ${data.pagination.total} 部 · 第 ${data.pagination.page} 页`;
    $('#empty').classList.toggle('hidden', data.items.length > 0 || state.page > 1);
    $('#loadMore').classList.toggle('hidden', state.page >= state.pages);
  } catch { $('#empty').classList.remove('hidden'); $('#resultInfo').textContent = '数据暂不可用'; }
  finally { state.loading = false; }
}

async function showDetail(id) {
  const item = await fetch(`/api/anime/${id}`).then(r => r.json());
  const [status] = statusInfo(item);
  const cover = escapeHtml(item.cover_large || '');
  $('#detailContent').innerHTML = `<div class="detail-layout"><div class="detail-cover" style="--cover-image:url('${cover}')"><img src="${cover}" alt="${escapeHtml(titleOf(item))}封面"></div><div class="detail-copy"><p class="eyebrow mb-4"><span></span>${escapeHtml(status)}</p><h2>${escapeHtml(titleOf(item))}</h2><p class="mt-3 text-sm text-stone-500">${escapeHtml(item.title_native || item.title_romaji)}</p><div class="detail-grid"><div class="detail-item date-focus"><small>开播日期</small><b>${airDateLabel(item.start_date)}</b></div><div class="detail-item"><small>季度 / 形式</small><b>${item.season_year || '待定'} ${seasonLabels[item.season] || ''} · ${formatLabels[item.format] || '其他动画'}</b></div><div class="detail-item"><small>制作公司</small><b>${escapeHtml(item.studios.join(' / ') || '未公布')}</b></div><div class="detail-item"><small>地区</small><b>${originOf(item)}</b></div><div class="detail-item"><small>原作类型</small><b>${sourceLabels[item.source] || '未公布'}</b></div><div class="detail-item"><small>集数</small><b>${item.episodes || '未公布'}</b></div><div class="detail-item"><small>题材类型</small><b>${escapeHtml(genresOf(item.genres))}</b></div></div><div class="description">${cleanText(item.description_chinese)}</div></div></div>`;
  $('#detail').showModal();
}

async function init() {
  const meta = await fetch('/api/anime/meta').then(r => r.json()).catch(() => ({ years: [] }));
  state.meta = meta;
  $('#year').insertAdjacentHTML('beforeend', meta.years.map(y => `<option>${y}</option>`).join(''));
  $('#updateTime').textContent = meta.lastSync?.finished_at ? new Date(meta.lastSync.finished_at).toLocaleDateString('zh-CN') : '等待同步';
  const [all, upcoming] = await Promise.all([fetch('/api/anime?limit=1').then(r=>r.json()), fetch('/api/anime?status=upcoming&limit=1').then(r=>r.json())]).catch(()=>[{pagination:{total:0}},{pagination:{total:0}}]);
  $('#totalCount').textContent = all.pagination.total; $('#nextCount').textContent = upcoming.pagination.total;
  updateViewControls();
  load();
}
document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-mode]').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); state.mode=btn.dataset.mode; updateViewControls(); load(); }));
document.querySelectorAll('[data-scope]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-scope]').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); state.scope=btn.dataset.scope; updateSectionTitle(); load(); }));
document.querySelectorAll('[data-origin]').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('[data-origin]').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); state.origin=btn.dataset.origin; updateSectionTitle(); load(); }));
['year','season','format'].forEach(id => $(`#${id}`).addEventListener('change', () => load()));
let timer; $('#search').addEventListener('input', () => { clearTimeout(timer); timer=setTimeout(()=>load(),350); });
$('#loadMore').addEventListener('click', () => { state.page += 1; load(false); });
$('#grid').addEventListener('click', e => { const card=e.target.closest('.anime-card'); if(card) showDetail(card.dataset.id); });
$('#grid').addEventListener('keydown', e => { if(e.key==='Enter' && e.target.matches('.anime-card')) showDetail(e.target.dataset.id); });
$('#closeDetail').addEventListener('click', () => $('#detail').close());
$('#detail').addEventListener('click', e => { if(e.target === $('#detail')) $('#detail').close(); });
$('#mobileMenu').addEventListener('click', () => document.querySelector('[data-mode="upcoming"]').scrollIntoView({behavior:'smooth'}));
init();
