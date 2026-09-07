/**
 * 正文美化脚本 - 完整修复版
 * 
 * 修复问题：
 * 1. 长文本中部分文字没有被美化框包裹 - 改进正则匹配逻辑
 * 2. 变量更新标签提取不完整 - 增强标签匹配算法
 * 3. 处理输出长度限制导致的格式问题
 */

// ============ 配置存储 ============
const DEFAULT_CONFIG = {
    enabled: true,
    thinkingEndTag: '</think>',
    renderDepth: 10,
    theme: 'auto', // 'light', 'dark', 'auto'
};

const DB_NAME = 'BeautifyConfigDB';
const DB_VERSION = 1;
const STORE_NAME = 'config';

// 全局标志
let isRerendering = false;
let beautifyInitialized = false;

// 打开IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function getConfig() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get('beautifyConfig');
            request.onsuccess = () => {
                const result = request.result;
                if (result && result.data) {
                    resolve({ ...DEFAULT_CONFIG, ...result.data });
                } else {
                    resolve(DEFAULT_CONFIG);
                }
            };
            request.onerror = () => resolve(DEFAULT_CONFIG);
        });
    } catch (e) {
        return DEFAULT_CONFIG;
    }
}

async function saveConfigToStorage(config) {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put({ id: 'beautifyConfig', data: config });
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

// ============ 配置面板 ============
async function showConfigPanel() {
    const config = await getConfig();
    
    let capturedConfig = null;
    
    const popupHtml = `<div style="padding: 10px;" id="beautify-config-panel">
        <h3 style="margin-top:0; color:#be185d;">🎨 正文美化设置</h3>
        
        <div style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                <input type="checkbox" id="beautify-enabled" ${config.enabled ? 'checked' : ''}>
                <span>启用正文美化</span>
            </label>
        </div>
        
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px;">
                思维链结束标签 <small style="color: #999;">(留空则美化全文)</small>
            </label>
            <input type="text" id="beautify-thinking-tag" 
                value="${config.thinkingEndTag || ''}" 
                placeholder="例如: </think> 或 </thinking>"
                style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace;">
            <div style="font-size: 11px; color: #666; margin-top: 4px;">
                💡 常见标签: &lt;/think&gt;, &lt;/thinking&gt;, &lt;/reasoning&gt;
            </div>
        </div>
        
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px;">
                🌓 主题模式
            </label>
            <select id="beautify-theme" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
                <option value="auto" ${config.theme === 'auto' ? 'selected' : ''}>🔄 自动（跟随掌上公寓/系统）</option>
                <option value="light" ${config.theme === 'light' ? 'selected' : ''}>☀️ 浅色模式</option>
                <option value="dark" ${config.theme === 'dark' ? 'selected' : ''}>🌙 深色模式</option>
            </select>
            <div style="font-size: 11px; color: #666; margin-top: 4px;">
                💡 自动模式会读取掌上公寓的主题设置或系统偏好
            </div>
        </div>
        
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px;">
                渲染深度 <small style="color: #999;">(只渲染最近N条消息，0=全部)</small>
            </label>
            <input type="number" id="beautify-render-depth" 
                value="${config.renderDepth || 10}" 
                min="0" max="100"
                style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <div style="font-size: 11px; color: #666; margin-top: 4px;">
                ⚠️ 设置过大可能影响性能，建议10-20
            </div>
        </div>
    </div>`;
    
    const intervalId = setInterval(() => {
        const $panel = $('#beautify-config-panel');
        if ($panel.length) {
            capturedConfig = {
                enabled: $panel.find('#beautify-enabled').is(':checked'),
                thinkingEndTag: ($panel.find('#beautify-thinking-tag').val() || '').trim(),
                renderDepth: parseInt($panel.find('#beautify-render-depth').val()) || 10,
                theme: $panel.find('#beautify-theme').val() || 'auto',
            };
        }
    }, 50);
    
    const result = await SillyTavern.getContext().callGenericPopup(
        popupHtml,
        SillyTavern.getContext().POPUP_TYPE.CONFIRM
    );
    
    clearInterval(intervalId);
    
    if (result === SillyTavern.getContext().POPUP_RESULT.AFFIRMATIVE && capturedConfig) {
        const saved = await saveConfigToStorage(capturedConfig);
        if (!saved) {
            alert('❌ 保存失败，请查看控制台');
            return;
        }
        alert('✅ 设置已保存！正在重新渲染消息...');
        
        setTimeout(async () => {
            try {
                isRerendering = true;
                const newConfig = await getConfig();
                if (typeof getLastMessageId !== 'function') return;
                
                const lastId = getLastMessageId();
                if (lastId >= 0 && typeof getChatMessages === 'function') {
                    const allMessages = getChatMessages(`0-${lastId}`, { role: 'assistant' });
                    let messagesToRender = allMessages;
                    if (newConfig.renderDepth > 0 && allMessages.length > newConfig.renderDepth) {
                        messagesToRender = allMessages.slice(-newConfig.renderDepth);
                    }
                    const renderIds = new Set(messagesToRender.map(m => m.message_id));
                    
                    for (const msg of allMessages) {
                        const $mes = retrieveDisplayedMessage(msg.message_id);
                        if (!$mes) continue;
                        
                        if (renderIds.has(msg.message_id)) {
                            $mes.data('beautified', false);
                            if (typeof refreshOneMessage === 'function') {
                                await refreshOneMessage(msg.message_id);
                                await new Promise(r => setTimeout(r, 50));
                            }
                            await beautifyMessage(msg.message_id, true);
                        } else {
                            $mes.data('beautified', false);
                            if (typeof refreshOneMessage === 'function') {
                                await refreshOneMessage(msg.message_id);
                                await new Promise(r => setTimeout(r, 50));
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('[正文美化] 重新渲染出错:', e);
            } finally {
                isRerendering = false;
            }
        }, 100);
    }
}

// ============ CSS 样式 ============
const BEAUTIFY_CSS = `
.beautify-mac-window {
    position: relative;
    background: rgba(255, 255, 255, 0.98);
    border: 2px solid #F0C4D0;
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(240, 196, 208, 0.4);
    margin: 10px 0;
    overflow: hidden;
    width: 100%;
    box-sizing: border-box;
}
.beautify-mac-header {
    background: #FCEEF1;
    padding: 5px 12px;
    display: flex;
    align-items: center;
    border-bottom: 2px solid #F0C4D0;
    height: 28px;
}
.beautify-mac-controls { display: flex; gap: 5px; }
.beautify-mac-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.beautify-mac-dot.red { background: #FF9AA2; }
.beautify-mac-dot.yellow { background: #FFDAC1; }
.beautify-mac-dot.green { background: #B5EAD7; }
.beautify-mac-body {
    padding: 12px 18px;
    color: #555;
    line-height: 1.7;
    font-size: 1em;
    white-space: normal;
    word-wrap: break-word;
}
.beautify-mac-body h1 { font-size: 1.6em; font-weight: 700; color: #be185d; margin: 16px 0 10px; border-bottom: 2px solid #fce7f3; padding-bottom: 6px; }
.beautify-mac-body h2 { font-size: 1.4em; font-weight: 700; color: #db2777; margin: 14px 0 8px; border-bottom: 1px solid #fce7f3; padding-bottom: 4px; }
.beautify-mac-body h3 { font-size: 1.2em; font-weight: 600; color: #e11d48; margin: 12px 0 6px; }
.beautify-mac-body h4 { font-size: 1.1em; font-weight: 600; color: #f43f5e; margin: 10px 0 5px; }
.beautify-mac-body ul { margin: 8px 0; padding-left: 20px; }
.beautify-mac-body ol { margin: 8px 0; padding-left: 20px; }
.beautify-mac-body li { margin: 4px 0; color: #555; }
.beautify-mac-body li::marker { color: #ec4899; }
.beautify-mac-body blockquote { margin: 10px 0; padding: 10px 15px; background: #fdf2f8; border-left: 4px solid #ec4899; border-radius: 0 8px 8px 0; color: #6b7280; font-style: italic; }
.beautify-dialogue { color: #be185d; font-weight: 500; }
.beautify-dialogue::before, .beautify-dialogue::after { color: #ec4899; }
.beautify-thought { color: #7c3aed; font-style: italic; opacity: 0.9; }
.beautify-mac-body code { background: #fdf2f8; color: #db2777; padding: 2px 6px; border-radius: 4px; font-family: 'Consolas', monospace; font-size: 0.9em; }
.beautify-mac-body pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px; overflow-x: auto; margin: 10px 0; }
.beautify-mac-body pre code { background: transparent; color: inherit; padding: 0; }
.beautify-mac-body hr { border: none; height: 2px; background: linear-gradient(to right, transparent, #fce7f3, #ec4899, #fce7f3, transparent); margin: 15px 0; }
.beautify-mac-body strong { color: #be185d; font-weight: 700; }
.beautify-mac-body em { color: #7c3aed; font-style: italic; }

.beautify-sub-window {
    width: 100%; max-width: 500px; margin: 8px auto;
    background: #fdfdfd;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(236, 72, 153, 0.15);
    border: 4px solid #ffffff;
    overflow: hidden;
    font-size: 14px;
    line-height: normal;
    white-space: normal;
}
.beautify-sub-title-bar {
    height: 32px;
    background: #ffe4e8;
    border-bottom: 2px solid white;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 8px;
}
.beautify-sub-controls { display: flex; gap: 6px; }
.beautify-sub-dot { width: 10px; height: 10px; border-radius: 50%; }
.beautify-sub-dot.red { background: #ff5f57; }
.beautify-sub-dot.yellow { background: #febc2e; }
.beautify-sub-dot.green { background: #28c840; }
.beautify-sub-title {
    flex: 1; text-align: center;
    font-size: 13px; font-weight: 600;
    color: #be185d; opacity: 0.8;
    margin-right: 40px;
}
.beautify-sub-content { padding: 15px; display: flex; flex-direction: column; gap: 15px; }

.beautify-candidate-card {
    background: #fff; border-radius: 10px; padding: 12px;
    border: 1px solid #fce7f3; box-shadow: 0 2px 8px rgba(0,0,0,0.02);
    transition: all 0.2s; cursor: pointer; position: relative;
}
.beautify-candidate-card:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(236, 72, 153, 0.1); border-color: #E68A96; }
.beautify-candidate-card.selected { background: #fff1f2; border-color: #E68A96; box-shadow: 0 0 0 2px #E68A96; }
.beautify-candidate-card.selected::after {
    content: '✔'; position: absolute; top: 10px; right: 10px;
    color: white; background: #E68A96; width: 20px; height: 20px;
    border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px;
}
.beautify-candidate-name { font-size: 16px; font-weight: 700; color: #831843; margin-bottom: 8px; border-bottom: 1px dashed #fbcfe8; padding-bottom: 5px; }
.beautify-tags-container { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.beautify-tag { background: #fdf2f8; color: #db2777; padding: 2px 8px; border-radius: 12px; font-size: 11px; border: 1px solid #fbcfe8; }
.beautify-details { font-size: 13px; color: #64748b; line-height: 1.5; }
.beautify-quote { margin-top: 8px; padding: 8px; background: #f8fafc; border-radius: 6px; font-style: italic; color: #475569; font-size: 12px; border-left: 3px solid #E68A96; }

.beautify-tenant-card {
    background: #fff; border-radius: 10px; padding: 12px;
    border: 2px solid #fce7f3; box-shadow: 0 2px 8px rgba(0,0,0,0.02);
    transition: all 0.3s ease;
}
.beautify-tenant-card:hover { transform: translateY(-2px); box-shadow: 0 5px 15px rgba(236, 72, 153, 0.1); border-color: #E68A96; }
.beautify-tenant-name { color: #831843; font-weight: 700; font-size: 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.beautify-edit-area {
    width: 100%; min-height: 100px; padding: 10px;
    border: 1px solid #e2e8f0; border-radius: 8px;
    font-size: 13px; line-height: 1.5; font-family: inherit;
    resize: vertical; background: #f8fafc; color: #334155; transition: all 0.2s;
}
.beautify-edit-area:focus { outline: none; border-color: #E68A96; background: #fff; box-shadow: 0 0 0 3px rgba(255, 158, 170, 0.2); }

.beautify-btn {
    flex: 1; padding: 10px; border-radius: 8px; font-weight: 600; font-size: 13px;
    border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
    transition: all 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}
.beautify-btn:hover:not(.disabled) { transform: translateY(-2px); filter: brightness(1.05); }
.beautify-btn-primary { background: linear-gradient(135deg, #FF9EAA 0%, #E68A96 100%); color: white; box-shadow: 0 4px 10px rgba(255, 158, 170, 0.3); }
.beautify-btn-success { background: linear-gradient(135deg, #a7f3d0 0%, #34d399 100%); color: #064e3b; box-shadow: 0 4px 10px rgba(52, 211, 153, 0.3); }
.beautify-btn.disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed; box-shadow: none; pointer-events: none; }
.beautify-action-buttons { display: flex; gap: 10px; margin-top: 5px; }
.beautify-hint-text { font-size: 12px; color: #94a3b8; margin-top: 8px; }
.beautify-room-picker { display: none; margin-top: 10px; }
.beautify-room-picker.active { display: block; }
.beautify-room-grid { display: flex; flex-wrap: wrap; gap: 6px; max-height: 180px; overflow-y: auto; padding: 2px; }
.beautify-room-card {
    flex: 0 0 calc(50% - 3px); padding: 8px 10px; border: 2px solid #e2e8f0;
    border-radius: 10px; cursor: pointer; transition: all 0.15s; background: #fff; text-align: left;
}
.beautify-room-card:hover { border-color: #E68A96; transform: translateY(-1px); box-shadow: 0 3px 8px rgba(0,0,0,0.06); }
.beautify-room-card.rc-selected { border-color: #E68A96; background: #FFF0F5; box-shadow: 0 0 0 2px rgba(230,138,150,0.2); }

/* ==================== 暗色模式 ==================== */
.beautify-dark .beautify-mac-window {
    background: rgba(35, 33, 54, 0.98);
    border-color: #44415a;
    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
}
.beautify-dark .beautify-mac-header {
    background: #2a273f;
    border-bottom-color: #44415a;
}
.beautify-dark .beautify-mac-body {
    color: #c4c0d4;
}
.beautify-dark .beautify-mac-body h1 { color: #ebbcba; border-bottom-color: #44415a; }
.beautify-dark .beautify-mac-body h2 { color: #c4a7e7; border-bottom-color: #44415a; }
.beautify-dark .beautify-mac-body h3 { color: #eb6f92; }
.beautify-dark .beautify-mac-body h4 { color: #f6c177; }
.beautify-dark .beautify-mac-body li { color: #c4c0d4; }
.beautify-dark .beautify-mac-body li::marker { color: #eb6f92; }
.beautify-dark .beautify-mac-body blockquote { background: #2a273f; border-left-color: #eb6f92; color: #908caa; }
.beautify-dark .beautify-mac-body strong { color: #ebbcba; }
.beautify-dark .beautify-mac-body em { color: #c4a7e7; }
.beautify-dark .beautify-mac-body code { background: #393552; color: #c4a7e7; }
.beautify-dark .beautify-mac-body hr { background: linear-gradient(to right, transparent, #44415a, #eb6f92, #44415a, transparent); }
.beautify-dark .beautify-dialogue { color: #ebbcba; }
.beautify-dark .beautify-dialogue::before, .beautify-dark .beautify-dialogue::after { color: #eb6f92; }
.beautify-dark .beautify-thought { color: #c4a7e7; }
`;

// ============ 主题检测 ============
function detectBeautifyTheme(config) {
    const theme = (config && config.theme) || 'auto';
    if (theme === 'light') return false;
    if (theme === 'dark') return true;
    // auto: 优先读取掌上公寓的主题
    try {
        const saved = localStorage.getItem('apartment_theme');
        if (saved === 'dark') return true;
        if (saved === 'light') return false;
    } catch(e) {}
    // 回退：系统偏好
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
    return false;
}

// ============ 标签渲染器 ============
const tagRenderers = {
    companion: (data) => {
        const candidates = data.split('候选人:').slice(1);
        if (candidates.length === 0) return '<p style="color:#ec4899;">❓ 没有找到候选人数据</p>';
        
        let cardsHTML = '';
        candidates.forEach((c, idx) => {
            const extract = (k) => { const m = c.match(new RegExp(k + ': "([^"]+)"')); return m ? m[1] : ''; };
            const name = extract('名字');
            if (!name) return;
            
            let tagsHTML = '';
            const tags = extract('标签');
            if (tags) {
                tags.split('/').forEach(tag => {
                    tagsHTML += `<span style="display:inline-block!important;background-color:#fdf2f8!important;color:#db2777!important;padding:2px 8px!important;border-radius:12px!important;font-size:11px!important;border-width:1px!important;border-style:solid!important;border-color:#fbcfe8!important;margin-right:5px!important;">${tag.trim()}</span>`;
                });
            }
            
            const brief = extract('简介');
            cardsHTML += `<div class="beautify-candidate-card" data-name="${name}" data-idx="${idx}" style="display:block!important;background-color:#ffffff!important;border-radius:10px!important;padding:12px!important;border-width:1px!important;border-style:solid!important;border-color:#fce7f3!important;box-shadow:0 2px 8px rgba(0,0,0,0.02)!important;margin-bottom:10px!important;cursor:pointer!important;position:relative!important;">
                <div style="display:block!important;font-size:16px!important;font-weight:700!important;color:#831843!important;margin-bottom:8px!important;border-bottom-width:1px!important;border-bottom-style:dashed!important;border-bottom-color:#fbcfe8!important;padding-bottom:5px!important;">${name}</div>
                <div style="display:flex!important;flex-wrap:wrap!important;gap:5px!important;margin-bottom:8px!important;">${tagsHTML}</div>
                <div style="display:block!important;font-size:13px!important;color:#64748b!important;line-height:1.5!important;">
                    <div style="display:block!important;">🎂 ${extract('年龄')} | 👗 ${extract('常见穿搭')}</div>
                    <div style="display:block!important;margin-top:2px!important;">❤️ ${extract('情感状况')}</div>
                    ${brief ? `<div style="display:block!important;margin-top:4px!important;">📝 ${brief}</div>` : ''}
                </div>
                <div style="display:block!important;margin-top:8px!important;padding:8px!important;background-color:#f8fafc!important;border-radius:6px!important;font-style:italic!important;color:#475569!important;font-size:12px!important;border-left-width:3px!important;border-left-style:solid!important;border-left-color:#E68A96!important;">"${extract('代表性发言')}"</div>
            </div>`;
        });
        
        return `<div style="width:100%!important;max-width:500px!important;margin:8px auto!important;background-color:#fdfdfd!important;border-radius:12px!important;box-shadow:0 10px 25px rgba(236,72,153,0.15)!important;border-width:4px!important;border-style:solid!important;border-color:#ffffff!important;overflow:hidden!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;font-size:14px!important;line-height:normal!important;white-space:normal!important;">
            <div style="height:32px!important;background-color:#ffe4e8!important;border-bottom-width:2px!important;border-bottom-style:solid!important;border-bottom-color:white!important;display:flex!important;align-items:center!important;padding:0 12px!important;gap:8px!important;">
                <div style="display:flex!important;gap:6px!important;">
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#ff5f57!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#febc2e!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#28c840!important;display:inline-block!important;"></div>
                </div>
                <div style="flex:1!important;text-align:center!important;font-size:13px!important;font-weight:600!important;color:#be185d!important;opacity:0.8!important;margin-right:40px!important;">✨ 招募中心.app</div>
            </div>
            <div style="padding:15px!important;display:flex!important;flex-direction:column!important;gap:15px!important;">
                ${cardsHTML}
                <button class="beautify-confirm-btn" style="width:100%!important;padding:10px!important;border-radius:8px!important;font-weight:600!important;font-size:13px!important;border:none!important;cursor:pointer!important;background:linear-gradient(135deg,#FF9EAA 0%,#E68A96 100%)!important;color:white!important;box-shadow:0 4px 10px rgba(255,158,170,0.3)!important;">请先选择候选人</button>
            </div>
        </div>`;
    },
    
    tenantlore: (data) => {
        const nameRegex = /姓名[：:]\s*([^\n\r]+)/g;
        const names = [];
        let match;
        while ((match = nameRegex.exec(data)) !== null) { names.push(match[1].trim()); }
        
        if (names.length === 0) return '<p style="color:#ec4899;">❌ 数据解析异常</p>';
        
        let tenantsData = [];
        if (names.length === 1) {
            tenantsData.push({ name: names[0], content: data.trim() });
        } else {
            const blocks = data.split(/基本信息[：:]/);
            for (let i = 1; i < blocks.length && i - 1 < names.length; i++) {
                tenantsData.push({ name: names[i - 1], content: '基本信息：' + blocks[i].trim() });
            }
        }
        
        let cardsHTML = '';
        tenantsData.forEach((tenant, index) => {
            cardsHTML += `<div style="background:#fff!important;border-radius:10px!important;padding:12px!important;border:2px solid #fce7f3!important;box-shadow:0 2px 8px rgba(0,0,0,0.02)!important;margin-bottom:10px!important;">
                <div style="color:#831843!important;font-weight:700!important;font-size:16px!important;margin-bottom:10px!important;display:flex!important;align-items:center!important;gap:8px!important;">👤 ${tenant.name}</div>
                <div class="beautify-edit-area" data-name="${tenant.name}" data-index="${index}" contenteditable="true" style="width:100%!important;min-height:150px!important;max-height:600px!important;overflow-y:auto!important;padding:10px!important;border:1px solid #e2e8f0!important;border-radius:8px!important;font-size:13px!important;line-height:1.6!important;background:#f8fafc!important;color:#334155!important;white-space:pre-wrap!important;word-wrap:break-word!important;">${tenant.content}</div>
                <div style="font-size:12px!important;color:#94a3b8!important;margin-top:8px!important;">ℹ️ 将保存为 World Info (Constant)</div>
            </div>`;
        });
        
        return `<div style="width:100%!important;max-width:500px!important;margin:8px auto!important;background-color:#fdfdfd!important;border-radius:12px!important;box-shadow:0 10px 25px rgba(236,72,153,0.15)!important;border-width:4px!important;border-style:solid!important;border-color:#ffffff!important;overflow:hidden!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;font-size:14px!important;line-height:normal!important;white-space:normal!important;">
            <div style="height:32px!important;background-color:#ffe4e8!important;border-bottom-width:2px!important;border-bottom-style:solid!important;border-bottom-color:white!important;display:flex!important;align-items:center!important;padding:0 12px!important;gap:8px!important;">
                <div style="display:flex!important;gap:6px!important;">
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#ff5f57!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#febc2e!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#28c840!important;display:inline-block!important;"></div>
                </div>
                <div style="flex:1!important;text-align:center!important;font-size:13px!important;font-weight:600!important;color:#be185d!important;opacity:0.8!important;margin-right:40px!important;">📂 租客档案.app</div>
            </div>
            <div style="padding:15px!important;display:flex!important;flex-direction:column!important;gap:15px!important;">
                ${cardsHTML}
                <div style="display:flex!important;gap:10px!important;margin-top:5px!important;">
                    <button class="beautify-add-memory-btn" style="flex:1!important;padding:10px!important;border-radius:8px!important;font-weight:600!important;font-size:13px!important;border:none!important;cursor:pointer!important;background:linear-gradient(135deg,#a7f3d0 0%,#34d399 100%)!important;color:#064e3b!important;box-shadow:0 4px 10px rgba(52,211,153,0.3)!important;">➕ 添加常驻记忆</button>
                    <button class="beautify-move-in-btn" style="flex:1!important;padding:10px!important;border-radius:8px!important;font-weight:600!important;font-size:13px!important;border:none!important;cursor:pointer!important;background:linear-gradient(135deg,#FF9EAA 0%,#E68A96 100%)!important;color:white!important;box-shadow:0 4px 10px rgba(255,158,170,0.3)!important;">🔑 办理入住</button>
                </div>
                <div class="beautify-room-picker" style="display:none!important;margin-top:10px!important;">
                    <div style="font-size:13px!important;font-weight:600!important;color:#831843!important;margin-bottom:8px!important;">🏠 选择入住房间</div>
                    <div class="beautify-room-grid"></div>
                    <div style="margin-top:6px!important;display:none!important;" class="beautify-room-fallback">
                        <input type="text" class="beautify-room-input" placeholder="输入房间名（如：卧室A）" style="width:100%!important;padding:8px 10px!important;border:1px solid #e2e8f0!important;border-radius:8px!important;font-size:13px!important;">
                    </div>
                    <div style="display:flex!important;gap:10px!important;margin-top:8px!important;">
                        <button class="beautify-confirm-room-btn" style="flex:1!important;padding:10px!important;border-radius:8px!important;font-weight:600!important;font-size:13px!important;border:none!important;cursor:pointer!important;background:#e2e8f0!important;color:#94a3b8!important;pointer-events:none!important;">请先选择房间</button>
                    </div>
                </div>
            </div>
        </div>`;
    },
    
    diary_entry: (data) => {
        const lines = data.trim().split('\n');
        const dateMatch = lines[0].match(/(\d{4}年\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2})/);
        const dateStr = dateMatch ? lines[0] : '';
        const content = dateMatch ? lines.slice(1).join('\n').trim() : data.trim();
        return `<div style="width:100%!important;max-width:450px!important;margin:8px auto!important;background-color:#fdfdfd!important;border-radius:12px!important;box-shadow:0 10px 25px rgba(236,72,153,0.15)!important;border-width:4px!important;border-style:solid!important;border-color:#ffffff!important;overflow:hidden!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;font-size:14px!important;line-height:normal!important;white-space:normal!important;">
            <div style="height:32px!important;background-color:#fef3c7!important;border-bottom-width:2px!important;border-bottom-style:solid!important;border-bottom-color:white!important;display:flex!important;align-items:center!important;padding:0 12px!important;gap:8px!important;">
                <div style="display:flex!important;gap:6px!important;">
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#ff5f57!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#febc2e!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#28c840!important;display:inline-block!important;"></div>
                </div>
                <div style="flex:1!important;text-align:center!important;font-size:13px!important;font-weight:600!important;color:#92400e!important;opacity:0.8!important;margin-right:40px!important;">📔 日记本.app</div>
            </div>
            <div style="padding:15px!important;background-color:#fffbeb!important;">
                ${dateStr ? `<div style="font-size:12px!important;color:#b45309!important;margin-bottom:10px!important;border-bottom-width:1px!important;border-bottom-style:dashed!important;border-bottom-color:#fcd34d!important;padding-bottom:8px!important;">${dateStr}</div>` : ''}
                <div style="font-size:14px!important;color:#78350f!important;line-height:1.8!important;white-space:pre-wrap!important;font-style:italic!important;">${content}</div>
            </div>
        </div>`;
    },
    
    live_stream: (data) => {
        const lines = data.trim().split('\n');
        let screen = '', comments = '';
        if (lines[0].includes('[直播画面]')) {
            screen = lines[0].trim();
            comments = lines.slice(1).join('\n').trim();
        } else {
            comments = data.trim();
        }
        return `<div style="width:100%!important;max-width:420px!important;margin:8px auto!important;background-color:#181818!important;border-radius:12px!important;box-shadow:0 10px 25px rgba(0,0,0,0.3)!important;border-width:4px!important;border-style:solid!important;border-color:#333333!important;overflow:hidden!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;font-size:14px!important;line-height:normal!important;white-space:normal!important;">
            <div style="height:32px!important;background-color:#2a2a2a!important;border-bottom-width:2px!important;border-bottom-style:solid!important;border-bottom-color:#333333!important;display:flex!important;align-items:center!important;padding:0 12px!important;gap:8px!important;">
                <div style="display:flex!important;gap:6px!important;">
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#ff5f57!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#febc2e!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#28c840!important;display:inline-block!important;"></div>
                </div>
                <div style="flex:1!important;text-align:center!important;font-size:13px!important;font-weight:600!important;color:#ff6b6b!important;opacity:0.8!important;margin-right:40px!important;">🔴 直播中</div>
            </div>
            ${screen ? `<div style="background-color:#000000!important;padding:15px!important;color:#e0e0e0!important;font-size:14px!important;white-space:pre-wrap!important;line-height:1.6!important;">${screen}</div>` : ''}
            <div style="background-color:#2a2a2a!important;padding:6px!important;text-align:center!important;font-size:12px!important;color:#888888!important;">- 实时评论 -</div>
            <div style="background-color:#181818!important;padding:12px!important;color:#ffffff!important;font-size:13px!important;line-height:1.8!important;max-height:150px!important;overflow-y:auto!important;white-space:pre-wrap!important;">${comments}</div>
        </div>`;
    },
    
    group_chat: (data) => {
        const lines = data.trim().split('\n');
        let title = '群聊';
        let messagesText = data.trim();
        if (lines.length > 0 && !lines[0].includes(':') && !lines[0].includes('：')) {
            title = lines[0].trim();
            messagesText = lines.slice(1).join('\n').trim();
        }
        let messagesHTML = '';
        messagesText.split('\n').forEach(line => {
            const match = line.match(/^([^:：]+)[：:](.*)$/);
            if (match) {
                const sender = match[1].trim();
                const msg = match[2].trim();
                messagesHTML += `<div style="margin-bottom:12px!important;"><div style="font-size:12px!important;color:#888!important;margin-bottom:3px!important;">${sender}</div>
                    <div style="background:#fff!important;border-radius:8px!important;padding:8px 10px!important;font-size:14px!important;color:#111!important;display:inline-block!important;max-width:90%!important;">${msg}</div></div>`;
            }
        });
        return `<div style="width:100%!important;max-width:400px!important;margin:8px auto!important;background-color:#fdfdfd!important;border-radius:12px!important;box-shadow:0 10px 25px rgba(236,72,153,0.15)!important;border-width:4px!important;border-style:solid!important;border-color:#ffffff!important;overflow:hidden!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;font-size:14px!important;line-height:normal!important;white-space:normal!important;">
            <div style="height:32px!important;background-color:#ededed!important;border-bottom-width:2px!important;border-bottom-style:solid!important;border-bottom-color:white!important;display:flex!important;align-items:center!important;padding:0 12px!important;gap:8px!important;">
                <div style="display:flex!important;gap:6px!important;">
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#ff5f57!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#febc2e!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#28c840!important;display:inline-block!important;"></div>
                </div>
                <div style="flex:1!important;text-align:center!important;font-size:13px!important;font-weight:600!important;color:#111111!important;opacity:0.8!important;margin-right:40px!important;">💬 ${title}</div>
            </div>
            <div style="padding:15px!important;background-color:#f5f5f5!important;max-height:350px!important;overflow-y:auto!important;">${messagesHTML}</div>
        </div>`;
    },
    
    search_history: (data) => {
        const lines = data.trim().split('\n');
        let title = '搜索记录';
        let content = data.trim();
        if (lines.length > 1 && lines[0].length < 30) {
            title = lines[0];
            content = lines.slice(1).join('\n').trim();
        }
        return `<div style="width:100%!important;max-width:400px!important;margin:8px auto!important;background-color:#fdfdfd!important;border-radius:12px!important;box-shadow:0 10px 25px rgba(236,72,153,0.15)!important;border-width:4px!important;border-style:solid!important;border-color:#ffffff!important;overflow:hidden!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;font-size:14px!important;line-height:normal!important;white-space:normal!important;">
            <div style="height:32px!important;background-color:#f3f4f6!important;border-bottom-width:2px!important;border-bottom-style:solid!important;border-bottom-color:white!important;display:flex!important;align-items:center!important;padding:0 12px!important;gap:8px!important;">
                <div style="display:flex!important;gap:6px!important;">
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#ff5f57!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#febc2e!important;display:inline-block!important;"></div>
                    <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#28c840!important;display:inline-block!important;"></div>
                </div>
                <div style="flex:1!important;text-align:center!important;font-size:13px!important;font-weight:600!important;color:#1f2937!important;opacity:0.8!important;margin-right:40px!important;">🔍 ${title}</div>
            </div>
            <div style="padding:15px!important;background-color:#f9fafb!important;">
                <div style="font-size:14px!important;color:#374151!important;line-height:1.7!important;white-space:pre-wrap!important;">${content}</div>
            </div>
        </div>`;
    },
    
    updatevariable: (data) => {
        return `<details style="margin: 8px 0; border: 1px dashed #ccc; padding: 5px; border-radius: 4px; background: #f9f9f9;">
            <summary style="cursor: pointer; font-size: 12px; color: #666;">🛠️ 系统变量更新 (点击查看)</summary>
            <pre style="margin: 5px 0; font-size: 11px; color: #333; overflow-x: auto;">${data}</pre>
        </details>`;
    }
};

function defaultRenderer(tagName, data) {
    const title = tagName.charAt(0).toUpperCase() + tagName.slice(1);
    return `<div style="width:100%!important;max-width:500px!important;margin:8px auto!important;background-color:#fdfdfd!important;border-radius:12px!important;box-shadow:0 10px 25px rgba(236,72,153,0.15)!important;border-width:4px!important;border-style:solid!important;border-color:#ffffff!important;overflow:hidden!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;font-size:14px!important;line-height:normal!important;white-space:normal!important;">
        <div style="height:32px!important;background-color:#ffe4e8!important;border-bottom-width:2px!important;border-bottom-style:solid!important;border-bottom-color:white!important;display:flex!important;align-items:center!important;padding:0 12px!important;gap:8px!important;">
            <div style="display:flex!important;gap:6px!important;">
                <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#ff5f57!important;display:inline-block!important;"></div>
                <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#febc2e!important;display:inline-block!important;"></div>
                <div style="width:10px!important;height:10px!important;border-radius:50%!important;background-color:#28c840!important;display:inline-block!important;"></div>
            </div>
            <div style="flex:1!important;text-align:center!important;font-size:13px!important;font-weight:600!important;color:#be185d!important;opacity:0.8!important;margin-right:40px!important;">📋 ${title}</div>
        </div>
        <div style="padding:15px!important;white-space:pre-wrap!important;">${data}</div>
    </div>`;
}

// ============ 事件绑定函数 ============
function bindTagEvents($container) {
    let selectedCandidates = [];
    $container.find('.beautify-candidate-card').each(function() {
        $(this).on('click', function() {
            const name = $(this).data('name');
            const $card = $(this);
            
            if ($card.data('selected')) {
                $card.data('selected', false);
                $card.css({
                    'background': '#fff',
                    'border-color': '#fce7f3',
                    'box-shadow': '0 2px 8px rgba(0,0,0,0.02)'
                });
                $card.find('.beautify-check-mark').remove();
                selectedCandidates = selectedCandidates.filter(n => n !== name);
            } else {
                if (selectedCandidates.length >= 2) {
                    alert('最多入住2人哦！');
                    return;
                }
                $card.data('selected', true);
                $card.css({
                    'background': '#fff1f2',
                    'border-color': '#E68A96',
                    'box-shadow': '0 0 0 2px #E68A96'
                });
                if ($card.find('.beautify-check-mark').length === 0) {
                    $card.append('<div class="beautify-check-mark" style="position:absolute;top:10px;right:10px;color:white;background:#E68A96;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;">✔</div>');
                }
                selectedCandidates.push(name);
            }
            const $btn = $container.find('.beautify-confirm-btn');
            if (selectedCandidates.length > 0) {
                $btn.text(`确认入住 (${selectedCandidates.length}/2)`);
                $btn.css('opacity', '1');
            } else {
                $btn.text('请先选择候选人');
            }
        });
    });
    
    $container.find('.beautify-confirm-btn').on('click', function() {
        if ($(this).hasClass('disabled') || selectedCandidates.length === 0) return;
        
        const namesText = selectedCandidates.map(n => `"${n}"`).join('和');
        const message = `我选择 ${namesText} 作为新租客。请为${selectedCandidates.length === 1 ? '这位租客' : '这些租客'}生成详细的固定信息。`;
        
        if (typeof triggerSlash === 'function') {
            triggerSlash(`/send ${message}|/trigger`);
        } else {
            alert('选择已记录：' + namesText);
        }
        $(this).text('✅ 已提交申请').addClass('disabled');
    });
    
    $container.find('.beautify-add-memory-btn').on('click', function() {
        const $btn = $(this);
        if ($btn.hasClass('disabled') || $btn.data('saving')) return;
        $btn.data('saving', true);
        
        // 优先使用酒馆助手API（确保蓝灯常驻）
        if (typeof getOrCreateChatWorldbook === 'function' && typeof updateWorldbookWith === 'function') {
            (async () => {
                try {
                    const loreName = await getOrCreateChatWorldbook('current');
                    if (!loreName) { alert('无法创建ChatLore'); return; }
                    let successCount = 0;
                    const $areas = $container.find('.beautify-edit-area');
                    for (let i = 0; i < $areas.length; i++) {
                        const $area = $areas.eq(i);
                        const content = $area.text().trim();
                        const name = $area.data('name');
                        if (content && name) {
                            await updateWorldbookWith(loreName, function(entries) {
                                const idx = entries.findIndex(function(e) { return e.name === name; });
                                const entry = {
                                    name: name, enabled: true, content: content,
                                    strategy: { type: 'constant', keys: [name], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
                                    position: { type: 'before_character_definition', role: 'system', depth: 4, order: 100 },
                                    probability: 100
                                };
                                if (idx >= 0) entries[idx] = Object.assign({}, entries[idx], entry); else entries.push(entry);
                                return entries;
                            });
                            successCount++;
                        }
                    }
                    $btn.html('✅ 已保存').addClass('disabled');
                    if (successCount > 0) alert(`✅ ${successCount} 份档案已归档（蓝灯常驻）！`);
                } catch(e) { if (e.name !== 'AbortError') alert('保存失败: ' + e.message); }
                finally { $btn.data('saving', false); }
            })();
        } else if (typeof triggerSlash === 'function') {
            // 回退：使用斜杠命令
            let successCount = 0;
            $container.find('.beautify-edit-area').each(function(index) {
                const content = $(this).text().trim();
                const name = $(this).data('name');
                if (content && name) {
                    triggerSlash(`/getchatbook | /createentry file={{pipe}} key=${name} ${content}`);
                    setTimeout(() => {
                        triggerSlash(`/getchatbook | /setentryfield file={{pipe}} key=${name} field=constant true`);
                    }, 200 * (index + 1));
                    successCount++;
                }
            });
            $btn.html('✅ 已保存').addClass('disabled');
            if (successCount > 0) alert(`✅ ${successCount} 份档案已归档！`);
        } else {
            alert('请在酒馆中运行此功能');
        }
    });
    
    $container.find('.beautify-move-in-btn').on('click', function() {
        const $btn = $(this);
        if ($btn.hasClass('disabled')) return;
        
        const $picker = $container.find('.beautify-room-picker');
        if ($picker.css('display') !== 'none') {
            $picker.css('display', 'none');
            return;
        }
        
        // 获取卧室列表
        let bedrooms = [];
        try { bedrooms = parent.getApartmentBedrooms ? parent.getApartmentBedrooms() : []; } catch(e) {}
        
        const $grid = $picker.find('.beautify-room-grid');
        const $fallback = $picker.find('.beautify-room-fallback');
        const $confirmRoom = $picker.find('.beautify-confirm-room-btn');
        let selectedRoomKey = '';
        let selectedRoomOccupant = '';
        
        $grid.empty();
        if (bedrooms.length > 0) {
            $fallback.css('display', 'none');
            bedrooms.forEach(function(r) {
                const badgeClass = r.isEmpty ? 'beautify-room-badge-empty' : 'beautify-room-badge-occupied';
                const badgeText = r.isEmpty ? '✅ 空闲' : '🏠 ' + r.occupant;
                const $card = $(`<div class="beautify-room-card" data-key="${r.key}" data-occupant="${r.isEmpty ? '' : r.occupant}" style="flex:0 0 calc(50% - 3px)!important;padding:8px 10px!important;border:2px solid #e2e8f0!important;border-radius:10px!important;cursor:pointer!important;background:#fff!important;text-align:left!important;">
                    <div style="font-weight:600!important;font-size:0.85em!important;color:#1e293b!important;">${r.name}</div>
                    <div style="font-size:0.7em!important;color:#6B7280!important;margin-top:1px!important;">${r.floor} · ${r.position}</div>
                    <span style="font-size:0.65em!important;padding:1px 5px!important;border-radius:6px!important;display:inline-block!important;margin-top:3px!important;${r.isEmpty ? 'background:#dcfce7!important;color:#166534!important;' : 'background:#fef3c7!important;color:#92400e!important;'}">${badgeText}</span>
                </div>`);
                $card.on('click', function() {
                    $grid.find('.beautify-room-card').css({'border-color':'#e2e8f0','background':'#fff','box-shadow':'none'});
                    $(this).css({'border-color':'#E68A96','background':'#FFF0F5','box-shadow':'0 0 0 2px rgba(230,138,150,0.2)'});
                    selectedRoomKey = r.key;
                    selectedRoomOccupant = r.isEmpty ? '' : r.occupant;
                    $confirmRoom.css({'background':'linear-gradient(135deg,#FF9EAA 0%,#E68A96 100%)','color':'white','pointer-events':'auto','box-shadow':'0 4px 10px rgba(255,158,170,0.3)'}).text('入住 → ' + r.name);
                });
                $grid.append($card);
            });
            // 默认选中第一个空闲卧室
            const $firstEmpty = $grid.find('.beautify-room-card[data-occupant=""]').first();
            const $auto = $firstEmpty.length ? $firstEmpty : $grid.find('.beautify-room-card').first();
            if ($auto.length) $auto.trigger('click');
        } else {
            $grid.html('<div style="text-align:center!important;padding:12px!important;color:#EF4444!important;font-size:13px!important;width:100%!important;">⚠️ 无法获取卧室数据，请手动输入</div>');
            $fallback.css('display', 'block');
            $fallback.find('.beautify-room-input').off('input').on('input', function() {
                const v = $(this).val().trim();
                if (v) {
                    selectedRoomKey = v; selectedRoomOccupant = '';
                    $confirmRoom.css({'background':'linear-gradient(135deg,#FF9EAA 0%,#E68A96 100%)','color':'white','pointer-events':'auto'}).text('入住 → ' + v);
                } else {
                    $confirmRoom.css({'background':'#e2e8f0','color':'#94a3b8','pointer-events':'none'}).text('请先选择房间');
                }
            });
        }
        $picker.css('display', 'block');
        
        // 确认入住（带房间）
        $confirmRoom.off('click').on('click', function() {
            if (!selectedRoomKey) return;
            const names = [];
            $container.find('.beautify-edit-area').each(function() {
                const name = $(this).data('name');
                if (name) names.push('"' + name + '"');
            });
            let message = '请让 ' + names.join('和') + ' 正式入住「' + selectedRoomKey + '」。';
            if (selectedRoomOccupant) {
                message += '（该房间已有住户「' + selectedRoomOccupant + '」，新租客将合租，住户字段更新为「' + selectedRoomOccupant + '、新租客姓名」）';
            }
            if (typeof triggerSlash === 'function') {
                triggerSlash('/send ' + message + '|/trigger');
            } else {
                alert('入住请求已记录');
            }
            $(this).text('✅ 已提交').css({'background':'#e2e8f0','color':'#94a3b8','pointer-events':'none'});
            $btn.text('✅ 已安排入住').addClass('disabled');
        });
    });
}

// ============ 核心美化函数（完整修复版） ============
async function beautifyMessage(messageId, forceRerender = false) {
    const config = await getConfig();
    if (!config.enabled) return;
    const element = retrieveDisplayedMessage(messageId)?.[0];
    const raw = getChatMessages(messageId)?.[0]?.message;
    if (!element || raw === undefined) return;
    return landlord.renderMessage(messageId, {raw,config}, element,
        () => beautifyMessageOnce(messageId, true));
}
async function beautifyMessageOnce(messageId, forceRerender = false) {
    const config = await getConfig();
    if (!config.enabled) return;
    
    if (typeof retrieveDisplayedMessage !== 'function') return;
    
    // 等待DOM稳定
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 获取显示元素 - 增加重试机制
    let $mes = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries && (!$mes || $mes.length === 0)) {
        $mes = retrieveDisplayedMessage(messageId);
        if (!$mes || $mes.length === 0) {
            await new Promise(resolve => setTimeout(resolve, 100 * (retryCount + 1)));
            retryCount++;
        }
    }
    
    if (!$mes || $mes.length === 0) return;
    
    if ($mes.data('beautified') && !forceRerender) return;
    
    if (forceRerender) {
        $mes.data('beautified', false);
        $mes = retrieveDisplayedMessage(messageId);
        if (!$mes || $mes.length === 0) return;
    }
    
    if (typeof getChatMessages !== 'function') return;
    
    const messages = getChatMessages(messageId);
    if (!messages || messages.length === 0) return;
    
    let rawMessage = messages[0].message || '';
    
    // ========== 关键修复：清理CSS代码 ==========
    // 移除<style>标签及其内容
    rawMessage = rawMessage.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // 移除CSS类定义
    rawMessage = rawMessage.replace(/\.[a-zA-Z0-9_-]+\s*\{[^}]*\}/g, '');
    
    // 移除CSS ID定义
    rawMessage = rawMessage.replace(/#[a-zA-Z0-9_-]+\s*\{[^}]*\}/g, '');
    
    // 移除属性选择器
    rawMessage = rawMessage.replace(/\[[^\]]+\]\s*\{[^}]*\}/g, '');
    
    // 移除内联样式
    rawMessage = rawMessage.replace(/style\s*=\s*["'][^"']*["']/gi, '');
    
    // 移除常见的CSS属性
    const cssProperties = [
        'color:', 'background:', 'font-size:', 'margin:', 'padding:', 
        'border:', 'width:', 'height:', 'display:', 'position:',
        'top:', 'left:', 'right:', 'bottom:', 'z-index:',
        'opacity:', 'transform:', 'transition:', 'animation:'
    ];
    
    cssProperties.forEach(prop => {
        const regex = new RegExp(prop + '\s*[^;]+;?', 'gi');
        rawMessage = rawMessage.replace(regex, '');
    });
    
    // ========== 关键修复：改进变量更新标签匹配逻辑 ==========
    let thinkContent = '';
    let mainContent = rawMessage;
    let tailContent = '';
    
    // 1. 提取思维链
    const thinkingTags = ['think', 'thinking', 'reasoning', 'thought'];
    for (const tag of thinkingTags) {
        const regex = new RegExp(`^(<${tag}[^>]*>[\s\S]*?<\/${tag}>)`, 'i');
        const match = rawMessage.match(regex);
        if (match) {
            thinkContent = match[1];
            mainContent = rawMessage.substring(match[1].length);
            break;
        }
    }
    
    // 用户配置标签
    if (!thinkContent && config.thinkingEndTag) {
        const endTag = config.thinkingEndTag.trim();
        const endIdx = rawMessage.indexOf(endTag);
        if (endIdx !== -1) {
            thinkContent = rawMessage.substring(0, endIdx + endTag.length);
            mainContent = rawMessage.substring(endIdx + endTag.length);
        }
    }
    
    // 2. 改进的变量更新标签提取逻辑（处理长文本和嵌套）
    // 从消息末尾向前搜索，找到最后一个完整的变量更新标签
    let lastVariableTag = '';
    let contentBeforeTail = mainContent;
    
    // 尝试匹配 UpdateVariable 标签
    const uvRegex = /<UpdateVariable\b[^>]*>([\s\S]*?)<\/UpdateVariable>/gi;
    let uvMatch;
    let lastUvMatch = null;
    
    while ((uvMatch = uvRegex.exec(mainContent)) !== null) {
        lastUvMatch = uvMatch;
    }
    
    // 尝试匹配 StatusPlaceHolderImpl 标签
    const statusRegex = /<StatusPlaceHolderImpl\b[^>]*>([\s\S]*?)<\/StatusPlaceHolderImpl>/gi;
    let statusMatch;
    let lastStatusMatch = null;
    
    while ((statusMatch = statusRegex.exec(mainContent)) !== null) {
        lastStatusMatch = statusMatch;
    }
    
    // 确定哪个标签在更靠后的位置
    let finalMatch = null;
    
    if (lastUvMatch && lastStatusMatch) {
        // 两个都有，取位置更靠后的
        finalMatch = lastUvMatch.index > lastStatusMatch.index ? lastUvMatch : lastStatusMatch;
    } else if (lastUvMatch) {
        finalMatch = lastUvMatch;
    } else if (lastStatusMatch) {
        finalMatch = lastStatusMatch;
    }
    
    if (finalMatch) {
        // 提取标签及其之后的所有内容（包括可能的多余文字）
        const matchStart = finalMatch.index;
        tailContent = mainContent.substring(matchStart);
        contentBeforeTail = mainContent.substring(0, matchStart);
        
        // 检查tailContent是否包含额外的文本（可能是未被包裹的文字）
        // 如果是，将这些文本移回主内容
        const tagEnd = finalMatch[0].length;
        const extraText = tailContent.substring(tagEnd);
        
        if (extraText.trim()) {
            // 有额外文本，将其移回主内容
            contentBeforeTail += extraText;
            tailContent = tailContent.substring(0, tagEnd);
            console.log('[正文美化] 发现并修复未被包裹的文本，长度:', extraText.length);
        }
        
        console.log('[正文美化] ✓ 提取变量更新标签，位置:', matchStart, '长度:', tailContent.length);
    } else {
        // 没有找到完整的变量更新标签，检查是否有不完整的标签
        const partialUvMatch = mainContent.match(/<UpdateVariable\b[\s\S]*$/i);
        const partialStatusMatch = mainContent.match(/<StatusPlaceHolderImpl\b[\s\S]*$/i);
        
        if (partialUvMatch || partialStatusMatch) {
            // 有不完整的标签，将其作为tailContent，其余作为mainContent
            const partialMatch = partialUvMatch || partialStatusMatch;
            const matchStart = partialMatch.index;
            tailContent = mainContent.substring(matchStart);
            contentBeforeTail = mainContent.substring(0, matchStart);
            console.log('[正文美化] ⚠️ 提取不完整的变量更新标签，长度:', tailContent.length);
        } else {
            console.log('[正文美化] ✗ 无变量更新标签');
        }
    }
    
    mainContent = contentBeforeTail;
    
    // ========== 关键修复：确保正文非空 ==========
    if (!mainContent.trim() && rawMessage.trim()) {
        console.log('[正文美化] 警告：正文为空，使用清理后的完整消息');
        mainContent = rawMessage;
        thinkContent = '';
        tailContent = '';
    }
    
    // ========== 处理自定义标签 ==========
    let processedMain = mainContent;
    const customTags = ['companion', 'tenantlore', 'diary_entry', 'live_stream', 'group_chat', 'search_history', 'updatevariable'];
    const renderedBlocks = [];
    
    for (const tagName of customTags) {
        const tagRegex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
        processedMain = processedMain.replace(tagRegex, (fullMatch, innerContent) => {
            const renderer = tagRenderers[tagName.toLowerCase()];
            const rendered = renderer ? renderer(innerContent) : defaultRenderer(tagName, innerContent);
            const idx = renderedBlocks.length;
            renderedBlocks.push(rendered);
            return `___BEAUTIFY_BLOCK_${idx}___`;
        });
    }
    
    // ========== Markdown格式化 ==========
    const codeBlocks = [];
    processedMain = processedMain.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
        const idx = codeBlocks.length;
        codeBlocks.push(`<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`);
        return `___CODE_BLOCK_${idx}___`;
    });
    
    processedMain = processedMain
        .replace(/^####\s*(.+)$/gm, '<h4>$1</h4>')
        .replace(/^###\s*(.+)$/gm, '<h3>$1</h3>')
        .replace(/^##\s*(.+)$/gm, '<h2>$1</h2>')
        .replace(/^#\s*(.+)$/gm, '<h1>$1</h1>');
    
    processedMain = processedMain.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    processedMain = processedMain.replace(/^[-*_]{3,}$/gm, '<hr>');
    
    processedMain = processedMain.replace(/(?:^|\n)((?:[-*+] .+\n?)+)/g, (m, list) => {
        const items = list.trim().split(/\n/).map(line => {
            const content = line.replace(/^[-*+] /, '');
            return `<li>${content}</li>`;
        }).join('');
        return `<ul>${items}</ul>`;
    });
    
    processedMain = processedMain.replace(/(?:^|\n)((?:\d+\. .+\n?)+)/g, (m, list) => {
        const items = list.trim().split(/\n/).map(line => {
            const content = line.replace(/^\d+\. /, '');
            return `<li>${content}</li>`;
        }).join('');
        return `<ol>${items}</ol>`;
    });
    
    processedMain = processedMain
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br>');
    
    processedMain = processedMain
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    
    const htmlTags = [];
    processedMain = processedMain.replace(/<[^>]+>/g, (tag) => {
        const idx = htmlTags.length;
        htmlTags.push(tag);
        return `___HTML_TAG_${idx}___`;
    });
    
    processedMain = processedMain.replace(/"([^"]+)"/g, '___DIALOGUE_START___$1___DIALOGUE_END___');
    processedMain = processedMain.replace(/\u201c([^\u201d]+)\u201d/g, '___DIALOGUE_START_CN___$1___DIALOGUE_END_CN___');
    processedMain = processedMain.replace(/「([^」]+)」/g, '___DIALOGUE_START_JP1___$1___DIALOGUE_END_JP1___');
    processedMain = processedMain.replace(/『([^』]+)』/g, '___DIALOGUE_START_JP2___$1___DIALOGUE_END_JP2___');
    processedMain = processedMain.replace(/'([^']+)'/g, '___THOUGHT_START___$1___THOUGHT_END___');
    processedMain = processedMain.replace(/\u2018([^\u2019]+)\u2019/g, '___THOUGHT_START_CN___$1___THOUGHT_END_CN___');
    
    processedMain = processedMain.replace(/___HTML_TAG_(\d+)___/g, (m, idx) => htmlTags[parseInt(idx)]);
    
    processedMain = processedMain
        .replace(/___DIALOGUE_START___(.+?)___DIALOGUE_END___/g, '<span class="beautify-dialogue">"$1"</span>')
        .replace(/___DIALOGUE_START_CN___(.+?)___DIALOGUE_END_CN___/g, '<span class="beautify-dialogue">\u201c$1\u201d</span>')
        .replace(/___DIALOGUE_START_JP1___(.+?)___DIALOGUE_END_JP1___/g, '<span class="beautify-dialogue">「$1」</span>')
        .replace(/___DIALOGUE_START_JP2___(.+?)___DIALOGUE_END_JP2___/g, '<span class="beautify-dialogue">『$1』</span>')
        .replace(/___THOUGHT_START___(.+?)___THOUGHT_END___/g, "<span class=\"beautify-thought\">'$1'</span>")
        .replace(/___THOUGHT_START_CN___(.+?)___THOUGHT_END_CN___/g, '<span class="beautify-thought">\u2018$1\u2019</span>');
    
    processedMain = processedMain.replace(/___CODE_BLOCK_(\d+)___/g, (m, idx) => codeBlocks[parseInt(idx)]);
    
    if (!processedMain.startsWith('<') && !processedMain.startsWith('___BEAUTIFY')) {
        processedMain = '<p>' + processedMain + '</p>';
    }
    
    processedMain = processedMain.replace(/___BEAUTIFY_BLOCK_(\d+)___/g, (m, idx) => {
        return renderedBlocks[parseInt(idx)];
    });
    
    // ========== 包装Mac窗口 ==========
    const isDarkMode = detectBeautifyTheme(config);
    const darkClass = isDarkMode ? ' beautify-dark' : '';
    const macWindow = `<div class="${darkClass}"><div class="beautify-mac-window">
        <div class="beautify-mac-header">
            <div class="beautify-mac-controls">
                <span class="beautify-mac-dot red"></span>
                <span class="beautify-mac-dot yellow"></span>
                <span class="beautify-mac-dot green"></span>
            </div>
        </div>
        <div class="beautify-mac-body">${processedMain}</div>
    </div></div>`;
    
    // ========== 渲染think部分 ==========
    let thinkHtml = '';
    if (thinkContent) {
        let thinkInner = thinkContent;
        for (const tag of ['think', 'thinking', 'reasoning', 'thought']) {
            const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
            const match = thinkContent.match(regex);
            if (match) {
                thinkInner = match[1].trim();
                break;
            }
        }
        if (thinkInner === thinkContent) {
            thinkInner = thinkContent.trim();
        }
        
        thinkHtml = `
<link href="https://fonts.loli.net/css2?family=Fira+Code:wght@400&family=Kosugi+Maru&display=swap" rel="stylesheet">
<div class="think-wrapper" style="width:98%;margin:15px auto;position:relative;z-index:5;font-family:'Kosugi Maru',sans-serif;">
    <div style="padding:5px;transition:all 0.3s ease;border:none;">
        <details class="think-details" style="background:transparent;">
            <summary class="think-summary" style="list-style:none;cursor:pointer;padding:0;display:block;position:relative;">
                <div class="think-header-bar" style="background:#4A6FA5;border:4px solid #FFFFFF;border-radius:15px;padding:10px 25px;box-shadow:0 6px 0px #3A5A8A;display:flex;align-items:center;justify-content:flex-start;transition:all 0.1s cubic-bezier(0.34,1.56,0.64,1);position:relative;z-index:10;width:100%;box-sizing:border-box;">
                    <div class="think-title" style="font-family:'Leckerli One',cursive;font-weight:400;font-style:normal;font-size:clamp(1.3rem,4vw,2.5em);line-height:1.1;color:#FFFFFF;text-shadow:3px 3px 0px #3A5A8A;text-align:left;width:100%;padding-left:10px;display:flex;align-items:center;gap:10px;"><img src="https://files.catbox.moe/uyz060.png" style="height:1.2em;vertical-align:middle;"> Chain of Thought</div>
                </div>
            </summary>
            
            <div class="think-content-area" style="margin-top:20px;animation:slideOpen 0.3s ease-out;">
                <div class="think-code-window" style="background:#1a1a2e;border:4px solid #6B8DC9;border-radius:15px;box-shadow:8px 8px 0 rgba(107,141,201,0.3);overflow:hidden;font-family:'Fira Code',monospace;">
                    <div class="think-window-header" style="background:#6B8DC9;padding:10px 15px;display:flex;align-items:center;border-bottom:3px solid #5A7CB8;position:relative;height:35px;">
                        <div style="display:flex;gap:8px;">
                            <span style="width:12px;height:12px;border-radius:50%;box-shadow:0 2px 0 rgba(0,0,0,0.1);background:#FF5F56;display:inline-block;"></span>
                            <span style="width:12px;height:12px;border-radius:50%;box-shadow:0 2px 0 rgba(0,0,0,0.1);background:#FFBD2E;display:inline-block;"></span>
                            <span style="width:12px;height:12px;border-radius:50%;box-shadow:0 2px 0 rgba(0,0,0,0.1);background:#27C93F;display:inline-block;"></span>
                        </div>
                        <div style="position:absolute;left:50%;transform:translateX(-50%);color:#fff;font-family:'Leckerli One',cursive;font-weight:400;font-style:normal;font-size:clamp(0.7rem,3.5vw,1.3em);letter-spacing:1px;text-shadow:2px 2px 0 rgba(90,124,184,1);z-index:2;white-space:nowrap;width:auto;max-width:70%;overflow:visible;text-align:center;">✨ thinking_process.txt ✨</div>
                    </div>
                    <div style="background:#1a1a2e;position:relative;padding:0;">
                        <pre style="margin:0;padding:20px;color:#c0c0d0;font-size:0.95em;line-height:1.6;overflow-x:auto;white-space:pre-wrap;max-height:400px;scrollbar-width:thin;scrollbar-color:#4b5263 #1a1a2e;font-family:'Fira Code',monospace;">${thinkInner}</pre>
                    </div>
                </div>
            </div>
        </details>
    </div>
</div>
<style>
    .think-summary::-webkit-details-marker { display: none; }
    .think-details[open] .think-header-bar,
    .think-summary:active .think-header-bar {
        transform: translateY(4px);
        box-shadow: 0 2px 0px #3A5A8A !important;
        background: #5A7CB8 !important;
    }
</style>`;
    }
    
    // ========== 渲染tail部分 ==========
    let tailHtml = '';
    if (tailContent && typeof formatAsDisplayedMessage === 'function') {
        tailHtml = formatAsDisplayedMessage(tailContent, { message_id: messageId });
    }
    
    // ========== 组装最终HTML ==========
    let finalHtml = thinkHtml;
    
    // 只有正文有内容时才添加美化框
    if (processedMain.trim()) {
        finalHtml += macWindow;
    }
    
    finalHtml += tailHtml;
    
    // ========== 更新DOM ==========
    $mes.html(finalHtml);
    $mes.data('beautified', true);
    
    // 绑定交互事件
    bindTagEvents($mes);
}

// ============ 注入样式 ============
function injectStyles() {
    if ($('#beautify-styles').length === 0) {
        const styleId = 'beautify-styles-' + Date.now();
        $('head').append(`<style id="${styleId}">${BEAUTIFY_CSS}</style>`);
        
        setTimeout(() => {
            if ($('#' + styleId).length === 0) {
                $('head').append(`<style id="beautify-styles-backup-${Date.now()}">${BEAUTIFY_CSS}</style>`);
            }
        }, 1000);
    }
}

// ============ 初始化 ============
console.log('[正文美化] ★★★ 脚本文件已加载 ★★★');

$(document).ready(function() {
    console.log('[正文美化] DOM完全就绪，开始初始化...');
    
    // 注入样式（确保最早执行）
    injectStyles();
    
    // 延迟初始化，确保酒馆环境完全加载
    setTimeout(async () => {
        console.log('[正文美化] 开始延迟初始化...');
        
        // 检查SillyTavern环境
        if (!window.SillyTavern || typeof SillyTavern.getContext !== 'function') {
            console.error('[正文美化] 需要SillyTavern环境');
            return;
        }
        
        // 检查事件系统是否存在
        if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined') {
            console.error('[正文美化] 事件系统不存在');
            return;
        }
        
        // 使用标志防止重复初始化
        if (beautifyInitialized) {
            console.log('[正文美化] 已经初始化过，跳过');
            return;
        }
        beautifyInitialized = true;
        
        // ========== 事件监听 ==========
        let pendingMessages = new Set();
        let processing = false;
        
        async function processPendingMessages() {
            if (processing) return;
            processing = true;
            
            while (pendingMessages.size) {
                const messageId = pendingMessages.values().next().value;
                pendingMessages.delete(messageId);
                try {
                    await beautifyMessage(messageId, false);
                } catch (e) {
                    console.error('[正文美化] 美化出错:', e);
                }
            }
            
            processing = false;
        }
        
        // 合并事件监听，避免重复美化
        function scheduleBeautify(messageId) {
            if (isRerendering) {
                return;
            }
            
            pendingMessages.add(messageId);
            
            clearTimeout(window.beautifyTimeout);
            window.beautifyTimeout = setTimeout(() => {
                processPendingMessages();
            }, 300);
        }
        
        // 监听角色消息渲染事件
        eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            console.log('[正文美化] 收到消息渲染事件, ID:', messageId);
            scheduleBeautify(messageId);
        });
        
        // 监听消息编辑事件
        eventOn(tavern_events.MESSAGE_EDITED, (messageId) => {
            console.log('[正文美化] 收到消息编辑事件, ID:', messageId);
            setTimeout(() => {
                scheduleBeautify(messageId);
            }, 200);
        });
        
        // 监听新消息接收事件
        eventOn(tavern_events.MESSAGE_RECEIVED, (messageId) => {
            console.log('[正文美化] 收到新消息事件, ID:', messageId);
            setTimeout(() => {
                scheduleBeautify(messageId);
            }, 500);
        });
        
        // 监听聊天切换事件
        eventOn(tavern_events.CHAT_CHANGED, async () => {
            console.log('[正文美化] 聊天切换事件');
            setTimeout(async () => {
                try {
                    const config = await getConfig();
                    if (typeof getLastMessageId !== 'function' || typeof getChatMessages !== 'function') {
                        return;
                    }
                    
                    const lastId = getLastMessageId();
                    if (lastId >= 0) {
                        const allMessages = getChatMessages(`0-${lastId}`, { role: 'assistant' });
                        let messagesToRender = allMessages;
                        if (config.renderDepth > 0 && allMessages.length > config.renderDepth) {
                            messagesToRender = allMessages.slice(-config.renderDepth);
                        }
                        
                        for (const msg of messagesToRender) {
                            const $mes = retrieveDisplayedMessage(msg.message_id);
                            if ($mes) $mes.data('beautified', false);
                            await beautifyMessage(msg.message_id, true);
                        }
                    }
                } catch (e) {
                    console.error('[正文美化] 聊天切换后美化出错:', e);
                }
            }, 800);
        });
        
        // 监听消息swipe事件
        eventOn(tavern_events.MESSAGE_SWIPED, async (messageId) => {
            console.log('[正文美化] 消息swipe事件, ID:', messageId);
            setTimeout(async () => {
                try {
                    const $mes = retrieveDisplayedMessage(messageId);
                    if ($mes) $mes.data('beautified', false);
                    await scheduleBeautify(messageId);
                } catch (e) {
                    console.error('[正文美化] swipe后美化出错:', e);
                }
            }, 200);
        });
        
        console.log('[正文美化] 事件监听已设置');
        
        // 美化现有消息
        setTimeout(async () => {
            try {
                const config = await getConfig();
                if (typeof getLastMessageId !== 'function' || typeof getChatMessages !== 'function') {
                    return;
                }
                
                const lastId = getLastMessageId();
                if (lastId >= 0) {
                    const allMessages = getChatMessages(`0-${lastId}`, { role: 'assistant' });
                    let messagesToRender = allMessages;
                    if (config.renderDepth > 0 && allMessages.length > config.renderDepth) {
                        messagesToRender = allMessages.slice(-config.renderDepth);
                    }
                    
                    console.log('[正文美化] 开始美化', messagesToRender.length, '条历史消息');
                    
                    for (const msg of messagesToRender) {
                        await beautifyMessage(msg.message_id, false);
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                }
            } catch (e) {
                console.error('[正文美化] 处理历史消息出错:', e);
            }
        }, 1500);
        
        console.log('[正文美化] 初始化完成');
    }, 1000);
});

// 创建并监听设置按钮
try {
    if (typeof appendInexistentScriptButtons === 'function') {
        appendInexistentScriptButtons([{ name: '美化设置', visible: true }]);
        
        if (typeof getButtonEvent === 'function') {
            eventOn(getButtonEvent('美化设置'), showConfigPanel);
        }
    }
} catch (e) {
    console.error('[正文美化] 绑定设置按钮失败:', e);
}
