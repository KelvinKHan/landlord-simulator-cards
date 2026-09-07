(function () {
    'use strict';

    const APP_ID = 'apt-audio';
    const APP_NAME = '环境音响';
    const APP_ICON = '🎵';

    // ==============================================================================
    // 1. 核心播放器与状态大脑 (📻 Apt-Radio 私人电台最终版)
    // ==============================================================================
    const AudioCore = {
        audioEl: null,
        isPlaying: false,
        currentMode: 'immersive', // immersive (智能沉浸) 或 manual (手动电台)
        currentSong: null,
        lastEnvHash: '',
        unlocked: false, // 浏览器静默提权标记
        
        // 🌟 核心升级：精选 Google 官方高保真无版权音频，全球 CDN 秒开，永不 403！
        radioLibrary: [
            { id: 'r1', name: '伦敦骤雨 (Heavy Rain)', singer: '高保真白噪音', cover: '🌧️', url: 'https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg' },
            { id: 'r2', name: '午后雷阵雨 (Thunderstorm)', singer: '高保真白噪音', cover: '⛈️', url: 'https://actions.google.com/sounds/v1/weather/thunderstorm_long.ogg' },
            { id: 'r3', name: '晨间清流 (Stream Water)', singer: '自然环境音', cover: '🏞️', url: 'https://actions.google.com/sounds/v1/water/small_stream_flowing.ogg' },
            { id: 'r4', name: '海浪拍岸 (Ocean Waves)', singer: '自然环境音', cover: '🌊', url: 'https://actions.google.com/sounds/v1/water/waves_crashing_on_rock_beach.ogg' },
            { id: 'r5', name: '曼哈顿咖啡馆 (Coffee Shop)', singer: '都市氛围音', cover: '☕', url: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg' },
            { id: 'r6', name: '燃烧的壁炉 (Fireplace)', singer: '室内环境音', cover: '🔥', url: 'https://actions.google.com/sounds/v1/ambiences/fire.ogg' },
            { id: 'r7', name: '盛夏森林 (Summer Forest)', singer: '自然环境音', cover: '🌲', url: 'https://actions.google.com/sounds/v1/ambiences/summer_forest.ogg' },
            { id: 'r8', name: '旷野之风 (Wind through Window)', singer: '高保真白噪音', cover: '❄️', url: 'https://actions.google.com/sounds/v1/weather/wind_through_window.ogg' },
            { id: 'r9', name: '深空舱内 (Space Hum)', singer: '科幻氛围音', cover: '🌌', url: 'https://actions.google.com/sounds/v1/ambiences/ambient_hum_air_conditioner.ogg' },
            { id: 'r10', name: '城市公路 (Distant Highway)', singer: '都市氛围音', cover: '🏙️', url: 'https://actions.google.com/sounds/v1/ambiences/distant_highway.ogg' },
            { id: 'r11', name: '郊外白昼 (Outdoor Ambience)', singer: '自然环境音', cover: '🍃', url: 'https://actions.google.com/sounds/v1/ambiences/outdoor_summer_ambience.ogg' }
        ],

        // 智能环境匹配字典 (已同步更新 ID 映射)
        envKeywords: {
            weather: { '雨': ['r1', 'r2'], '雪': ['r8'], '阴': ['r5', 'r10'], '晴': ['r3', 'r11'], '风': ['r8', 'r4'] },
            time: { '晨': ['r3', 'r5'], '午': ['r5', 'r10'], '晚': ['r6', 'r4'], '夜': ['r7', 'r1'], '更': ['r9', 'r6'] }
        },

        init: function() {
            const shadow = window.parent.AptSystem.shadowRoot;
            this.audioEl = shadow.getElementById('apt-global-audio');
            
            if (!this.audioEl) {
                this.audioEl = window.parent.document.createElement('audio');
                this.audioEl.id = 'apt-global-audio';
                this.audioEl.loop = true; // 电台模式开启单曲无限循环
                this.audioEl.style.display = 'none';
                shadow.appendChild(this.audioEl); 
            }

            // 【静默提权外挂】：利用玩家的第一次点击，撕开浏览器的自动播放限制
            const unlockAudio = () => {
                if (!this.unlocked && this.audioEl) {
                    this.audioEl.play().then(() => {
                        this.audioEl.pause();
                        this.unlocked = true;
                        window.parent.AptSystem.log('[Apt-Radio] 扬声器权限已解锁', 'success');
                        window.parent.document.body.removeEventListener('click', unlockAudio);
                        shadow.removeEventListener('click', unlockAudio);
                    }).catch(() => {});
                }
            };
            window.parent.document.body.addEventListener('click', unlockAudio, { once: true });
            shadow.addEventListener('click', unlockAudio, { once: true });

            this.audioEl.onplay = () => { this.isPlaying = true; AudioUI.updatePlayerState(); };
            this.audioEl.onpause = () => { this.isPlaying = false; AudioUI.updatePlayerState(); };
            // 因为开启了 loop=true，这里不再需要 onended 切歌了
            this.audioEl.ontimeupdate = () => AudioUI.updateProgress();

            if (typeof window.parent.eventOn === 'function' && !window.parent._aptAudioWatcher) {
                window.parent.eventOn('mag_variable_update_ended', () => {
                    if (this.currentMode === 'immersive') this.checkEnvironment();
                });
                window.parent._aptAudioWatcher = true;
            }
        },

        playSong: async function(song) {
            const AptSystem = window.parent.AptSystem;
            this.currentSong = song;
            AudioUI.updatePlayerState(); 
            
            try {
                this.audioEl.src = song.url;
                await this.audioEl.play(); 
                if (this.currentMode === 'manual') AptSystem.showNotification(`正在播放频道: ${song.name}`, 'success');
            } catch (e) {
                AptSystem.showNotification(`⚠️ 浏览器拦截，请手动点击底部的播放按钮`, 'warning');
            }
        },

        togglePlay: function() {
            if (!this.currentSong) {
                // 如果没选歌直接点播放，默认播放第一首
                this.playSong(this.radioLibrary[0]);
                return;
            }
            if (this.isPlaying) this.audioEl.pause();
            else this.audioEl.play();
        },

        checkEnvironment: function() {
            try {
                const mvu = window.parent.Mvu?.getMvuData({ type: 'message', message_id: 'latest' })?.stat_data;
                if (!mvu || !mvu.世界) return;
                
                const weather = mvu.世界.天气 || '晴';
                const time = mvu.世界.时间 || '午后';
                
                const envHash = `${weather}-${time}`;
                if (this.lastEnvHash === envHash) return; 
                this.lastEnvHash = envHash;

                AudioUI.updateEnvDisplay(weather, time);
                this.triggerAutoDJ(weather, time);
            } catch (e) {}
        },

        triggerAutoDJ: function(weatherStr = '', timeStr = '') {
            const wStr = weatherStr || (this.lastEnvHash.split('-')[0] || '晴');
            const tStr = timeStr || (this.lastEnvHash.split('-')[1] || '夜');

            // 智能算法：寻找天气和时间交集的电台，如果没有交集，优先匹配天气
            let wMatches = ['r6']; // 默认兜底
            let tMatches = ['r6'];

            for (let key in this.envKeywords.weather) { if (wStr.includes(key)) wMatches = this.envKeywords.weather[key]; }
            for (let key in this.envKeywords.time) { if (tStr.includes(key)) tMatches = this.envKeywords.time[key]; }

            // 取交集
            let intersection = wMatches.filter(x => tMatches.includes(x));
            let targetId = intersection.length > 0 ? intersection[Math.floor(Math.random() * intersection.length)] : wMatches[Math.floor(Math.random() * wMatches.length)];

            const targetSong = this.radioLibrary.find(s => s.id === targetId);
            if (targetSong) {
                window.parent.AptSystem.Island?.showNotification(`🌦️ 智能调频：已切换至频道 [${targetSong.name}]`, 'info');
                this.playSong(targetSong);
            }
        }
    };

    // ==============================================================================
    // 2. 悬浮胶囊 Widget UI 与交互 (✨ 左上角极简延伸版)
    // ==============================================================================
    const AudioUI = {
        init: function() {
            const shadow = window.parent.AptSystem.shadowRoot;
            const $ = window.parent.jQuery;

            if (shadow.getElementById('apt-audio-pill')) return;

            // 极简胶囊样式
            const style = `
            .apt-audio-pill {
                position: absolute; 
                top: 90px; /* 👈 这里控制高度，假设 MVU 面板在最左上角，它紧贴在 MVU 面板下方 */
                left: 20px; /* 👈 这里控制靠左的边距，与 MVU 面板对齐 */
                width: 240px;
                background: rgba(255, 255, 255, 0.75); 
                backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--apt-border); 
                border-radius: 16px;
                padding: 10px 14px;
                display: flex; 
                align-items: center; 
                gap: 12px;
                box-shadow: 0 8px 20px var(--apt-shadow);
                z-index: 400;
                font-family: inherit;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            :host(.dark-theme) .apt-audio-pill { background: rgba(24, 24, 27, 0.75); }
            .apt-audio-pill:hover { box-shadow: 0 12px 25px var(--apt-shadow); transform: translateY(-2px); }

            /* 黑胶唱片小图标 */
            .aa-pill-cover {
                width: 32px; height: 32px;
                border-radius: 50%;
                background: #111;
                display: flex; align-items: center; justify-content: center;
                font-size: 14px;
                border: 2px solid #333;
                animation: aaSpin 4s linear infinite;
                animation-play-state: paused;
                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                cursor: pointer;
            }
            .aa-pill-cover.playing { animation-play-state: running; }
            @keyframes aaSpin { to { transform: rotate(360deg); } }

            /* 歌曲信息 */
            .aa-pill-info { flex: 1; overflow: hidden; cursor: pointer; }
            .aa-pill-title { font-size: 13px; font-weight: 800; color: var(--apt-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
            .aa-pill-sub { font-size: 10px; color: var(--apt-text-sub); display: flex; align-items: center; gap: 4px;}
            
            /* 控制按钮 */
            .aa-pill-btn {
                background: transparent; border: none;
                color: var(--apt-text-main);
                font-size: 16px;
                cursor: pointer;
                padding: 4px;
                opacity: 0.7; transition: 0.2s;
                outline: none;
            }
            .aa-pill-btn:hover { opacity: 1; color: var(--apt-accent); transform: scale(1.1); }

            /* 隐藏的下拉频道列表 */
            .aa-dropdown {
                position: absolute;
                top: calc(100% + 10px); left: 0; width: 100%;
                background: var(--apt-bg-surface);
                border: 1px solid var(--apt-border);
                border-radius: 12px;
                box-shadow: 0 10px 30px var(--apt-shadow);
                padding: 8px;
                display: flex; flex-direction: column; gap: 4px;
                opacity: 0; visibility: hidden; transform: translateY(-10px);
                transition: all 0.2s;
                max-height: 250px; overflow-y: auto;
            }
            .aa-dropdown.show { opacity: 1; visibility: visible; transform: translateY(0); }
            
            .aa-drop-item {
                display: flex; align-items: center; gap: 10px;
                padding: 8px 10px; border-radius: 8px; cursor: pointer;
                transition: 0.2s; border: 1px solid transparent;
            }
            .aa-drop-item:hover { background: var(--apt-bg-input); }
            .aa-drop-item.playing { border-color: var(--apt-accent); background: rgba(180, 140, 82, 0.1); }
            .aa-drop-name { font-size: 12px; font-weight: 700; color: var(--apt-text-main); }
            
            /* 进度条底边 */
            .aa-pill-progress { position: absolute; bottom: 0; left: 10px; right: 10px; height: 2px; background: transparent; overflow: hidden; border-radius: 2px; }
            .aa-pill-fill { height: 100%; background: var(--apt-accent); width: 0%; transition: width 0.1s linear; opacity: 0.8;}
            `;
            $('<style>').text(style).appendTo(shadow);

            const html = `
            <div id="apt-audio-pill" class="apt-audio-pill">
                <div class="aa-pill-cover" id="aa-pill-cover" title="点击强制呼叫 AI 重新匹配环境">📻</div>
                
                <div class="aa-pill-info" id="aa-pill-info" title="点击展开所有电台频道">
                    <div class="aa-pill-title" id="aa-pill-title">智能电台就绪</div>
                    <div class="aa-pill-sub" id="aa-pill-sub">
                        <span id="aa-env-emoji" style="font-size:10px;">☁️</span>
                        <span id="aa-env-text">环境监听中...</span>
                    </div>
                </div>

                <button class="aa-pill-btn" id="aa-pill-play">▶</button>

                <div class="aa-pill-progress"><div class="aa-pill-fill" id="aa-pill-prog"></div></div>

                <div class="aa-dropdown" id="aa-pill-dropdown"></div>
            </div>`;
            $(shadow).find('#apt-main-frame').append(html);

            this.bindEvents($);
            this.renderDropdown();
        },

        bindEvents: function($) {
            const shadow = window.parent.AptSystem.shadowRoot;
            
            // 点击黑胶封面：强制 AI 根据环境切歌
            $(shadow).find('#aa-pill-cover').click(() => {
                $(shadow).find('#aa-pill-cover').css('transform', 'scale(0.9)');
                setTimeout(() => $(shadow).find('#aa-pill-cover').css('transform', 'scale(1)'), 150);
                AudioCore.currentMode = 'immersive';
                AudioCore.triggerAutoDJ();
            });

            // 点击信息区：展开/收起下拉频道列表
            $(shadow).find('#aa-pill-info').click(() => {
                $(shadow).find('#aa-pill-dropdown').toggleClass('show');
            });

            // 点击播放/暂停
            $(shadow).find('#aa-pill-play').click(() => AudioCore.togglePlay());

            // 点击外部自动收起下拉列表
            $(shadow).find('#apt-main-frame').on('mousedown', function(e) {
                if (!$(e.target).closest('#apt-audio-pill').length) {
                    $(shadow).find('#aa-pill-dropdown').removeClass('show');
                }
            });
        },

        renderDropdown: function() {
            const shadow = window.parent.AptSystem.shadowRoot;
            const $ = window.parent.jQuery;
            const $list = $(shadow).find('#aa-pill-dropdown').empty();

            AudioCore.radioLibrary.forEach(s => {
                const $item = $(`
                    <div class="aa-drop-item" data-id="${s.id}">
                        <div style="font-size:14px;">${s.cover}</div>
                        <div class="aa-drop-name">${s.name}</div>
                    </div>
                `);
                $item.click(() => {
                    AudioCore.currentMode = 'manual'; // 手动点歌切换为手动模式
                    AudioCore.playSong(s);
                    $(shadow).find('#aa-pill-dropdown').removeClass('show');
                });
                $list.append($item);
            });
        },

        updatePlayerState: function() {
            const shadow = window.parent.AptSystem.shadowRoot;
            const $ = window.parent.jQuery;
            
            if (AudioCore.currentSong) {
                $(shadow).find('#aa-pill-title').text(AudioCore.currentSong.name);
                $(shadow).find('#aa-pill-cover').text(AudioCore.currentSong.cover);
                
                $(shadow).find('.aa-drop-item').removeClass('playing');
                $(shadow).find(`.aa-drop-item[data-id="${AudioCore.currentSong.id}"]`).addClass('playing');
            }
            
            if (AudioCore.isPlaying) {
                $(shadow).find('#aa-pill-play').html('<b>||</b>');
                $(shadow).find('#aa-pill-cover').addClass('playing');
            } else {
                $(shadow).find('#aa-pill-play').html('▶');
                $(shadow).find('#aa-pill-cover').removeClass('playing');
            }
        },

        updateProgress: function() {
            if (!AudioCore.audioEl) return;
            const pct = (AudioCore.audioEl.currentTime / AudioCore.audioEl.duration) * 100 || 0;
            window.parent.jQuery(window.parent.AptSystem.shadowRoot).find('#aa-pill-prog').css('width', `${pct}%`);
        },

        updateEnvDisplay: function(weather, time) {
            const shadow = window.parent.AptSystem.shadowRoot;
            let icon = '☁️';
            if (weather.includes('雨')) icon = '🌧️';
            else if (weather.includes('雪')) icon = '🌨️';
            else if (weather.includes('晴')) icon = '☀️';
            else if (time.includes('夜') || time.includes('晚')) icon = '🌙';

            window.parent.jQuery(shadow).find('#aa-env-emoji').text(icon);
            window.parent.jQuery(shadow).find('#aa-env-text').text(`${weather} · ${time}`);
        }
    };

    // ==============================================================================
    // 3. 注册与初始化 (不再挂载到 Dock 栏，直接常驻左上角)
    // ==============================================================================
    function registerToOS() {
        const AptSystem = window.parent.AptSystem;
        if (!AptSystem || !AptSystem.registerModule) {
            setTimeout(registerToOS, 500);
            return;
        }

        // 直接初始化 UI 和 核心，不需要再等玩家去 Dock 栏点击了
        AudioUI.init();
        AudioCore.init();

        // 如果想让它一启动就嗅探环境并准备好，可以解除下面这行的注释
        // AudioCore.checkEnvironment();

        AptSystem.log('📻 Apt-Radio 穹顶胶囊版已挂载至左上角', 'success');
    }

    registerToOS();

})();