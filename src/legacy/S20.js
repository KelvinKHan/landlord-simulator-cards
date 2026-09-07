/**
 * 小手机 - 新闻APP模块
 * 使用独立API异步生成新闻，存储到SillyTavern变量供正则提取
 * 
 * 存储方式：通过 /setvar key=phone_news 存储
 * 读取方式：正则中使用 {{getvar::phone_news}}
 * 
 * 依赖：phone_main.js 必须先加载
 */

(function () {
    'use strict';

    // 等待主模块就绪
    function waitForPhoneSystem(callback) {
        if (window.parent.PhoneSystem) {
            callback();
        } else {
            console.log('[新闻APP] 等待PhoneSystem加载...');
            setTimeout(function () { waitForPhoneSystem(callback); }, 100);
        }
    }

    waitForPhoneSystem(function () {
        console.log('[新闻APP] PhoneSystem已就绪，开始初始化');

        // ============ APP配置 ============
        const APP_ID = 'news';
        const APP_NAME = '今日头条';
        const APP_ICON = '<img src="https://api.iconify.design/ri:newspaper-line.svg?color=white" style="width:70%;height:70%">';
        const APP_COLOR = 'linear-gradient(135deg, #ef4444, #dc2626)';

        // ============ 获取父窗口新闻系统数据 ============
        function getNewsData() {
            return window.parent.PhoneSystem?.newsSystem?.newsData || {
                headlines: [],
                lastUpdate: null,
                isLoading: false
            };
        }

        // ============ 检查并加载当前聊天的新闻 ============
        function ensureCurrentChatNews() {
            var newsSystem = window.parent.PhoneSystem?.newsSystem;
            if (!newsSystem) return;

            // 每次打开APP时，重新获取chatId并检查是否需要重新加载
            var currentChatId = newsSystem.getChatId();
            console.log('[新闻APP] 检查chatId - 当前:', currentChatId, '缓存:', newsSystem.currentChatId);

            if (currentChatId !== newsSystem.currentChatId) {
                console.log('[新闻APP] chatId不匹配，重新加载新闻');
                newsSystem.loadNewsForCurrentChat();
            }
        }

        // ============ 生成APP HTML ============
        function generateHTML() {
            return `
            <div id="news-app" style="position:absolute;inset:0;background:#f5f7fa;display:flex;flex-direction:column;font-family:-apple-system,'SF Pro Text',sans-serif;color:#333;overflow:hidden;z-index:400">
                <!-- 头部 -->
                <div style="height:88px;display:flex;align-items:flex-end;padding:0 16px 12px;background:rgba(255,255,255,0.8);backdrop-filter:blur(20px);border-bottom:1px solid rgba(0,0,0,0.05);z-index:10;flex-shrink:0">
                    <div id="news-back-btn" style="color:#d32f2f;display:flex;align-items:center;gap:4px;cursor:pointer;width:60px">
                        <span style="font-size:18px">‹</span> 返回
                    </div>
                    <div style="flex:1;text-align:center;font-weight:bold;font-size:17px">今日头条</div>
                    <div id="news-refresh-btn" style="width:60px;text-align:right;color:#d32f2f;font-size:16px;cursor:pointer">刷新</div>
                </div>

                <!-- 更新时间提示 -->
                <div id="news-update-time" style="padding:10px 16px;font-size:12px;color:#888;text-align:center;background:rgba(0,0,0,0.02)">
                    下拉刷新获取最新资讯
                </div>

                <!-- 新闻列表 -->
                <div id="news-list" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:16px;-webkit-overflow-scrolling:touch">
                    <div id="news-placeholder" style="text-align:center;padding:80px 20px;color:#999">
                        <div style="font-size:64px;margin-bottom:20px;opacity:0.3">📰</div>
                        <div style="font-size:16px;font-weight:500;margin-bottom:8px">暂无新闻</div>
                        <div style="font-size:14px">点击右上角刷新获取今日热点</div>
                    </div>
                </div>

                <!-- 底部品牌 -->
                <div style="padding:12px;text-align:center;font-size:11px;color:#bbb;background:#f5f7fa">
                    Powered by AI · Real-time Updates
                </div>
            </div>
            `;
        }

        // ============ 生成CSS ============
        function generateCSS() {
            return `
            <style id="news-app-styles">
                #news-app * {
                    box-sizing: border-box;
                }
                #news-app button:active {
                    opacity: 0.8;
                    transform: scale(0.98);
                }
                .news-card {
                    background: #fff;
                    border-radius: 12px;
                    padding: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
                    transition: transform 0.2s, box-shadow 0.2s;
                    border: 1px solid rgba(0,0,0,0.03);
                    position: relative;
                }
                .news-card:active {
                    transform: scale(0.98);
                    background: #f9f9f9;
                }
                .news-tag {
                    display: inline-block;
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 600;
                    margin-bottom: 8px;
                    color: #fff;
                }
                .news-tag.breaking { background: #ff3b30; }
                .news-tag.local { background: #007aff; }
                .news-tag.social { background: #5856d6; }
                .news-tag.economy { background: #34c759; }
                .news-tag.weather { background: #5ac8fa; }
                
                .news-title {
                    font-size: 18px;
                    font-weight: 700;
                    line-height: 1.35;
                    color: #111;
                    margin-bottom: 6px;
                    letter-spacing: -0.3px;
                }
                .news-summary {
                    font-size: 14px;
                    line-height: 1.5;
                    color: #666;
                    margin-bottom: 12px;
                }
                .news-meta {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: #999;
                    border-top: 1px solid #f0f0f0;
                    padding-top: 10px;
                }
                .news-loading {
                    text-align: center;
                    padding: 40px;
                }
                .news-loading-spinner {
                    width: 32px;
                    height: 32px;
                    border: 3px solid rgba(211,47,47,0.2);
                    border-top-color: #d32f2f;
                    border-radius: 50%;
                    animation: news-spin 1s linear infinite;
                    margin: 0 auto 16px;
                }
                @keyframes news-spin {
                    to { transform: rotate(360deg); }
                }
            </style>
            `;
        }

        // ============ 渲染新闻列表 ============
        function renderNewsList(iframeDoc) {
            const listEl = iframeDoc.getElementById('news-list');
            const newsData = getNewsData();

            if (newsData.isLoading) {
                listEl.innerHTML = `
                    <div class="news-loading">
                        <div class="news-loading-spinner"></div>
                        <div style="color: #666;">正在获取最新新闻...</div>
                    </div>
                `;
                return;
            }

            if (newsData.headlines.length === 0) {
                listEl.innerHTML = `
                    <div id="news-placeholder" style="text-align:center;padding:80px 20px;color:#999">
                        <div style="font-size:64px;margin-bottom:20px;opacity:0.3">📰</div>
                        <div style="font-size:16px;font-weight:500;margin-bottom:8px">暂无新闻</div>
                        <div style="font-size:14px">点击右上角刷新获取今日热点</div>
                    </div>
                `;
                return;
            }

            const tagColors = {
                '突发': 'breaking',
                '本地': 'local',
                '社会': 'social',
                '经济': 'economy',
                '天气': 'weather'
            };

            listEl.innerHTML = newsData.headlines.map((news, index) => `
                <div class="news-card" data-index="${index}">
                    <span class="news-tag ${tagColors[news.tag] || 'local'}">${news.tag || '资讯'}</span>
                    <div class="news-title">${news.title}</div>
                    <div class="news-summary">${news.summary}</div>
                    <div class="news-meta">
                        <span>${news.source || '本地快讯'}</span>
                        <span>${news.time || '刚刚'}</span>
                    </div>
                </div>
            `).join('');
        }

        // ============ 手动刷新新闻（调用父窗口新闻系统） ============
        async function refreshNews(iframeDoc) {
            const newsSystem = window.parent.PhoneSystem?.newsSystem;
            if (!newsSystem) {
                if (window.parent.toastr) {
                    window.parent.toastr.error('新闻系统未初始化');
                }
                console.error('[新闻APP] newsSystem不存在');
                return;
            }

            // 禁用刷新按钮，显示加载状态
            const refreshBtn = iframeDoc.getElementById('news-refresh-btn');
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = '加载...';
                refreshBtn.style.opacity = '0.6';
            }

            // 显示加载提示
            const listEl = iframeDoc.getElementById('news-list');
            if (listEl) {
                listEl.innerHTML = `
                    <div style="text-align:center;padding:60px 0;color:#888">
                        <div class="news-loading-spinner"></div>
                        <div style="font-size:14px">正在获取新闻...</div>
                    </div>
                `;
            }

            console.log('[新闻APP] 开始刷新新闻...');

            try {
                // 调用父窗口的生成函数
                const success = await newsSystem.generateNews(false);
                console.log('[新闻APP] 刷新结果:', success);

                // 刷新显示（检查界面是否仍存在）
                if (iframeDoc && iframeDoc.getElementById('news-list')) {
                    renderNewsList(iframeDoc);
                    updateTimeDisplay(iframeDoc);
                }
            } catch (e) {
                console.error('[新闻APP] 刷新失败:', e);
                if (window.parent.toastr) {
                    window.parent.toastr.error('刷新失败: ' + e.message);
                }
            } finally {
                // 恢复刷新按钮（检查元素是否仍存在）
                const currentRefreshBtn = iframeDoc?.getElementById?.('news-refresh-btn');
                if (currentRefreshBtn) {
                    currentRefreshBtn.disabled = false;
                    currentRefreshBtn.innerHTML = '刷新';
                    currentRefreshBtn.style.opacity = '1';
                }
            }
        }

        // ============ 更新时间显示 ============
        function updateTimeDisplay(iframeDoc) {
            const timeEl = iframeDoc.getElementById('news-update-time');
            const newsData = getNewsData();
            if (timeEl && newsData.lastUpdate) {
                const time = new Date(newsData.lastUpdate);
                const hours = String(time.getHours()).padStart(2, '0');
                const minutes = String(time.getMinutes()).padStart(2, '0');
                timeEl.textContent = `最后更新：${hours}:${minutes}`;
            }
        }

        // ============ 初始化事件绑定 ============
        function initEvents(iframeDoc) {
            // 返回按钮
            const backBtn = iframeDoc.getElementById('news-back-btn');
            if (backBtn) {
                backBtn.onclick = () => {
                    window.parent.PhoneSystem.goHome();
                };
            }

            // 刷新按钮
            const refreshBtn = iframeDoc.getElementById('news-refresh-btn');
            if (refreshBtn) {
                refreshBtn.onclick = () => {
                    refreshNews(iframeDoc);
                };
            }
        }

        // ============ 打开APP处理 ============
        function openApp() {
            console.log('[新闻APP] openApp被调用');

            const phoneSystem = window.parent.PhoneSystem;
            if (!phoneSystem || !phoneSystem.iframeWindow) {
                setTimeout(openApp, 200);
                return;
            }

            const iframeWindow = phoneSystem.iframeWindow;
            let iframeDoc;
            try {
                iframeDoc = iframeWindow.document;
            } catch (e) {
                console.error('[新闻APP] 无法访问iframeDoc:', e);
                return;
            }

            // 隐藏首页
            const homeScreen = iframeDoc.getElementById('home-screen');
            if (homeScreen) homeScreen.style.display = 'none';

            // 获取app-container
            let appContainer = iframeDoc.getElementById('app-container');
            if (!appContainer) {
                const screen = iframeDoc.querySelector('.screen');
                if (screen) {
                    appContainer = iframeDoc.createElement('div');
                    appContainer.id = 'app-container';
                    appContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:300;pointer-events:none';
                    screen.appendChild(appContainer);
                }
            }

            // 注入CSS和HTML
            appContainer.innerHTML = generateCSS() + generateHTML();
            appContainer.style.pointerEvents = 'auto';

            // 初始化事件
            setTimeout(() => {
                // 先检查chatId，确保加载正确的新闻
                ensureCurrentChatNews();

                initEvents(iframeDoc);
                renderNewsList(iframeDoc);
                updateTimeDisplay(iframeDoc);
            }, 50);

            // 状态栏
            const statusBar = iframeDoc.getElementById('status-bar');
            if (statusBar) {
                statusBar.classList.remove('light');
                statusBar.classList.add('dark');
            }
        }

        // ============ 关闭APP处理 ============
        function closeApp() {
            const phoneSystem = window.parent?.PhoneSystem;
            if (!phoneSystem?.iframeWindow) return;

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
            } catch (e) {
                console.error('[新闻APP] closeApp失败:', e);
            }
        }

        // ============ 注册APP ============
        window.parent.PhoneSystem.registerApp({
            id: APP_ID,
            name: APP_NAME,
            icon: APP_ICON,
            color: APP_COLOR,
            order: 6
        });

        // ============ 监听事件 ============
        window.parent.PhoneSystem.on('app-opened', function (data) {
            if (data.id === APP_ID) openApp();
        });

        window.parent.PhoneSystem.on('go-home', function () {
            closeApp();
        });

        // ============ 监听新闻更新事件（父窗口生成新闻后刷新显示） ============
        window.parent.PhoneSystem.on('news-updated', function () {
            try {
                const phoneSystem = window.parent.PhoneSystem;
                if (phoneSystem?.iframeWindow) {
                    const iframeDoc = phoneSystem.iframeWindow.document;
                    const newsApp = iframeDoc.getElementById('news-app');
                    if (newsApp) {
                        // APP正在显示，刷新列表
                        renderNewsList(iframeDoc);
                        updateTimeDisplay(iframeDoc);
                    }
                }
            } catch (e) { }
        });

        console.log('[新闻APP] 模块已加载');
    });
})();
