/**
 * 小手机 - 地图APP模块
 * 从血族小手机移植的城市地图功能
 * 
 * 依赖：phone_main.js 必须先加载
 */

(function () {
    'use strict';

    // 等待主模块就绪（轮询检查）
    function waitForPhoneSystem(callback) {
        if (window.parent.PhoneSystem) {
            callback();
        } else {
            console.log('[地图APP] 等待PhoneSystem加载...');
            setTimeout(function () { waitForPhoneSystem(callback); }, 100);
        }
    }

    waitForPhoneSystem(function () {
        console.log('[地图APP] PhoneSystem已就绪，开始初始化');

        // ============ APP配置 ============
        const APP_ID = 'map';
        const APP_NAME = '城市地图';
        const APP_ICON = '<img src="https://api.iconify.design/ri:map-2-fill.svg?color=white" style="width:70%;height:70%">';
        const APP_COLOR = 'linear-gradient(135deg, #1a3a5c, #2a5a8c)';

        // ============ 地图数据（可自定义） ============
        const MAP_CONFIG = {
            image: 'https://free.picui.cn/free/2025/11/26/6926a5eaed65b.png',
            width: 1600,
            height: 900,
            locations: [
                { name: '机场', emoji: '✈️', color: '#4488cc', x: 14.6, y: 14.0 },
                { name: '电视塔', emoji: '📡', color: '#cc6644', x: 24.9, y: 26.4 },
                { name: '高级写字楼', emoji: '🏢', color: '#5577aa', x: 35.5, y: 22.2 },
                { name: '公园', emoji: '🌳', color: '#22aa88', x: 55.1, y: 18.3 },
                { name: '居民区', emoji: '🏘️', color: '#888888', x: 69.5, y: 11.9 },
                { name: '山郊', emoji: '⛰️', color: '#668844', x: 82.7, y: 5.7 },
                { name: '大坝', emoji: '🌊', color: '#4466aa', x: 90.1, y: 10.3 },
                { name: '游泳馆', emoji: '🏊', color: '#44aacc', x: 86.1, y: 24.3 },
                { name: '火车站', emoji: '🚂', color: '#cc8844', x: 94.4, y: 32.3 },
                { name: '学校', emoji: '🏫', color: '#8b0000', x: 67.7, y: 35.1 },
                { name: '购物中心', emoji: '🛒', color: '#cc44aa', x: 48.2, y: 36.2 },
                { name: '商业街', emoji: '🏪', color: '#cc4444', x: 34.3, y: 40.9 },
                { name: '操场', emoji: '🏃', color: '#44aa44', x: 60.9, y: 43.7 },
                { name: '医院', emoji: '🏥', color: '#dd2222', x: 47.2, y: 58.4 },
                { name: '发电厂', emoji: '⚡', color: '#aaaa44', x: 83.1, y: 58.3 },
                { name: '老旧居民区', emoji: '🏚️', color: '#666666', x: 21.9, y: 59.2 },
                { name: '体育场', emoji: '🏟️', color: '#44cc88', x: 40.1, y: 75.2 },
                { name: '高档住宅区', emoji: '🏡', color: '#aa88cc', x: 27.5, y: 86.8 },
                { name: '工厂', emoji: '🏭', color: '#888844', x: 64.0, y: 87.8 },
                { name: '码头', emoji: '⚓', color: '#4488aa', x: 90.1, y: 86.7 },
            ]
        };

        // ============ 状态变量 ============
        let pendingDestination = null;

        // ============ 生成地图标记HTML ============
        function generateMarkersHTML() {
            return MAP_CONFIG.locations.map(loc => `
                <div class="map-marker" data-location="${loc.name}" style="position:absolute;left:${loc.x}%;top:${loc.y}%;transform:translate(-50%,-100%);cursor:pointer;z-index:10">
                    <div style="background:${loc.color};color:#fff;padding:4px 8px;border-radius:12px;font-size:11px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.5)">${loc.emoji} ${loc.name}</div>
                    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${loc.color};margin:0 auto"></div>
                </div>
            `).join('');
        }

        // ============ 生成APP HTML ============
        function generateAppHTML() {
            return `
                <div id="phone-map-app" style="position:absolute;inset:0;background:#1a1a2e;display:flex;flex-direction:column;overflow:hidden;z-index:400">
                    <!-- 头部 -->
                    <div style="height:88px;display:flex;align-items:flex-end;padding:0 16px 12px;background:rgba(0,0,0,0.5);border-bottom:1px solid rgba(100,150,200,0.3);z-index:10;flex-shrink:0">
                        <div id="map-back-btn" style="color:#6496c8;display:flex;align-items:center;gap:4px;cursor:pointer;width:60px">
                            <span style="font-size:18px">‹</span> 桌面
                        </div>
                        <div style="flex:1;text-align:center;font-weight:bold;font-size:17px;color:#fff">城市地图</div>
                        <div style="width:60px"></div>
                    </div>
                    
                    <!-- 提示栏 -->
                    <div style="padding:8px 16px;background:rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px;color:#fff;font-size:12px;flex-shrink:0">
                        <span style="color:#6496c8">ℹ️</span>
                        <span>拖动地图查看不同区域，点击建筑物前往该地点</span>
                    </div>
                    
                    <!-- 地图容器 - 支持鼠标拖拽 -->
                    <div id="map-viewport" style="flex:1;overflow:hidden;position:relative;cursor:grab">
                        <div id="map-inner" style="position:absolute;left:0;top:0;width:${MAP_CONFIG.width}px;height:${MAP_CONFIG.height}px">
                            <img src="${MAP_CONFIG.image}" style="width:100%;height:100%;object-fit:cover;pointer-events:none;display:block;user-select:none;-webkit-user-drag:none">
                            ${generateMarkersHTML()}
                        </div>
                    </div>
                    
                    <!-- 底部占位（保持布局，但不显示内容） -->
                    <div style="height:44px;flex-shrink:0"></div>
                    
                    <!-- 前往确认弹窗 -->
                    <div id="map-travel-confirm" style="position:absolute;inset:0;background:rgba(0,0,0,0.8);display:none;align-items:center;justify-content:center;z-index:500">
                        <div style="background:#1a1a2e;border-radius:16px;padding:24px;margin:20px;text-align:center;border:1px solid rgba(100,150,200,0.3);box-shadow:0 8px 32px rgba(0,0,0,0.5)">
                            <div style="font-size:32px;margin-bottom:12px">🚶</div>
                            <div style="font-size:16px;color:#fff;margin-bottom:8px">确认前往</div>
                            <div id="map-travel-dest" style="font-size:20px;font-weight:bold;color:#6496c8;margin-bottom:20px">目的地</div>
                            <div style="display:flex;gap:12px">
                                <button id="map-cancel-btn" style="flex:1;padding:12px 20px;border-radius:8px;border:1px solid #666;background:transparent;color:#fff;font-size:14px;cursor:pointer">取消</button>
                                <button id="map-confirm-btn" style="flex:1;padding:12px 20px;border-radius:8px;border:none;background:#6496c8;color:#fff;font-size:14px;font-weight:bold;cursor:pointer">确认前往</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // ============ 初始化地图拖拽 ============
        function initMapDrag(iframeDoc) {
            const viewport = iframeDoc.getElementById('map-viewport');
            const mapInner = iframeDoc.getElementById('map-inner');
            if (!viewport || !mapInner) return;

            let isDragging = false;
            let startX = 0, startY = 0;
            let mapX = 0, mapY = 0;

            // 边界限制
            function clampPosition() {
                const maxX = 0;
                const maxY = 0;
                const minX = viewport.clientWidth - MAP_CONFIG.width;
                const minY = viewport.clientHeight - MAP_CONFIG.height;
                mapX = Math.max(minX, Math.min(maxX, mapX));
                mapY = Math.max(minY, Math.min(maxY, mapY));
            }

            function updateMapPosition() {
                mapInner.style.left = mapX + 'px';
                mapInner.style.top = mapY + 'px';
            }

            // 鼠标事件
            viewport.addEventListener('mousedown', (e) => {
                if (e.target.closest('.map-marker')) return; // 不拦截标记点击
                isDragging = true;
                startX = e.clientX - mapX;
                startY = e.clientY - mapY;
                viewport.style.cursor = 'grabbing';
                e.preventDefault();
            });

            iframeDoc.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                mapX = e.clientX - startX;
                mapY = e.clientY - startY;
                clampPosition();
                updateMapPosition();
            });

            iframeDoc.addEventListener('mouseup', () => {
                isDragging = false;
                viewport.style.cursor = 'grab';
            });

            // 触摸事件
            viewport.addEventListener('touchstart', (e) => {
                if (e.target.closest('.map-marker')) return;
                if (e.touches.length === 1) {
                    isDragging = true;
                    startX = e.touches[0].clientX - mapX;
                    startY = e.touches[0].clientY - mapY;
                }
            }, { passive: true });

            iframeDoc.addEventListener('touchmove', (e) => {
                if (!isDragging || e.touches.length !== 1) return;
                mapX = e.touches[0].clientX - startX;
                mapY = e.touches[0].clientY - startY;
                clampPosition();
                updateMapPosition();
            }, { passive: true });

            iframeDoc.addEventListener('touchend', () => {
                isDragging = false;
            });

            // 初始居中
            mapX = (viewport.clientWidth - MAP_CONFIG.width) / 2;
            mapY = (viewport.clientHeight - MAP_CONFIG.height) / 2;
            clampPosition();
            updateMapPosition();
        }

        // ============ 打开APP处理 ============
        function openApp() {
            console.log('[地图APP] openApp被调用');

            const phoneSystem = window.parent.PhoneSystem;
            if (!phoneSystem) {
                console.error('[地图APP] PhoneSystem不存在');
                return;
            }

            const iframeWindow = phoneSystem.iframeWindow;
            if (!iframeWindow) {
                console.error('[地图APP] iframeWindow未就绪');
                setTimeout(openApp, 200);
                return;
            }

            let iframeDoc;
            try {
                iframeDoc = iframeWindow.document;
            } catch (e) {
                console.error('[地图APP] 无法访问iframeDoc:', e);
                return;
            }

            // 隐藏首页内容
            const homeScreen = iframeDoc.getElementById('home-screen');
            if (homeScreen) {
                homeScreen.style.display = 'none';
            }

            // 获取或创建app-container
            let appContainer = iframeDoc.getElementById('app-container');
            if (!appContainer) {
                const screen = iframeDoc.querySelector('.screen');
                if (screen) {
                    appContainer = iframeDoc.createElement('div');
                    appContainer.id = 'app-container';
                    appContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:300;pointer-events:none';
                    screen.appendChild(appContainer);
                } else {
                    console.error('[地图APP] 找不到.screen元素');
                    return;
                }
            }

            // 注入APP内容
            appContainer.innerHTML = generateAppHTML();
            appContainer.style.pointerEvents = 'auto';

            // 绑定事件
            setTimeout(() => {
                // 初始化地图拖拽
                initMapDrag(iframeDoc);

                // 返回按钮
                const backBtn = iframeDoc.getElementById('map-back-btn');
                if (backBtn) {
                    backBtn.onclick = () => {
                        closeApp();
                        window.parent.PhoneSystem.goHome();
                    };
                }

                // 地图标记点击
                iframeDoc.querySelectorAll('.map-marker').forEach(marker => {
                    marker.onclick = (e) => {
                        e.stopPropagation();
                        const location = marker.dataset.location;
                        if (location) {
                            pendingDestination = location;
                            const modal = iframeDoc.getElementById('map-travel-confirm');
                            const destText = iframeDoc.getElementById('map-travel-dest');
                            if (modal && destText) {
                                destText.textContent = location;
                                modal.style.display = 'flex';
                            }
                        }
                    };
                });

                // 取消按钮
                const cancelBtn = iframeDoc.getElementById('map-cancel-btn');
                if (cancelBtn) {
                    cancelBtn.onclick = () => {
                        pendingDestination = null;
                        const modal = iframeDoc.getElementById('map-travel-confirm');
                        if (modal) modal.style.display = 'none';
                    };
                }

                // 确认按钮
                const confirmBtn = iframeDoc.getElementById('map-confirm-btn');
                if (confirmBtn) {
                    confirmBtn.onclick = async () => {
                        if (!pendingDestination) return;
                        const location = pendingDestination;
                        pendingDestination = null;

                        const modal = iframeDoc.getElementById('map-travel-confirm');
                        if (modal) modal.style.display = 'none';

                        try {
                            // 在SillyTavern输入框中填入移动指令
                            const stDoc = window.parent.document;
                            const textarea = stDoc.getElementById('send_textarea');
                            if (textarea) {
                                textarea.value = `我前往了${location}`;
                                textarea.dispatchEvent(new Event('input', { bubbles: true }));

                                if (window.parent.toastr) {
                                    window.parent.toastr.success(`📍 已填入：我前往了${location}`);
                                }

                                // 关闭APP和手机
                                closeApp();
                                window.parent.PhoneSystem.goHome();

                                const container = stDoc.getElementById('tavern-phone-system-container');
                                const overlay = stDoc.getElementById('tavern-phone-system-overlay');
                                if (container) container.classList.remove('show');
                                if (overlay) overlay.classList.remove('show');
                                window.parent.PhoneSystem.isOpen = false;
                            }
                        } catch (e) {
                            console.error('[地图] 填入失败:', e);
                        }
                    };
                }

            }, 50);

            // 切换状态栏
            const statusBar = iframeDoc.getElementById('status-bar');
            if (statusBar) {
                statusBar.classList.remove('light');
                statusBar.classList.add('dark');
            }

            console.log('[地图APP] openApp完成');
        }

        // ============ 关闭APP处理 ============
        function closeApp() {
            console.log('[地图APP] closeApp被调用');
            const phoneSystem = window.parent?.PhoneSystem;
            if (!phoneSystem?.iframeWindow) return;
            const iframeWindow = phoneSystem.iframeWindow;


            try {
                const iframeDoc = iframeWindow.document;
                const appContainer = iframeDoc.getElementById('app-container');
                if (appContainer) {
                    appContainer.innerHTML = '';
                    appContainer.style.pointerEvents = 'none';
                }

                // 恢复首页显示
                const homeScreen = iframeDoc.getElementById('home-screen');
                if (homeScreen) {
                    homeScreen.style.display = 'block';
                }

                // 恢复状态栏
                const statusBar = iframeDoc.getElementById('status-bar');
                if (statusBar) {
                    statusBar.classList.remove('dark');
                    statusBar.classList.add('light');
                }
            } catch (e) {
                console.error('[地图APP] closeApp失败:', e);
            }
        }

        // ============ 注册APP ============
        console.log('[地图APP] 注册APP');
        window.parent.PhoneSystem.registerApp({
            id: APP_ID,
            name: APP_NAME,
            icon: APP_ICON,
            color: APP_COLOR,
            order: 10
        });

        // ============ 监听APP打开事件 ============
        window.parent.PhoneSystem.on('app-opened', function (data) {
            console.log('[地图APP] 收到app-opened事件:', data);
            if (data.id === APP_ID) {
                openApp();
            }
        });

        // ============ 监听返回桌面事件 ============
        window.parent.PhoneSystem.on('go-home', function () {
            closeApp();
        });

        console.log('[地图APP] 模块已加载');
    });
})();
