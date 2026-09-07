// ==================== 租客档案分析 APP ====================
// 显示租客列表、分析状态、分析日志
// 依赖: tenant_analyzer.js, analysis_scheduler.js

(function () {
    'use strict';

    // ============ APP 样式 ============
    const APP_STYLES = `
        .tenant-app {
            font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
            background: #f5f7fa;
            color: #333;
            height: 100%;
            overflow-y: auto;
            padding: 16px;
            box-sizing: border-box;
            padding-bottom: 40px;
        }

        .tenant-app::-webkit-scrollbar {
            width: 4px;
        }
        .tenant-app::-webkit-scrollbar-thumb {
            background: rgba(0,0,0,0.1);
            border-radius: 2px;
        }

        /* 头部 */
        .tenant-header {
            display: flex;
            align-items: center;
            margin-bottom: 24px;
            gap: 16px;
            padding: 12px 0;
        }
        .tenant-header h2 {
            margin: 0;
            font-size: 22px;
            font-weight: 800;
            flex: 1;
            color: #1a1a1a;
            letter-spacing: -0.5px;
        }
        .back-btn {
            width: 36px;
            height: 36px;
            border: none;
            background: #fff;
            border-radius: 12px;
            color: #333;
            cursor: pointer;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            transition: all 0.2s;
        }
        .back-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        /* 通用卡片容器 */
        .tenant-section {
            background: #fff;
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.03);
            border: 1px solid rgba(0,0,0,0.02);
        }
        .tenant-section-title {
            font-size: 13px;
            color: #888;
            font-weight: 600;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* 状态面板 */
        .status-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        .status-item {
            background: #f8f9fb;
            padding: 12px;
            border-radius: 12px;
            border: 1px solid rgba(0,0,0,0.03);
            text-align: center;
        }
        .status-label {
            font-size: 11px;
            color: #999;
            margin-bottom: 6px;
        }
        .status-value {
            font-size: 16px;
            font-weight: 700;
            color: #333;
        }
        .status-value.highlight {
            color: #6c5ce7;
        }

        /* 设置项 */
        .setting-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        .setting-row:last-child {
            border-bottom: none;
        }
        .setting-hint {
            font-size: 11px;
            color: #aaa;
            padding: 8px 0;
            text-align: center;
            background: #f9f9f9;
            border-radius: 8px;
            margin: 8px 0;
        }
        .save-settings-btn {
            width: 100%;
            padding: 12px;
            margin-top: 8px;
            border: none;
            border-radius: 12px;
            background: #000;
            color: white;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        .save-settings-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 15px rgba(0,0,0,0.15);
        }
        .save-settings-btn:active {
            transform: scale(0.98);
        }
        .save-settings-btn.saved {
            background: #2ecc71;
        }
        .setting-label {
            font-size: 14px;
            font-weight: 500;
            color: #444;
        }
        .setting-input {
            width: 70px;
            padding: 6px 10px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background: #fff;
            color: #333;
            font-size: 14px;
            text-align: center;
            font-weight: 600;
        }
        .setting-toggle {
            width: 48px;
            height: 28px;
            background: #e0e0e0;
            border-radius: 14px;
            position: relative;
            cursor: pointer;
            transition: background 0.3s;
        }
        .setting-toggle.active {
            background: #6c5ce7;
        }
        .setting-toggle::after {
            content: '';
            position: absolute;
            width: 22px;
            height: 22px;
            background: #fff;
            border-radius: 50%;
            top: 3px;
            left: 3px;
            transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .setting-toggle.active::after {
            transform: translateX(20px);
        }

        /* 租客列表 */
        .tenant-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .tenant-card {
            background: #fff;
            border-radius: 12px;
            padding: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            border: 1px solid #f0f0f0;
            transition: transform 0.2s;
        }
        .tenant-card:active {
            transform: scale(0.99);
            background: #fcfcfc;
        }
        .tenant-avatar {
            width: 44px;
            height: 44px;
            background: #eee;
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: #666;
        }
        .tenant-info {
            flex: 1;
        }
        .tenant-name {
            font-size: 15px;
            font-weight: 700;
            color: #333;
            margin-bottom: 4px;
        }
        .tenant-status {
            font-size: 11px;
            color: #888;
            background: #f0f0f0;
            padding: 2px 6px;
            border-radius: 4px;
            display: inline-block;
        }
        .tenant-actions {
            display: flex;
            gap: 8px;
        }
        .tenant-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        .tenant-btn.primary {
            background: #6c5ce7;
            color: #fff;
            box-shadow: 0 2px 6px rgba(108, 92, 231, 0.3);
        }
        .tenant-btn.secondary {
            background: #f0f0f0;
            color: #555;
        }
        .tenant-btn:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }

        /* 分析按钮 */
        .analyze-all-btn {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 16px;
            background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);
            color: #fff;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            box-shadow: 0 8px 16px rgba(108, 92, 231, 0.2);
            text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .analyze-all-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 20px rgba(108, 92, 231, 0.3);
        }
        .analyze-all-btn:active {
            transform: scale(0.98);
        }
        .analyze-all-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        .analyze-all-btn.processing {
            background: #fdcb6e;
        }

        /* 队列面板 */
        .queue-panel {
            background: #ecf0f1;
            border: none;
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 20px;
        }
        .queue-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        .queue-title {
            font-size: 12px;
            font-weight: 700;
            color: #555;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .queue-count {
            background: #333;
            color: #fff;
            padding: 2px 8px;
            border-radius: 8px;
            font-size: 10px;
        }
        .queue-item {
            background: #fff;
            padding: 10px;
            border-radius: 8px;
            margin-bottom: 8px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .queue-item:last-child {
            margin-bottom: 0;
        }
        .queue-item.current {
            background: #fff;
            border-left: 4px solid #6c5ce7;
        }
        .queue-item-name {
            flex: 1;
            font-weight: 600;
            color: #333;
        }
        .queue-spinner {
            width: 14px;
            height: 14px;
            border: 2px solid #ccc;
            border-top-color: #6c5ce7;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* 日志面板 */
        .log-list {
            max-height: 200px;
            overflow-y: auto;
            background: #1e1e1e;
            border-radius: 12px;
            padding: 8px;
        }
        .log-item {
            padding: 8px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            font-size: 11px;
            font-family: 'Menlo', monospace;
        }
        .log-item:last-child {
            border-bottom: none;
        }
        .log-time {
            color: #666;
            margin-right: 8px;
        }
        .log-msg {
            color: #ccc;
        }
        .log-item.success .log-msg { color: #2ecc71; }
        .log-item.error .log-msg { color: #e74c3c; }
        .log-item.warning .log-msg { color: #f1c40f; }

        /* 空状态 */
        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #bbb;
        }
        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 12px;
            opacity: 0.3;
            filter: grayscale(100%);
        }

        /* 档案详情模态框 */
        .profile-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
        }
        .profile-content {
            background: #fff;
            border-radius: 20px;
            width: 100%;
            max-width: 400px;
            max-height: 80%;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        }
        .profile-header {
            padding: 20px;
            border-bottom: 1px solid #f0f0f0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .profile-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            color: #333;
        }
        .profile-close {
            width: 32px;
            height: 32px;
            border: none;
            background: #f0f0f0;
            border-radius: 50%;
            color: #666;
            cursor: pointer;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .profile-close:hover {
            background: #ddd;
        }
        .profile-body {
            padding: 20px;
            overflow-y: auto;
            flex: 1;
            background: #fcfcfc;
        }
        .profile-text {
            font-size: 14px;
            line-height: 1.7;
            white-space: pre-wrap;
            color: #555;
        }
    `;

    // ============ APP HTML 生成 ============
    function generateAppHTML() {
        return `
            <style>${APP_STYLES}</style>
            <div class="tenant-app">
                <div class="tenant-header">
                    <button class="back-btn" id="backBtn">‹</button>
                    <h2>租客档案分析</h2>
                </div>

                <!-- 队列面板 (动态显示) -->
                <div id="queuePanel" class="queue-panel" style="display: none;">
                    <div class="queue-header">
                        <div class="queue-title">
                            ⏳ 分析队列 <span id="queueCount" class="queue-count">0</span>
                        </div>
                    </div>
                    <div id="queueList"></div>
                </div>

                <!-- 状态面板 -->
                <div class="tenant-section">
                    <div class="tenant-section-title">📊 分析状态</div>
                    <div class="status-grid">
                        <div class="status-item">
                            <div class="status-label">当前楼层</div>
                            <div class="status-value highlight" id="currentFloor">0</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">下次触发</div>
                            <div class="status-value" id="nextTrigger">-</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">上次分析</div>
                            <div class="status-value" id="lastAnalysis">-</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">租客数量</div>
                            <div class="status-value" id="tenantCount">0</div>
                        </div>
                    </div>
                </div>

                <!-- 设置面板 -->
                <div class="tenant-section">
                    <div class="tenant-section-title">⚙️ 自动分析设置</div>
                    <div class="setting-row">
                        <span class="setting-label">启用自动分析</span>
                        <div id="toggleAuto" class="setting-toggle active"></div>
                    </div>
                    <div class="setting-row">
                        <span class="setting-label">触发间隔 (楼层，双数)</span>
                        <input type="number" id="intervalInput" class="setting-input" value="30" min="4" max="100" step="2">
                    </div>
                    <div class="setting-hint">每N楼自动分析对话中出现的租客</div>
                    <button id="saveSettingsBtn" class="save-settings-btn">💾 保存设置</button>
                </div>

                <!-- 租客列表 -->
                <div class="tenant-section">
                    <div class="tenant-section-title">👥 租客列表</div>
                    <div id="tenantList" class="tenant-list">
                        <div class="empty-state">
                            <div class="empty-state-icon">🏠</div>
                            <div>暂无租客</div>
                        </div>
                    </div>
                </div>

                <!-- 分析按钮 -->
                <button id="analyzeAllBtn" class="analyze-all-btn">
                    <span>🔍</span> 立即分析全部租客
                </button>

                <!-- 分析日志 -->
                <div class="tenant-section" style="margin-top: 24px;">
                    <div class="tenant-section-title">📝 分析日志</div>
                    <div id="logList" class="log-list">
                        <div class="empty-state" style="padding: 20px; color: #555; background: none;">
                            暂无日志
                        </div>
                    </div>
                </div>
            </div>

            <!-- 档案详情模态框 -->
            <div id="profileModal" class="profile-modal" style="display: none;">
                <div class="profile-content">
                    <div class="profile-header">
                        <h3 id="profileTitle">租客档案</h3>
                        <button class="profile-close" id="profileClose">×</button>
                    </div>
                    <div class="profile-body">
                        <div id="profileText" class="profile-text"></div>
                    </div>
                </div>
            </div>
        `;
    }

    // ============ APP 逻辑 ============
    var disposeApp = function() {};
    function initApp(iframeDoc) {
        disposeApp();
        var Analyzer = window.parent.TenantAnalyzer;
        var Scheduler = window.parent.AnalysisScheduler;

        if (!Analyzer || !Scheduler) {
            console.error('[租客APP] 依赖模块未加载');
            return;
        }

        // 获取DOM元素
        var elements = {
            queuePanel: iframeDoc.getElementById('queuePanel'),
            queueCount: iframeDoc.getElementById('queueCount'),
            queueList: iframeDoc.getElementById('queueList'),
            currentFloor: iframeDoc.getElementById('currentFloor'),
            nextTrigger: iframeDoc.getElementById('nextTrigger'),
            lastAnalysis: iframeDoc.getElementById('lastAnalysis'),
            tenantCount: iframeDoc.getElementById('tenantCount'),
            toggleAuto: iframeDoc.getElementById('toggleAuto'),
            intervalInput: iframeDoc.getElementById('intervalInput'),
            saveSettingsBtn: iframeDoc.getElementById('saveSettingsBtn'),
            tenantList: iframeDoc.getElementById('tenantList'),
            analyzeAllBtn: iframeDoc.getElementById('analyzeAllBtn'),
            logList: iframeDoc.getElementById('logList'),
            profileModal: iframeDoc.getElementById('profileModal'),
            profileTitle: iframeDoc.getElementById('profileTitle'),
            profileText: iframeDoc.getElementById('profileText'),
            profileClose: iframeDoc.getElementById('profileClose'),
            backBtn: iframeDoc.getElementById('backBtn'),
        };

        // 返回按钮事件
        elements.backBtn.addEventListener('click', function () {
            // 通知父窗口返回主页
            if (window.parent.PhoneSystem) {
                window.parent.PhoneSystem.goHome();
            }
        });

        // 更新状态显示
        function updateStatus() {
            var status = Analyzer.getStatus();
            elements.currentFloor.textContent = status.currentFloor;
            elements.nextTrigger.textContent = '第' + status.nextTriggerFloor + '楼';
            elements.tenantCount.textContent = status.tenantCount + '人';

            if (status.lastAnalysisTime) {
                var time = new Date(status.lastAnalysisTime);
                elements.lastAnalysis.textContent = time.toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } else {
                elements.lastAnalysis.textContent = '暂无';
            }

            // 更新设置UI
            elements.toggleAuto.classList.toggle('active', status.config.enableAutoAnalysis);
            elements.intervalInput.value = status.config.triggerInterval;
        }

        // 更新租客列表
        function updateTenantList() {
            var tenants = Analyzer.getTenantList();
            var names = Object.keys(tenants);

            if (names.length === 0) {
                elements.tenantList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🏠</div>
                        <div>暂无租客</div>
                    </div>
                `;
                return;
            }

            elements.tenantList.innerHTML = names.map(function (name) {
                var data = tenants[name];
                return `
                    <div class="tenant-card" data-name="${name}">
                        <div class="tenant-avatar">👤</div>
                        <div class="tenant-info">
                            <div class="tenant-name">${name}</div>
                            <div class="tenant-status">${data.状态 || '正常'} | ${data.职业 || '未知'}</div>
                        </div>
                        <div class="tenant-actions">
                            <button class="tenant-btn secondary view-profile">档案</button>
                            <button class="tenant-btn primary analyze-single">分析</button>
                        </div>
                    </div>
                `;
            }).join('');

            // 绑定按钮事件
            elements.tenantList.querySelectorAll('.tenant-card').forEach(function (card) {
                var name = card.dataset.name;

                card.querySelector('.view-profile').addEventListener('click', function () {
                    showProfile(name);
                });

                card.querySelector('.analyze-single').addEventListener('click', function () {
                    Analyzer.manualAnalyzeSingle(name);
                });
            });
        }

        // 更新队列显示
        function updateQueueDisplay() {
            var queueStatus = Scheduler.getQueueStatus();
            var hasItems = queueStatus.isProcessing || queueStatus.queueLength > 0;

            elements.queuePanel.style.display = hasItems ? 'block' : 'none';
            elements.queueCount.textContent = queueStatus.queueLength + (queueStatus.isProcessing ? 1 : 0);

            // 更新分析按钮状态
            if (queueStatus.isProcessing) {
                elements.analyzeAllBtn.disabled = true;
                elements.analyzeAllBtn.classList.add('processing');
                elements.analyzeAllBtn.innerHTML = '<div class="queue-spinner"></div> 分析中...';
            } else {
                elements.analyzeAllBtn.disabled = false;
                elements.analyzeAllBtn.classList.remove('processing');
                elements.analyzeAllBtn.innerHTML = '<span>🔍</span> 立即分析全部租客';
            }

            // 生成队列列表
            var html = '';

            if (queueStatus.currentTask) {
                html += `
                    <div class="queue-item current">
                        <div class="queue-spinner"></div>
                        <span class="queue-item-name">${queueStatus.currentTask.name}</span>
                    </div>
                `;
            }

            queueStatus.queue.forEach(function (task) {
                html += `
                    <div class="queue-item">
                        <span>⏸</span>
                        <span class="queue-item-name">${task.name}</span>
                    </div>
                `;
            });

            elements.queueList.innerHTML = html || '<div style="font-size:12px;color:rgba(0,0,0,0.5);">队列为空</div>';
        }

        // 更新日志显示
        function updateLogDisplay() {
            var logs = Analyzer.getLog(20);

            if (logs.length === 0) {
                elements.logList.innerHTML = `
                    <div class="empty-state" style="padding: 20px; color: #555; background: none;">
                        暂无日志
                    </div>
                `;
                return;
            }

            elements.logList.innerHTML = logs.map(function (log) {
                var time = new Date(log.time).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                return `
                    <div class="log-item ${log.type}">
                        <span class="log-time">[${time}]</span>
                        <span class="log-msg">${log.message}</span>
                    </div>
                `;
            }).join('');
        }

        // 显示档案详情
        async function showProfile(tenantName) {
            elements.profileTitle.textContent = tenantName + ' 的档案';
            elements.profileText.textContent = '加载中...';
            elements.profileModal.style.display = 'flex';

            try {
                var baseProfile = await Analyzer.getBaseProfile(tenantName);
                var dynamicProfile = await Analyzer.getDynamicProfile(tenantName);
                var profile = '';
                if (baseProfile) profile += '【本色】\n' + baseProfile + '\n\n';
                if (dynamicProfile) profile += '【调色】\n' + dynamicProfile;
                elements.profileText.textContent = profile || '暂无档案，请先进行分析';
            } catch (e) {
                elements.profileText.textContent = '加载失败: ' + e.message;
            }
        }

        // 绑定事件
        elements.toggleAuto.addEventListener('click', function () {
            var isActive = this.classList.toggle('active');
            console.log('[租客APP] 自动分析已' + (isActive ? '启用' : '禁用'));
            Analyzer.updateConfig({ enableAutoAnalysis: isActive });
        });

        elements.intervalInput.addEventListener('change', function () {
            var value = parseInt(this.value) || 30;
            // 确保是双数（AI输出后触发）
            if (value % 2 !== 0) {
                value = value + 1;
            }
            value = Math.max(4, Math.min(100, value));
            this.value = value;
            console.log('[租客APP] 触发间隔已修改为:', value);
            Analyzer.updateConfig({ triggerInterval: value });
            updateStatus();
        });

        // 保存设置按钮
        elements.saveSettingsBtn.addEventListener('click', function () {
            var btn = this;
            // 强制保存配置
            Analyzer.saveConfig();
            console.log('[租客APP] 设置已保存');

            // 视觉反馈
            btn.textContent = '✅ 已保存';
            btn.classList.add('saved');
            setTimeout(function () {
                btn.textContent = '💾 保存设置';
                btn.classList.remove('saved');
            }, 2000);
        });

        elements.analyzeAllBtn.addEventListener('click', function () {
            if (!this.disabled) {
                Analyzer.manualAnalyzeAll();
            }
        });

        elements.profileClose.addEventListener('click', function () {
            elements.profileModal.style.display = 'none';
        });

        elements.profileModal.addEventListener('click', function (e) {
            if (e.target === elements.profileModal) {
                elements.profileModal.style.display = 'none';
            }
        });

        // 监听调度器事件
        Scheduler.on('queue-updated', updateQueueDisplay);

        // 监听分析器事件
        Analyzer.on('log-added', updateLogDisplay);
        var onCompleted = function () { updateStatus(); updateTenantList(); };
        Analyzer.on('analysis-completed', onCompleted);

        // 初始化显示
        updateStatus();
        updateTenantList();
        updateQueueDisplay();
        updateLogDisplay();

        // 定时刷新状态
        var refreshTimer = setInterval(function () {
            updateStatus();
            updateTenantList();
        }, 5000);
        disposeApp = function() {
            clearInterval(refreshTimer);
            Scheduler.off("queue-updated", updateQueueDisplay);
            Analyzer.off("log-added", updateLogDisplay);
            Analyzer.off("analysis-completed", onCompleted);
        };
    }

    // ============ 等待PhoneSystem就绪后注册APP ============
    function waitForPhoneSystem(callback) {
        if (window.parent.PhoneSystem) {
            callback();
        } else {
            console.log('[租客APP] 等待PhoneSystem加载...');
            setTimeout(function () { waitForPhoneSystem(callback); }, 100);
        }
    }

    waitForPhoneSystem(function () {
        console.log('[租客APP] PhoneSystem已就绪，开始注册');

        var APP_ID = 'tenant_analyzer';
        var APP_NAME = '租客档案';
        var APP_ICON = '<img src="https://api.iconify.design/ri:user-star-line.svg?color=white" style="width:70%;height:70%">';

        // 注册APP
        window.parent.PhoneSystem.registerApp({
            id: APP_ID,
            name: APP_NAME,
            icon: APP_ICON,
            color: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
            order: 3,
        });

        // 打开APP
        function openApp() {
            var phoneSystem = window.parent.PhoneSystem;
            if (!phoneSystem || !phoneSystem.iframeWindow) {
                setTimeout(openApp, 200);
                return;
            }

            var iframeDoc = phoneSystem.iframeWindow.document;
            var appContainer = iframeDoc.getElementById('app-container');
            var homeScreen = iframeDoc.getElementById('home-screen');
            var statusBar = iframeDoc.getElementById('status-bar');

            if (!appContainer) return;

            // 隐藏主屏幕，显示APP
            homeScreen.style.display = 'none';
            appContainer.innerHTML = '';
            appContainer.style.display = 'block';
            statusBar.classList.remove('light');
            statusBar.classList.add('dark');

            // 创建APP内容
            var appDiv = document.createElement('div');
            appDiv.id = 'tenant-analyzer-app';
            appDiv.style.cssText = 'width:100%;height:100%;';
            appDiv.innerHTML = generateAppHTML();
            appContainer.appendChild(appDiv);

            initApp(iframeDoc);
        }

        // 关闭APP
        function closeApp() {
            disposeApp();
            if (!window.parent) return;
            var phoneSystem = window.parent.PhoneSystem;
            if (!phoneSystem || !phoneSystem.iframeWindow) return;

            try {
                var iframeDoc = phoneSystem.iframeWindow.document;

                var appContainer = iframeDoc.getElementById('app-container');
                if (appContainer) {
                    appContainer.innerHTML = '';
                    appContainer.style.pointerEvents = 'none';
                }

                var homeScreen = iframeDoc.getElementById('home-screen');
                if (homeScreen) homeScreen.style.display = 'block';

                var statusBar = iframeDoc.getElementById('status-bar');
                if (statusBar) {
                    statusBar.classList.remove('dark');
                    statusBar.classList.add('light');
                }
            } catch (e) {
                console.error('[租客APP] closeApp失败:', e);
            }
        }

        // 监听事件
        window.parent.PhoneSystem.on('app-opened', function (data) {
            if (data.id === APP_ID) openApp();
        });

        window.parent.PhoneSystem.on('go-home', function () {
            closeApp();
        });

        console.log('[租客APP] 注册完成');
    });

    console.log('[租客APP] 模块加载完成');
})();
