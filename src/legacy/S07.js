// ==================== 租客聊天系统 - 数据库模块 ====================
// 使用 IndexedDB 存储聊天记录，支持导入导出
// 依赖：无外部依赖

(function() {
    'use strict';

    const DB_NAME = 'TenantChatDB';
    const DB_VERSION = 1;

    // ==================== IndexedDB 封装 ====================
    const ChatDB = {
        db: null,
        currentChatId: null,

        // 初始化数据库
        init: async function(chatId) {
            this.currentChatId = chatId;
            
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onerror = (event) => {
                    console.error('[ChatDB] 数据库打开失败:', event.target.error);
                    reject(event.target.error);
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    console.log('[ChatDB] 数据库已连接');
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // 会话表
                    if (!db.objectStoreNames.contains('conversations')) {
                        const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
                        convStore.createIndex('chatId', 'chatId', { unique: false });
                        convStore.createIndex('type', 'type', { unique: false });
                        convStore.createIndex('chatId_type', ['chatId', 'type'], { unique: false });
                    }

                    // 消息表
                    if (!db.objectStoreNames.contains('messages')) {
                        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
                        msgStore.createIndex('conversationId', 'conversationId', { unique: false });
                        msgStore.createIndex('createdAt', 'createdAt', { unique: false });
                        msgStore.createIndex('conv_time', ['conversationId', 'createdAt'], { unique: false });
                    }

                    console.log('[ChatDB] 数据库结构已创建/更新');
                };
            });
        },

        // 生成唯一ID
        generateId: function(prefix) {
            return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },

        // ==================== 会话操作 ====================

        // 创建会话
        createConversation: async function(options) {
            const { type, name, members } = options;
            
            const conversation = {
                id: this.generateId('conv'),
                chatId: this.currentChatId,
                type: type, // 'private' 或 'group'
                name: name,
                members: members || [],
                createdAt: this.getGameTime(),
                updatedAt: this.getGameTime(),
                lastMessage: null
            };

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['conversations'], 'readwrite');
                const store = transaction.objectStore('conversations');
                const request = store.add(conversation);

                request.onsuccess = () => {
                    console.log('[ChatDB] 会话已创建:', conversation.name);
                    resolve(conversation);
                };
                request.onerror = (e) => reject(e.target.error);
            });
        },

        // 获取当前聊天的所有会话
        getConversations: async function() {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['conversations'], 'readonly');
                const store = transaction.objectStore('conversations');
                const index = store.index('chatId');
                const request = index.getAll(this.currentChatId);

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (e) => reject(e.target.error);
            });
        },

        // 获取单个会话
        getConversation: async function(convId) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['conversations'], 'readonly');
                const store = transaction.objectStore('conversations');
                const request = store.get(convId);

                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => reject(e.target.error);
            });
        },

        // 获取或创建群聊会话
        getOrCreateGroupChat: async function(groupName) {
            const conversations = await this.getConversations();
            let groupConv = conversations.find(c => c.type === 'group' && c.name === groupName);
            
            if (!groupConv) {
                // 获取当前所有租客作为群成员
                const members = this.getTenantList();
                groupConv = await this.createConversation({
                    type: 'group',
                    name: groupName,
                    members: members
                });
            }
            
            return groupConv;
        },

        // 获取或创建私聊会话
        getOrCreatePrivateChat: async function(tenantName) {
            const conversations = await this.getConversations();
            let privateConv = conversations.find(c => c.type === 'private' && c.members.includes(tenantName));
            
            if (!privateConv) {
                privateConv = await this.createConversation({
                    type: 'private',
                    name: tenantName,
                    members: [tenantName]
                });
            }
            
            return privateConv;
        },

        // 更新会话（如更新成员列表）
        updateConversation: async function(convId, updates) {
            const conv = await this.getConversation(convId);
            if (!conv) return null;

            const updated = { ...conv, ...updates, updatedAt: this.getGameTime() };

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['conversations'], 'readwrite');
                const store = transaction.objectStore('conversations');
                const request = store.put(updated);

                request.onsuccess = () => resolve(updated);
                request.onerror = (e) => reject(e.target.error);
            });
        },

        // 同步群聊成员（根据当前租客列表）
        syncGroupMembers: async function(convId) {
            const currentTenants = this.getTenantList();
            return this.updateConversation(convId, { members: currentTenants });
        },

        // ==================== 消息操作 ====================

        // 添加消息
        addMessage: async function(conversationId, sender, content, options = {}) {
            const message = {
                id: this.generateId('msg'),
                conversationId: conversationId,
                sender: sender, // 租客名 或 '<user>'
                content: content,
                gameTime: this.getGameTime(),
                syncedToLore: false,
                isImportant: options.isImportant || false,
                createdAt: Date.now(),
                ...(options.stickerImage ? { stickerImage: options.stickerImage } : {})
            };

            // 更新会话的最后消息
            // 消息与会话摘要在同一事务中提交，失败时一起回滚。
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['messages', 'conversations'], 'readwrite');
                const conversations = transaction.objectStore('conversations');
                const request = conversations.get(conversationId);
                request.onsuccess = () => {
                    const conv = request.result;
                    if (!conv) { transaction.abort(); return; }
                    conversations.put({ ...conv, updatedAt: message.gameTime,
                        lastMessage: { sender, content, gameTime: message.gameTime, realTime: message.createdAt } });
                    transaction.objectStore('messages').add(message);
                };
                transaction.oncomplete = () => resolve(message);
                transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('会话不存在或保存失败'));
            });
        },

        // 获取会话的消息列表
        getMessages: async function(conversationId, limit = 100) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['messages'], 'readonly');
                const store = transaction.objectStore('messages');
                const index = store.index('conversationId');
                const request = index.getAll(conversationId);

                request.onsuccess = () => {
                    let messages = request.result || [];
                    // 按创建时间排序
                    messages.sort((a, b) => a.createdAt - b.createdAt);
                    // 限制数量（取最新的）
                    if (messages.length > limit) {
                        messages = messages.slice(-limit);
                    }
                    resolve(messages);
                };
                request.onerror = (e) => reject(e.target.error);
            });
        },

        // 获取最近N条消息（用于AI上下文）
        getRecentMessages: async function(conversationId, count = 20) {
            const messages = await this.getMessages(conversationId, count);
            return messages;
        },

        // 标记消息为已同步到Lore
        markAsSynced: async function(messageId) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['messages'], 'readwrite');
                const store = transaction.objectStore('messages');
                const getRequest = store.get(messageId);

                getRequest.onsuccess = () => {
                    const message = getRequest.result;
                    if (message) {
                        message.syncedToLore = true;
                        const putRequest = store.put(message);
                        putRequest.onsuccess = () => resolve(message);
                        putRequest.onerror = (e) => reject(e.target.error);
                    } else {
                        resolve(null);
                    }
                };
                getRequest.onerror = (e) => reject(e.target.error);
            });
        },

        // 删除单条消息
        deleteMessage: async function(messageId) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['messages'], 'readwrite');
                const store = transaction.objectStore('messages');
                const request = store.delete(messageId);

                request.onsuccess = () => {
                    console.log('[ChatDB] 消息已删除:', messageId);
                    resolve(true);
                };
                request.onerror = (e) => reject(e.target.error);
            });
        },

        // 删除会话的最后N条消息（用于撤回功能）
        deleteLastMessages: async function(conversationId, count = 1) {
            const messages = await this.getMessages(conversationId, Infinity);
            if (messages.length === 0) return [];

            // 获取最后N条消息
            const toDelete = messages.slice(-count);
            const deletedIds = [];

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['messages', 'conversations'], 'readwrite');
                const msgStore = transaction.objectStore('messages');

                // 删除消息
                for (const msg of toDelete) {
                    msgStore.delete(msg.id);
                    deletedIds.push(msg.id);
                }

                // 更新会话的最后消息
                const remaining = messages.slice(0, -count);
                if (remaining.length > 0) {
                    const lastMsg = remaining[remaining.length - 1];
                    const convStore = transaction.objectStore('conversations');
                    const getRequest = convStore.get(conversationId);
                    getRequest.onsuccess = () => {
                        const conv = getRequest.result;
                        if (conv) {
                            conv.lastMessage = {
                                sender: lastMsg.sender,
                                content: lastMsg.content,
                                gameTime: lastMsg.gameTime
                            };
                            conv.updatedAt = this.getGameTime();
                            convStore.put(conv);
                        }
                    };
                } else {
                    // 没有消息了，清空lastMessage
                    const convStore = transaction.objectStore('conversations');
                    const getRequest = convStore.get(conversationId);
                    getRequest.onsuccess = () => {
                        const conv = getRequest.result;
                        if (conv) {
                            conv.lastMessage = null;
                            conv.updatedAt = this.getGameTime();
                            convStore.put(conv);
                        }
                    };
                }

                transaction.oncomplete = () => {
                    console.log('[ChatDB] 已删除最后', count, '条消息:', deletedIds);
                    resolve(toDelete);
                };
                transaction.onerror = (e) => reject(e.target.error);
            });
        },

        // 删除会话及其消息
        deleteConversation: async function(convId) {
            // 先删除消息
            const messages = await this.getMessages(convId, Infinity);
            
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['conversations', 'messages'], 'readwrite');
                
                // 删除消息
                const msgStore = transaction.objectStore('messages');
                messages.forEach(msg => msgStore.delete(msg.id));
                
                // 删除会话
                const convStore = transaction.objectStore('conversations');
                convStore.delete(convId);

                transaction.oncomplete = () => {
                    console.log('[ChatDB] 会话已删除:', convId);
                    resolve(true);
                };
                transaction.onerror = (e) => reject(e.target.error);
            });
        },

        // ==================== 工具方法 ====================

        // 获取游戏内时间
        getGameTime: function() {
            try {
                if (window.parent.Mvu && window.parent.Mvu.getMvuData) {
                    const mvuData = window.parent.Mvu.getMvuData({ type: 'message', message_id: -1 });
                    if (mvuData && mvuData.stat_data && mvuData.stat_data.世界) {
                        return { ...mvuData.stat_data.世界 };
                    }
                }
            } catch (e) {
                console.warn('[ChatDB] 获取游戏时间失败:', e);
            }
            // 默认返回
            return { 年份: '未知', 日期: '未知', 星期: '未知', 时间: '未知' };
        },

        // 格式化游戏时间显示
        formatGameTime: function(gameTime) {
            if (!gameTime) return '未知时间';
            return `${gameTime.日期} ${gameTime.星期} ${gameTime.时间}`;
        },

        // 获取租客列表
        getTenantList: function() {
            try {
                if (window.parent.Mvu && window.parent.Mvu.getMvuData) {
                    const mvuData = window.parent.Mvu.getMvuData({ type: 'message', message_id: -1 });
                    if (mvuData && mvuData.stat_data && mvuData.stat_data.租客列表) {
                        return Object.keys(mvuData.stat_data.租客列表);
                    }
                }
            } catch (e) {
                console.warn('[ChatDB] 获取租客列表失败:', e);
            }
            return [];
        },

        // ==================== 导入导出 ====================

        // 导出当前聊天的所有数据
        exportData: async function() {
            const conversations = await this.getConversations();
            const allMessages = [];

            for (const conv of conversations) {
                const messages = await this.getMessages(conv.id, Infinity);
                allMessages.push(...messages);
            }

            const exportData = {
                version: 1,
                chatId: this.currentChatId,
                exportedAt: new Date().toISOString(),
                conversations: conversations,
                messages: allMessages
            };

            return JSON.stringify(exportData, null, 2);
        },

        // 导入数据
        importData: async function(jsonString, options = {}) {
            const { merge = false } = options; // merge: 合并还是覆盖
            
            try {
                const data = JSON.parse(jsonString);
                
                if (data.version !== 1) {
                    throw new Error('不支持的数据版本');
                }

                // 如果不是合并模式，先清空当前聊天的数据
                if (!merge) {
                    await this.clearCurrentChatData();
                }

                // 导入会话
                const transaction = this.db.transaction(['conversations', 'messages'], 'readwrite');
                const convStore = transaction.objectStore('conversations');
                const msgStore = transaction.objectStore('messages');

                // 更新chatId为当前聊天
                for (const conv of data.conversations) {
                    conv.chatId = this.currentChatId;
                    if (merge) {
                        // 合并模式：生成新ID避免冲突
                        const oldId = conv.id;
                        conv.id = this.generateId('conv');
                        // 更新相关消息的conversationId
                        data.messages.forEach(msg => {
                            if (msg.conversationId === oldId) {
                                msg.conversationId = conv.id;
                            }
                        });
                    }
                    convStore.put(conv);
                }

                // 导入消息
                for (const msg of data.messages) {
                    if (merge) {
                        msg.id = this.generateId('msg');
                    }
                    msgStore.put(msg);
                }

                return new Promise((resolve, reject) => {
                    transaction.oncomplete = () => {
                        console.log('[ChatDB] 数据导入完成');
                        resolve({ 
                            conversations: data.conversations.length, 
                            messages: data.messages.length 
                        });
                    };
                    transaction.onerror = (e) => reject(e.target.error);
                });

            } catch (e) {
                console.error('[ChatDB] 导入失败:', e);
                throw e;
            }
        },

        // 清空当前聊天的数据
        clearCurrentChatData: async function() {
            const conversations = await this.getConversations();
            
            for (const conv of conversations) {
                await this.deleteConversation(conv.id);
            }
            
            console.log('[ChatDB] 当前聊天数据已清空');
        },

        // 获取数据库统计信息
        getStats: async function() {
            const conversations = await this.getConversations();
            let totalMessages = 0;

            for (const conv of conversations) {
                const messages = await this.getMessages(conv.id, Infinity);
                totalMessages += messages.length;
            }

            return {
                chatId: this.currentChatId,
                conversationCount: conversations.length,
                messageCount: totalMessages
            };
        }
    };

    // ==================== 导出到全局 ====================
    window.parent.ChatDB = ChatDB;
    console.log('✅ ChatDB 模块已加载');

})();
