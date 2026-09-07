// ==================== 租客聊天系统 - 正文联动模块 ====================
// 实现聊天记录与ChatLore/正文的双向同步
// 使用酒馆助手API操作世界书
// 依赖：phone_chat_db.js, tenant_analyzer.js, 酒馆助手插件

(function() {
    'use strict';

    // ==================== 联动配置 ====================
    const SYNC_CONFIG = {
        // ChatLore条目前缀
        CHAT_LORE_PREFIX: '[租客微信]',
        
        // 群聊摘要条目名
        GROUP_ENTRY_NAME: '[群聊记录]',
        
        // 摘要最大长度
        SUMMARY_MAX_LENGTH: 800,
        
        // 是否启用即时同步（每条消息后立即同步）
        instantSyncEnabled: true,
        
        // 同步防抖延迟（毫秒）
        SYNC_DEBOUNCE_MS: 500,
        
        // 世界书名称（用于存储聊天记录）
        WORLDBOOK_NAME: null
    };

    // ==================== 联动核心逻辑 ====================
    const ChatSync = {
        lastSyncedMessageId: null,
        syncInProgress: false,
        syncDebounceTimers: {},  // 防抖定时器

        // ==================== 即时同步（每条消息后触发） ====================

        // 即时同步（带防抖）
        instantSync: function(conversationId) {
            if (!SYNC_CONFIG.instantSyncEnabled) return Promise.resolve(false);
            // 返回真正的提交结果；共享队列按顺序处理，不吞掉前一次调用。
            return this.syncToChatLore(conversationId);
        },

        // ==================== 删除同步 ====================

        // 删除会话时同步删除世界书条目
        // convInfo可以是conversationId或{type, members, name}对象
        deleteFromChatLore: function(convInfo) {
            return landlord.enqueueSync(() => this._deleteFromChatLore(convInfo));
        },
        _deleteFromChatLore: async function(convInfo) {
            try {
                let conv = convInfo;
                
                // 如果是conversationId，尝试获取会话信息
                if (typeof convInfo === 'string') {
                    const ChatDB = window.parent.ChatDB;
                    conv = await ChatDB.getConversation(convInfo);
                    if (!conv) {
                        console.warn('[ChatSync] 会话不存在，无法确定要删除的条目:', convInfo);
                        return false;
                    }
                }

                const chatLoreName = SYNC_CONFIG.WORLDBOOK_NAME || await this.ensureChatLore();
                if (!chatLoreName) return false;

                // 确定要删除的条目名
                let entryName;
                if (conv.type === 'group') {
                    entryName = SYNC_CONFIG.CHAT_LORE_PREFIX + '群聊记录';
                } else {
                    entryName = SYNC_CONFIG.CHAT_LORE_PREFIX + conv.members[0];
                }

                // 使用酒馆助手API删除条目（先检查全局，再检查window.parent）
                const updateWB = (typeof updateWorldbookWith === 'function') ? updateWorldbookWith : window.parent.updateWorldbookWith;
                if (typeof updateWB === 'function') {
                    await updateWB(chatLoreName, (entries) => {
                        return entries.filter(e => e.name !== entryName);
                    });
                    console.log('[ChatSync] 世界书条目已删除:', entryName);
                    return true;
                }

                return false;
            } catch (e) {
                console.error('[ChatSync] 删除世界书条目失败:', e);
                return false;
            }
        },

        // 清空所有聊天相关的世界书条目
        clearAllChatLore: function() {
            return landlord.enqueueSync(() => this._clearAllChatLore());
        },
        _clearAllChatLore: async function() {
            try {
                const chatLoreName = SYNC_CONFIG.WORLDBOOK_NAME || await this.ensureChatLore();
                if (!chatLoreName) return false;

                const updateWB = (typeof updateWorldbookWith === 'function') ? updateWorldbookWith : window.parent.updateWorldbookWith;
                if (typeof updateWB === 'function') {
                    await updateWB(chatLoreName, (entries) => {
                        // 过滤掉所有带有聊天前缀的条目
                        return entries.filter(e => !e.name?.startsWith(SYNC_CONFIG.CHAT_LORE_PREFIX));
                    });
                    console.log('[ChatSync] 所有聊天世界书条目已清空');
                    return true;
                }

                return false;
            } catch (e) {
                console.error('[ChatSync] 清空聊天世界书失败:', e);
                return false;
            }
        },

        // ==================== 同步到ChatLore ====================

        // 同步聊天记录到ChatLore（让正文AI知道）
        syncToChatLore: async function(conversationId, options = {}) {
            return landlord.enqueueSync(async () => {
                landlord.assertCurrent();
                const db = window.parent.AptChatDB || window.parent.ChatDB;
                const conv = await db.getConversation(conversationId);
                landlord.assertCurrent();
                if (!conv) return false;
                const messages = await db.getRecentMessages(conversationId, 30);
                landlord.assertCurrent();
                if (!messages.length) return await this._deleteFromChatLore(conv);
                const summary = this.generateChatSummary(conv, messages);
                const written = await this.updateChatLore(conv.type === 'group' ? '群聊记录' : conv.members[0], summary);
                landlord.assertCurrent();
                if (!written) return false;
                for (const msg of messages) if (!msg.syncedToLore) await db.markAsSynced(msg.id);
                this.lastSyncedMessageId = messages.at(-1).id;
                return true;
            });
        },

        generateChatSummary: function(conv, messages) {
            const isGroup = conv.type === 'group';
            
            // 获取最新消息的时间作为"截止时间"
            const latestMsg = messages[messages.length - 1];
            const latestTime = latestMsg?.gameTime;
            const latestTimeStr = latestTime ? `${latestTime.日期 || '?'} ${latestTime.时间 || ''}` : '未知时间';
            
            // 获取最早消息的时间
            const earliestMsg = messages[0];
            const earliestTime = earliestMsg?.gameTime;
            const earliestTimeStr = earliestTime ? `${earliestTime.日期 || '?'} ${earliestTime.时间 || ''}` : '';

            let summary = `【微信聊天记录摘要】\n`;
            summary += `更新时间: ${latestTimeStr}\n`;
            
            if (isGroup) {
                summary += `群聊: ${conv.name}\n`;
                summary += `参与者: ${conv.members.join('、')}\n`;
            } else {
                summary += `私聊对象: ${conv.members[0]}\n`;
            }
            
            summary += `---\n`;

            // 智能选取消息：优先保留最近的，每条消息限制长度
            const maxMessages = isGroup ? 10 : 8;  // 群聊多一点，私聊少一点
            const maxMsgLength = 80;  // 每条消息最多80字
            
            const recentMessages = messages.slice(-maxMessages);
            let currentDate = '';
            
            for (const msg of recentMessages) {
                const sender = msg.sender === '<user>' ? '房东' : msg.sender;
                const msgDate = msg.gameTime?.日期 || '';
                const msgTime = msg.gameTime?.时间 || '';
                
                // 日期变化时显示日期分隔
                if (msgDate && msgDate !== currentDate) {
                    summary += `\n【${msgDate}】\n`;
                    currentDate = msgDate;
                }
                
                // 截断过长的单条消息
                let content = msg.content || '';
                if (content.length > maxMsgLength) {
                    content = content.substring(0, maxMsgLength) + '...';
                }
                
                summary += `[${msgTime}] ${sender}: ${content}\n`;
            }

            // 最终长度检查（硬限制）
            if (summary.length > SYNC_CONFIG.SUMMARY_MAX_LENGTH) {
                // 从中间截断，保留头尾
                const keepStart = 200;
                const keepEnd = SYNC_CONFIG.SUMMARY_MAX_LENGTH - keepStart - 50;
                summary = summary.substring(0, keepStart) + 
                         '\n...(中间消息已省略)...\n' + 
                         summary.substring(summary.length - keepEnd);
            }

            return summary;
        },

        // 更新ChatLore条目（使用斜杠命令）
        updateChatLore: async function(targetName, content) {
            try {
                // 获取或创建ChatLore
                const chatLoreName = await this.ensureChatLore();
                if (!chatLoreName) {
                    console.warn('[ChatSync] 无法获取ChatLore');
                    return false;
                }

                const entryName = SYNC_CONFIG.CHAT_LORE_PREFIX + targetName;
                
                // 获取SillyTavern上下文
                const ctx = window.parent.SillyTavern?.getContext?.();
                
                // 方法1：使用酒馆助手API（先检查全局，再检查window.parent）
                const updateWB = (typeof updateWorldbookWith === 'function') ? updateWorldbookWith : window.parent.updateWorldbookWith;
                if (typeof updateWB === 'function') {
                    await updateWB(chatLoreName, (entries) => {
                        const existingIndex = entries.findIndex(e => e.name === entryName);
                        
                        const newEntry = {
                            name: entryName,
                            enabled: true,
                            content: content,
                            strategy: {
                                type: 'constant',
                                keys: [entryName, targetName + '微信', targetName + '聊天记录'],
                                keys_secondary: { logic: 'and_any', keys: [] },
                                scan_depth: 'same_as_global'
                            },
                            position: {
                                type: 'at_depth',
                                role: 'system',
                                depth: 4,
                                order: 100
                            },
                            probability: 100
                        };
                        
                        if (existingIndex >= 0) {
                            entries[existingIndex] = { ...entries[existingIndex], ...newEntry };
                        } else {
                            entries.push(newEntry);
                        }
                        
                        return entries;
                    });
                    
                    console.log('[ChatSync] ChatLore已更新(API):', entryName);
                    return true;
                }
                
                // 方法2：使用斜杠命令
                if (ctx && ctx.executeSlashCommandsWithOptions) {
                    // 转义内容中的特殊字符
                    const escapedContent = content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
                    
                    // 使用 /createentry 命令创建或更新条目
                    const command = `/createentry file="${chatLoreName}" key="${entryName}" "${escapedContent}"`;
                    
                    try {
                        await ctx.executeSlashCommandsWithOptions(command, { handleParserErrors: false });
                        console.log('[ChatSync] ChatLore已更新(命令):', entryName);
                        return true;
                    } catch (e) {
                        console.warn('[ChatSync] 斜杠命令执行失败:', e);
                    }
                }
                
                // 方法3：直接操作SillyTavern变量存储（最简单的备用方案）
                if (ctx) {
                    // 存储到SillyTavern的聊天变量中
                    const varName = 'wechat_' + targetName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
                    if (ctx.setVariable) {
                        ctx.setVariable(varName, content);
                        console.log('[ChatSync] 已存储到变量:', varName);
                        return true;
                    }
                }

                console.warn('[ChatSync] 无法更新世界书，所有方法都失败了');
                return false;

            } catch (e) {
                console.error('[ChatSync] 更新ChatLore失败:', e);
                return false;
            }
        },

        // 确保ChatLore存在（参考tenant_analyzer.js的实现）
        ensureChatLore: async function() {
            landlord.assertCurrent();
            return await landlord.getChatWorldbook();
        },

        // ==================== 从正文读取变化 ====================

        // 检查租客状态变化（正文→聊天）
        checkTenantChanges: function() {
            try {
                const ChatDB = window.parent.ChatDB;
                if (!ChatDB) return null;

                const currentTenants = ChatDB.getTenantList();
                const cachedTenants = this.getCachedTenantList();

                const changes = {
                    added: [],    // 新入住
                    removed: [],  // 已搬走
                    updated: []   // 状态变化
                };

                // 检查新增
                for (const name of currentTenants) {
                    if (!cachedTenants.includes(name)) {
                        changes.added.push(name);
                    }
                }

                // 检查移除
                for (const name of cachedTenants) {
                    if (!currentTenants.includes(name)) {
                        changes.removed.push(name);
                    }
                }

                // 更新缓存
                this.setCachedTenantList(currentTenants);

                return changes;

            } catch (e) {
                console.error('[ChatSync] 检查租客变化失败:', e);
                return null;
            }
        },

        // 缓存租客列表（安全访问storage）
        getCachedTenantList: function() {
            try {
                const storage = window.sessionStorage || window.parent?.sessionStorage;
                if (!storage) return [];
                const cached = storage.getItem('chat_sync_tenant_cache');
                return cached ? JSON.parse(cached) : [];
            } catch (e) {
                return [];
            }
        },

        setCachedTenantList: function(list) {
            try {
                const storage = window.sessionStorage || window.parent?.sessionStorage;
                if (!storage) return;
                storage.setItem('chat_sync_tenant_cache', JSON.stringify(list));
            } catch (e) {}
        },

        // ==================== 即时同步触发 ====================

        // 消息发送后触发即时同步
        onMessageSent: function(conversationId) {
            console.log('[ChatSync] 消息已发送，触发即时同步:', conversationId);
            this.instantSync(conversationId);
        },

        // 会话删除前触发世界书删除
        onConversationDeleting: async function(conversationId) {
            console.log('[ChatSync] 会话即将删除，同步删除世界书条目:', conversationId);
            await this.deleteFromChatLore(conversationId);
        },

        // 清空所有聊天时触发
        onAllChatsClearing: async function() {
            console.log('[ChatSync] 所有聊天即将清空，同步清空世界书');
            await this.clearAllChatLore();
        },

        // ==================== 手动同步接口 ====================

        // 同步所有会话
        syncAll: async function() {
            const ChatDB = window.parent.ChatDB;
            const conversations = await ChatDB.getConversations();
            
            let successCount = 0;
            for (const conv of conversations) {
                const success = await this.syncToChatLore(conv.id);
                if (success) successCount++;
            }

            console.log(`[ChatSync] 批量同步完成: ${successCount}/${conversations.length}`);
            return successCount;
        },

        // 获取同步状态
        getStatus: async function() {
            const ChatDB = window.parent.ChatDB;
            const conversations = await ChatDB.getConversations();
            
            let totalMessages = 0;
            let syncedMessages = 0;

            for (const conv of conversations) {
                const messages = await ChatDB.getMessages(conv.id, Infinity);
                totalMessages += messages.length;
                syncedMessages += messages.filter(m => m.syncedToLore).length;
            }

            return {
                totalMessages,
                syncedMessages,
                unsyncedMessages: totalMessages - syncedMessages,
                instantSyncEnabled: SYNC_CONFIG.instantSyncEnabled,
                lastSyncedMessageId: this.lastSyncedMessageId,
                worldbookName: SYNC_CONFIG.WORLDBOOK_NAME
            };
        },

        // 设置配置
        setConfig: function(key, value) {
            if (SYNC_CONFIG.hasOwnProperty(key)) {
                SYNC_CONFIG[key] = value;
                console.log('[ChatSync] 配置已更新:', key, '=', value);
            }
        },

        // 查看当前世界书中的聊天条目
        listChatLoreEntries: async function() {
            try {
                const chatLoreName = SYNC_CONFIG.WORLDBOOK_NAME || await this.ensureChatLore();
                if (!chatLoreName) return [];

                const getWB = (typeof getWorldbook === 'function') ? getWorldbook : window.parent.getWorldbook;
                if (typeof getWB === 'function') {
                    const entries = await getWB(chatLoreName);
                    // 过滤出聊天相关条目
                    const chatEntries = entries.filter(e => e.name?.startsWith(SYNC_CONFIG.CHAT_LORE_PREFIX));
                    console.log('[ChatSync] 当前聊天世界书条目:', chatEntries.map(e => e.name));
                    return chatEntries;
                }
            } catch (e) {
                console.error('[ChatSync] 获取聊天条目失败:', e);
            }
            return [];
        },

        // 强制立即同步（跳过防抖）
        forceSyncNow: async function(conversationId) {
            // 清除防抖定时器
            if (this.syncDebounceTimers[conversationId]) {
                clearTimeout(this.syncDebounceTimers[conversationId]);
                delete this.syncDebounceTimers[conversationId];
            }
            // 立即同步
            return await this.syncToChatLore(conversationId);
        },

        // ==================== 正文注入接口 ====================

        // 生成可注入正文的提示（用户手动触发）
        generateStoryPrompt: async function(conversationId, topic) {
            const ChatDB = window.parent.ChatDB;
            const conv = await ChatDB.getConversation(conversationId);
            if (!conv) return null;

            const messages = await ChatDB.getRecentMessages(conversationId, 10);
            const summary = this.generateChatSummary(conv, messages);

            // 生成可以插入输入框的提示
            let prompt = '';
            
            if (conv.type === 'group') {
                prompt = `（你想起刚才在业主群里的聊天：${topic || '大家讨论的内容'}）\n`;
                prompt += `[系统提示：以下是最近的群聊记录，请在正文中自然地体现或提及]\n`;
            } else {
                const tenantName = conv.members[0];
                prompt = `（你想起刚才和${tenantName}的微信聊天：${topic || '聊天内容'}）\n`;
                prompt += `[系统提示：以下是最近的私聊记录，请在正文中自然地体现或提及]\n`;
            }

            prompt += summary;

            return prompt;
        },

        // 将聊天内容注入到输入框（供用户确认后发送）
        injectToInput: async function(conversationId, topic) {
            const prompt = await this.generateStoryPrompt(conversationId, topic);
            if (!prompt) return false;

            try {
                // 尝试找到ST的输入框
                const textarea = window.parent.document.querySelector('#send_textarea');
                if (textarea) {
                    // 追加到现有内容
                    const existing = textarea.value;
                    textarea.value = existing + (existing ? '\n\n' : '') + prompt;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    console.log('[ChatSync] 已注入到输入框');
                    return true;
                }
            } catch (e) {
                console.error('[ChatSync] 注入失败:', e);
            }

            return false;
        }
    };

    // ==================== 初始化 ====================

    // 设置事件监听器
    function setupEventListeners() {
        if (!window.parent) return;
        
        // 监听PhoneSystem事件
        if (window.parent.PhoneSystem) {
            // 消息发送事件 → 即时同步
            window.parent.PhoneSystem.on('chat-message-sent', function(data) {
                if (data.conversationId) {
                    ChatSync.onMessageSent(data.conversationId);
                }
            });

            // 会话删除事件 → 删除世界书条目
            window.parent.PhoneSystem.on('chat-conversation-deleting', async function(data) {
                if (data.conversationId) {
                    await ChatSync.onConversationDeleting(data.conversationId);
                }
            });

            // 全部清空事件 → 清空世界书
            window.parent.PhoneSystem.on('chat-all-clearing', async function() {
                await ChatSync.onAllChatsClearing();
            });
        }

        // Hook ChatDB的删除方法（备用方案）
        hookChatDBDeleteMethods();
    }

    // Hook ChatDB的删除方法，确保删除时同步世界书
    function hookChatDBDeleteMethods() {
        if (!window.parent?.ChatDB) return;

        const ChatDB = window.parent.ChatDB;

        // Hook deleteConversation
        if (ChatDB.deleteConversation && !ChatDB._originalDeleteConversation) {
            ChatDB._originalDeleteConversation = ChatDB.deleteConversation;
            ChatDB.deleteConversation = async function(convId) {
                // 先获取会话信息（删除后就拿不到了）
                const conv = await this.getConversation(convId);
                // 同步删除世界书条目
                if (conv) {
                    await ChatSync.deleteFromChatLore(conv);
                }
                // 再执行原始删除
                return await ChatDB._originalDeleteConversation.call(this, convId);
            };
            console.log('[ChatSync] 已Hook ChatDB.deleteConversation');
        }

        // Hook clearCurrentChatData
        if (ChatDB.clearCurrentChatData && !ChatDB._originalClearCurrentChatData) {
            ChatDB._originalClearCurrentChatData = ChatDB.clearCurrentChatData;
            ChatDB.clearCurrentChatData = async function() {
                // 先同步清空世界书
                await ChatSync.clearAllChatLore();
                // 再执行原始清空
                return await ChatDB._originalClearCurrentChatData.call(this);
            };
            console.log('[ChatSync] 已Hook ChatDB.clearCurrentChatData');
        }

        // 注意：不在addMessage时同步，而是在AI回复完成后同步
        // 同步由phone_chat_app.js在AI回复完成后手动触发
    }

    // 延迟初始化（等待ChatDB加载完成）
    setupEventListeners();

    // ==================== 导出到全局 ====================
    if (window.parent) {
        window.parent.ChatSync = ChatSync;
    }
    console.log('✅ ChatSync 模块已加载');

})();
