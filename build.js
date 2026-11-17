const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const catalogDir = path.join(__dirname, 'catalog');
const outDir = path.join(__dirname, 'public');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

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
    
    const buffer = zlib.deflateRawSync(Buffer.from(JSON.stringify(packed)));
    const hash = buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
      
    // Use the clean slug as the ID for prettier URLs (e.g., "my-catalog")
    const slug = file.replace('.json', '');
    const name = slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    catalogItems.push({ id: slug, name, hash });
  }
}

const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C-K Catalog Workspace</title>
  <style>
    :root { --bg-base: #191919; --bg-panel: #242424; --bg-tab: #2d2d2d; --bg-active: #383838; --bg-hover: #333333; --text-main: #e0e0e0; --text-muted: #888888; --border: #404040; --accent: #d4a373; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background-color: var(--bg-base); color: var(--text-main); display: flex; height: 100vh; overflow: hidden; }
    
    #mobile-header { display: none; background: var(--bg-panel); padding: 1rem; border-bottom: 1px solid var(--border); align-items: center; }
    #menu-btn { background: none; border: none; color: var(--text-main); font-size: 1.5rem; cursor: pointer; margin-right: 1rem; }
    
    #sidebar { width: 280px; background-color: var(--bg-panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; transition: transform 0.3s ease; z-index: 100; }
    .sidebar-header { padding: 1.25rem 1rem; border-bottom: 1px solid var(--border); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; font-size: 0.85rem; color: var(--accent); }
    
    #search-container { padding: 1rem; border-bottom: 1px solid var(--border); }
    #search-input { width: 100%; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid var(--border); background-color: var(--bg-base); color: var(--text-main); font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
    #search-input:focus { border-color: var(--accent); }
    #search-input::placeholder { color: var(--text-muted); }

    #catalog-list { list-style: none; overflow-y: auto; flex: 1; padding: 0.75rem; }
    .catalog-item { padding: 0.75rem 1rem; margin-bottom: 0.5rem; cursor: pointer; border-radius: 6px; background-color: var(--bg-tab); border: 1px solid transparent; font-size: 0.95rem; font-weight: 500; transition: all 0.2s ease; display: block; user-select: none; }
    .catalog-item:hover { background-color: var(--bg-hover); border-color: var(--border); transform: translateY(-1px); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .catalog-item:active { transform: translateY(0); }
    
    #workspace { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    #tabs-bar { display: flex; background-color: var(--bg-panel); border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
    #tabs-bar::-webkit-scrollbar { display: none; }
    .tab { display: flex; align-items: center; padding: 0.75rem 1.25rem; background-color: var(--bg-tab); border-right: 1px solid var(--border); cursor: pointer; min-width: 140px; max-width: 220px; font-size: 0.9rem; user-select: none; transition: background 0.2s; }
    .tab.active { background-color: var(--bg-active); border-bottom: 2px solid var(--accent); color: #ffffff; }
    .tab-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
    .tab-close { margin-left: 0.5rem; color: var(--text-muted); cursor: pointer; font-weight: bold; font-size: 1.1rem; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }
    .tab-close:hover { color: #ff6b6b; background: rgba(255,255,255,0.1); }
    
    #iframes-container { flex: 1; position: relative; background-color: var(--bg-base); }
    .iframe-wrapper { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; }
    .iframe-wrapper.active { display: block; }
    iframe { width: 100%; height: 100%; border: none; }
    .empty-state { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 1.1rem; }
    
    @media (max-width: 768px) {
      body { flex-direction: column; } #mobile-header { display: flex; }
      #sidebar { position: absolute; top: 61px; bottom: 0; left: 0; transform: translateX(-100%); border-right: none; box-shadow: 4px 0 15px rgba(0,0,0,0.5); }
      #sidebar.open { transform: translateX(0); } #workspace { height: calc(100vh - 61px); }
    }
  </style>
</head>
<body>
  
  <div id="mobile-header">
    <button id="menu-btn">☰</button>
    <div style="font-weight: 600; color: var(--accent);">C-K Catalog</div>
  </div>

  <aside id="sidebar">
    <div class="sidebar-header">Catalogs</div>
    <div id="search-container">
      <input type="text" id="search-input" placeholder="Search catalogs..." autocomplete="off" spellcheck="false">
    </div>
    <ul id="catalog-list"></ul>
  </aside>

  <main id="workspace">
    <div id="tabs-bar"></div>
    <div id="iframes-container">
      <div class="empty-state" id="empty-state">Select a catalog from the sidebar to open.</div>
    </div>
  </main>

  <script>
    const BASE_URL = "https://computerwwwizards.github.io/c-k#";
    const items = /* DATA_PAYLOAD */;
    
    const tabsBar = document.getElementById('tabs-bar');
    const iframesContainer = document.getElementById('iframes-container');
    const catalogList = document.getElementById('catalog-list');
    const emptyState = document.getElementById('empty-state');
    const searchInput = document.getElementById('search-input');
    
    const sidebar = document.getElementById('sidebar');
    document.getElementById('menu-btn').addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    let openTabs = [];
    let activeTabId = null;

    function renderSidebar() {
      items.forEach(item => {
        const li = document.createElement('li');
        li.className = 'catalog-item';
        li.textContent = item.name;
        li.dataset.searchName = item.name.toLowerCase();
        li.onclick = () => {
          openTab(item);
          if (window.innerWidth <= 768) sidebar.classList.remove('open');
        };
        catalogList.appendChild(li);
      });
    }

    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const nodes = catalogList.querySelectorAll('.catalog-item');
      nodes.forEach(node => {
        if (node.dataset.searchName.includes(term)) {
          node.style.display = 'block';
        } else {
          node.style.display = 'none';
        }
      });
    });

    function updateUrlState() {
      const tabIds = openTabs.map(t => t.id).join(',');
      const url = new URL(window.location);
      
      if (tabIds) {
        url.searchParams.set('tabs', tabIds);
        if (activeTabId) url.searchParams.set('active', activeTabId);
      } else {
        url.searchParams.delete('tabs');
        url.searchParams.delete('active');
      }
      
      // Update URL without reloading the page
      window.history.replaceState(null, '', url);
    }

    function openTab(item, saveState = true) {
      if (!openTabs.find(t => t.id === item.id)) {
        openTabs.push(item);
        
        const wrapper = document.createElement('div');
        wrapper.className = 'iframe-wrapper';
        wrapper.id = 'wrapper-' + item.id;
        
        const iframe = document.createElement('iframe');
        iframe.src = BASE_URL + item.hash;
        wrapper.appendChild(iframe);
        iframesContainer.appendChild(wrapper);
      }
      setActiveTab(item.id, false); // We handle saveState at the end of openTab
      renderTabs();
      
      if (saveState) updateUrlState();
    }

    function closeTab(e, id) {
      e.stopPropagation();
      openTabs = openTabs.filter(t => t.id !== id);
      document.getElementById('wrapper-' + id).remove();
      
      if (activeTabId === id) {
        activeTabId = openTabs.length ? openTabs[openTabs.length - 1].id : null;
      }
      setActiveTab(activeTabId, false);
      renderTabs();
      updateUrlState();
    }

    function setActiveTab(id, saveState = true) {
      activeTabId = id;
      document.querySelectorAll('.iframe-wrapper').forEach(el => el.classList.remove('active'));
      
      if (id) {
        document.getElementById('wrapper-' + id).classList.add('active');
        emptyState.style.display = 'none';
      } else {
        emptyState.style.display = 'flex';
      }
      
      if (saveState) updateUrlState();
      
      // Re-render to update visual active state on tabs
      renderTabs(false);
    }

    function renderTabs(attachEvents = true) {
      tabsBar.innerHTML = '';
      openTabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
        
        if (attachEvents) {
          el.onclick = () => {
            setActiveTab(tab.id);
          };
        }
        
        const title = document.createElement('span');
        title.className = 'tab-title';
        title.textContent = tab.name;
        
        const close = document.createElement('span');
        close.className = 'tab-close';
        close.innerHTML = '&times;';
        if (attachEvents) {
          close.onclick = (e) => closeTab(e, tab.id);
        }
        
        el.appendChild(title);
        el.appendChild(close);
        tabsBar.appendChild(el);
      });
    }

    function loadInitialState() {
      renderSidebar();
      
      const params = new URLSearchParams(window.location.search);
      const tabsParam = params.get('tabs');
      const activeParam = params.get('active');
      
      if (tabsParam) {
        const tabIds = tabsParam.split(',');
        tabIds.forEach(id => {
          const item = items.find(i => i.id === id);
          if (item) {
            openTab(item, false); // Open without writing to history yet
          }
        });
        
        if (activeParam && openTabs.find(t => t.id === activeParam)) {
          setActiveTab(activeParam, false);
        } else if (openTabs.length > 0) {
          setActiveTab(openTabs[openTabs.length - 1].id, false);
        }
        
        renderTabs();
        updateUrlState(); // Normalize the URL in case invalid IDs were passed
      }
    }

    // Initialize application
    loadInitialState();
  </script>
</body>
</html>`;

const finalHtml = htmlTemplate.replace('/* DATA_PAYLOAD */', JSON.stringify(catalogItems));
fs.writeFileSync(path.join(outDir, 'index.html'), finalHtml);
