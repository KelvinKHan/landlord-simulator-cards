/**
 * 小手机 - 世界地图APP模块
 * 使用 Leaflet.js + OpenStreetMap 实现真实世界地图
 * 支持搜索地点、显示经纬度、邀请租客出行
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
            console.log('[世界地图] 等待PhoneSystem加载...');
            setTimeout(function () { waitForPhoneSystem(callback); }, 100);
        }
    }

    waitForPhoneSystem(function () {
        console.log('[世界地图] PhoneSystem已就绪，开始初始化');

        // ============ APP配置 ============
        const APP_ID = 'world-map';
        const APP_NAME = '世界地图';
        const APP_ICON = '<img src="https://api.iconify.design/ri:earth-fill.svg?color=white" style="width:70%;height:70%">';
        const APP_COLOR = 'linear-gradient(135deg, #1e88e5, #43a047)';

        // ============ 状态变量 ============
        let mapInstance = null;
        let currentMarker = null;
        let selectedLocation = null;
        let selectedCompanions = []; // 改为数组支持多选

        // ============ 生成APP HTML ============
        function generateAppHTML() {
            return `
                <div id="phone-world-map-app" style="position:absolute;inset:0;background:#f5f5f5;display:flex;flex-direction:column;overflow:hidden;z-index:400">
                    <!-- 头部 -->
                    <div style="height:88px;display:flex;align-items:flex-end;padding:0 16px 12px;background:#1e88e5;z-index:1000;flex-shrink:0">
                        <div id="worldmap-back-btn" style="color:#fff;display:flex;align-items:center;gap:4px;cursor:pointer;width:60px">
                            <span style="font-size:18px">‹</span> 返回
                        </div>
                        <div style="flex:1;text-align:center;font-weight:bold;font-size:17px;color:#fff">🌍 世界地图</div>
                        <div style="width:60px"></div>
                    </div>
                    
                    <!-- 搜索栏 -->
                    <div style="padding:12px;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.1);z-index:999;flex-shrink:0">
                        <div style="display:flex;gap:8px">
                            <input type="text" id="worldmap-search-input" placeholder="搜索地点..." style="flex:1;padding:10px 14px;border:1px solid #ddd;border-radius:20px;font-size:14px;outline:none">
                            <button id="worldmap-search-btn" style="padding:10px 16px;background:#1e88e5;color:#fff;border:none;border-radius:20px;font-size:14px;cursor:pointer">搜索</button>
                        </div>
                        <!-- 搜索结果 -->
                        <div id="worldmap-search-results" style="display:none;margin-top:8px;max-height:150px;overflow-y:auto;background:#fff;border:1px solid #ddd;border-radius:8px"></div>
                    </div>
                    
                    <!-- 地图容器 -->
                    <div id="worldmap-container" style="flex:1;position:relative;z-index:1">
                        <!-- Leaflet 地图将在这里渲染 -->
                    </div>
                    
                    <!-- 位置信息栏 -->
                    <div id="worldmap-info-bar" style="display:none;padding:12px 16px;background:#fff;border-top:1px solid #eee;flex-shrink:0">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <div id="worldmap-location-name" style="font-weight:bold;font-size:16px;color:#333">选择的地点</div>
                            <div id="worldmap-coords" style="font-size:12px;color:#666">经纬度</div>
                        </div>
                        <div style="display:flex;gap:8px">
                            <button id="worldmap-companion-btn" style="flex:1;padding:10px;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;font-size:13px;cursor:pointer">
                                👥 选择同行人
                            </button>
                            <button id="worldmap-go-btn" style="flex:1;padding:10px;background:#43a047;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer">
                                ✈️ 出发旅行
                            </button>
                        </div>
                    </div>
                    
                    <!-- 同行人选择弹窗（支持多选） -->
                    <div id="worldmap-companion-modal" style="position:absolute;inset:0;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:1000">
                        <div style="background:#fff;border-radius:16px;padding:20px;margin:20px;width:calc(100% - 40px);max-width:300px">
                            <div style="font-weight:bold;font-size:18px;margin-bottom:8px;text-align:center">选择同行租客</div>
                            <div style="font-size:12px;color:#999;text-align:center;margin-bottom:12px">可多选，点击确认后生效</div>
                            <div id="worldmap-companion-list" style="max-height:200px;overflow-y:auto">
                                <!-- 动态生成租客列表 -->
                            </div>
                            <div id="worldmap-selected-count" style="text-align:center;font-size:13px;color:#1e88e5;margin-top:8px">已选择: 0 人</div>
                            <div style="display:flex;gap:8px;margin-top:12px">
                                <button id="worldmap-companion-alone" style="flex:1;padding:10px;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;cursor:pointer">🚶 独自前往</button>
                                <button id="worldmap-companion-confirm" style="flex:1;padding:10px;background:#43a047;color:#fff;border:none;border-radius:8px;cursor:pointer">✓ 确认选择</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // ============ 加载Leaflet资源 ============
        function loadLeafletResources(iframeDoc, callback) {
            // 检查是否已加载
            if (iframeDoc.getElementById('leaflet-css')) {
                callback();
                return;
            }

            // 加载CSS
            const css = iframeDoc.createElement('link');
            css.id = 'leaflet-css';
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            iframeDoc.head.appendChild(css);

            // 加载JS
            const script = iframeDoc.createElement('script');
            script.id = 'leaflet-js';
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = callback;
            iframeDoc.head.appendChild(script);
        }

        // ============ 初始化地图 ============
        function initMap(iframeDoc, iframeWindow) {
            const container = iframeDoc.getElementById('worldmap-container');
            if (!container) return;

            // 创建地图div
            const mapDiv = iframeDoc.createElement('div');
            mapDiv.id = 'leaflet-map';
            mapDiv.style.cssText = 'width:100%;height:100%';
            container.appendChild(mapDiv);

            // 初始化Leaflet地图
            const L = iframeWindow.L;
            if (!L) {
                console.error('[世界地图] Leaflet未加载');
                return;
            }

            mapInstance = L.map('leaflet-map', {
                zoomControl: false
            }).setView([39.9042, 116.4074], 5); // 默认北京

            // 添加OpenStreetMap图层
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(mapInstance);

            // 添加缩放控件到右下角
            L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

            // 点击地图选择位置
            mapInstance.on('click', function (e) {
                setMarker(e.latlng.lat, e.latlng.lng, '自定义位置', iframeDoc, L);
            });

            console.log('[世界地图] 地图初始化完成');
        }

        // ============ 设置标记点 ============
        function setMarker(lat, lng, name, iframeDoc, L) {
            if (!mapInstance || !L) return;

            // 移除旧标记
            if (currentMarker) {
                mapInstance.removeLayer(currentMarker);
            }

            // 创建新标记
            currentMarker = L.marker([lat, lng]).addTo(mapInstance);
            currentMarker.bindPopup(`<b>${name}</b><br>📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`).openPopup();

            // 更新选中位置
            selectedLocation = { name, lat, lng };

            // 显示信息栏
            const infoBar = iframeDoc.getElementById('worldmap-info-bar');
            const locationName = iframeDoc.getElementById('worldmap-location-name');
            const coords = iframeDoc.getElementById('worldmap-coords');

            if (infoBar) infoBar.style.display = 'block';
            if (locationName) locationName.textContent = name;
            if (coords) coords.textContent = `📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

            // 移动地图到标记位置
            mapInstance.setView([lat, lng], Math.max(mapInstance.getZoom(), 10));
        }

        // ============ 搜索地点（Nominatim API） ============
        async function searchLocation(query, iframeDoc, iframeWindow) {
            const resultsDiv = iframeDoc.getElementById('worldmap-search-results');
            if (!resultsDiv) return;

            resultsDiv.innerHTML = '<div style="padding:12px;text-align:center;color:#666">搜索中...</div>';
            resultsDiv.style.display = 'block';

            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
                    { headers: { 'Accept-Language': 'zh-CN,zh,en' } }
                );
                const data = await response.json();

                if (data.length === 0) {
                    resultsDiv.innerHTML = '<div style="padding:12px;text-align:center;color:#999">未找到结果</div>';
                    return;
                }

                resultsDiv.innerHTML = data.map(item => `
                    <div class="search-result-item" data-lat="${item.lat}" data-lng="${item.lon}" data-name="${item.display_name.split(',')[0]}" 
                         style="padding:10px 12px;border-bottom:1px solid #eee;cursor:pointer;font-size:13px">
                        <div style="font-weight:500;color:#333">${item.display_name.split(',')[0]}</div>
                        <div style="font-size:11px;color:#999;margin-top:2px">${item.display_name}</div>
                    </div>
                `).join('');

                // 绑定点击事件
                resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
                    item.onclick = () => {
                        const lat = parseFloat(item.dataset.lat);
                        const lng = parseFloat(item.dataset.lng);
                        const name = item.dataset.name;
                        setMarker(lat, lng, name, iframeDoc, iframeWindow.L);
                        resultsDiv.style.display = 'none';
                        iframeDoc.getElementById('worldmap-search-input').value = name;
                    };
                });

            } catch (e) {
                console.error('[世界地图] 搜索失败:', e);
                resultsDiv.innerHTML = '<div style="padding:12px;text-align:center;color:#e53935">搜索失败，请重试</div>';
            }
        }

        // ============ 获取租客列表（从MVU Zod状态） ============
        function getCompanionList() {
            try {
                const Mvu = window.parent.Mvu;
                if (Mvu && typeof Mvu.getMvuData === 'function') {
                    // 获取目标消息ID
                    let targetMessageId = 'latest';
                    if (typeof window.parent.getLastMessageId === 'function') {
                        targetMessageId = window.parent.getLastMessageId();
                    } else {
                        const $ = window.parent.$;
                        if ($) {
                            const lastMes = $('#chat .mes').last();
                            if (lastMes.length) {
                                targetMessageId = lastMes.attr('mesid') || 'latest';
                            }
                        }
                    }

                    const result = Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
                    if (result && result.stat_data) {
                        const tenantList = result.stat_data.租客列表;
                        const roomList = result.stat_data.公寓?.房间列表;

                        // 构建租客->房间的映射（从房间的住户字段反查，支持合租用顿号分隔）
                        const tenantRoomMap = {};
                        if (roomList && typeof roomList === 'object') {
                            for (const [roomKey, roomData] of Object.entries(roomList)) {
                                const occupant = roomData?.住户;
                                if (occupant && occupant !== '无') {
                                    const roomName = roomData?.名称 || roomKey;
                                    const floor = roomData?.楼层 || '';
                                    const displayName = roomName !== roomKey ? roomName : `${floor}`;
                                    // 支持合租：住户字段可能是 "张小雪、林诗涵" 格式
                                    const names = occupant.split('、').map(s => s.trim()).filter(Boolean);
                                    for (const name of names) {
                                        if (name !== '<user>') tenantRoomMap[name] = displayName;
                                    }
                                }
                            }
                        }

                        if (tenantList && typeof tenantList === 'object') {
                            return Object.entries(tenantList).map(([name, data]) => ({
                                id: name,
                                name: name,
                                room: tenantRoomMap[name] || '未分配房间'
                            }));
                        }
                    }
                }
            } catch (e) {
                console.log('[世界地图] 无法获取MVU Zod租客列表:', e);
            }

            // 无数据时返回空数组
            return [];
        }

        // ============ 临时多选状态 ============
        let tempSelectedCompanions = [];

        // ============ 显示同行人选择（支持多选） ============
        function showCompanionModal(iframeDoc, isRefresh = false) {
            const modal = iframeDoc.getElementById('worldmap-companion-modal');
            const listDiv = iframeDoc.getElementById('worldmap-companion-list');
            if (!modal || !listDiv) return;

            const companions = getCompanionList();

            // 只在首次打开时重置临时选择，刷新时保持状态
            if (!isRefresh) {
                tempSelectedCompanions = [...selectedCompanions];
            }

            if (companions.length === 0) {
                listDiv.innerHTML = '<div style="padding:20px;text-align:center;color:#999">暂无可选租客</div>';
            } else {
                listDiv.innerHTML = companions.map(c => {
                    const isSelected = tempSelectedCompanions.some(s => s.id === c.id);
                    return `
                    <div class="companion-item" data-id="${c.id}" data-name="${c.name}" 
                         style="padding:12px;border:2px solid ${isSelected ? '#43a047' : '#ddd'};border-radius:8px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:10px;background:${isSelected ? '#e8f5e9' : '#fff'};user-select:none">
                        <div style="width:40px;height:40px;background:${isSelected ? '#43a047' : '#e3f2fd'};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;color:${isSelected ? '#fff' : '#333'}">${isSelected ? '✓' : '👤'}</div>
                        <div style="flex:1">
                            <div style="font-weight:500">${c.name}</div>
                            <div style="font-size:12px;color:#999">${c.room}</div>
                        </div>
                    </div>
                `}).join('');

                // 绑定多选事件
                listDiv.querySelectorAll('.companion-item').forEach(item => {
                    item.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();

                        const id = this.dataset.id;
                        const name = this.dataset.name;
                        const index = tempSelectedCompanions.findIndex(s => s.id === id);

                        if (index >= 0) {
                            tempSelectedCompanions.splice(index, 1);
                        } else {
                            tempSelectedCompanions.push({ id, name });
                        }

                        // 刷新列表显示（标记为刷新模式）
                        showCompanionModal(iframeDoc, true);
                    });
                });
            }

            // 更新已选计数
            const countDiv = iframeDoc.getElementById('worldmap-selected-count');
            if (countDiv) {
                countDiv.textContent = `已选择: ${tempSelectedCompanions.length} 人`;
            }

            modal.style.display = 'flex';
        }

        // ============ 更新同行人按钮显示 ============
        function updateCompanionButton(iframeDoc) {
            const btn = iframeDoc.getElementById('worldmap-companion-btn');
            if (!btn) return;

            if (selectedCompanions.length === 0) {
                btn.textContent = '👥 选择同行人';
            } else if (selectedCompanions.length === 1) {
                btn.textContent = `👥 ${selectedCompanions[0].name}`;
            } else {
                btn.textContent = `👥 ${selectedCompanions.length}人同行`;
            }
        }

        // ============ 执行出发旅行 ============
        function goTravel(iframeDoc) {
            if (!selectedLocation) {
                if (window.parent.toastr) window.parent.toastr.warning('请先选择目的地');
                return;
            }

            const destination = selectedLocation.name;
            const coords = `(${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)})`;

            // 构建旅行描述（支持多人同行）
            let travelText;
            if (selectedCompanions.length === 0) {
                travelText = `我独自前往了${destination}${coords}`;
            } else if (selectedCompanions.length === 1) {
                travelText = `我带着${selectedCompanions[0].name}一起前往了${destination}${coords}`;
            } else {
                const names = selectedCompanions.map(c => c.name).join('、');
                travelText = `我带着${names}一起前往了${destination}${coords}`;
            }

            try {
                const stDoc = window.parent.document;
                const textarea = stDoc.getElementById('send_textarea');
                if (textarea) {
                    textarea.value = travelText;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));

                    if (window.parent.toastr) {
                        window.parent.toastr.success(`✈️ 已填入旅行信息`);
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
                console.error('[世界地图] 填入失败:', e);
            }
        }

        // ============ 打开APP处理 ============
        function openApp() {
            console.log('[世界地图] openApp被调用');

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
                console.error('[世界地图] 无法访问iframeDoc:', e);
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

            // 注入APP
            appContainer.innerHTML = generateAppHTML();
            appContainer.style.pointerEvents = 'auto';

            // 重置状态
            selectedLocation = null;
            selectedCompanions = [];
            tempSelectedCompanions = [];
            mapInstance = null;
            currentMarker = null;

            // 加载Leaflet并初始化地图
            loadLeafletResources(iframeDoc, () => {
                setTimeout(() => initMap(iframeDoc, iframeWindow), 100);
            });

            // 绑定事件
            setTimeout(() => {
                // 返回按钮
                const backBtn = iframeDoc.getElementById('worldmap-back-btn');
                if (backBtn) {
                    backBtn.onclick = () => {
                        closeApp();
                        window.parent.PhoneSystem.goHome();
                    };
                }

                // 搜索按钮
                const searchBtn = iframeDoc.getElementById('worldmap-search-btn');
                const searchInput = iframeDoc.getElementById('worldmap-search-input');
                if (searchBtn && searchInput) {
                    searchBtn.onclick = () => searchLocation(searchInput.value, iframeDoc, iframeWindow);
                    searchInput.onkeypress = (e) => {
                        if (e.key === 'Enter') searchLocation(searchInput.value, iframeDoc, iframeWindow);
                    };
                }

                // 同行人按钮
                const companionBtn = iframeDoc.getElementById('worldmap-companion-btn');
                if (companionBtn) {
                    companionBtn.onclick = () => showCompanionModal(iframeDoc);
                }

                // 独自前往
                const companionAlone = iframeDoc.getElementById('worldmap-companion-alone');
                if (companionAlone) {
                    companionAlone.onclick = () => {
                        selectedCompanions = [];
                        tempSelectedCompanions = [];
                        iframeDoc.getElementById('worldmap-companion-modal').style.display = 'none';
                        updateCompanionButton(iframeDoc);
                    };
                }

                // 确认选择
                const companionConfirm = iframeDoc.getElementById('worldmap-companion-confirm');
                if (companionConfirm) {
                    companionConfirm.onclick = () => {
                        selectedCompanions = [...tempSelectedCompanions];
                        iframeDoc.getElementById('worldmap-companion-modal').style.display = 'none';
                        updateCompanionButton(iframeDoc);
                    };
                }

                // 出发按钮
                const goBtn = iframeDoc.getElementById('worldmap-go-btn');
                if (goBtn) {
                    goBtn.onclick = () => goTravel(iframeDoc);
                }

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

                // 销毁地图实例
                if (mapInstance) {
                    mapInstance.remove();
                    mapInstance = null;
                }
                currentMarker = null;

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
                console.error('[世界地图] closeApp失败:', e);
            }
        }

        // ============ 注册APP ============
        window.parent.PhoneSystem.registerApp({
            id: APP_ID,
            name: APP_NAME,
            icon: APP_ICON,
            color: APP_COLOR,
            order: 5
        });

        // ============ 监听事件 ============
        window.parent.PhoneSystem.on('app-opened', function (data) {
            if (data.id === APP_ID) openApp();
        });

        window.parent.PhoneSystem.on('go-home', function () {
            closeApp();
        });

        console.log('[世界地图] 模块已加载');
    });
})();
