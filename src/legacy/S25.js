(function () {
    'use strict';
    console.log('[AptOS 引导程序] 正在启动...');

    const CONFIG = {
        hostId: 'apt-shadow-host',
        ballId: 'apt-magnetic-ball',
        panelId: 'apt-main-frame',
        storageKey: 'apt_os_settings'
    };

    let transform = { scale: 0.95, x: 0, y: 0 };
    let cachedData = null;
    let isDeepMode = false;
    let currentRoomInfo = null;
    let currentBuildFloor = null;
    
    const BASE_FLOORS = ['四楼', '三楼', '二楼', '一楼', '地下一层', '地下一楼'];

    function zhToNum(str) {
        const chars = {'一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10};
        if (/^\d+$/.test(str)) return parseInt(str);
        if (!str || str.length === 0) return 0;
        if (str.length === 1) return chars[str] || 0;
        if (str.length === 2 && str[0] === '十') return 10 + chars[str[1]];
        if (str.length === 2 && str[1] === '十') return chars[str[0]] * 10;
        if (str.length === 3 && str[1] === '十') return chars[str[0]] * 10 + chars[str[2]];
        return 0;
    }

    function getFloorLevel(name) {
        let isUnderground = name.startsWith('地下');
        let cleanStr = name.replace(/地下|层|楼/g, '');
        let level = zhToNum(cleanStr) || parseInt(cleanStr) || (isUnderground ? 99 : 0);
        return isUnderground ? -level : level;
    }

    function fillChatCommand(cmd) {
        const shadow = window.parent.document.getElementById(CONFIG.hostId).shadowRoot;
        window.parent.jQuery(shadow).find('.modal-overlay').removeClass('open');

        if (window.parent.SlashCommandParser && typeof window.parent.SlashCommandParser.execute === 'function') {
            window.parent.SlashCommandParser.execute('/send ' + cmd);
            window.parent.AptSystem.showNotification('指令已发送', 'success');
        } else {
            const ta = window.parent.document.getElementById('send_textarea');
            if (ta) {
                ta.value = ta.value.trim() !== '' ? ta.value + '\\n' + cmd : cmd;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                window.parent.document.getElementById('send_but')?.click();
            } else {
                window.parent.AptSystem.showNotification('指令发送失败，请手动输入指令！', 'error');
            }
        }
    }

    const pDoc = window.parent.document;
    let host = pDoc.getElementById(CONFIG.hostId);
    if (host) host.remove();

    host = pDoc.createElement('div');
    host.id = CONFIG.hostId;
    host.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 999999; overflow: visible;';
    pDoc.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    window.parent._AptDebugData = window.parent._AptDebugData || {
        consoleLogs: [], apiCalls: [], maxLogs: 500, maxApiCalls: 100
    };
    const DebugData = window.parent._AptDebugData;

    let debugCurrentTab = 'api', debugCurrentFilter = 'all', debugSearchQuery = '', debugAutoScrollLocked = true;

    const existingSystem = window.parent.AptSystem;
    
    window.parent.AptSystem = {
        registeredModules: existingSystem?.registeredModules || new Map(),
        settingsPages: existingSystem?.settingsPages || new Map(),
        settings: existingSystem?.settings || null,
        eventListeners: existingSystem?.eventListeners || new Map(),
        shadowRoot: shadow,
        currentChatId: null,
        sysAbortController: new AbortController(),
        on: function(event, callback) {
            if (!this.eventListeners.has(event)) {
                this.eventListeners.set(event, []);
            }
            this.eventListeners.get(event).push(callback);
        },
        
        emit: function(event, data) {
            if (this.eventListeners.has(event)) {
                this.eventListeners.get(event).forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {
                        console.error(`[AptOS] 执行事件 ${event} 时出错:`, e);
                    }
                });
            }
        },
        log: function(msg, type = 'info') {
            const prefix = '🔵 [AptOS]'; 
            const fullMsg = `${prefix} ${msg}`;
            
            window.parent._AptDebugData.consoleLogs.push({
                type: type,
                message: fullMsg,
                time: new Date().toLocaleTimeString('zh-CN', { hour12: false })
            });
            if (window.parent._AptDebugData.consoleLogs.length > window.parent._AptDebugData.maxLogs) {
                window.parent._AptDebugData.consoleLogs.shift();
            }
            
            if (typeof window.parent._aptTriggerRender === 'function') {
                window.parent._aptTriggerRender('console');
            }
            
            if (window.parent._originalAptConsole) {
                window.parent._originalAptConsole[type].call(window.parent.console, fullMsg);
            }
        },

        debounce: function(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        },

        showNotification: function(message, type = 'info') {
            this.emit('system-notify', { message, type });
            if (!this.eventListeners.has('system-notify') || this.eventListeners.get('system-notify').length === 0) {
                window.parent.AptSystem.log('广播: ' + message);
            }
        },

        registerModule: function(moduleConfig) {
            const { id, name, icon, order = 99 } = moduleConfig;
            if (!id || !name) return false;
            this.registeredModules.set(id, { id, name, icon, order });
            this.emit('module-registered', moduleConfig);
            this.renderDockPlugins(); 
            return true;
        },

        registerSettingsPage: function(pageConfig) {
            const { id, title, render } = pageConfig;
            if (!id || !title || !render) return false;
            this.settingsPages.set(id, { id, title, render });
            this.renderSettingsTabs();
            return true;
        },

        renderDockPlugins: function() {
            const container = shadow.getElementById('dock-plugins-container');
            if (!container) return;
            container.innerHTML = '';
            
            const modules = Array.from(this.registeredModules.values()).sort((a, b) => a.order - b.order);
            modules.forEach(mod => {
                const btn = pDoc.createElement('button');
                btn.className = 'dock-btn plugin-btn';
                btn.title = mod.name;
                btn.innerHTML = `<span class="dock-text">${mod.name}</span>`;
                btn.onclick = () => this.emit('open-module', mod.id);
                container.appendChild(btn);
            });
        },

        renderSettingsTabs: function() {
            const tabsContainer = shadow.getElementById('settings-tabs-container');
            const panesContainer = shadow.getElementById('settings-panes-container');
            if (!tabsContainer || !panesContainer) return;

            const $ = window.parent.jQuery;
            $(shadow).find('.dynamic-tab, .dynamic-pane').remove();

            this.settingsPages.forEach(page => {
                const tab = pDoc.createElement('div');
                tab.className = 'settings-tab dynamic-tab';
                tab.dataset.target = `pane-${page.id}`;
                tab.textContent = page.title;
                tabsContainer.appendChild(tab);

                const pane = pDoc.createElement('div');
                pane.className = 'settings-pane dynamic-pane';
                pane.id = `pane-${page.id}`;
                pane.innerHTML = page.render();
                panesContainer.appendChild(pane);
            });

            $(shadow).find('.settings-tab').off('click').on('click', function() {
                $(shadow).find('.settings-tab, .settings-pane').removeClass('active');
                $(this).addClass('active');
                $(shadow).find('#' + $(this).data('target')).addClass('active');
                $(shadow).find('#settings-dynamic-title').text($(this).text()); 
            });

            this.emit('settings-rendered');
        },

        getSettings: function () {
            if (!this.settings) {
                try {
                    let saved = localStorage.getItem(CONFIG.storageKey);
                    this.settings = saved ? JSON.parse(saved) : this.getDefaultSettings();
                } catch (e) {
                    this.settings = this.getDefaultSettings();
                }
            }
            return this.settings;
        },

        saveSettings: function (newSettings) {
            this.settings = Object.assign({}, this.settings, newSettings);
            try {
                localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.settings));
                this.emit('settings-changed', this.settings);
            } catch (e) {}
        },

        syncTavernApiSettings: function() {
            try {
                const pWin = window.parent;
                let tempUrl = '', tempKey = '', tempProvider = 'openai';

                let stSettings = {};
                const rawSettings = pWin.localStorage.getItem('settings');
                if (rawSettings) stSettings = JSON.parse(rawSettings);

                const currentApi = pWin.main_api || stSettings.main_api || 'openai';

                if (currentApi === 'openai' || currentApi === 'oai') {
                    tempUrl = stSettings.api_server || pWin.document.getElementById('api_url_openai')?.value || '';
                    tempKey = stSettings.api_key_openai || pWin.document.getElementById('api_key_openai')?.value || '';
                    tempProvider = 'openai';
                } else if (currentApi === 'claude') {
                    tempKey = stSettings.api_key_claude || pWin.document.getElementById('api_key_claude')?.value || '';
                    tempProvider = 'claude';
                } else if (currentApi === 'openrouter') {
                    tempKey = stSettings.api_key_openrouter || pWin.document.getElementById('api_key_openrouter')?.value || '';
                    tempUrl = 'https://openrouter.ai/api/v1'; 
                    tempProvider = 'openai';
                } else if (currentApi === 'proxy' || currentApi === 'custom') {
                    tempKey = stSettings.proxy_password || stSettings.custom_api_key || '';
                    tempUrl = stSettings.proxy_url || stSettings.custom_url || '';
                    tempProvider = 'openai'; 
                }

                if (tempUrl || tempKey) {
                    const currentSettings = this.getSettings();
                    currentSettings.apiConfig.apiUrl = tempUrl || currentSettings.apiConfig.apiUrl;
                    currentSettings.apiConfig.apiKey = tempKey || currentSettings.apiConfig.apiKey;
                    currentSettings.apiConfig.provider = tempProvider;
                    this.saveSettings(currentSettings);
                    return { success: true, url: tempUrl, key: tempKey, provider: tempProvider };
                }
                return { success: false };
            } catch (error) {
                console.error('[AptOS API探针报错]', error);
                return { success: false };
            }
        },

        getDefaultSettings: function () {
            return {
                apiConfig: {
                    provider: 'openai', apiKey: '', apiUrl: 'https://api.openai.com/v1/chat/completions',
                    model: 'gpt-4o-mini', maxTokens: 2048, temperature: 0.7,
                },
                displayConfig: { theme: 'light' },
                islandConfig: { position: 'top' } 
            };
        },
        callExternalAPI: async function (messages, options = {}) {
            const config = this.getSettings().apiConfig;
            if (!config.apiKey) throw new Error('API KEY 未配置，请前往控制面板设置');

            const startTime = Date.now();
            const record = {
                id: startTime, 
                time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                model: options.model || config.model,
                messages: JSON.parse(JSON.stringify(messages)), 
                response: null, 
                error: null, 
                duration: 0
            };
            
            const apiList = window.parent._AptDebugData.apiCalls;
            apiList.push(record);
            if (apiList.length > window.parent._AptDebugData.maxApiCalls) apiList.shift();
            
            if (window.parent._aptTriggerRender) window.parent._aptTriggerRender('api');

            let apiUrl = (config.apiUrl || 'https://api.openai.com/v1').trim();
            while (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
            if (!apiUrl.endsWith('/chat/completions')) {
                apiUrl += apiUrl.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions';
            }

            const fetchAbortController = new AbortController();
            const timeoutId = setTimeout(() => fetchAbortController.abort('TIMEOUT'), 90000);

            const onGlobalAbort = () => fetchAbortController.abort('PAGE_HIDDEN');
            if (this.sysAbortController) {
                this.sysAbortController.signal.addEventListener('abort', onGlobalAbort);
            }

            try {
                this.log(`向 ${config.provider.toUpperCase()} 引擎发起生成请求 [Model: ${record.model}]`, 'info');

                const requestBody = {
                    model: record.model,
                    messages: messages,
                    max_tokens: options.maxTokens || config.maxTokens,
                    temperature: options.temperature !== undefined ? options.temperature : config.temperature,
                    stream: false,
                };

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.apiKey },
                    body: JSON.stringify(requestBody),
                    signal: fetchAbortController.signal 
                });
                
                if (!response.ok) {
                    const errData = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errData}`);
                }
                
                const data = await response.json();
                const content = data.choices?.[0]?.message?.content || '';
                
                record.response = content;
                record.duration = Date.now() - startTime;
                
                this.log(`AI 响应成功，耗时 ${record.duration}ms`, 'info');
                if (window.parent._aptTriggerRender) window.parent._aptTriggerRender('api');
                
                return content;

            } catch (error) {
                record.error = error.message || String(error);
                record.duration = Date.now() - startTime;
                
                this.log(`API 通讯断链: ${record.error}`, 'error');
                if (window.parent._aptTriggerRender) window.parent._aptTriggerRender('api');
                
                throw error;
            } finally {
                clearTimeout(timeoutId);
                if (this.sysAbortController) {
                    this.sysAbortController.signal.removeEventListener('abort', onGlobalAbort);
                }
            }
        },

        Scheduler: {
            queue: [],
            history: [],
            historyLimit: 50,
            activeTasks: 0,
            maxConcurrent: 2,
            maxRetries: 3,
            
            TYPES: { NEWS: 'news', TENANT_ANALYZE: 'tenant_analyze', SYSTEM: 'system', CUSTOM: 'custom' },
            PRIORITY: { HIGH: 1, NORMAL: 2, LOW: 3 },
            STATUS: { PENDING: 'pending', RUNNING: 'running', COMPLETED: 'completed', FAILED: 'failed', RETRYING: 'retrying' },

            pendingKeys: new Map(),
            addTask: function(options) {
                if (options.key && this.pendingKeys.has(options.key)) return this.pendingKeys.get(options.key);
                const task = {
                    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    type: options.type || this.TYPES.CUSTOM,
                    name: options.name || '未命名系统任务',
                    priority: options.priority || this.PRIORITY.NORMAL,
                    execute: options.execute,
                    key: options.key,
                    onSettled: options.onSettled,
                    retries: 0,
                    status: this.STATUS.PENDING,
                    createdAt: Date.now(),
                    startedAt: null,
                    completedAt: null,
                    error: null
                };

                if (task.key) this.pendingKeys.set(task.key, task.id);
                const insertIndex = this.queue.findIndex(t => t.priority > task.priority);
                if (insertIndex === -1) {
                    this.queue.push(task); 
                } else {
                    this.queue.splice(insertIndex, 0, task);
                }

                window.parent.AptSystem.log(`[Scheduler] 任务挂载: ${task.name} (权重: ${task.priority})`, 'info');
                window.parent.AptSystem.Island.renderQueueStatus();
                
                this.processNext();
                return task.id;
            },

            processNext: async function() {
                if (this.activeTasks >= this.maxConcurrent || this.queue.length === 0) return;

                const task = this.queue.shift();
                this.activeTasks++;
                task.status = this.STATUS.RUNNING;
                if (!task.startedAt) task.startedAt = Date.now();
                
                window.parent.AptSystem.Island.renderQueueStatus(task.name);

                try {
                    // The API owns the request timeout and abort. Retrying starts only after it settles.
                    await task.execute();

                    task.status = this.STATUS.COMPLETED;
                    window.parent.AptSystem.emit('task-completed', task);
                    this.finishTask(task);
                    
                } catch (error) {
                    const errMsg = error.message || String(error);
                    const isFatal = error.name === 'AbortError' || errMsg.includes('401') || errMsg.includes('API KEY') || errMsg.includes('未配置');

                    if (!isFatal && task.retries < this.maxRetries) {
                        task.retries++;
                        task.status = this.STATUS.RETRYING;
                        const delayMs = 2000 * Math.pow(2, task.retries - 1);
                        
                        window.parent.AptSystem.log(`[Scheduler] 任务异常，${delayMs/1000}s 后进行第 ${task.retries} 次重试: ${task.name}`, 'warn');
                        
                        setTimeout(() => {
                            this.activeTasks--; 
                            this.queue.unshift(task);
                            this.processNext(); 
                        }, delayMs);
                        
                    } else {
                        task.status = this.STATUS.FAILED;
                        task.error = errMsg;
                        
                        window.parent.AptSystem.log(`[Scheduler] 任务彻底熔断: ${task.name} - ${errMsg}`, 'error');
                        if (window.parent.AptSystem.Island) {
                            window.parent.AptSystem.Island.showNotification(`模块故障: ${task.name}`, 'error');
                        }
                        
                        window.parent.AptSystem.emit('task-failed', task);
                        this.finishTask(task);
                    }
                }
            },

            finishTask: function(task) {
                if (task.key) this.pendingKeys.delete(task.key);
                task.onSettled?.(task);
                task.completedAt = Date.now();
                this.history.unshift(task);
                if (this.history.length > this.historyLimit) this.history.pop();

                this.activeTasks--; 
                window.parent.AptSystem.Island.renderQueueStatus();
                this.processNext(); 
            }
        },

        Island: {
            container: null,
            statusPill: null, 
            
            init: function(shadowRoot) {
                this.container = window.parent.document.createElement('div');
                this.container.id = 'apt-island-container';
                this.updatePosition(); 
                shadowRoot.appendChild(this.container);
                
                this.statusPill = window.parent.document.createElement('div');
                this.statusPill.className = 'apt-di-item status-pill';
                this.statusPill.style.display = 'none';
                this.container.appendChild(this.statusPill);
                
                window.parent.AptSystem.on('system-notify', (data) => {
                    this.showNotification(data.message, data.type || 'info');
                });
            },

            updatePosition: function() {
                if (!this.container) return;
                const pos = window.parent.AptSystem.getSettings().islandConfig?.position || 'top';
                this.container.className = `apt-island-container pos-${pos}`;
            },

            hijackToastr: function() {
                const pDoc = window.parent.document;
                if (window.parent._aptToastObserver) return;

                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1 && node.classList && node.classList.contains('toast')) {
                                node.style.setProperty('display', 'none', 'important');
                                node.style.setProperty('opacity', '0', 'important');

                                let type = 'info';
                                if (node.classList.contains('toast-success')) type = 'success';
                                else if (node.classList.contains('toast-error')) type = 'error';
                                else if (node.classList.contains('toast-warning')) type = 'warning';

                                const titleEl = node.querySelector('.toast-title');
                                const msgEl = node.querySelector('.toast-message');
                                const title = titleEl ? titleEl.innerHTML : '';
                                const msg = msgEl ? msgEl.innerHTML : '';

                                const currentIsland = window.parent.AptSystem && window.parent.AptSystem.Island;
                                if (currentIsland && currentIsland.container) {
                                    let displayMsg = title ? `<b style="opacity:0.8; margin-right:5px;">[${title}]</b> ${msg}` : msg;
                                    currentIsland.showNotification(displayMsg, type, true, node);
                                }
                            }
                        });
                    });
                });
                const toastContainer = pDoc.getElementById('toastr-container') || pDoc.body; 
                observer.observe(toastContainer, { childList: true, subtree: true });
                window.parent._aptToastObserver = observer;
            },
            
            showNotification: function(msg, type, isHtml = false, sourceNode = null) {
                if (!this.container) return;
                
                const item = window.parent.document.createElement('div');
                item.className = `apt-di-item`;
                
                let icon = '', colorCls = '';
                if (type === 'success') { icon = '✓'; colorCls = 'apt-di-success'; }
                else if (type === 'error') { icon = '✕'; colorCls = 'apt-di-error'; }
                else if (type === 'warning') { icon = '!'; colorCls = 'apt-di-warning'; }
                else { icon = 'i'; colorCls = 'apt-di-info'; }

                let displayMsg = '';
                try { displayMsg = isHtml ? msg : this.escapeHtml(msg); } catch(e) { displayMsg = String(msg); }
                const plainText = displayMsg.replace(/<[^>]+>/g, '');
                const isTruncated = plainText.length > 55;

                if (isTruncated && type === 'error') {
                    window.parent.AptSystem.log(`[Exception] ${plainText}`, 'error');
                }

                item.innerHTML = `
                    <div class="apt-di-icon ${colorCls}">${icon}</div>
                    <div class="apt-di-text" style="${isTruncated ? '-webkit-line-clamp: 2; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;' : ''}">
                        ${displayMsg}
                    </div>
                    ${isTruncated ? '<div style="font-size:10px; opacity:0.6; margin-left:8px; white-space:nowrap;">(点击追溯)</div>' : ''}
                `;

                const activeItems = this.container.querySelectorAll('.apt-di-item:not(.apt-di-leave):not(.status-pill)');
                if (activeItems.length >= 5) {
                    this.removePill(activeItems[activeItems.length - 1]);
                }

                this.container.insertBefore(item, this.statusPill);
                setTimeout(() => item.classList.add('active'), 10);

                item.onclick = () => {
                    if (sourceNode) {
                        sourceNode.click(); 
                    } else if (isTruncated && type === 'error') {
                        const shadow = window.parent.AptSystem.shadowRoot;
                        const $ = window.parent.jQuery;
                        const consoleTabBtn = $(shadow).find('#dock-console');
                        
                        const hiddenParents = consoleTabBtn.parents().filter(function() {
                            return $(this).css('display') === 'none' || $(this).css('visibility') === 'hidden';
                        });
                        
                        hiddenParents.css({ 'display': 'block', 'visibility': 'visible', 'opacity': '1' });
                        consoleTabBtn.click();
                        
                        setTimeout(() => {
                            consoleTabBtn.click();
                            const consoleContent = $(shadow).find('#apt-console-content');
                            if(consoleContent.length) {
                                consoleContent.scrollTop(consoleContent[0].scrollHeight);
                            }
                        }, 150);
                    }
                    this.removePill(item);
                };

                const duration = sourceNode ? 5000 : (type === 'error' ? 6000 : 3500);
                setTimeout(() => this.removePill(item), duration);
            },
            
            removePill: function(item) {
                if (!item || !item.parentNode || item.classList.contains('apt-di-leave')) return;
                item.classList.remove('active');
                item.classList.add('apt-di-leave');
                item.onclick = null;
                setTimeout(() => { if (item.parentNode) item.parentNode.removeChild(item); }, 300);
            },

            renderQueueStatus: function(currentTaskName = null) {
                if (!this.statusPill) return;
                const Scheduler = window.parent.AptSystem.Scheduler;
                const hasTask = Scheduler.isProcessing || Scheduler.queue.length > 0;
                
                if (!hasTask) {
                    this.statusPill.classList.remove('active');
                    setTimeout(() => { this.statusPill.style.display = 'none'; }, 300);
                    return;
                }
                
                this.statusPill.style.display = 'flex';
                let html = `<div class="apt-di-spinner"></div>`;
                if (currentTaskName) html += `<div class="apt-di-text">执行中: ${this.escapeHtml(currentTaskName)}</div>`;
                else html += `<div class="apt-di-text">系统引擎分析中...</div>`;
                if (Scheduler.queue.length > 0) html += `<div class="apt-di-badge">+ ${Scheduler.queue.length} 等待</div>`;
                
                this.statusPill.innerHTML = html;
                setTimeout(() => this.statusPill.classList.add('active'), 10);
            },

            escapeHtml: function(text) {
                const div = window.parent.document.createElement('div');
                div.textContent = typeof text === 'string' ? text : JSON.stringify(text);
                return div.innerHTML;
            }
        }
    };

    const styles = `
    :host {
        -webkit-font-smoothing: antialiased !important;
        -moz-osx-font-smoothing: grayscale !important;
        all: initial !important; 
        font-family: "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 14px !important;
        line-height: 1.5 !important;
        color: var(--apt-text-main) !important;
        letter-spacing: normal !important;
        text-transform: none !important;

        --apt-bg-base: #f4f4f5; 
        --apt-bg-surface: #ffffff;
        --apt-bg-surface-hover: #fafafa;
        --apt-bg-input: #f4f4f5;
        --apt-border: #e4e4e7;
        --apt-border-focus: #b48c52;
        
        --apt-text-main: #27272a;
        --apt-text-sub: #52525b;
        --apt-text-muted: #a1a1aa;
        --apt-accent: #b48c52;
        --apt-accent-hover: #9c7844;
        --apt-shadow: rgba(0, 0, 0, 0.08);
        --apt-mask: rgba(0, 0, 0, 0.4);

        --room-bed-bg: #fdf2f8;
        --room-bed-text: #831843;
        --room-bed-border: #fbcfe8;
        --room-func-bg: #fffbeb;
        --room-func-text: #78350f;
        --room-func-border: #fde68a;
        --room-landlord-bg: #e0e7ff;
        --room-landlord-text: #312e81;
        --room-landlord-border: #c7d2fe;
        --room-out-bg: #ecfdf5;
        --room-out-text: #064e3b;
        --room-out-border: #a7f3d0;
        --room-empty-bg: #fafafa;
        --room-empty-text: #a1a1aa;
        --room-empty-border: #d4d4d8;
    }

    :host(.dark-theme) {
        --apt-bg-base: #09090b;
        --apt-bg-surface: #18181b;
        --apt-bg-surface-hover: #27272a;
        
        --apt-bg-input: rgba(255, 255, 255, 0.04); 
        --apt-border: rgba(255, 255, 255, 0.08); 
        --apt-border-focus: #d4af37;
        
        --apt-text-main: #f4f4f5;
        --apt-text-sub: #a1a1aa;
        --apt-text-muted: #71717a;
        --apt-accent: #d4af37;
        --apt-accent-hover: #fcd34d;
        --apt-shadow: rgba(0, 0, 0, 0.6);
        --apt-mask: rgba(0, 0, 0, 0.85); 

        --room-bed-bg: #2d131f;
        --room-bed-text: #fbcfe8;
        --room-bed-border: #831843;
        --room-func-bg: #2d230e;
        --room-func-text: #fde68a;
        --room-func-border: #78350f;
        --room-landlord-bg: #1e1b4b;
        --room-landlord-text: #e0e7ff;
        --room-landlord-border: #312e81;
        --room-out-bg: #06261c;
        --room-out-text: #a7f3d0;
        --room-out-border: #064e3b;
        --room-empty-bg: #18181b;
        --room-empty-text: #71717a;
        --room-empty-border: #3f3f46;

        --tenant-status-border: #059669;
        --tenant-status-text: #34d399;
    }

    :host *, :host *::before, :host *::after { box-sizing: border-box !important; text-shadow: none !important; font-family: inherit !important; }
    .apt-no-select { user-select: none !important; -webkit-user-select: none !important; -webkit-user-drag: none !important; }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { 
        background-color: rgba(161, 161, 170, 0.4); 
        border-radius: 6px; 
        border: 2px solid transparent; 
        background-clip: content-box; 
        transition: background-color 0.2s;
    }
    ::-webkit-scrollbar-thumb:hover { background-color: rgba(161, 161, 170, 0.7); }
    :host(.dark-theme) ::-webkit-scrollbar-thumb { background-color: rgba(113, 113, 122, 0.5); }
    :host(.dark-theme) ::-webkit-scrollbar-thumb:hover { background-color: rgba(161, 161, 170, 0.8); }

    .room-card, .btn-action, .dock-btn, .add-floor-btn, .grid-cell {
        position: relative;
        top: 0;
        transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    .room-card::after, .btn-action::after, .dock-btn::after, .add-floor-btn::after, .grid-cell::after {
    content: '';
    position: absolute;
    left: 0; 
    right: 0; 
    bottom: -10px; 
    height: 10px; 
    background: transparent;
    }
    
    .del-floor-btn {
        transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
    }

    #${CONFIG.ballId} {
        position: fixed; width: 60px; height: 60px; top: 150px; left: 0; background: var(--apt-bg-surface);
        border-radius: 50%; border: 2px solid var(--apt-accent); display: flex; align-items: center; justify-content: center;
        cursor: grab; z-index: 999999; font-size: 15px; font-weight: 900; color: var(--apt-accent); box-shadow: 0 4px 15px var(--apt-shadow); transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); touch-action: none; letter-spacing: -0.5px;
    }
    #${CONFIG.ballId}:hover { box-shadow: 0 6px 20px rgba(180, 140, 82, 0.3); }

    #${CONFIG.panelId} {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 95%; max-width: 1400px; height: 90%; max-height: 950px;
        background: var(--apt-bg-base); border: 1px solid var(--apt-border); border-radius: 20px; z-index: 999998; display: none; flex-direction: column;
        box-shadow: 0 25px 60px var(--apt-shadow); overflow: hidden;
    }
    #${CONFIG.panelId}.active { display: flex; animation: aptZoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }

    .apt-header { padding: 18px 40px; background: var(--apt-bg-surface); border-bottom: 1px solid var(--apt-border); display: flex; justify-content: space-between; align-items: center; cursor: move; touch-action: none; z-index: 20; }
    .header-title { font-size: 22px; font-weight: 900; color: var(--apt-text-main); pointer-events: none; letter-spacing: 0.5px; text-shadow: 0 2px 4px var(--apt-shadow); }
    .header-info { font-size: 12px; color: var(--apt-text-muted); font-weight: 500; display: flex; gap: 15px; pointer-events: none; margin-top: 4px; }
    .money-badge { background: var(--apt-bg-input); padding: 8px 24px; border-radius: 8px; font-size: 15px; color: var(--apt-text-main); font-weight: 700; border: 1px solid var(--apt-border); pointer-events: none; font-variant-numeric: tabular-nums; }

    .apt-viewport { flex: 1; position: relative; overflow: hidden; background: var(--apt-bg-base); cursor: grab; touch-action: none; }
    
    #apt-canvas { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; gap: 0; align-items: center; padding: 60px; transform-origin: center center; border-radius: 20px; }

    .floor-wrapper { display: flex; gap: 0; align-items: stretch; width: max-content; position: relative; margin-bottom: -1px; }
    
    .floor-side { width: 180px; flex-shrink: 0; display: flex; flex-direction: column; padding: 0 20px; } 
    
    .floor-center { width: 800px; position: relative; display: flex; flex-direction: column; background: var(--apt-bg-surface); border: 1px solid var(--apt-border); padding: 16px 20px; transition: background-color 0.3s; z-index: 1; }
    
    .floor-wrapper:first-child .floor-center { border-top-left-radius: 16px; border-top-right-radius: 16px; }
    .floor-wrapper:last-child .floor-center { border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; }

    .floor-row { display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .floor-label { font-size: 11px; color: var(--apt-text-muted); font-weight: 700; letter-spacing: 1px; margin-left: 4px; pointer-events: none; }
    .room-track { display: flex; flex: 1; min-height: 110px; gap: 8px; border-radius: 8px; padding: 0; }

    .del-floor-btn { position: absolute; right: -60px; top: 50%; margin-top: -15px; background: transparent; color: #ef4444; border: 1px solid #ef4444; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 11px; opacity: 0; }
    .floor-center:hover .del-floor-btn { opacity: 1; right: -70px; }
    .del-floor-btn:hover:not([disabled]) { background: #ef4444; color: #fff; margin-top: -17px; }
    .del-floor-btn[disabled] { opacity: 0 !important; cursor: not-allowed; }
    
    .add-floor-btn { width: 800px; padding: 14px; background: transparent; border: 1px dashed var(--apt-border-focus); color: var(--apt-accent); font-weight: 600; border-radius: 12px; cursor: pointer; text-align: center; font-size: 13px; margin: 15px 0; }
    .add-floor-btn:hover { background: var(--apt-bg-surface); border-style: solid; top: -2px; }

    .room-card { 
        border-radius: 12px !important; overflow: hidden !important; isolation: isolate; 
        display: flex; flex-direction: column; justify-content: center; align-items: center; 
        cursor: pointer; border: 1px solid; 
    }
    .room-card:hover { top: -4px; border-color: var(--apt-accent) !important; z-index: 10; box-shadow: 0 10px 25px var(--apt-shadow); }
    
    .room-card.bedroom { background: var(--room-bed-bg); color: var(--room-bed-text); border-color: var(--room-bed-border); }
    .room-card.landlord { background: var(--room-landlord-bg); color: var(--room-landlord-text); border-color: var(--room-landlord-border); }
    .room-card.func { background: var(--room-func-bg); color: var(--room-func-text); border-color: var(--room-func-border); }
    .room-card.outdoor { background: var(--room-out-bg); color: var(--room-out-text); flex: 1; height: 100%; border-color: var(--room-out-border); border-radius: 12px !important; } 
    .room-card.empty { background: var(--room-empty-bg); border-color: var(--room-empty-border); border-style: dashed; color: var(--room-empty-text); }
    .room-card.empty:hover { border-style: solid; color: var(--apt-accent); background: var(--apt-bg-surface); }
    
    .room-name { font-size: 14px; font-weight: 700; padding: 0 4px; margin-bottom: 4px; line-height: 1.2; text-align: center; z-index: 2; position: relative; }
    .room-occ { font-size: 11px; font-weight: 500; opacity: 0.8; z-index: 2; position: relative; }
    .room-tag { position: absolute; top: 6px; left: 6px; font-size: 9px; font-weight: 700; opacity: 0.6; z-index: 2; }

    .apt-footer { padding: 12px 40px; background: var(--apt-bg-surface); border-top: 1px solid var(--apt-border); display: flex; justify-content: center; align-items: center; gap: 25px; z-index: 10; border-radius: 0 0 20px 20px; }
    .dock-plugins { display: flex; gap: 20px; border-right: 1px solid var(--apt-border); padding-right: 25px; margin-right: 5px; }
    .dock-btn { background: transparent; border: none; color: var(--apt-text-sub); font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 8px; font-weight: 600; outline: none; }
    .dock-btn:hover:not(.disabled) { background: var(--apt-bg-input); color: var(--apt-text-main); top: -2px; }
    .dock-btn.close-variant:hover { background: #fee2e2; color: #dc2626; }
    .dock-btn.disabled { opacity: 0.4; cursor: not-allowed; }

    .modal-overlay { position: absolute; inset: 0; background: var(--apt-mask); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 10005; display: none; justify-content: center; align-items: center; }
    .modal-overlay.open { display: flex; animation: aptFadeIn 0.2s ease-out; }
    .modal-box { background: var(--apt-bg-surface); border: 1px solid var(--apt-border); border-radius: 20px; display: flex; flex-direction: column; box-shadow: 0 25px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05) inset; position: relative; overflow: hidden; }
    .modal-header { padding: 20px 30px; background: var(--apt-bg-surface); border-bottom: 1px solid var(--apt-border); display: flex; justify-content: space-between; align-items: center; color: var(--apt-text-main); font-weight: 700; font-size: 16px; }
    .close-modal-btn { position: absolute; top: 16px; right: 20px; width: 30px; height: 30px; border-radius: 6px; background: transparent; border: none; cursor: pointer; font-size: 20px; color: var(--apt-text-muted); font-weight: 300; display: flex; align-items: center; justify-content: center; transition: 0.2s; z-index: 10010; outline: none; line-height: 1; }
    .close-modal-btn:hover { 
        background: rgba(239, 68, 68, 0.1); 
        color: #ef4444; 
        transform: rotate(90deg) scale(1.1); 
    }

    .modal-box.split-layout { 
        max-width: 900px; 
        flex-direction: row; 
        height: 680px; 
        min-height: 480px; 
        max-height: 85vh; 
        width: 90%; 
    }
    .modal-box.single-layout { max-width: 420px; max-height: 80vh; width: 90%; overflow-y: auto; }
    .split-col { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 30px; position: relative; }
    .col-room-info { 
        background: var(--apt-bg-base); 
        border-right: 1px solid var(--apt-border); 
        flex: 0.8; 
    }
    
    .col-tenant-info { background: var(--apt-bg-surface); position: relative; flex: 1.2; padding-top: 55px; } 
    
    .col-title { font-size: 15px; font-weight: 700; color: var(--apt-text-main); margin-bottom: 24px; letter-spacing: 0.5px; } 

    .settings-sidebar { width: 220px; background: var(--apt-bg-input); border-right: 1px solid var(--apt-border); display: flex; flex-direction: column; padding: 30px 0; }
    .settings-tab { padding: 12px 30px; cursor: pointer; font-weight: 600; color: var(--apt-text-sub); font-size: 13px; transition: 0.2s; border-left: 3px solid transparent; }
    .settings-tab:hover { color: var(--apt-text-main); }
    .settings-tab.active { background: var(--apt-bg-surface); color: var(--apt-accent); border-left-color: var(--apt-accent); }
    .settings-content { flex: 1; background: var(--apt-bg-surface); padding: 60px 40px 40px 40px; overflow-y: auto; }
    .settings-pane { display: none; flex-direction: column; }
    .settings-pane.active { display: flex; animation: aptFadeIn 0.3s; }

    .archive-tabs { 
        display: flex; 
        background: var(--apt-bg-input); 
        border-radius: 8px; 
        padding: 4px; 
        margin-bottom: 25px; 
        border: 1px solid var(--apt-border); 
    }
    .archive-tab { 
        flex: 1; text-align: center; padding: 8px; border-radius: 6px; 
        cursor: pointer; font-size: 13px; font-weight: 600; 
        color: var(--apt-text-sub); transition: all 0.25s ease; 
    }
    .archive-tab:hover { color: var(--apt-text-main); }
    .archive-tab.active { 
        background: var(--apt-bg-surface); 
        color: var(--apt-text-main); 
        box-shadow: 0 2px 8px var(--apt-shadow); 
    }

    :host(.dark-theme) .archive-tab.active {
        box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.2), 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .detail-row { margin-bottom: 12px; }
    .detail-label { display: block; font-size: 11px; color: var(--apt-text-muted); font-weight: 600; margin-bottom: 4px; letter-spacing: 0.5px; }
    .detail-value { font-weight: 500; color: var(--apt-text-main); line-height: 1.6; font-size: 13px; white-space: pre-wrap; padding-bottom: 8px; border-bottom: 1px solid var(--apt-border); }

    .input-group { margin-bottom: 24px; width: 100%; }
    .input-label { display: block; margin-bottom: 10px; font-size: 12px; color: var(--apt-text-sub); font-weight: 600; }
    .modal-input { 
        width: 100%; 
        padding: 12px 16px; 
        background: var(--apt-bg-input); 
        border: 1px solid transparent; 
        color: var(--apt-text-main); 
        border-radius: 8px; 
        font-size: 14px; 
        transition: all 0.25s ease; 
        outline: none; 
    }
    .modal-input:hover {
        background: var(--apt-bg-surface-hover);
    }
    .modal-input:focus { 
        background: var(--apt-bg-surface);
        border-color: var(--apt-accent); 
        box-shadow: 0 0 0 1px var(--apt-accent), 0 0 0 4px rgba(180, 140, 82, 0.15); 
    }
    
    select.modal-input {
        appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 12px center; background-size: 16px; padding-right: 36px; cursor: pointer;
    }
    
    .btn-action { 
        width: 100%; 
        padding: 12px 20px; 
        background: var(--apt-accent); 
        color: #ffffff; 
        border: none; 
        border-radius: 8px; 
        font-weight: 600; 
        cursor: pointer; 
        margin-top: 10px; 
        font-size: 14px; 
        outline: none; 
        letter-spacing: 0.5px; 
        transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
        box-shadow: 0 4px 12px rgba(180, 140, 82, 0.2);
    }
    .btn-action:hover { 
        top: -2px; 
        background: var(--apt-accent-hover);
        box-shadow: 0 6px 16px rgba(180, 140, 82, 0.35); 
    }
    .btn-action:active { 
        top: 0; 
        transform: scale(0.98); 
        box-shadow: 0 2px 4px rgba(180, 140, 82, 0.15); 
    }
    .btn-action.danger { 
        background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; box-shadow: none;
    }
    .btn-action.danger:hover { 
        background: #dc2626; color: #fff; border-color: #dc2626; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
    }
    
    :host(.dark-theme) .btn-action.danger { 
        background: rgba(239, 68, 68, 0.1); 
        color: #f87171; /* 柔和一点的红色 */
        border: 1px solid rgba(239, 68, 68, 0.2); 
        box-shadow: none;
    }
    :host(.dark-theme) .btn-action.danger:hover { 
        background: #ef4444; 
        color: #ffffff; 
        border-color: #ef4444; 
        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4); 
    }

    .grid-selector { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 20px 0; }
    .grid-cell { 
        aspect-ratio: 1; 
        background: var(--apt-bg-input); 
        border: 1px solid transparent; 
        border-radius: 6px; 
        display: flex; align-items: center; justify-content: center; 
        font-size: 14px; color: var(--apt-text-sub); 
        cursor: pointer; font-weight: 600; 
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); /* 引入弹性动画 */
    }
    .grid-cell:hover:not(.occupied) { 
        background: var(--apt-bg-surface);
        border: 1px solid var(--apt-accent); 
        color: var(--apt-accent); 
        transform: translateY(-2px); 
    }
    .grid-cell.selected { 
        background: var(--apt-accent); 
        color: #fff; 
        border: 1px solid var(--apt-accent); 
        transform: scale(1.05);
        box-shadow: 0 4px 10px rgba(180, 140, 82, 0.3);
    }

    @keyframes aptZoomIn { 0% { opacity: 0; transform: translate(-50%, -45%) scale(0.95); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
.modal-overlay.open .modal-box { animation: aptModalBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes aptModalBounce { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
    @keyframes aptFadeIn { from { opacity: 0; } to { opacity: 1; } }

/* ================= 新增：瀑布流灵动岛样式 ================= */
    /* 通知容器：完全透明，鼠标穿透，负责管理排列方向 */
    .apt-island-container {
        position: fixed !important;
        z-index: 9999999 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 12px !important;
        pointer-events: none !important;
        align-items: center !important;
        transition: all 0.3s ease !important;
    }
    .apt-island-container.pos-top { top: 25px !important; left: 0 !important; right: 0 !important; }
    /* 底部模式时，新来的消息往上顶 */
    .apt-island-container.pos-bottom { bottom: 25px !important; left: 0 !important; right: 0 !important; flex-direction: column-reverse !important; }
    .apt-island-container.pos-top-right { top: 25px !important; right: 25px !important; left: auto !important; align-items: flex-end !important; }

    /* 独立的通知胶囊 */
    .apt-di-item {
        all: initial !important; 
        width: max-content !important; min-width: 200px !important; max-width: 450px !important;
        background: var(--apt-bg-surface) !important; color: var(--apt-text-main) !important; border: 1px solid var(--apt-border) !important;
        font-family: inherit !important; font-size: 13px !important; font-weight: 600 !important; line-height: 1.5 !important;
        border-radius: 30px !important; padding: 12px 24px !important; 
        display: flex !important; align-items: center !important; justify-content: center !important; gap: 12px !important;
        box-shadow: 0 10px 30px var(--apt-shadow) !important; 
        pointer-events: auto !important; cursor: pointer !important;
        
        /* 入场前状态（默认） */
        opacity: 0 !important; 
        transform: translateY(-25px) scale(0.9) !important;
        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s, margin 0.3s ease, padding 0.3s ease !important;
    }
    
    /* 不同位置的不同入场方向适配 */
    .apt-island-container.pos-bottom .apt-di-item { transform: translateY(25px) scale(0.9) !important; }
    .apt-island-container.pos-top-right .apt-di-item { transform: translateX(40px) scale(0.9) !important; }

    /* 激活状态 */
    .apt-di-item.active {
        opacity: 1 !important; 
        transform: translate(0, 0) scale(1) !important;
    }
    
    /* 离场状态（平滑收缩并把空间还给其他胶囊） */
    .apt-di-item.apt-di-leave {
        opacity: 0 !important;
        transform: scale(0.8) !important;
        margin-top: -40px !important; /* 向上挤压空间，产生滑动的瀑布感 */
        padding-top: 0 !important; padding-bottom: 0 !important; height: 0 !important; overflow: hidden !important; border-width: 0 !important;
    }
    .apt-island-container.pos-bottom .apt-di-item.apt-di-leave { margin-top: 0 !important; margin-bottom: -40px !important; }

    /* 内部图标与文字 */
    .apt-di-icon { font-weight: 900 !important; font-size: 14px !important; display: flex !important; align-items: center !important; justify-content: center !important; width: 20px !important; height: 20px !important; border-radius: 50% !important; line-height: 1 !important; }
    .apt-di-success { color: #10b981 !important; } .apt-di-error { color: #ef4444 !important; } .apt-di-warning { color: #f59e0b !important; } .apt-di-info { color: var(--apt-accent) !important; }
    .apt-di-text { flex: 1 !important; letter-spacing: 0.5px !important; color: var(--apt-text-main) !important; font-size: 13px !important; line-height: 1.4 !important; word-break: break-all !important; }
    
    .apt-di-spinner { width: 16px !important; height: 16px !important; border: 2px solid var(--apt-border) !important; border-top-color: var(--apt-accent) !important; border-radius: 50% !important; animation: apt-spin 0.8s linear infinite !important; }
    .apt-di-badge { background: var(--apt-accent) !important; color: #ffffff !important; padding: 2px 8px !important; border-radius: 12px !important; font-size: 11px !important; font-weight: 700 !important; margin-left: 8px !important; line-height: 1.2 !important; }
    @keyframes apt-spin { to { transform: rotate(360deg); } }

    /* ================= 新增：控制台抽屉样式 ================= */
    .apt-drawer-overlay { position: absolute; inset: 0; background: transparent; z-index: 10001; display: none; }
    .apt-drawer-overlay.open { display: block; }
    
    .apt-drawer { 
        position: absolute; top: 0; right: 0; bottom: 0; width: 520px; max-width: 90vw;
        background: var(--apt-bg-surface); border-left: 1px solid var(--apt-border);
        box-shadow: -15px 0 40px var(--apt-shadow); z-index: 10002;
        display: flex; flex-direction: column; transform: translateX(100%);
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .apt-drawer.open { transform: translateX(0); }

    .drawer-header { padding: 20px 25px 15px; border-bottom: 1px solid var(--apt-border); display: flex; justify-content: space-between; align-items: center; background: var(--apt-bg-surface); }
    .drawer-title { font-size: 16px; font-weight: 800; color: var(--apt-text-main); display: flex; align-items: center; gap: 8px; }
    .drawer-close { background: transparent; border: none; width: 32px; height: 32px; border-radius: 6px; color: var(--apt-text-muted); font-size: 20px; font-weight: 300; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; outline: none; line-height: 1; }
    .drawer-close:hover { background: var(--apt-bg-input); color: var(--apt-text-main); transform: rotate(90deg); }

    .drawer-toolbar { padding: 12px 25px; background: var(--apt-bg-base); border-bottom: 1px solid var(--apt-border); display: flex; flex-direction: column; gap: 12px; }
    .drawer-tabs { display: flex; gap: 8px; }
    .d-tab { flex: 1; padding: 8px; text-align: center; background: var(--apt-bg-surface); border: 1px solid var(--apt-border); border-radius: 8px; color: var(--apt-text-sub); font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
    .d-tab:hover { border-color: var(--apt-accent); color: var(--apt-accent); }
    .d-tab.active { background: var(--apt-accent); color: #fff; border-color: var(--apt-accent); box-shadow: 0 4px 12px rgba(180, 140, 82, 0.2); }

    .drawer-tools-row { display: flex; gap: 10px; align-items: center; }
    .d-search { flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--apt-border); background: var(--apt-bg-surface); color: var(--apt-text-main); font-size: 12px; outline: none; }
    .d-search:focus { border-color: var(--apt-accent); }
    
    .d-btn { padding: 8px 12px; background: var(--apt-bg-surface); border: 1px solid var(--apt-border); border-radius: 6px; color: var(--apt-text-sub); font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s; white-space: nowrap; }
    .d-btn:hover { background: var(--apt-bg-input); color: var(--apt-text-main); }
    .d-btn.active-lock { background: #ecfdf5; color: #059669; border-color: #34d399; }
    .apt-drawer.dark-theme .d-btn.active-lock { background: #064e3b; color: #34d399; border-color: #059669; }

    .filter-group { display: flex; gap: 6px; margin-top: 4px; }
    .f-tag { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; border: 1px solid var(--apt-border); color: var(--apt-text-muted); cursor: pointer; background: transparent; transition: 0.2s; }
    .f-tag.active { border-color: var(--apt-text-sub); color: var(--apt-text-main); background: var(--apt-bg-input); }
    .f-tag.active.log-err { border-color: #ef4444; color: #ef4444; background: #fef2f2; }
    .apt-drawer.dark-theme .f-tag.active.log-err { background: rgba(239, 68, 68, 0.1); }
    .f-tag.active.log-succ { border-color: #10b981; color: #10b981; background: #ecfdf5; }
    .apt-drawer.dark-theme .f-tag.active.log-succ { border-color: #059669; background: rgba(16, 185, 129, 0.1); color: #34d399; }

    .drawer-content { flex: 1; overflow-y: auto; padding: 20px 25px; font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 12px; background: var(--apt-bg-surface); scroll-behavior: smooth; }
    
    .log-item { 
        padding: 12px 16px; 
        margin-bottom: 10px;
        border-radius: 8px; 
        background: var(--apt-bg-base); 
        border-left: 4px solid var(--apt-border); 
        word-break: break-all; 
        transition: all 0.2s ease; 
        box-shadow: 0 2px 5px var(--apt-shadow);
    }
    .log-item:hover { filter: brightness(0.95); }
    .apt-drawer.dark-theme .log-item:hover { filter: brightness(1.2); }
    .log-meta { font-size: 11px; color: var(--apt-text-muted); margin-bottom: 6px; display: flex; justify-content: space-between; font-weight: bold; }
    .log-item.log-error { border-left-color: #ef4444; background: #fef2f2; color: #991b1b; }
    .log-item.log-warn { border-left-color: #f59e0b; background: #fffbeb; color: #92400e; }
    .log-item.log-info { border-left-color: #3b82f6; }
    .log-item.log-success { border-left-color: #10b981; background: #ecfdf5; color: #065f46; }
    
    .apt-drawer.dark-theme .log-item.log-error { background: rgba(239, 68, 68, 0.1); color: #fca5a5; }
    .apt-drawer.dark-theme .log-item.log-warn { background: rgba(245, 158, 11, 0.1); color: #fcd34d; }
    .apt-drawer.dark-theme .log-item.log-success { background: rgba(16, 185, 129, 0.1); color: #6ee7b7; }

    .api-card { background: var(--apt-bg-base); border: 1px solid var(--apt-border); border-radius: 12px; margin-bottom: 15px; overflow: hidden; transition: 0.2s; }
    .api-card:hover { border-color: var(--apt-accent); box-shadow: 0 4px 12px var(--apt-shadow); }
    .api-header { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; background: var(--apt-bg-input); cursor: pointer; }
    .api-model { color: var(--apt-text-main); font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .api-time { color: var(--apt-text-muted); font-size: 11px; }
    .api-body { padding: 16px; display: none; border-top: 1px solid var(--apt-border); }
    .api-body.open { display: block; }
    
    .msg-block { margin-bottom: 16px; background: var(--apt-bg-surface); padding: 12px; border-radius: 8px; border: 1px solid var(--apt-border); white-space: pre-wrap; position: relative; }
    .role-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; margin-bottom: 8px; letter-spacing: 0.5px; }
    .role-system { background: #fef3c7; color: #d97706; }
    .role-user { background: #dbeafe; color: #2563eb; }
    .role-assistant { background: #d1fae5; color: #059669; }
    
    .apt-drawer.dark-theme .role-system { background: rgba(217, 119, 6, 0.2); color: #fcd34d; }
    .apt-drawer.dark-theme .role-user { background: rgba(37, 99, 235, 0.2); color: #93c5fd; }
    .apt-drawer.dark-theme .role-assistant { background: rgba(5, 150, 105, 0.2); color: #6ee7b7; }

    .copy-btn { position: absolute; top: 10px; right: 10px; background: var(--apt-bg-input); border: 1px solid var(--apt-border); color: var(--apt-text-sub); border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; font-weight: 600; }
    .copy-btn:hover { color: var(--apt-accent); border-color: var(--apt-accent); background: var(--apt-bg-surface); }
    `;
    

    const styleEl = pDoc.createElement('style');
    styleEl.textContent = styles;
    shadow.appendChild(styleEl);

    const wrapper = pDoc.createElement('div');
    wrapper.innerHTML = `
    <div id="${CONFIG.ballId}">AptOS</div>
    <div id="${CONFIG.panelId}">
        <div class="apt-header" id="apt-title-bar">
            <div class="header-left">
                <div class="header-title">落日与海湾别墅</div>
                <div class="header-info"><span id="apt-time-weather">数据拉取中...</span></div>
            </div>
            <div class="money-badge" id="apt-money-val">$ 0</div>
        </div>
        <div class="apt-viewport" id="apt-view">
            <div id="apt-canvas"></div>
            <button id="reset-zoom" style="position:absolute; bottom:30px; right:30px; width:44px; height:44px; border-radius:12px; border:1px solid rgba(255,255,255,0.2); background:var(--apt-bg-surface); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); cursor:pointer; font-weight:700; color:var(--apt-text-main); z-index:10; transition:all 0.2s; box-shadow: 0 4px 15px rgba(0,0,0,0.08);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">1:1</button>
        </div>
        <div class="apt-footer">
            <div class="dock-plugins" id="dock-plugins-container"></div>

            <button id="dock-recruit" class="dock-btn"><span class="dock-text">发布招募</span></button>
            <button id="dock-console" class="dock-btn"><span class="dock-text">控制台</span></button>
            <button id="dock-settings" class="dock-btn"><span class="dock-text">控制面板</span></button>
            <button id="dock-close" class="dock-btn close-variant"><span class="dock-text">关闭系统</span></button>
        </div>

        <div id="modal-settings" class="modal-overlay">
            <div class="modal-box split-layout">
                <div class="settings-sidebar">
                    <div class="col-title" style="padding-left: 30px; margin-top: 15px; font-size: 18px; font-weight: 900; letter-spacing: 2px;">控制面板</div>
                    <div id="settings-tabs-container" style="margin-top:10px;">
                        <div class="settings-tab active" data-target="pane-core-api">API 配置</div>
                        <div class="settings-tab" data-target="pane-display">外观与显示</div>
                    </div>
                </div>
                <div style="flex:1; display:flex; flex-direction:column; position:relative; overflow:hidden;">
                    <div class="modal-header" style="padding: 15px 40px; border-bottom: 1px solid var(--apt-border); display: flex; justify-content: space-between; align-items: center; background: var(--apt-bg-surface);">
                        <span class="modal-title-text" id="settings-dynamic-title" style="font-size: 16px; font-weight: 700;">API 配置</span>
                        <button class="drawer-close close-modal-btn" style="position: static; margin-right: -10px;">×</button>
                    </div>
                    <div class="settings-content" id="settings-panes-container" style="padding-top: 30px; flex: 1; overflow-y: auto;">
                        <div id="pane-core-api" class="settings-pane active">
                            <button id="btn-sync-tavern-api" class="btn-action" style="margin-bottom: 20px; background:var(--apt-bg-input); color:var(--apt-text-main); border:1px solid var(--apt-accent);">一键同步酒馆当前 API</button>
                            <div class="input-group">
                                <label class="input-label">接口渠道</label>
                                <select id="api-provider" class="modal-input">
                                    <option value="openai">OpenAI</option>
                                    <option value="claude">Claude</option>
                                    <option value="deepseek">DeepSeek</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label class="input-label">API URL</label>
                                <input type="text" id="api-url" class="modal-input" placeholder="例如: https://api.openai.com/v1">
                            </div>
                            <div class="input-group">
                                <label class="input-label">API KEY</label>
                                <div style="position:relative; display:flex; align-items:center;">
                                    <input type="password" id="api-key" class="modal-input" placeholder="sk-..." style="padding-right: 50px;">
                                    <button id="toggle-pwd" style="position:absolute; right:10px; background:none; border:none; cursor:pointer; color:var(--apt-text-muted); font-size:12px; font-weight:bold;">显示</button>
                                </div>
                            </div>
                            <div class="input-group">
                                <label class="input-label">Model</label>
                                <div style="display:flex; gap:10px;">
                                    <input type="text" id="api-model" class="modal-input" placeholder="gpt-4o-mini" style="flex:1;">
                                    <select id="api-model-select" class="modal-input" style="display:none; flex:1;"></select>
                                    <button id="btn-fetch-models" class="btn-action" style="margin-top:0; width:120px; font-size:13px; background:var(--apt-bg-input); color:var(--apt-text-main); border:1px solid var(--apt-border);">获取模型</button>
                                </div>
                            </div>
                            <button id="btn-save-api" class="btn-action" style="margin-top:20px;">保存并生效</button>
                        </div>
                        
                        <div id="pane-display" class="settings-pane">
                            <div class="input-group">
                                <label class="input-label">系统主题</label>
                                <select id="ui-theme" class="modal-input">
                                    <option value="light">光辉白日 (Light Mode)</option>
                                    <option value="dark">静谧夜晚 (Dark Mode)</option>
                                </select>
                            </div>
                            <div class="input-group">
                                <label class="input-label">通知弹窗位置</label>
                                <select id="ui-island-pos" class="modal-input">
                                    <option value="top">顶部居中落下</option>
                                    <option value="bottom">底部居中弹起</option>
                                    <option value="top-right">右上角滑入</option>
                                </select>
                            </div>
                            <button id="btn-save-display" class="btn-action" style="margin-top:20px;">保存外观设置</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="modal-info" class="modal-overlay">
            <div class="modal-box split-layout" id="info-modal-box">
                <button class="close-modal-btn">×</button>
                <div class="split-col col-room-info" id="col-room"></div>
                <div class="split-col col-tenant-info" id="col-tenant" style="display:none;">
                    <div class="archive-tabs" id="archive-tabs" style="display:none;">
                        <div class="archive-tab active" data-tab="surface">基础信息</div>
                        <div class="archive-tab" data-tab="deep">社交关系</div>
                    </div>
                    <div id="tenant-content-area" style="flex:1; overflow-y:auto; overflow-x:hidden;"></div>
                </div>
            </div>
        </div>

        <div id="modal-build" class="modal-overlay">
            <div class="modal-box single-layout" style="padding-bottom:10px;">
                <button class="close-modal-btn">×</button>
                <div class="modal-header" style="border:none; padding-bottom:0;"><span class="modal-title-text">规划施工</span></div>
                <div style="padding:20px 30px;">
                    <div class="input-group">
                        <label class="input-label">选中楼层: <span id="build-target-name" style="color:var(--apt-accent)"></span></label>
                        <div id="grid-selector" class="grid-selector"></div>
                    </div>
                    <div class="input-group">
                        <label class="input-label">改建类型</label>
                        <select id="build-type" class="modal-input">
                            <option value="卧室">卧室</option>
                            <option value="功能性房间">功能性房间</option>
                        </select>
                    </div>
                    <div class="input-group">
                        <label class="input-label">装修名称/备注</label>
                        <input type="text" id="build-desc" class="modal-input" placeholder="例如：书房、粉色系...">
                    </div>
                    <button id="do-build" class="btn-action">填入施工指令</button>
                </div>
            </div>
        </div>

        <div id="modal-add-floor" class="modal-overlay">
            <div class="modal-box single-layout">
                <button class="close-modal-btn">×</button>
                <div class="modal-header" style="border:none; padding-bottom:0;"><span class="modal-title-text">扩建楼层</span></div>
                <div style="padding:20px 30px;">
                    <div class="input-group">
                        <label class="input-label">新楼层名称</label>
                        <input type="text" id="add-floor-name" class="modal-input" placeholder="例如：五楼、地下二楼...">
                    </div>
                    <input type="hidden" id="add-floor-pos">
                    <button id="do-add-floor" class="btn-action">填入扩建指令</button>
                </div>
            </div>
        </div>

        <div id="modal-recruit" class="modal-overlay">
            <div class="modal-box single-layout">
                <button class="close-modal-btn">×</button>
                <div class="modal-header" style="border:none; padding-bottom:0;"><span class="modal-title-text">发布招募</span></div>
                <div style="padding:20px 30px;">
                    <div class="input-group">
                        <label class="input-label">期望租客特征 (XP设定)</label>
                        <input type="text" id="recruit-desc" class="modal-input" placeholder="例：金发、傲娇大小姐...">
                    </div>
                    <button id="do-recruit" class="btn-action">填入招募广告</button>
                </div>
            </div>
        </div>

        <div id="modal-func-room" class="modal-overlay">
            <div class="modal-box single-layout">
                <button class="close-modal-btn">×</button>
                <div class="modal-header" style="border:none; padding-bottom:0;"><span class="modal-title-text">装修功能房</span></div>
                <div style="padding:20px 30px;">
                    <div class="input-group">
                         <label class="input-label">功能房名称 (如：书房、私人影院)</label>
                         <input type="text" id="func-room-input" class="modal-input" placeholder="请输入想要装修的功能名称...">
                    </div>
                    <button id="do-func-room" class="btn-action">确认施工指令</button>
                </div>
             </div>
        </div>        
 
        <div id="apt-drawer-mask" class="apt-drawer-overlay"></div>
        <div id="apt-console-drawer" class="apt-drawer">
            <div class="drawer-header">
                <div class="drawer-title">控制台</div>
                <button class="drawer-close" title="关闭面板">×</button>
            </div>
            
            <div class="drawer-toolbar">
                <div class="drawer-tabs">
                    <div class="d-tab active" data-tab="api">API 监听</div>
                    <div class="d-tab" data-tab="console">系统日志</div>
                </div>
                
                <div class="drawer-tools-row">
                    <input type="text" class="d-search" id="term-search-input" placeholder="输入关键字搜索...">
                    <button class="d-btn active-lock" id="btn-autoscroll" title="自动滚动到底部">追随</button>
                    <button class="d-btn" id="btn-clear-data" title="清空当前列表">清空</button>
                    <button class="d-btn" id="btn-copy-all" title="复制当前筛选出的所有日志">复制全部</button>
                </div>

                <div class="filter-group" id="term-filters" style="display: none;">
                    <button class="f-tag active" data-filter="all">ALL</button>
                    <button class="f-tag" data-filter="log">LOG</button>
                    <button class="f-tag" data-filter="info">INFO</button>
                    <button class="f-tag" data-filter="warn">WARN</button>
                    <button class="f-tag log-err" data-filter="error">ERROR</button>
                   <button class="f-tag log-succ" data-filter="success">SUCCESS</button> 
                </div>
            </div>

            <div class="drawer-content" id="term-content-area"></div>
        </div>
    </div>`;
    shadow.appendChild(wrapper);

    function initInteractions() {
        const $ = window.parent.jQuery;
        
        const ball = shadow.getElementById(CONFIG.ballId);
        const panel = shadow.getElementById(CONFIG.panelId);
        const view = shadow.getElementById('apt-view');
        const title = shadow.getElementById('apt-title-bar');
        const canvas = shadow.getElementById('apt-canvas');

        const currentTheme = window.parent.AptSystem.getSettings().displayConfig?.theme || 'light';
        if (currentTheme === 'dark') host.classList.add('dark-theme');

        let ballDrag = false, ballMoved = false, bOffset = { x: 0, y: 0 }, bStart = { x: 0, y: 0 };
        ball.addEventListener('pointerdown', (e) => {
            ballDrag = true; ballMoved = false; bStart = { x: e.clientX, y: e.clientY };
            const rect = ball.getBoundingClientRect(); bOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            ball.style.transition = 'none'; ball.style.cursor = 'grabbing';
            ball.setPointerCapture(e.pointerId); e.preventDefault();
        });
        ball.addEventListener('pointermove', (e) => {
            if (!ballDrag) return;
            if (Math.abs(e.clientX - bStart.x) > 5 || Math.abs(e.clientY - bStart.y) > 5) ballMoved = true;
            ball.style.left = (e.clientX - bOffset.x) + 'px'; ball.style.top = (e.clientY - bOffset.y) + 'px';
        });
        const endBallDrag = (e) => {
            if (!ballDrag) return; ballDrag = false; ball.releasePointerCapture(e.pointerId);
            ball.style.cursor = 'grab'; ball.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            const winW = window.parent.innerWidth; const rect = ball.getBoundingClientRect();
            ball.style.left = rect.left < winW / 2 ? '15px' : (winW - 75) + 'px';
            if (!ballMoved) { if (panel.classList.toggle('active')) renderMVU(); }
        };
        ball.addEventListener('pointerup', endBallDrag); ball.addEventListener('pointercancel', endBallDrag);

        let panelDrag = false, pOffset = { x: 0, y: 0 };
        title.addEventListener('pointerdown', (e) => {
            panelDrag = true; const rect = panel.getBoundingClientRect();
            pOffset = { x: e.clientX - (rect.left + rect.width / 2), y: e.clientY - (rect.top + rect.height / 2) };
            title.style.cursor = 'move'; title.setPointerCapture(e.pointerId); e.preventDefault();
        });
        title.addEventListener('pointermove', (e) => {
            if (!panelDrag) return;
            panel.style.left = (e.clientX - pOffset.x) + 'px'; panel.style.top = (e.clientY - pOffset.y) + 'px';
        });
        const endPanelDrag = (e) => { if (!panelDrag) return; panelDrag = false; title.releasePointerCapture(e.pointerId); title.style.cursor = 'move'; };
        title.addEventListener('pointerup', endPanelDrag); title.addEventListener('pointercancel', endPanelDrag);

        let isPanning = false, panStart = { x: 0, y: 0 };
        let panRAF = null;
        view.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.room-card, button, .dock-btn, .modal-box, .floor-label, .grid-cell')) return;
            isPanning = true; panStart = { x: e.clientX, y: e.clientY };
            view.style.cursor = 'grabbing'; view.setPointerCapture(e.pointerId); e.preventDefault();
        });
        view.addEventListener('pointermove', (e) => {
            if (!isPanning) return;
            if (panRAF) cancelAnimationFrame(panRAF);
            panRAF = requestAnimationFrame(() => {
                transform.x = Math.round(transform.x + (e.clientX - panStart.x)); 
                transform.y = Math.round(transform.y + (e.clientY - panStart.y)); 
                panStart = { x: e.clientX, y: e.clientY };
                canvas.style.transform = `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale})`;
            });
        });
        const endPan = (e) => { 
        if (!isPanning) return; 
        isPanning = false; 
        if (panRAF) { cancelAnimationFrame(panRAF); panRAF = null; }
        view.releasePointerCapture(e.pointerId); 
        view.style.cursor = 'grab'; 
        };
        view.addEventListener('pointerup', endPan); view.addEventListener('pointercancel', endPan);

        view.addEventListener('wheel', (e) => {
            e.preventDefault(); e.stopPropagation();
            transform.scale = Math.min(Math.max(0.3, transform.scale * (e.deltaY > 0 ? 0.9 : 1.1)), 3);
            canvas.style.transform = `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale})`;
        }, { passive: false });

        $(shadow).find('#reset-zoom').click(() => { transform = { scale: 1, x: 0, y: 0 }; canvas.style.transform = `translate(-50%, -50%) scale(1)`; });
        $(shadow).find('#dock-close').click(() => {
            panel.classList.remove('active');
            if (currentGraphAnimation) {
                cancelAnimationFrame(currentGraphAnimation);
                currentGraphAnimation = null;
                window.parent.AptSystem.log('AptOS 待机，物理引擎已强制休眠', 'warn');
            }
        });
        $(shadow).find('#dock-console').click(() => {
            const isDark = host.classList.contains('dark-theme');
            $(shadow).find('#apt-console-drawer').toggleClass('dark-theme', isDark);

            $(shadow).find('#apt-drawer-mask').addClass('open');
            setTimeout(() => $(shadow).find('#apt-console-drawer').addClass('open'), 10);
            
            debugAutoScrollLocked = true;
            $(shadow).find('#btn-autoscroll').addClass('active-lock');
            
            if (debugCurrentTab === 'api') renderAPIs(); else renderLogs();
        });
        $(shadow).find('.close-modal-btn').off('click').on('click', function() { 
            $(this).closest('.modal-overlay').removeClass('open'); 
            
            if (currentGraphAnimation) {
                cancelAnimationFrame(currentGraphAnimation);
                currentGraphAnimation = null;
                window.parent.AptSystem.log('物理引擎渲染帧已成功回收', 'warn');
            }
        });
        $(shadow).find('.close-modal-btn').off('click').on('click', function() { 
            $(this).closest('.modal-overlay').removeClass('open'); 
            if (currentGraphAnimation) {
                cancelAnimationFrame(currentGraphAnimation);
                currentGraphAnimation = null;
                window.parent.AptSystem.log('物理引擎渲染帧已成功回收', 'warn');
            }
        });

        $(shadow).find('.modal-overlay').on('mousedown', function(e) {
            if (e.target === this) {
                $(this).find('.close-modal-btn').click();
            }
        });
        const settingsBtn = $(shadow).find('#dock-settings');
        settingsBtn.click(() => {
            const settings = window.parent.AptSystem.getSettings();
            
            $(shadow).find('#api-provider').val(settings.apiConfig.provider || 'openai');
            $(shadow).find('#api-url').val(settings.apiConfig.apiUrl || '');
            $(shadow).find('#api-key').val(settings.apiConfig.apiKey || '');
            $(shadow).find('#api-model').val(settings.apiConfig.model || '').show();
            $(shadow).find('#api-model-select').hide();
            
            $(shadow).find('#ui-theme').val(settings.displayConfig?.theme || 'light');
            $(shadow).find('#ui-island-pos').val(settings.islandConfig?.position || 'top');
            $(shadow).find('.settings-tab, .settings-pane').removeClass('active');
            $(shadow).find('[data-target="pane-core-api"], #pane-core-api').addClass('active');
            $(shadow).find('#modal-settings').addClass('open');
        });

        $(shadow).find('#btn-sync-tavern-api').off('click').on('click', function() {
            const btn = $(this);
            btn.text('同步中...').css('opacity', '0.7');
            setTimeout(() => {
                const result = window.parent.AptSystem.syncTavernApiSettings();
                if (result.success) {
                    if (result.url) $(shadow).find('#api-url').val(result.url);
                    if (result.key) $(shadow).find('#api-key').val(result.key);
                    window.parent.AptSystem.showNotification('已成功抓取并应用酒馆当前 API 配置！', 'success');
                } else {
                    window.parent.AptSystem.showNotification('未在酒馆后台检测到有效的 API 填写记录', 'warning');
                }
                btn.text('一键同步酒馆当前 API').css('opacity', '1');
            }, 300);
        });

        $(shadow).find('#toggle-pwd').click(function() {
            const input = $(shadow).find('#api-key');
            if (input.attr('type') === 'password') {
                input.attr('type', 'text');
                $(this).text('隐藏');
            } else {
                input.attr('type', 'password');
                $(this).text('显示');
            }
        });

        $(shadow).find('#btn-fetch-models').click(async function() {
            const provider = $(shadow).find('#api-provider').val();
            if (provider !== 'openai') return window.parent.AptSystem.showNotification("仅支持 OpenAI 兼容接口自动获取模型", "warning");
            
            let base = $(shadow).find('#api-url').val().trim();
            const key = $(shadow).find('#api-key').val().trim();
            if (!key) return window.parent.AptSystem.showNotification("请先填写 API KEY", "error");

            const btnText = $(this);
            const originalText = btnText.text();
            btnText.text("获取中...").css('opacity', '0.7');

            try {
                while (base.endsWith("/")) base = base.slice(0, -1);
                const apiUrl = base.includes("/v1") ? base + "/models" : base + "/v1/models";
                const res = await fetch(apiUrl, { headers: { "Authorization": "Bearer " + key, "Accept": "application/json" } });
                
                if (!res.ok) throw new Error("连接失败，请检查 URL 和 KEY");
                const data = await res.json();
                
                let models = [];
                if (data?.data && Array.isArray(data.data)) models = data.data.filter(m => m && m.id).map(m => m.id);
                if (models.length === 0) return window.parent.AptSystem.showNotification("未获取到模型列表", "warning");

                const $select = $(shadow).find('#api-model-select');
                const $input = $(shadow).find('#api-model');
                
                $select.empty();
                models.forEach(m => $select.append(`<option value="${m}">${m}</option>`));
                $select.val(models[0]).show();
                $input.hide();
                $select.off('change').on('change', function() { $input.val($(this).val()); });
                $input.val(models[0]);

                window.parent.AptSystem.showNotification(`成功获取 ${models.length} 个模型`, "success");
            } catch (e) {
                window.parent.AptSystem.showNotification(e.message || "连接失败", "error");
            } finally {
                btnText.text(originalText).css('opacity', '1');
            }
        });

        $(shadow).find('#btn-save-api').click(() => {
            const config = {
                provider: $(shadow).find('#api-provider').val(),
                apiUrl: $(shadow).find('#api-url').val(),
                apiKey: $(shadow).find('#api-key').val(),
                model: $(shadow).find('#api-model').val()
            };
            window.parent.AptSystem.saveSettings({ apiConfig: config });
            window.parent.AptSystem.showNotification("设置已保存并生效", "success");
        });

        $(shadow).find('#btn-save-display').click(() => {
            const selectedTheme = $(shadow).find('#ui-theme').val();
            const selectedPos = $(shadow).find('#ui-island-pos').val(); 
            
            window.parent.AptSystem.saveSettings({ 
                displayConfig: { theme: selectedTheme },
                islandConfig: { position: selectedPos }
            });
            
            if (selectedTheme === 'dark') host.classList.add('dark-theme');
            else host.classList.remove('dark-theme');
            
            window.parent.AptSystem.Island.updatePosition(); 
            window.parent.AptSystem.showNotification("界面与通知外观设置已应用", "success");
        });

        $(shadow).find('#dock-recruit').click(function() {
            if ($(this).hasClass('disabled')) return;
            $(shadow).find('#modal-recruit').addClass('open');
        });
        
        $(shadow).find('#do-recruit').click(() => {
            const val = $(shadow).find('#recruit-desc').val().trim();
            if (val) fillChatCommand(`招募一名符合以下特征的租客：${val}`);
        });
        
        $(shadow).find('#do-func-room').click(() => {
            const funcName = $(shadow).find('#func-room-input').val().trim();
            if (funcName && currentRoomInfo) {
                fillChatCommand(`将【${currentRoomInfo.名称 || currentRoomInfo.id}】装修为功能性房间【${funcName}】`);
                $(shadow).find('#modal-func-room').removeClass('open');
                $(shadow).find('#modal-info').removeClass('open');
            } else {
                window.parent.AptSystem.showNotification('名字不能为空哦！', 'warning');
            }
        });
        $(shadow).find('#apt-canvas').off('click', '.add-floor-btn').on('click', '.add-floor-btn', function() {
            const pos = $(this).data('pos');
            $(shadow).find('#add-floor-pos').val(pos);
            $(shadow).find('#modal-add-floor').addClass('open');
        });

        $(shadow).find('#do-add-floor').click(() => {
            const floorName = $(shadow).find('#add-floor-name').val().trim();
            const position = $(shadow).find('#add-floor-pos').val();
            if (!floorName) return window.parent.AptSystem.showNotification('请输入楼层名称！', 'warning');
            fillChatCommand(`新建楼层【${floorName}】（${position === 'top' ? '向上扩展' : '向下扩展'}）`);
        });

        $(shadow).find('#apt-canvas').on('click', '.del-floor-btn', function() {
            if ($(this).prop('disabled')) return;
            const floorName = $(this).data('floor');
            fillChatCommand(`拆除楼层【${floorName}】`);
        });

        let buildSelection = { start: null, end: null };
        window.openBuildGrid = function(floorName, capacity = 10) {
            currentBuildFloor = floorName; buildSelection = { start: null, end: null };
            $(shadow).find('#build-target-name').text(floorName);
            const $grid = $(shadow).find('#grid-selector').empty();
            const occSet = new Set();
            
            if (cachedData && cachedData.公寓 && cachedData.公寓.房间列表) {
                Object.values(cachedData.公寓.房间列表).forEach(r => {
                    if (r.类型 !== '空房间' && r.楼层 === floorName && r.位置 && !r.位置.includes('outdoor')) {
                        const parts = r.位置.split('-');
                        for (let i = parseInt(parts[0]); i <= parseInt(parts[1]); i++) occSet.add(i);
                    }
                });
            }

            for (let i = 1; i <= capacity; i++) {
                const isOcc = occSet.has(i);
                const $c = $(`<div class="grid-cell ${isOcc ? 'occupied' : ''}" data-i="${i}">${i}</div>`);
                if (!isOcc) {
                    $c.click(() => {
                        if (buildSelection.start === null) { buildSelection.start = i; buildSelection.end = i; }
                        else {
                            const min = Math.min(buildSelection.start, i), max = Math.max(buildSelection.start, i);
                            let valid = true; for (let k = min; k <= max; k++) if (occSet.has(k)) valid = false;
                            if (valid) { buildSelection.start = min; buildSelection.end = max; } else { buildSelection.start = i; buildSelection.end = i; }
                        }
                        $grid.find('.grid-cell').removeClass('selected');
                        if (buildSelection.start !== null) {
                            for (let k = buildSelection.start; k <= buildSelection.end; k++) $grid.find(`[data-i="${k}"]`).addClass('selected');
                        }
                    });
                }
                $grid.append($c);
            }
            $(shadow).find('#modal-build').addClass('open');
        };

        $(shadow).find('#do-build').click(() => {
            if (buildSelection.start === null) return window.parent.AptSystem.showNotification('请先在上方网格选择区域！', 'warning');
            const type = $(shadow).find('#build-type').val();
            const desc = $(shadow).find('#build-desc').val().trim();
            const pos = `${buildSelection.start}-${buildSelection.end}`;
            let cmd = `在【${currentBuildFloor}】的位置${pos}新建一间${type}${desc ? `，命名为【${desc}】` : ''}`;
            fillChatCommand(cmd);
        });

        $(shadow).find('.archive-tab').click(function() {
            $(shadow).find('.archive-tab').removeClass('active');
            $(this).addClass('active');
            isDeepMode = $(this).data('tab') === 'deep';
            renderTenantDetail(currentRoomInfo);
        });
        
        bindDrawerEvents();
    }

    function getSafeMVU() {
        try {
            if (window.parent && window.parent.Mvu) return window.parent.Mvu.getMvuData({ type: 'message', message_id: 'latest' })?.stat_data;
            if (typeof Mvu !== 'undefined') return Mvu.getMvuData({ type: 'message', message_id: 'latest' })?.stat_data;
        } catch(e) {}
        return null;
    }

    const renderMVU = window.parent.AptSystem.debounce(function(eventPayload) {
        let data = getSafeMVU() || (eventPayload && eventPayload.stat_data);
        const $ = window.parent.jQuery;

        if (!data) {
            $(shadow).find('#apt-time-weather').text("数据探嗅中...");
            return;
        }

        cachedData = data;

        const wData = data.世界 || {};
        $(shadow).find('#apt-time-weather').html(`${wData.年份||''} ${wData.日期||''} ${wData.星期||''} <span style="opacity:0.4; margin:0 6px;">|</span> ${wData.天气||'晴'} <span style="opacity:0.4; margin:0 6px;">|</span> ${wData.时间||''}`);
        $(shadow).find('#apt-money-val').text(`$ ${data.用户?.资金 || 0}`);

        if ($(shadow).find('#modal-info').hasClass('open') && currentRoomInfo) {
            currentRoomInfo = data.公寓?.房间列表?.[currentRoomInfo.名称] || currentRoomInfo;
            if (currentRoomInfo.类型 === '您的房间' || currentRoomInfo.类型 === '卧室') {
                renderTenantDetail(currentRoomInfo);
            }
        }

        function getBuildingHash(mvuData) {
            if (!mvuData || !mvuData.公寓) return "";
            let hash = "";
            if (mvuData.公寓.楼层列表) hash += mvuData.公寓.楼层列表.join(',') + '|';
            if (mvuData.公寓.房间列表) {
                Object.values(mvuData.公寓.房间列表).forEach(r => hash += `${r.名称}:${r.类型}:${r.位置}:${r.住户 || ''}|`);
            }
            return hash;
        }

        const currentHash = getBuildingHash(data);
        const isBuildingChanged = renderMVU.lastHash !== currentHash;
        renderMVU.lastHash = currentHash;

        if (!isBuildingChanged) return; 

        const $canvas = $(shadow).find('#apt-canvas').empty();
        const rawFloors = data.公寓?.楼层列表 || [];
        const rooms = data.公寓?.房间列表 || {};
        
        const sortedFloors = [...rawFloors].sort((a, b) => getFloorLevel(b) - getFloorLevel(a));
        let emptyBeds = 0;

        $canvas.append(`<button class="add-floor-btn" data-pos="top">新建楼层（向上扩展）</button>`);

        sortedFloors.forEach((f, index) => {
            const isBaseFloor = BASE_FLOORS.includes(f);
            const floorRooms = Object.entries(rooms).filter(([_, r]) => r.楼层 === f);
            const realRooms = floorRooms.filter(([_, r]) => r.类型 !== '空房间');
            const hasRealRooms = realRooms.length > 0;
            
            const canDelete = !isBaseFloor && (index === 0 || index === sortedFloors.length - 1);
            const deleteDisabled = hasRealRooms ? 'disabled title="该楼层还有已建成的房间，无法拆除"' : 'title="拆除该楼层"';

            const indoorRooms = floorRooms.filter(([_, r]) => !r.位置.includes('outdoor')).sort((a, b) => parseInt(a[1].位置) - parseInt(b[1].位置));
            const leftOutdoor = floorRooms.find(([_, r]) => r.位置 === 'outdoor-left');
            const rightOutdoor = floorRooms.find(([_, r]) => r.位置 === 'outdoor-right');

            const $wrapper = $(`<div class="floor-wrapper"></div>`);
            
            const $leftSide = $(`<div class="floor-side"></div>`);
            if (leftOutdoor) $leftSide.append(createRoomCard(leftOutdoor[0], leftOutdoor[1]));
            $wrapper.append($leftSide);

            const $center = $(`<div class="floor-center">
                <div class="floor-row">
                    <div class="floor-label">${f}</div>
                    <div class="room-track"></div>
                </div>
            </div>`);
            const $track = $center.find('.room-track');
            
            if (canDelete) $center.append(`<button class="del-floor-btn" data-floor="${f}" ${deleteDisabled}>拆除</button>`);

            let cursor = 1;
            indoorRooms.forEach(([id, r]) => {
                if (r.类型 === '卧室' && (!r.住户 || r.住户 === '无')) emptyBeds++; 
                
                const pos = r.位置.split('-').map(Number);
                if (pos[0] > cursor) {
                    const $empty = $(`<div class="room-card empty" style="flex:${pos[0] - cursor}"><div class="room-tag">${cursor}-${pos[0]-1}</div><div style="font-size:12px">点击空地建造</div></div>`);
                    $empty.click(() => window.openBuildGrid(f));
                    $track.append($empty);
                }
                
                $track.append(createRoomCard(id, r, true, pos));
                cursor = pos[1] + 1;
            });
            
            if (cursor <= 10) {
                const $empty = $(`<div class="room-card empty" style="flex:${11 - cursor}"><div class="room-tag">${cursor}-10</div><div style="font-size:12px">点击空地建造</div></div>`);
                $empty.click(() => window.openBuildGrid(f));
                $track.append($empty);
            }
            $wrapper.append($center);

            const $rightSide = $(`<div class="floor-side"></div>`);
            if (rightOutdoor) $rightSide.append(createRoomCard(rightOutdoor[0], rightOutdoor[1]));
            $wrapper.append($rightSide);

            $canvas.append($wrapper);
        });

        $canvas.append(`<button class="add-floor-btn" data-pos="bottom">新建楼层（向下扩展）</button>`);

        const recruitBtn = $(shadow).find('#dock-recruit');
        if (emptyBeds === 0) {
            recruitBtn.addClass('disabled').attr('title', '无空余卧室，无法发布招募');
        } else {
            recruitBtn.removeClass('disabled').attr('title', '招募新租客');
        }
    }, 150);

    function createRoomCard(id, r, isIndoor = false, pos = null) {
        const $ = window.parent.jQuery;
        let typeCls = 'func';
        if (r.类型.includes('卧室')) typeCls = 'bedroom';
        else if (r.类型.includes('房间') && r.类型 !== '空房间') typeCls = 'landlord';
        else if (r.类型.includes('室外')) typeCls = 'outdoor';
        else if (r.类型 === '空房间') typeCls = 'empty';
        
        const occText = (r.住户 && r.住户 !== '无' && r.住户 !== '<user>') ? r.住户 : r.类型;
        
        let html = `<div class="room-card ${typeCls}" ${isIndoor ? `style="flex:${pos[1] - pos[0] + 1}"` : ''}>`;
        if (isIndoor && pos) html += `<div class="room-tag">${pos[0]}-${pos[1]}</div>`;
        html += `<div class="room-name">${r.名称 || id}</div><div class="room-occ">${occText}</div></div>`;
        
        const $card = $(html);
        $card.click(() => openDetailModal(id, r));
        return $card;
    }

    function openDetailModal(id, room) {
        currentRoomInfo = room;
        isDeepMode = false;
        const $ = window.parent.jQuery;

        const box = shadow.getElementById('info-modal-box');
        const rCol = shadow.getElementById('col-tenant');
        const $colRoom = $(shadow).find('#col-room').empty();
        
        $colRoom.append(`<div class="col-title">${room.名称 || id}</div>`);
        const rowHTML = (label, val) => `<div class="detail-row"><span class="detail-label">${label}</span><div class="detail-value">${val}</div></div>`;
        $colRoom.append(rowHTML('所属位置', `${room.楼层} [${room.位置}]`));
        $colRoom.append(rowHTML('区域类型', room.类型));
        $colRoom.append(rowHTML('详情描述', room.描述 || '暂无详细描述'));

        if (room.类型 === '空房间') {
            const $btnBed = $(`<button class="btn-action">装修为卧室</button>`).click(() => fillChatCommand(`将【${room.名称 || id}】装修为卧室`));
            const $btnFunc = $(`<button class="btn-action" style="background:var(--apt-bg-input); color:var(--apt-text-main); border:1px solid var(--apt-accent);">装修为功能房</button>`).click(() => {
                $(shadow).find('#func-room-input').val('');
                $(shadow).find('#modal-func-room').addClass('open');
            });
            const $btnDel = $(`<button class="btn-action danger">拆除房间</button>`).click(() => fillChatCommand(`拆除房间【${room.名称 || id}】`));
            $colRoom.append($btnBed, $btnFunc, $btnDel);
        } else if (room.类型 === '卧室') {
            const occupant = (room.住户 || '').split('、')[0].trim();
            if (occupant && occupant !== '无') {
                const $btnEvict = $(`<button class="btn-action danger">让租客退租</button>`).click(() => fillChatCommand(`让租客【${occupant}】从【${room.名称 || id}】退租`));
                $colRoom.append($btnEvict);
            } else {
                const $btnDel = $(`<button class="btn-action danger">拆除房间</button>`).click(() => fillChatCommand(`拆除房间【${room.名称 || id}】`));
                $colRoom.append($btnDel);
            }
        } else if (room.类型 === '功能性房间') {
            const $btnDel = $(`<button class="btn-action danger">拆除房间</button>`).click(() => fillChatCommand(`拆除房间【${room.名称 || id}】`));
            $colRoom.append($btnDel);
        }

        if (room.类型 === '功能性房间' || room.类型 === '室外区域' || room.类型 === '固定设施' || room.类型 === '空房间') {
            box.className = 'modal-box single-layout';
            rCol.style.display = 'none';
        } else if (room.类型 === '您的房间') {
            box.className = 'modal-box split-layout';
            rCol.style.display = 'flex';
            $(shadow).find('#archive-tabs').hide(); 

            const $content = $(shadow).find('#tenant-content-area').empty();
            $content.append(`<div class="col-title" style="color:var(--apt-text-main); margin-bottom: 10px;">您的关系网络</div>`);
            $content.append('<canvas id="rel-canvas" style="width:100%; height:360px; background:var(--apt-bg-input); border-radius:12px; border:1px solid var(--apt-border);"></canvas>');
            
            setTimeout(() => drawRelationGraph('<user>', shadow), 50);
        } else if (room.类型 === '卧室') {
            box.className = 'modal-box split-layout';
            rCol.style.display = 'flex';
            
            const tenantName = (room.住户 || '').split('、')[0].trim(); 
            if (!tenantName || tenantName === '无') {
                $(shadow).find('#archive-tabs').hide();
                $(shadow).find('#tenant-content-area').html('<div style="text-align:center; padding-top:150px; color:var(--apt-text-muted); font-weight:bold; font-size:16px;">当前卧室空置</div>');
            } else {
                $(shadow).find('#archive-tabs').show();
                $(shadow).find('.archive-tab').removeClass('active');
                $(shadow).find('.archive-tab[data-tab="surface"]').addClass('active');
                renderTenantDetail(room);
            }
        }
        $(shadow).find('#modal-info').addClass('open');
    }

    let currentGraphAnimation = null;

    function renderTenantDetail(room) {
        const $ = window.parent.jQuery;
        const $content = $(shadow).find('#tenant-content-area').empty();
        
        const tenantName = (room.住户 || '').split('、')[0].trim();
        const tData = cachedData.租客列表?.[tenantName];
        if (!tData) return;

        if (currentGraphAnimation) {
            cancelAnimationFrame(currentGraphAnimation);
            currentGraphAnimation = null;
        }

        const rowHTML = (label, val) => `<div class="detail-row"><span class="detail-label">${label}</span><div class="detail-value">${val}</div></div>`;

        if (isDeepMode) {
            $content.append(`<div class="col-title" style="color:var(--apt-text-main); display:flex; justify-content:space-between; margin-bottom: 10px;">
                <span>🕸️ 社交网络拓扑</span>
            </div>`);
            $content.css({ 'display': 'flex', 'flex-direction': 'column', 'height': '100%' });
            $content.append('<div style="position:relative; width:100%; flex:1; min-height:0; border-radius:12px; overflow:hidden; background: var(--apt-bg-input); border:1px solid var(--apt-border); box-shadow: inset 0 0 20px rgba(0,0,0,0.2);"><canvas id="rel-canvas" style="display:block; width:100%; height:100%; cursor:grab;"></canvas></div>');
            setTimeout(() => drawRelationGraph(tenantName, shadow), 100);
        } else {
            $content.append(`<div class="col-title">👤 ${tenantName} 租客档案</div>`);
            
            let holoHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px;">`;
            holoHtml += `<div style="background:var(--apt-bg-input); padding:15px; border-radius:10px; border-left:3px solid var(--apt-accent);">
                <div style="font-size:11px; color:var(--apt-text-muted); margin-bottom:4px;">身份信息 (ID/AGE/JOB)</div>
                <div style="font-size:14px; font-weight:bold; color:var(--apt-text-main);">${tData.年龄 || '?'} 岁 · ${tData.职业 || '未知'}</div>
             </div>`;
            holoHtml += `<div class="tenant-status-card" style="background:var(--apt-bg-input); padding:15px; border-radius:10px; border-left:3px solid var(--tenant-status-border, #10b981);">
                <div style="font-size:11px; color:var(--apt-text-muted); margin-bottom:4px;">当前状态 (STATUS)</div>
                <div style="font-size:14px; font-weight:bold; color:var(--tenant-status-text, #059669);">${tData.状态 || '游荡中'}</div>
             </div>`;
holoHtml += `</div>`;
            $content.append(holoHtml);

            $content.append(rowHTML('外貌特征', tData.外貌 || '数据缺失'));
            $content.append(rowHTML('内心活动', tData.性格 || '数据缺失'));
            
            $content.append(`<div class="col-title" style="margin-top:25px; color:#3b82f6;">当前内心</div>`);
            $content.append(`<div style="padding:20px; background:rgba(59, 130, 246, 0.05); border:1px dashed #3b82f6; border-radius:12px; font-style:italic; color:var(--apt-text-main); position:relative;">
                <span style="position:absolute; top:-10px; left:15px; background:var(--apt-bg-surface); padding:0 5px; font-size:12px; font-weight:bold; color:#3b82f6;">内心想法</span>
                “${tData.内心 || '...没有检测到明显的心理波动...'}”
            </div>`);
        }
    }

    function drawRelationGraph(targetName, shadowRoot) {
        const canvas = shadowRoot.getElementById('rel-canvas');
        if (!canvas || !cachedData?.租客列表) return;

        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const w = rect.width, h = rect.height;

        const nodes = []; const links = []; const nodeMap = new Map();
        const tenantList = cachedData.租客列表;
        
        const centerId = targetName === '<user>' ? 'ME' : targetName;
        const centerNode = { id: centerId, label: targetName === '<user>' ? '您' : targetName, isCenter: true, x: w/2, y: h/2, vx: 0, vy: 0, radius: 35 };
        nodes.push(centerNode); nodeMap.set(centerId, centerNode);

        let relations = {};
        if (targetName === '<user>') {
            const playerName = window.parent.name1 || 'User'; 
            
            Object.keys(tenantList).forEach(k => {
                const rels = tenantList[k].关系 || {};
                Object.keys(rels).forEach(rk => { 
                    if (rk === '<user>' || rk.toLowerCase() === 'you' || rk.includes('房东') || rk.includes(playerName)) {
                        relations[k] = rels[rk]; 
                    }
                });
            });
        } else {
            relations = tenantList[targetName]?.关系 || {};
        }

        Object.entries(relations).forEach(([name, desc], i) => {
            if (!nodeMap.has(name)) {
                const angle = Math.random() * Math.PI * 2;
                const r = 100 + Math.random() * 50;
                const n = { id: name, label: name, isCenter: false, x: w/2 + Math.cos(angle)*r, y: h/2 + Math.sin(angle)*r, vx: 0, vy: 0, radius: 25 };
                nodes.push(n); nodeMap.set(name, n);
            }
            const isDanger = /仇|恨|敌|讨厌|恶|差|杀/.test(desc);
            links.push({ source: centerNode, target: nodeMap.get(name), label: desc, isDanger });
        });

        if (links.length === 0) {
            canvas.style.display = 'none';
            const emptyDiv = window.parent.document.createElement('div');
            emptyDiv.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--apt-text-muted); font-size:14px; font-weight:bold; letter-spacing:1px;';
            emptyDiv.innerText = '探测不到任何社交关系...';
            canvas.parentNode.appendChild(emptyDiv);
            return;
        }

        let draggedNode = null; let hoveredNode = null;
        let mouseX = 0; let mouseY = 0;

        canvas.addEventListener('pointerdown', e => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            draggedNode = nodes.find(n => Math.hypot(n.x - mx, n.y - my) < n.radius + 5);
            if (draggedNode) { canvas.style.cursor = 'grabbing'; canvas.setPointerCapture(e.pointerId); }
        });
        canvas.addEventListener('pointermove', e => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
            if (draggedNode) { draggedNode.x = mouseX; draggedNode.y = mouseY; draggedNode.vx = 0; draggedNode.vy = 0; }
            else {
                hoveredNode = nodes.find(n => Math.hypot(n.x - mouseX, n.y - mouseY) < n.radius + 5) || null;
                canvas.style.cursor = hoveredNode ? 'grab' : 'default';
            }
        });
        const endDrag = e => { if(draggedNode) { draggedNode = null; canvas.style.cursor = hoveredNode ? 'grab' : 'default'; canvas.releasePointerCapture(e.pointerId); } };
        canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

        function renderPhysics() {
            ctx.clearRect(0, 0, w, h);

            const isDark = host.classList.contains('dark-theme');
            const colors = {
                bg: isDark ? '#18181b' : '#ffffff',            
                accent: isDark ? '#d4af37' : '#b48c52',        
                accentGlow: isDark ? '#fcd34d' : '#9c7844',    
                text: isDark ? '#ffffff' : '#27272a',          
                subText: isDark ? '#a1a1aa' : '#71717a',       
                nodeCenter: isDark ? '#27272a' : '#ffffff',    
                nodeNpc: isDark ? '#18181b' : '#f4f4f5',       
                danger: isDark ? '#f87171' : '#ef4444',        
                dimmed: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
            };

            const glowIntensity = isDark ? 20 : 10;

            nodes.forEach(n1 => {
                if (n1 === draggedNode) return;
                n1.vx += (w/2 - n1.x) * 0.001; n1.vy += (h/2 - n1.y) * 0.001;
                nodes.forEach(n2 => {
                    if (n1 === n2) return;
                    const dx = n1.x - n2.x, dy = n1.y - n2.y;
                    const dist = Math.hypot(dx, dy) || 1;
                    if (dist < 150) {
                        const force = 100 / (dist * dist);
                        n1.vx += (dx / dist) * force; n1.vy += (dy / dist) * force;
                    }
                });
            });

            links.forEach(link => {
                const dx = link.target.x - link.source.x, dy = link.target.y - link.source.y;
                const dist = Math.hypot(dx, dy) || 1;
                const force = (dist - 140) * 0.02;
                if (link.source !== draggedNode) { link.source.vx += (dx/dist)*force; link.source.vy += (dy/dist)*force; }
                if (link.target !== draggedNode) { link.target.vx -= (dx/dist)*force; link.target.vy -= (dy/dist)*force; }
            });

            nodes.forEach(n => {
                if (n !== draggedNode) {
                    n.vx *= 0.85; n.vy *= 0.85; 
                    n.x += n.vx; n.y += n.vy;
                    n.x = Math.max(n.radius, Math.min(w - n.radius, n.x));
                    n.y = Math.max(n.radius, Math.min(h - n.radius, n.y));
                }
            });

            links.forEach(link => {
                const isHovered = hoveredNode === link.source || hoveredNode === link.target;
                const isDimmed = hoveredNode && !isHovered;
                
                ctx.beginPath(); ctx.moveTo(link.source.x, link.source.y); ctx.lineTo(link.target.x, link.target.y);
                ctx.lineWidth = isHovered ? 2.5 : 1.5;
                
                if (isDimmed) {
                    ctx.strokeStyle = colors.dimmed;
                } else if (link.isDanger) {
                    ctx.strokeStyle = colors.danger;
                    if (isHovered) { ctx.shadowColor = colors.danger; ctx.shadowBlur = glowIntensity; }
                    ctx.setLineDash([5, 5]); 
                } else {
                    ctx.strokeStyle = colors.accent;
                    if (isHovered) { ctx.shadowColor = colors.accentGlow; ctx.shadowBlur = glowIntensity; }
                    ctx.setLineDash([]);
                }
                ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);

                if (!isDimmed) {
                    const mx = (link.source.x + link.target.x) / 2;
                    const my = (link.source.y + link.target.y) / 2;
                    ctx.font = isHovered ? 'bold 12px inherit' : '10px inherit';
                    const text = (link.label.length > 8 && !isHovered) ? link.label.slice(0,8)+'..' : link.label;
                    const tw = ctx.measureText(text).width + 8;
                    
                    ctx.fillStyle = colors.bg; ctx.fillRect(mx - tw/2, my - 8, tw, 16);
                    ctx.fillStyle = link.isDanger ? colors.danger : colors.accent;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(text, mx, my);
                }
            });

            nodes.forEach(n => {
                const isHovered = hoveredNode === n;
                const isDragged = draggedNode === n;
                const isDimmed = hoveredNode && hoveredNode !== n && !links.some(l => (l.source===hoveredNode && l.target===n) || (l.target===hoveredNode && l.source===n));

                const currentRadius = isDragged ? n.radius + 6 : n.radius;

                ctx.beginPath(); 
                ctx.arc(n.x, n.y, currentRadius, 0, Math.PI*2);
                ctx.fillStyle = n.isCenter ? colors.nodeCenter : colors.nodeNpc;
                if (isDimmed) ctx.globalAlpha = 0.4;
                
                if (isHovered || n.isCenter || isDragged) {
                    ctx.shadowColor = colors.accentGlow; 
                    ctx.shadowBlur = (isHovered || isDragged) ? glowIntensity * 2 : glowIntensity;
                }
                ctx.fill(); ctx.shadowBlur = 0;
                
                ctx.lineWidth = isHovered ? 3 : 2;
                ctx.strokeStyle = isDimmed ? colors.subText : colors.accent;
                ctx.stroke(); ctx.globalAlpha = 1.0;

                ctx.fillStyle = isDimmed ? colors.subText : colors.text;
                ctx.font = (n.isCenter || isHovered) ? 'bold 14px inherit' : '12px inherit';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const displayName = n.label.length > 5 && !isHovered ? n.label.slice(0,4)+'..' : n.label;
                ctx.fillText(n.isCenter ? displayName : displayName[0], n.x, n.isCenter ? n.y : n.y - 4);
                
                if (!n.isCenter) {
                    ctx.font = '10px inherit'; ctx.fillStyle = colors.subText;
                    ctx.fillText(displayName, n.x, n.y + n.radius + 12);
                }
            });

            currentGraphAnimation = requestAnimationFrame(renderPhysics);
        }

        renderPhysics();
    }

    function escapeHTML(str) { return (!str) ? '' : String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

    function applySearch(text) {
        if (!debugSearchQuery) return text;
        const regex = new RegExp(`(${debugSearchQuery})`, 'gi');
        return text.replace(regex, `<mark style="background:var(--apt-accent); color:#fff; border-radius:2px; padding:0 2px;">$1</mark>`);
    }

    function renderLogs() {
        const $ = window.parent.jQuery;
        const $area = $(shadow).find('#term-content-area');
        
        if ($area.length && $area[0].scrollHeight > $area.outerHeight()) {
            const isAtBottom = $area[0].scrollHeight - $area.scrollTop() <= $area.outerHeight() + 80;
            if (!isAtBottom && debugAutoScrollLocked) {
                debugAutoScrollLocked = false;
                $(shadow).find('#btn-autoscroll').removeClass('active-lock');
            }
        }

        $area.empty();
        const currentLogs = window.parent._AptDebugData.consoleLogs;
let logsToRender = debugCurrentFilter === 'all' ? currentLogs : currentLogs.filter(l => l.type === debugCurrentFilter);
        
        if (debugSearchQuery) logsToRender = logsToRender.filter(l => l.message.toLowerCase().includes(debugSearchQuery.toLowerCase()));

        if (logsToRender.length === 0) { 
            $area.html(`<div style="text-align:center; color:var(--apt-text-muted); margin-top:100px;">暂无匹配日志</div>`); 
            return; 
        }
        
        let html = '';
        logsToRender.forEach((log, index) => {
            const safeMsg = escapeHTML(log.message);
            const displayMsg = debugSearchQuery ? applySearch(safeMsg) : safeMsg;
            html += `<div class="log-item log-${log.type}" style="position:relative; padding-right:50px;">
                        <button class="copy-btn copy-log" data-idx="${index}" style="top:8px; right:8px; z-index:2;">复制</button>
                        <div class="log-meta"><span>${log.type.toUpperCase()}</span><span>${log.time}</span></div>
                        <div style="white-space:pre-wrap;">${displayMsg}</div>
                     </div>`;
        });
        $area.html(html);

        $area.find('.copy-log').off('click').on('click', function(e) {
            e.stopPropagation();
            const idx = $(this).data('idx');
            const textToCopy = logsToRender[idx].message;
            
            if (typeof doRobustCopy === 'function') {
                doRobustCopy(textToCopy, $(this));
            } else {
                window.parent.AptSystem.showNotification('复制功能尚未完全挂载', 'warning');
            }
        });

        if (debugAutoScrollLocked) $area.scrollTop($area[0].scrollHeight);
    }

    function renderAPIs() {
        const $ = window.parent.jQuery;
        const $area = $(shadow).find('#term-content-area');

        if ($area.length && $area[0].scrollHeight > $area.outerHeight()) {
            const isAtBottom = $area[0].scrollHeight - $area.scrollTop() <= $area.outerHeight() + 80;
            if (!isAtBottom && debugAutoScrollLocked) {
                debugAutoScrollLocked = false;
                $(shadow).find('#btn-autoscroll').removeClass('active-lock');
            }
        }

        $area.empty();
        
        let apiToRender = DebugData.apiCalls;
        if (debugSearchQuery) {
            const sq = debugSearchQuery.toLowerCase();
            apiToRender = apiToRender.filter(a => 
                (a.response && a.response.toLowerCase().includes(sq)) || 
                (a.error && a.error.toLowerCase().includes(sq)) || 
                a.messages.some(m => m.content.toLowerCase().includes(sq))
            );
        }

        if (apiToRender.length === 0) { 
            $area.html(`<div style="text-align:center; color:var(--apt-text-muted); margin-top:100px;">暂无 API 请求记录</div>`); 
            return; 
        }

        let finalHtml = '';
        
        apiToRender.forEach((api, index) => {
            const statusColor = api.error ? '#ef4444' : (api.response ? '#10b981' : '#f59e0b');
            const statusIcon = api.error ? '❌' : (api.response ? '✅' : '⏳');
            const isOpen = (index === apiToRender.length - 1) ? 'open' : '';
            
            let bodyHtml = '';
            
            if (api.messages) {
                api.messages.forEach((msg, idx) => {
                    const safeContent = escapeHTML(msg.content);
                    const displayContent = debugSearchQuery ? applySearch(safeContent) : safeContent;
                    bodyHtml += `<div class="msg-block"><button class="copy-btn copy-msg" data-id="${api.id}" data-idx="${idx}">复制</button><span class="role-badge role-${msg.role}">${msg.role.toUpperCase()}</span><div style="color:var(--apt-text-main);">${displayContent}</div></div>`;
                });
            }
            if (api.response) {
                const safeRes = escapeHTML(api.response);
                const displayRes = debugSearchQuery ? applySearch(safeRes) : safeRes;
                bodyHtml += `<div class="msg-block" style="border-left:4px solid #10b981; background:rgba(16, 185, 129, 0.05);"><button class="copy-btn copy-res" data-id="${api.id}">复制</button><div style="color:#059669; font-weight:800; margin-bottom:8px;">📥 AI 响应:</div><div style="color:var(--apt-text-main);">${displayRes}</div></div>`;
            } else if (api.error) {
                const safeErr = escapeHTML(api.error);
                bodyHtml += `<div class="msg-block" style="border-left:4px solid #ef4444; background:rgba(239, 68, 68, 0.05);"><button class="copy-btn copy-err" data-id="${api.id}">复制</button><div style="color:#dc2626; font-weight:800; margin-bottom:8px;">🚨 报错异常:</div><div style="color:var(--apt-text-main);">${safeErr}</div></div>`;
            }

            finalHtml += `
            <div class="api-card">
                <div class="api-header" data-id="${api.id}">
                    <div class="api-model">${statusIcon} ${api.model}</div>
                    <div class="api-time"><span style="color:${statusColor}">[${api.duration}ms]</span> ${api.time}</div>
                </div>
                <div class="api-body ${isOpen}" id="api-body-${api.id}">
                    ${bodyHtml}
                </div>
            </div>`;
        });

        $area.html(finalHtml);

        $area.find('.api-header').off('click').on('click', function() {
            const id = $(this).data('id');
            $area.find(`#api-body-${id}`).toggleClass('open');
        });

        if (debugAutoScrollLocked) $area.scrollTop($area[0].scrollHeight);

        $area.find('.copy-btn').click(function(e) {
            e.stopPropagation();
            const id = $(this).data('id');
            const api = DebugData.apiCalls.find(a => a.id === id);
            if (!api) return;

            let text = '';
            if ($(this).hasClass('copy-msg')) text = api.messages[$(this).data('idx')]?.content || '';
            else if ($(this).hasClass('copy-res')) text = api.response;
            else if ($(this).hasClass('copy-err')) text = api.error;
            
            doRobustCopy(text, $(this));
        });
    }

    function doRobustCopy(text, $btn) {
        const oldText = $btn.text(); 
        const success = () => { $btn.text('成功!').css('color','#10b981'); setTimeout(() => $btn.text(oldText).attr('style',''), 2000); };
        
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(success).catch(() => fallbackCopy(text, success));
        } else fallbackCopy(text, success);
    }

    function fallbackCopy(text, successCb) {
        const ta = window.parent.document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = 0;
        window.parent.document.body.appendChild(ta);
        ta.select();
        try { window.parent.document.execCommand('copy'); successCb(); } catch (e) {} 
        finally { window.parent.document.body.removeChild(ta); }
    }

    function bindDrawerEvents() {
        const $ = window.parent.jQuery;

        const closeDrawer = () => {
            $(shadow).find('#apt-console-drawer').removeClass('open');
            setTimeout(() => $(shadow).find('#apt-drawer-mask').removeClass('open'), 300);
        };

        $(shadow).find('.drawer-close, #apt-drawer-mask').click(closeDrawer);

        $(shadow).find('.d-tab').click(function() {
            $(shadow).find('.d-tab').removeClass('active'); $(this).addClass('active'); 
            debugCurrentTab = $(this).data('tab');
            if (debugCurrentTab === 'console') $(shadow).find('#term-filters').css('display', 'flex'); 
            else $(shadow).find('#term-filters').hide(); 
            debugAutoScrollLocked = true;
            $(shadow).find('#btn-autoscroll').addClass('active-lock');
            if (debugCurrentTab === 'api') renderAPIs(); else renderLogs();
        });

        $(shadow).find('.f-tag').click(function() {
            $(shadow).find('.f-tag').removeClass('active');
            $(this).addClass('active'); 
            debugCurrentFilter = $(this).data('filter'); 
            renderLogs();
        });

        $(shadow).find('#btn-clear-data').click(function() {
            if (debugCurrentTab === 'api') DebugData.apiCalls = []; else DebugData.consoleLogs = [];
            if (debugCurrentTab === 'api') renderAPIs(); else renderLogs();
        });

        $(shadow).find('#btn-copy-all').click(function() {
            if (debugCurrentTab !== 'console') return window.parent.AptSystem.showNotification('请在系统日志面板使用此功能', 'warning');
            
            const currentLogs = window.parent._AptDebugData.consoleLogs;
            let logsToRender = debugCurrentFilter === 'all' ? currentLogs : currentLogs.filter(l => l.type === debugCurrentFilter);
            
            if (debugSearchQuery) {
                logsToRender = logsToRender.filter(l => l.message.toLowerCase().includes(debugSearchQuery.toLowerCase()));
            }
            
            if (logsToRender.length === 0) return window.parent.AptSystem.showNotification('当前没有可复制的日志', 'warning');
            
            const text = logsToRender.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
            doRobustCopy(text, $(this));
        });

        $(shadow).find('#btn-autoscroll').click(function() {
            debugAutoScrollLocked = !debugAutoScrollLocked;
            $(this).toggleClass('active-lock', debugAutoScrollLocked);
            if (debugAutoScrollLocked) {
                const $area = $(shadow).find('#term-content-area');
                $area.scrollTop($area[0].scrollHeight);
            }
        });

        let searchTimer;
        $(shadow).find('#term-search-input').on('input', function() {
            clearTimeout(searchTimer);
            debugSearchQuery = $(this).val().trim();
            searchTimer = setTimeout(() => {
                if (debugCurrentTab === 'api') renderAPIs(); else renderLogs();
            }, 300);
        });
    }

    function init() {
        if (window.parent.AptSystem.eventListeners.has('system-notify')) {
            window.parent.AptSystem.eventListeners.set('system-notify', []);
        }
        initInteractions();
        
        $(shadow).find('.modal-overlay').on('mousedown', function(e) {
            if (e.target === this) {
                $(this).find('.close-modal-btn').click();
            }
        });
        let renderTimers = { api: null, console: null };
        window.parent._aptTriggerRender = function(type) {
            if (renderTimers[type]) return; 
            renderTimers[type] = setTimeout(() => {
                const drawer = shadow.getElementById('apt-console-drawer');
                if (drawer && drawer.classList.contains('open') && debugCurrentTab === type) {
                    if (type === 'api') renderAPIs(); else renderLogs();
                }
                renderTimers[type] = null; 
            }, 200); 
        };
        window.parent.AptSystem.renderSettingsTabs();
        window.parent.AptSystem.renderDockPlugins();
        window.parent.AptSystem.Island.init(shadow);
        window.parent.AptSystem.emit('system-rebuilt');
        
        // MVU subscriptions below own state refresh; no second, undefined state engine.
        
        if (window._aptRenderInterval) {
            clearInterval(window._aptRenderInterval);
            window._aptRenderInterval = null;
        }

        const pWin = window.parent;
        const eOn = pWin.eventOn || (pWin.eventSource && pWin.eventSource.on.bind(pWin.eventSource));

        if (typeof eOn === 'function') {
            eOn('mag_variable_update_ended', renderMVU);
            eOn('mag_variable_update_ended_for_zod', renderMVU);
            eOn('mag_variable_initialized', renderMVU);
            eOn('chat_id_changed', renderMVU);
            
            eOn('mag_variable_updated', (stat_data, path, oldVal, newVal) => {
                try {
                    const safeOld = (typeof oldVal === 'object') ? JSON.stringify(oldVal) : oldVal;
                    const safeNew = (typeof newVal === 'object') ? JSON.stringify(newVal) : newVal;
                    if (safeOld !== safeNew) {
                        window.parent.AptSystem.log(`[MVU底层] 变量跃迁 => ${path} | ${safeOld || '空'} -> ${safeNew || '空'}`, 'warn');
                    }
                } catch(e) {}
            });
            eOn('mag_variable_update_started', () => {
                window.parent.AptSystem.log(`[MVU引擎] 收到世界线变动信号，正在解析...`, 'info');
            });
        }

        renderMVU();

        setTimeout(() => {
            window.parent.AptSystem.log('AptOS 核心虚拟内存分配成功...', 'info');
            window.parent.AptSystem.log('UI 渲染管线与防抖引擎装载完毕', 'info');
            window.parent.AptSystem.log('AptOS 引导序列完成，系统准备就绪', 'success');
        }, 800);
    }
    window.parent.AptSystem.Island.hijackToastr();
    init();
    
    window.addEventListener('pagehide', () => { 
        window.parent.AptSystem.log('执行全局清理与内存回收...', 'warn');
        
        if (window.parent.AptSystem && window.parent.AptSystem.sysAbortController) {
            window.parent.AptSystem.sysAbortController.abort();
            console.log('[AptOS] 已阻断所有残余网络请求');
        }
        
        if (window._aptRenderInterval) {
            clearInterval(window._aptRenderInterval);
            window._aptRenderInterval = null;
        }

        const pWin = window.parent;
        const eOff = pWin.eventRemoveListener || (pWin.eventSource && pWin.eventSource.removeListener.bind(pWin.eventSource));

        if (typeof eOff === 'function') {
            eOff('mag_variable_update_ended', renderMVU);
            eOff('mag_variable_update_ended_for_zod', renderMVU);
            eOff('mag_variable_initialized', renderMVU);
            eOff('chat_id_changed', renderMVU);
        }

        if (window.parent.AptSystem && window.parent.AptSystem.eventListeners) {
            window.parent.AptSystem.eventListeners.clear();
        }

        const h = window.parent.document.getElementById(CONFIG.hostId);
        if (h) h.remove();
        
        if (window.parent._aptToastObserver) {
            window.parent._aptToastObserver.disconnect();
            window.parent._aptToastObserver = null;
        }
    });

})();