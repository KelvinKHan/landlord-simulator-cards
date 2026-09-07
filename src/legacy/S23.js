/**
 * 创意工坊 - 客户端主脚本 (Phase 1: 纯本地版)
 * 
 * 【按照掌上公寓.js的模式】
 * - 使用酒馆助手的$操作父页面DOM
 * - HTML一次性注入父页面body
 * - 事件绑定到targetDoc的元素上
 */

// ============ 常量配置 ============
const WS_PREFIX = 'workshop_';
const WS_DB_NAME = 'WorkshopStickersDB';
const WS_DB_VERSION = 2;
const WS_DB_STORE = 'stickers';
const WS_DB_CONTENT_STORE = 'contents';
const WS_LORE_PREFIX = { character: '[创意角色]', room: '[创意房间]', world: '[创意世界]' };
const WS_TYPES = ['character', 'room', 'world', 'sticker'];
function wsTypeLabel(type) { return wsIcon({character:'user',room:'home',world:'globe',sticker:'smile'}[type]||'star', 14) + ' ' + {character:'创意角色',room:'创意房间',world:'创意世界',sticker:'表情包'}[type]; }
function wsTypeIcon(type) { return wsIcon({character:'user',room:'home',world:'globe',sticker:'smile'}[type]||'star', 14); }

// ============ 随脚本内置的 SVG 图标系统 ============
const WS_ICON_MAP = {
    arrowLeft: 'arrow-left', arrowRight: 'arrow-right',
    checkCircle: 'check-circle', xCircle: 'x-circle',
    alertTriangle: 'alert-triangle',
    cloudUp: 'cloud-upload', cloudDown: 'cloud-download',
    logIn: 'log-in', logOut: 'log-out',
    barChart: 'bar-chart-2', trash: 'trash-2',
    loader: 'loader-2', edit: 'pencil',
    userPlus: 'user-plus', hammer: 'hammer', layers: 'layers',
    globe: 'globe', checkCircle2: 'check-circle-2',
    eyeOff: 'eye-off', arrowDown: 'chevron-down'
};

function wsIcon(name, size) {
    size = size || 16;
    var iconName = WS_ICON_MAP[name] || name;
    return '<img src="' + landlord.iconUrl('lucide:' + iconName) + '" width="' + size + '" height="' + size + '" style="display:inline-block;vertical-align:middle;flex-shrink:0;">';
}

let wsCurrentTab = 'character';
let wsBtnDragData = null;
let wsViewMode = 'local'; // 'local' 或 'cloud'
let wsCloudCurrentPage = 1;

// ============ 云端缓存（减少API调用） ============
const WS_CLOUD_CACHE = {};  // key: 'type:page:sort' → { data, ts }
const WS_CLOUD_CACHE_TTL = 60000; // 60秒缓存
function wsCloudCacheKey(type, page, sort) { return type + ':' + page + ':' + (sort || 'newest'); }
function wsCloudCacheGet(key) {
    var c = WS_CLOUD_CACHE[key];
    if (c && Date.now() - c.ts < WS_CLOUD_CACHE_TTL) return c.data;
    return null;
}
function wsCloudCacheSet(key, data) { WS_CLOUD_CACHE[key] = { data: data, ts: Date.now() }; }
function wsCloudCacheClear() { for (var k in WS_CLOUD_CACHE) delete WS_CLOUD_CACHE[k]; }

// ============ 云端API配置 ============
// 部署后将此URL改为你的Worker地址
const WS_API_BASE = localStorage.getItem(WS_PREFIX + 'apiBase') || 'https://workshop-api.chenoo.workers.dev';

function wsGetAuthToken() { return localStorage.getItem(WS_PREFIX + 'authToken') || ''; }
function wsSaveAuthToken(token) { localStorage.setItem(WS_PREFIX + 'authToken', token); }
function wsGetAuthUser() {
    try { return JSON.parse(localStorage.getItem(WS_PREFIX + 'authUser')) || null; } catch (e) { return null; }
}
function wsSaveAuthUser(user) { localStorage.setItem(WS_PREFIX + 'authUser', JSON.stringify(user)); }
function wsLogout() { localStorage.removeItem(WS_PREFIX + 'authToken'); localStorage.removeItem(WS_PREFIX + 'authUser'); }
function wsIsLoggedIn() { return !!wsGetAuthToken(); }
function wsIsCloudEnabled() { return !!WS_API_BASE; }

// 云端API请求封装
async function wsApiFetch(path, options) {
    if (!WS_API_BASE) throw new Error('未配置API地址');
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';
    var token = wsGetAuthToken();
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    var res = await fetch(WS_API_BASE + path, options);
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error ' + res.status);
    return data;
}

// Discord登录（弹出窗口 + 轮询方式）
function wsDiscordLogin() {
    if (!WS_API_BASE) { wsToastErr('未配置API地址'); return; }
    // 生成随机key用于轮询
    var authKey = 'ws_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var w = 500, h = 700;
    var left = (screen.width - w) / 2, top = (screen.height - h) / 2;
    var popup = window.parent.open(WS_API_BASE + '/api/auth/discord?redirect=' + encodeURIComponent(authKey), 'workshop_discord_auth', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);

    var resolved = false;

    function onAuthSuccess(data) {
        if (resolved) return;
        resolved = true;
        wsSaveAuthToken(data.token);
        wsSaveAuthUser(data.user);
        wsToastOk('Discord登录成功: ' + (data.user.displayName || data.user.username));
        wsUpdateFooterAuth(window.parent.document);
    }

    // 方式1: postMessage（如果opener可用）
    function onMessage(e) {
        if (e.data && e.data.type === 'workshop-auth' && e.data.token) {
            window.parent.removeEventListener('message', onMessage);
            onAuthSuccess(e.data);
        }
    }
    window.parent.addEventListener('message', onMessage);

    // 方式2: 轮询KV（渐进式间隔，减少API调用）
    var pollCount = 0;
    var pollInterval = 2000; // 起始2秒
    function schedulePoll() {
        setTimeout(async function() {
            pollCount++;
            if (resolved || pollCount > 30) { // 最多约2分钟
                window.parent.removeEventListener('message', onMessage);
                if (!resolved) wsToastWarn('登录超时，请重试');
                return;
            }
            try {
                var res = await fetch(WS_API_BASE + '/api/auth/poll?key=' + authKey);
                var data = await res.json();
                if (data.token) {
                    window.parent.removeEventListener('message', onMessage);
                    onAuthSuccess(data);
                    return;
                }
            } catch (e) { /* 网络错误忽略，继续轮询 */ }
            // 渐进增加间隔: 2s→3s→4s...最大6s
            if (pollInterval < 6000) pollInterval += 500;
            schedulePoll();
        }, pollInterval);
    }
    schedulePoll();
}

// 更新footer的登录状态
function wsUpdateFooterAuth(targetDoc) {
    var authArea = targetDoc.getElementById('ws-auth-area');
    if (!authArea) return;
    var user = wsGetAuthUser();
    if (user) {
        authArea.innerHTML = '<span style="font-size:12px;color:#6B7280;display:inline-flex;align-items:center;gap:4px;">' + wsIcon('user', 12) + ' ' + wsEscapeHtml(user.displayName || user.username) + (user.inGuild ? ' ' + wsIcon('checkCircle', 12) : ' <span style="color:#F59E0B;">' + wsIcon('alertTriangle', 12) + ' 未加入服务器</span>') + '</span>'
            + (user.isAdmin ? ' <button class="ws-btn ws-btn-red" data-action="open-admin" style="padding:4px 8px;font-size:11px;">' + wsIcon('shield', 11) + ' 管理</button>' : '')
            + ' <button class="ws-btn ws-btn-gray" data-action="logout" style="padding:4px 8px;font-size:11px;">' + wsIcon('logOut', 11) + ' 退出</button>';
    } else {
        authArea.innerHTML = wsIsCloudEnabled()
            ? '<button class="ws-btn ws-btn-blue" data-action="discord-login" style="padding:4px 10px;font-size:11px;">' + wsIcon('logIn', 11) + ' Discord登录</button>'
            : '<span style="font-size:11px;color:#9CA3AF;">离线模式</span>';
    }
}

// ============ IndexedDB 内容存储 ============

async function wsGetAllContent() {
    try {
        const db = await wsOpenDB();
        const items = await new Promise(r => {
            const req = db.transaction(WS_DB_CONTENT_STORE, 'readonly').objectStore(WS_DB_CONTENT_STORE).getAll();
            req.onsuccess = () => r(req.result || []);
            req.onerror = () => r([]);
        });
        const result = { character: [], room: [], world: [] };
        for (const item of items) {
            if (result[item.type]) result[item.type].push(item);
        }
        return result;
    } catch (e) { return { character: [], room: [], world: [] }; }
}

async function wsAddContent(type, item) {
    if (!item.id) item.id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (!item.type) item.type = type;
    if (!item.createdAt) item.createdAt = new Date().toISOString();
    try {
        const db = await wsOpenDB();
        return new Promise(r => {
            const req = db.transaction(WS_DB_CONTENT_STORE, 'readwrite').objectStore(WS_DB_CONTENT_STORE).put(item);
            req.onsuccess = () => r(true); req.onerror = () => r(false);
        });
    } catch (e) { return false; }
}

async function wsRemoveContent(type, id) {
    try {
        const db = await wsOpenDB();
        return new Promise(r => {
            const req = db.transaction(WS_DB_CONTENT_STORE, 'readwrite').objectStore(WS_DB_CONTENT_STORE).delete(id);
            req.onsuccess = () => r(true); req.onerror = () => r(false);
        });
    } catch (e) { return false; }
}

function wsGetPresets() {
    try { return JSON.parse(localStorage.getItem(WS_PREFIX + 'presets')) || []; } catch (e) { return []; }
}

function wsSavePresets(presets) {
    try { localStorage.setItem(WS_PREFIX + 'presets', JSON.stringify(presets)); return true; } catch (e) { return false; }
}

function wsUpsertPreset(preset) {
    const presets = wsGetPresets();
    const idx = presets.findIndex(p => p.name === preset.name);
    if (idx >= 0) presets[idx] = preset; else presets.push(preset);
    return wsSavePresets(presets);
}

function wsDeletePreset(name) { return wsSavePresets(wsGetPresets().filter(p => p.name !== name)); }

// ============ 活跃世界观存储 ============

function wsGetActiveWorldView() {
    try { return JSON.parse(localStorage.getItem(WS_PREFIX + 'active_worldview')); } catch (e) { return null; }
}

function wsSaveActiveWorldView(config) {
    try { localStorage.setItem(WS_PREFIX + 'active_worldview', JSON.stringify(config)); return true; } catch (e) { return false; }
}

function wsClearActiveWorldView() {
    localStorage.removeItem(WS_PREFIX + 'active_worldview');
}

// 内置"原汁原味"默认世界观（内容来自 世界观设定（必开）.txt）
const WS_DEFAULT_WORLDVIEW = {
    name: '原汁原味',
    source: 'builtin',
    worldLoreContent: '<World_Profile name="现代都市">\n'
        + '    world view:\n'
        + '      核心概念: 现实主义, 都市生活, 财富自由, 温馨日常, 奇遇邂逅\n'
        + '      世界类型: 21世纪中国，完全现实的现代背景。\n'
        + '      核心法则: 世界本身遵循现实规则，但偶尔会有"意外的访客"出现。\n'
        + '      地理位置:\n'
        + '        城市名称: 蒂帕维提市\n'
        + '        城市阶级: 新一线城市\n'
        + '        城市特征:\n'
        + '          - 城市规模宏大，经济与文化高度发达，吸引着全国各地的追梦者。\n'
        + '          - 金融、贸易和艺术产业繁荣，是区域性的中心都会。\n'
        + '          - 生活节奏多样，既有CBD的快节奏，也有居民区的悠闲气息。\n'
        + '\n'
        + '    home environment:\n'
        + '      住宅名称: "落日与海湾"别墅 (Sunset & Bay Villa)\n'
        + '      建筑结构: 一栋位于高档住宅区的三层独栋别墅，附带独立的地下室与顶楼阁楼。\n'
        + '      总体风格: 整体装修现代而舒适，家具兼具设计感与实用性，被打扫得一尘不染，充满了温馨的生活气息。\n'
        + '      神秘属性: 这栋别墅似乎有某种难以解释的"吸引力"——据说偶尔会有来自"其他地方"的访客出现在门口，自称迷路或不知如何到达此处。房东对此见怪不怪，只是微笑着递上一杯茶。\n'
        + '\n'
        + '    user persona:\n'
        + '      身份: "落日与海湾"别墅的唯一主人兼房东。\n'
        + '      背景故事: 早已实现财富自由的"躺平"人士，将出租别墅作为一种观察人间百态、享受慢节奏生活的乐趣。对于那些"意外的访客"，房东总是不问来处，只提供一个温暖的暂居之所。\n'
        + '      核心人设: "全能管家型"的可靠房东。\n'
        + '      性格特质: 风趣幽默，沉稳可靠，不善于花言巧语，但行动力极强。见多识广，对任何奇怪的事物都能泰然处之。\n'
        + '      魅力来源: 总能用超凡的生活技能和不经意的温柔体贴，在关键时刻解决租客们的各种麻烦，于无形中成为她们最安心的港湾和依赖。\n'
        + '\n'
        + '    special rules:\n'
        + '      跨时空访客:\n'
        + '        - 别墅偶尔会吸引来自不同时空/世界的访客（穿越者、异世界人物、游戏动漫角色等）\n'
        + '        - 这些访客以"迷路"或"意外穿越"的方式出现，大多对现代世界感到新奇\n'
        + '        - 房东可以选择收留他们成为租客，帮助他们适应现代生活\n'
        + '        - 无需深究穿越的原理——这只是别墅的一个小小"特色"\n'
        + '</World_Profile>',
    worldLoreConfig: { position: 'before_character_definition', order: 60 },
    additionalLore: [],
    greeting: '午后的阳光透过落地窗洒进客厅，将"落日与海湾"别墅的木质地板照得暖洋洋的。\n\n'
        + '你坐在沙发上，随手翻着平板电脑，目光却有些涣散。财富自由的生活固然惬意，但三层的大别墅只有你一个人住，未免显得过于冷清了。\n\n'
        + '一楼的厨房和客厅、二楼三楼那些空置的房间……这么大的房子，应该让它更有生气才对。\n\n'
        + '窗外的天空偶尔闪过一丝不易察觉的光芒——有人说，这栋别墅建在一个奇特的位置，偶尔会有"迷路的旅人"出现在门口。你对此只是一笑置之，但内心深处，却有一丝隐隐的期待。\n\n'
        + '也许，今天就会有有趣的访客敲响大门呢？\n\n'
        + '<UpdateVariable>\n<Analysis>\n- Initialization: Setting world time for game start\n</Analysis>\n'
        + '<JSONPatch>\n[\n'
        + '  {"op": "replace", "path": "/世界/年份", "value": "2025年"},\n'
        + '  {"op": "replace", "path": "/世界/日期", "value": "10月21日"},\n'
        + '  {"op": "replace", "path": "/世界/星期", "value": "星期二"},\n'
        + '  {"op": "replace", "path": "/世界/时间", "value": "14:30"}\n'
        + ']\n</JSONPatch>\n</UpdateVariable>'
};

// ============ IndexedDB 表情包 ============

function wsOpenDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(WS_DB_NAME, WS_DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(WS_DB_STORE)) {
                db.createObjectStore(WS_DB_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(WS_DB_CONTENT_STORE)) {
                const store = db.createObjectStore(WS_DB_CONTENT_STORE, { keyPath: 'id' });
                store.createIndex('type', 'type', { unique: false });
            }
        };
    });
}

// 从旧LocalStorage迁移内容到IndexedDB（仅执行一次）
async function wsMigrateContentToIDB() {
    const migrated = localStorage.getItem(WS_PREFIX + 'contentMigrated');
    if (migrated) return;
    try {
        const raw = localStorage.getItem(WS_PREFIX + 'contents');
        if (raw) {
            const contents = JSON.parse(raw);
            const db = await wsOpenDB();
            const tx = db.transaction(WS_DB_CONTENT_STORE, 'readwrite');
            const store = tx.objectStore(WS_DB_CONTENT_STORE);
            for (const type of ['character', 'room', 'world']) {
                if (contents[type]) {
                    for (const item of contents[type]) {
                        if (!item.id) item.id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                        if (!item.type) item.type = type;
                        store.put(item);
                    }
                }
            }
            await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
            console.log('[创意工坊] 内容数据已迁移到IndexedDB');
        }
        localStorage.setItem(WS_PREFIX + 'contentMigrated', '1');
    } catch (e) {
        console.error('[创意工坊] 迁移失败:', e);
    }
}

async function wsGetAllStickers() {
    try {
        const db = await wsOpenDB();
        return new Promise(r => {
            const req = db.transaction(WS_DB_STORE, 'readonly').objectStore(WS_DB_STORE).getAll();
            req.onsuccess = () => r(req.result || []);
            req.onerror = () => r([]);
        });
    } catch (e) { return []; }
}

async function wsSaveSticker(sticker) {
    if (!sticker.id) sticker.id = `sticker_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const db = await wsOpenDB();
    return new Promise(r => {
        const req = db.transaction(WS_DB_STORE, 'readwrite').objectStore(WS_DB_STORE).put(sticker);
        req.onsuccess = () => r(true); req.onerror = () => r(false);
    });
}

async function wsDeleteStickerById(id) {
    const db = await wsOpenDB();
    return new Promise(r => {
        const req = db.transaction(WS_DB_STORE, 'readwrite').objectStore(WS_DB_STORE).delete(id);
        req.onsuccess = () => r(true); req.onerror = () => r(false);
    });
}

async function wsCompressImage(file) {
    // GIF直接读取DataURL保留动画（浏览器Canvas无法保留GIF多帧）
    if (file.type === 'image/gif') {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }
    // 非GIF：Canvas缩放+WebP压缩
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = Math.min(256 / img.width, 256 / img.height, 1);
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    const r2 = new FileReader();
                    r2.onload = () => resolve(r2.result);
                    r2.readAsDataURL(blob);
                }, 'image/webp', 0.8);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ============ Phase 5: MVU 变量读取 ============

function wsGetMvuStat() {
    try {
        if (typeof Mvu !== 'undefined' && Mvu.getMvuData) {
            var data = Mvu.getMvuData({ type: 'message', message_id: 'latest' });
            return data?.stat_data || null;
        }
        // fallback: try window.parent
        if (window.parent.Mvu?.getMvuData) {
            var data = window.parent.Mvu.getMvuData({ type: 'message', message_id: 'latest' });
            return data?.stat_data || null;
        }
    } catch (e) { console.warn('[创意工坊] MVU读取失败:', e); }
    return null;
}

function wsGetFloorLayout() {
    var stat = wsGetMvuStat();
    if (!stat || !stat.公寓) return { floors: [], rooms: {} };
    return { floors: stat.公寓.楼层列表 || [], rooms: stat.公寓.房间列表 || {} };
}

function wsGetEmptyBedrooms() {
    var layout = wsGetFloorLayout();
    var result = [];
    for (var name in layout.rooms) {
        var room = layout.rooms[name];
        if (room.类型 === '卧室' && (room.住户 === '无' || !room.住户)) {
            result.push({ name: name, floor: room.楼层, position: room.位置, description: room.描述 || '', occupant: '' });
        }
    }
    return result;
}

function wsGetAllBedrooms() {
    var layout = wsGetFloorLayout();
    var result = [];
    for (var name in layout.rooms) {
        var room = layout.rooms[name];
        if (room.类型 === '卧室') {
            var occupant = room.住户 || '无';
            var isEmpty = (occupant === '无');
            result.push({ name: name, floor: room.楼层, position: room.位置, description: room.描述 || '', occupant: isEmpty ? '' : occupant, isEmpty: isEmpty });
        }
    }
    return result;
}

function wsGetOccupiedSlots(floor) {
    var layout = wsGetFloorLayout();
    var occupied = [];
    for (var name in layout.rooms) {
        var room = layout.rooms[name];
        if (room.楼层 !== floor) continue;
        if (room.位置 && room.位置.startsWith && room.位置.startsWith('outdoor')) continue;
        var parts = (room.位置 || '').split('-').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            for (var i = parts[0]; i <= parts[1]; i++) occupied.push(i);
        }
    }
    return occupied;
}

function wsGetTenantCount() {
    var stat = wsGetMvuStat();
    if (!stat || !stat.租客列表) return 0;
    return Object.keys(stat.租客列表).length;
}

// ============ Phase 5A: 角色招募入住 ============

function wsFormatAsTenantLore(item) {
    var d = item.data || item;
    return '基本信息：\n'
        + '姓名：' + (d.displayName || item.name || '未知') + '\n'
        + '性别：' + (d.gender || '未知') + '\n'
        + '年龄：' + (d.age || '未知') + '\n'
        + '职业：' + (d.profession || '未知') + '\n'
        + '外貌：' + (d.appearance || '无') + '\n'
        + '性格特点：\n' + (d.personality || '无') + '\n'
        + '背景故事：\n' + (d.background || d.backstory || '无') + '\n'
        + '兴趣爱好：\n' + (d.quirks || '无') + '\n'
        + '说话风格：\n' + (d.dialogueStyle || '无');
}

async function wsRecruitCharacter(item, targetRoomName) {
    var d = item.data || item;
    var charName = d.displayName || item.name || '未知';

    // 1. 写入ChatLore（使用纯角色名作为条目名，兼容租客分析系统的getBaseProfile）
    var loreName = await wsEnsureChatLore();
    if (!loreName) { wsToastErr('无法创建ChatLore'); return false; }
    var entryName = charName;
    var content = wsFormatAsTenantLore(item);
    var updateWB = (typeof updateWorldbookWith === 'function') ? updateWorldbookWith : window.parent.updateWorldbookWith;
    await updateWB(loreName, function(entries) {
        var idx = entries.findIndex(function(e) { return e.name === entryName; });
        var entry = {
            name: entryName, enabled: true, content: content,
            strategy: { type: 'constant', keys: [charName], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
            position: { type: 'before_character_definition', role: 'system', depth: 4, order: 100 }, probability: 100
        };
        if (idx >= 0) entries[idx] = Object.assign({}, entries[idx], entry); else entries.push(entry);
        return entries;
    });

    // 2. 生成招募指令文本，填入输入框（而非直接发送，方便批量操作）
    var layout = wsGetFloorLayout();
    var targetRoom = layout.rooms[targetRoomName];
    var existingOccupant = (targetRoom && targetRoom.住户 && targetRoom.住户 !== '无') ? targetRoom.住户 : '';
    var message = '请让「' + charName + '」入住「' + targetRoomName + '」。'
        + '她/他的固定档案已经写入ChatLore（条目名：' + entryName + '），请直接参考。'
        + '请为她/他描写入住场景，并执行<UpdateVariable>：'
        + '1. 将该租客添加到租客列表（包含年龄、外貌、职业、性格、状态、内心、关系字段）'
        + (existingOccupant
            ? '2. 该房间已有住户「' + existingOccupant + '」，请将住户字段更新为「' + existingOccupant + '、' + charName + '」（合租）。'
            : '2. 将目标房间的住户字段更新为该租客姓名。');

    wsFillInputBox(message);
    return true;
}

// 将文本填入酒馆输入框（不自动发送，让用户决定何时发送）
function wsFillInputBox(text) {
    var textarea = window.parent.document.getElementById('send_textarea');
    if (textarea) {
        var existing = textarea.value.trim();
        textarea.value = existing ? existing + '\n' + text : text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        wsToastOk('已填入输入框，请检查后发送');
    } else {
        wsToastErr('未找到输入框');
    }
}

function wsShowRecruitDialog(targetDoc, item) {
    var d = item.data || item;
    var charName = d.displayName || item.name || '未知';
    var allBedrooms = wsGetAllBedrooms();
    var emptyCount = allBedrooms.filter(function(r) { return r.isEmpty; }).length;
    var tenantCount = wsGetTenantCount();
    var panel = targetDoc.getElementById('ws-import-panel');

    var roomOptions = '';
    if (allBedrooms.length === 0) {
        roomOptions = '<div style="color:#EF4444;font-size:13px;padding:8px;text-align:center;">'
            + wsIcon('alertTriangle', 14) + ' 没有卧室！请先建造卧室。</div>';
    } else {
        roomOptions = '<div id="ws-recruit-room-cards" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;max-height:150px;overflow-y:auto;padding:2px;">';
        for (var i = 0; i < allBedrooms.length; i++) {
            var r = allBedrooms[i];
            var isFirst = (i === 0);
            var badgeStyle = r.occupant
                ? 'background:#fef3c7;color:#92400e;'
                : 'background:#dcfce7;color:#166534;';
            var badgeText = r.occupant ? '🏠 ' + wsEscapeHtml(r.occupant) : '✅ 空闲';
            var selectedStyle = isFirst ? 'border-color:#E68A96;background:#FFF0F5;box-shadow:0 0 0 2px rgba(230,138,150,0.2);' : '';
            roomOptions += '<div class="ws-room-card' + (isFirst ? ' ws-room-selected' : '') + '" data-room="' + wsEscapeHtml(r.name) + '" data-occupant="' + wsEscapeHtml(r.occupant || '') + '"'
                + ' style="flex:0 0 calc(50% - 3px);padding:8px 10px;border:2px solid #eee;border-radius:10px;cursor:pointer;transition:all 0.2s;text-align:left;' + selectedStyle + '">'
                + '<div style="font-weight:600;font-size:0.85em;">' + wsEscapeHtml(r.name) + '</div>'
                + '<div style="font-size:0.7em;color:#6B7280;">' + wsEscapeHtml(r.floor) + ' · ' + wsEscapeHtml(r.position) + '</div>'
                + '<span style="font-size:0.65em;padding:1px 5px;border-radius:6px;display:inline-block;margin-top:3px;' + badgeStyle + '">' + badgeText + '</span>'
                + '</div>';
        }
        roomOptions += '</div>';
    }

    var charInfo = '<div style="background:#FFF5F7;border:1px solid #FCE7F3;border-radius:10px;padding:12px;margin-bottom:12px;">'
        + '<div style="font-weight:700;color:#831843;font-size:15px;margin-bottom:6px;">' + wsIcon('user', 15) + ' ' + wsEscapeHtml(charName) + '</div>'
        + '<div style="font-size:12px;color:#6B7280;line-height:1.6;">'
        + (d.gender ? '<b>性别:</b> ' + wsEscapeHtml(d.gender) + ' · ' : '')
        + (d.age ? '<b>年龄:</b> ' + wsEscapeHtml(d.age) + '<br>' : '')
        + (d.profession ? '<b>职业:</b> ' + wsEscapeHtml(d.profession) + '<br>' : '')
        + (d.personality ? '<b>性格:</b> ' + wsEscapeHtml(d.personality) + '<br>' : '')
        + (d.appearance ? '<b>外貌:</b> ' + wsEscapeHtml(d.appearance) + '<br>' : '')
        + (d.background ? '<b>背景:</b> ' + wsEscapeHtml(d.background) + '<br>' : '')
        + '</div></div>';

    panel.innerHTML = '<h3 style="color:#831843;margin:0 0 12px;display:flex;align-items:center;gap:6px;">'
        + wsIcon('user-plus', 18) + ' 招募入住</h3>'
        + charInfo
        + '<div style="font-size:13px;color:#6B7280;margin-bottom:6px;">'
        + wsIcon('home', 13) + ' 空闲卧室: ' + emptyCount + ' 间 · 当前租客: ' + tenantCount + ' 人（支持合租）</div>'
        + roomOptions
        + '<div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">'
        + (allBedrooms.length > 0 ? '<button class="ws-btn ws-btn-pink" data-action="confirm-recruit" data-id="' + item.id + '">' + wsIcon('user-plus', 12) + ' 确认招募</button>' : '')
        + '<button class="ws-btn ws-btn-gray" data-action="cancel">取消</button></div>';
    panel.classList.add('active');

    // 绑定房间卡片点击事件（单选）
    var cardsContainer = panel.querySelector('#ws-recruit-room-cards');
    if (cardsContainer) {
        cardsContainer.addEventListener('click', function(e) {
            var card = e.target.closest('.ws-room-card');
            if (!card) return;
            cardsContainer.querySelectorAll('.ws-room-card').forEach(function(c) {
                c.classList.remove('ws-room-selected');
                c.style.borderColor = '#eee';
                c.style.background = '';
                c.style.boxShadow = '';
            });
            card.classList.add('ws-room-selected');
            card.style.borderColor = '#E68A96';
            card.style.background = '#FFF0F5';
            card.style.boxShadow = '0 0 0 2px rgba(230,138,150,0.2)';
        });
    }
}

// ============ Phase 5C: 房间安装 ============

function wsShowInstallRoomDialog(targetDoc, item) {
    var d = item.data || item;
    var roomName = d.displayName || item.name || '未知';
    var layout = wsGetFloorLayout();
    var panel = targetDoc.getElementById('ws-import-panel');

    // 计算每层的占用情况
    var floorSpaceInfo = {};
    for (var i = 0; i < layout.floors.length; i++) {
        var floor = layout.floors[i];
        var occupied = wsGetOccupiedSlots(floor);
        var available = [];
        for (var slot = 1; slot <= 10; slot++) {
            if (occupied.indexOf(slot) === -1) available.push(slot);
        }
        floorSpaceInfo[floor] = { occupied: occupied, available: available };
    }

    var floorOptions = '<select id="ws-install-floor" class="ws-input" style="margin-bottom:8px;">';
    for (var i = 0; i < layout.floors.length; i++) {
        var floor = layout.floors[i];
        var info = floorSpaceInfo[floor];
        var availableStr = info.available.length > 0 ? info.available.join(',') : '无';
        floorOptions += '<option value="' + wsEscapeHtml(floor) + '" data-available="' + wsEscapeHtml(availableStr) + '">' + wsEscapeHtml(floor) + '</option>';
    }
    floorOptions += '</select>';

    var defaultSize = 2;
    var roomType = d.roomType || '功能性房间';

    var roomInfo = '<div style="background:#FFF5F7;border:1px solid #FCE7F3;border-radius:10px;padding:12px;margin-bottom:12px;">'
        + '<div style="font-weight:700;color:#831843;font-size:15px;margin-bottom:6px;">' + wsIcon('home', 15) + ' ' + wsEscapeHtml(roomName) + '</div>'
        + '<div style="font-size:12px;color:#6B7280;line-height:1.6;">'
        + '<b>类型:</b> ' + wsEscapeHtml(roomType) + '<br>'
        + (d.description ? '<b>描述:</b> ' + wsEscapeHtml(d.description) + '<br>' : '')
        + '</div></div>';

    // 获取第一层的可用空间
    var firstFloor = layout.floors[0] || '';
    var firstFloorInfo = floorSpaceInfo[firstFloor] || { available: [] };
    var firstAvailableStr = firstFloorInfo.available.length > 0 ? firstFloorInfo.available.join(', ') : '无';

    panel.innerHTML = '<h3 style="color:#831843;margin:0 0 12px;display:flex;align-items:center;gap:6px;">'
        + wsIcon('hammer', 18) + ' 安装到公寓</h3>'
        + roomInfo
        + '<div style="font-size:13px;color:#6B7280;margin-bottom:6px;">' + wsIcon('layers', 13) + ' 选择楼层:</div>'
        + floorOptions
        + '<div id="ws-floor-space-info" style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:8px;padding:8px;margin-bottom:8px;font-size:12px;color:#0369A1;">'
        + wsIcon('info', 12) + ' <strong>可用格子:</strong> <span id="ws-available-slots">' + firstAvailableStr + '</span></div>'
        + '<div style="display:flex;gap:8px;margin-bottom:8px;">'
        + '<div style="flex:1;"><div style="font-size:12px;color:#6B7280;margin-bottom:4px;">起始格子 (1-10)</div>'
        + '<input class="ws-input" id="ws-install-start" type="number" min="1" max="10" value="1"></div>'
        + '<div style="flex:1;"><div style="font-size:12px;color:#6B7280;margin-bottom:4px;">大小 (格)</div>'
        + '<input class="ws-input" id="ws-install-size" type="number" min="1" max="10" value="' + defaultSize + '"></div></div>'
        + '<div style="display:flex;gap:8px;margin-bottom:8px;">'
        + '<div style="flex:1;"><div style="font-size:12px;color:#6B7280;margin-bottom:4px;">房间类型</div>'
        + '<select id="ws-install-type" class="ws-input">'
        + '<option value="功能性房间"' + (roomType === '功能性房间' ? ' selected' : '') + '>功能性房间</option>'
        + '<option value="卧室"' + (roomType === '卧室' ? ' selected' : '') + '>卧室</option></select></div></div>'
        + '<div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">'
        + '<button class="ws-btn ws-btn-pink" data-action="confirm-install" data-id="' + item.id + '">' + wsIcon('hammer', 12) + ' 确认安装</button>'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel">取消</button></div>';
    panel.classList.add('active');

    // 绑定楼层选择器change事件（不用inline onchange，因为在iframe中无法访问脚本闭包内函数）
    var floorSelect = panel.querySelector('#ws-install-floor');
    if (floorSelect) {
        floorSelect.addEventListener('change', function() {
            var selectedOption = floorSelect.options[floorSelect.selectedIndex];
            var availableStr = selectedOption.getAttribute('data-available') || '无';
            var slotsSpan = panel.querySelector('#ws-available-slots');
            if (slotsSpan) slotsSpan.textContent = availableStr;
        });
    }
}

async function wsInstallRoom(item, floor, startPos, size, roomType) {
    var d = item.data || item;
    var endPos = startPos + (size || 2) - 1;
    var message = '请将' + floor + '的' + startPos + '-' + endPos + '格装修为「' + (d.displayName || item.name) + '」，'
        + '类型为' + (roomType || '功能性房间') + '。'
        + '房间描述：' + (d.description || '无') + '。'
        + '请执行<UpdateVariable>将此房间添加到公寓.房间列表中。';

    wsFillInputBox(message);
    return true;
}

// ============ Phase 5D: 世界观应用 ============

// 自动检测模式：有greeting就应用Part A，有worldLoreContent/描述就应用Part B
async function wsApplyWorldView(item) {
    var d = item.data || item;
    var worldName = d.displayName || item.name || '未知';
    var hasGreeting = !!d.greeting;
    var hasLore = !!(d.worldLoreContent || d.description || d.era);

    // Part B: 写入ChatLore世界观条目（如果有世界观内容）
    if (hasLore) {
        var loreContent = d.worldLoreContent || wsFormatForLore('world', item);
        var loreConfig = d.worldLoreConfig || { position: 'before_character_definition', order: 60 };
        var addLore = d.additionalLore || [];
        await wsInjectWorldLore(worldName, loreContent, loreConfig, addLore);
    }

    // Part A: 替换当前聊天的第0楼消息（如果有开场白）
    if (hasGreeting) {
        await wsReplaceFirstMessage(d.greeting);
    }

    // 保存为活跃世界观（用于新聊天自动注入Part B）
    wsSaveActiveWorldView({
        name: worldName,
        source: item.id ? 'workshop' : 'builtin',
        worldLoreContent: hasLore ? (d.worldLoreContent || wsFormatForLore('world', item)) : null,
        worldLoreConfig: d.worldLoreConfig || { position: 'before_character_definition', order: 60 },
        additionalLore: d.additionalLore || [],
        greeting: hasGreeting ? d.greeting : null,
        appliedAt: new Date().toISOString()
    });

    return { lore: hasLore, greeting: hasGreeting };
}

// 将世界观写入当前聊天的ChatLore（抽取的公共函数，自动注入也使用此函数）
async function wsInjectWorldLore(worldName, loreContent, loreConfig, additionalLore) {
    var loreName = await wsEnsureChatLore();
    if (!loreName) { wsToastErr('无法创建ChatLore'); return false; }

    var updateWB = (typeof updateWorldbookWith === 'function') ? updateWorldbookWith : window.parent.updateWorldbookWith;
    await updateWB(loreName, function(entries) {
        entries = entries.filter(function(e) { return !e.name.startsWith('[创意世界]'); });

        var validPositions = ['at_depth','before_character_definition','after_character_definition','before_example_messages','after_example_messages','before_author_note','after_author_note'];
        var rawPos = (loreConfig && loreConfig.position) || 'at_depth';
        // 向后兼容旧的 'before_char' 别名
        if (rawPos === 'before_char') rawPos = 'before_character_definition';
        var posType = validPositions.indexOf(rawPos) >= 0 ? rawPos : 'at_depth';
        var posObj = { type: posType, order: (loreConfig && loreConfig.order) || 90 };
        if (posType === 'at_depth') {
            posObj.role = (loreConfig && loreConfig.role) || 'system';
            posObj.depth = (loreConfig && loreConfig.depth) || 4;
        }
        entries.push({
            name: '[创意世界]' + worldName,
            enabled: true,
            content: loreContent,
            strategy: { type: 'constant', keys: ['[创意世界]' + worldName], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
            position: posObj,
            probability: 100
        });

        if (additionalLore && Array.isArray(additionalLore)) {
            for (var i = 0; i < additionalLore.length; i++) {
                var lore = additionalLore[i];
                entries.push({
                    name: lore.name || ('[创意世界]附加规则' + (i + 1)),
                    enabled: true, content: lore.content || '',
                    strategy: { type: lore.constant !== false ? 'constant' : 'selective', keys: [lore.name || ''], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
                    position: { type: 'at_depth', role: 'system', depth: lore.depth || 4, order: 91 },
                    probability: 100
                });
            }
        }
        return entries;
    });
    return true;
}

// 替换当前聊天的第0楼消息（开场白），per-chat操作
async function wsReplaceFirstMessage(greetingText) {
    try { return await landlord.rebuildOpening(greetingText); }
    catch(error) { console.error('[创意工坊] 更换开场失败:', error); return false; }
}

// 自动注入活跃世界观到当前聊天的ChatLore（用于 chat_id_changed 事件）
async function wsAutoInjectWorldView() {
    var config = wsGetActiveWorldView();
    if (!config || !config.worldLoreContent) return;
    try {
        await wsInjectWorldLore(
            config.name,
            config.worldLoreContent,
            config.worldLoreConfig || { position: 'before_character_definition', order: 60 },
            config.additionalLore || []
        );
        console.log('[创意工坊] 自动注入世界观:', config.name);
    } catch (e) {
        console.warn('[创意工坊] 自动注入世界观失败:', e);
    }
}

// 一键注入原汁原味默认世界观（走统一的wsApplyWorldView，自动处理Part A + Part B）
async function wsApplyDefaultWorldView() {
    return await wsApplyWorldView({ name: WS_DEFAULT_WORLDVIEW.name, data: WS_DEFAULT_WORLDVIEW });
}

async function wsClearWorldView() {
    var loreName = await wsEnsureChatLore();
    if (!loreName) return;
    var delFn = (typeof deleteWorldbookEntries === 'function') ? deleteWorldbookEntries : window.parent.deleteWorldbookEntries;
    await delFn(loreName, function(e) { return e.name.startsWith('[创意世界]'); });
    // 同时清除活跃世界观，防止新聊天自动注入已清除的世界观
    wsClearActiveWorldView();
}

function wsShowApplyWorldDialog(targetDoc, item) {
    var d = item.data || item;
    var worldName = d.displayName || item.name || '未知';
    var panel = targetDoc.getElementById('ws-import-panel');
    var hasGreeting = !!d.greeting;
    var hasLore = !!(d.worldLoreContent || d.description || d.era);

    var worldInfo = '<div style="background:#FFF5F7;border:1px solid #FCE7F3;border-radius:10px;padding:12px;margin-bottom:12px;">'
        + '<div style="font-weight:700;color:#831843;font-size:15px;margin-bottom:6px;">' + wsIcon('globe', 15) + ' ' + wsEscapeHtml(worldName) + '</div>'
        + '<div style="font-size:12px;color:#6B7280;line-height:1.6;">'
        + (d.era ? '<b>时代:</b> ' + wsEscapeHtml(d.era) + '<br>' : '')
        + (d.atmosphere ? '<b>氛围:</b> ' + wsEscapeHtml(d.atmosphere) + '<br>' : '')
        + (d.buildingType ? '<b>建筑:</b> ' + wsEscapeHtml(d.buildingType) + '<br>' : '')
        + (d.description ? '<b>描述:</b> ' + wsEscapeHtml(typeof d.description === 'string' ? d.description.substring(0, 100) + (d.description.length > 100 ? '...' : '') : '') + '<br>' : '')
        + '</div></div>';

    // 自动检测并显示将要执行的操作（非手动选择）
    var actionItems = '';
    if (hasLore) actionItems += wsIcon('check-circle', 13) + ' <span style="color:#059669;">写入ChatLore世界观条目</span><br>';
    else actionItems += wsIcon('x-circle', 13) + ' <span style="color:#9CA3AF;">无世界观内容</span><br>';
    if (hasGreeting) actionItems += wsIcon('check-circle', 13) + ' <span style="color:#059669;">替换当前聊天第0楼消息（开场白）</span><br>';
    else actionItems += wsIcon('x-circle', 13) + ' <span style="color:#9CA3AF;">无绑定开场白</span><br>';
    if (hasLore) actionItems += wsIcon('check-circle', 13) + ' <span style="color:#059669;">设为活跃世界观（新聊天自动注入ChatLore）</span><br>';

    var actions = '<div style="font-size:13px;color:#6B7280;margin-bottom:10px;line-height:1.8;">'
        + '<div style="font-weight:600;margin-bottom:4px;">' + wsIcon('list', 13) + ' 将执行以下操作：</div>'
        + actionItems + '</div>';

    var warnings = '<div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;color:#92400E;">'
        + wsIcon('alertTriangle', 12) + ' 请确保已禁用WorldBook中的「世界观设定（必开）」<br>'
        + (hasGreeting ? wsIcon('alertTriangle', 12) + ' 将直接替换当前聊天的第0楼消息' : '')
        + '</div>';

    panel.innerHTML = '<h3 style="color:#831843;margin:0 0 12px;display:flex;align-items:center;gap:6px;">'
        + wsIcon('globe', 18) + ' 应用世界观</h3>'
        + worldInfo + actions + warnings
        + '<div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">'
        + '<button class="ws-btn ws-btn-pink" data-action="confirm-apply-world" data-id="' + item.id + '">' + wsIcon('globe', 12) + ' 确认应用</button>'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel">取消</button></div>';
    panel.classList.add('active');
}

// ============ ChatLore 集成 ============

async function wsEnsureChatLore() {
    try {
        var fn = (typeof getOrCreateChatWorldbook === 'function') ? getOrCreateChatWorldbook : window.parent.getOrCreateChatWorldbook;
        return await fn('current');
    } catch (e) { return null; }
}

function wsFormatForLore(type, item) {
    const p = WS_LORE_PREFIX[type] || '[创意工坊]';
    const d = item.data || item;
    switch (type) {
        case 'character':
            return `${p}${d.displayName}\n性别: ${d.gender||'未知'}\n年龄: ${d.age||'未知'}\n职业: ${d.profession||'未知'}\n性格: ${d.personality||'无'}\n外貌: ${d.appearance||'无'}\n背景: ${d.background||'无'}\n特点: ${d.quirks||'无'}\n说话风格: ${d.dialogueStyle||'无'}`;
        case 'room':
            return `${p}${d.displayName}\n类型: ${d.roomType||'功能性房间'}\n描述: ${d.description||'无'}`;
        case 'world': {
            let t = `${p}${d.displayName}\n时代: ${d.era||'未知'}\n描述: ${d.description||'无'}\n规则: ${d.rules||'无'}\n氛围: ${d.atmosphere||'无'}`;
            if (d.buildingType) t += `\n建筑类型: ${d.buildingType}`;
            if (d.floors) t += `\n楼层: ${d.floors}`;
            if (Array.isArray(d.rooms)) t += `\n房间:\n${d.rooms.map(r=>`  - ${r.name} (${r.floor}F, 容量${r.capacity})`).join('\n')}`;
            if (Array.isArray(d.specialTerms)) t += `\n特殊术语: ${d.specialTerms.join('、')}`;
            return t;
        }
        default: return `${p}${item.name}\n${JSON.stringify(d, null, 2)}`;
    }
}

async function wsWriteToChatLore(type, item) {
    const loreName = await wsEnsureChatLore();
    if (!loreName) return false;
    const d = item.data || item;
    const updateWB = (typeof updateWorldbookWith === 'function') ? updateWorldbookWith : window.parent.updateWorldbookWith;

    if (type === 'character') {
        // 角色使用纯人名作为条目名 + TenantLore格式，兼容租客分析系统
        const charName = d.displayName || item.name || '未知';
        const content = wsFormatAsTenantLore(item);
        await updateWB(loreName, (entries) => {
            const idx = entries.findIndex(e => e.name === charName);
            const entry = { name: charName, enabled: true, content,
                strategy: { type: 'constant', keys: [charName], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
                position: { type: 'before_character_definition', role: 'system', depth: 4, order: 100 }, probability: 100 };
            if (idx >= 0) entries[idx] = { ...entries[idx], ...entry }; else entries.push(entry);
            return entries;
        });
    } else {
        // 其他类型保持原有格式
        const entryName = `${WS_LORE_PREFIX[type]||'[创意工坊]'}${item.name || d.displayName || item.id}`;
        const content = wsFormatForLore(type, item);
        await updateWB(loreName, (entries) => {
            const idx = entries.findIndex(e => e.name === entryName);
            const entry = { name: entryName, enabled: true, content,
                strategy: { type: 'constant', keys: [entryName], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
                position: { type: 'before_character_definition', role: 'system', depth: 4, order: 100 }, probability: 100 };
            if (idx >= 0) entries[idx] = { ...entries[idx], ...entry }; else entries.push(entry);
            return entries;
        });
    }
    return true;
}

async function wsApplyPreset(presetName) {
    const preset = wsGetPresets().find(p => p.name === presetName);
    if (!preset) return { lore: 0, world: false };
    const contents = await wsGetAllContent();
    let loreOk = 0;
    let worldApplied = false;
    for (const ref of preset.items) {
        if (ref.type === 'sticker') continue;
        const item = contents[ref.type]?.find(c => c.id === ref.id);
        if (!item) continue;
        if (ref.type === 'world') {
            // 世界观使用深度融合（ChatLore + 第0楼消息）
            var wvResult = await wsApplyWorldView(item);
            if (wvResult && (wvResult.lore || wvResult.greeting)) worldApplied = true;
        } else {
            if (await wsWriteToChatLore(ref.type, item)) loreOk++;
        }
    }
    return { lore: loreOk, world: worldApplied };
}

// ============ 导入导出 ============

async function wsExportAll() {
    const data = { version: 1, contents: await wsGetAllContent(), stickers: await wsGetAllStickers(), presets: wsGetPresets(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.parent.document.createElement('a');
    a.href = url; a.download = `workshop_backup_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
}

async function wsImportAll(jsonStr) {
    try {
        const data = JSON.parse(jsonStr);
        let count = { character: 0, room: 0, world: 0, sticker: 0 };
        if (data.contents) {
            for (const type of ['character', 'room', 'world']) {
                if (data.contents[type]) { for (const item of data.contents[type]) { await wsAddContent(type, item); count[type]++; } }
            }
        }
        if (data.type && WS_TYPES.includes(data.type) && data.type !== 'sticker') { await wsAddContent(data.type, data); count[data.type]++; }
        if (Array.isArray(data) && data.length > 0 && data[0].type) {
            for (const item of data) {
                if (item.type === 'sticker') { await wsSaveSticker(item); count.sticker++; }
                else if (WS_TYPES.includes(item.type)) { await wsAddContent(item.type, item); count[item.type]++; }
            }
        }
        if (data.stickers) { for (const s of data.stickers) { await wsSaveSticker(s); count.sticker++; } }
        if (data.presets) { for (const p of data.presets) wsUpsertPreset(p); }
        return count;
    } catch (e) { console.error('[创意工坊] 导入失败:', e); return null; }
}

// ============ 云端API函数 ============

// 浏览云端内容列表（带内存缓存，60秒内切Tab不重复请求）
async function wsCloudList(type, page, sort) {
    page = page || 1; sort = sort || 'newest';
    var cacheKey = wsCloudCacheKey(type, page, sort);
    var cached = wsCloudCacheGet(cacheKey);
    if (cached) return cached;
    var result = await wsApiFetch('/api/content/list?type=' + type + '&page=' + page + '&sort=' + sort + '&pageSize=20');
    wsCloudCacheSet(cacheKey, result);
    return result;
}

// 搜索云端内容
async function wsCloudSearch(query, type) {
    var path = '/api/content/search?q=' + encodeURIComponent(query);
    if (type) path += '&type=' + type;
    return wsApiFetch(path);
}

// 下载云端内容详情并保存到本地
async function wsCloudDownload(type, id) {
    var result = await wsApiFetch('/api/content/get/' + type + '/' + id);
    if (!result || !result.content) throw new Error('内容不存在');
    var content = result.content;
    await wsAddContent(type, {
        id: content.id, type: type, name: content.name,
        data: content.data, author: content.author,
        cloudId: content.id, createdAt: content.createdAt
    });
    return content;
}

// 上传本地内容到云端
async function wsCloudUpload(type, item) {
    wsCloudCacheClear(); // 上传后清空缓存
    return wsApiFetch('/api/content/create', {
        method: 'POST',
        body: JSON.stringify({
            type: type, name: wsGetItemName(item),
            data: item.data || item,
            tags: item.tags || []
        })
    });
}

// 获取云端统计
async function wsCloudStats() { return wsApiFetch('/api/stats'); }

// ============ Phase 3: 表情包云端函数 ============

// 表情包专用列表（带内存缓存）
async function wsCloudStickerList(page, sort) {
    page = page || 1; sort = sort || 'newest';
    var cacheKey = wsCloudCacheKey('sticker', page, sort);
    var cached = wsCloudCacheGet(cacheKey);
    if (cached) return cached;
    var result = await wsApiFetch('/api/sticker/list?page=' + page + '&sort=' + sort + '&pageSize=20');
    wsCloudCacheSet(cacheKey, result);
    return result;
}

// 上传表情包到云端（base64图片 → R2）
async function wsCloudUploadSticker(sticker) {
    wsCloudCacheClear(); // 上传后清空缓存
    return wsApiFetch('/api/sticker/upload', {
        method: 'POST',
        body: JSON.stringify({
            name: sticker.name || 'sticker',
            imageData: sticker.imageData,
            tags: sticker.tags || [],
            description: sticker.description || ''
        })
    });
}

// 下载云端表情包到本地（从R2获取图片 → IndexedDB）
async function wsCloudDownloadSticker(item) {
    // item包含 imageUrl 和元数据
    var imageUrl = WS_API_BASE + (item.imageUrl || '/api/sticker/image/' + (item.r2Key || item.id));
    var res = await fetch(imageUrl);
    if (!res.ok) throw new Error('Failed to fetch sticker image');
    var blob = await res.blob();
    // 转为DataURL存入IndexedDB
    var imageData = await new Promise(function(resolve) {
        var reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.readAsDataURL(blob);
    });
    var localSticker = {
        id: 'cloud_' + item.id,
        name: item.name || 'sticker',
        description: item.description || '',
        imageData: imageData,
        author: item.author,
        cloudId: item.id,
        downloadedAt: new Date().toISOString()
    };
    await wsSaveSticker(localSticker);
    return localSticker;
}

// ============ Phase 4: 管理员API函数 ============

function wsIsAdmin() {
    var user = wsGetAuthUser();
    return user && user.isAdmin === true;
}

async function wsAdminGetPending() {
    return wsApiFetch('/api/admin/pending');
}

async function wsAdminReview(type, id, action) {
    return wsApiFetch('/api/admin/review/' + type + '/' + id, {
        method: 'POST',
        body: JSON.stringify({ action: action })
    });
}

async function wsAdminBan(discordId) {
    return wsApiFetch('/api/admin/ban/' + discordId, { method: 'POST' });
}

async function wsAdminUnban(discordId) {
    return wsApiFetch('/api/admin/unban/' + discordId, { method: 'POST' });
}

async function wsAdminStats() {
    return wsApiFetch('/api/admin/stats');
}

async function wsAdminListAll(params) {
    var qs = '?page=' + (params.page || 1);
    if (params.type) qs += '&type=' + params.type;
    if (params.status) qs += '&status=' + params.status;
    if (params.pageSize) qs += '&pageSize=' + params.pageSize;
    return wsApiFetch('/api/admin/list-all' + qs);
}

async function wsAdminGetDetail(type, id) {
    return wsApiFetch('/api/admin/detail/' + type + '/' + id);
}

async function wsAdminEdit(type, id, data) {
    return wsApiFetch('/api/admin/edit/' + type + '/' + id, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
}

async function wsAdminDelete(type, id) {
    return wsApiFetch('/api/admin/delete/' + type + '/' + id, { method: 'DELETE' });
}

// ============ 管理面板状态 ============
var wsAdminTab = 'pending'; // 'pending' | 'all' | 'users'
var wsAdminAllPage = 1;
var wsAdminAllType = '';
var wsAdminAllStatus = '';

// 渲染单个管理内容卡片
function wsAdminCardHtml(item, showReview) {
    var statusBadge = '';
    var st = item.status || 'unknown';
    if (st === 'approved') statusBadge = '<span style="background:#D1FAE5;color:#065F46;padding:1px 6px;border-radius:8px;font-size:10px;">已通过</span>';
    else if (st === 'pending') statusBadge = '<span style="background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:8px;font-size:10px;">待审核</span>';
    else if (st === 'rejected') statusBadge = '<span style="background:#FEE2E2;color:#991B1B;padding:1px 6px;border-radius:8px;font-size:10px;">已拒绝</span>';

    var html = '<div class="ws-card" style="margin-bottom:8px;">'
        + '<div class="ws-card-header"><span class="ws-card-name">' + wsTypeIcon(item.type) + ' ' + wsEscapeHtml(item.name || item.id) + '</span>'
        + '<span class="ws-card-type">' + statusBadge + ' ' + (item.type || '') + ' · by ' + wsEscapeHtml(item.author || '匿名') + '</span></div>'
        + '<div class="ws-card-body" style="font-size:11px;color:#6B7280;">'
        + 'ID: ' + wsEscapeHtml(item.authorId || '') + ' · ' + (item.createdAt || '').substring(0, 10)
        + ' · ' + wsIcon('download', 10) + ' ' + (item.downloads || 0)
        + (item.tags && item.tags.length ? ' · ' + item.tags.map(function(t) { return '<span style="background:#FFF1F2;color:#E68A96;padding:1px 6px;border-radius:8px;font-size:10px;">' + wsEscapeHtml(t) + '</span>'; }).join(' ') : '')
        + '</div>'
        + '<div class="ws-card-actions" style="flex-wrap:wrap;gap:4px;">';
    // 预览详情
    html += '<button class="ws-btn ws-btn-blue" data-action="admin-detail" data-id="' + item.id + '" data-type="' + item.type + '" style="padding:3px 8px;font-size:11px;">' + wsIcon('eye', 11) + ' 详情</button>';
    // 审核按钮（仅pending时显示）
    if (showReview || st === 'pending') {
        html += '<button class="ws-btn ws-btn-green" data-action="admin-approve" data-id="' + item.id + '" data-type="' + item.type + '" style="padding:3px 8px;font-size:11px;">' + wsIcon('check', 11) + ' 通过</button>';
        html += '<button class="ws-btn ws-btn-red" data-action="admin-reject" data-id="' + item.id + '" data-type="' + item.type + '" style="padding:3px 8px;font-size:11px;">' + wsIcon('x', 11) + ' 拒绝</button>';
    }
    // 编辑 & 删除（始终显示）
    html += '<button class="ws-btn ws-btn-pink" data-action="admin-edit" data-id="' + item.id + '" data-type="' + item.type + '" style="padding:3px 8px;font-size:11px;">' + wsIcon('edit', 11) + ' 编辑</button>';
    html += '<button class="ws-btn ws-btn-red" data-action="admin-delete" data-id="' + item.id + '" data-type="' + item.type + '" style="padding:3px 8px;font-size:11px;">' + wsIcon('trash', 11) + ' 删除</button>';
    // 封禁作者
    html += '<button class="ws-btn ws-btn-gray" data-action="admin-ban" data-uid="' + (item.authorId || '') + '" style="padding:3px 8px;font-size:11px;">' + wsIcon('ban', 11) + ' 封禁</button>';
    html += '</div></div>';
    return html;
}

// 渲染管理员面板内容
async function wsRenderAdminPanel(panel) {
    // 基础框架：标题 + Tab栏 + 内容区
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<span style="font-size:16px;font-weight:bold;display:flex;align-items:center;gap:6px;">' + wsIcon('shield', 18) + ' 管理员面板</span>'
        + '<button class="ws-btn ws-btn-gray" data-action="close-admin" style="padding:4px 10px;">' + wsIcon('x', 14) + ' 关闭</button></div>'
        + '<div id="ws-admin-stats" style="margin-bottom:12px;"></div>'
        + '<div id="ws-admin-tabs" style="display:flex;gap:6px;margin-bottom:12px;">'
        + '<button class="ws-btn ' + (wsAdminTab === 'pending' ? 'ws-btn-pink' : 'ws-btn-gray') + '" data-action="admin-tab" data-tab="pending" style="padding:5px 12px;font-size:12px;">' + wsIcon('clipboard', 12) + ' 待审核</button>'
        + '<button class="ws-btn ' + (wsAdminTab === 'all' ? 'ws-btn-pink' : 'ws-btn-gray') + '" data-action="admin-tab" data-tab="all" style="padding:5px 12px;font-size:12px;">' + wsIcon('layers', 12) + ' 全部内容</button>'
        + '<button class="ws-btn ' + (wsAdminTab === 'users' ? 'ws-btn-pink' : 'ws-btn-gray') + '" data-action="admin-tab" data-tab="users" style="padding:5px 12px;font-size:12px;">' + wsIcon('user', 12) + ' 用户管理</button>'
        + '</div>'
        + '<div id="ws-admin-content"><div class="ws-empty"><div style="margin-bottom:12px;">' + wsIcon('loader', 32) + '</div><div style="font-size:14px;">加载中...</div></div></div>';
    panel.classList.add('active');
    panel.style.display = 'flex';

    // 加载统计
    try {
        var statsResult = await wsAdminStats();
        var stats = statsResult.stats || statsResult || {};
        panel.querySelector('#ws-admin-stats').innerHTML = '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
            + '<div style="background:#FFF1F2;padding:6px 12px;border-radius:8px;font-size:11px;display:flex;align-items:center;gap:3px;">' + wsIcon('user', 11) + ' <b>角色</b> ' + (stats.character || 0) + '</div>'
            + '<div style="background:#FFF1F2;padding:6px 12px;border-radius:8px;font-size:11px;display:flex;align-items:center;gap:3px;">' + wsIcon('home', 11) + ' <b>房间</b> ' + (stats.room || 0) + '</div>'
            + '<div style="background:#FFF1F2;padding:6px 12px;border-radius:8px;font-size:11px;display:flex;align-items:center;gap:3px;">' + wsIcon('globe', 11) + ' <b>世界</b> ' + (stats.world || 0) + '</div>'
            + '<div style="background:#FFF1F2;padding:6px 12px;border-radius:8px;font-size:11px;display:flex;align-items:center;gap:3px;">' + wsIcon('smile', 11) + ' <b>表情包</b> ' + (stats.sticker || 0) + '</div>'
            + '</div>';
    } catch (e) {}

    // 渲染当前Tab
    await wsRenderAdminTabContent(panel);
}

// 渲染管理面板Tab内容
async function wsRenderAdminTabContent(panel) {
    var contentArea = panel.querySelector('#ws-admin-content');
    if (!contentArea) return;
    contentArea.innerHTML = '<div class="ws-empty"><div style="margin-bottom:12px;">' + wsIcon('loader', 32) + '</div><div style="font-size:14px;">加载中...</div></div>';

    try {
        if (wsAdminTab === 'pending') {
            var result = await wsAdminGetPending();
            var pending = result.pending || [];
            var html = '<div style="font-size:13px;font-weight:bold;margin-bottom:8px;">' + wsIcon('clipboard', 13) + ' 待审核 (' + pending.length + ')</div>';
            if (pending.length === 0) {
                html += '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px;">暂无待审核内容 ✨</div>';
            } else {
                for (var i = 0; i < pending.length; i++) {
                    html += wsAdminCardHtml(pending[i], true);
                }
            }
            contentArea.innerHTML = html;

        } else if (wsAdminTab === 'all') {
            // 过滤器
            var filterHtml = '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center;">'
                + '<select id="ws-admin-filter-type" class="ws-input" style="padding:4px 8px;font-size:11px;width:auto;">'
                + '<option value=""' + (!wsAdminAllType ? ' selected' : '') + '>全部类型</option>'
                + '<option value="character"' + (wsAdminAllType === 'character' ? ' selected' : '') + '>角色</option>'
                + '<option value="room"' + (wsAdminAllType === 'room' ? ' selected' : '') + '>房间</option>'
                + '<option value="world"' + (wsAdminAllType === 'world' ? ' selected' : '') + '>世界观</option>'
                + '<option value="sticker"' + (wsAdminAllType === 'sticker' ? ' selected' : '') + '>表情包</option>'
                + '</select>'
                + '<select id="ws-admin-filter-status" class="ws-input" style="padding:4px 8px;font-size:11px;width:auto;">'
                + '<option value=""' + (!wsAdminAllStatus ? ' selected' : '') + '>全部状态</option>'
                + '<option value="approved"' + (wsAdminAllStatus === 'approved' ? ' selected' : '') + '>已通过</option>'
                + '<option value="pending"' + (wsAdminAllStatus === 'pending' ? ' selected' : '') + '>待审核</option>'
                + '<option value="rejected"' + (wsAdminAllStatus === 'rejected' ? ' selected' : '') + '>已拒绝</option>'
                + '</select>'
                + '<button class="ws-btn ws-btn-blue" data-action="admin-filter" style="padding:4px 10px;font-size:11px;">' + wsIcon('search', 11) + ' 筛选</button>'
                + '</div>';

            var result = await wsAdminListAll({ page: wsAdminAllPage, type: wsAdminAllType, status: wsAdminAllStatus, pageSize: 15 });
            var items = result.items || [];
            var pag = result.pagination || {};

            var html = filterHtml;
            html += '<div style="font-size:12px;color:#6B7280;margin-bottom:8px;">共 ' + (pag.total || 0) + ' 条 · 第 ' + (pag.page || 1) + '/' + (pag.totalPages || 1) + ' 页</div>';

            if (items.length === 0) {
                html += '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px;">暂无内容</div>';
            } else {
                for (var i = 0; i < items.length; i++) {
                    html += wsAdminCardHtml(items[i], false);
                }
            }

            // 分页按钮
            if (pag.totalPages > 1) {
                html += '<div style="display:flex;justify-content:center;gap:8px;margin-top:10px;">';
                if (pag.page > 1) html += '<button class="ws-btn ws-btn-gray" data-action="admin-page" data-page="' + (pag.page - 1) + '" style="padding:4px 12px;font-size:11px;">' + wsIcon('arrowLeft', 11) + ' 上一页</button>';
                if (pag.page < pag.totalPages) html += '<button class="ws-btn ws-btn-gray" data-action="admin-page" data-page="' + (pag.page + 1) + '" style="padding:4px 12px;font-size:11px;">下一页 ' + wsIcon('arrowRight', 11) + '</button>';
                html += '</div>';
            }
            contentArea.innerHTML = html;

        } else if (wsAdminTab === 'users') {
            contentArea.innerHTML = '<div style="padding:12px;background:#F9FAFB;border-radius:10px;">'
                + '<div style="font-size:13px;font-weight:bold;margin-bottom:8px;display:flex;align-items:center;gap:4px;">' + wsIcon('user', 13) + ' 用户管理</div>'
                + '<div style="display:flex;gap:8px;">'
                + '<input class="ws-input" id="ws-admin-uid" placeholder="输入Discord用户ID" style="flex:1;padding:6px 10px;">'
                + '<button class="ws-btn ws-btn-red" data-action="admin-ban" style="padding:6px 12px;">' + wsIcon('ban', 12) + ' 封禁</button>'
                + '<button class="ws-btn ws-btn-green" data-action="admin-unban" style="padding:6px 12px;">' + wsIcon('check', 12) + ' 解封</button>'
                + '</div>'
                + '<div style="margin-top:8px;font-size:11px;color:#9CA3AF;">输入用户的Discord ID（数字），然后点击封禁或解封。被封禁的用户将无法上传内容。</div>'
                + '</div>';
        }
    } catch (err) {
        contentArea.innerHTML = '<div class="ws-empty"><div style="margin-bottom:12px;">' + wsIcon('xCircle', 48) + '</div><div style="font-size:14px;color:#EF4444;">' + wsEscapeHtml(err.message) + '</div></div>';
    }
}

// 显示管理员详情弹窗（在admin面板内）
async function wsShowAdminDetail(panel, type, id) {
    try {
        var result = await wsAdminGetDetail(type, id);
        var c = result.content || {};
        var dataStr = '';
        try { dataStr = JSON.stringify(c.data || c, null, 2); } catch (e) { dataStr = String(c.data || ''); }
        if (dataStr.length > 3000) dataStr = dataStr.substring(0, 3000) + '\n... (truncated)';

        var html = '<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.95);z-index:10;padding:16px;overflow-y:auto;display:flex;flex-direction:column;" id="ws-admin-detail-overlay">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
            + '<span style="font-size:14px;font-weight:bold;">' + wsTypeIcon(type) + ' ' + wsEscapeHtml(c.name || id) + '</span>'
            + '<button class="ws-btn ws-btn-gray" data-action="admin-detail-close" style="padding:3px 8px;">' + wsIcon('x', 12) + '</button></div>'
            + '<div style="font-size:11px;color:#6B7280;margin-bottom:8px;">'
            + '类型: ' + (type || '') + ' · 状态: ' + (c.status || '') + ' · 作者: ' + wsEscapeHtml(c.author || '') + ' (' + wsEscapeHtml(c.authorId || '') + ')<br>'
            + '创建: ' + (c.createdAt || '') + ' · 下载: ' + (c.downloads || 0)
            + (c.tags && c.tags.length ? '<br>标签: ' + c.tags.join(', ') : '')
            + '</div>'
            + '<pre style="flex:1;background:#F3F4F6;border-radius:8px;padding:10px;font-size:11px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0;">' + wsEscapeHtml(dataStr) + '</pre>'
            + '</div>';
        // 追加到panel而不替换
        panel.insertAdjacentHTML('beforeend', html);
    } catch (err) {
        wsToastErr('加载详情失败: ' + err.message);
    }
}

// 显示管理员编辑表单
async function wsShowAdminEditForm(panel, type, id) {
    try {
        var result = await wsAdminGetDetail(type, id);
        var c = result.content || {};
        var dataStr = '';
        try { dataStr = JSON.stringify(c.data || {}, null, 2); } catch (e) { dataStr = ''; }

        var html = '<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.95);z-index:10;padding:16px;overflow-y:auto;display:flex;flex-direction:column;" id="ws-admin-edit-overlay">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
            + '<span style="font-size:14px;font-weight:bold;">' + wsIcon('edit', 14) + ' 编辑内容</span>'
            + '<button class="ws-btn ws-btn-gray" data-action="admin-edit-close" style="padding:3px 8px;">' + wsIcon('x', 12) + '</button></div>'
            + '<div style="display:flex;flex-direction:column;gap:8px;flex:1;">'
            + '<label style="font-size:11px;font-weight:bold;">名称</label>'
            + '<input class="ws-input" id="ws-admin-edit-name" value="' + wsEscapeHtml(c.name || '') + '" style="padding:6px 10px;">'
            + (type === 'sticker' ? '<label style="font-size:11px;font-weight:bold;">描述</label>'
                + '<input class="ws-input" id="ws-admin-edit-desc" value="' + wsEscapeHtml(c.description || '') + '" style="padding:6px 10px;">' : '')
            + '<label style="font-size:11px;font-weight:bold;">标签（逗号分隔）</label>'
            + '<input class="ws-input" id="ws-admin-edit-tags" value="' + wsEscapeHtml((c.tags || []).join(', ')) + '" style="padding:6px 10px;">'
            + '<label style="font-size:11px;font-weight:bold;">状态</label>'
            + '<select class="ws-input" id="ws-admin-edit-status" style="padding:6px 10px;">'
            + '<option value="approved"' + (c.status === 'approved' ? ' selected' : '') + '>已通过</option>'
            + '<option value="pending"' + (c.status === 'pending' ? ' selected' : '') + '>待审核</option>'
            + '<option value="rejected"' + (c.status === 'rejected' ? ' selected' : '') + '>已拒绝</option>'
            + '</select>'
            + (type !== 'sticker' ? '<label style="font-size:11px;font-weight:bold;">数据 (JSON)</label>'
                + '<textarea class="ws-input" id="ws-admin-edit-data" style="flex:1;min-height:150px;padding:8px;font-size:11px;font-family:monospace;resize:vertical;">' + wsEscapeHtml(dataStr) + '</textarea>' : '')
            + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">'
            + '<button class="ws-btn ws-btn-gray" data-action="admin-edit-close" style="padding:6px 14px;">' + wsIcon('x', 12) + ' 取消</button>'
            + '<button class="ws-btn ws-btn-green" data-action="admin-edit-save" data-id="' + id + '" data-type="' + type + '" style="padding:6px 14px;">' + wsIcon('check', 12) + ' 保存</button>'
            + '</div></div></div>';
        panel.insertAdjacentHTML('beforeend', html);
    } catch (err) {
        wsToastErr('加载编辑数据失败: ' + err.message);
    }
}

// ============ 上传到云端面板 ============

function wsShowUploadPanel(uploadPanel) {
    var type = wsCurrentTab;
    if (type === 'sticker') {
        if (!wsIsLoggedIn()) { wsToastWarn('请先登录Discord'); return; }
        var user = wsGetAuthUser();
        if (user && !user.inGuild) { wsToastWarn('请先加入Discord服务器'); return; }
        wsShowStickerUploadForm(uploadPanel);
        return;
    }

    var title = { character: '新建角色', room: '新建房间', world: '新建世界观' }[type] || '新建内容';
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
        + '<span style="font-size:15px;font-weight:bold;">' + wsIcon('plus', 16) + ' ' + title + '</span>'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel" style="padding:4px 10px;">' + wsIcon('x', 14) + '</button></div>';

    // 模式切换：表单 / JSON粘贴
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;">'
        + '<button class="ws-btn ws-btn-pink" data-action="upload-mode" data-mode="form" id="ws-upload-mode-form" style="padding:4px 12px;font-size:11px;">' + wsIcon('edit', 11) + ' 表单填写</button>'
        + '<button class="ws-btn ws-btn-gray" data-action="upload-mode" data-mode="json" id="ws-upload-mode-json" style="padding:4px 12px;font-size:11px;">' + wsIcon('code', 11) + ' JSON粘贴</button>'
        + '</div>';

    // JSON粘贴模式（默认隐藏）
    html += '<div id="ws-upload-json-area" style="display:none;flex-direction:column;gap:8px;overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch;">';
    html += '<label style="font-size:11px;font-weight:bold;">名称 <span style="color:#EF4444">*</span></label>';
    html += '<input class="ws-input" id="ws-upload-json-name" placeholder="内容名称" style="padding:6px 10px;">';
    html += '<label style="font-size:11px;font-weight:bold;">标签（逗号分隔，可选）</label>';
    html += '<input class="ws-input" id="ws-upload-json-tags" placeholder="如: 原创, 现代" style="padding:6px 10px;">';
    html += '<label style="font-size:11px;font-weight:bold;">JSON数据 <span style="color:#EF4444">*</span></label>';
    html += '<textarea class="ws-input" id="ws-upload-json-data" placeholder="粘贴完整的JSON数据对象" rows="12" style="padding:8px;font-size:11px;font-family:monospace;resize:vertical;flex:1;"></textarea>';
    html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">';
    html += '<button class="ws-btn ws-btn-gray" data-action="cancel" style="padding:6px 14px;">' + wsIcon('x', 12) + ' 取消</button>';
    html += '<button class="ws-btn ws-btn-green" data-action="upload-json-submit" style="padding:6px 14px;">' + wsIcon('save', 12) + ' 保存</button>';
    html += '</div></div>';

    // 表单模式
    html += '<div id="ws-upload-form-area" style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch;">';
    html += '<label style="font-size:11px;font-weight:bold;">名称 <span style="color:#EF4444">*</span></label>';
    html += '<input class="ws-input" id="ws-upload-name" placeholder="给你的' + ({character:'角色',room:'房间',world:'世界观'}[type]) + '起个名字" style="padding:6px 10px;">';
    html += '<label style="font-size:11px;font-weight:bold;">标签（逗号分隔，可选）</label>';
    html += '<input class="ws-input" id="ws-upload-tags" placeholder="如: 原创, 现代, 奇幻" style="padding:6px 10px;">';

    if (type === 'character') {
        html += '<label style="font-size:11px;font-weight:bold;">角色显示名</label>';
        html += '<input class="ws-input" id="ws-upload-displayName" placeholder="角色在游戏中的显示名" style="padding:6px 10px;">';
        html += '<label style="font-size:11px;font-weight:bold;">性别</label>';
        html += '<input class="ws-input" id="ws-upload-gender" placeholder="如: 女" style="padding:6px 10px;">';
        html += '<label style="font-size:11px;font-weight:bold;">年龄</label>';
        html += '<input class="ws-input" id="ws-upload-age" placeholder="如: 18" style="padding:6px 10px;">';
        html += '<label style="font-size:11px;font-weight:bold;">职业</label>';
        html += '<input class="ws-input" id="ws-upload-profession" placeholder="如: 学生" style="padding:6px 10px;">';
        html += '<label style="font-size:11px;font-weight:bold;">性格</label>';
        html += '<textarea class="ws-input" id="ws-upload-personality" placeholder="角色性格描述" rows="3" style="padding:6px 10px;resize:vertical;min-height:55px;"></textarea>';
        html += '<label style="font-size:11px;font-weight:bold;">外貌</label>';
        html += '<textarea class="ws-input" id="ws-upload-appearance" placeholder="角色外貌描述" rows="3" style="padding:6px 10px;resize:vertical;min-height:55px;"></textarea>';
        html += '<label style="font-size:11px;font-weight:bold;">背景故事</label>';
        html += '<textarea class="ws-input" id="ws-upload-backstory" placeholder="角色背景故事" rows="4" style="padding:6px 10px;resize:vertical;min-height:70px;"></textarea>';
        html += '<label style="font-size:11px;font-weight:bold;">爱好与习惯</label>';
        html += '<textarea class="ws-input" id="ws-upload-quirks" placeholder="如: 喜欢甜食、有洁癖、喜欢猫" rows="2" style="padding:6px 10px;resize:vertical;min-height:45px;"></textarea>';
        html += '<label style="font-size:11px;font-weight:bold;">说话风格</label>';
        html += '<textarea class="ws-input" id="ws-upload-dialogueStyle" placeholder="如: 温柔有礼、毒舌、元气满满" rows="2" style="padding:6px 10px;resize:vertical;min-height:45px;"></textarea>';
    } else if (type === 'room') {
        html += '<label style="font-size:11px;font-weight:bold;">房间类型</label>';
        html += '<select class="ws-input" id="ws-upload-roomType" style="padding:6px 10px;">'
            + '<option value="卧室">卧室</option>'
            + '<option value="功能性房间">功能性房间</option></select>';
        html += '<label style="font-size:11px;font-weight:bold;">房间描述</label>';
        html += '<textarea class="ws-input" id="ws-upload-roomDesc" placeholder="描述房间的特色和氛围" rows="4" style="padding:6px 10px;resize:vertical;min-height:80px;"></textarea>';
    } else if (type === 'world') {
        html += '<label style="font-size:11px;font-weight:bold;">世界观设定文本 <span style="color:#EF4444">*</span></label>';
        html += '<textarea class="ws-input" id="ws-upload-worldLore" placeholder="世界观文本（XML格式的World_Profile或纯文本描述）" rows="8" style="padding:8px 10px;resize:vertical;font-family:monospace;font-size:11px;min-height:120px;"></textarea>';
        html += '<label style="font-size:11px;font-weight:bold;">注入位置 / 排序</label>';
        html += '<div style="display:flex;gap:6px;margin-bottom:4px;">';
        html += '<select class="ws-input" id="ws-upload-worldPos" style="padding:8px 10px;font-size:12px;flex:2;" onchange="var dw=document.getElementById(\'ws-upload-depth-wrap\');if(dw)dw.style.display=this.value===\'at_depth\'?\'flex\':\'none\';">'
            + '<option value="at_depth">深度插入 (D)</option>'
            + '<option value="before_character_definition" selected>角色定义之前</option>'
            + '<option value="after_character_definition">角色定义之后</option>'
            + '<option value="before_example_messages">示例消息之前</option>'
            + '<option value="after_example_messages">示例消息之后</option>'
            + '<option value="before_author_note">作者注释之前</option>'
            + '<option value="after_author_note">作者注释之后</option>'
            + '</select>';
        html += '<input class="ws-input" id="ws-upload-worldOrder" placeholder="排序(默认60)" type="number" style="padding:8px 10px;font-size:12px;flex:1;"></div>';
        html += '<div id="ws-upload-depth-wrap" style="display:none;gap:6px;margin-bottom:4px;">';
        html += '<input class="ws-input" id="ws-upload-worldDepth" placeholder="深度(默认4)" type="number" style="padding:8px 10px;font-size:12px;flex:1;">';
        html += '<select class="ws-input" id="ws-upload-worldRole" style="padding:8px 10px;font-size:12px;flex:1;"><option value="system">system</option><option value="assistant">assistant</option><option value="user">user</option></select>';
        html += '</div>';
        html += '<label style="font-size:11px;font-weight:bold;">开场白文本（可选，不填则只注入世界观）</label>';
        html += '<textarea class="ws-input" id="ws-upload-greeting" placeholder="开场白故事文本（不含变量更新部分）" rows="6" style="padding:8px 10px;resize:vertical;min-height:90px;"></textarea>';

        // UpdateVariable 可视化构建器（仅世界时间）
        html += '<div style="border:1px solid #E5E7EB;border-radius:10px;padding:10px;margin-top:4px;">';
        html += '<div style="font-size:12px;font-weight:bold;margin-bottom:8px;display:flex;align-items:center;gap:4px;">' + wsIcon('layers', 13) + ' 变量初始化设置（自动生成 UpdateVariable）</div>';

        // 世界时间
        html += '<div style="font-size:11px;font-weight:bold;color:#6B7280;margin-bottom:4px;">世界时间</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px;">';
        html += '<div><label style="font-size:10px;color:#9CA3AF;">年份</label><input class="ws-input" id="ws-uv-year" placeholder="2025年" style="padding:4px 8px;font-size:11px;"></div>';
        html += '<div><label style="font-size:10px;color:#9CA3AF;">日期</label><input class="ws-input" id="ws-uv-date" placeholder="10月21日" style="padding:4px 8px;font-size:11px;"></div>';
        html += '<div><label style="font-size:10px;color:#9CA3AF;">星期</label><select class="ws-input" id="ws-uv-weekday" style="padding:4px 8px;font-size:11px;">'
            + '<option value="">不设置</option><option>星期一</option><option>星期二</option><option>星期三</option><option>星期四</option><option>星期五</option><option>星期六</option><option>星期日</option></select></div>';
        html += '<div><label style="font-size:10px;color:#9CA3AF;">时间</label><input class="ws-input" id="ws-uv-time" placeholder="14:30" style="padding:4px 8px;font-size:11px;"></div>';
        html += '</div>';

        html += '</div>'; // end UpdateVariable builder
    }

    // 提交按钮（表单模式）
    html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">';
    html += '<button class="ws-btn ws-btn-gray" data-action="cancel" style="padding:6px 14px;">' + wsIcon('x', 12) + ' 取消</button>';
    html += '<button class="ws-btn ws-btn-green" data-action="upload-submit" style="padding:6px 14px;">' + wsIcon('save', 12) + ' 保存</button>';
    html += '</div></div>'; // close #ws-upload-form-area

    uploadPanel.innerHTML = html;
    uploadPanel.classList.add('active');
    wsForceInputStyles(uploadPanel);
}

// 强制设置输入框样式（使用JS直接设置inline style，不受CSS覆盖影响）
function wsForceInputStyles(container) {
    var isDark = document.body.classList.contains('ws-dark') || window.parent.document.body.classList.contains('ws-dark');
    var inputs = container.querySelectorAll('.ws-input');
    for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        if (isDark) {
            el.style.setProperty('background', '#1a1826', 'important');
            el.style.setProperty('color', '#e0def4', 'important');
            el.style.setProperty('border-color', '#44415a', 'important');
        } else {
            el.style.setProperty('background', '#FFFFFF', 'important');
            el.style.setProperty('color', '#1F2937', 'important');
            el.style.setProperty('border-color', '#D1D5DB', 'important');
        }
    }
}

// 表情包上传表单
function wsShowStickerUploadForm(uploadPanel) {
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<span style="font-size:15px;font-weight:bold;">' + wsIcon('cloudUp', 16) + ' 上传表情包</span>'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel" style="padding:4px 10px;">' + wsIcon('x', 14) + '</button></div>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;">';
    html += '<label style="font-size:11px;font-weight:bold;">名称 <span style="color:#EF4444">*</span></label>';
    html += '<input class="ws-input" id="ws-upload-sticker-name" placeholder="表情包名称" style="padding:6px 10px;">';
    html += '<label style="font-size:11px;font-weight:bold;">描述（用于AI识别，可选）</label>';
    html += '<input class="ws-input" id="ws-upload-sticker-desc" placeholder="描述这个表情包表达的情感" style="padding:6px 10px;">';
    html += '<label style="font-size:11px;font-weight:bold;">标签（逗号分隔，可选）</label>';
    html += '<input class="ws-input" id="ws-upload-sticker-tags" placeholder="如: 开心, 搞笑" style="padding:6px 10px;">';
    html += '<label style="font-size:11px;font-weight:bold;">选择图片 <span style="color:#EF4444">*</span></label>';
    html += '<div id="ws-upload-sticker-preview" style="width:100px;height:100px;border:2px dashed #D1D5DB;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;color:#9CA3AF;">' + wsIcon('image', 24) + '</div>';
    html += '<input type="file" id="ws-upload-sticker-file" accept="image/*" style="display:none;">';
    html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">';
    html += '<button class="ws-btn ws-btn-gray" data-action="cancel" style="padding:6px 14px;">' + wsIcon('x', 12) + ' 取消</button>';
    html += '<button class="ws-btn ws-btn-green" data-action="upload-sticker-submit" style="padding:6px 14px;">' + wsIcon('cloudUp', 12) + ' 提交审核</button>';
    html += '</div></div>';
    uploadPanel.innerHTML = html;
    uploadPanel.classList.add('active');
    wsForceInputStyles(uploadPanel);

    // 图片选择事件
    var preview = uploadPanel.querySelector('#ws-upload-sticker-preview');
    var fileInput = uploadPanel.querySelector('#ws-upload-sticker-file');
    preview.addEventListener('click', function() { fileInput.click(); });
    fileInput.addEventListener('change', function() {
        var file = fileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            uploadPanel._pendingStickerData = e.target.result;
            preview.innerHTML = '<img src="' + e.target.result + '" style="max-width:96px;max-height:96px;border-radius:8px;">';
        };
        reader.readAsDataURL(file);
    });
}

// 添加动态房间行
var wsUvRoomCount = 0;
function wsAddUvRoomRow(container) {
    wsUvRoomCount++;
    var div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1fr 80px 60px 60px 20px;gap:4px;margin-bottom:4px;align-items:center;';
    div.className = 'ws-uv-room-row';
    div.innerHTML = '<input class="ws-input" placeholder="房间名" data-field="name" style="padding:3px 6px;font-size:10px;">'
        + '<select class="ws-input" data-field="type" style="padding:3px 4px;font-size:10px;"><option>卧室</option><option>功能性房间</option></select>'
        + '<input class="ws-input" placeholder="楼层" data-field="floor" style="padding:3px 6px;font-size:10px;">'
        + '<input class="ws-input" placeholder="位置" data-field="pos" style="padding:3px 6px;font-size:10px;">'
        + '<span style="cursor:pointer;color:#EF4444;font-size:14px;" data-action="uv-remove-row">×</span>';
    container.appendChild(div);
}

// 添加动态租客行
var wsUvTenantCount = 0;
function wsAddUvTenantRow(container) {
    wsUvTenantCount++;
    var div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:80px 50px 1fr 20px;gap:4px;margin-bottom:4px;align-items:center;';
    div.className = 'ws-uv-tenant-row';
    div.innerHTML = '<input class="ws-input" placeholder="姓名" data-field="name" style="padding:3px 6px;font-size:10px;">'
        + '<input class="ws-input" placeholder="年龄" data-field="age" type="number" style="padding:3px 6px;font-size:10px;">'
        + '<input class="ws-input" placeholder="职业" data-field="job" style="padding:3px 6px;font-size:10px;">'
        + '<span style="cursor:pointer;color:#EF4444;font-size:14px;" data-action="uv-remove-row">×</span>';
    container.appendChild(div);
}

// 从表单构建 UpdateVariable XML
function wsBuildUpdateVariable(uploadPanel) {
    var patches = [];

    // 世界时间
    var year = (uploadPanel.querySelector('#ws-uv-year') || {}).value;
    var date = (uploadPanel.querySelector('#ws-uv-date') || {}).value;
    var weekday = (uploadPanel.querySelector('#ws-uv-weekday') || {}).value;
    var time = (uploadPanel.querySelector('#ws-uv-time') || {}).value;
    if (year) patches.push('  {"op": "replace", "path": "/世界/年份", "value": "' + year + '"}');
    if (date) patches.push('  {"op": "replace", "path": "/世界/日期", "value": "' + date + '"}');
    if (weekday) patches.push('  {"op": "replace", "path": "/世界/星期", "value": "' + weekday + '"}');
    if (time) patches.push('  {"op": "replace", "path": "/世界/时间", "value": "' + time + '"}');

    // 房间
    var roomRows = uploadPanel.querySelectorAll('.ws-uv-room-row');
    roomRows.forEach(function(row) {
        var name = (row.querySelector('[data-field="name"]') || {}).value;
        var type = (row.querySelector('[data-field="type"]') || {}).value;
        var floor = (row.querySelector('[data-field="floor"]') || {}).value;
        var pos = (row.querySelector('[data-field="pos"]') || {}).value;
        if (name) {
            var roomObj = { '类型': type || '功能性房间', '名称': name, '楼层': floor || '一楼', '位置': pos || '1-1', '住户': '无', '描述': '暂无描述' };
            patches.push('  {"op": "add", "path": "/公寓/房间列表/' + name + '", "value": ' + JSON.stringify(roomObj) + '}');
        }
    });

    // 租客
    var tenantRows = uploadPanel.querySelectorAll('.ws-uv-tenant-row');
    tenantRows.forEach(function(row) {
        var name = (row.querySelector('[data-field="name"]') || {}).value;
        var age = (row.querySelector('[data-field="age"]') || {}).value;
        var job = (row.querySelector('[data-field="job"]') || {}).value;
        if (name) {
            var tenantObj = { '年龄': parseInt(age) || 20, '外貌': '待描述', '职业': job || '无', '性格': '待描述', '状态': '正常', '内心': '平静', '关系': {} };
            patches.push('  {"op": "add", "path": "/租客列表/' + name + '", "value": ' + JSON.stringify(tenantObj) + '}');
        }
    });

    // 资金
    var money = (uploadPanel.querySelector('#ws-uv-money') || {}).value;
    if (money) patches.push('  {"op": "replace", "path": "/用户/资金", "value": ' + parseInt(money) + '}');

    if (patches.length === 0) return '';

    return '\n\n<UpdateVariable>\n<Analysis>\n- Initialization: Setting initial state for this world view\n</Analysis>\n<JSONPatch>\n[\n' + patches.join(',\n') + '\n]\n</JSONPatch>\n</UpdateVariable>';
}

// 收集上传表单数据并提交
async function wsSubmitUpload(uploadPanel) {
    var type = wsCurrentTab;
    var name = (uploadPanel.querySelector('#ws-upload-name') || {}).value || '';
    var tagsStr = (uploadPanel.querySelector('#ws-upload-tags') || {}).value || '';
    var tags = tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean);

    if (!name.trim()) { wsToastWarn('请输入名称'); return; }

    var data = {};

    if (type === 'character') {
        data.displayName = (uploadPanel.querySelector('#ws-upload-displayName') || {}).value || name;
        data.gender = (uploadPanel.querySelector('#ws-upload-gender') || {}).value || '';
        data.age = (uploadPanel.querySelector('#ws-upload-age') || {}).value || '';
        data.profession = (uploadPanel.querySelector('#ws-upload-profession') || {}).value || '';
        data.personality = (uploadPanel.querySelector('#ws-upload-personality') || {}).value || '';
        data.appearance = (uploadPanel.querySelector('#ws-upload-appearance') || {}).value || '';
        data.backstory = (uploadPanel.querySelector('#ws-upload-backstory') || {}).value || '';
        data.quirks = (uploadPanel.querySelector('#ws-upload-quirks') || {}).value || '';
        data.dialogueStyle = (uploadPanel.querySelector('#ws-upload-dialogueStyle') || {}).value || '';
    } else if (type === 'room') {
        data.roomType = (uploadPanel.querySelector('#ws-upload-roomType') || {}).value || '功能性房间';
        data.description = (uploadPanel.querySelector('#ws-upload-roomDesc') || {}).value || '';
    } else if (type === 'world') {
        var worldLore = (uploadPanel.querySelector('#ws-upload-worldLore') || {}).value || '';
        var worldPos = (uploadPanel.querySelector('#ws-upload-worldPos') || {}).value || 'before_character_definition';
        var worldOrder = parseInt((uploadPanel.querySelector('#ws-upload-worldOrder') || {}).value) || 60;
        var greeting = (uploadPanel.querySelector('#ws-upload-greeting') || {}).value || '';

        if (!worldLore.trim()) { wsToastWarn('请输入世界观设定文本'); return; }

        data.worldLoreContent = worldLore;
        var loreConfig = { position: worldPos, order: worldOrder };
        if (worldPos === 'at_depth') {
            loreConfig.depth = parseInt((uploadPanel.querySelector('#ws-upload-worldDepth') || {}).value) || 4;
            loreConfig.role = (uploadPanel.querySelector('#ws-upload-worldRole') || {}).value || 'system';
        }
        data.worldLoreConfig = loreConfig;
        data.additionalLore = [];

        // 自动生成UpdateVariable（世界时间）并追加到开场白
        if (greeting.trim()) {
            var uvXml = wsBuildUpdateVariable(uploadPanel);
            data.greeting = greeting.trim() + uvXml;
        }
    }

    try {
        var result = await wsCloudUpload(type, { name: name.trim(), data: data, tags: tags });
        wsToastOk('已提交，等待管理员审核');
        uploadPanel.classList.remove('active');
    } catch (err) {
        wsToastErr('上传失败: ' + err.message);
    }
}

// 收集表单数据并保存到本地
async function wsSubmitUploadLocal(uploadPanel, targetDoc) {
    var type = wsCurrentTab;
    var name = (uploadPanel.querySelector('#ws-upload-name') || {}).value || '';
    var tagsStr = (uploadPanel.querySelector('#ws-upload-tags') || {}).value || '';
    var tags = tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean);

    if (!name.trim()) { wsToastWarn('请输入名称'); return; }

    var data = {};

    if (type === 'character') {
        data.displayName = (uploadPanel.querySelector('#ws-upload-displayName') || {}).value || name;
        data.gender = (uploadPanel.querySelector('#ws-upload-gender') || {}).value || '';
        data.age = (uploadPanel.querySelector('#ws-upload-age') || {}).value || '';
        data.profession = (uploadPanel.querySelector('#ws-upload-profession') || {}).value || '';
        data.personality = (uploadPanel.querySelector('#ws-upload-personality') || {}).value || '';
        data.appearance = (uploadPanel.querySelector('#ws-upload-appearance') || {}).value || '';
        data.backstory = (uploadPanel.querySelector('#ws-upload-backstory') || {}).value || '';
        data.quirks = (uploadPanel.querySelector('#ws-upload-quirks') || {}).value || '';
        data.dialogueStyle = (uploadPanel.querySelector('#ws-upload-dialogueStyle') || {}).value || '';
    } else if (type === 'room') {
        data.displayName = name;
        data.roomType = (uploadPanel.querySelector('#ws-upload-roomType') || {}).value || '功能性房间';
        data.description = (uploadPanel.querySelector('#ws-upload-roomDesc') || {}).value || '';
    } else if (type === 'world') {
        var worldLore = (uploadPanel.querySelector('#ws-upload-worldLore') || {}).value || '';
        var worldPos = (uploadPanel.querySelector('#ws-upload-worldPos') || {}).value || 'before_character_definition';
        var worldOrder = parseInt((uploadPanel.querySelector('#ws-upload-worldOrder') || {}).value) || 60;
        var greeting = (uploadPanel.querySelector('#ws-upload-greeting') || {}).value || '';

        if (!worldLore.trim()) { wsToastWarn('请输入世界观设定文本'); return; }

        data.worldLoreContent = worldLore;
        var loreConfig = { position: worldPos, order: worldOrder };
        if (worldPos === 'at_depth') {
            loreConfig.depth = parseInt((uploadPanel.querySelector('#ws-upload-worldDepth') || {}).value) || 4;
            loreConfig.role = (uploadPanel.querySelector('#ws-upload-worldRole') || {}).value || 'system';
        }
        data.worldLoreConfig = loreConfig;
        data.additionalLore = [];

        if (greeting.trim()) {
            var uvXml = wsBuildUpdateVariable(uploadPanel);
            data.greeting = greeting.trim() + uvXml;
        }
    }

    try {
        await wsAddContent(type, { type: type, name: name.trim(), data: data, tags: tags });
        wsToastOk('"' + name.trim() + '" 已保存到本地');
        uploadPanel.classList.remove('active');
        wsRenderTabContent(targetDoc);
    } catch (err) {
        wsToastErr('保存失败: ' + err.message);
    }
}

// ============ 辅助函数 ============

function wsGetItemName(item) { return item.name || item.data?.displayName || item.id; }

function wsEscapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wsGetItemSummary(type, item) {
    const d = item.data || item;
    switch (type) {
        case 'character': return [d.gender, d.age, d.profession, (d.personality||'').substring(0,20)].filter(Boolean).join(' · ') || '未填写详情';
        case 'room': return [d.roomType, (d.description||'').substring(0,30)].filter(Boolean).join(' · ') || '未填写详情';
        case 'world': return [d.era, (d.atmosphere||'').substring(0,20), d.buildingType].filter(Boolean).join(' · ') || '未填写详情';
        default: return '';
    }
}

function wsGetItemPreview(type, item) {
    var d = item.data || item;
    var rows = '';
    function row(label, val) { if (val) rows += '<div style="display:flex;gap:6px;margin-bottom:4px;"><span style="font-weight:600;color:#6B7280;min-width:60px;font-size:11px;">' + label + '</span><span style="font-size:11px;color:#374151;word-break:break-all;">' + wsEscapeHtml(val) + '</span></div>'; }
    function longRow(label, val) { if (val) rows += '<div style="margin-bottom:6px;"><div style="font-weight:600;color:#6B7280;font-size:11px;margin-bottom:2px;">' + label + '</div><div style="font-size:11px;color:#374151;white-space:pre-wrap;word-break:break-all;background:#F9FAFB;padding:6px 8px;border-radius:6px;max-height:300px;overflow-y:auto;">' + wsEscapeHtml(val) + '</div></div>'; }
    if (type === 'character') {
        row('显示名', d.displayName);
        row('性别', d.gender); row('年龄', d.age); row('职业', d.profession);
        longRow('性格', d.personality);
        longRow('外貌', d.appearance);
        longRow('背景', d.background || d.backstory);
        longRow('爱好习惯', d.quirks);
        longRow('说话风格', d.dialogueStyle);
    } else if (type === 'room') {
        row('房间名', d.displayName);
        row('类型', d.roomType);
        longRow('描述', d.description);
    } else if (type === 'world') {
        row('世界名', d.displayName || item.name);
        row('时代', d.era);
        row('氛围', d.atmosphere);
        row('建筑类型', d.buildingType);
        if (d.worldLoreConfig) row('注入位置', d.worldLoreConfig.position + ' (order:' + (d.worldLoreConfig.order||60) + ')');
        longRow('世界观文本', d.worldLoreContent || '');
        longRow('开场白', d.greeting || '');
    }
    if (item.tags && item.tags.length) {
        rows += '<div style="margin-top:4px;">' + item.tags.map(function(t) { return '<span style="background:#FFF1F2;color:#E68A96;padding:1px 6px;border-radius:8px;font-size:10px;margin-right:3px;">' + wsEscapeHtml(t) + '</span>'; }).join('') + '</div>';
    }
    return rows || '<span style="font-size:11px;color:#9CA3AF;">无详细信息</span>';
}

function wsToast(msg, duration) {
    duration = duration || 2000;
    const t = window.parent.document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1F2937;color:white;padding:10px 20px;border-radius:10px;font-size:13px;z-index:100001;box-shadow:0 4px 15px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px;';
    t.innerHTML = msg;
    window.parent.document.body.appendChild(t);
    setTimeout(function() { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(function() { t.remove(); }, 300); }, duration);
}
// Toast快捷方法
function wsToastOk(msg) { wsToast(wsIcon('checkCircle', 16) + ' ' + wsEscapeHtml(msg)); }
function wsToastErr(msg) { wsToast(wsIcon('xCircle', 16) + ' ' + wsEscapeHtml(msg)); }
function wsToastWarn(msg) { wsToast(wsIcon('alertTriangle', 16) + ' ' + wsEscapeHtml(msg)); }
function wsToastInfo(msg) { wsToast(wsIcon('lock', 16) + ' ' + wsEscapeHtml(msg)); }

// ============ CSS 样式 ============
const wsStyles = `<style id="workshop-plugin-styles">
#workshop-toggle-btn {
    position: fixed; width: 48px; height: 48px; top: 200px; right: 20px;
    background: linear-gradient(135deg, #FF9EAA 0%, #E68A96 100%);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    cursor: grab; z-index: 99999; user-select: none; touch-action: none;
    box-shadow: 0 4px 15px rgba(255,158,170,0.5), 0 0 0 3px rgba(255,255,255,0.2);
    transition: transform 0.2s, box-shadow 0.2s; color: white;
}
#workshop-toggle-btn:hover { transform: scale(1.1); }
#workshop-toggle-btn.dragging { cursor: grabbing; transform: scale(1.05); transition: none; }

#workshop-main-panel {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.9);
    width: 90%; max-width: 680px; max-height: 85vh; background: #fff;
    border-radius: 16px; overflow: hidden; display: none; flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3); z-index: 100000; opacity: 0;
    transition: opacity 0.3s, transform 0.3s;
}
#workshop-main-panel.active { display: flex; opacity: 1; transform: translate(-50%, -50%) scale(1); }

#workshop-backdrop {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.4); z-index: 99999; display: none;
}
#workshop-backdrop.active { display: block; }

.ws-header {
    background: linear-gradient(135deg, #FF9EAA 0%, #E68A96 100%);
    padding: 14px 20px; display: flex; align-items: center; justify-content: space-between;
    color: white; font-weight: 700; font-size: 18px;
    font-family: 'Leckerli One', cursive, sans-serif;
}
.ws-header-close {
    background: rgba(255,255,255,0.3); border: none; color: white;
    width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 16px;
}
.ws-header-close:hover { background: rgba(255,255,255,0.5); }

.ws-tabs { display: flex; background: #FFF5F7; border-bottom: 2px solid #FCE7F3; padding: 0 10px; }
.ws-tab {
    padding: 10px 16px; cursor: pointer; font-size: 13px; font-weight: 600;
    color: #9CA3AF; border-bottom: 3px solid transparent; transition: all 0.2s; white-space: nowrap;
}
.ws-tab:hover { color: #E68A96; }
.ws-tab.active { color: #E68A96; border-bottom-color: #E68A96; }

.ws-actions { display: flex; gap: 8px; padding: 10px 16px; background: #FAFAFA; border-bottom: 1px solid #F3F4F6; }
.ws-btn {
    padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
    border: none; cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 4px;
}
.ws-btn:hover { transform: translateY(-1px); filter: brightness(1.05); }
.ws-btn-pink { background: linear-gradient(135deg, #FF9EAA, #E68A96); color: white; }
.ws-btn-gray { background: #F3F4F6; color: #6B7280; }
.ws-btn-green { background: linear-gradient(135deg, #A7F3D0, #34D399); color: #064E3B; }
.ws-btn-red { background: linear-gradient(135deg, #FCA5A5, #EF4444); color: white; }
.ws-btn-blue { background: linear-gradient(135deg, #93C5FD, #3B82F6); color: white; }

.ws-body { flex: 1; overflow-y: auto; padding: 16px; min-height: 300px; max-height: 60vh; -webkit-overflow-scrolling: touch; color: #374151; }
.ws-card {
    background: #fff; border: 2px solid #FCE7F3; border-radius: 12px;
    padding: 14px; margin-bottom: 12px; transition: all 0.2s;
}
.ws-card:hover { border-color: #E68A96; box-shadow: 0 4px 12px rgba(255,158,170,0.15); }
.ws-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.ws-card-name { font-size: 15px; font-weight: 700; color: #831843; }
.ws-card-type { font-size: 11px; color: #E68A96; background: #FFF1F2; padding: 2px 8px; border-radius: 10px; }
.ws-card-body { font-size: 13px; color: #6B7280; line-height: 1.6; }
.ws-card-actions { display: flex; gap: 6px; margin-top: 10px; justify-content: flex-end; }
.ws-empty { text-align: center; padding: 40px 20px; color: #9CA3AF; }
.ws-footer {
    padding: 12px 16px; background: #FFF5F7; border-top: 2px solid #FCE7F3;
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
}
.ws-footer-info { font-size: 12px; color: #9CA3AF; }
.ws-sticker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
.ws-sticker-item {
    aspect-ratio: 1; border: 2px solid #FCE7F3; border-radius: 12px;
    overflow: hidden; cursor: pointer; position: relative; transition: all 0.2s;
}
.ws-sticker-item:hover { border-color: #E68A96; transform: scale(1.03); box-shadow: 0 4px 12px rgba(230,138,150,0.2); }
.ws-sticker-item img { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
.ws-sticker-overlay { display: none; }
.ws-sticker-info { display: none; }
.ws-input {
    width: 100%; padding: 8px 12px; border-radius: 8px;
    font-size: 13px; outline: none; box-sizing: border-box;
}
#workshop-main-panel .ws-input,
#workshop-main-panel input.ws-input,
#workshop-main-panel textarea.ws-input,
#workshop-main-panel select.ws-input {
    background: #FFFFFF !important; color: #1F2937 !important;
    border: 1px solid #D1D5DB !important;
}
#workshop-main-panel .ws-input::placeholder { color: #9CA3AF !important; opacity: 1 !important; }
#workshop-main-panel .ws-input:focus { border-color: #E68A96 !important; box-shadow: 0 0 0 3px rgba(255,158,170,0.15) !important; }
.ws-sub-panel {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(255,255,255,0.97); z-index: 10; display: none;
    flex-direction: column; padding: 20px; overflow-y: auto; box-sizing: border-box;
    -webkit-overflow-scrolling: touch; color: #1F2937;
}
.ws-sub-panel label {
    color: #374151 !important;
}
.ws-sub-panel select.ws-input {
    background: #FFFFFF; color: #1F2937;
}
.ws-sub-panel select.ws-input option {
    background: #FFFFFF; color: #1F2937;
}
.ws-input textarea, textarea.ws-input {
    line-height: 1.5;
}
.ws-sub-panel.active { display: flex; }
.ws-checkbox-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.ws-checkbox-item:hover { background: #FFF1F2; }
.ws-checkbox-item input { accent-color: #E68A96; }
.ws-header span { display: flex; align-items: center; gap: 8px; }
.ws-tab { display: inline-flex; align-items: center; gap: 4px; }
.ws-card-name { display: inline-flex; align-items: center; gap: 4px; }
.ws-card-type { display: inline-flex; align-items: center; gap: 3px; }
.ws-footer-info { display: inline-flex; align-items: center; gap: 4px; }
#workshop-toggle-btn img { filter: brightness(0) invert(1); }

/* ==================== 暗色模式 ==================== */
.ws-dark #workshop-main-panel {
    background: #232136;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
}
.ws-dark #workshop-backdrop {
    background: rgba(0,0,0,0.6);
}
.ws-dark .ws-header {
    background: linear-gradient(135deg, #eb6f92 0%, #c4a7e7 100%);
}
.ws-dark .ws-tabs {
    background: #2a273f;
    border-bottom-color: #44415a;
}
.ws-dark .ws-tab {
    color: #6e6a86;
}
.ws-dark .ws-tab:hover {
    color: #eb6f92;
}
.ws-dark .ws-tab.active {
    color: #eb6f92;
    border-bottom-color: #eb6f92;
}
.ws-dark .ws-actions {
    background: #2a273f;
    border-bottom-color: #44415a;
}
.ws-dark .ws-btn-gray {
    background: #393552;
    color: #908caa;
}
.ws-dark .ws-body {
    background: #232136;
    color: #e0def4;
}
.ws-dark .ws-card {
    background: #2a273f;
    border-color: #44415a;
}
.ws-dark .ws-card:hover {
    border-color: #eb6f92;
    box-shadow: 0 4px 12px rgba(235,111,146,0.15);
}
.ws-dark .ws-card-name {
    color: #ebbcba;
}
.ws-dark .ws-card-type {
    color: #c4a7e7;
    background: #393552;
}
.ws-dark .ws-card-body {
    color: #908caa;
}
.ws-dark .ws-empty {
    color: #6e6a86;
}
.ws-dark .ws-footer {
    background: #2a273f;
    border-top-color: #44415a;
}
.ws-dark .ws-footer-info {
    color: #6e6a86;
}
.ws-dark #workshop-main-panel .ws-input,
.ws-dark #workshop-main-panel input.ws-input,
.ws-dark #workshop-main-panel textarea.ws-input,
.ws-dark #workshop-main-panel select.ws-input {
    background: #1a1826 !important;
    border-color: #44415a !important;
    color: #e0def4 !important;
}
.ws-dark #workshop-main-panel .ws-input::placeholder {
    color: #6e6a86 !important;
}
.ws-dark #workshop-main-panel .ws-input:focus {
    border-color: #eb6f92 !important;
    box-shadow: 0 0 0 3px rgba(235,111,146,0.15) !important;
}
.ws-dark .ws-sub-panel {
    background: rgba(35,33,54,0.97);
    color: #e0def4;
}
.ws-dark .ws-checkbox-item:hover {
    background: #393552;
}
.ws-dark .ws-sticker-item {
    border-color: #44415a;
}
.ws-dark .ws-sticker-item:hover {
    border-color: #eb6f92;
}
/* 暗色模式：修复内联颜色导致的对比度问题 */
.ws-dark .ws-sub-panel label {
    color: #c4b8d8 !important;
}
.ws-dark .ws-sub-panel select,
.ws-dark .ws-sub-panel option {
    background: #1a1826 !important;
    color: #e0def4 !important;
}
.ws-dark .ws-sub-panel [style*="color:#6B7280"],
.ws-dark .ws-sub-panel [style*="color: #6B7280"],
.ws-dark .ws-sub-panel [style*="color:#9CA3AF"],
.ws-dark .ws-sub-panel [style*="color: #9CA3AF"] {
    color: #c4b8d8 !important;
}
.ws-dark .ws-sub-panel [style*="background:#FFF5F7"],
.ws-dark .ws-sub-panel [style*="background: #FFF5F7"] {
    background: #2a273f !important;
}
.ws-dark .ws-sub-panel [style*="border-color:#FCE7F3"],
.ws-dark .ws-sub-panel [style*="border: 1px solid #FCE7F3"] {
    border-color: #44415a !important;
}
.ws-dark .ws-sub-panel [style*="color:#831843"],
.ws-dark .ws-sub-panel [style*="color: #831843"] {
    color: #ebbcba !important;
}
.ws-dark .ws-sub-panel [style*="color:#374151"],
.ws-dark .ws-sub-panel [style*="color: #374151"] {
    color: #e0def4 !important;
}
.ws-dark .ws-sub-panel [style*="background:#F9FAFB"],
.ws-dark .ws-sub-panel [style*="background: #F9FAFB"],
.ws-dark .ws-sub-panel [style*="background:#F3F4F6"],
.ws-dark .ws-sub-panel [style*="background: #F3F4F6"] {
    background: #393552 !important;
}
/* 暗色模式：预览区域 */
.ws-dark .ws-card-preview {
    background: #2a273f !important;
    border-top-color: #44415a !important;
}
.ws-dark .ws-card-preview [style*="color:#6B7280"] {
    color: #c4b8d8 !important;
}
.ws-dark .ws-card-preview [style*="color:#374151"] {
    color: #e0def4 !important;
}
.ws-dark .ws-card-preview [style*="background:#F9FAFB"] {
    background: #393552 !important;
}
.ws-dark .ws-card-preview [style*="background:#FFF1F2"] {
    background: #393552 !important;
    color: #eb6f92 !important;
}
.ws-dark .ws-sub-panel [style*="border-color:#D1D5DB"],
.ws-dark .ws-sub-panel [style*="border: 1px solid #D1D5DB"],
.ws-dark .ws-sub-panel [style*="border:1px solid #D1D5DB"],
.ws-dark .ws-sub-panel [style*="border: 2px dashed #D1D5DB"],
.ws-dark .ws-sub-panel [style*="border:2px dashed #D1D5DB"] {
    border-color: #44415a !important;
}
.ws-dark .ws-sub-panel [style*="color:#EF4444"],
.ws-dark .ws-sub-panel [style*="color: #EF4444"] {
    color: #f38ba8 !important;
}
.ws-dark .ws-sub-panel .ws-checkbox-item {
    color: #e0def4;
    border-color: #44415a;
}
.ws-dark .ws-admin-card {
    background: #2a273f !important;
    border-color: #44415a !important;
}
.ws-dark .ws-admin-card:hover {
    border-color: #eb6f92 !important;
}
/* 暗色模式：管理员覆盖层 */
.ws-dark #ws-admin-detail-overlay,
.ws-dark #ws-admin-edit-overlay {
    background: rgba(35,33,54,0.97) !important;
    color: #e0def4 !important;
}
.ws-dark #ws-admin-detail-overlay label,
.ws-dark #ws-admin-edit-overlay label {
    color: #c4b8d8 !important;
}
/* 暗色模式：卡片内联颜色覆盖 */
.ws-dark .ws-card-body {
    color: #908caa !important;
}
.ws-dark .ws-card-body [style*="background:#FFF1F2"],
.ws-dark [style*="background:#FFF1F2"] {
    background: #393552 !important;
    color: #eb6f92 !important;
}
/* 暗色模式：管理面板统计区和用户管理区 */
.ws-dark #ws-admin-stats [style*="background:#FFF1F2"] {
    background: #393552 !important;
    color: #ebbcba !important;
}
.ws-dark [style*="background:#F9FAFB"] {
    background: #2a273f !important;
}
.ws-dark [style*="background:#FFFBEB"] {
    background: #393552 !important;
}
.ws-dark [style*="background:#FEF3C7"] {
    background: #393552 !important;
}
.ws-dark [style*="background:#FEE2E2"] {
    background: #3b1f2b !important;
}
.ws-dark [style*="background:#DCFCE7"] {
    background: #1f3b2a !important;
}

/* ==================== 移动端响应式 ==================== */
@media (max-width: 768px) {
    #workshop-main-panel {
        width: 95%; max-width: 400px; max-height: 88vh;
    }
    #workshop-toggle-btn {
        width: 36px; height: 36px;
    }
    .ws-header { padding: 8px 12px; font-size: 14px; }
    .ws-header-close { width: 26px; height: 26px; font-size: 13px; }
    .ws-tabs { padding: 0 4px; }
    .ws-tab { padding: 6px 8px; font-size: 11px; }
    .ws-actions { padding: 5px 8px; gap: 3px; flex-wrap: wrap; }
    .ws-btn { padding: 4px 7px; font-size: 10px; gap: 2px; }
    .ws-body { padding: 8px; }
    .ws-footer { padding: 5px 10px; font-size: 10px; }
    .ws-card { padding: 10px; }
}
@media (max-width: 480px) {
    #workshop-main-panel {
        width: 98%; max-height: 90vh; border-radius: 10px;
    }
    #workshop-toggle-btn {
        width: 32px; height: 32px;
    }
    .ws-header { padding: 6px 10px; font-size: 13px; }
    .ws-header-close { width: 24px; height: 24px; font-size: 12px; }
    .ws-tab { padding: 5px 6px; font-size: 10px; }
    .ws-actions { padding: 3px 6px; gap: 2px; }
    .ws-btn { padding: 3px 5px; font-size: 9px; }
    .ws-body { padding: 6px; }
}
</style>`;

// ============ HTML 结构 ============
function wsGetHtml() {
    return '<!-- 悬浮球按钮 -->'
    + '<div id="workshop-toggle-btn">' + wsIcon('palette', 22) + '</div>'
    + '<!-- 背景遮罩 -->'
    + '<div id="workshop-backdrop"></div>'
    + '<!-- 主面板 -->'
    + '<div id="workshop-main-panel">'
    + '  <div class="ws-header">'
    + '    <span>' + wsIcon('palette', 20) + ' Creative Workshop</span>'
    + '    <button class="ws-header-close" id="ws-close-btn">' + wsIcon('x', 16) + '</button>'
    + '  </div>'
    + '  <div class="ws-tabs">'
    + '    <div class="ws-tab active" data-tab="character">' + wsIcon('user', 14) + ' 创意角色</div>'
    + '    <div class="ws-tab" data-tab="room">' + wsIcon('home', 14) + ' 创意房间</div>'
    + '    <div class="ws-tab" data-tab="world">' + wsIcon('globe', 14) + ' 创意世界</div>'
    + '    <div class="ws-tab" data-tab="sticker">' + wsIcon('smile', 14) + ' 表情包</div>'
    + '  </div>'
    + '  <div class="ws-actions">'
    + '    <button class="ws-btn ws-btn-pink" id="ws-import-btn">' + wsIcon('download', 13) + ' 导入</button>'
    + '    <button class="ws-btn ws-btn-blue" id="ws-preset-btn">' + wsIcon('package', 13) + ' 预设管理</button>'
    + '    <button class="ws-btn ws-btn-gray" id="ws-export-btn">' + wsIcon('upload', 13) + ' 导出全部</button>'
    + '    <button class="ws-btn ws-btn-green" id="ws-upload-cloud-btn">' + wsIcon('plus', 13) + ' 新建</button>'
    + '    <button class="ws-btn ws-btn-green" id="ws-cloud-btn" style="margin-left:auto;">' + wsIcon('cloud', 13) + ' 云端浏览</button>'
    + '  </div>'
    + '  <div class="ws-body" id="ws-content" style="position:relative;"><!-- 动态内容 --></div>'
    + '  <div class="ws-footer">'
    + '    <span class="ws-footer-info" id="ws-footer-info">本地版</span>'
    + '    <span id="ws-auth-area"></span>'
    + '  </div>'
    + '  <div class="ws-sub-panel" id="ws-import-panel"></div>'
    + '  <div class="ws-sub-panel" id="ws-preset-panel"></div>'
    + '  <div class="ws-sub-panel" id="ws-admin-panel"></div>'
    + '  <div class="ws-sub-panel" id="ws-upload-panel"></div>'
    + '</div>';
}

// ============ 清理函数 ============
function cleanupWorkshopPlugin() {
    console.log('[创意工坊] 清理插件...');
    // 从 FloatingMenuManager 反注册
    if (window.parent.FloatingMenuManager) {
        window.parent.FloatingMenuManager.unregisterButton('workshop');
    }
    $('#workshop-toggle-btn').remove();
    $('#workshop-backdrop').remove();
    $('#workshop-main-panel').remove();
    $('#workshop-plugin-styles').remove();
    $(window.parent.document).off('.workshop-plugin');
    console.log('[创意工坊] 清理完成');
}
window.cleanupWorkshopPlugin = cleanupWorkshopPlugin;

// ============ 初始化函数 ============
async function initializeWorkshopPlugin() {
    console.log('[创意工坊] 初始化...');
    cleanupWorkshopPlugin();

    // 迁移旧LocalStorage内容到IndexedDB
    await wsMigrateContentToIDB();

    // 注入CSS
    if ($('#workshop-plugin-styles').length === 0) {
        const cssContent = wsStyles.replace('<style id="workshop-plugin-styles">', '').replace('</style>', '');
        $('<style>').attr('id', 'workshop-plugin-styles').html(cssContent).appendTo('head');
    }

    // 注入HTML
    $(wsGetHtml()).appendTo('body');

    const targetDoc = window.parent.document;
    const $targetDoc = $(targetDoc);

    // ============ 注册到悬浮球菜单管理器 ============
    var fabRegistered = false;
    if (window.parent.FloatingMenuManager) {
        try {
            // 使用统一菜单系统
            console.log('[创意工坊] 注册到FloatingMenuManager');

            const panel = targetDoc.getElementById('workshop-main-panel');
            const backdrop = targetDoc.getElementById('workshop-backdrop');

            window.parent.FloatingMenuManager.registerButton({
                id: 'workshop',
                icon: wsIcon('palette', 22),
                label: '创意工坊',
                onClick: function() {
                    const isActive = panel.classList.contains('active');
                    if (isActive) {
                        panel.classList.remove('active');
                        backdrop.classList.remove('active');
                    } else {
                        // 自动检测暗色模式
                        try {
                            var savedTheme = localStorage.getItem('apartment_theme');
                            if (savedTheme === 'dark') {
                                targetDoc.body.classList.add('ws-dark');
                            } else {
                                targetDoc.body.classList.remove('ws-dark');
                            }
                        } catch(e) {}
                        panel.classList.add('active');
                        backdrop.classList.add('active');
                        wsRenderTabContent(targetDoc);
                    }
                },
                color: 'linear-gradient(135deg, #F472B6 0%, #DB2777 100%)',
                order: 2
            });

            // 隐藏独立悬浮球按钮
            const btn = targetDoc.getElementById('workshop-toggle-btn');
            if (btn) btn.style.display = 'none';
            fabRegistered = true;
        } catch (e) {
            console.warn('[创意工坊] FloatingMenuManager注册失败，降级到独立悬浮球:', e);
        }
    }

    if (!fabRegistered) {
        // 降级方案：使用独立悬浮球
        console.log('[创意工坊] FloatingMenuManager未加载，使用独立悬浮球');

        // 恢复悬浮球位置
        const btn = targetDoc.getElementById('workshop-toggle-btn');
        try {
            const saved = localStorage.getItem(WS_PREFIX + 'btnPos');
            if (saved) {
                const pos = JSON.parse(saved);
                btn.style.left = pos.left + 'px';
                btn.style.top = pos.top + 'px';
                btn.style.right = 'auto';
            }
        } catch (e) {}

        // 恢复暗色主题
        try {
            if (localStorage.getItem('apartment_theme') === 'dark') {
                targetDoc.body.classList.add('ws-dark');
            }
        } catch(e) {}

        // 初始化拖拽
        initializeWsBtnDrag(targetDoc);
    }

    // 初始化面板事件
    initializeWsPanel(targetDoc);

    console.log('[创意工坊] 初始化完成');
}

// ============ 悬浮球拖拽 ============
function initializeWsBtnDrag(targetDoc) {
    const btn = targetDoc.getElementById('workshop-toggle-btn');
    const panel = targetDoc.getElementById('workshop-main-panel');
    const backdrop = targetDoc.getElementById('workshop-backdrop');
    const $targetDoc = $(targetDoc);

    function handleStart(clientX, clientY) {
        if (wsBtnDragData) return false;
        const rect = btn.getBoundingClientRect();
        wsBtnDragData = { startX: clientX, startY: clientY, initialLeft: rect.left, initialTop: rect.top };
        btn.classList.add('dragging');
        return true;
    }

    function handleMove(clientX, clientY) {
        if (!wsBtnDragData) return;
        const dx = clientX - wsBtnDragData.startX;
        const dy = clientY - wsBtnDragData.startY;
        let x = wsBtnDragData.initialLeft + dx;
        let y = wsBtnDragData.initialTop + dy;
        x = Math.max(0, Math.min(x, window.parent.innerWidth - 48));
        y = Math.max(0, Math.min(y, window.parent.innerHeight - 48));
        btn.style.left = x + 'px';
        btn.style.top = y + 'px';
        btn.style.right = 'auto';
    }

    function handleEnd(clientX, clientY) {
        if (!wsBtnDragData) return;
        btn.classList.remove('dragging');
        const dx = clientX - wsBtnDragData.startX;
        const dy = clientY - wsBtnDragData.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const rect = btn.getBoundingClientRect();
        localStorage.setItem(WS_PREFIX + 'btnPos', JSON.stringify({ left: rect.left, top: rect.top }));
        wsBtnDragData = null;

        // 点击（移动距离<5px）
        if (distance < 5) {
            const isActive = panel.classList.contains('active');
            if (isActive) {
                panel.classList.remove('active');
                backdrop.classList.remove('active');
            } else {
                // 自动检测暗色模式
                try {
                    var savedTheme = localStorage.getItem('apartment_theme');
                    if (savedTheme === 'dark') {
                        targetDoc.body.classList.add('ws-dark');
                    } else {
                        targetDoc.body.classList.remove('ws-dark');
                    }
                } catch(e) {}
                panel.classList.add('active');
                backdrop.classList.add('active');
                wsRenderTabContent(targetDoc);
            }
        }
    }

    $(btn).on('mousedown.workshop-plugin', function(e) {
        if (handleStart(e.clientX, e.clientY)) { e.preventDefault(); e.stopPropagation(); }
    });
    $(btn).on('touchstart.workshop-plugin', function(e) {
        const t = e.originalEvent.touches[0];
        if (handleStart(t.clientX, t.clientY)) { e.preventDefault(); e.stopPropagation(); }
    });
    $targetDoc.on('mousemove.workshop-plugin', function(e) {
        handleMove(e.clientX, e.clientY);
        if (wsBtnDragData) e.preventDefault();
    });
    $targetDoc.on('touchmove.workshop-plugin', function(e) {
        const t = e.originalEvent.touches[0];
        handleMove(t.clientX, t.clientY);
        if (wsBtnDragData) e.preventDefault();
    });
    $targetDoc.on('mouseup.workshop-plugin', function(e) { handleEnd(e.clientX, e.clientY); });
    $targetDoc.on('touchend.workshop-plugin touchcancel.workshop-plugin', function(e) {
        const t = e.originalEvent.changedTouches[0];
        handleEnd(t ? t.clientX : 0, t ? t.clientY : 0);
    });
}

// ============ 面板事件绑定 ============
function initializeWsPanel(targetDoc) {
    const panel = targetDoc.getElementById('workshop-main-panel');
    const backdrop = targetDoc.getElementById('workshop-backdrop');
    const closeBtn = targetDoc.getElementById('ws-close-btn');
    const importBtn = targetDoc.getElementById('ws-import-btn');
    const presetBtn = targetDoc.getElementById('ws-preset-btn');
    const exportBtn = targetDoc.getElementById('ws-export-btn');
    const contentBody = targetDoc.getElementById('ws-content');
    const importPanel = targetDoc.getElementById('ws-import-panel');
    const presetPanel = targetDoc.getElementById('ws-preset-panel');
    const tabsContainer = panel.querySelector('.ws-tabs');

    var uploadPanelEl = panel.querySelector('#ws-upload-panel');
    function closePanel() {
        panel.classList.remove('active');
        backdrop.classList.remove('active');
        importPanel.classList.remove('active');
        presetPanel.classList.remove('active');
        if (uploadPanelEl) uploadPanelEl.classList.remove('active');
        // 重置云端模式状态
        if (wsViewMode === 'cloud') {
            wsViewMode = 'local';
            var cloudBtn = targetDoc.getElementById('ws-cloud-btn');
            if (cloudBtn) cloudBtn.innerHTML = wsIcon('cloud', 13) + ' 云端浏览';
            importBtn.style.display = ''; presetBtn.style.display = ''; exportBtn.style.display = '';
        }
    }

    // 关闭
    closeBtn.addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    // Tab切换
    tabsContainer.addEventListener('click', function(e) {
        const tab = e.target.closest('.ws-tab');
        if (!tab) return;
        wsCurrentTab = tab.getAttribute('data-tab');
        wsCloudCurrentPage = 1;
        tabsContainer.querySelectorAll('.ws-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        importPanel.classList.remove('active');
        presetPanel.classList.remove('active');
        if (uploadPanelEl) uploadPanelEl.classList.remove('active');
        wsRenderTabContent(targetDoc);
    });

    // 导入按钮
    importBtn.addEventListener('click', function() {
        presetPanel.classList.remove('active');
        wsShowImportPanel(targetDoc);
    });

    // 预设按钮
    presetBtn.addEventListener('click', async function() {
        importPanel.classList.remove('active');
        await wsShowPresetPanel(targetDoc);
    });

    // 导出
    exportBtn.addEventListener('click', function() { wsExportAll(); wsToastOk('已导出'); });

    // 上传到云端按钮
    var uploadCloudBtn = targetDoc.getElementById('ws-upload-cloud-btn');
    var uploadPanel = panel.querySelector('#ws-upload-panel');
    uploadCloudBtn.addEventListener('click', function() {
        importPanel.classList.remove('active');
        presetPanel.classList.remove('active');
        wsShowUploadPanel(uploadPanel);
    });

    // 上传面板事件委托
    uploadPanel.addEventListener('click', async function(e) {
        var btn = e.target.closest('button') || e.target.closest('[data-action]');
        if (!btn) return;
        var action = btn.getAttribute('data-action');

        if (action === 'cancel') {
            uploadPanel.classList.remove('active');
        } else if (action === 'upload-mode') {
            // 切换表单/JSON模式
            var mode = btn.getAttribute('data-mode');
            var formArea = uploadPanel.querySelector('#ws-upload-form-area');
            var jsonArea = uploadPanel.querySelector('#ws-upload-json-area');
            var formBtn = uploadPanel.querySelector('#ws-upload-mode-form');
            var jsonBtn = uploadPanel.querySelector('#ws-upload-mode-json');
            if (mode === 'json') {
                if (formArea) formArea.style.display = 'none';
                if (jsonArea) jsonArea.style.display = 'flex';
                if (formBtn) formBtn.className = 'ws-btn ws-btn-gray';
                if (jsonBtn) jsonBtn.className = 'ws-btn ws-btn-pink';
            } else {
                if (formArea) formArea.style.display = 'flex';
                if (jsonArea) jsonArea.style.display = 'none';
                if (formBtn) formBtn.className = 'ws-btn ws-btn-pink';
                if (jsonBtn) jsonBtn.className = 'ws-btn ws-btn-gray';
            }
        } else if (action === 'upload-json-submit') {
            // JSON粘贴模式 → 保存到本地
            var jName = (uploadPanel.querySelector('#ws-upload-json-name') || {}).value || '';
            var jTagsStr = (uploadPanel.querySelector('#ws-upload-json-tags') || {}).value || '';
            var jTags = jTagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
            var jDataStr = (uploadPanel.querySelector('#ws-upload-json-data') || {}).value || '';
            if (!jName.trim()) { wsToastWarn('请输入名称'); return; }
            if (!jDataStr.trim()) { wsToastWarn('请粘贴JSON数据'); return; }
            var jData;
            try { jData = JSON.parse(jDataStr); } catch (e) { wsToastErr('JSON格式错误: ' + e.message); return; }
            btn.innerHTML = wsIcon('loader', 12) + ' 保存中...'; btn.disabled = true;
            try {
                await wsAddContent(wsCurrentTab, { type: wsCurrentTab, name: jName.trim(), data: jData, tags: jTags });
                wsToastOk('"' + jName.trim() + '" 已保存到本地');
                uploadPanel.classList.remove('active');
                wsRenderTabContent(targetDoc);
            } catch (err) { wsToastErr('保存失败: ' + err.message); }
            btn.innerHTML = wsIcon('save', 12) + ' 保存'; btn.disabled = false;
        } else if (action === 'upload-submit') {
            btn.innerHTML = wsIcon('loader', 12) + ' 保存中...'; btn.disabled = true;
            await wsSubmitUploadLocal(uploadPanel, targetDoc);
            btn.innerHTML = wsIcon('save', 12) + ' 保存'; btn.disabled = false;
        } else if (action === 'upload-sticker-submit') {
            var sName = (uploadPanel.querySelector('#ws-upload-sticker-name') || {}).value || '';
            var sDesc = (uploadPanel.querySelector('#ws-upload-sticker-desc') || {}).value || '';
            var sTagsStr = (uploadPanel.querySelector('#ws-upload-sticker-tags') || {}).value || '';
            var sTags = sTagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
            var sData = uploadPanel._pendingStickerData;
            if (!sName.trim()) { wsToastWarn('请输入表情包名称'); return; }
            if (!sData) { wsToastWarn('请选择图片'); return; }
            btn.innerHTML = wsIcon('loader', 12) + ' 上传中...'; btn.disabled = true;
            try {
                await wsCloudUploadSticker({ name: sName.trim(), description: sDesc.trim(), imageData: sData, tags: sTags });
                wsToastOk('已提交，等待管理员审核');
                uploadPanel._pendingStickerData = null;
                uploadPanel.classList.remove('active');
            } catch (err) { wsToastErr('上传失败: ' + err.message); }
            btn.innerHTML = wsIcon('cloudUp', 12) + ' 提交审核'; btn.disabled = false;
        } else if (action === 'uv-add-room') {
            var roomsContainer = uploadPanel.querySelector('#ws-uv-rooms');
            if (roomsContainer) wsAddUvRoomRow(roomsContainer);
        } else if (action === 'uv-add-tenant') {
            var tenantsContainer = uploadPanel.querySelector('#ws-uv-tenants');
            if (tenantsContainer) wsAddUvTenantRow(tenantsContainer);
        } else if (action === 'uv-remove-row') {
            var row = btn.closest('.ws-uv-room-row, .ws-uv-tenant-row');
            if (row) row.remove();
        }
    });

    // 云端浏览
    var cloudBtn = targetDoc.getElementById('ws-cloud-btn');
    cloudBtn.addEventListener('click', function() {
        if (!wsIsCloudEnabled()) {
            wsToastErr('未配置API地址，请在脚本顶部设置 WS_API_BASE');
            return;
        }
        // 切回本地不需要检查
        if (wsViewMode === 'cloud') {
            wsViewMode = 'local';
            cloudBtn.innerHTML = wsIcon('cloud', 13) + ' 云端浏览';
            importBtn.style.display = ''; presetBtn.style.display = ''; exportBtn.style.display = '';
            wsRenderTabContent(targetDoc);
            return;
        }
        // 切到云端需要登录检查
        if (!wsIsLoggedIn()) {
            wsToastInfo('请先登录Discord后再浏览云端内容');
            return;
        }
        var user = wsGetAuthUser();
        if (user && !user.inGuild) {
            wsToastWarn('你尚未加入指定的Discord服务器，无法浏览云端内容');
            return;
        }
        wsViewMode = 'cloud';
        wsCloudCurrentPage = 1;
        cloudBtn.innerHTML = wsIcon('folder', 13) + ' 本地内容';
        importBtn.style.display = 'none'; presetBtn.style.display = 'none'; exportBtn.style.display = 'none';
        importPanel.classList.remove('active');
        presetPanel.classList.remove('active');
        wsRenderTabContent(targetDoc);
    });

    // Footer认证区域事件委托
    var footerEl = panel.querySelector('.ws-footer');
    footerEl.addEventListener('click', function(e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        if (action === 'discord-login') { wsDiscordLogin(); }
        else if (action === 'logout') {
            wsLogout(); wsUpdateFooterAuth(targetDoc); wsToastOk('已退出登录');
            // 退出登录时重置云端模式
            if (wsViewMode === 'cloud') {
                wsViewMode = 'local';
                var cBtn = targetDoc.getElementById('ws-cloud-btn');
                if (cBtn) cBtn.innerHTML = wsIcon('cloud', 13) + ' 云端浏览';
                importBtn.style.display = ''; presetBtn.style.display = ''; exportBtn.style.display = '';
                wsRenderTabContent(targetDoc);
            }
        }
        else if (action === 'open-admin') {
            var adminPanel = targetDoc.getElementById('ws-admin-panel');
            if (adminPanel) wsRenderAdminPanel(adminPanel);
        }
    });

    // 管理员面板事件委托
    var adminPanel = panel.querySelector('#ws-admin-panel');
    adminPanel.addEventListener('click', async function(e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        var action = btn.getAttribute('data-action');

        if (action === 'close-admin') {
            adminPanel.classList.remove('active');
            adminPanel.style.display = '';
        } else if (action === 'admin-tab') {
            // Tab切换
            wsAdminTab = btn.getAttribute('data-tab') || 'pending';
            wsAdminAllPage = 1;
            // 更新Tab按钮样式
            adminPanel.querySelectorAll('#ws-admin-tabs button').forEach(function(b) {
                b.className = 'ws-btn ' + (b.getAttribute('data-tab') === wsAdminTab ? 'ws-btn-pink' : 'ws-btn-gray');
            });
            await wsRenderAdminTabContent(adminPanel);
        } else if (action === 'admin-filter') {
            // 全部内容Tab的筛选
            var typeSelect = adminPanel.querySelector('#ws-admin-filter-type');
            var statusSelect = adminPanel.querySelector('#ws-admin-filter-status');
            wsAdminAllType = typeSelect ? typeSelect.value : '';
            wsAdminAllStatus = statusSelect ? statusSelect.value : '';
            wsAdminAllPage = 1;
            await wsRenderAdminTabContent(adminPanel);
        } else if (action === 'admin-page') {
            // 分页
            wsAdminAllPage = parseInt(btn.getAttribute('data-page')) || 1;
            await wsRenderAdminTabContent(adminPanel);
        } else if (action === 'admin-approve') {
            var type = btn.getAttribute('data-type');
            var id = btn.getAttribute('data-id');
            if (!type || !id) return;
            try {
                btn.innerHTML = wsIcon('loader', 12); btn.disabled = true;
                await wsAdminReview(type, id, 'approve');
                wsCloudCacheClear();
                wsToastOk('已通过');
                await wsRenderAdminTabContent(adminPanel);
            } catch (err) { wsToastErr(err.message); btn.innerHTML = wsIcon('check', 11) + ' 通过'; btn.disabled = false; }
        } else if (action === 'admin-reject') {
            var type = btn.getAttribute('data-type');
            var id = btn.getAttribute('data-id');
            if (!type || !id) return;
            try {
                btn.innerHTML = wsIcon('loader', 12); btn.disabled = true;
                await wsAdminReview(type, id, 'reject');
                wsCloudCacheClear();
                wsToastOk('已拒绝');
                await wsRenderAdminTabContent(adminPanel);
            } catch (err) { wsToastErr(err.message); btn.innerHTML = wsIcon('x', 11) + ' 拒绝'; btn.disabled = false; }
        } else if (action === 'admin-detail') {
            // 查看详情
            var type = btn.getAttribute('data-type');
            var id = btn.getAttribute('data-id');
            if (type && id) {
                btn.innerHTML = wsIcon('loader', 11); btn.disabled = true;
                await wsShowAdminDetail(adminPanel, type, id);
                btn.innerHTML = wsIcon('eye', 11) + ' 详情'; btn.disabled = false;
            }
        } else if (action === 'admin-detail-close') {
            var overlay = adminPanel.querySelector('#ws-admin-detail-overlay');
            if (overlay) overlay.remove();
        } else if (action === 'admin-edit') {
            // 打开编辑表单
            var type = btn.getAttribute('data-type');
            var id = btn.getAttribute('data-id');
            if (type && id) {
                btn.innerHTML = wsIcon('loader', 11); btn.disabled = true;
                await wsShowAdminEditForm(adminPanel, type, id);
                btn.innerHTML = wsIcon('edit', 11) + ' 编辑'; btn.disabled = false;
            }
        } else if (action === 'admin-edit-close') {
            var overlay = adminPanel.querySelector('#ws-admin-edit-overlay');
            if (overlay) overlay.remove();
        } else if (action === 'admin-edit-save') {
            // 保存编辑
            var type = btn.getAttribute('data-type');
            var id = btn.getAttribute('data-id');
            if (!type || !id) return;
            try {
                btn.innerHTML = wsIcon('loader', 12); btn.disabled = true;
                var editData = {};
                var nameInput = adminPanel.querySelector('#ws-admin-edit-name');
                var descInput = adminPanel.querySelector('#ws-admin-edit-desc');
                var tagsInput = adminPanel.querySelector('#ws-admin-edit-tags');
                var statusSelect = adminPanel.querySelector('#ws-admin-edit-status');
                var dataTextarea = adminPanel.querySelector('#ws-admin-edit-data');
                if (nameInput) editData.name = nameInput.value.trim();
                if (descInput) editData.description = descInput.value.trim();
                if (tagsInput) editData.tags = tagsInput.value.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
                if (statusSelect) editData.status = statusSelect.value;
                if (dataTextarea) {
                    try { editData.data = JSON.parse(dataTextarea.value); } catch (e) { wsToastErr('JSON格式错误: ' + e.message); btn.innerHTML = wsIcon('check', 12) + ' 保存'; btn.disabled = false; return; }
                }
                await wsAdminEdit(type, id, editData);
                wsCloudCacheClear();
                wsToastOk('已保存');
                var overlay = adminPanel.querySelector('#ws-admin-edit-overlay');
                if (overlay) overlay.remove();
                await wsRenderAdminTabContent(adminPanel);
            } catch (err) { wsToastErr(err.message); btn.innerHTML = wsIcon('check', 12) + ' 保存'; btn.disabled = false; }
        } else if (action === 'admin-delete') {
            // 删除内容
            var type = btn.getAttribute('data-type');
            var id = btn.getAttribute('data-id');
            if (!type || !id) return;
            if (!confirm('确定要永久删除这个内容吗？此操作不可撤销。')) return;
            try {
                btn.innerHTML = wsIcon('loader', 12); btn.disabled = true;
                await wsAdminDelete(type, id);
                wsCloudCacheClear();
                wsToastOk('已删除');
                await wsRenderAdminTabContent(adminPanel);
            } catch (err) { wsToastErr(err.message); btn.innerHTML = wsIcon('trash', 11) + ' 删除'; btn.disabled = false; }
        } else if (action === 'admin-ban') {
            var uid = btn.getAttribute('data-uid');
            if (!uid) {
                var uidInput = adminPanel.querySelector('#ws-admin-uid');
                uid = uidInput ? uidInput.value.trim() : '';
            }
            if (!uid) { wsToastWarn('请输入Discord用户ID'); return; }
            try {
                btn.innerHTML = wsIcon('loader', 12); btn.disabled = true;
                await wsAdminBan(uid);
                wsToastOk('已封禁用户 ' + uid);
                btn.innerHTML = wsIcon('checkCircle', 12) + ' 已封禁';
            } catch (err) { wsToastErr(err.message); btn.innerHTML = wsIcon('ban', 12) + ' 封禁'; btn.disabled = false; }
        } else if (action === 'admin-unban') {
            var uidInput = adminPanel.querySelector('#ws-admin-uid');
            var uid = uidInput ? uidInput.value.trim() : '';
            if (!uid) { wsToastWarn('请输入Discord用户ID'); return; }
            try {
                btn.innerHTML = wsIcon('loader', 12); btn.disabled = true;
                await wsAdminUnban(uid);
                wsToastOk('已解封用户 ' + uid);
                btn.innerHTML = wsIcon('checkCircle', 12) + ' 已解封';
            } catch (err) { wsToastErr(err.message); btn.innerHTML = wsIcon('check', 12) + ' 解封'; btn.disabled = false; }
        }
    });

    // 初始化认证区域
    wsUpdateFooterAuth(targetDoc);

    // 内容区域事件委托（处理动态按钮的点击）
    contentBody.addEventListener('click', async function(e) {
        // 处理表情包卡片点击 - 弹出详情对话框
        const stickerItem = e.target.closest('.ws-sticker-item');
        if (stickerItem && !e.target.closest('button')) {
            const stickerId = stickerItem.getAttribute('data-sticker-id');
            if (stickerId) {
                // 判断是本地还是云端表情包（云端表情包有ws-cloud-sticker类）
                if (stickerItem.classList.contains('ws-cloud-sticker')) {
                    wsShowCloudStickerDialog(targetDoc, stickerId);
                } else {
                    wsShowLocalStickerDialog(targetDoc, stickerId);
                }
            }
            return;
        }

        const btn = e.target.closest('button');
        if (!btn) return;

        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        const type = btn.getAttribute('data-type');

        if (action === 'cancel') {
            // 关闭表情包详情面板
            const detailPanel = targetDoc.querySelector('#ws-sticker-detail-panel');
            if (detailPanel) detailPanel.style.display = 'none';
        } else if (action === 'apply' && id && type) {
            const item = (await wsGetAllContent())[type]?.find(c => c.id === id);
            if (item) {
                if (type === 'world') {
                    // 世界观使用深度融合（弹出确认对话框）
                    wsShowApplyWorldDialog(targetDoc, item);
                } else {
                    const ok = await wsWriteToChatLore(type, item);
                    if (ok) wsToastOk('"' + wsGetItemName(item) + '" 已应用'); else wsToastErr('应用失败');
                }
            }
        } else if (action === 'recruit' && id) {
            var item = (await wsGetAllContent()).character?.find(c => c.id === id);
            if (item) wsShowRecruitDialog(targetDoc, item);
        } else if (action === 'install-room' && id) {
            var item = (await wsGetAllContent()).room?.find(c => c.id === id);
            if (item) wsShowInstallRoomDialog(targetDoc, item);
        } else if (action === 'apply-world' && id) {
            var item = (await wsGetAllContent()).world?.find(c => c.id === id);
            if (item) wsShowApplyWorldDialog(targetDoc, item);
        } else if (action === 'clear-world') {
            try {
                await wsClearWorldView();
                wsToastOk('已清除创意世界观ChatLore条目');
            } catch (err) { wsToastErr('清除失败: ' + err.message); }
        } else if (action === 'delete' && id && type) {
            if (type === 'sticker') { await wsDeleteStickerById(id); }
            else { await wsRemoveContent(type, id); }
            wsToastOk('已删除');
            wsRenderTabContent(targetDoc);
        } else if (action === 'add-sticker') {
            wsAddStickerFromFile(targetDoc);
        } else if (action === 'sticker-edit' && id) {
            wsShowStickerEditDialog(targetDoc, id);
        } else if (action === 'export-sticker') {
            const stickers = await wsGetAllStickers();
            const blob = new Blob([JSON.stringify(stickers)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = targetDoc.createElement('a');
            a.href = url; a.download = 'stickers_' + Date.now() + '.json'; a.click();
            URL.revokeObjectURL(url);
            wsToastOk('已导出表情包');
        } else if (action === 'quick-create') {
            wsShowCreateForm(targetDoc, type);
        } else if (action === 'cloud-preview' && id && type) {
            var previewEl = contentBody.querySelector('#ws-cloud-preview-' + id);
            if (previewEl) {
                if (previewEl.style.display !== 'none' && previewEl.innerHTML) {
                    previewEl.style.display = 'none';
                    btn.innerHTML = wsIcon('eye', 12) + ' 预览';
                    return;
                }
                previewEl.style.display = 'block';
                previewEl.innerHTML = '<div style="text-align:center;padding:8px;">' + wsIcon('loader', 16) + ' 加载中...</div>';
                btn.innerHTML = wsIcon('loader', 12) + ' 加载中...'; btn.disabled = true;
                try {
                    var result = await wsApiFetch('/api/content/get/' + type + '/' + id);
                    if (result && result.content) {
                        var c = result.content;
                        previewEl.innerHTML = wsGetItemPreview(type, { data: c.data, name: c.name, tags: c.tags });
                    } else {
                        previewEl.innerHTML = '<span style="font-size:11px;color:#9CA3AF;">无法加载预览</span>';
                    }
                } catch (err) {
                    previewEl.innerHTML = '<span style="font-size:11px;color:#EF4444;">加载失败: ' + wsEscapeHtml(err.message) + '</span>';
                }
                btn.innerHTML = wsIcon('eyeOff', 12) + ' 收起'; btn.disabled = false;
            }
        } else if (action === 'cloud-download' && id && type) {
            try {
                btn.innerHTML = wsIcon('loader', 12);
                btn.disabled = true;
                if (type === 'sticker') {
                    // 表情包使用专用下载路径
                    var r2key = btn.getAttribute('data-r2key') || '';
                    var sName = btn.getAttribute('data-name') || 'sticker';
                    var sDesc = btn.getAttribute('data-desc') || '';
                    await wsCloudDownloadSticker({ id: id, r2Key: r2key, name: sName, description: sDesc });
                } else {
                    await wsCloudDownload(type, id);
                }
                wsToastOk('已下载到本地');
                btn.innerHTML = wsIcon('checkCircle', 12) + ' 已下载';
            } catch (err) {
                wsToastErr('下载失败: ' + err.message);
                btn.innerHTML = wsIcon('download', 12) + ' 下载';
                btn.disabled = false;
            }
        } else if (action === 'cloud-search') {
            var searchInput = contentBody.querySelector('#ws-cloud-search');
            var query = searchInput ? searchInput.value.trim() : '';
            if (!query) { wsToastWarn('请输入搜索关键词'); return; }
            try {
                contentBody.innerHTML = '<div class="ws-empty"><div style="margin-bottom:8px;">' + wsIcon('loader', 32) + '</div><div style="font-size:14px;">搜索中...</div></div>';
                var result = await wsCloudSearch(query, wsCurrentTab);
                var items = result.results || [];
                if (items.length === 0) {
                    contentBody.innerHTML = '<div class="ws-empty"><div style="margin-bottom:12px;">' + wsIcon('search', 48) + '</div><div style="font-size:14px;">未找到"' + wsEscapeHtml(query) + '"相关内容</div></div>';
                    return;
                }
                var html = '<div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;">'
                    + '<input class="ws-input" id="ws-cloud-search" value="' + query.replace(/"/g, '&quot;') + '" placeholder="搜索..." style="flex:1;padding:6px 10px;">'
                    + '<button class="ws-btn ws-btn-pink" data-action="cloud-search">搜索</button>'
                    + '<button class="ws-btn ws-btn-gray" data-action="cloud-back">返回列表</button></div>';
                for (var si = 0; si < items.length; si++) {
                    var sItem = items[si];
                    var sType = sItem.type || wsCurrentTab;
                    html += '<div class="ws-card">'
                        + '<div class="ws-card-header"><span class="ws-card-name">' + wsTypeIcon(sType) + ' ' + wsEscapeHtml(sItem.name || sItem.id) + '</span>'
                        + '<span class="ws-card-type">by ' + wsEscapeHtml(sItem.author || '匿名') + ' · ' + wsIcon('download', 10) + ' ' + (sItem.downloads || 0) + '</span></div>'
                        + '<div class="ws-card-body">' + (sItem.tags || []).map(function(t) { return '<span style="background:#FFF1F2;color:#E68A96;padding:1px 6px;border-radius:8px;font-size:11px;margin-right:4px;">' + wsEscapeHtml(t) + '</span>'; }).join('') + '</div>'
                        + '<div class="ws-card-preview" id="ws-cloud-preview-' + sItem.id + '" style="display:none;padding:8px 10px;border-top:1px solid #F3F4F6;background:#FAFAFA;border-radius:0 0 10px 10px;"></div>'
                        + '<div class="ws-card-actions">'
                        + (sType !== 'sticker' ? '<button class="ws-btn ws-btn-gray" data-action="cloud-preview" data-id="' + sItem.id + '" data-type="' + sType + '">' + wsIcon('eye', 12) + ' 预览</button>' : '')
                        + '<button class="ws-btn ws-btn-green" data-action="cloud-download" data-id="' + sItem.id + '" data-type="' + sType + '"'
                        + (sType === 'sticker' ? ' data-r2key="' + wsEscapeHtml(sItem.r2Key || '') + '" data-name="' + wsEscapeHtml(sItem.name || '') + '" data-desc="' + wsEscapeHtml(sItem.description || '') + '"' : '')
                        + '>' + wsIcon('download', 12) + ' 下载到本地</button>'
                        + '</div></div>';
                }
                html += '<div style="text-align:center;padding:8px;font-size:12px;color:#9CA3AF;">共 ' + items.length + ' 条结果</div>';
                contentBody.innerHTML = html;
            } catch (err) {
                wsToastErr('搜索失败: ' + err.message);
            }
        } else if (action === 'cloud-back') {
            wsCloudCurrentPage = 1;
            wsRenderTabContent(targetDoc);
        } else if (action === 'cloud-page') {
            var page = parseInt(btn.getAttribute('data-page'));
            if (page && page >= 1) {
                wsCloudCurrentPage = page;
                wsRenderTabContent(targetDoc);
            }
        } else if (action === 'cloud-upload' && id && type) {
            if (!wsIsLoggedIn()) { wsToastInfo('请先登录Discord'); return; }
            var uUser = wsGetAuthUser();
            if (uUser && !uUser.inGuild) { wsToastWarn('需要加入Discord服务器才能上传'); return; }
            try {
                var item = (await wsGetAllContent())[type]?.find(function(c) { return c.id === id; });
                if (!item) return;
                btn.innerHTML = wsIcon('loader', 12);
                btn.disabled = true;
                await wsCloudUpload(type, item);
                wsToastOk('"' + wsGetItemName(item) + '" 已上传，等待管理员审核');
                btn.innerHTML = wsIcon('checkCircle', 12) + ' 待审核';
            } catch (err) {
                wsToastErr('上传失败: ' + err.message);
                btn.innerHTML = wsIcon('cloudUp', 12) + ' 上传';
                btn.disabled = false;
            }
        } else if (action === 'sticker-cloud-upload' && id) {
            if (!wsIsLoggedIn()) { wsToastInfo('请先登录Discord'); return; }
            var uUser2 = wsGetAuthUser();
            if (uUser2 && !uUser2.inGuild) { wsToastWarn('需要加入Discord服务器才能上传'); return; }
            try {
                var stickers = await wsGetAllStickers();
                var sticker = stickers.find(function(s) { return s.id === id; });
                if (!sticker || !sticker.imageData) { wsToastErr('表情包数据不完整'); return; }
                btn.innerHTML = wsIcon('loader', 10);
                btn.disabled = true;
                await wsCloudUploadSticker(sticker);
                wsToastOk('"' + (sticker.name || 'sticker') + '" 已上传，等待管理员审核');
                btn.innerHTML = wsIcon('checkCircle', 10);
            } catch (err) {
                wsToastErr('上传失败: ' + err.message);
                btn.innerHTML = wsIcon('cloudUp', 10);
                btn.disabled = false;
            }
        } else if (action === 'sticker-cloud-upload-all') {
            if (!wsIsLoggedIn()) { wsToastInfo('请先登录Discord'); return; }
            var uUser3 = wsGetAuthUser();
            if (uUser3 && !uUser3.inGuild) { wsToastWarn('需要加入Discord服务器才能上传'); return; }
            btn.innerHTML = wsIcon('loader', 12) + ' 上传中...';
            btn.disabled = true;
            try {
                var allStickers = await wsGetAllStickers();
                var uploaded = 0, failed = 0;
                for (var si = 0; si < allStickers.length; si++) {
                    try {
                        if (!allStickers[si].imageData) continue;
                        await wsCloudUploadSticker(allStickers[si]);
                        uploaded++;
                    } catch (e) { failed++; }
                }
                wsToastOk('上传完成: ' + uploaded + ' 成功' + (failed > 0 ? ', ' + failed + ' 失败' : '') + '（等待审核）');
                btn.innerHTML = wsIcon('checkCircle', 12) + ' 完成';
            } catch (err) {
                wsToastErr('批量上传失败: ' + err.message);
                btn.innerHTML = wsIcon('cloudUp', 12) + ' 全部上传';
                btn.disabled = false;
            }
        } else if (action === 'sticker-cloud-download' && id) {
            try {
                btn.innerHTML = wsIcon('loader', 10);
                btn.disabled = true;
                var r2key = btn.getAttribute('data-r2key') || '';
                var sName = btn.getAttribute('data-name') || 'sticker';
                var sDesc = btn.getAttribute('data-desc') || '';
                await wsCloudDownloadSticker({ id: id, r2Key: r2key, name: sName, description: sDesc });
                wsToastOk('已下载到本地');
                btn.innerHTML = wsIcon('checkCircle', 10);
            } catch (err) {
                wsToastErr('下载失败: ' + err.message);
                btn.innerHTML = wsIcon('download', 10);
                btn.disabled = false;
            }
        }
    });

    // 导入面板事件委托
    importPanel.addEventListener('click', async function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.getAttribute('data-action');

        if (action === 'import-text') {
            const textarea = importPanel.querySelector('#ws-import-textarea');
            const text = textarea ? textarea.value.trim() : '';
            if (!text) { wsToast('请输入内容'); return; }
            const result = await wsImportAll(text);
            if (result) {
                const total = Object.values(result).reduce(function(a, b) { return a + b; }, 0);
                wsToastOk('导入成功: ' + total + ' 项');
                importPanel.classList.remove('active');
                wsRenderTabContent(targetDoc);
            } else { wsToastErr('导入失败，请检查JSON格式'); }
        } else if (action === 'import-file') {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.json';
            input.onchange = async function() {
                const file = input.files[0];
                if (!file) return;
                const text = await file.text();
                const result = await wsImportAll(text);
                if (result) {
                    const total = Object.values(result).reduce(function(a, b) { return a + b; }, 0);
                    wsToastOk('导入成功: ' + total + ' 项');
                    importPanel.classList.remove('active');
                    wsRenderTabContent(targetDoc);
                } else { wsToastErr('导入失败'); }
            };
            input.click();
        } else if (action === 'cancel') {
            importPanel.classList.remove('active');
        } else if (action === 'save-sticker-add') {
            var sName = (importPanel.querySelector('#ws-sticker-name') || {}).value || '';
            var sDesc = (importPanel.querySelector('#ws-sticker-desc') || {}).value || '';
            var sData = importPanel._pendingStickerData;
            if (!sName.trim()) { wsToastWarn('请输入表情包名称'); return; }
            if (!sData) { wsToastErr('图片数据丢失'); return; }
            await wsSaveSticker({ name: sName.trim(), description: sDesc.trim(), imageData: sData });
            importPanel._pendingStickerData = null;
            importPanel.classList.remove('active');
            wsToastOk('已添加表情包');
            wsRenderTabContent(targetDoc);
        } else if (action === 'save-sticker-edit') {
            var editId = btn.getAttribute('data-id');
            var eName = (importPanel.querySelector('#ws-sticker-name') || {}).value || '';
            var eDesc = (importPanel.querySelector('#ws-sticker-desc') || {}).value || '';
            if (!eName.trim()) { wsToastWarn('请输入表情包名称'); return; }
            var allS = await wsGetAllStickers();
            var target = allS.find(function(x) { return x.id === editId; });
            if (!target) { wsToastErr('未找到表情包'); return; }
            target.name = eName.trim();
            target.description = eDesc.trim();
            await wsSaveSticker(target);
            importPanel.classList.remove('active');
            wsToastOk('已更新表情包信息');
            wsRenderTabContent(targetDoc);
        } else if (action === 'confirm-recruit' && btn.getAttribute('data-id')) {
            var recruitId = btn.getAttribute('data-id');
            var selectedCard = importPanel.querySelector('.ws-room-card.ws-room-selected');
            if (!selectedCard) { wsToastWarn('请选择目标卧室'); return; }
            var targetRoom = selectedCard.getAttribute('data-room');
            var charItem = (await wsGetAllContent()).character?.find(function(c) { return c.id === recruitId; });
            if (!charItem) { wsToastErr('未找到角色数据'); return; }
            btn.innerHTML = wsIcon('loader', 12) + ' 招募中...'; btn.disabled = true;
            try {
                var ok = await wsRecruitCharacter(charItem, targetRoom);
                if (ok) {
                    wsToastOk('「' + (charItem.data?.displayName || charItem.name) + '」已发送入住指令');
                    importPanel.classList.remove('active');
                } else { wsToastErr('招募失败'); btn.innerHTML = wsIcon('user-plus', 12) + ' 确认招募'; btn.disabled = false; }
            } catch (err) { wsToastErr('招募失败: ' + err.message); btn.innerHTML = wsIcon('user-plus', 12) + ' 确认招募'; btn.disabled = false; }
        } else if (action === 'confirm-install' && btn.getAttribute('data-id')) {
            var installId = btn.getAttribute('data-id');
            var floorSelect = importPanel.querySelector('#ws-install-floor');
            var startInput = importPanel.querySelector('#ws-install-start');
            var sizeInput = importPanel.querySelector('#ws-install-size');
            var typeSelect = importPanel.querySelector('#ws-install-type');
            if (!floorSelect || !floorSelect.value) { wsToastWarn('请选择楼层'); return; }
            var floor = floorSelect.value;
            var startPos = parseInt(startInput?.value) || 1;
            var size = parseInt(sizeInput?.value) || 2;
            var roomType = typeSelect?.value || '功能性房间';
            if (startPos < 1 || startPos > 10) { wsToastWarn('起始格子需在1-10之间'); return; }
            if (startPos + size - 1 > 10) { wsToastWarn('房间超出楼层范围（最大10格）'); return; }
            var occupied = wsGetOccupiedSlots(floor);
            for (var gi = startPos; gi < startPos + size; gi++) {
                if (occupied.indexOf(gi) >= 0) { wsToastWarn('格子 ' + gi + ' 已被占用'); return; }
            }
            var roomItem = (await wsGetAllContent()).room?.find(function(c) { return c.id === installId; });
            if (!roomItem) { wsToastErr('未找到房间数据'); return; }
            btn.innerHTML = wsIcon('loader', 12) + ' 安装中...'; btn.disabled = true;
            try {
                var ok = await wsInstallRoom(roomItem, floor, startPos, size, roomType);
                if (ok) {
                    wsToastOk('「' + (roomItem.data?.displayName || roomItem.name) + '」已发送安装指令');
                    importPanel.classList.remove('active');
                } else { wsToastErr('安装失败'); btn.innerHTML = wsIcon('hammer', 12) + ' 确认安装'; btn.disabled = false; }
            } catch (err) { wsToastErr('安装失败: ' + err.message); btn.innerHTML = wsIcon('hammer', 12) + ' 确认安装'; btn.disabled = false; }
        } else if (action === 'confirm-apply-world' && btn.getAttribute('data-id')) {
            var worldId = btn.getAttribute('data-id');
            var worldItem = (await wsGetAllContent()).world?.find(function(c) { return c.id === worldId; });
            if (!worldItem) { wsToastErr('未找到世界观数据'); return; }
            btn.innerHTML = wsIcon('loader', 12) + ' 应用中...'; btn.disabled = true;
            try {
                var result = await wsApplyWorldView(worldItem);
                if (result && (result.lore || result.greeting)) {
                    var parts = [];
                    if (result.lore) parts.push('世界观ChatLore');
                    if (result.greeting) parts.push('第0楼开场白');
                    wsToastOk('「' + (worldItem.data?.displayName || worldItem.name) + '」已应用: ' + parts.join(' + '));
                    importPanel.classList.remove('active');
                } else { wsToastErr('该世界观无可应用内容'); btn.innerHTML = wsIcon('globe', 12) + ' 确认应用'; btn.disabled = false; }
            } catch (err) { wsToastErr('应用失败: ' + err.message); btn.innerHTML = wsIcon('globe', 12) + ' 确认应用'; btn.disabled = false; }
        } else if (action === 'quick-create') {
            wsShowCreateForm(targetDoc, btn.getAttribute('data-type'));
        } else if (action === 'save-create') {
            wsSaveCreateForm(targetDoc, btn.getAttribute('data-type'));
        } else if (action === 'cancel-create') {
            wsShowImportPanel(targetDoc);
        }
    });

    // 预设面板事件委托
    presetPanel.addEventListener('click', async function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const name = btn.getAttribute('data-name');

        if (action === 'close-preset') {
            presetPanel.classList.remove('active');
        } else if (action === 'save-preset') {
            const nameInput = presetPanel.querySelector('#ws-new-preset-name');
            const presetName = nameInput ? nameInput.value.trim() : '';
            if (!presetName) { wsToast('请输入预设名称'); return; }
            const items = [];
            presetPanel.querySelectorAll('.ws-preset-cb:checked').forEach(function(cb) {
                items.push({ type: cb.getAttribute('data-type'), id: cb.getAttribute('data-id') });
            });
            if (items.length === 0) { wsToastWarn('请选择至少一项内容'); return; }
            wsUpsertPreset({ name: presetName, items: items, createdAt: new Date().toISOString() });
            wsToastOk('预设"' + presetName + '"已保存 (' + items.length + '项)');
            await wsShowPresetPanel(targetDoc);
        } else if (action === 'apply-preset' && name) {
            const result = await wsApplyPreset(name);
            var msg = '预设"' + name + '"已应用 ' + result.lore + ' 项ChatLore';
            if (result.world) msg += ' + 世界观已注入当前聊天';
            wsToastOk(msg);
        } else if (action === 'delete-preset' && name) {
            wsDeletePreset(name);
            wsToastOk('预设"' + name + '"已删除');
            await wsShowPresetPanel(targetDoc);
        } else if (action === 'apply-default-worldview') {
            btn.innerHTML = wsIcon('loader', 12) + ' 注入中...'; btn.disabled = true;
            try {
                await wsApplyDefaultWorldView();
                wsToastOk('原汁原味世界观已注入到当前聊天，新聊天将自动生效');
                await wsShowPresetPanel(targetDoc);
            } catch (err) { wsToastErr('注入失败: ' + err.message); btn.innerHTML = wsIcon('home', 12) + ' 原汁原味'; btn.disabled = false; }
        } else if (action === 'clear-active-worldview') {
            wsClearActiveWorldView();
            wsToastOk('已清除活跃世界观，新聊天将不再自动注入');
            await wsShowPresetPanel(targetDoc);
        }
    });

    // 初始渲染
    wsRenderTabContent(targetDoc);
}

// ============ 内容渲染 ============
async function wsRenderTabContent(targetDoc) {
    var body = targetDoc.getElementById('ws-content');
    var footerInfo = targetDoc.getElementById('ws-footer-info');
    if (!body) return;

    // 云端模式
    if (wsViewMode === 'cloud') {
        await wsRenderCloudContent(body, footerInfo);
        return;
    }

    // 本地模式
    if (wsCurrentTab === 'sticker') {
        var stickers = await wsGetAllStickers();
        var canUploadSticker = wsIsCloudEnabled() && wsIsLoggedIn();
        if (stickers.length === 0) {
            body.innerHTML = '<div class="ws-empty"><div style="margin-bottom:12px;">' + wsIcon('smile', 48) + '</div><div style="font-size:14px;">还没有表情包</div><div style="margin-top:12px;"><button class="ws-btn ws-btn-pink" data-action="add-sticker">' + wsIcon('plus', 13) + ' 添加表情包</button></div></div>';
        } else {
            var grid = '';
            for (var i = 0; i < stickers.length; i++) {
                var s = stickers[i];
                grid += '<div class="ws-sticker-item" data-sticker-id="' + s.id + '">'
                    + '<img src="' + (s.imageData || '') + '" alt="' + wsEscapeHtml(s.name || '') + '">'
                    + '</div>';
            }
            body.innerHTML = '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">'
                + '<button class="ws-btn ws-btn-pink" data-action="add-sticker">' + wsIcon('plus', 13) + ' 添加</button>'
                + '<button class="ws-btn ws-btn-gray" data-action="export-sticker">' + wsIcon('upload', 13) + ' 导出</button>'
                + (canUploadSticker ? '<button class="ws-btn ws-btn-blue" data-action="sticker-cloud-upload-all">' + wsIcon('cloudUp', 13) + ' 全部上传</button>' : '')
                + '</div><div class="ws-sticker-grid">' + grid + '</div>';
        }
        if (footerInfo) footerInfo.textContent = '表情包 · ' + stickers.length + ' 张';
        return;
    }

    var contents = await wsGetAllContent();
    var items = contents[wsCurrentTab] || [];
    var canUpload = wsIsCloudEnabled() && wsIsLoggedIn();

    if (items.length === 0) {
        body.innerHTML = '<div class="ws-empty"><div style="margin-bottom:12px;">' + wsTypeIcon(wsCurrentTab) + '</div><div style="font-size:14px;">还没有' + wsTypeLabel(wsCurrentTab) + '内容</div><div style="margin-top:8px;font-size:12px;color:#9CA3AF;">点击“新建”创建或“导入”添加内容</div></div>';
    } else {
        var html = '';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var previewId = 'ws-preview-' + item.id;
            html += '<div class="ws-card">'
                + '<div class="ws-card-header" style="cursor:pointer;" onclick="var p=this.parentNode.querySelector(\'.ws-card-preview\');if(p){p.style.display=p.style.display===\'none\'?\'block\':\'none\';}">'
                + '<span class="ws-card-name">' + wsTypeIcon(wsCurrentTab) + ' ' + wsEscapeHtml(wsGetItemName(item)) + '</span>'
                + '<span class="ws-card-type">' + wsTypeLabel(wsCurrentTab) + (item.author ? ' · by ' + wsEscapeHtml(item.author) : '') + ' ' + wsIcon('arrowDown', 10) + '</span></div>'
                + '<div class="ws-card-body">' + wsEscapeHtml(wsGetItemSummary(wsCurrentTab, item)) + '</div>'
                + '<div class="ws-card-preview" style="display:none;padding:8px 10px;border-top:1px solid #F3F4F6;background:#FAFAFA;border-radius:0 0 10px 10px;">' + wsGetItemPreview(wsCurrentTab, item) + '</div>'
                + '<div class="ws-card-actions">'
                + (wsCurrentTab === 'world'
                    ? '<button class="ws-btn ws-btn-pink" data-action="apply-world" data-id="' + item.id + '">' + wsIcon('globe', 12) + ' 应用世界观</button>'
                      + '<button class="ws-btn ws-btn-gray" data-action="clear-world">' + wsIcon('x-circle', 12) + ' 清除世界观</button>'
                    : '')
                + (wsCurrentTab === 'character' ? '<button class="ws-btn ws-btn-green" data-action="apply" data-id="' + item.id + '" data-type="character">' + wsIcon('zap', 12) + ' 写入ChatLore</button>' : '')
                + (wsCurrentTab === 'character' ? '<button class="ws-btn ws-btn-pink" data-action="recruit" data-id="' + item.id + '">' + wsIcon('user-plus', 12) + ' 招募入住</button>' : '')
                + (wsCurrentTab === 'room' ? '<button class="ws-btn ws-btn-pink" data-action="install-room" data-id="' + item.id + '">' + wsIcon('hammer', 12) + ' 安装到公寓</button>' : '')
                + (canUpload ? '<button class="ws-btn ws-btn-blue" data-action="cloud-upload" data-id="' + item.id + '" data-type="' + wsCurrentTab + '">' + wsIcon('cloudUp', 12) + ' 上传</button>' : '')
                + '<button class="ws-btn ws-btn-red" data-action="delete" data-id="' + item.id + '" data-type="' + wsCurrentTab + '">' + wsIcon('trash', 12) + ' 删除</button>'
                + '</div></div>';
        }
        body.innerHTML = html;
    }
    if (footerInfo) footerInfo.innerHTML = wsIcon('folder', 12) + ' ' + wsTypeLabel(wsCurrentTab) + ' · ' + items.length + ' 项';
}

// 云端内容渲染
async function wsRenderCloudContent(body, footerInfo) {
    body.innerHTML = '<div class="ws-empty"><div style="margin-bottom:8px;">' + wsIcon('loader', 32) + '</div><div style="font-size:14px;">加载中...</div></div>';
    if (footerInfo) footerInfo.innerHTML = wsIcon('cloud', 12) + ' 云端浏览';

    // 表情包Tab使用专用渲染
    if (wsCurrentTab === 'sticker') {
        await wsRenderCloudStickers(body, footerInfo);
        return;
    }

    try {
        var result = await wsCloudList(wsCurrentTab, wsCloudCurrentPage, 'newest');
        var items = result.items || [];
        var pagination = result.pagination || {};

        if (items.length === 0) {
            body.innerHTML = '<div class="ws-empty"><div style="margin-bottom:12px;">' + wsIcon('cloud', 48) + '</div><div style="font-size:14px;">云端还没有' + wsTypeLabel(wsCurrentTab) + '内容</div><div style="margin-top:8px;font-size:12px;color:#9CA3AF;">登录后可以上传你的创作</div></div>';
            return;
        }

        var html = '<div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;">'
            + '<input class="ws-input" id="ws-cloud-search" placeholder="搜索..." style="flex:1;padding:6px 10px;">'
            + '<button class="ws-btn ws-btn-pink" data-action="cloud-search">搜索</button></div>';

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            html += '<div class="ws-card">'
                + '<div class="ws-card-header"><span class="ws-card-name">' + wsTypeIcon(wsCurrentTab) + ' ' + wsEscapeHtml(item.name || item.id) + '</span>'
                + '<span class="ws-card-type">by ' + wsEscapeHtml(item.author || '匿名') + ' · ' + wsIcon('download', 10) + ' ' + (item.downloads || 0) + '</span></div>'
                + '<div class="ws-card-body">' + (item.tags || []).map(function(t) { return '<span style="background:#FFF1F2;color:#E68A96;padding:1px 6px;border-radius:8px;font-size:11px;margin-right:4px;">' + wsEscapeHtml(t) + '</span>'; }).join('') + '</div>'
                + '<div class="ws-card-preview" id="ws-cloud-preview-' + item.id + '" style="display:none;padding:8px 10px;border-top:1px solid #F3F4F6;background:#FAFAFA;border-radius:0 0 10px 10px;"></div>'
                + '<div class="ws-card-actions">'
                + '<button class="ws-btn ws-btn-gray" data-action="cloud-preview" data-id="' + item.id + '" data-type="' + wsCurrentTab + '">' + wsIcon('eye', 12) + ' 预览</button>'
                + '<button class="ws-btn ws-btn-green" data-action="cloud-download" data-id="' + item.id + '" data-type="' + wsCurrentTab + '">' + wsIcon('download', 12) + ' 下载到本地</button>'
                + '</div></div>';
        }

        if (pagination.totalPages > 1) {
            html += '<div style="text-align:center;padding:12px;display:flex;justify-content:center;align-items:center;gap:8px;">';
            if (pagination.page > 1) {
                html += '<button class="ws-btn ws-btn-gray" data-action="cloud-page" data-page="' + (pagination.page - 1) + '">' + wsIcon('arrowLeft', 12) + ' 上一页</button>';
            }
            html += '<span style="font-size:12px;color:#9CA3AF;">第 ' + pagination.page + '/' + pagination.totalPages + ' 页 · 共 ' + pagination.total + ' 项</span>';
            if (pagination.page < pagination.totalPages) {
                html += '<button class="ws-btn ws-btn-gray" data-action="cloud-page" data-page="' + (pagination.page + 1) + '">下一页 ' + wsIcon('arrowRight', 12) + '</button>';
            }
            html += '</div>';
        }

        body.innerHTML = html;

        // 搜索框支持Enter键
        var searchEl = body.querySelector('#ws-cloud-search');
        if (searchEl) {
            searchEl.addEventListener('keydown', function(ev) {
                if (ev.key === 'Enter') {
                    var searchBtn = body.querySelector('[data-action="cloud-search"]');
                    if (searchBtn) searchBtn.click();
                }
            });
        }

        if (footerInfo) footerInfo.innerHTML = wsIcon('cloud', 12) + ' ' + wsTypeLabel(wsCurrentTab) + ' · ' + pagination.total + ' 项';

    } catch (err) {
        var errMsg = err.message || '';
        var hint = '请检查API地址和网络连接';
        if (errMsg.includes('Unauthorized') || errMsg.includes('401')) { hint = '请先登录Discord'; }
        else if (errMsg.includes('Forbidden') || errMsg.includes('403')) { hint = '你没有权限访问此内容'; }
        else if (errMsg.includes('Token') || errMsg.includes('token')) { hint = '登录已过期，请重新登录'; }
        body.innerHTML = '<div class="ws-empty"><div style="margin-bottom:12px;">' + wsIcon('xCircle', 48) + '</div><div style="font-size:14px;color:#EF4444;">' + wsEscapeHtml(errMsg) + '</div><div style="margin-top:8px;font-size:12px;color:#9CA3AF;">' + wsEscapeHtml(hint) + '</div></div>';
    }
}

// ============ 云端表情包渲染（Phase 3） ============
async function wsRenderCloudStickers(body, footerInfo) {
    try {
        var result = await wsCloudStickerList(wsCloudCurrentPage, 'newest');
        var items = result.items || [];
        var pagination = result.pagination || {};

        if (items.length === 0) {
            body.innerHTML = '<div class="ws-empty"><div style="margin-bottom:12px;">' + wsIcon('cloud', 48) + '</div><div style="font-size:14px;">云端还没有表情包</div><div style="margin-top:8px;font-size:12px;color:#9CA3AF;">登录后可以上传你的表情包</div></div>';
            if (footerInfo) footerInfo.innerHTML = wsIcon('cloud', 12) + ' 表情包 · 0 张';
            return;
        }

        var html = '<div class="ws-sticker-grid">';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var imgSrc = WS_API_BASE + (item.imageUrl || '/api/sticker/image/' + (item.r2Key || item.id));
            html += '<div class="ws-sticker-item ws-cloud-sticker" data-sticker-id="' + item.id + '">'
                + '<img src="' + imgSrc + '" alt="' + wsEscapeHtml(item.name || '') + '" loading="lazy">'
                + '<div class="ws-sticker-overlay">'
                + '<button class="ws-sticker-dl" data-action="sticker-cloud-download" data-id="' + item.id + '" data-r2key="' + (item.r2Key || '') + '" data-name="' + wsEscapeHtml(item.name || '') + '" data-desc="' + wsEscapeHtml(item.description || '') + '" title="下载到本地">' + wsIcon('download', 11) + '</button>'
                + '</div>'
                + '<div class="ws-sticker-info">' + wsEscapeHtml(item.name || '') + (item.description ? '<br><span style="font-size:10px;color:#9CA3AF;">' + wsEscapeHtml(item.description) + '</span>' : '') + '</div>'
                + '</div>';
        }
        html += '</div>';

        if (pagination.totalPages > 1) {
            html += '<div style="text-align:center;padding:12px;display:flex;justify-content:center;align-items:center;gap:8px;">';
            if (pagination.page > 1) {
                html += '<button class="ws-btn ws-btn-gray" data-action="cloud-page" data-page="' + (pagination.page - 1) + '">' + wsIcon('arrowLeft', 12) + ' 上一页</button>';
            }
            html += '<span style="font-size:12px;color:#9CA3AF;">第 ' + pagination.page + '/' + pagination.totalPages + ' 页 · 共 ' + pagination.total + ' 张</span>';
            if (pagination.page < pagination.totalPages) {
                html += '<button class="ws-btn ws-btn-gray" data-action="cloud-page" data-page="' + (pagination.page + 1) + '">下一页 ' + wsIcon('arrowRight', 12) + '</button>';
            }
            html += '</div>';
        }

        body.innerHTML = html;
        if (footerInfo) footerInfo.innerHTML = wsIcon('cloud', 12) + ' 表情包 · ' + pagination.total + ' 张';

    } catch (err) {
        var errMsg = err.message || '';
        var hint = '请检查API地址和网络连接';
        if (errMsg.includes('Unauthorized') || errMsg.includes('401')) { hint = '请先登录Discord'; }
        else if (errMsg.includes('Forbidden') || errMsg.includes('403')) { hint = '你没有权限访问此内容'; }
        else if (errMsg.includes('Token') || errMsg.includes('token')) { hint = '登录已过期，请重新登录'; }
        body.innerHTML = '<div class="ws-empty"><div style="margin-bottom:12px;">' + wsIcon('xCircle', 48) + '</div><div style="font-size:14px;color:#EF4444;">' + wsEscapeHtml(errMsg) + '</div><div style="margin-top:8px;font-size:12px;color:#9CA3AF;">' + wsEscapeHtml(hint) + '</div></div>';
    }
}

// ============ 添加表情包 ============
function wsAddStickerFromFile(targetDoc) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*,.gif'; input.multiple = true;
    input.onchange = async function() {
        var files = Array.from(input.files);
        if (files.length === 0) return;
        // 单文件：弹出名称+描述对话框
        if (files.length === 1) {
            var f = files[0];
            try {
                var imageData = await wsCompressImage(f);
                if (f.type === 'image/gif' && f.size > 500 * 1024) {
                    wsToastWarn('此GIF较大(' + Math.round(f.size/1024) + 'KB)，上传云端可能超出500KB限制，建议压缩后再上传');
                }
                wsShowStickerAddDialog(targetDoc, imageData, f.name.replace(/\.[^.]+$/, ''));
            } catch (e) { wsToastErr('图片处理失败'); }
            return;
        }
        // 多文件：直接添加，之后可单独编辑
        var count = 0, skipped = 0;
        for (var i = 0; i < files.length; i++) {
            try {
                var imageData = await wsCompressImage(files[i]);
                await wsSaveSticker({ name: files[i].name.replace(/\.[^.]+$/, ''), imageData: imageData, description: '' });
                count++;
            } catch (e) { skipped++; console.error('[创意工坊] 压缩失败:', e); }
        }
        wsToastOk('已添加 ' + count + ' 张表情包' + (skipped > 0 ? '（' + skipped + ' 张失败）' : ''));
        wsRenderTabContent(targetDoc);
    };
    input.click();
}

// 单张表情包添加对话框（带名称+描述）
function wsShowStickerAddDialog(targetDoc, imageData, defaultName) {
    var panel = targetDoc.getElementById('ws-import-panel');
    panel.innerHTML = '<h3 style="color:#831843;margin:0 0 12px;display:flex;align-items:center;gap:6px;">' + wsIcon('smile', 18) + ' 添加表情包</h3>'
        + '<div style="text-align:center;margin-bottom:12px;"><img src="' + imageData + '" style="max-width:128px;max-height:128px;border-radius:8px;border:2px solid #FCE7F3;"></div>'
        + '<input class="ws-input" id="ws-sticker-name" value="' + wsEscapeHtml(defaultName) + '" placeholder="表情包名称" style="margin-bottom:8px;">'
        + '<input class="ws-input" id="ws-sticker-desc" placeholder="描述（用于AI识别，如：开心的笑脸）" style="margin-bottom:12px;">'
        + '<div style="display:flex;gap:8px;justify-content:center;">'
        + '<button class="ws-btn ws-btn-green" data-action="save-sticker-add">' + wsIcon('save', 12) + ' 保存</button>'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel">取消</button></div>';
    panel.classList.add('active');
    wsForceInputStyles(panel);
    // 存储imageData到临时变量
    panel._pendingStickerData = imageData;
}

// 编辑已有表情包的名称和描述
async function wsShowStickerEditDialog(targetDoc, stickerId) {
    var stickers = await wsGetAllStickers();
    var s = stickers.find(function(x) { return x.id === stickerId; });
    if (!s) { wsToastErr('未找到表情包'); return; }
    var panel = targetDoc.getElementById('ws-import-panel');
    panel.innerHTML = '<h3 style="color:#831843;margin:0 0 12px;display:flex;align-items:center;gap:6px;">' + wsIcon('edit', 18) + ' 编辑表情包</h3>'
        + '<div style="text-align:center;margin-bottom:12px;"><img src="' + (s.imageData || '') + '" style="max-width:128px;max-height:128px;border-radius:8px;border:2px solid #FCE7F3;"></div>'
        + '<input class="ws-input" id="ws-sticker-name" value="' + wsEscapeHtml(s.name || '') + '" placeholder="表情包名称" style="margin-bottom:8px;">'
        + '<input class="ws-input" id="ws-sticker-desc" value="' + wsEscapeHtml(s.description || '') + '" placeholder="描述（用于AI识别，如：开心的笑脸）" style="margin-bottom:12px;">'
        + '<div style="display:flex;gap:8px;justify-content:center;">'
        + '<button class="ws-btn ws-btn-green" data-action="save-sticker-edit" data-id="' + s.id + '">' + wsIcon('save', 12) + ' 保存</button>'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel">取消</button></div>';
    panel.classList.add('active');
    wsForceInputStyles(panel);
}

// ============ 导入面板 ============
function wsShowImportPanel(targetDoc) {
    var panel = targetDoc.getElementById('ws-import-panel');
    panel.innerHTML = '<h3 style="color:#831843;margin:0 0 12px;display:flex;align-items:center;gap:6px;">' + wsIcon('download', 18) + ' 导入内容</h3>'
        + '<div style="text-align:center;padding:16px 0;">'
        + '<button class="ws-btn ws-btn-pink" data-action="import-file" style="padding:10px 24px;font-size:14px;">' + wsIcon('folder', 14) + ' 选择文件导入</button>'
        + '<div style="font-size:12px;color:#9CA3AF;margin-top:8px;">支持"导出全部"生成的 .json 文件</div>'
        + '</div>'
        + '<div style="border-top:1px solid #eee;padding-top:12px;margin-top:4px;">'
        + '<div style="font-size:12px;color:#6B7280;margin-bottom:6px;font-weight:600;">JSON文本粘贴</div>'
        + '<textarea id="ws-import-textarea" class="ws-input" style="min-height:100px;resize:vertical;font-family:monospace;font-size:11px;" placeholder="粘贴JSON内容..."></textarea>'
        + '<div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel">取消</button>'
        + '<button class="ws-btn ws-btn-pink" data-action="import-text">' + wsIcon('clipboard', 12) + ' 导入</button>'
        + '</div></div>';
    panel.classList.add('active');
    wsForceInputStyles(panel);
}

// ============ 快速创建表单 ============
function wsShowCreateForm(targetDoc, type) {
    var panel = targetDoc.getElementById('ws-import-panel');
    var fields = '';
    if (type === 'character') {
        fields = '<input class="ws-input" id="ws-f-displayName" placeholder="角色名" style="margin-bottom:8px;padding:8px 10px;">'
            + '<div style="display:flex;gap:8px;margin-bottom:8px;"><input class="ws-input" id="ws-f-gender" placeholder="性别" style="flex:1;padding:8px 10px;"><input class="ws-input" id="ws-f-age" placeholder="年龄" style="flex:1;padding:8px 10px;"></div>'
            + '<input class="ws-input" id="ws-f-profession" placeholder="职业" style="margin-bottom:8px;padding:8px 10px;">'
            + '<textarea class="ws-input" id="ws-f-personality" placeholder="性格特点" style="margin-bottom:8px;min-height:50px;resize:vertical;padding:8px 10px;"></textarea>'
            + '<textarea class="ws-input" id="ws-f-appearance" placeholder="外貌描述" style="margin-bottom:8px;min-height:50px;resize:vertical;padding:8px 10px;"></textarea>'
            + '<textarea class="ws-input" id="ws-f-background" placeholder="背景故事" style="margin-bottom:8px;min-height:60px;resize:vertical;padding:8px 10px;"></textarea>'
            + '<textarea class="ws-input" id="ws-f-quirks" placeholder="爱好与习惯（如: 喜欢甜食、有洁癖、喜欢猫）" style="margin-bottom:8px;min-height:45px;resize:vertical;padding:8px 10px;"></textarea>'
            + '<textarea class="ws-input" id="ws-f-dialogueStyle" placeholder="说话风格（如: 温柔有礼、毒舌、元气满满）" style="margin-bottom:8px;min-height:45px;resize:vertical;padding:8px 10px;"></textarea>';
    } else if (type === 'room') {
        fields = '<input class="ws-input" id="ws-f-displayName" placeholder="房间名称" style="margin-bottom:8px;padding:8px 10px;">'
            + '<select class="ws-input" id="ws-f-roomType" style="margin-bottom:8px;padding:8px 10px;"><option value="卧室">卧室</option><option value="功能性房间">功能性房间</option></select>'
            + '<textarea class="ws-input" id="ws-f-description" placeholder="房间描述" style="margin-bottom:8px;min-height:60px;resize:vertical;padding:8px 10px;"></textarea>';
    } else if (type === 'world') {
        fields = '<div style="font-size:12px;color:#831843;font-weight:600;margin-bottom:4px;">— 基本信息 —</div>'
            + '<input class="ws-input" id="ws-f-displayName" placeholder="世界名（必填）" style="margin-bottom:8px;">'
            + '<input class="ws-input" id="ws-f-era" placeholder="时代（如：近未来/中世纪/现代）" style="margin-bottom:8px;">'
            + '<textarea class="ws-input" id="ws-f-description" placeholder="世界描述" style="margin-bottom:8px;min-height:50px;resize:vertical;"></textarea>'
            + '<textarea class="ws-input" id="ws-f-rules" placeholder="世界核心规则" style="margin-bottom:8px;min-height:50px;resize:vertical;"></textarea>'
            + '<input class="ws-input" id="ws-f-atmosphere" placeholder="氛围（如：阴暗、压抑、霓虹）" style="margin-bottom:8px;">'
            + '<div style="display:flex;gap:8px;margin-bottom:8px;"><input class="ws-input" id="ws-f-buildingType" placeholder="建筑类型" style="flex:1;"><input class="ws-input" id="ws-f-floors" placeholder="楼层数" type="number" style="flex:1;"></div>'
            + '<input class="ws-input" id="ws-f-specialTerms" placeholder="特殊术语（逗号分隔）" style="margin-bottom:8px;">'
            + '<div style="font-size:12px;color:#831843;font-weight:600;margin:8px 0 4px;">— ChatLore 世界观（可选） —</div>'
            + '<textarea class="ws-input" id="ws-f-worldLoreContent" placeholder="完整的世界观ChatLore内容（替代WorldBook的世界观设定条目）\n留空则使用基本信息自动生成" style="margin-bottom:8px;min-height:80px;resize:vertical;"></textarea>'
            + '<div style="display:flex;gap:8px;margin-bottom:8px;">'
            + '<select class="ws-input" id="ws-f-lorePosition" style="flex:2;" onchange="var dw=this.parentNode.nextElementSibling;if(dw&&dw.id===\'ws-f-depth-wrap\')dw.style.display=this.value===\'at_depth\'?\'flex\':\'none\';">' 
            + '<option value="at_depth">深度插入 (D)</option>'
            + '<option value="before_character_definition">角色定义之前</option>'
            + '<option value="after_character_definition">角色定义之后</option>'
            + '<option value="before_example_messages">示例消息之前</option>'
            + '<option value="after_example_messages">示例消息之后</option>'
            + '<option value="before_author_note">作者注释之前</option>'
            + '<option value="after_author_note">作者注释之后</option>'
            + '</select>'
            + '<input class="ws-input" id="ws-f-loreOrder" placeholder="排序(默认90)" type="number" style="flex:1;"></div>'
            + '<div id="ws-f-depth-wrap" style="display:flex;gap:8px;margin-bottom:8px;">'
            + '<input class="ws-input" id="ws-f-loreDepth" placeholder="深度(默认4)" type="number" style="flex:1;">'
            + '<select class="ws-input" id="ws-f-loreRole" style="flex:1;"><option value="system">system</option><option value="assistant">assistant</option><option value="user">user</option></select>'
            + '</div>'
            + '<div style="font-size:12px;color:#831843;font-weight:600;margin:8px 0 4px;">— 绑定开场白（可选） —</div>'
            + '<textarea class="ws-input" id="ws-f-greeting" placeholder="开场白文本（应包含<UpdateVariable>块来设置初始变量）\n留空则不绑定开场白" style="margin-bottom:8px;min-height:100px;resize:vertical;font-family:monospace;font-size:12px;"></textarea>';
    }
    panel.innerHTML = '<h3 style="color:#831843;margin:0 0 12px;display:flex;align-items:center;gap:6px;">' + wsTypeIcon(type) + ' 创建' + wsTypeLabel(type) + '</h3>'
        + fields
        + '<div style="display:flex;gap:8px;margin-top:12px;">'
        + '<button class="ws-btn ws-btn-green" data-action="save-create" data-type="' + type + '">' + wsIcon('save', 12) + ' 保存</button>'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel-create">取消</button></div>';
    panel.classList.add('active');
    wsForceInputStyles(panel);
}

async function wsSaveCreateForm(targetDoc, type) {
    var panel = targetDoc.getElementById('ws-import-panel');
    var data = {};
    var fieldIds = ['displayName','gender','age','personality','appearance','profession','background','quirks','dialogueStyle','description','roomType','era','rules','atmosphere','buildingType','floors','specialTerms','worldLoreContent','greeting'];
    for (var i = 0; i < fieldIds.length; i++) {
        var el = panel.querySelector('#ws-f-' + fieldIds[i]);
        if (el) {
            var val = (el.value || '').trim();
            if (!val) continue;
            if (fieldIds[i] === 'specialTerms') val = val.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
            if (fieldIds[i] === 'floors') val = parseInt(val) || 1;
            data[fieldIds[i]] = val;
        }
    }
    if (!data.displayName) { wsToast('请填写名称'); return; }
    // 处理世界观的loreConfig字段
    if (type === 'world') {
        var posEl = panel.querySelector('#ws-f-lorePosition');
        var depthEl = panel.querySelector('#ws-f-loreDepth');
        var orderEl = panel.querySelector('#ws-f-loreOrder');
        var roleEl = panel.querySelector('#ws-f-loreRole');
        var pos = posEl ? posEl.value : 'at_depth';
        var order = orderEl ? (parseInt(orderEl.value) || 90) : 90;
        var config = { position: pos, order: order };
        if (pos === 'at_depth') {
            config.depth = depthEl ? (parseInt(depthEl.value) || 4) : 4;
            config.role = roleEl ? roleEl.value : 'system';
        }
        if (data.worldLoreContent || pos !== 'at_depth' || order !== 90 || (config.depth && config.depth !== 4) || (config.role && config.role !== 'system')) {
            data.worldLoreConfig = config;
        }
    }
    var item = { type: type, name: data.displayName, data: data, createdAt: new Date().toISOString() };
    await wsAddContent(type, item);
    wsToastOk('"' + data.displayName + '" 已创建');
    panel.classList.remove('active');
    wsCurrentTab = type;
    // 更新tab高亮
    var tabs = targetDoc.querySelectorAll('.ws-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === type);
    }
    wsRenderTabContent(targetDoc);
}

// ============ 预设面板 ============
async function wsShowPresetPanel(targetDoc) {
    var panel = targetDoc.getElementById('ws-preset-panel');
    var presets = wsGetPresets();
    var contents = await wsGetAllContent();

    // 所有可选项
    var checkboxes = '';
    var types = ['character', 'room', 'world'];
    for (var t = 0; t < types.length; t++) {
        var arr = contents[types[t]] || [];
        for (var i = 0; i < arr.length; i++) {
            checkboxes += '<label class="ws-checkbox-item"><input type="checkbox" class="ws-preset-cb" data-type="' + types[t] + '" data-id="' + arr[i].id + '"><span>' + wsTypeIcon(types[t]) + ' ' + wsEscapeHtml(wsGetItemName(arr[i])) + '</span></label>';
        }
    }
    if (!checkboxes) checkboxes = '<div style="color:#9CA3AF;font-size:13px;padding:8px;">没有可用内容，请先导入</div>';

    // 已有预设
    var presetCards = '';
    for (var i = 0; i < presets.length; i++) {
        presetCards += '<div style="background:#FFF5F7;border:1px solid #FCE7F3;border-radius:10px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">'
            + '<div><div style="font-weight:600;color:#831843;font-size:14px;display:flex;align-items:center;gap:4px;">' + wsIcon('package', 14) + ' ' + wsEscapeHtml(presets[i].name) + '</div><div style="font-size:12px;color:#9CA3AF;">' + (presets[i].items ? presets[i].items.length : 0) + ' 项内容</div></div>'
            + '<div style="display:flex;gap:6px;">'
            + '<button class="ws-btn ws-btn-green" data-action="apply-preset" data-name="' + presets[i].name + '">' + wsIcon('zap', 12) + ' 应用</button>'
            + '<button class="ws-btn ws-btn-red" data-action="delete-preset" data-name="' + presets[i].name + '">' + wsIcon('trash', 12) + '</button></div></div>';
    }
    if (!presetCards) presetCards = '<div style="color:#9CA3AF;text-align:center;padding:20px;">还没有预设</div>';

    // 活跃世界观状态
    var activeWV = wsGetActiveWorldView();
    var activeStatus = activeWV
        ? (wsIcon('check-circle', 12) + ' <span style="color:#059669;">当前活跃: ' + wsEscapeHtml(activeWV.name) + '</span>')
        : (wsIcon('alert-circle', 12) + ' <span style="color:#D97706;">尚未设置活跃世界观</span>');

    var worldViewSection = '<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:14px;margin-bottom:14px;">'
        + '<div style="font-weight:700;color:#065F46;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">'
        + wsIcon('globe', 15) + ' 世界观快速设置</div>'
        + '<div style="display:flex;gap:8px;margin-bottom:8px;">'
        + '<button class="ws-btn ws-btn-green" data-action="apply-default-worldview" style="flex:1;">'
        + wsIcon('home', 12) + ' 原汁原味（默认世界观）</button>'
        + '<button class="ws-btn ws-btn-red" data-action="clear-active-worldview" style="padding:6px 10px;" title="清除活跃世界观">'
        + wsIcon('x', 12) + '</button></div>'
        + '<div style="font-size:11px;color:#6B7280;line-height:1.5;">'
        + '现代都市 · 落日与海湾别墅 · 注入后新聊天自动生效</div>'
        + '<div style="font-size:11px;margin-top:6px;">' + activeStatus + '</div>'
        + '</div>';

    panel.innerHTML = '<h3 style="color:#831843;margin:0 0 12px;display:flex;align-items:center;gap:6px;">' + wsIcon('package', 18) + ' 预设管理</h3>'
        + worldViewSection
        + '<div style="background:#F9FAFB;border:2px dashed #D1D5DB;border-radius:10px;padding:14px;margin-bottom:12px;">'
        + '<input class="ws-input" id="ws-new-preset-name" placeholder="新预设名称" style="margin-bottom:8px;">'
        + '<div style="max-height:200px;overflow-y:auto;padding:8px 0;">' + checkboxes + '</div>'
        + '<button class="ws-btn ws-btn-pink" data-action="save-preset" style="margin-top:8px;">' + wsIcon('save', 12) + ' 保存预设</button></div>'
        + presetCards
        + '<button class="ws-btn ws-btn-gray" data-action="close-preset" style="margin-top:12px;">关闭</button>';
    panel.classList.add('active');
}

// ============ 酒馆助手按钮 ============
function wsShowQuickApply() {
    // 直接打开创意工坊面板并切换到预设管理Tab
    var targetDoc = window.parent.document;
    var panel = targetDoc.getElementById('workshop-main-panel');
    var backdrop = targetDoc.getElementById('workshop-backdrop');
    if (!panel || !backdrop) {
        console.warn('[创意工坊] 面板未初始化');
        return;
    }

    // 自动检测暗色模式
    try {
        if (localStorage.getItem('apartment_theme') === 'dark') {
            targetDoc.body.classList.add('ws-dark');
        } else {
            targetDoc.body.classList.remove('ws-dark');
        }
    } catch(e) {}

    // 打开面板
    panel.classList.add('active');
    backdrop.classList.add('active');

    // 切换到预设管理Tab并打开预设面板
    var tabs = targetDoc.querySelectorAll('.ws-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    // 先渲染当前Tab内容
    wsRenderTabContent(targetDoc);
    // 然后自动打开预设面板（包含世界观快速设置）
    setTimeout(function() { wsShowPresetPanel(targetDoc); }, 100);
}

// ============ 入口 ============

// 页面加载后初始化
$(function() {
    console.log('[创意工坊] 脚本已加载');
    initializeWorkshopPlugin();
});

// 酒馆助手按钮
try {
    appendInexistentScriptButtons([{ name: '创意工坊', visible: true }]);
    eventOn(getButtonEvent('创意工坊'), wsShowQuickApply);
    console.log('[创意工坊] 酒馆助手按钮已创建');
} catch (e) {
    console.warn('[创意工坊] 按钮创建失败:', e);
}

// 脚本卸载清理
$(window).on('pagehide', cleanupWorkshopPlugin);
// ============ 表情包详情面板 ============
function wsGetOrCreateDetailPanel(targetDoc) {
    var mainPanel = targetDoc.querySelector('#workshop-main-panel');
    var detailPanel = mainPanel.querySelector('#ws-sticker-detail-panel');
    if (!detailPanel) {
        detailPanel = targetDoc.createElement('div');
        detailPanel.id = 'ws-sticker-detail-panel';
        detailPanel.className = 'ws-sub-panel';
        mainPanel.appendChild(detailPanel);
        // 在详情面板上绑定事件委托（因为它在contentBody之外）
        detailPanel.addEventListener('click', async function(e) {
            var btn = e.target.closest('button');
            if (!btn) return;
            var action = btn.getAttribute('data-action');
            var id = btn.getAttribute('data-id');
            if (action === 'cancel') {
                detailPanel.style.display = 'none';
            } else if (action === 'sticker-edit' && id) {
                detailPanel.style.display = 'none';
                wsShowStickerEditDialog(targetDoc, id);
            } else if (action === 'sticker-cloud-upload' && id) {
                if (!wsIsLoggedIn()) { wsToastInfo('请先登录Discord'); return; }
                var uUser = wsGetAuthUser();
                if (uUser && !uUser.inGuild) { wsToastWarn('需要加入Discord服务器才能上传'); return; }
                try {
                    btn.innerHTML = wsIcon('loader', 13); btn.disabled = true;
                    var stickers = await wsGetAllStickers();
                    var s = stickers.find(function(x) { return x.id === id; });
                    if (!s) { wsToastErr('表情包不存在'); return; }
                    await wsCloudUploadSticker({ name: s.name, description: s.description || '', imageData: s.imageData, tags: s.tags || [] });
                    wsToastOk('已上传，等待审核');
                    btn.innerHTML = wsIcon('checkCircle', 13) + ' 已上传';
                } catch (err) {
                    wsToastErr('上传失败: ' + err.message);
                    btn.innerHTML = wsIcon('cloudUp', 13) + ' 上传云端'; btn.disabled = false;
                }
            } else if (action === 'delete' && id) {
                await wsDeleteStickerById(id);
                wsToastOk('已删除');
                detailPanel.style.display = 'none';
                wsRenderTabContent(targetDoc);
            } else if (action === 'sticker-cloud-download') {
                var r2key = btn.getAttribute('data-r2key') || '';
                var sName = btn.getAttribute('data-name') || 'sticker';
                var sDesc = btn.getAttribute('data-desc') || '';
                try {
                    btn.innerHTML = wsIcon('loader', 13); btn.disabled = true;
                    await wsCloudDownloadSticker({ id: id, r2Key: r2key, name: sName, description: sDesc });
                    wsToastOk('已下载到本地');
                    btn.innerHTML = wsIcon('checkCircle', 13) + ' 已下载';
                } catch (err) {
                    wsToastErr('下载失败: ' + err.message);
                    btn.innerHTML = wsIcon('download', 13) + ' 下载到本地'; btn.disabled = false;
                }
            }
        });
    }
    return detailPanel;
}

async function wsShowLocalStickerDialog(targetDoc, stickerId) {
    var detailPanel = wsGetOrCreateDetailPanel(targetDoc);
    
    var stickers = await wsGetAllStickers();
    var sticker = stickers.find(function(s) { return s.id === stickerId; });
    if (!sticker) { wsToastErr('表情包不存在'); return; }
    
    var canUpload = wsIsCloudEnabled() && wsIsLoggedIn();
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
        + '<span style="font-size:16px;font-weight:bold;">' + wsIcon('smile', 16) + ' 表情包详情</span>'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel" style="padding:4px 10px;">' + wsIcon('x', 14) + '</button></div>'
        + '<div style="text-align:center;margin-bottom:20px;">'
        + '<img src="' + (sticker.imageData || '') + '" style="max-width:250px;max-height:250px;border-radius:12px;border:2px solid #FCE7F3;">'
        + '</div>'
        + '<div style="margin-bottom:12px;"><strong style="color:#831843;">名称：</strong><span style="color:#1F2937;">' + wsEscapeHtml(sticker.name || '未命名') + '</span></div>'
        + '<div style="margin-bottom:20px;"><strong style="color:#831843;">描述：</strong><span style="color:#6B7280;">' + wsEscapeHtml(sticker.description || '无描述') + '</span></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
        + '<button class="ws-btn ws-btn-pink" data-action="sticker-edit" data-id="' + sticker.id + '" style="flex:1;">' + wsIcon('edit', 13) + ' 编辑</button>'
        + (canUpload ? '<button class="ws-btn ws-btn-blue" data-action="sticker-cloud-upload" data-id="' + sticker.id + '" style="flex:1;">' + wsIcon('cloudUp', 13) + ' 上传云端</button>' : '')
        + '<button class="ws-btn ws-btn-red" data-action="delete" data-id="' + sticker.id + '" data-type="sticker" style="flex:1;">' + wsIcon('trash', 13) + ' 删除</button>'
        + '</div>';
    
    detailPanel.innerHTML = html;
    detailPanel.style.display = 'flex';
}

async function wsShowCloudStickerDialog(targetDoc, stickerId) {
    var detailPanel = wsGetOrCreateDetailPanel(targetDoc);
    
    detailPanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
        + '<span style="font-size:16px;font-weight:bold;">' + wsIcon('cloud', 16) + ' 云端表情包</span>'
        + '<button class="ws-btn ws-btn-gray" data-action="cancel" style="padding:4px 10px;">' + wsIcon('x', 14) + '</button></div>'
        + '<div style="text-align:center;padding:60px;"><div style="font-size:14px;color:#9CA3AF;">加载中...</div></div>';
    detailPanel.style.display = 'flex';
    
    try {
        var result = await wsCloudStickerList(1, 'newest');
        var item = (result.items || []).find(function(s) { return s.id === stickerId; });
        if (!item) { wsToastErr('表情包不存在'); detailPanel.style.display = 'none'; return; }
        
        var imgSrc = WS_API_BASE + (item.imageUrl || '/api/sticker/image/' + (item.r2Key || item.id));
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
            + '<span style="font-size:16px;font-weight:bold;">' + wsIcon('cloud', 16) + ' 云端表情包</span>'
            + '<button class="ws-btn ws-btn-gray" data-action="cancel" style="padding:4px 10px;">' + wsIcon('x', 14) + '</button></div>'
            + '<div style="text-align:center;margin-bottom:20px;">'
            + '<img src="' + imgSrc + '" style="max-width:250px;max-height:250px;border-radius:12px;border:2px solid #FCE7F3;" loading="lazy">'
            + '</div>'
            + '<div style="margin-bottom:12px;"><strong style="color:#831843;">名称：</strong><span style="color:#1F2937;">' + wsEscapeHtml(item.name || '未命名') + '</span></div>'
            + '<div style="margin-bottom:20px;"><strong style="color:#831843;">描述：</strong><span style="color:#6B7280;">' + wsEscapeHtml(item.description || '无描述') + '</span></div>'
            + '<div style="display:flex;gap:8px;">'
            + '<button class="ws-btn ws-btn-green" data-action="sticker-cloud-download" data-id="' + item.id + '" data-r2key="' + (item.r2Key || '') + '" data-name="' + wsEscapeHtml(item.name || '') + '" data-desc="' + wsEscapeHtml(item.description || '') + '" style="flex:1;">' + wsIcon('download', 13) + ' 下载到本地</button>'
            + '</div>';
        
        detailPanel.innerHTML = html;
    } catch (err) {
        wsToastErr('加载失败: ' + err.message);
        detailPanel.style.display = 'none';
    }
}

if (typeof eventOn === 'function') {
    eventOn('chat_id_changed', function(chatFileName) {
        if (!chatFileName) { cleanupWorkshopPlugin(); return; }
    });
}

console.log('[创意工坊] 脚本模块已注册');
