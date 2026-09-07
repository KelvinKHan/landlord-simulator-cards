// ==================== 租客分析系统模块 ====================
// 自动分析租客状态变化，更新ChatLore档案
// 依赖: analysis_scheduler.js, phone_main.js (PhoneSystem)

(function() {
    'use strict';

    // ============ 配置常量 ============
    const DEFAULT_CONFIG = {
        triggerInterval: 30,        // 每N楼触发一次分析（用户+AI总楼数）
        enableAutoAnalysis: true,   // 是否启用自动分析
        // 智能过滤：自动只分析这N楼中出现过的租客，无需单独配置
    };

    // ============ 分析提示词模板 ============
    const ANALYSIS_PROMPTS = {
        // 动态人设分析 - 本色+上次调色+聊天记录 → 新调色
        tenantDynamicAnalysis: function(tenantName, baseProfile, lastDynamic, recentChat) {
            return `你是一个角色动态分析专家。请根据角色的本色、上次调色和最近对话，分析角色"${tenantName}"的变化，生成新的"调色"档案。

## 角色本色（固定人设，不会改变）
${baseProfile || '暂无本色档案'}

## 上次调色（上一次分析的动态人设）
${lastDynamic || '暂无上次调色，这是第一次分析'}

## 最近对话内容（重点关注与${tenantName}相关的部分）
${recentChat}

## 分析要求
根据最近的对话内容，分析"${tenantName}"在以下四个方面可能发生的变化。请写出具体、生动的描述。

## 输出格式
请直接输出以下格式的内容（每项2-4句话，要具体描述）：

【${tenantName}的近期动态】

行为变化：
${tenantName}最近[具体描述行为上的变化，包括日常习惯、作息、活动方式等。如无变化则描述当前保持的行为状态]

性格微调：
${tenantName}在性格上[描述细微的性格变化或当前性格特点的体现，不影响整体人设]

语言风格：
${tenantName}说话时[描述说话方式、用词习惯、语气的特点或变化]

个人目标：
${tenantName}目前[描述当前的目标、愿望、关注的事情或追求]

注意：
- 每项内容必须以"${tenantName}"开头，让读者知道这是谁的档案
- 每项2-4句话，内容要具体、有细节
- 要基于对话内容推断，不要凭空捏造
- 如果对话中没有相关信息，可以根据本色档案描述当前状态
- 不要使用markdown符号
- 直接输出内容，不要输出解释文字`;
        },

        // 解析AI返回的动态档案内容
        parseDynamicContent: function(aiResponse) {
            var content = aiResponse.trim();
            // 移除可能的markdown代码块标记
            content = content.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '');
            return content;
        },
    };

    // ============ 租客分析器主体 ============
    const TenantAnalyzer = {
        // 配置
        config: Object.assign({}, DEFAULT_CONFIG),
        
        // 状态
        lastAnalyzedFloor: 0,
        lastAnalysisTime: null,
        analysisLog: [],
        logLimit: 100,
        
        // ChatLore缓存
        chatLoreCache: new Map(),
        
        // 事件监听器
        eventListeners: new Map(),

        // ============ 初始化 ============
        init: function() {
            var self = this;
            console.log('[租客分析] 系统初始化');
            
            // 加载配置
            self.loadConfig();
            
            // 监听楼层变化（通过消息事件）
            self.setupFloorWatcher();
            
            return self;
        },

        // ============ 获取当前聊天ID（参考新闻系统，每次调用都重新获取） ============
        getChatId: function() {
            try {
                var ctx = window.parent.SillyTavern?.getContext?.();
                if (ctx && ctx.chatId) {
                    return ctx.chatId;
                }
            } catch (e) {}
            return 'default';
        },
        
        // 获取当前聊天的存储key（参考新闻系统）
        getStorageKey: function(suffix) {
            return 'tenant_analyzer_' + this.getChatId() + '_' + suffix;
        },
        
        // ============ 配置管理 ============
        loadConfig: function() {
            try {
                // 加载全局配置
                var saved = localStorage.getItem('tenant_analyzer_config');
                if (saved) {
                    this.config = Object.assign({}, DEFAULT_CONFIG, JSON.parse(saved));
                }
                
                // 加载当前聊天的状态
                this.loadChatState();
                
                console.log('[租客分析] 配置已加载:', this.config);
            } catch (e) {
                console.error('[租客分析] 加载配置失败:', e);
            }
        },
        
        // 加载当前聊天的状态（参考新闻系统）
        loadChatState: function() {
            var chatId = this.getChatId();
            console.log('[租客分析] 加载聊天状态，chatId:', chatId);
            
            try {
                var storageKey = this.getStorageKey('state');
                var saved = localStorage.getItem(storageKey);
                
                if (saved) {
                    var state = JSON.parse(saved);
                    this.lastAnalyzedFloor = state.lastAnalyzedFloor || 0;
                    this.lastAnalysisTime = state.lastAnalysisTime ? new Date(state.lastAnalysisTime) : null;
                    console.log('[租客分析] 已加载状态 - 楼层:', this.lastAnalyzedFloor, '时间:', this.lastAnalysisTime);
                } else {
                    // 新聊天，重置状态
                    this.lastAnalyzedFloor = 0;
                    this.lastAnalysisTime = null;
                    console.log('[租客分析] 新聊天，状态已重置');
                }
            } catch (e) {
                console.error('[租客分析] 加载聊天状态失败:', e);
                this.lastAnalyzedFloor = 0;
                this.lastAnalysisTime = null;
            }
        },

        saveConfig: function() {
            try {
                // 保存全局配置
                localStorage.setItem('tenant_analyzer_config', JSON.stringify(this.config));
                
                // 保存当前聊天的状态（参考新闻系统，使用独立key）
                var storageKey = this.getStorageKey('state');
                localStorage.setItem(storageKey, JSON.stringify({
                    lastAnalyzedFloor: this.lastAnalyzedFloor,
                    lastAnalysisTime: this.lastAnalysisTime ? this.lastAnalysisTime.toISOString() : null,
                }));
                console.log('[租客分析] 状态已保存 - key:', storageKey, '楼层:', this.lastAnalyzedFloor);
            } catch (e) {
                console.error('[租客分析] 保存配置失败:', e);
            }
        },

        updateConfig: function(newConfig) {
            this.config = Object.assign({}, this.config, newConfig);
            this.saveConfig();
            this.emit('config-updated', this.config);
        },

        // ============ 楼层监控 ============
        setupFloorWatcher: function() {
            if (this.watcherInstalled) return;
            this.watcherInstalled = true;
            var self = this;
            
            // 获取eventSource（兼容多种环境）
            var topEventSource = (window.top && window.top.eventSource) ||
                (window.parent && window.parent.eventSource) ||
                (typeof eventSource !== 'undefined' ? eventSource : null);
            
            if (topEventSource && topEventSource.on) {
                // 监听AI回复完成事件
                topEventSource.on('message_received', function() {
                    console.log('[租客分析] MESSAGE_RECEIVED事件触发');
                    self.checkAndTrigger();
                });
                console.log('[租客分析] 已注册MESSAGE_RECEIVED事件监听');
                
                // 监听聊天切换事件 - 加载对应聊天的状态
                topEventSource.on('chat_id_changed', function() {
                    console.log('[租客分析] 检测到聊天切换，加载聊天状态');
                    self.loadChatState();
                    self.emit('status-updated', self.getStatus());
                });
                console.log('[租客分析] 已注册chatLoaded事件监听');
            } else {
                console.warn('[租客分析] eventSource不可用，将依赖定时检查');
            }
            
            // 备用：定时检查
            setInterval(function() {
                if (self.config.enableAutoAnalysis) {
                    self.checkAndTrigger();
                }
            }, 60000); // 每分钟检查一次
        },

        getCurrentFloor: function() {
            try {
                var ctx = window.parent.SillyTavern?.getContext?.();
                if (ctx && ctx.chat && Array.isArray(ctx.chat)) {
                    // 开场白是第0楼，用户1是第1楼，AI1是第2楼...
                    // chat.length = 消息数量，楼层 = chat.length - 1
                    return Math.max(0, ctx.chat.length - 1);
                }
            } catch (e) {}
            return 0;
        },

        checkAndTrigger: function() {
            if (!this.config.enableAutoAnalysis) return;
            
            var currentFloor = this.getCurrentFloor();
            var nextTriggerFloor = this.lastAnalyzedFloor + this.config.triggerInterval;
            
            // 只在AI输出后（双数楼层）检测，确保完整对话轮次
            // 开场白=0，用户1=1，AI1=2，用户2=3，AI2=4...
            if (currentFloor % 2 !== 0) {
                // 奇数楼层是用户输入，跳过
                return;
            }
            
            console.log('[租客分析] 检查触发条件 - 当前楼层:', currentFloor, '下次触发:', nextTriggerFloor);
            
            if (currentFloor >= nextTriggerFloor) {
                this.triggerAutoAnalysis();
            }
        },

        // ============ 获取租客列表 ============
        getTenantList: function() {
            try {
                // 从MVU获取租客列表
                if (window.parent.Mvu && window.parent.Mvu.getMvuData) {
                    var mvuData = window.parent.Mvu.getMvuData({ type: 'message', message_id: -1 });
                    if (mvuData && mvuData.stat_data && mvuData.stat_data.租客列表) {
                        return mvuData.stat_data.租客列表;
                    }
                }
            } catch (e) {
                console.error('[租客分析] 获取租客列表失败:', e);
            }
            return {};
        },

        // ============ 获取最近对话 ============
        getRecentChat: function(depth) {
            depth = depth || 30;
            try {
                var ctx = window.parent.SillyTavern?.getContext?.();
                if (!ctx || !ctx.chat || !Array.isArray(ctx.chat)) return '';
                
                var messages = ctx.chat.slice(-depth);
                return messages.map(function(msg, index) {
                    var speaker = msg.is_user ? '玩家' : 'AI';
                    var text = (msg.mes || '')
                        .replace(/<[^>]*>/g, '')
                        .replace(/\{\{[^}]*\}\}/g, '')
                        .substring(0, 500);
                    return '[第' + (ctx.chat.length - depth + index + 1) + '楼] ' + speaker + '：' + text;
                }).join('\n\n');
            } catch (e) {
                console.error('[租客分析] 获取对话失败:', e);
                return '';
            }
        },

        // ============ 触发自动分析（智能过滤：只分析这段对话中出现过的租客） ============
        triggerAutoAnalysis: function() {
            var self = this;
            var tenants = self.getTenantList();
            var allTenantNames = Object.keys(tenants);
            
            if (allTenantNames.length === 0) {
                console.log('[租客分析] 没有租客需要分析');
                return;
            }
            
            // 智能过滤：扫描最近N楼对话，只分析出现过的租客
            var recentChat = self.getRecentChat(self.config.triggerInterval);
            var activeTenants = allTenantNames.filter(function(name) {
                return recentChat.includes(name);
            });
            
            if (activeTenants.length === 0) {
                console.log('[租客分析] 最近' + self.config.triggerInterval + '楼对话中没有提到任何租客，跳过分析');
                // 仍然更新楼层记录，避免重复检测
                self.lastAnalyzedFloor = self.getCurrentFloor();
                self.saveConfig();
                return;
            }
            
            console.log('[租客分析] 触发自动分析，活跃租客:', activeTenants.join(', '));
            self.addLog('info', '自动分析触发，活跃租客: ' + activeTenants.join(', '));
            
            return self.runAnalysisBatch(activeTenants, false);
        },

        // ============ 手动分析 ============
        manualAnalyzeAll: function() {
            var self = this;
            var tenants = self.getTenantList();
            var tenantNames = Object.keys(tenants);
            
            if (tenantNames.length === 0) {
                self.addLog('warning', '没有租客需要分析');
                return;
            }
            
            self.addLog('info', '手动触发全部分析，租客数量: ' + tenantNames.length);
            
            return self.runAnalysisBatch(tenantNames, true);
        },

        manualAnalyzeSingle: function(tenantName) {
            var self = this;
            var tenants = self.getTenantList();
            
            if (!tenants[tenantName]) {
                self.addLog('error', '租客不存在: ' + tenantName);
                return;
            }
            
            self.addLog('info', '手动分析单个租客: ' + tenantName);
            
            return self.runAnalysisBatch([tenantName], true);
        },

        runAnalysisBatch: function(names, isManual) {
            if (this.analysisBatch) return this.analysisBatch;
            const floor = this.getCurrentFloor();
            const tenants = this.getTenantList();
            this.analysisBatch = Promise.all(names.map(name => this.addAnalysisTask(name, tenants[name], isManual)))
                .then(results => {
                    if (results.length && results.every(Boolean)) {
                        landlord.assertCurrent();
                        this.lastAnalyzedFloor = Math.max(this.lastAnalyzedFloor, floor);
                        this.lastAnalysisTime = new Date();
                        this.saveConfig();
                    }
                    return results.every(Boolean);
                }).finally(() => { this.analysisBatch = null; });
            return this.analysisBatch;
        },

        // ============ 添加分析任务到调度器 ============
        addAnalysisTask: function(tenantName, tenantData, isManual) {
            var self = this;
            
            // 调度器导出到window.parent
            var Scheduler = window.parent.AnalysisScheduler || window.AnalysisScheduler;
            if (!Scheduler) {
                console.error('[租客分析] 调度器未加载');
                return Promise.resolve(false);
            }
            
            return new Promise(resolve => Scheduler.addTask({
                onSettled: task => resolve(task.status === 'completed'),
                type: Scheduler.TASK_TYPES.TENANT_ANALYZE,
                name: '分析租客: ' + tenantName,
                priority: isManual ? Scheduler.PRIORITY.HIGH : Scheduler.PRIORITY.NORMAL,
                data: {
                    tenantName: tenantName,
                    tenantData: tenantData,
                },
                execute: function(data) {
                    return self.executeAnalysis(data.tenantName, data.tenantData);
                },
            }));
        },

        // ============ 执行分析 ============
        executeAnalysis: async function(tenantName, tenantData) {
            var self = this;
            
            console.log('[租客分析] ========== 开始执行分析 ==========');
            console.log('[租客分析] 租客:', tenantName);
            self.addLog('info', '开始分析: ' + tenantName);
            self.emit('analysis-started', { tenantName: tenantName });
            
            try {
                // 获取本色（固定档案）
                console.log('[租客分析] 1. 获取本色档案...');
                var baseProfile = await self.getBaseProfile(tenantName);
                console.log('[租客分析] 本色档案:', baseProfile ? '已获取(' + baseProfile.length + '字)' : '无');
                
                // 获取上次调色（动态档案）
                console.log('[租客分析] 2. 获取上次调色...');
                var lastDynamic = await self.getDynamicProfile(tenantName);
                console.log('[租客分析] 上次调色:', lastDynamic ? '已获取(' + lastDynamic.length + '字)' : '无');
                
                // 获取最近对话（用于分析）
                console.log('[租客分析] 3. 获取最近对话...');
                var recentChat = self.getRecentChat(self.config.triggerInterval);
                console.log('[租客分析] 最近对话:', recentChat ? recentChat.length + '字' : '无');
                
                // 生成分析提示词（本色+上次调色+聊天→新调色）
                console.log('[租客分析] 4. 生成提示词...');
                var prompt = ANALYSIS_PROMPTS.tenantDynamicAnalysis(
                    tenantName, 
                    baseProfile,
                    lastDynamic,
                    recentChat
                );
                console.log('[租客分析] 提示词长度:', prompt.length, '字');
                
                // 调用副API
                console.log('[租客分析] 5. 调用API...');
                var aiResponse = await self.callSecondaryAPI(prompt);
                console.log('[租客分析] API响应:', aiResponse ? aiResponse.length + '字' : '无');
                
                // 解析AI返回的动态档案内容
                var dynamicContent = ANALYSIS_PROMPTS.parseDynamicContent(aiResponse);
                
                if (dynamicContent && dynamicContent.length > 30) {
                    // 写入动态ChatLore（覆盖现有条目）
                    await self.updateDynamicLore(tenantName, dynamicContent);
                    
                    self.addLog('success', '分析完成: ' + tenantName);
                    self.emit('analysis-completed', { 
                        tenantName: tenantName, 
                        content: dynamicContent 
                    });
                    
                    return { tenantName: tenantName, content: dynamicContent };
                } else {
                    throw new Error('AI返回内容过短或无效');
                }
            } catch (e) {
                self.addLog('error', '分析失败: ' + tenantName + ' - ' + e.message);
                self.emit('analysis-failed', { 
                    tenantName: tenantName, 
                    error: e.message 
                });
                throw e;
            }
        },

        // ============ 调用副API（使用PhoneSystem.callExternalAPI，可被调试器捕获） ============
        callSecondaryAPI: async function(prompt) {
            var PhoneSystem = window.parent.PhoneSystem || window.PhoneSystem;
            if (!PhoneSystem) {
                throw new Error('PhoneSystem未加载');
            }
            
            if (!PhoneSystem.callExternalAPI) {
                throw new Error('PhoneSystem.callExternalAPI不可用');
            }
            
            console.log('[租客分析] 调用API (通过PhoneSystem)');
            
            var messages = [
                { role: 'system', content: '你是一个角色动态分析专家。你的任务是分析角色在对话中的变化，生成简洁的动态人设。只输出指定格式的内容，不要输出解释文字。基于对话内容推断，不要凭空捏造，如无明显变化则保守处理。' },
                { role: 'user', content: prompt }
            ];
            
            var result = await PhoneSystem.callExternalAPI(messages, { temperature: 0.7 });
            return result || '';
        },

        // ============ 解析分析结果 ============
        parseAnalysisResult: function(text) {
            try {
                // 尝试提取JSON
                var jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                console.error('[租客分析] 解析结果失败:', e);
            }
            return null;
        },

        // ============ ChatLore操作 ============
        
        // 获取本色（固定档案）- 条目名就是角色人名
        getBaseProfile: async function(tenantName) {
            try {
                var loreName = await this.ensureChatLore();
                if (!loreName) {
                    console.log('[租客分析] 无法获取ChatLore');
                    return null;
                }
                
                var getWB = (typeof getWorldbook === 'function') ? getWorldbook : window.parent.getWorldbook;
                if (getWB) {
                    var entries = await getWB(loreName);
                    console.log('[租客分析] ChatLore条目数:', entries.length);
                    
                    // 直接用人名查找本色档案
                    var entry = entries.find(function(e) {
                        return e.name === tenantName;
                    });
                    
                    if (entry) {
                        console.log('[租客分析] 找到本色档案:', tenantName);
                        return entry.content;
                    } else {
                        console.log('[租客分析] 未找到本色档案:', tenantName, '可用条目:', entries.map(function(e) { return e.name; }).join(', '));
                    }
                }
            } catch (e) {
                console.error('[租客分析] 获取本色档案失败:', e);
            }
            return null;
        },

        // 获取上次调色（动态档案）- 条目名格式: [租客动态]张小雪
        getDynamicProfile: async function(tenantName) {
            try {
                var loreName = await this.ensureChatLore();
                if (!loreName) return null;
                
                var getWB = (typeof getWorldbook === 'function') ? getWorldbook : window.parent.getWorldbook;
                if (getWB) {
                    var entries = await getWB(loreName);
                    var entry = entries.find(function(e) {
                        return e.name === '[租客动态]' + tenantName;
                    });
                    return entry ? entry.content : null;
                }
            } catch (e) {
                console.error('[租客分析] 获取动态档案失败:', e);
            }
            return null;
        },

        ensureChatLore: async function() {
            try {
                // 优先使用新API
                if (typeof getOrCreateChatWorldbook === 'function') {
                    return await getOrCreateChatWorldbook('current');
                }
                // 兼容旧API
                if (typeof getOrCreateChatLorebook === 'function') {
                    return await getOrCreateChatLorebook();
                }
                // 尝试从window.parent获取
                if (window.parent.getOrCreateChatWorldbook) {
                    return await window.parent.getOrCreateChatWorldbook('current');
                }
                if (window.parent.getOrCreateChatLorebook) {
                    return await window.parent.getOrCreateChatLorebook();
                }
                console.error('[租客分析] 未找到ChatLore API');
            } catch (e) {
                console.error('[租客分析] 创建ChatLore失败:', e);
            }
            return null;
        },

        // 更新动态档案（调色）- 条目名格式: [租客动态]张小雪
        updateDynamicLore: async function(tenantName, content) {
            try {
                var loreName = await this.ensureChatLore();
                if (!loreName) {
                    throw new Error('无法获取ChatLore');
                }
                
                var entryName = '[租客动态]' + tenantName;
                
                var updateWB = (typeof updateWorldbookWith === 'function') ? updateWorldbookWith : window.parent.updateWorldbookWith;
                if (updateWB) {
                    await updateWB(loreName, function(entries) {
                        var existingIndex = entries.findIndex(function(e) {
                            return e.name === entryName;
                        });
                        
                        var newEntry = {
                            name: entryName,
                            enabled: true,
                            content: content,
                            strategy: {
                                type: 'constant',  // 常量，始终激活
                                keys: [tenantName],
                                keys_secondary: { logic: 'and_any', keys: [] },
                                scan_depth: 'same_as_global',
                            },
                            position: {
                                type: 'before_character_definition',
                                role: 'system',
                                depth: 4,
                                order: 101,  // 排在固定档案后面
                            },
                            probability: 100,
                            recursion: {
                                prevent_incoming: false,
                                prevent_outgoing: false,
                                delay_until: null,
                            },
                            effect: {
                                sticky: null,
                                cooldown: null,
                                delay: null,
                            },
                        };
                        
                        if (existingIndex >= 0) {
                            entries[existingIndex] = Object.assign({}, entries[existingIndex], newEntry);
                        } else {
                            entries.push(newEntry);
                        }
                        
                        return entries;
                    });
                    
                    console.log('[租客分析] 动态档案已更新:', entryName);
                }
            } catch (e) {
                console.error('[租客分析] 更新动态档案失败:', e);
                throw e;
            }
        },

        // ============ 日志管理 ============
        addLog: function(type, message) {
            var log = {
                time: new Date(),
                type: type,  // info, success, warning, error
                message: message,
            };
            
            this.analysisLog.unshift(log);
            if (this.analysisLog.length > this.logLimit) {
                this.analysisLog.pop();
            }
            
            console.log('[租客分析][' + type + ']', message);
            this.emit('log-added', log);
        },

        getLog: function(limit) {
            return this.analysisLog.slice(0, limit || 50);
        },

        clearLog: function() {
            this.analysisLog = [];
            this.emit('log-cleared');
        },

        // ============ 状态查询 ============
        getStatus: function() {
            return {
                config: this.config,
                lastAnalyzedFloor: this.lastAnalyzedFloor,
                lastAnalysisTime: this.lastAnalysisTime,
                currentFloor: this.getCurrentFloor(),
                nextTriggerFloor: this.lastAnalyzedFloor + this.config.triggerInterval,
                tenantCount: Object.keys(this.getTenantList()).length,
            };
        },

        // ============ 事件系统 ============
        on: function(event, callback) {
            if (!this.eventListeners.has(event)) {
                this.eventListeners.set(event, []);
            }
            this.eventListeners.get(event).push(callback);
        },

        off: function(event, callback) {
            if (this.eventListeners.has(event)) {
                var listeners = this.eventListeners.get(event);
                var index = listeners.indexOf(callback);
                if (index !== -1) {
                    listeners.splice(index, 1);
                }
            }
        },

        emit: function(event, data) {
            if (this.eventListeners.has(event)) {
                this.eventListeners.get(event).forEach(function(callback) {
                    try {
                        callback(data);
                    } catch (e) {
                        console.error('[租客分析] 事件回调错误:', e);
                    }
                });
            }
        },
    };

    // ============ 导出到全局（父窗口，因为酒馆助手脚本运行在iframe中） ============
    var targetWindow = window.parent || window;
    targetWindow.TenantAnalyzer = TenantAnalyzer;
    
    // ============ 自动初始化 ============
    TenantAnalyzer.loadConfig();
    TenantAnalyzer.setupFloorWatcher();
    
    console.log('[租客分析] 模块加载完成，自动分析:', TenantAnalyzer.config.enableAutoAnalysis ? '已启用' : '已禁用');
    console.log('[租客分析] 上次分析楼层:', TenantAnalyzer.lastAnalyzedFloor, '上次分析时间:', TenantAnalyzer.lastAnalysisTime);
})();
