// ==================== 分析调度器模块 ====================
// 统一管理所有后台分析任务，避免并发冲突
// 支持任务队列、优先级、状态追踪

(function() {
    'use strict';

    // ============ 任务类型定义 ============
    const TASK_TYPES = {
        NEWS: 'news',                    // 新闻生成
        TENANT_ANALYZE: 'tenant_analyze', // 租客分析
        TENANT_SYNC: 'tenant_sync',       // 租客同步到ChatLore
        CUSTOM: 'custom',                 // 自定义任务
    };

    // ============ 优先级定义 ============
    const PRIORITY = {
        HIGH: 1,      // 用户手动触发
        NORMAL: 2,    // 自动触发
        LOW: 3,       // 后台同步
    };

    // ============ 任务状态 ============
    const TASK_STATUS = {
        PENDING: 'pending',
        RUNNING: 'running',
        COMPLETED: 'completed',
        FAILED: 'failed',
        CANCELLED: 'cancelled',
    };

    // ============ 调度器主体 ============
    const AnalysisScheduler = {
        // 任务队列
        queue: [],
        
        // 已完成任务历史（最多保留50条）
        history: [],
        historyLimit: 50,
        
        // 当前状态
        isProcessing: false,
        currentTask: null,
        
        // 事件监听器
        eventListeners: new Map(),
        
        // ============ 初始化 ============
        init: function() {
            if (this.initialized) return this;
            this.initialized = true;
            console.log('[调度器] 分析调度器初始化');
            this.queue = [];
            this.history = [];
            this.isProcessing = false;
            this.currentTask = null;
            return this;
        },

        // ============ 添加任务 ============
        addTask: function(options) {
            var task = {
                id: this.generateTaskId(),
                type: options.type || TASK_TYPES.CUSTOM,
                name: options.name || '未命名任务',
                priority: options.priority || PRIORITY.NORMAL,
                data: options.data || {},
                onSettled: options.onSettled,
                execute: options.execute,  // 执行函数，返回Promise
                status: TASK_STATUS.PENDING,
                createdAt: new Date(),
                startedAt: null,
                completedAt: null,
                result: null,
                error: null,
            };
            
            // 按优先级插入队列
            var insertIndex = this.queue.findIndex(function(t) {
                return t.priority > task.priority;
            });
            
            if (insertIndex === -1) {
                this.queue.push(task);
            } else {
                this.queue.splice(insertIndex, 0, task);
            }
            
            console.log('[调度器] 添加任务:', task.name, '优先级:', task.priority, '队列长度:', this.queue.length);
            this.emit('task-added', task);
            this.emit('queue-updated', this.getQueueStatus());
            
            // 尝试处理下一个
            this.processNext();
            
            return task.id;
        },

        // ============ 处理队列 ============
        processNext: async function() {
            var self = this;
            
            if (self.isProcessing || self.queue.length === 0) {
                return;
            }
            
            self.isProcessing = true;
            self.currentTask = self.queue.shift();
            self.currentTask.status = TASK_STATUS.RUNNING;
            self.currentTask.startedAt = new Date();
            
            console.log('[调度器] 开始执行:', self.currentTask.name);
            self.emit('task-started', self.currentTask);
            self.emit('queue-updated', self.getQueueStatus());
            
            try {
                if (typeof self.currentTask.execute === 'function') {
                    self.currentTask.result = await self.currentTask.execute(self.currentTask.data);
                }
                self.currentTask.status = TASK_STATUS.COMPLETED;
                console.log('[调度器] 任务完成:', self.currentTask.name);
                self.emit('task-completed', self.currentTask);
            } catch (e) {
                self.currentTask.status = TASK_STATUS.FAILED;
                self.currentTask.error = e.message || String(e);
                console.error('[调度器] 任务失败:', self.currentTask.name, e);
                self.emit('task-failed', self.currentTask);
            }
            
            self.currentTask.completedAt = new Date();
            self.currentTask.onSettled?.(self.currentTask);
            
            // 添加到历史
            self.history.unshift(self.currentTask);
            if (self.history.length > self.historyLimit) {
                self.history.pop();
            }
            
            self.currentTask = null;
            self.isProcessing = false;
            
            self.emit('queue-updated', self.getQueueStatus());
            
            // 继续处理下一个
            self.processNext();
        },

        // ============ 取消任务 ============
        cancelTask: function(taskId) {
            var index = this.queue.findIndex(function(t) { return t.id === taskId; });
            if (index !== -1) {
                var task = this.queue.splice(index, 1)[0];
                task.status = TASK_STATUS.CANCELLED;
                task.onSettled?.(task);
                task.completedAt = new Date();
                this.history.unshift(task);
                console.log('[调度器] 取消任务:', task.name);
                this.emit('task-cancelled', task);
                this.emit('queue-updated', this.getQueueStatus());
                return true;
            }
            return false;
        },

        // ============ 取消特定类型的所有任务 ============
        cancelTasksByType: function(type) {
            var self = this;
            var cancelled = [];
            self.queue = self.queue.filter(function(task) {
                if (task.type === type) {
                    task.status = TASK_STATUS.CANCELLED;
                task.onSettled?.(task);
                    task.completedAt = new Date();
                    self.history.unshift(task);
                    cancelled.push(task);
                    return false;
                }
                return true;
            });
            
            if (cancelled.length > 0) {
                console.log('[调度器] 取消了', cancelled.length, '个', type, '类型的任务');
                self.emit('queue-updated', self.getQueueStatus());
            }
            return cancelled;
        },

        // ============ 清空队列 ============
        clearQueue: function() {
            var self = this;
            self.queue.forEach(function(task) {
                task.status = TASK_STATUS.CANCELLED;
                task.onSettled?.(task);
                task.completedAt = new Date();
                self.history.unshift(task);
            });
            self.queue = [];
            console.log('[调度器] 队列已清空');
            self.emit('queue-updated', self.getQueueStatus());
        },

        // ============ 获取队列状态 ============
        getQueueStatus: function() {
            return {
                isProcessing: this.isProcessing,
                currentTask: this.currentTask ? {
                    id: this.currentTask.id,
                    type: this.currentTask.type,
                    name: this.currentTask.name,
                    startedAt: this.currentTask.startedAt,
                } : null,
                queueLength: this.queue.length,
                queue: this.queue.map(function(t) {
                    return {
                        id: t.id,
                        type: t.type,
                        name: t.name,
                        priority: t.priority,
                        createdAt: t.createdAt,
                    };
                }),
            };
        },

        // ============ 获取历史记录 ============
        getHistory: function(limit) {
            limit = limit || 20;
            return this.history.slice(0, limit).map(function(t) {
                return {
                    id: t.id,
                    type: t.type,
                    name: t.name,
                    status: t.status,
                    createdAt: t.createdAt,
                    completedAt: t.completedAt,
                    error: t.error,
                    duration: t.completedAt && t.startedAt 
                        ? (t.completedAt.getTime() - t.startedAt.getTime()) / 1000 
                        : null,
                };
            });
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
                        console.error('[调度器] 事件回调错误:', e);
                    }
                });
            }
        },

        // ============ 工具方法 ============
        generateTaskId: function() {
            return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },

        // ============ 常量导出 ============
        TASK_TYPES: TASK_TYPES,
        PRIORITY: PRIORITY,
        TASK_STATUS: TASK_STATUS,
    };

    // ============ 导出到全局（父窗口，因为酒馆助手脚本运行在iframe中） ============
    var targetWindow = window.parent || window;
    targetWindow.AnalysisScheduler = AnalysisScheduler;
    
    console.log('[调度器] 模块加载完成');
})();
