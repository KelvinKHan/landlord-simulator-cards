// ==================== 调试器 APP ====================
// 提供控制台日志查看和API提示词查看功能
// 依赖：phone_main.js

(function () {
    'use strict';

    // ==================== APP 配置 ====================
    const APP_ID = 'debugger';
    const APP_NAME = '调试终端';
    const APP_ICON = '<img src="https://api.iconify.design/ri:bug-fill.svg?color=white" style="width:70%;height:70%">';
    const APP_COLOR = 'linear-gradient(135deg, #2d3436, #000000)';

    // ==================== 数据存储 ====================
    const DebugData = {
        consoleLogs: [],      // 控制台日志
        apiCalls: [],         // API调用记录
        maxLogs: 500,         // 最大日志数量
        maxApiCalls: 100      // 最大API记录数量
    };

    // ==================== 样式定义 ====================
    const APP_STYLES = `
        .debug-app {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: #0f0f12;
            font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
            padding-top: 44px;
            box-sizing: border-box;
            color: #dcdde1;
        }

        .debug-header {
            background: rgba(20, 20, 23, 0.8);
            backdrop-filter: blur(12px);
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            z-index: 10;
        }

        .debug-back-btn {
            width: 30px;
            height: 30px;
            border: none;
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            color: #fff;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }

        .debug-back-btn:hover {
            background: rgba(255,255,255,0.2);
            transform: translateX(-2px);
        }

        .debug-title {
            flex: 1;
            font-size: 15px;
            font-weight: 700;
            color: #fff;
            letter-spacing: 0.5px;
        }

        .debug-clear-btn {
            background: rgba(231, 76, 60, 0.2);
            border: 1px solid rgba(231, 76, 60, 0.3);
            padding: 6px 12px;
            border-radius: 6px;
            color: #ff6b6b;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.2s;
        }

        .debug-clear-btn:hover {
            background: rgba(231, 76, 60, 0.3);
            transform: scale(1.05);
        }

        /* 标签页 */
        .debug-tabs {
            display: flex;
            background: #141416;
            padding: 4px;
            margin: 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .debug-tab {
            flex: 1;
            padding: 10px;
            text-align: center;
            cursor: pointer;
            color: #718093;
            font-size: 13px;
            border: none;
            background: none;
            transition: all 0.3s;
            position: relative;
            font-weight: 600;
        }

        .debug-tab.active {
            color: #a8e6cf;
        }
        
        .debug-tab.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 20%;
            width: 60%;
            height: 2px;
            background: #a8e6cf;
            box-shadow: 0 0 8px rgba(168, 230, 207, 0.6);
            border-radius: 2px;
        }

        .debug-tab-badge {
            background: #ff4757;
            color: #fff;
            padding: 1px 5px;
            border-radius: 4px;
            font-size: 9px;
            margin-left: 6px;
            vertical-align: middle;
            font-weight: 700;
        }

        /* 内容区域 */
        .debug-content {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            scroll-behavior: smooth;
        }

        .debug-content::-webkit-scrollbar {
            width: 4px;
        }

        .debug-content::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.15);
            border-radius: 2px;
        }

        /* 日志项 */
        .log-item {
            padding: 8px;
            margin-bottom: 6px;
            border-radius: 6px;
            font-size: 11px;
            line-height: 1.5;
            word-break: break-all;
            background: rgba(255,255,255,0.02);
            border-left: 3px solid transparent;
            font-family: 'Menlo', monospace;
        }

        .log-item:hover {
            background: rgba(255,255,255,0.05);
        }

        .log-item.log { border-left-color: #3498db; }
        .log-item.warn { border-left-color: #f1c40f; background: rgba(241, 196, 15, 0.05); }
        .log-item.error { border-left-color: #ff4757; background: rgba(255, 71, 87, 0.08); }
        .log-item.info { border-left-color: #2ecc71; }

        .log-time {
            color: #57606f;
            font-size: 10px;
            margin-bottom: 4px;
            font-family: 'Arial', sans-serif;
        }

        .log-type {
            display: inline-block;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 9px;
            margin-right: 6px;
            text-transform: uppercase;
            font-weight: bold;
            opacity: 0.8;
        }

        .log-type.log { background: #3498db; color: #fff; }
        .log-type.warn { background: #f1c40f; color: #000; }
        .log-type.error { background: #ff4757; color: #fff; }
        .log-type.info { background: #2ecc71; color: #fff; }

        .log-message {
            color: #ced6e0;
            white-space: pre-wrap;
        }
        
        /* JSON高亮简易版 */
        .json-key { color: #5352ed; }
        .json-string { color: #ffa502; }
        .json-number { color: #ff6b81; }
        .json-boolean { color: #2ed573; }

        /* API调用项 */
        .api-item {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 8px;
            margin-bottom: 12px;
            overflow: hidden;
            transition: all 0.2s;
        }

        .api-header {
            padding: 10px 12px;
            background: rgba(255,255,255,0.02);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        }

        .api-header:hover {
            background: rgba(255,255,255,0.05);
        }

        .api-method {
            background: #2f3542;
            color: #a4b0be;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            margin-right: 8px;
            font-weight: bold;
            border: 1px solid rgba(255,255,255,0.1);
        }

        .api-model {
            color: #7bed9f;
            font-size: 11px;
            font-weight: 500;
        }

        .api-time {
            color: #57606f;
            font-size: 10px;
            margin-right: 8px;
        }

        .api-toggle {
            color: #747d8c;
            font-size: 12px;
            transition: transform 0.2s;
        }
        
        .api-item.expanded .api-toggle {
            transform: rotate(180deg);
        }

        .api-body {
            display: none;
            padding: 0;
            border-top: 1px solid rgba(255,255,255,0.05);
            background: rgba(0,0,0,0.2);
        }

        .api-body.expanded {
            display: block;
            animation: slideDown 0.2s ease-out;
        }

        @keyframes slideDown {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .api-section {
            padding: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        
        .api-section:last-child {
            border-bottom: none;
        }

        .api-section-title {
            color: #a4b0be;
            font-size: 10px;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .api-section-content {
            background: #000;
            padding: 10px;
            border-radius: 4px;
            font-size: 11px;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 400px;
            overflow-y: auto;
            color: #dcdde1;
            font-family: 'Consolas', monospace;
            border: 1px solid rgba(255,255,255,0.05);
        }

        /* 空状态 */
        .debug-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 300px;
            color: #57606f;
        }

        .debug-empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.3;
            filter: grayscale(100%);
        }

        .debug-empty-text {
            font-size: 12px;
            opacity: 0.6;
        }

        /* 筛选器 */
        .debug-filter {
            padding: 6px 12px;
            background: #141416;
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .filter-btn {
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 10px;
            cursor: pointer;
            border: 1px solid rgba(255,255,255,0.1);
            background: none;
            color: #747d8c;
            transition: all 0.2s;
        }

        .filter-btn:hover {
            color: #fff;
            border-color: rgba(255,255,255,0.3);
        }

        .filter-btn.active {
            background: #3742fa;
            color: #fff;
            border-color: #3742fa;
            box-shadow: 0 2px 8px rgba(55, 66, 250, 0.4);
        }
        
        /* 角色气泡 */
        .role-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            margin-bottom: 4px;
            font-weight: bold;
        }
        .role-user { background: #2f3542; color: #fff; }
        .role-assistant { background: #1e90ff; color: #fff; }
        .role-system { background: #ff4757; color: #fff; }
    `;

    // ==================== 控制台拦截 ====================
    let currentIframeDoc = null;
    let originalConsole = {};

    function setupConsoleInterceptor() {
        const targetWindow = window.parent;

        // 保存原始方法
        originalConsole = {
            log: targetWindow.console.log.bind(targetWindow.console),
            warn: targetWindow.console.warn.bind(targetWindow.console),
            error: targetWindow.console.error.bind(targetWindow.console),
            info: targetWindow.console.info.bind(targetWindow.console)
        };

        // 拦截console方法
        ['log', 'warn', 'error', 'info'].forEach(type => {
            targetWindow.console[type] = function (...args) {
                // 调用原始方法
                originalConsole[type](...args);

                // 记录到DebugData
                addLog(type, args);
            };
        });

        console.log('[调试器] 控制台拦截已启动');
    }

    function addLog(type, args) {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        DebugData.consoleLogs.push({
            type,
            message,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false })
        });

        // 限制数量
        if (DebugData.consoleLogs.length > DebugData.maxLogs) {
            DebugData.consoleLogs.shift();
        }

        // 如果当前在控制台视图，自动刷新
        updateLogCount();

        // 实时刷新（如果打开）
        if (currentIframeDoc && currentIframeDoc.querySelector('.debug-tab.active[data-tab="console"]')) {
            requestAnimationFrame(() => renderConsoleLogs('all', true)); // 仅追加或简单刷新
        }
    }

    // ==================== API拦截 ====================
    function setupAPIInterceptor() {
        const PhoneSystem = window.parent.PhoneSystem;
        if (!PhoneSystem) {
            setTimeout(setupAPIInterceptor, 500);
            return;
        }

        // 保存原始方法
        const originalCallAPI = PhoneSystem.callExternalAPI.bind(PhoneSystem);

        // 拦截API调用
        PhoneSystem.callExternalAPI = async function (messages, options) {
            const startTime = Date.now();
            const apiRecord = {
                id: Date.now(),
                time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                model: options?.model || PhoneSystem.getSettings()?.apiConfig?.model || 'unknown',
                messages: messages,
                options: options,
                response: null,
                error: null,
                duration: 0
            };

            try {
                const result = await originalCallAPI(messages, options);
                apiRecord.response = result;
                apiRecord.duration = Date.now() - startTime;
                return result;
            } catch (e) {
                apiRecord.error = e.message;
                apiRecord.duration = Date.now() - startTime;
                throw e;
            } finally {
                DebugData.apiCalls.unshift(apiRecord);
                if (DebugData.apiCalls.length > DebugData.maxApiCalls) {
                    DebugData.apiCalls.pop();
                }
                updateApiCount();
                // 实时刷新
                if (currentIframeDoc && currentIframeDoc.querySelector('.debug-tab.active[data-tab="api"]')) {
                    renderApiCalls();
                }
            }
        };

        // 同时拦截ChatCore的API调用（如果存在）
        if (window.parent.ChatCore) {
            const originalChatCoreAPI = window.parent.ChatCore.callAPI.bind(window.parent.ChatCore);
            window.parent.ChatCore.callAPI = async function (prompt) {
                const startTime = Date.now();
                const apiRecord = {
                    id: Date.now(),
                    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                    model: this.getAPIConfig()?.model || 'unknown',
                    messages: [{ role: 'user', content: prompt }],
                    options: { source: 'ChatCore' },
                    response: null,
                    error: null,
                    duration: 0
                };

                try {
                    const result = await originalChatCoreAPI(prompt);
                    apiRecord.response = result;
                    apiRecord.duration = Date.now() - startTime;
                    return result;
                } catch (e) {
                    apiRecord.error = e.message;
                    apiRecord.duration = Date.now() - startTime;
                    throw e;
                } finally {
                    DebugData.apiCalls.unshift(apiRecord);
                    if (DebugData.apiCalls.length > DebugData.maxApiCalls) {
                        DebugData.apiCalls.pop();
                    }
                    updateApiCount();
                }
            };
        }

        console.log('[调试器] API拦截已启动');
    }

    // ==================== UI更新 ====================
    function updateLogCount() {
        if (!currentIframeDoc) return;
        const badge = currentIframeDoc.getElementById('console-badge');
        if (badge) {
            const errorCount = DebugData.consoleLogs.filter(l => l.type === 'error').length;
            badge.textContent = errorCount > 0 ? errorCount : '';
            badge.style.display = errorCount > 0 ? 'inline-block' : 'none';
        }
    }

    function updateApiCount() {
        if (!currentIframeDoc) return;
        const badge = currentIframeDoc.getElementById('api-badge');
        if (badge) {
            badge.textContent = DebugData.apiCalls.length;
            badge.style.display = DebugData.apiCalls.length > 0 ? 'inline-block' : 'none';
        }
    }

    // ==================== HTML生成 ====================
    function generateAppHTML() {
        const errorCount = DebugData.consoleLogs.filter(l => l.type === 'error').length;

        return `
            <div class="debug-app">
                <div class="debug-header">
                    <button class="debug-back-btn" id="btn-debug-home">‹</button>
                    <span class="debug-title">DEBUGGER TEWRMINAL</span>
                    <button class="debug-clear-btn" id="btn-clear-logs">CLEAR</button>
                </div>
                <div class="debug-tabs">
                    <button class="debug-tab active" data-tab="console">
                        CONSOLE
                        <span class="debug-tab-badge" id="console-badge" style="display:${errorCount > 0 ? 'inline-block' : 'none'}">${errorCount || ''}</span>
                    </button>
                    <button class="debug-tab" data-tab="api">
                        API TRACE
                        <span class="debug-tab-badge" id="api-badge" style="display:${DebugData.apiCalls.length > 0 ? 'inline-block' : 'none'}">${DebugData.apiCalls.length || ''}</span>
                    </button>
                </div>
                <div class="debug-filter" id="debug-filter">
                    <button class="filter-btn active" data-filter="all">ALL</button>
                    <button class="filter-btn" data-filter="log">LOG</button>
                    <button class="filter-btn" data-filter="info">INFO</button>
                    <button class="filter-btn" data-filter="warn">WARN</button>
                    <button class="filter-btn" data-filter="error">ERR</button>
                </div>
                <div class="debug-content" id="debug-content">
                    <!-- 动态内容 -->
                </div>
            </div>
        `;
    }

    function renderConsoleLogs(filter = 'all', append = false) {
        const doc = currentIframeDoc || document;
        const container = doc.getElementById('debug-content');
        if (!container) return;

        // 获取当前筛选器状态（如果不是强制指定）
        if (filter === 'all') {
            const activeBtn = doc.querySelector('.filter-btn.active');
            if (activeBtn) filter = activeBtn.dataset.filter;
        }

        const logs = filter === 'all'
            ? DebugData.consoleLogs
            : DebugData.consoleLogs.filter(l => l.type === filter);

        if (logs.length === 0) {
            container.innerHTML = `
                <div class="debug-empty">
                    <div class="debug-empty-icon">_</div>
                    <div class="debug-empty-text">NO LOGS AVAILABLE</div>
                    <div style="font-size:10px;color:#333;margin-top:10px">SYSTEM READY</div>
                </div>
            `;
            return;
        }

        // 倒序显示（最新的在前面）
        const reversedLogs = [...logs].reverse();

        container.innerHTML = reversedLogs.map(log => `
            <div class="log-item ${log.type}">
                <div class="log-time">[${log.time}]</div>
                <div style="display:flex;align-items:center;margin-bottom:2px;">
                     <span class="log-type ${log.type}">${log.type}</span>
                </div>
                <div class="log-message">${escapeHtml(log.message)}</div>
            </div>
        `).join('');
    }

    function renderApiCalls() {
        const doc = currentIframeDoc || document;
        const container = doc.getElementById('debug-content');
        const filterDiv = doc.getElementById('debug-filter');

        if (!container) return;

        // 隐藏筛选器（API页面不需要）
        if (filterDiv) filterDiv.style.display = 'none';

        if (DebugData.apiCalls.length === 0) {
            container.innerHTML = `
                <div class="debug-empty">
                    <div class="debug-empty-icon">⚡</div>
                    <div class="debug-empty-text">NO API REQUESTS</div>
                </div>
            `;
            return;
        }

        container.innerHTML = DebugData.apiCalls.map((api, index) => `
            <div class="api-item ${index === 0 ? 'latest' : ''}" data-id="${api.id}">
                <div class="api-header">
                    <div style="display:flex;align-items:center">
                        <span class="api-method">POST</span>
                        <span class="api-model">${api.model}</span>
                    </div>
                    <div style="display:flex;align-items:center">
                        <span class="api-time">${api.time} • ${api.duration}ms</span>
                        <span class="api-toggle">▼</span>
                    </div>
                </div>
                <div class="api-body">
                    <div class="api-section">
                        <div class="api-section-title">📤 MESSAGES (${api.messages?.length || 0})</div>
                        <div class="api-section-content">${formatMessages(api.messages)}</div>
                    </div>
                    ${api.response ? `
                    <div class="api-section">
                        <div class="api-section-title">📥 RESPONSE</div>
                        <div class="api-section-content" style="color:#a8e6cf">${escapeHtml(api.response)}</div>
                    </div>
                    ` : ''}
                    ${api.error ? `
                    <div class="api-section">
                        <div class="api-section-title">❌ ERROR</div>
                        <div class="api-section-content" style="color:#ff4757;border-color:#ff4757">${escapeHtml(api.error)}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // 绑定展开/折叠事件
        container.querySelectorAll('.api-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const item = header.closest('.api-item');
                const body = item.querySelector('.api-body');
                body.classList.toggle('expanded');
                item.classList.toggle('expanded');
            });
        });
    }

    function formatMessages(messages) {
        if (!messages || messages.length === 0) return '(EMPTY)';

        return messages.map((msg, i) => {
            const role = msg.role || 'unknown';
            const content = msg.content || '';
            const roleClass = `role-${role}`;
            return `<span class="role-badge ${roleClass}">${role.toUpperCase()}</span>\n${escapeHtml(content)}`;
        }).join('\n\n');
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== 事件绑定 ====================
    function bindEvents() {
        const doc = currentIframeDoc || document;

        // 返回主屏幕
        doc.getElementById('btn-debug-home')?.addEventListener('click', () => {
            const PhoneSystem = window.parent.PhoneSystem;
            if (PhoneSystem) PhoneSystem.goHome();
        });

        // 清空按钮
        doc.getElementById('btn-clear-logs')?.addEventListener('click', () => {
            const activeTab = doc.querySelector('.debug-tab.active')?.dataset.tab;
            if (activeTab === 'console') {
                DebugData.consoleLogs = [];
                renderConsoleLogs();
            } else {
                DebugData.apiCalls = [];
                renderApiCalls();
            }
            updateLogCount();
            updateApiCount();
        });

        // 标签切换
        doc.querySelectorAll('.debug-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                doc.querySelectorAll('.debug-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const filterDiv = doc.getElementById('debug-filter');

                if (tab.dataset.tab === 'console') {
                    if (filterDiv) filterDiv.style.display = 'flex';
                    renderConsoleLogs();
                } else {
                    renderApiCalls();
                }
            });
        });

        // 筛选按钮
        doc.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                doc.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderConsoleLogs(btn.dataset.filter);
            });
        });
    }

    // ==================== PhoneSystem 集成 ====================
    function waitForPhoneSystem(callback) {
        if (window.parent.PhoneSystem) {
            callback();
        } else {
            setTimeout(() => waitForPhoneSystem(callback), 100);
        }
    }

    function openApp() {
        const phoneSystem = window.parent.PhoneSystem;
        if (!phoneSystem || !phoneSystem.iframeWindow) {
            setTimeout(openApp, 200);
            return;
        }

        const iframeDoc = phoneSystem.iframeWindow.document;
        currentIframeDoc = iframeDoc;

        const appContainer = iframeDoc.getElementById('app-container');
        const homeScreen = iframeDoc.getElementById('home-screen');
        const statusBar = iframeDoc.getElementById('status-bar');

        if (!appContainer) {
            console.error('[调试器] 找不到app-container');
            return;
        }

        if (homeScreen) homeScreen.style.display = 'none';
        appContainer.innerHTML = '';
        appContainer.style.display = 'block';
        appContainer.style.pointerEvents = 'auto';

        if (statusBar) {
            statusBar.classList.remove('light');
            statusBar.classList.add('dark');
        }

        // 注入样式
        if (!iframeDoc.getElementById('debug-app-styles')) {
            const style = iframeDoc.createElement('style');
            style.id = 'debug-app-styles';
            style.textContent = APP_STYLES;
            iframeDoc.head.appendChild(style);
        } else {
            iframeDoc.getElementById('debug-app-styles').textContent = APP_STYLES;
        }

        // 创建APP内容
        const appDiv = iframeDoc.createElement('div');
        appDiv.id = 'debug-app-wrapper';
        appDiv.style.cssText = 'width:100%;height:100%;';
        appDiv.innerHTML = generateAppHTML();
        appContainer.appendChild(appDiv);

        // 绑定事件并渲染
        setTimeout(() => {
            bindEvents();
            renderConsoleLogs();
        }, 50);

        console.log('[调试器] APP已打开');
    }

    function closeApp() {
        if (!window.parent) return;
        const phoneSystem = window.parent.PhoneSystem;
        if (!phoneSystem || !phoneSystem.iframeWindow) return;

        try {
            const iframeDoc = phoneSystem.iframeWindow.document;

            const appContainer = iframeDoc.getElementById('app-container');
            if (appContainer) {
                appContainer.innerHTML = '';
                appContainer.style.pointerEvents = 'none';
            }

            const homeScreen = iframeDoc.getElementById('home-screen');
            if (homeScreen) homeScreen.style.display = 'block';

            const statusBar = iframeDoc.getElementById('status-bar');
            if (statusBar) {
                statusBar.classList.remove('dark');
                statusBar.classList.add('light');
            }

            currentIframeDoc = null;
        } catch (e) {
            console.error('[调试器] closeApp失败:', e);
        }
    }

    // 注册APP
    waitForPhoneSystem(() => {
        console.log('[调试器] PhoneSystem已就绪，开始注册');

        window.parent.PhoneSystem.registerApp({
            id: APP_ID,
            name: APP_NAME,
            icon: APP_ICON,
            color: APP_COLOR,
            order: 10
        });

        window.parent.PhoneSystem.on('app-opened', (data) => {
            if (data.id === APP_ID) openApp();
        });

        window.parent.PhoneSystem.on('go-home', closeApp);

        // 启动拦截器
        setupConsoleInterceptor();
        setupAPIInterceptor();

        console.log('[调试器] APP已注册:', APP_NAME);
    });

    // 导出到全局
    window.parent.DebugApp = {
        getData: () => DebugData,
        clearLogs: () => { DebugData.consoleLogs = []; },
        clearApiCalls: () => { DebugData.apiCalls = []; }
    };

    console.log('✅ DebugApp 调试器模块已加载');

})();
