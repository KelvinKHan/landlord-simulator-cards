/**
 * 小手机主模块 - 酒馆助手JS脚本版
 * 
 * 重要：酒馆助手脚本运行在iframe中，必须用 $ (jQuery) 操作父页面DOM
 */

// ============ 配置参数 ============
const PHONE_CONFIG = {
    id: 'tavern-phone-system',
    phoneWidth: 408,
    phoneHeight: 880,
    frameImage: 'https://cdn.jsdelivr.net/gh/yyk9137/st-phone-ui@main/Asset/phone-frame.png',
    defaultWallpaper: 'https://c4.wallpaperflare.com/wallpaper/297/22/531/anime-scenery-landscape-sky-clouds-wallpaper-preview.jpg',
    storageKey: 'tavernPhoneSettings',
};

// ============ 获取父页面document ============
const parentDocument = window.parent.document;

// ============ 工具函数 ============
function getStorageKey(suffix) {
    let characterName = 'default';
    try {
        if (typeof getCharacterName === 'function') {
            characterName = getCharacterName() || 'default';
        }
    } catch (e) { }
    return PHONE_CONFIG.storageKey + '_' + characterName + (suffix ? '_' + suffix : '');
}

// ============ 全局状态管理 ============
// 挂到父窗口，让其他脚本也能访问
window.parent.PhoneSystem = window.parent.PhoneSystem || {
    isOpen: false,
    currentApp: null,
    registeredApps: new Map(),
    appRenderers: {},
    settings: null,
    eventListeners: new Map(),
    iframeWindow: null,

    registerApp: function (appConfig) {
        var id = appConfig.id;
        var name = appConfig.name;
        var icon = appConfig.icon;
        var color = appConfig.color;
        var order = appConfig.order || 99;
        if (!id || !name) {
            console.error('[PhoneSystem] 注册APP失败：缺少必要参数');
            return false;
        }
        this.registeredApps.set(id, { id: id, name: name, icon: icon, color: color, order: order });
        console.log('[PhoneSystem] APP已注册:', name);
        this.emit('app-registered', { id: id, name: name });
        if (this.iframeWindow) {
            this.iframeWindow.postMessage({ type: 'render-apps' }, '*');
        }
        return true;
    },

    registerRenderer: function(appId, rendererFunction) {
        if (!appId || typeof rendererFunction !== 'function') {
            console.error('[PhoneSystem] 注册渲染器失败：缺少必要参数');
            return false;
        }
        this.appRenderers[appId] = rendererFunction;
        console.log('[PhoneSystem] 渲染器已注册:', appId);
        return true;
    },

    openApp: function (appId) {
        console.log('[PhoneSystem] openApp被调用, appId:', appId);
        var app = this.registeredApps.get(appId);
        if (!app) {
            console.error('[PhoneSystem] APP不存在:', appId);
            return;
        }
        this.currentApp = appId;
        console.log('[PhoneSystem] 准备emit app-opened事件, 监听器数量:', this.eventListeners.get('app-opened')?.length || 0);
        this.emit('app-opened', { id: appId, app: app });
        if (this.iframeWindow) {
            this.iframeWindow.postMessage({ type: 'open-app', appId: appId }, '*');
        }
    },


    goHome: function () {
        this.currentApp = null;
        this.emit('go-home');
        if (this.iframeWindow) {
            this.iframeWindow.postMessage({ type: 'go-home' }, '*');
        }
    },

    getSettings: function () {
        if (!this.settings) this.loadSettings();
        return this.settings;
    },

    loadSettings: function () {
        try {
            var saved = localStorage.getItem(getStorageKey());
            this.settings = saved ? JSON.parse(saved) : this.getDefaultSettings();
        } catch (e) {
            this.settings = this.getDefaultSettings();
        }
        return this.settings;
    },

    saveSettings: function (newSettings) {
        this.settings = Object.assign({}, this.settings, newSettings);
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(this.settings));
            this.emit('settings-changed', this.settings);
        } catch (e) { }
    },

    getDefaultSettings: function () {
        return {
            wallpaper: PHONE_CONFIG.defaultWallpaper,
            apiConfig: {
                provider: 'openai',
                apiKey: '',
                apiUrl: 'https://api.openai.com/v1/chat/completions',
                model: 'gpt-4o-mini',
                maxTokens: 2048,
                temperature: 0.7,
            },
        };
    },

    on: function (event, callback) {
        console.log('[PhoneSystem] 注册事件监听:', event);
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
        console.log('[PhoneSystem] 事件', event, '当前监听器数量:', this.eventListeners.get(event).length);
    },

    off: function (event, callback) {
        if (!this.eventListeners.has(event)) return;
        var listeners = this.eventListeners.get(event);
        var index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
    },

    emit: function (event, data) {
        if (!this.eventListeners.has(event)) return;
        this.eventListeners.get(event).forEach(function (cb) {
            try { cb(data); } catch (e) { console.error('[PhoneSystem] 事件处理错误:', e); }
        });
    },

    callExternalAPI: async function (messages, options) {
        options = options || {};
        var settings = this.getSettings();
        var config = settings.apiConfig;

        if (!config.apiKey) {
            throw new Error('请先在设置中配置API Key');
        }

        // 确保API URL格式正确
        var apiUrl = config.apiUrl || 'https://api.openai.com/v1/chat/completions';
        apiUrl = apiUrl.trim();
        // 移除末尾斜杠
        while (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
        // 如果URL不包含chat/completions路径，自动添加
        if (!apiUrl.includes('/chat/completions')) {
            if (!apiUrl.includes('/v1')) {
                apiUrl += '/v1/chat/completions';
            } else {
                apiUrl += '/chat/completions';
            }
        }

        var requestBody = {
            model: options.model || config.model,
            messages: messages,
            max_tokens: options.maxTokens || config.maxTokens,
            temperature: options.temperature !== undefined ? options.temperature : config.temperature,
            stream: false,
        };

        console.log('[PhoneSystem] API请求:', apiUrl);

        var response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + config.apiKey,
            },
            body: JSON.stringify(requestBody),
        });

        // 检查响应Content-Type
        var contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            throw new Error('API返回了HTML而非JSON，请检查API URL配置是否正确');
        }

        if (!response.ok) {
            var error = await response.text();
            throw new Error('API请求失败: ' + response.status + ' - ' + error);
        }

        var data = await response.json();
        return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    },

    getAppsForRender: function () {
        return Array.from(this.registeredApps.values()).sort(function (a, b) { return a.order - b.order; });
    },

    // ============ 新闻系统（在父窗口运行，避免iframe关闭问题） ============
    newsSystem: {
        lastKnownDate: null,
        dateCheckInterval: null,
        currentChatId: null,
        newsData: {
            headlines: [],
            lastUpdate: null,
            isLoading: false
        },

        // 获取当前聊天ID（每次调用都重新获取，不缓存）
        getChatId: function () {
            try {
                var ctx = window.parent.SillyTavern?.getContext?.();
                if (!ctx) {
                    console.warn('[新闻系统] 无法获取SillyTavern上下文');
                    return 'default';
                }

                // 方法1: 使用getCurrentChatId函数（官方推荐）
                if (typeof ctx.getCurrentChatId === 'function') {
                    var chatId = ctx.getCurrentChatId();
                    if (chatId) {
                        console.log('[新闻系统] getCurrentChatId:', chatId);
                        return String(chatId);
                    }
                }

                // 方法2: 直接从context获取chatId
                if (ctx.chatId) {
                    console.log('[新闻系统] ctx.chatId:', ctx.chatId);
                    return String(ctx.chatId);
                }

                // 方法3: 从characters获取当前角色的chat文件名
                if (ctx.characterId !== undefined && ctx.characters && ctx.characters[ctx.characterId]) {
                    var charChat = ctx.characters[ctx.characterId].chat;
                    if (charChat) {
                        console.log('[新闻系统] character.chat:', charChat);
                        return String(charChat);
                    }
                }

                console.warn('[新闻系统] 无法获取chatId，使用default');
                return 'default';
            } catch (e) {
                console.error('[新闻系统] 获取chatId失败:', e);
                return 'default';
            }
        },

        // 获取当前聊天的存储key
        getStorageKey: function (suffix) {
            return 'phone_news_' + this.getChatId() + '_' + suffix;
        },

        // 从消息文本中提取JSONPatch数据（回退方案）
        extractFromMessageText: function () {
            try {
                var ctx = window.parent.SillyTavern?.getContext?.();
                if (!ctx || !ctx.chat || !Array.isArray(ctx.chat)) return null;

                // 从最后一条消息开始找，找到包含UpdateVariable的消息
                for (var i = ctx.chat.length - 1; i >= 0; i--) {
                    var msg = ctx.chat[i];
                    if (msg && msg.mes) {
                        var jsonPatchMatch = msg.mes.match(/<JSONPatch>\s*(\[[\s\S]*?\])\s*<\/JSONPatch>/);
                        if (jsonPatchMatch) {
                            try {
                                var patches = JSON.parse(jsonPatchMatch[1]);
                                var extracted = { 世界: {}, 公寓: {}, 租客列表: {} };
                                
                                patches.forEach(function(patch) {
                                    if (patch.path && patch.value !== undefined) {
                                        var parts = patch.path.split('/').filter(Boolean);
                                        if (parts[0] === '世界' && parts[1]) {
                                            extracted.世界[parts[1]] = patch.value;
                                        } else if (parts[0] === '公寓' && parts[1]) {
                                            if (!extracted.公寓[parts[1]]) extracted.公寓[parts[1]] = {};
                                            if (parts[2]) {
                                                extracted.公寓[parts[1]][parts[2]] = patch.value;
                                            }
                                        } else if (parts[0] === '租客列表' && parts[1]) {
                                            extracted.租客列表[parts[1]] = patch.value;
                                        }
                                    }
                                });
                                
                                console.log('[新闻系统] 从消息文本提取数据成功:', extracted);
                                return extracted;
                            } catch (e) {
                                console.log('[新闻系统] 解析JSONPatch失败:', e);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('[新闻系统] 从消息提取数据失败:', e);
            }
            return null;
        },

        // 获取当前游戏日期
        getCurrentGameDate: function () {
            try {
                var Mvu = window.parent.Mvu;
                if (Mvu && typeof Mvu.getMvuData === 'function') {
                    var targetMessageId = 'latest';
                    if (typeof window.parent.getLastMessageId === 'function') {
                        targetMessageId = window.parent.getLastMessageId();
                    } else if (window.parent.$) {
                        var lastMes = window.parent.$('#chat .mes').last();
                        if (lastMes.length) {
                            targetMessageId = lastMes.attr('mesid') || 'latest';
                        }
                    }
                    var result = Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
                    if (result && result.stat_data && result.stat_data.世界) {
                        return result.stat_data.世界.日期 || null;
                    }
                }
            } catch (e) {
                console.error('[新闻系统] MVU获取日期失败:', e);
            }
            
            // 回退：从消息文本提取
            console.log('[新闻系统] MVU数据不可用，尝试从消息文本提取日期');
            var extracted = this.extractFromMessageText();
            if (extracted && extracted.世界 && extracted.世界.日期) {
                console.log('[新闻系统] 从消息文本获取日期成功:', extracted.世界.日期);
                return extracted.世界.日期;
            }
            
            return null;
        },

        // 获取游戏状态
        getGameState: function () {
            try {
                var Mvu = window.parent.Mvu;
                if (Mvu && typeof Mvu.getMvuData === 'function') {
                    var targetMessageId = 'latest';
                    if (typeof window.parent.getLastMessageId === 'function') {
                        targetMessageId = window.parent.getLastMessageId();
                    } else if (window.parent.$) {
                        var lastMes = window.parent.$('#chat .mes').last();
                        if (lastMes.length) {
                            targetMessageId = lastMes.attr('mesid') || 'latest';
                        }
                    }
                    var result = Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
                    if (result && result.stat_data) {
                        return result.stat_data;
                    }
                }
            } catch (e) { }
            
            // 回退：从消息文本提取
            console.log('[新闻系统] MVU数据不可用，尝试从消息文本提取游戏状态');
            var extracted = this.extractFromMessageText();
            if (extracted && (extracted.世界 || extracted.租客列表)) {
                console.log('[新闻系统] 从消息文本获取游戏状态成功');
                return extracted;
            }
            
            return null;
        },

        // 获取最近对话内容（3条AI回复 + 3条用户对话）
        getRecentChatContext: function () {
            try {
                var ctx = window.parent.SillyTavern?.getContext?.();
                if (!ctx || !ctx.chat || !Array.isArray(ctx.chat)) return '';

                var aiMessages = [];
                var userMessages = [];

                // 从后往前遍历，分别取3条AI和3条用户
                for (var i = ctx.chat.length - 1; i >= 0 && (aiMessages.length < 3 || userMessages.length < 3); i--) {
                    var msg = ctx.chat[i];
                    if (msg && msg.mes) {
                        var text = msg.mes
                            .replace(/<[^>]*>/g, '')
                            .replace(/\{\{[^}]*\}\}/g, '')
                            .replace(/\[\[[^\]]*\]\]/g, '')
                            .trim();
                        if (text) {
                            if (msg.is_user === true && userMessages.length < 3) {
                                userMessages.unshift('玩家：' + text);
                            } else if (msg.is_user !== true && aiMessages.length < 3) {
                                aiMessages.unshift('AI：' + text);
                            }
                        }
                    }
                }

                // 合并：用户对话在前，AI回复在后
                return userMessages.concat(aiMessages).join('\n');
            } catch (e) {
                console.error('[新闻系统] 获取聊天记录失败:', e);
                return '';
            }
        },

        // 保存新闻到变量
        saveNewsToVariable: function () {
            var self = this;
            try {
                var newsText = self.newsData.headlines.map(function (news) {
                    return '【' + news.tag + '】' + news.title + '：' + news.summary;
                }).join('\n');

                var command = '/setvar key=phone_news ' + newsText;
                if (window.parent.executeSlashCommands) {
                    window.parent.executeSlashCommands(command);
                } else if (window.parent.SillyTavern && window.parent.SillyTavern.getContext) {
                    var context = window.parent.SillyTavern.getContext();
                    if (context.executeSlashCommands) {
                        context.executeSlashCommands(command);
                    }
                }

                localStorage.setItem(self.getStorageKey('data'), JSON.stringify({
                    headlines: self.newsData.headlines,
                    lastUpdate: self.newsData.lastUpdate
                }));
                console.log('[新闻系统] 新闻已保存到变量');
            } catch (e) {
                console.error('[新闻系统] 保存失败:', e);
            }
        },

        // 生成新闻
        generateNews: async function (isAuto) {
            var self = this;
            if (self.newsData.isLoading) {
                console.log('[新闻系统] 正在加载中，跳过');
                return false;
            }
            self.newsData.isLoading = true;

            try {
                // 检查API配置
                var settings = window.parent.PhoneSystem.getSettings();
                if (!settings.apiConfig || !settings.apiConfig.apiKey) {
                    throw new Error('请先在小手机设置中配置API Key');
                }
                console.log('[新闻系统] API配置检查通过');

                var gameState = self.getGameState();
                var chatContext = self.getRecentChatContext();
                var contextInfo = '当前是一个公寓房东模拟游戏。';

                console.log('[新闻系统] gameState:', gameState ? '已获取' : '未获取');
                console.log('[新闻系统] chatContext:', chatContext ? '已获取' : '未获取');

                if (gameState) {
                    var world = gameState.世界 || {};
                    var apartment = gameState.公寓 || {};
                    var tenants = gameState.租客列表 || {};
                    contextInfo = '当前游戏状态：\n- 日期：' + (world.日期 || '未知') +
                        '\n- 时间：' + (world.时间 || '未知') +
                        '\n- 天气：' + (world.天气 || '未知') +
                        '\n- 公寓名称：' + (apartment.名称 || '未知') +
                        '\n- 租客数量：' + Object.keys(tenants).length + '人' +
                        '\n- 租客名单：' + (Object.keys(tenants).join('、') || '无') +
                        '\n\n最近发生的事件（对话摘要）：\n' + (chatContext || '暂无');
                }

                var systemPrompt = '你是一个游戏内新闻编辑。根据提供的游戏状态和最近发生的事件，生成3-5条简短的新闻头条。\n' +
                    '新闻应该与游戏世界观相符，可以包含：本地新闻、天气预报、社会趣闻、经济动态等。\n' +
                    '新闻要有趣味性，可以隐晦地与玩家或租客的最近活动相关。\n\n' +
                    '请以JSON格式返回，格式如下：\n' +
                    '{\n  "headlines": [\n    {"tag": "本地", "title": "标题", "summary": "简短摘要", "source": "来源", "time": "时间"},\n    ...\n  ]\n}';

                var userPrompt = contextInfo + '\n\n请根据以上状态生成今日新闻。';

                console.log('[新闻系统] ========== 请求开始 ==========');
                console.log('[新闻系统] System Prompt:\n', systemPrompt);
                console.log('[新闻系统] User Prompt:\n', userPrompt);

                var result = await window.parent.PhoneSystem.callExternalAPI([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]);

                console.log('[新闻系统] ========== AI 响应 ==========');
                console.log('[新闻系统] Raw Response:\n', result);

                if (result) {
                    var parsed = null;
                    try {
                        parsed = JSON.parse(result);
                    } catch (e) {
                        var jsonMatch = result.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            parsed = JSON.parse(jsonMatch[0]);
                        }
                    }

                    if (parsed && parsed.headlines) {
                        self.newsData.headlines = parsed.headlines;
                        self.newsData.lastUpdate = new Date();
                        self.saveNewsToVariable();

                        var currentDate = self.getCurrentGameDate();
                        if (currentDate) {
                            localStorage.setItem(self.getStorageKey('last_date'), currentDate);
                        }

                        console.log('[新闻系统] 新闻生成成功');
                        try {
                            if (window.parent && window.parent.toastr) {
                                window.parent.toastr.info('📰 今日新闻已更新');
                            }
                        } catch (e) { }

                        // 通知APP刷新显示
                        window.parent.PhoneSystem.emit('news-updated', self.newsData);
                        return true;
                    }
                }
                throw new Error('无法解析新闻数据');
            } catch (e) {
                console.error('[新闻系统] 生成失败:', e);
                try {
                    if (!isAuto && window.parent && window.parent.toastr) {
                        window.parent.toastr.error('获取新闻失败: ' + e.message);
                    }
                } catch (e2) { }
                return false;
            } finally {
                self.newsData.isLoading = false;
            }
        },

        // 检查日期变化
        checkDateAndGenerate: function () {
            var self = this;

            // 先检查chatId是否匹配，防止跨聊天数据污染
            var currentChatId = self.getChatId();
            if (currentChatId !== self.currentChatId) {
                // 自动恢复：可能是启动时context未就绪导致初始ID为default
                console.log('[新闻系统] chatId不匹配，自动恢复:', self.currentChatId, '->', currentChatId);
                self.loadNewsForCurrentChat();
                return;
            }

            var currentDate = self.getCurrentGameDate();
            if (!currentDate) {
                console.log('[新闻系统] 无法获取当前日期');
                return;
            }

            // 从storage读取该聊天上次生成新闻的日期
            var savedDate = localStorage.getItem(self.getStorageKey('last_date'));

            console.log('[新闻系统] 检查日期 - chatId:', currentChatId, '当前:', currentDate, '记录:', self.lastKnownDate, '存储:', savedDate);

            if (self.lastKnownDate === null) {
                // 首次加载，记录日期
                self.lastKnownDate = currentDate;

                // 如果存储的日期与当前日期不同，说明跨天了，需要更新（日期改变是最高优先级）
                if (savedDate && savedDate !== currentDate) {
                    console.log('[新闻系统] 检测到跨天，自动更新新闻:', savedDate, '->', currentDate);
                    self.generateNews(true);
                } else {
                    console.log('[新闻系统] 首次加载，记录日期:', currentDate);
                }
                return;

            } else if (currentDate !== self.lastKnownDate) {
                // 日期变化，自动更新（日期改变是最高优先级，无论有无新闻）
                console.log('[新闻系统] 日期变化:', self.lastKnownDate, '->', currentDate);
                self.lastKnownDate = currentDate;
                self.generateNews(true);
            }
        },

        // 加载当前聊天的新闻
        loadNewsForCurrentChat: function () {
            var self = this;
            var chatId = self.getChatId();

            console.log('[新闻系统] 切换聊天，旧ID:', self.currentChatId, '新ID:', chatId);

            // 重置状态
            self.lastKnownDate = null;
            self.currentChatId = chatId;
            self.newsData.headlines = [];
            self.newsData.lastUpdate = null;

            // 加载当前聊天的新闻
            try {
                var storageKey = self.getStorageKey('data');
                console.log('[新闻系统] 存储key:', storageKey);
                var saved = localStorage.getItem(storageKey);
                if (saved) {
                    var data = JSON.parse(saved);
                    self.newsData.headlines = data.headlines || [];
                    self.newsData.lastUpdate = data.lastUpdate ? new Date(data.lastUpdate) : null;
                    console.log('[新闻系统] 加载聊天新闻:', chatId, '条数:', self.newsData.headlines.length);
                } else {
                    console.log('[新闻系统] 该聊天无保存的新闻');
                }
            } catch (e) {
                console.error('[新闻系统] 加载失败:', e);
            }

            // 通知APP刷新显示（PhoneSystem本身就在父窗口，直接用this的引用）
            try {
                if (typeof PhoneSystem !== 'undefined' && PhoneSystem.emit) {
                    PhoneSystem.emit('news-updated', self.newsData);
                } else if (window.PhoneSystem && window.PhoneSystem.emit) {
                    window.PhoneSystem.emit('news-updated', self.newsData);
                }
            } catch (e) {
                console.error('[新闻系统] emit失败:', e);
            }
        },

        // 启动监控
        start: function () {
            var self = this;
            if (self.dateCheckInterval) return;

            // 加载当前聊天的新闻
            self.loadNewsForCurrentChat();

            // 延迟启动，等待MVU加载
            setTimeout(function () {
                self.checkDateAndGenerate();

                // 监听消息事件
                var eventOn = window.parent.eventOn;
                var checkTimeout = null;

                // 防抖检查函数（AI回复后检测跨天）
                var debouncedCheck = function () {
                    if (checkTimeout) clearTimeout(checkTimeout);
                    checkTimeout = setTimeout(function () {
                        if (window.parent.requestIdleCallback) {
                            window.parent.requestIdleCallback(function () {
                                self.checkDateAndGenerate();
                            }, { timeout: 2000 });
                        } else {
                            self.checkDateAndGenerate();
                        }
                    }, 1000);
                };

                if (typeof eventOn === 'function') {
                    eventOn('message_received', debouncedCheck);
                    eventOn('message_sent', debouncedCheck);

                    // 监听聊天切换（包括新建聊天）
                    eventOn('chat_id_changed', function (chatFileName) {
                        console.log('[新闻系统] 检测到聊天切换:', chatFileName);
                        if (chatFileName) {
                            // 延迟更长时间，等待Mvu加载新聊天数据
                            setTimeout(function () {
                                self.loadNewsForCurrentChat();
                                // 再延迟一下再检查日期，确保Mvu数据已加载
                                setTimeout(function () {
                                    self.checkDateAndGenerate();
                                }, 1000);
                            }, 1000);
                        }
                    });

                    // 监听聊天加载完成事件（更可靠）
                    eventOn('chatLoaded', function () {
                        console.log('[新闻系统] 聊天加载完成');
                        setTimeout(function () {
                            self.loadNewsForCurrentChat();
                            self.checkDateAndGenerate();
                        }, 500);
                    });

                    console.log('[新闻系统] 已绑定消息事件监听');
                }

                // 定时检查：每30秒检测跨天
                self.dateCheckInterval = setInterval(function () {
                    self.checkDateAndGenerate();
                }, 30000);
                console.log('[新闻系统] 日期监控已启动（30秒检查）');
            }, 3000);
        }
    }
};

// 确保新属性在重载时也存在（||模式可能跳过新增属性）
if (!window.parent.PhoneSystem.appRenderers) {
    window.parent.PhoneSystem.appRenderers = {};
}
if (typeof window.parent.PhoneSystem.registerRenderer !== 'function') {
    window.parent.PhoneSystem.registerRenderer = function(appId, rendererFunction) {
        if (!appId || typeof rendererFunction !== 'function') {
            console.error('[PhoneSystem] 注册渲染器失败：缺少必要参数');
            return false;
        }
        this.appRenderers[appId] = rendererFunction;
        console.log('[PhoneSystem] 渲染器已注册:', appId);
        return true;
    };
}

// ============ 清理旧实例 ============
$('#' + PHONE_CONFIG.id + '-fab').remove();
$('#' + PHONE_CONFIG.id + '-overlay').remove();
$('#' + PHONE_CONFIG.id + '-container').remove();
$('#' + PHONE_CONFIG.id + '-styles').remove();

// ============ 移动端检测（扩大范围到1024px） ============
function isMobile() {
    return window.parent.innerWidth <= 1024 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// ============ 智能计算缩放比例 ============
function calculateOptimalScale() {
    var vw = window.parent.innerWidth;
    var vh = window.parent.innerHeight;

    if (isMobile()) {
        var marginW = 40;
        var marginH = 80; // 高度方向留更多边距，避免和菜单栏重叠
        var availableWidth = vw - marginW;
        var availableHeight = vh - marginH;
        var scaleByWidth = availableWidth / PHONE_CONFIG.phoneWidth;
        var scaleByHeight = availableHeight / PHONE_CONFIG.phoneHeight;
        var optimalScale = Math.min(scaleByWidth, scaleByHeight);
        // 限制缩放范围：最小60%，最大85%
        optimalScale = Math.max(0.6, Math.min(0.85, optimalScale));
        console.log('[小手机] 移动端自适应 - 视口:', vw, 'x', vh, '缩放:', optimalScale.toFixed(2));
        return optimalScale;
    } else {
        // 桌面端固定0.85
        return 0.85;
    }
}

// ============ 创建样式 ============
var styleId = PHONE_CONFIG.id + '-styles';
var styles = '\
#' + PHONE_CONFIG.id + '-fab {\
    position: fixed;\
    width: 56px;\
    height: 56px;\
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\
    border-radius: 50%;\
    display: flex;\
    align-items: center;\
    justify-content: center;\
    cursor: grab;\
    z-index: 1000;\
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);\
    user-select: none;\
    transition: transform 0.2s ease, box-shadow 0.2s ease;\
    font-size: 28px;\
    touch-action: none;\
}\
#' + PHONE_CONFIG.id + '-fab:hover {\
    transform: scale(1.1);\
}\
#' + PHONE_CONFIG.id + '-fab.dragging {\
    cursor: grabbing;\
    transition: none;\
}\
#' + PHONE_CONFIG.id + '-overlay {\
    position: fixed;\
    top: 0;\
    left: 0;\
    width: 100vw;\
    height: 100vh;\
    background: rgba(0,0,0,0.5);\
    backdrop-filter: blur(5px);\
    z-index: 998;\
    opacity: 0;\
    visibility: hidden;\
    pointer-events: none;\
    transition: opacity 0.3s, visibility 0.3s;\
}\
#' + PHONE_CONFIG.id + '-overlay.show {\
    opacity: 1;\
    visibility: visible;\
    pointer-events: auto;\
}\
#' + PHONE_CONFIG.id + '-container {\
    position: fixed;\
    z-index: 999;\
    background: transparent;\
    opacity: 0;\
    visibility: hidden;\
    pointer-events: none;\
    transition: opacity 0.3s, visibility 0.3s;\
}\
#' + PHONE_CONFIG.id + '-container.show {\
    opacity: 1;\
    visibility: visible;\
    pointer-events: auto;\
}\
#' + PHONE_CONFIG.id + '-wrapper {\
    width: ' + PHONE_CONFIG.phoneWidth + 'px;\
    height: ' + PHONE_CONFIG.phoneHeight + 'px;\
    position: relative;\
    background: #000;\
    border-radius: 50px;\
    box-shadow: 0 0 0 12px #222, 0 30px 60px rgba(0,0,0,0.6);\
    overflow: hidden;\
}\
#' + PHONE_CONFIG.id + '-iframe {\
    width: 100%;\
    height: 100%;\
    border: none;\
    background: transparent;\
    border-radius: 0;\
    overflow: hidden;\
    touch-action: auto;\
    pointer-events: auto;\
}';

$('<style>').attr('id', styleId).text(styles).appendTo('head');

// ============ 获取设置 ============
var settings = window.parent.PhoneSystem.getSettings();
var currentWallpaper = settings.wallpaper || PHONE_CONFIG.defaultWallpaper;
window.parent.console.log('[小手机] 存储Key:', getStorageKey(), '壁纸:', settings.wallpaper ? '自定义' : '默认');

// ============ 生成APP图标HTML（不包含设置，设置只在Dock栏） ============
function generateAppsHTML() {
    var apps = window.parent.PhoneSystem.getAppsForRender();
    return apps.map(function (app) {
        return '<div class="app-icon-container" data-app-id="' + app.id + '">' +
            '<div class="app-icon" style="background: ' + (app.color || 'rgba(255, 255, 255, 0.25)') + ';">' +
            (app.icon || '📱') +
            '</div>' +
            '<div class="app-name">' + app.name + '</div>' +
            '</div>';
    }).join('');
}

// ============ 状态栏SVG（照抄温知夏） ============
var statusIconsSVG = '<svg width="88" height="14" viewBox="0 0 88 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<g><path opacity="0.2" d="M19.511 14.4102H21.512C22.035 14.4102 22.383 14.0449 22.383 13.5054V11.7783C22.383 11.2388 22.035 10.8818 21.512 10.8818H19.511C18.988 10.8818 18.64 11.2388 18.64 11.7783V13.5054C18.64 14.0449 18.988 14.4102 19.511 14.4102Z" fill="currentColor"/>' +
    '<path d="M19.515 14.4102H21.532C22.047 14.4102 22.395 14.0449 22.395 13.5054V0.9048C22.395 0.3652 22.047 0 21.532 0H19.515C19 0 18.644 0.3652 18.644 0.9048V13.5054C18.644 14.0449 19 14.4102 19.515 14.4102Z" fill="currentColor"/>' +
    '<path opacity="0.2" d="M13.301 14.4102H15.302C15.825 14.4102 16.173 14.0449 16.173 13.5054V11.7783C16.173 11.2388 15.825 10.8818 15.302 10.8818H13.301C12.778 10.8818 12.43 11.2388 12.43 11.7783V13.5054C12.43 14.0449 12.778 14.4102 13.301 14.4102Z" fill="currentColor"/>' +
    '<path d="M13.306 14.4107H15.307C15.821 14.4107 16.178 14.0454 16.178 13.5059V4.1841C16.178 3.6445 15.821 3.2793 15.307 3.2793H13.306C12.783 3.2793 12.435 3.6445 12.435 4.1841V13.5059C12.435 14.0454 12.783 14.4107 13.306 14.4107Z" fill="currentColor"/>' +
    '<path opacity="0.2" d="M7.091 14.4102H9.092C9.615 14.4102 9.963 14.0449 9.963 13.5054V11.7783C9.963 11.2388 9.615 10.8818 9.092 10.8818H7.091C6.568 10.8818 6.22 11.2388 6.22 11.7783V13.5054C6.22 14.0449 6.568 14.4102 7.091 14.4102Z" fill="currentColor"/>' +
    '<path d="M7.089 14.4097H9.09C9.613 14.4097 9.961 14.0444 9.961 13.5049V7.188C9.961 6.6484 9.613 6.2832 9.09 6.2832H7.089C6.566 6.2832 6.218 6.6484 6.218 7.188V13.5049C6.218 14.0444 6.566 14.4097 7.089 14.4097Z" fill="currentColor"/>' +
    '<path opacity="0.2" d="M0.872 14.4102H2.872C3.395 14.4102 3.744 14.0449 3.744 13.5054V11.7783C3.744 11.2388 3.395 10.8818 2.872 10.8818H0.872C0.349 10.8818 0 11.2388 0 11.7783V13.5054C0 14.0449 0.349 14.4102 0.872 14.4102Z" fill="currentColor"/>' +
    '<path d="M0.872 14.4102H2.872C3.395 14.4102 3.744 14.0449 3.744 13.5054V9.7783C3.744 9.2388 3.395 8.8818 2.872 8.8818H0.872C0.349 8.8818 0 9.2388 0 9.7783V13.5054C0 14.0449 0.349 14.4102 0.872 14.4102Z" fill="currentColor"/></g>' +
    '<g transform="translate(30, 0)"><path d="M11.5555 13.8037C11.7381 13.8037 11.8958 13.7207 12.2195 13.4053L14.2449 11.4629C14.3694 11.3384 14.4026 11.1557 14.2864 11.0063C13.7469 10.3091 12.7259 9.7031 11.5555 9.7031C10.3519 9.7031 9.33085 10.334 8.7913 11.0561C8.7083 11.189 8.7415 11.3384 8.87431 11.4629L10.8914 13.4053C11.2151 13.7124 11.3729 13.8037 11.5555 13.8037ZM6.69951 9.2881C6.88212 9.4624 7.10624 9.4375 7.27226 9.2549C8.26835 8.1509 9.89531 7.3457 11.5555 7.354C13.2322 7.3457 14.8592 8.1758 15.8719 9.2798C16.0213 9.4541 16.2288 9.4458 16.4114 9.2798L17.698 8.0015C17.8309 7.8687 17.8475 7.686 17.7229 7.5366C16.4695 6.001 14.1453 4.8472 11.5555 4.8472C8.96562 4.8472 6.6414 6.001 5.38798 7.5366C5.26347 7.686 5.27177 7.8521 5.41288 8.0015L6.69951 9.2881ZM3.25468 5.8184C3.4207 5.9761 3.65312 5.9761 3.81083 5.8101C5.85283 3.6436 8.54228 2.4981 11.5555 2.4981C14.5852 2.4981 17.2913 3.6519 19.3167 5.8184C19.4661 5.9678 19.6902 5.9595 19.8562 5.8018L21.0018 4.6563C21.1512 4.5068 21.1429 4.3242 21.0267 4.1831C19.076 1.7759 15.407 0.0078 11.5555 0.0078C7.7122 0.0078 4.02665 1.7759 2.08427 4.1831C1.96806 4.3242 1.96806 4.5068 2.10917 4.6563L3.25468 5.8184Z" fill="currentColor"/></g>' +
    '<g transform="translate(57, 0)"><path opacity="0.4" d="M5.522 13.9548H22.203C24.149 13.9548 25.54 13.7363 26.532 12.7438C27.528 11.7513 27.733 10.3858 27.733 8.4323V5.5391C27.733 3.5856 27.528 2.2134 26.532 1.2242C25.537 0.2318 24.149 0.0166 22.203 0.0166H5.461C3.59 0.0166 2.196 0.2351 1.204 1.2309C0.208 2.2234 0 3.5997 0 5.4702V8.4323C0 10.3858 0.204 11.7546 1.197 12.7438C2.196 13.7363 3.58 13.9548 5.522 13.9548ZM5.239 12.6249C3.973 12.6249 2.833 12.4245 2.171 11.77C1.519 11.1081 1.33 9.9852 1.33 8.7156V5.3138C1.33 3.9927 1.519 2.8566 2.167 2.1947C2.829 1.5294 3.987 1.3432 5.305 1.3432H22.493C23.76 1.3432 24.9 1.5468 25.551 2.198C26.213 2.86 26.403 3.9753 26.403 5.2449V8.7156C26.403 9.9852 26.21 11.1081 25.551 11.77C24.9 12.4279 23.76 12.6249 22.493 12.6249H5.239ZM28.977 9.601C29.772 9.5506 30.848 8.5256 30.848 6.9819C30.848 5.4424 29.772 4.4174 28.977 4.367V9.601Z" fill="currentColor"/>' +
    '<path d="M4.863 11.5222H22.881C23.844 11.5222 24.417 11.3715 24.781 11.0074C25.145 10.64 25.303 10.0638 25.303 9.0995V4.869C25.303 3.898 25.145 3.3284 24.785 2.961C24.417 2.6003 23.838 2.4463 22.881 2.4463H4.932C3.903 2.4463 3.309 2.597 2.959 2.9577C2.599 3.3251 2.44 3.9187 2.44 4.9304V9.0995C2.44 10.0738 2.599 10.64 2.959 11.0074C3.327 11.3681 3.906 11.5222 4.863 11.5222Z" fill="currentColor"/></g>' +
    '</svg>';

// ============ Iframe内容（照抄温知夏结构） ============
var iframeHTML = '<!DOCTYPE html>' +
    '<html lang="zh-CN">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">' +
    '<title>小手机</title>' +
    '<style>' +
    '*{box-sizing:border-box}' +
    'html,body{background:#000!important;margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important}' +
    '.phone-frame{width:100%!important;height:100%!important;background:#000!important;position:relative!important;display:flex!important;flex-direction:column!important;font-family:-apple-system,sans-serif!important}' +
    '.phone-overlay{display:none!important}' +
    '.notch{width:180px!important;height:30px!important;background:#000!important;border-radius:0 0 20px 20px!important;position:absolute!important;top:0!important;left:50%!important;transform:translateX(-50%)!important;z-index:100!important}' +
    '.screen{flex:1!important;background:#333!important;position:relative!important;overflow:hidden!important}' +
    '.status-bar{height:clamp(32px,6vh,44px)!important;width:100%;display:flex!important;justify-content:space-between!important;align-items:center!important;padding:0 clamp(16px,4vw,28px) 0 clamp(20px,5vw,32px)!important;z-index:500;position:absolute;top:0;left:0;right:0;pointer-events:none;color:#fff;font-size:clamp(12px,2vw,14px);-webkit-font-smoothing:antialiased}' +
    '.status-bar.light .status-icons{filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));color:white}' +
    '.status-bar.dark #clock{color:#000;text-shadow:none;font-weight:600}' +
    '.status-bar.dark .status-icons{filter:none;color:#000}' +
    '#clock{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;font-weight:600;cursor:pointer}' +
    '.status-icons{display:flex;gap:6px;color:white}' +
    '.status-icons svg{height:12px;width:auto;display:block;opacity:1}' +
    '.app-view{position:absolute;top:0;left:0;width:100%;height:100%;background-color:#fff;transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.4,0,0.2,1);z-index:200;display:flex;flex-direction:column}' +
    '.app-view.active{transform:translateX(0)}' +
    '.home-screen{height:100%;background:url(' + currentWallpaper + ') center/cover no-repeat;position:relative;overflow:hidden}' +
    '.home-screen::before{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to bottom,rgba(0,0,0,0.05) 60%,rgba(0,0,0,0.2));pointer-events:none}' +
    '.apps-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:max-content;gap:24px 16px;padding:70px 20px 134px;position:relative;z-index:10}' +
    '.app-icon-container{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;z-index:10;transition:transform 0.1s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
    '.app-icon-container:active{transform:scale(0.95);opacity:0.9}' +
    '.app-icon{width:60px;height:60px;border-radius:14px;display:flex;justify-content:center;align-items:center;color:white;font-size:28px;box-shadow:0 4px 10px rgba(0,0,0,0.2);background:rgba(255,255,255,0.25);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.4)}' +
    '.app-name{font-size:12px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.8);font-weight:500;margin-top:2px}' +
    '.dock{position:absolute;bottom:34px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:340px;height:90px;background:rgba(255,255,255,0.15);backdrop-filter:blur(50px) saturate(200%) brightness(1.05);-webkit-backdrop-filter:blur(50px) saturate(200%) brightness(1.05);border-radius:26px;padding:8px 18px;display:flex;align-items:center;justify-content:space-around;gap:8px;box-shadow:0 10px 40px rgba(0,0,0,0.06),0 2px 6px rgba(0,0,0,0.03),inset 0 0 0 0.5px rgba(255,255,255,0.2);z-index:50}' +
    '.dock-icon-container{display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;transition:transform 0.2s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
    '.dock-icon-container:active{transform:scale(0.92)}' +
    '.dock-icon{width:60px;height:60px;border-radius:13.8px;display:flex;align-items:center;justify-content:center;font-size:32px;box-shadow:0 4px 12px rgba(0,0,0,0.15)}' +
    '.dock-icon img{width:100%;height:100%;border-radius:13.8px}' +
    '#settings-app{background:#F2F2F7;overflow-y:auto;padding-top:50px;padding-bottom:40px}' +
    '.settings-title{padding:20px 20px 8px}' +
    '.settings-title h1{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;font-size:34px;font-weight:700;line-height:41px;margin:0;color:#000}' +
    '.settings-group{margin:16px 0 20px}' +
    '.settings-card{background:white;border-radius:10px;overflow:hidden;margin:0 16px}' +
    '.settings-row{min-height:44px;display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:0.33px solid #C7C7CC;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
    '.settings-row:last-child{border-bottom:none}' +
    '.settings-row-label{font-family:-apple-system,"SF Pro Text";font-size:17px;color:#000}' +
    '.settings-row-desc{font-family:-apple-system,"SF Pro Text";font-size:13px;color:#8E8E93;margin-top:2px}' +
    '.settings-row-center{justify-content:center}' +
    '.settings-row-blue{font-family:-apple-system,"SF Pro Text";font-size:17px;color:#007AFF}' +
    '.settings-row-red{font-family:-apple-system,"SF Pro Text";font-size:17px;color:#FF3B30}' +
    '.settings-hint{font-family:-apple-system,"SF Pro Text";font-size:13px;color:#8E8E93;padding:8px 20px;margin-left:16px}' +
    '.settings-input{font-family:-apple-system,"SF Pro Text";font-size:15px;color:#000;text-align:right;border:none;background:transparent;width:180px;outline:none}' +
    '.settings-select{font-family:-apple-system,"SF Pro Text";font-size:15px;color:#8E8E93;text-align:right;border:none;background:transparent;outline:none;min-width:140px}' +
    '.wallpaper-preview{width:32px;height:32px;border-radius:6px;background:#E5E5EA;background-size:cover;background-position:center}' +
    '::-webkit-scrollbar{width:0}' +
    '.hidden{display:none}' +
    '#app-container{position:absolute;top:0;left:0;width:100%;height:100%;z-index:200;pointer-events:none;overflow:hidden}' +
    '#app-container>*{pointer-events:auto}' +
    '.crop-modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10000;display:none;flex-direction:column;align-items:center;justify-content:center}' +
    '.crop-modal.show{display:flex}' +
    '.crop-container{position:relative;width:90%;max-width:360px;aspect-ratio:9/19.5;overflow:hidden;border:2px solid #fff;border-radius:10px;background:#000}' +
    '.crop-image{position:absolute;cursor:move;max-width:none;max-height:none}' +
    '.crop-buttons{display:flex;gap:20px;margin-top:20px}' +
    '.crop-btn{padding:12px 30px;border:none;border-radius:20px;font-size:16px;cursor:pointer;font-weight:500}' +
    '.crop-btn-cancel{background:#555;color:#fff}' +
    '.crop-btn-confirm{background:#007AFF;color:#fff}' +
    '.crop-hint{color:#999;font-size:12px;margin-top:10px}' +
    '@media (max-width: 640px){.phone-frame{width:100vw!important;height:100vh!important}.screen{width:100%!important;height:100%!important}.notch{display:none!important}}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="phone-frame">' +
    '<div class="notch"></div>' +
    '<div class="screen">' +
    '<div class="status-bar light" id="status-bar">' +
    '<span id="clock"></span>' +
    '<div></div>' +
    '<div class="status-icons" id="status-icons-container">' + statusIconsSVG + '</div>' +
    '</div>' +
    '<div class="home-screen" id="home-screen">' +
    '<div class="apps-grid" id="apps-grid">' + generateAppsHTML() + '</div>' +
    '<div class="dock">' +
    '<div class="dock-icon-container" data-app-id="settings">' +
    '<div class="dock-icon" style="background:linear-gradient(135deg,#8e8e93,#636366);">' +
    '<img src="https://cdn.jsdelivr.net/gh/yyk9137/st-phone-ui@main/Asset/Settings.svg" alt="Settings" style="width:100%;height:100%;">' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="app-view" id="settings-app">' +
    '<div class="settings-title"><h1>设置</h1></div>' +
    '<div class="settings-group">' +
    '<div class="settings-card">' +
    '<div class="settings-row" style="flex-direction:column;align-items:flex-start;">' +
    '<div class="settings-row-label">桌面壁纸</div>' +
    '<div class="settings-row-desc">上传图片自定义手机背景</div>' +
    '</div>' +
    '<div class="settings-row" id="btn-select-wallpaper">' +
    '<span class="settings-row-label">选择图片</span>' +
    '<div style="display:flex;align-items:center;gap:10px;">' +
    '<div class="wallpaper-preview" id="wallpaper-preview" style="background-image:url(' + currentWallpaper + ');"></div>' +
    '<span style="color:#C7C7CC;">›</span>' +
    '</div>' +
    '<input type="file" id="wallpaper-input" accept="image/*" class="hidden">' +
    '</div>' +
    '<div class="settings-row settings-row-center" id="btn-reset-wallpaper">' +
    '<span class="settings-row-red">恢复默认壁纸</span>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="settings-group">' +
    '<div style="font-family:-apple-system,SF Pro Text;font-size:13px;color:#8E8E93;text-transform:uppercase;padding:0 20px 8px;margin-left:16px;">API 连接</div>' +
    '<div class="settings-card">' +
    '<div class="settings-row">' +
    '<span class="settings-row-label">渠道</span>' +
    '<select class="settings-select" id="api-provider">' +
    '<option value="openai">OpenAI兼容</option>' +
    '<option value="claude">Claude</option>' +
    '<option value="deepseek">DeepSeek</option>' +
    '</select>' +
    '</div>' +
    '<div class="settings-row">' +
    '<span class="settings-row-label">URL</span>' +
    '<input class="settings-input" type="text" id="api-url" placeholder="API地址" value="' + (settings.apiConfig.apiUrl || '') + '">' +
    '</div>' +
    '<div class="settings-row">' +
    '<span class="settings-row-label">KEY</span>' +
    '<input class="settings-input" type="password" id="api-key" placeholder="API密钥" value="' + (settings.apiConfig.apiKey || '') + '">' +
    '</div>' +
    '<div class="settings-row">' +
    '<span class="settings-row-label">模型</span>' +
    '<div style="display:flex;align-items:center;gap:8px">' +
    '<input class="settings-input" type="text" id="api-model" placeholder="模型名称" value="' + (settings.apiConfig.model || '') + '" style="width:120px">' +
    '<select class="settings-select" id="api-model-select" style="display:none;min-width:120px"></select>' +
    '</div>' +
    '</div>' +
    '<div class="settings-row settings-row-center" id="btn-fetch-models">' +
    '<span class="settings-row-blue" id="btn-fetch-models-text">获取模型列表</span>' +
    '</div>' +
    '<div class="settings-row settings-row-center" id="btn-save-api">' +
    '<span class="settings-row-blue">保存设置</span>' +
    '</div>' +
    '</div>' +
    '<div class="settings-hint">配置独立API用于小手机内的异步聊天</div>' +
    '</div>' +
    '<div class="settings-group">' +
    '<div class="settings-card">' +
    '<div class="settings-row settings-row-center" id="btn-go-home">' +
    '<span class="settings-row-blue">返回桌面</span>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div style="text-align:center;padding:20px;font-size:13px;color:#8E8E93;">' +
    '小手机 v1.0.0<br>酒馆助手JS脚本版' +
    '</div>' +
    '</div>' +
    '<div id="app-container"></div>' +
    '</div>' +
    '</div>' +
    '<div class="crop-modal" id="crop-modal">' +
    '<div class="crop-container" id="crop-container"><img class="crop-image" id="crop-image" src=""></div>' +
    '<div class="crop-hint">拖动图片调整位置，双指缩放调整大小</div>' +
    '<div class="crop-buttons">' +
    '<button class="crop-btn crop-btn-cancel" id="crop-cancel">取消</button>' +
    '<button class="crop-btn crop-btn-confirm" id="crop-confirm">确定</button>' +
    '</div>' +
    '</div>' +
    '<script>' +
    'window.parent.console.log("[小手机iframe] 脚本开始执行");' +
    'function updateClock(){try{var Mvu=window.parent.Mvu;if(Mvu&&typeof Mvu.getMvuData==="function"){var result=Mvu.getMvuData({type:"message",message_id:"latest"});if(result&&result.stat_data&&result.stat_data.世界&&result.stat_data.世界.时间){document.getElementById("clock").textContent=result.stat_data.世界.时间;return}}var now=new Date();var h=String(now.getHours()).padStart(2,"0");var m=String(now.getMinutes()).padStart(2,"0");document.getElementById("clock").textContent=h+":"+m}catch(e){var now=new Date();var h=String(now.getHours()).padStart(2,"0");var m=String(now.getMinutes()).padStart(2,"0");document.getElementById("clock").textContent=h+":"+m}}updateClock();setInterval(updateClock,3000);' +
    'var cropState={imgX:0,imgY:0,scale:1,isDragging:false,startX:0,startY:0,lastX:0,lastY:0};' +
    'function bindTap(el,handler){' +
    'var touched=false;' +
    'el.ontouchend=function(e){e.preventDefault();e.stopPropagation();if(!touched){touched=true;handler();setTimeout(function(){touched=false},300)}};' +
    'el.onclick=function(e){e.stopPropagation();if(!touched){handler()}};' +
    '}' +
    '(function bindEvents(){' +
    'var appIcons=document.querySelectorAll("[data-app-id]");' +
    'appIcons.forEach(function(el){' +
    'bindTap(el,function(){window.parent.console.log("[小手机] 点击APP:",el.dataset.appId);openApp(el.dataset.appId)});' +
    '});' +
    'var btnWallpaper=document.getElementById("btn-select-wallpaper");' +
    'if(btnWallpaper)bindTap(btnWallpaper,function(){document.getElementById("wallpaper-input").click()});' +
    'var btnReset=document.getElementById("btn-reset-wallpaper");' +
    'if(btnReset)bindTap(btnReset,function(){resetWallpaper()});' +
    'var btnFetchModels=document.getElementById("btn-fetch-models");' +
    'if(btnFetchModels)bindTap(btnFetchModels,function(){fetchApiModels()});' +
    'var btnSaveApi=document.getElementById("btn-save-api");' +
    'if(btnSaveApi)bindTap(btnSaveApi,function(){saveApiSettings()});' +
    'var modelSelect=document.getElementById("api-model-select");' +
    'if(modelSelect)modelSelect.onchange=function(){document.getElementById("api-model").value=this.value};' +
    'var btnGoHome=document.getElementById("btn-go-home");' +
    'if(btnGoHome)bindTap(btnGoHome,function(){goHome()});' +
    'var btnCropCancel=document.getElementById("crop-cancel");' +
    'if(btnCropCancel)bindTap(btnCropCancel,function(){closeCropModal()});' +
    'var btnCropConfirm=document.getElementById("crop-confirm");' +
    'if(btnCropConfirm)bindTap(btnCropConfirm,function(){confirmCrop()});' +
    'window.parent.console.log("[小手机iframe] 事件绑定完成，APP图标数:",appIcons.length);' +
    '})();' +
    'document.getElementById("wallpaper-input").addEventListener("change",function(e){var file=e.target.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(event){openCropModal(event.target.result)};reader.readAsDataURL(file)});' +
    'function openCropModal(src){var modal=document.getElementById("crop-modal");var img=document.getElementById("crop-image");var container=document.getElementById("crop-container");img.src=src;img.onload=function(){var cw=container.clientWidth;var ch=container.clientHeight;var iw=img.naturalWidth;var ih=img.naturalHeight;var scale=Math.max(cw/iw,ch/ih);cropState.scale=scale;cropState.imgX=(cw-iw*scale)/2;cropState.imgY=(ch-ih*scale)/2;updateCropImage()};modal.classList.add("show")}' +
    'function closeCropModal(){document.getElementById("crop-modal").classList.remove("show")}' +
    'function updateCropImage(){var img=document.getElementById("crop-image");img.style.transform="translate("+cropState.imgX+"px,"+cropState.imgY+"px) scale("+cropState.scale+")";img.style.transformOrigin="0 0"}' +
    'function confirmCrop(){var container=document.getElementById("crop-container");var img=document.getElementById("crop-image");var canvas=document.createElement("canvas");var cw=container.clientWidth;var ch=container.clientHeight;canvas.width=cw*2;canvas.height=ch*2;var ctx=canvas.getContext("2d");ctx.scale(2,2);ctx.drawImage(img,cropState.imgX,cropState.imgY,img.naturalWidth*cropState.scale,img.naturalHeight*cropState.scale);var url=canvas.toDataURL("image/jpeg",0.9);setWallpaper(url);closeCropModal()}' +
    'var cropImg=document.getElementById("crop-image");' +
    'cropImg.addEventListener("mousedown",function(e){cropState.isDragging=true;cropState.startX=e.clientX-cropState.imgX;cropState.startY=e.clientY-cropState.imgY;e.preventDefault()});' +
    'document.addEventListener("mousemove",function(e){if(!cropState.isDragging)return;cropState.imgX=e.clientX-cropState.startX;cropState.imgY=e.clientY-cropState.startY;updateCropImage()});' +
    'document.addEventListener("mouseup",function(){cropState.isDragging=false});' +
    'cropImg.addEventListener("touchstart",function(e){if(e.touches.length===1){cropState.isDragging=true;cropState.startX=e.touches[0].clientX-cropState.imgX;cropState.startY=e.touches[0].clientY-cropState.imgY}else if(e.touches.length===2){cropState.lastDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)}e.preventDefault()},{passive:false});' +
    'document.addEventListener("touchmove",function(e){if(e.touches.length===1&&cropState.isDragging){cropState.imgX=e.touches[0].clientX-cropState.startX;cropState.imgY=e.touches[0].clientY-cropState.startY;updateCropImage()}else if(e.touches.length===2){var dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(cropState.lastDist){var delta=dist/cropState.lastDist;cropState.scale*=delta;cropState.scale=Math.max(0.5,Math.min(3,cropState.scale));updateCropImage()}cropState.lastDist=dist}},{passive:false});' +
    'document.addEventListener("touchend",function(){cropState.isDragging=false;cropState.lastDist=0});' +
    'cropImg.addEventListener("wheel",function(e){var delta=e.deltaY>0?0.9:1.1;cropState.scale*=delta;cropState.scale=Math.max(0.5,Math.min(3,cropState.scale));updateCropImage();e.preventDefault()},{passive:false});' +
    'function openApp(appId){console.log("[iframe] 打开APP:",appId);var statusBar=document.getElementById("status-bar");if(appId==="settings"){document.getElementById("settings-app").classList.add("active");statusBar.classList.remove("light");statusBar.classList.add("dark")}else{window.parent.postMessage({type:"open-app-request",appId:appId},"*")}}' +
    'function goHome(fromExternal){console.log("[iframe] 返回桌面");var statusBar=document.getElementById("status-bar");document.querySelectorAll(".app-view").forEach(function(v){v.classList.remove("active")});var appContainer=document.getElementById("app-container");if(appContainer){appContainer.innerHTML="";appContainer.style.pointerEvents="none"}document.getElementById("home-screen").style.display="block";statusBar.classList.remove("dark");statusBar.classList.add("light");if(!fromExternal){window.parent.postMessage({type:"go-home-request"},"*")}}' +
    'function setWallpaper(url){document.getElementById("home-screen").style.backgroundImage="url("+url+")";document.getElementById("wallpaper-preview").style.backgroundImage="url("+url+")";try{localStorage.setItem("phone_wallpaper",url);window.parent.console.log("[小手机] 壁纸已保存到localStorage")}catch(err){window.parent.console.error("[小手机] 保存壁纸失败:",err)}}' +
    'function resetWallpaper(){try{localStorage.removeItem("phone_wallpaper")}catch(e){}setWallpaper("' + PHONE_CONFIG.defaultWallpaper + '")}' +
    '(function loadSavedWallpaper(){try{var saved=localStorage.getItem("phone_wallpaper");if(saved){document.getElementById("home-screen").style.backgroundImage="url("+saved+")";document.getElementById("wallpaper-preview").style.backgroundImage="url("+saved+")";window.parent.console.log("[小手机] 已加载保存的壁纸")}}catch(e){}})();' +
    'async function fetchApiModels(){' +
    'var provider=document.getElementById("api-provider").value;' +
    'if(provider!=="openai"){if(window.parent.toastr)window.parent.toastr.info("仅支持OpenAI兼容接口获取模型");return}' +
    'var base=document.getElementById("api-url").value.trim();' +
    'var key=document.getElementById("api-key").value.trim();' +
    'if(!key){if(window.parent.toastr)window.parent.toastr.warning("请先填写API KEY");return}' +
    'var btnText=document.getElementById("btn-fetch-models-text");' +
    'var originalText=btnText?btnText.textContent:"获取模型列表";' +
    'if(btnText)btnText.textContent="获取中...";' +
    'try{' +
    'while(base.endsWith("/"))base=base.slice(0,-1);' +
    'var apiUrl=base.indexOf("/v1")!==-1?base+"/models":base+"/v1/models";' +
    'var res=await fetch(apiUrl,{headers:{"Authorization":"Bearer "+key,"Accept":"application/json"}});' +
    'if(!res.ok)throw new Error("连接失败，请检查URL和KEY");' +
    'var data=await res.json();' +
    'var models=[];' +
    'if(data&&data.data&&Array.isArray(data.data)){for(var i=0;i<data.data.length;i++){if(data.data[i]&&data.data[i].id)models.push(data.data[i].id)}}' +
    'if(models.length===0){if(window.parent.toastr)window.parent.toastr.warning("未获取到模型");return}' +
    'var modelInput=document.getElementById("api-model");' +
    'var modelSelect=document.getElementById("api-model-select");' +
    'if(modelSelect){var opts="";for(var j=0;j<models.length;j++){opts+="<option value=\\""+models[j]+"\\">"+models[j]+"</option>"}modelSelect.innerHTML=opts;modelSelect.value=models[0];modelSelect.style.display="block"}' +
    'if(modelInput){modelInput.value=models[0];modelInput.style.display="none"}' +
    'if(window.parent.toastr)window.parent.toastr.success("获取成功："+models.length+"个模型");' +
    '}catch(e){console.error("[设置] 获取模型失败:",e);if(window.parent.toastr)window.parent.toastr.error(e.message||"连接失败")}' +
    'finally{if(btnText)btnText.textContent=originalText}' +
    '}' +
    'function saveApiSettings(){var config={provider:document.getElementById("api-provider").value,apiUrl:document.getElementById("api-url").value,apiKey:document.getElementById("api-key").value,model:document.getElementById("api-model").value};console.log("[iframe] API设置已保存");window.parent.postMessage({type:"save-api-config",config:config},"*");if(window.parent.toastr)window.parent.toastr.success("设置已保存")}' +
    'function renderApps(apps){var grid=document.getElementById("apps-grid");grid.innerHTML=apps.map(function(app){return "<div class=\\"app-icon-container\\" data-app-id=\\""+app.id+"\\"><div class=\\"app-icon\\" style=\\"background:"+(app.color||"rgba(255,255,255,0.25)")+";\\">"+(app.icon||"📱")+"</div><div class=\\"app-name\\">"+app.name+"</div></div>"}).join("");' +
    'grid.querySelectorAll("[data-app-id]").forEach(function(el){bindTap(el,function(){openApp(el.dataset.appId)})})}' +
    'window.addEventListener("message",function(event){var data=event.data;if(!data||!data.type)return;switch(data.type){case"render-apps":if(data.apps)renderApps(data.apps);break;case"go-home":goHome(true);break;case"open-app":openExternalApp(data.appId);break}});' +
    'function openExternalApp(appId){console.log("[iframe] 打开外部APP:",appId);var renderer=window.parent.PhoneSystem&&window.parent.PhoneSystem.appRenderers&&window.parent.PhoneSystem.appRenderers[appId];if(!renderer){console.log("[iframe] APP使用事件模式:",appId);return}var statusBar=document.getElementById("status-bar");var homeScreen=document.getElementById("home-screen");var appContainer=document.getElementById("app-container");homeScreen.style.display="none";appContainer.innerHTML="";appContainer.style.pointerEvents="auto";statusBar.classList.remove("light");statusBar.classList.add("dark");try{renderer(appContainer)}catch(e){console.error("[iframe] 渲染APP失败:",e);appContainer.innerHTML="<div style=\\"padding:20px;color:#fff;text-align:center;\\">APP加载失败: "+e.message+"</div>"}}' +
    'window.parent.postMessage({type:"iframe-ready"},"*");' +
    '<\/script>' +
    '</body>' +
    '</html>';

// ============ 注册到悬浮球菜单管理器 ============
var _phoneFmmRegistered = false;
var _phoneFmmConfig = {
    id: 'phone',
    icon: '<img src="https://api.iconify.design/lucide:smartphone.svg?color=%23ffffff" style="width:24px;height:24px;">',
    label: '小手机',
    onClick: function() { togglePhone(); },
    color: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
    order: 1
};

function _tryRegisterPhoneFMM() {
    if (_phoneFmmRegistered) return true;
    if (!window.parent.FloatingMenuManager) return false;
    try {
        window.parent.FloatingMenuManager.registerButton(_phoneFmmConfig);
        _phoneFmmRegistered = true;
        // 移除fallback悬浮球（如果存在）
        $('#' + PHONE_CONFIG.id + '-fab').remove();
        console.log('[小手机] 已注册到 FloatingMenuManager');
        return true;
    } catch (e) {
        console.warn('[小手机] FloatingMenuManager注册失败:', e);
        return false;
    }
}

// 先尝试立即注册
if (!_tryRegisterPhoneFMM()) {
    // FMM尚未就绪，启动轮询重试（每500ms检查一次，最多20次=10秒）
    var _phoneRetryCount = 0;
    var _phoneRetryTimer = setInterval(function() {
        _phoneRetryCount++;
        if (_tryRegisterPhoneFMM() || _phoneRetryCount >= 20) {
            clearInterval(_phoneRetryTimer);
            if (!_phoneFmmRegistered) {
                console.log('[小手机] FloatingMenuManager始终未加载，保留独立悬浮球');
            }
        }
    }, 500);
}

if (!_phoneFmmRegistered) {
    // 降级方案：创建独立悬浮球
    console.log('[小手机] FloatingMenuManager未加载，使用独立悬浮球');

    var savedPos = { top: 100, left: 20 };
    try {
        var saved = localStorage.getItem(getStorageKey('fabPos'));
        if (saved) savedPos = JSON.parse(saved);
    } catch (e) { }

    var $fab = $('<div>')
        .attr('id', PHONE_CONFIG.id + '-fab')
        .html('📱')
        .css({ top: savedPos.top + 'px', left: savedPos.left + 'px' })
        .appendTo('body');

    console.log('[小手机] 悬浮球已创建');

    // ============ 悬浮球拖拽 ============
    var isDragging = false;
    var hasMoved = false;
    var startX, startY, initialX, initialY;
    var fabRafId = null;

    $fab.on('mousedown touchstart', function (e) {
        isDragging = true;
        hasMoved = false;
        var touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;
        var rect = $fab[0].getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        $fab.addClass('dragging');
        e.preventDefault();
    });

    // 使用requestAnimationFrame优化拖动渲染
    function updateFabPosition(deltaX, deltaY) {
        if (fabRafId) cancelAnimationFrame(fabRafId);
        fabRafId = requestAnimationFrame(function () {
            var newX = Math.max(0, Math.min(initialX + deltaX, window.parent.innerWidth - 56));
            var newY = Math.max(0, Math.min(initialY + deltaY, window.parent.innerHeight - 56));
            $fab.css({ left: newX + 'px', top: newY + 'px' });
            fabRafId = null;
        });
    }

    parentDocument.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        var deltaX = e.clientX - startX;
        var deltaY = e.clientY - startY;
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) hasMoved = true;
        updateFabPosition(deltaX, deltaY);
        e.preventDefault();
    });

    parentDocument.addEventListener('touchmove', function (e) {
        if (!isDragging) return;
        var touch = e.touches[0];
        var deltaX = touch.clientX - startX;
        var deltaY = touch.clientY - startY;
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) hasMoved = true;
        updateFabPosition(deltaX, deltaY);
        e.preventDefault();
    }, { passive: false });

    var fabTouched = false;

    $fab.on('touchstart', function () {
        fabTouched = true;
    });

    $(parentDocument).on('mouseup touchend', function () {
        if (!isDragging) return;
        isDragging = false;
        $fab.removeClass('dragging');

        var rect = $fab[0].getBoundingClientRect();
        localStorage.setItem(getStorageKey('fabPos'), JSON.stringify({ top: rect.top, left: rect.left }));

        // 移动端：touchend时如果是从fab开始且没有拖动则打开手机
        if (fabTouched && !hasMoved) {
            togglePhone();
        }
        hasMoved = false;
        fabTouched = false;
    });

    $fab.on('click', function () {
        // 桌面端：click事件
        if (hasMoved) {
            hasMoved = false;
            return;
        }
        togglePhone();
    });
}

// ============ 创建遮罩层 ============
var $overlay = $('<div>')
    .attr('id', PHONE_CONFIG.id + '-overlay')
    .appendTo('body');

$overlay.on('click', function () {
    closePhone();
});

// ============ 创建手机容器 ============
var $container = $('<div>')
    .attr('id', PHONE_CONFIG.id + '-container')
    .appendTo('body');

var $wrapper = $('<div>')
    .attr('id', PHONE_CONFIG.id + '-wrapper')
    .appendTo($container);

var $iframe = $('<iframe>')
    .attr('id', PHONE_CONFIG.id + '-iframe')
    .appendTo($wrapper);

// ============ 应用样式函数============
function applyContainerStyles() {
    var scale = calculateOptimalScale();
    var vw = window.parent.innerWidth;
    var vh = window.parent.innerHeight;

    if (isMobile()) {
        // 移动端：使用absolute定位，解决WebView兼容性问题
        var scaledWidth = PHONE_CONFIG.phoneWidth * scale;
        var scaledHeight = PHONE_CONFIG.phoneHeight * scale;
        var scrollTop = window.parent.pageYOffset || parentDocument.documentElement.scrollTop;
        var scrollLeft = window.parent.pageXOffset || parentDocument.documentElement.scrollLeft;
        var topPosition = Math.max(20, (vh - scaledHeight) / 2) + scrollTop;
        var leftPosition = Math.max(20, (vw - scaledWidth) / 2) + scrollLeft;

        $container.css({
            position: 'absolute',
            top: topPosition + 'px',
            left: leftPosition + 'px',
            transform: 'none'
        });
        $wrapper.css({
            transform: 'scale(' + scale + ')',
            transformOrigin: 'top left',
            borderRadius: '40px',
            boxShadow: '0 0 0 8px #222, 0 20px 40px rgba(0,0,0,0.5)'
        });
    } else {
        // 桌面端：保持fixed居中
        $container.css({
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
        });
        $wrapper.css({
            transform: 'scale(' + scale + ')',
            transformOrigin: 'center center',
            borderRadius: '50px',
            boxShadow: '0 0 0 12px #222, 0 30px 60px rgba(0,0,0,0.6)'
        });
    }
}

applyContainerStyles();
$(window.parent).on('resize', applyContainerStyles);

// 写入iframe内容
$iframe.on('load', function () {
    window.parent.PhoneSystem.iframeWindow = this.contentWindow;
    setTimeout(function () {
        if (!window.parent.PhoneSystem.iframeWindow) return;
        var apps = window.parent.PhoneSystem.getAppsForRender();
        window.parent.PhoneSystem.iframeWindow.postMessage({ type: 'render-apps', apps: apps }, '*');
    }, 100);
});

$iframe[0].srcdoc = iframeHTML;

// ============ 监听iframe消息 ============
// 注意：手机iframe创建在window.parent上，所以消息要在window.parent监听
window.parent.addEventListener('message', async function (event) {
    console.log('[小手机] 收到消息:', event.data?.type);

    var data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
        case 'iframe-ready':
            console.log('[小手机] iframe就绪');
            if (window.parent.PhoneSystem.iframeWindow) {
                var apps = window.parent.PhoneSystem.getAppsForRender();
                window.parent.PhoneSystem.iframeWindow.postMessage({ type: 'render-apps', apps: apps }, '*');
            }
            break;
        case 'open-app-request':
            window.parent.PhoneSystem.openApp(data.appId);
            break;
        case 'go-home-request':
            window.parent.PhoneSystem.goHome();
            break;
        case 'save-wallpaper':
            var s1 = window.parent.PhoneSystem.getSettings();
            s1.wallpaper = data.url;
            window.parent.PhoneSystem.saveSettings(s1);
            console.log('[小手机] 壁纸已保存');
            break;
        case 'save-api-config':
            var s2 = window.parent.PhoneSystem.getSettings();
            s2.apiConfig = Object.assign({}, s2.apiConfig, data.config);
            window.parent.PhoneSystem.saveSettings(s2);
            console.log('[小手机] API设置已保存');
            break;
    }
});

// ============ 打开/关闭手机 ============
function togglePhone() {
    if (window.parent.PhoneSystem.isOpen) {
        closePhone();
    } else {
        openPhone();
    }
}

function openPhone() {
    applyContainerStyles();
    $overlay.addClass('show');
    $container.addClass('show');
    window.parent.PhoneSystem.isOpen = true;
    window.parent.PhoneSystem.emit('phone-opened');
}

function closePhone() {
    $overlay.removeClass('show');
    $container.removeClass('show');
    window.parent.PhoneSystem.isOpen = false;
    window.parent.PhoneSystem.goHome();
    window.parent.PhoneSystem.emit('phone-closed');
}

// ============ 监听APP注册事件 ============
window.parent.PhoneSystem.on('app-registered', function () {
    if (window.parent.PhoneSystem.iframeWindow) {
        var apps = window.parent.PhoneSystem.getAppsForRender();
        window.parent.PhoneSystem.iframeWindow.postMessage({ type: 'render-apps', apps: apps }, '*');
    }
});

// ============ 清理函数 ============
function cleanupPhone() {
    console.log('[小手机] 正在清理悬浮窗...');
    // 从 FloatingMenuManager 反注册
    if (window.parent.FloatingMenuManager) {
        window.parent.FloatingMenuManager.unregisterButton('phone');
    }
    $('#' + PHONE_CONFIG.id + '-fab').remove();
    $('#' + PHONE_CONFIG.id + '-overlay').remove();
    $('#' + PHONE_CONFIG.id + '-container').remove();
    $('#' + PHONE_CONFIG.id + '-styles').remove();

    // 重置PhoneSystem状态
    if (window.parent.PhoneSystem) {
        window.parent.PhoneSystem.isOpen = false;
        window.parent.PhoneSystem.isVisible = false;
        window.parent.PhoneSystem.iframeWindow = null;
        // 清空事件监听器，避免旧回调累积导致报错
        window.parent.PhoneSystem.eventListeners.clear();
    }
}

// ============ 监听脚本卸载事件 ============
// 酒馆助手会在切换角色或返回首页时卸载角色脚本库的脚本
$(window).on('pagehide', function () {
    console.log('[小手机] 脚本正在卸载，清理悬浮窗...');
    cleanupPhone();
});

// ============ 监听聊天切换 ============
if (typeof eventOn === 'function') {
    eventOn('chat_id_changed', function (chatFileName) {
        console.log('[小手机] 检测到聊天切换:', chatFileName);
        // 只在返回首页时清理（chatFileName为空）
        // 切换到其他聊天时，pagehide事件会处理清理
        if (!chatFileName) {
            console.log('[小手机] 返回首页，清理悬浮窗');
            cleanupPhone();
        }
    });
    console.log('[小手机] 已注册chat_id_changed事件监听');
}

window.parent.PhoneSystem.emit('main-ready');

// ============ 启动新闻系统 ============
console.log('[小手机] 准备启动新闻系统...');
try {
    window.parent.PhoneSystem.newsSystem.start();
    console.log('[小手机] 新闻系统启动调用完成');
} catch (e) {
    console.error('[小手机] 新闻系统启动失败:', e);
}

// ============ 初始化分析调度器和租客分析系统 ============
console.log('[小手机] 准备初始化分析模块...');
try {
    // 初始化调度器（模块导出到window.parent）
    if (window.parent.AnalysisScheduler) {
        window.parent.AnalysisScheduler.init();
        console.log('[小手机] 分析调度器初始化完成');
    } else {
        console.warn('[小手机] 分析调度器模块未加载');
    }

    // 初始化租客分析器
    if (window.parent.TenantAnalyzer) {
        // The lifecycle starts the analyzer exactly once after PhoneSystem is ready.
        console.log('[小手机] 租客分析系统初始化完成');
    } else {
        console.warn('[小手机] 租客分析模块未加载');
    }

    // 租客档案APP现在自己注册自己（类似新闻APP），不需要这里注册
    console.log('[小手机] 租客档案APP将自行注册');
} catch (e) {
    console.error('[小手机] 分析模块初始化失败:', e);
}

console.log('[小手机] 初始化完成');
