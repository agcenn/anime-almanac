const db = require('../db');

const rows = db.prepare('SELECT id,title_chinese,cover_large FROM anime ORDER BY id').all();

function dimensions(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = buffer.readUInt16BE(offset + 2);
      if (sof.has(marker)) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), format: 'jpg' };
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

async function probe(url) {
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-131071', Accept: 'image/*' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) return { ok: false, status: response.status };
  const size = dimensions(Buffer.from(await response.arrayBuffer()));
  return size ? { ok: true, ...size } : { ok: false, status: 'UNKNOWN_FORMAT' };
}

function highResolutionCandidates(url) {
  if (!url?.includes('/cover/medium/') || url.endsWith('/medium/default.jpg')) return [];
  const direct = url.replace('/cover/medium/', '/cover/large/');
  const extraLarge = direct.replace(/\/b([^/]+)$/, '/bx$1');
  return [...new Set([direct, extraLarge])];
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await mapper(items[index]); }
      catch (error) { results[index] = { item: items[index], error: error.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

(async () => {
  const audited = await mapLimit(rows, 12, async item => ({ item, current: await probe(item.cover_large) }));
  const low = audited.filter(result => result.current?.ok && (result.current.width < 400 || result.current.height < 560));
  const failures = audited.filter(result => result.error || !result.current?.ok);
  const upgrades = [];

  for (const result of low) {
    for (const candidate of highResolutionCandidates(result.item.cover_large)) {
      const checked = await probe(candidate).catch(() => ({ ok: false }));
      if (checked.ok && checked.width * checked.height > result.current.width * result.current.height) {
        upgrades.push({ id: result.item.id, title: result.item.title_chinese, url: candidate, from: result.current, to: checked });
        break;
      }
    }
  }

  if (upgrades.length) {
    const update = db.prepare('UPDATE anime SET cover_large = ? WHERE id = ?');
    db.exec('BEGIN IMMEDIATE');
    try {
      upgrades.forEach(item => update.run(item.url, item.id));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  console.log(JSON.stringify({
    total: rows.length,
    highResolution: audited.length - low.length - failures.length,
    lowResolution: low.length,
    upgraded: upgrades.length,
    failed: failures.length,
    lowResolutionItems: low.map(result => ({ id: result.item.id, title: result.item.title_chinese, ...result.current }))
  }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
