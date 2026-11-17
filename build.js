const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const catalogDir = path.join(__dirname, 'catalog');
const outDir = path.join(__dirname, 'public');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Exact packing mapping for C-K domain
function pack(domain, coords) {
  const c = (domain.concepts || []).map(n => [n.id, n.label || "", n.partition || ""]);
  const k = (domain.knowledge || []).map(n => [n.id, n.label || "", n.status || ""]);
  const l = (domain.links || []).map(n => [n.from, n.to]);
  const p = Object.keys(coords || {}).map(id => [id, Math.round(coords[id].x), Math.round(coords[id].y)]);
  return [domain.rootId || "", c, k, l, p];
}

const catalogItems = [];

if (fs.existsSync(catalogDir)) {
  const files = fs.readdirSync(catalogDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const rawData = fs.readFileSync(path.join(catalogDir, file), 'utf-8');
    const data = JSON.parse(rawData);
    
    const domain = data.domain || data; 
    const coords = data.coords || {};

    const packed = pack(domain, coords);
    const jsonStr = JSON.stringify(packed);
    
    // Node.js exact equivalent to CompressionStream('deflate-raw') + base64url
    const buffer = zlib.deflateRawSync(Buffer.from(jsonStr));
    const hash = buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
      
    // kebab-case to Title Case (e.g. some-catalog-item.json -> Some Catalog Item)
    const name = file.replace('.json', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    catalogItems.push({ id: file, name, hash });
  }
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C-K Catalog Workspace</title>
  <style>
    :root {
      --bg-base: #191919;
      --bg-panel: #242424;
      --bg-tab: #2d2d2d;
      --bg-active: #383838;
      --bg-hover: #333333;
      --text-main: #e0e0e0;
      --text-muted: #888888;
      --border: #404040;
      --accent: #d4a373;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background-color: var(--bg-base);
      color: var(--text-main);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    #mobile-header {
      display: none;
      background: var(--bg-panel);
      padding: 1rem;
      border-bottom: 1px solid var(--border);
      align-items: center;
    }
    #menu-btn {
      background: none; border: none; color: var(--text-main); font-size: 1.5rem; cursor: pointer; margin-right: 1rem;
    }

    #sidebar {
      width: 260px;
      background-color: var(--bg-panel);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      transition: transform 0.3s ease;
      z-index: 100;
    }
    .sidebar-header {
      padding: 1.25rem 1rem;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-size: 0.85rem;
      color: var(--accent);
    }
    #catalog-list {
      list-style: none;
      overflow-y: auto;
      flex: 1;
    }
    .catalog-item {
      padding: 0.85rem 1rem;
      cursor: pointer;
      border-bottom: 1px solid var(--border);
      font-size: 0.95rem;
      transition: background 0.2s;
    }
    .catalog-item:hover { background-color: var(--bg-hover); }

    #workspace {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    #tabs-bar {
      display: flex;
      background-color: var(--bg-panel);
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      scrollbar-width: none;
    }
    #tabs-bar::-webkit-scrollbar { display: none; }
    .tab {
      display: flex;
      align-items: center;
      padding: 0.75rem 1.25rem;
      background-color: var(--bg-tab);
      border-right: 1px solid var(--border);
      cursor: pointer;
      min-width: 140px;
      max-width: 220px;
      font-size: 0.9rem;
      user-select: none;
    }
    .tab.active {
      background-color: var(--bg-active);
      border-bottom: 2px solid var(--accent);
      color: #ffffff;
    }
    .tab-title {
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1
