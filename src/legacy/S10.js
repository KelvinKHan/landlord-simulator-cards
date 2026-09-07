// ==================== 分析队列小组件 ====================
// 在手机主屏幕上显示当前分析任务队列状态
// 依赖: analysis_scheduler.js

(function() {
    'use strict';

    // ============ 小组件样式 ============
    const WIDGET_STYLES = `
        .queue-widget {
            position: fixed;
            bottom: 120px;
            right: 20px;
            background: rgba(26, 26, 46, 0.95);
            border-radius: 12px;
            padding: 12px 16px;
            min-width: 200px;
            max-width: 280px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #fff;
            z-index: 9998;
            transition: all 0.3s ease;
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .queue-widget.hidden {
            opacity: 0;
            transform: translateY(20px) scale(0.9);
            pointer-events: none;
        }
        
        .queue-widget.minimized {
            min-width: auto;
            padding: 8px 12px;
        }
        
        .queue-widget-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        
        .queue-widget-title {
            font-size: 12px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .queue-widget-badge {
            background: #3b82f6;
            color: #fff;
            padding: 2px 6px;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 600;
        }
        
        .queue-widget-toggle {
            width: 20px;
            height: 20px;
            border: none;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            color: #fff;
            cursor: pointer;
            font-size: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .queue-widget-toggle:hover {
            background: rgba(255,255,255,0.2);
        }
        
        .queue-widget-content {
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        
        .queue-widget.minimized .queue-widget-content {
            max-height: 0;
            margin: 0;
        }
        
        .queue-widget-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 0;
            font-size: 11px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        
        .queue-widget-item:last-child {
            border-bottom: none;
        }
        
        .queue-widget-item.current {
            color: #4ade80;
        }
        
        .queue-widget-spinner {
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255,255,255,0.2);
            border-top-color: #4ade80;
            border-radius: 50%;
            animation: queue-spin 0.8s linear infinite;
        }
        
        @keyframes queue-spin {
            to { transform: rotate(360deg); }
        }
        
        .queue-widget-icon {
            opacity: 0.5;
        }
        
        .queue-widget-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .queue-widget-empty {
            font-size: 11px;
            color: rgba(255,255,255,0.5);
            text-align: center;
            padding: 8px 0;
        }
    `;

    // ============ 小组件管理器 ============
    const QueueWidget = {
        element: null,
        isMinimized: false,
        isVisible: false,
        
        // 初始化
        init: function() {
            var self = this;
            
            // 注入样式
            self.injectStyles();
            
            // 创建DOM
            self.createElement();
            
            // 监听调度器事件
            if (window.AnalysisScheduler) {
                window.AnalysisScheduler.on('queue-updated', function(status) {
                    self.update(status);
                });
            }
            
            console.log('[队列小组件] 初始化完成');
            return self;
        },
        
        // 注入样式
        injectStyles: function() {
            var style = document.createElement('style');
            style.id = 'queue-widget-styles';
            style.textContent = WIDGET_STYLES;
            document.head.appendChild(style);
        },
        
        // 创建元素
        createElement: function() {
            var self = this;
            
            self.element = document.createElement('div');
            self.element.className = 'queue-widget hidden';
            self.element.innerHTML = `
                <div class="queue-widget-header">
                    <div class="queue-widget-title">
                        ⏳ 分析队列 <span class="queue-widget-badge">0</span>
                    </div>
                    <button class="queue-widget-toggle">−</button>
                </div>
                <div class="queue-widget-content">
                    <div class="queue-widget-empty">暂无任务</div>
                </div>
            `;
            
            document.body.appendChild(self.element);
            
            // 绑定事件
            self.element.querySelector('.queue-widget-toggle').addEventListener('click', function() {
                self.toggleMinimize();
            });
        },
        
        // 更新显示
        update: function(status) {
            var self = this;
            
            if (!self.element) return;
            
            var hasItems = status.isProcessing || status.queueLength > 0;
            
            // 显示/隐藏
            if (hasItems && !self.isVisible) {
                self.show();
            } else if (!hasItems && self.isVisible) {
                self.hide();
            }
            
            // 更新徽章
            var totalCount = status.queueLength + (status.isProcessing ? 1 : 0);
            self.element.querySelector('.queue-widget-badge').textContent = totalCount;
            
            // 更新内容
            var content = self.element.querySelector('.queue-widget-content');
            
            if (!hasItems) {
                content.innerHTML = '<div class="queue-widget-empty">暂无任务</div>';
                return;
            }
            
            var html = '';
            
            // 当前任务
            if (status.currentTask) {
                html += `
                    <div class="queue-widget-item current">
                        <div class="queue-widget-spinner"></div>
                        <span class="queue-widget-name">${self.escapeHtml(status.currentTask.name)}</span>
                    </div>
                `;
            }
            
            // 队列中的任务（最多显示3个）
            var displayQueue = status.queue.slice(0, 3);
            displayQueue.forEach(function(task) {
                html += `
                    <div class="queue-widget-item">
                        <span class="queue-widget-icon">⏸</span>
                        <span class="queue-widget-name">${self.escapeHtml(task.name)}</span>
                    </div>
                `;
            });
            
            // 如果还有更多
            if (status.queueLength > 3) {
                html += `
                    <div class="queue-widget-item">
                        <span class="queue-widget-icon">...</span>
                        <span class="queue-widget-name">还有 ${status.queueLength - 3} 个任务</span>
                    </div>
                `;
            }
            
            content.innerHTML = html;
        },
        
        // 显示
        show: function() {
            this.isVisible = true;
            this.element.classList.remove('hidden');
        },
        
        // 隐藏
        hide: function() {
            var self = this;
            self.isVisible = false;
            self.element.classList.add('hidden');
        },
        
        // 切换最小化
        toggleMinimize: function() {
            var self = this;
            self.isMinimized = !self.isMinimized;
            self.element.classList.toggle('minimized', self.isMinimized);
            self.element.querySelector('.queue-widget-toggle').textContent = self.isMinimized ? '+' : '−';
        },
        
        // HTML转义
        escapeHtml: function(text) {
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },
    };

    // ============ 导出到全局（父窗口） ============
    var targetWindow = window.parent || window;
    var targetDocument = targetWindow.document;
    targetWindow.QueueWidget = QueueWidget;
    
    // ============ 自动初始化（在父窗口中创建小组件） ============
    function initInParent() {
        // 注入样式到父窗口
        if (!targetDocument.getElementById('queue-widget-styles')) {
            var style = targetDocument.createElement('style');
            style.id = 'queue-widget-styles';
            style.textContent = WIDGET_STYLES;
            targetDocument.head.appendChild(style);
        }
        
        // 在父窗口创建元素
        if (!targetDocument.querySelector('.queue-widget')) {
            QueueWidget.element = targetDocument.createElement('div');
            QueueWidget.element.className = 'queue-widget hidden';
            QueueWidget.element.innerHTML = `
                <div class="queue-widget-header">
                    <div class="queue-widget-title">
                        ⏳ 分析队列 <span class="queue-widget-badge">0</span>
                    </div>
                    <button class="queue-widget-toggle">−</button>
                </div>
                <div class="queue-widget-content">
                    <div class="queue-widget-empty">暂无任务</div>
                </div>
            `;
            targetDocument.body.appendChild(QueueWidget.element);
            
            // 绑定事件
            QueueWidget.element.querySelector('.queue-widget-toggle').addEventListener('click', function() {
                QueueWidget.toggleMinimize();
            });
        }
        
        QueueWidget.element = targetDocument.querySelector('.queue-widget');
        // 依赖由统一入口保证已就绪
        if (targetWindow.AnalysisScheduler) {
            targetWindow.AnalysisScheduler.on('queue-updated', function(status) {
                QueueWidget.update(status);
            });
        }
        
        console.log('[队列小组件] 初始化完成');
    }
    
    // 延迟初始化，等待调度器加载
    initInParent();
    
    console.log('[队列小组件] 模块加载完成');
})();
