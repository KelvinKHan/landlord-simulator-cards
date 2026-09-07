(function () {
    'use strict';

    /** =========================================================
     * 【常量与系统配置】
     * ========================================================= */
    const APP_ID = 'apt-news';
    const APP_NAME = '海湾时报';
    const APP_ICON = '📰';

    const DEFAULT_PROMPT = `你是一家名为《海湾时报》的高级报社编辑。根据提供的游戏世界状态和最近截获的秘密线索，生成3-4条本地新闻或逸闻。
要求：文风优雅、略带轻奢和小资情调。如果收到了【特供线索】，请务必用隐晦、高级、旁敲侧击的手法将其改编为八卦或社会新闻，严禁生硬照搬原文。
【强制要求】必须严格返回JSON格式，不要包含任何markdown代码块（如\`\`\`json），不要输出任何废话。格式：
{"headlines": [{"tag": "头版/本地/八卦/财经/天气", "title": "吸睛标题", "summary": "20字左右优雅摘要", "source": "海湾时报"}]}`;

    /** =========================================================
     * 【核心状态与守护进程】
     * 负责数据获取、状态管理、大模型调度及自动监听
     * ========================================================= */
    const BayNewsDaemon = {
        lastKnownDate: null, 
        currentChatId: null,
        newsData: { headlines: [], lastUpdate: null },
        isGenerating: false, // 新增：全局排版状态锁

        getChatId: function () {
            try {
                const ctx = window.parent.SillyTavern?.getContext?.();
                if (ctx?.getCurrentChatId) return String(ctx.getCurrentChatId());
                if (ctx?.chatId) return String(ctx.chatId);
            } catch (e) {} 
            return 'default';
        },

        getStorageKey: function (suffix) { 
            return `apt_news_${this.getChatId()}_${suffix}`; 
        },

        getGameState: function () {
            try {
                const Mvu = window.parent.Mvu;
                if (Mvu && typeof Mvu.getMvuData === 'function') {
                    const targetId = typeof window.parent.getLastMessageId === 'function' ? window.parent.getLastMessageId() : 'latest';
                    return Mvu.getMvuData({ type: 'message', message_id: targetId })?.stat_data || null;
                }
            } catch (e) {} 
            return null;
        },
        
        getRecentChatContext: function (rounds = 10, extractTagsStr = 'content') {
            try {
                const ctx = window.parent.SillyTavern?.getContext?.();
                if (!ctx || !ctx.chat) return '';
                if (rounds <= 0) return ''; 
                
                const tags = extractTagsStr.split(/[,，]/).map(t => t.trim()).filter(t => t);
                if (tags.length === 0) tags.push('content');
                
                const tagPattern = tags.join('|');
                const regex = new RegExp(`(?:<|&lt;)(${tagPattern})(?:>|&gt;)([\\s\\S]*?)(?:<|&lt;)\\/\\1(?:>|&gt;)`, 'gi');

                let extractedTexts = [];
                let checkedRounds = 0;
                
                for (let i = ctx.chat.length - 1; i >= 0 && checkedRounds < rounds; i--) {
                    const msg = ctx.chat[i];
                    if (msg?.mes) {
                        checkedRounds++;
                        let match;
                        while ((match = regex.exec(msg.mes)) !== null) {
                            if (match[2].trim()) {
                                extractedTexts.unshift(`[线索-${match[1]}]：${match[2].trim()}`);
                            }
                        }
                    }
                }
                
                if (extractedTexts.length === 0) return '';
                return extractedTexts.join('\n');
            } catch (e) { return ''; }
        },

        saveToSillyTavern: function () {
            try {
                const newsText = this.newsData.headlines.map(n => `【${n.tag}】${n.title}：${n.summary}`).join('\\n');
                const cmd = `/setvar key=phone_news ${newsText}`;
                const ctx = window.parent.SillyTavern?.getContext?.();
                if (ctx?.executeSlashCommands) ctx.executeSlashCommands(cmd);
                else if (window.parent.executeSlashCommands) window.parent.executeSlashCommands(cmd);
                
                localStorage.setItem(this.getStorageKey('data'), JSON.stringify({ headlines: this.newsData.headlines, lastUpdate: this.newsData.lastUpdate }));
            } catch (e) { 
                window.parent.AptSystem.log(`报社存档写入失败: ${e.message}`, 'error'); 
            }
        },

        triggerGeneration: function (isAuto = true) {
            if (this.isGenerating) return;
            const AptSystem = window.parent.AptSystem;
            if (!AptSystem || !AptSystem.Scheduler) {
                if (!isAuto) AptSystem?.showNotification?.('调度器未就绪！', 'warning'); 
                return; 
            }

            const settings = AptSystem.getSettings();
            if (!settings.apiConfig.apiKey) {
                if (!isAuto) AptSystem.showNotification('请先在控制面板配置底层 API KEY！', 'error'); 
                return; 
            }

            const newsConfig = settings.newsConfig || { autoGen: true, prompt: DEFAULT_PROMPT };
            if (isAuto && String(newsConfig.autoGen) === 'false') {
                AptSystem.log('报社自动派发已关闭，跳过生成', 'info');
                return;
            }

            this.isGenerating = true;
            syncLoadingState();
            AptSystem.Scheduler.addTask({
                type: AptSystem.Scheduler.TYPES?.NEWS || 'news', 
                name: '撰写海湾时报',
                key: 'bay-news',
                onSettled: () => { this.isGenerating = false; syncLoadingState(); },
                priority: isAuto ? (AptSystem.Scheduler.PRIORITY?.NORMAL || 2) : (AptSystem.Scheduler.PRIORITY?.HIGH || 1),
                execute: async () => {
                    this.isGenerating = true; // 锁定生成状态
                    syncLoadingState();       // 状态驱动 UI 更新

                    try {
                        AptSystem.log('报社编辑部开始排版...', 'info');
                        const state = this.getGameState();
                        const newsConfig = settings.newsConfig || { prompt: DEFAULT_PROMPT, incState: true, extractTag: 'content', chatRounds: 10 };
                        const sysPrompt = newsConfig.prompt || DEFAULT_PROMPT;
                        
                        let promptBase = '当前是一个高级公寓房东模拟游戏。\n';
                        
                        if (newsConfig.incState !== false && state) {
                            promptBase += `当前宏观世界状态：日期 ${state.世界?.日期||'未知'}，天气 ${state.世界?.天气||'未知'}。公寓：${state.公寓?.名称||'未知'}。\n`;
                            if (state.租客列表 && Object.keys(state.租客列表).length > 0) {
                                promptBase += `当前在住租客名单：${Object.keys(state.租客列表).join('、')}。\n`;
                            }
                        }
                        
                        const targetRounds = newsConfig.chatRounds !== undefined ? parseInt(newsConfig.chatRounds) : 10;
                        const customTags = newsConfig.extractTag || 'content';
                        const contextBlocks = this.getRecentChatContext(targetRounds, customTags);
                        
                        if (contextBlocks) {
                            promptBase += `\n以下是近期截获的【特供线索/秘密行动】：\n${contextBlocks}\n\n【重要排版指令】：请主编务必将上述线索巧妙地融入本期的新闻或八卦栏目中，务必保持文风的轻奢与优雅，采用隐喻或旁敲侧击的手法，严禁生硬照搬原文。\n`;
                        } else {
                            promptBase += `\n本期暂无特供线索。请主编完全基于当前的世界状态和游戏背景，发挥想象力，撰写几篇符合本地风情的新闻或八卦。\n`;
                        }

                        if (!isAuto) AptSystem.log(`本次查水表：发现线索 ${contextBlocks ? '✅已捕获' : '❌空'}`, 'info');

                        const result = await AptSystem.callExternalAPI([
                            { role: 'system', content: sysPrompt }, 
                            { role: 'user', content: promptBase + '\\n请排版今日报纸内容。' }
                        ]);

                        let parsed = null;
                        try { 
                            let cleanStr = result.replace(/```json/gi, '').replace(/```/g, '').trim();
                            const match = cleanStr.match(/\{[\s\S]*\}/);
                            if (match) cleanStr = match[0];
                            parsed = JSON.parse(cleanStr); 
                        } catch(e) { throw new Error('AI返回了无法解析的格式'); }

                        if (parsed && parsed.headlines) {
                            this.newsData.headlines = parsed.headlines;
                            this.newsData.lastUpdate = new Date();
                            this.saveToSillyTavern();
                            if (state?.世界?.日期) localStorage.setItem(this.getStorageKey('last_date'), state.世界.日期);
                            
                            AptSystem.emit('news-updated', this.newsData);
                            
                            const $ = window.parent.jQuery;
                            const mainFrame = $(AptSystem.shadowRoot).find('#apt-main-frame');
                            
                            if (mainFrame.hasClass('active')) {
                                AptSystem.showNotification('《海湾时报》最新期刊已送达！', 'success');
                            } else {
                                $(AptSystem.shadowRoot).find('#apt-news-floater').addClass('show');
                                AptSystem.log('报纸已悄悄投递到屏幕左侧', 'success');
                            }
                            
                            AptSystem.log('报纸排版完成并已分发', 'info');
                        }
                    } catch (err) {
                        AptSystem.showNotification(`报社排版错误: ${err.message}`, 'error');
                        AptSystem.emit('news-generation-failed');
                        throw err;
                    }
                }
            });
        },

        checkDate: function () {
            const chatId = this.getChatId();
            if (chatId !== this.currentChatId) {
                this.currentChatId = chatId;
                const saved = localStorage.getItem(this.getStorageKey('data'));
                if (saved) this.newsData = JSON.parse(saved);
                else this.newsData = { headlines: [], lastUpdate: null };
                window.parent.AptSystem?.emit('news-updated', this.newsData);
                return;
            }
            const state = this.getGameState();
            if (!state || !state.世界 || !state.世界.日期) return;
            const curDate = state.世界.日期;
            const savedDate = localStorage.getItem(this.getStorageKey('last_date'));

            if (curDate !== this.lastKnownDate) {
                this.lastKnownDate = curDate;
                if (savedDate !== curDate) {
                    window.parent.AptSystem?.log(`日期更替检测：${curDate}，通知报社...`, 'info');
                    this.triggerGeneration(true);
                }
            }
        },

        start: function() {
            this.checkDate();
            setInterval(() => this.checkDate(), 15000);
            
            if (window.parent.eventOn && !window.parent._aptNewsChatListened) {
                window.parent.eventOn('message_received', () => setTimeout(() => this.checkDate(), 2000));
                window.parent.eventOn('chat_id_changed', () => setTimeout(() => this.checkDate(), 500));
                window.parent.eventOn('chatLoaded', () => setTimeout(() => this.checkDate(), 500));
                window.parent._aptNewsChatListened = true;
            }
        }
    };

    /** =========================================================
     * 【UI 样式定义】
     * ========================================================= */
    const newsStyles = `
    :host { --news-font-serif: 'Noto Serif SC', 'Songti SC', 'STZhongsong', 'SimSun', 'Georgia', serif; }
    .apt-news-box { background: var(--apt-bg-surface) !important; border: 1px solid var(--apt-border) !important; color: var(--apt-text-main) !important; box-shadow: 0 20px 50px var(--apt-shadow) !important; }
    .news-close-x { z-index: 10001; top: 18px; right: 20px; background: transparent; color: var(--apt-text-muted); font-size: 28px; transition: 0.2s; }
    .news-close-x:hover { color: var(--apt-accent); background: transparent; transform: rotate(90deg) scale(1.1); }
    .news-header-brand { text-align: center; padding: 30px 20px 15px; border-bottom: 3px double var(--apt-border-focus); margin: 0 30px; position: relative; }
    .news-brand-title { font-family: var(--news-font-serif) !important; font-size: 34px; font-weight: 900; color: var(--apt-text-main); letter-spacing: 2px; margin-bottom: 8px; }
    .news-brand-sub { font-family: var(--news-font-serif) !important; font-size: 11px; color: var(--apt-text-sub); text-transform: uppercase; letter-spacing: 3px; font-weight: bold; }
    
    .news-refresh-btn { position: absolute; right: 0; bottom: 15px; background: var(--apt-bg-input); border: 1px solid var(--apt-border-focus); color: var(--apt-accent); padding: 4px 12px; border-radius: 20px; font-size: 11px; cursor: pointer; transition: 0.2s; font-weight: bold; letter-spacing: 1px; }
    .news-refresh-btn:hover:not(:disabled) { background: var(--apt-accent); color: #fff; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(180,140,82,0.3); }
    
    .news-content-area { padding: 25px 30px; overflow-y: auto; height: 100%; display: flex; flex-direction: column; gap: 25px; position: relative; }
    .news-article { background: transparent; position: relative; padding-bottom: 25px; border-bottom: 1px dashed var(--apt-border); }
    .news-article:last-child { border-bottom: none; }
    
    .news-tag { display: inline-block; border: 1px solid var(--apt-border-focus); color: var(--apt-accent); padding: 2px 8px; font-size: 10px; font-weight: bold; letter-spacing: 2px; margin-bottom: 12px; border-radius: 4px; }
    .news-title { font-family: var(--news-font-serif) !important; font-size: 21px; font-weight: 900; color: var(--apt-text-main); margin-bottom: 12px; line-height: 1.35; letter-spacing: 0.5px; }
    .news-summary { font-family: var(--news-font-serif) !important; font-size: 15px; color: var(--apt-text-sub); line-height: 1.8; text-align: justify; }
    .news-drop-cap { float: left; font-family: var(--news-font-serif) !important; font-size: 42px; line-height: 38px; padding-top: 4px; padding-right: 8px; color: var(--apt-accent); font-weight: bold; }
    .news-empty { text-align: center; padding: 60px 20px; color: var(--apt-text-muted); font-family: var(--news-font-serif) !important; font-size: 16px; font-style: italic; }
    
    .news-skeleton-mask { position: absolute; inset: 0; background: var(--apt-bg-surface); opacity: 0.85; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(4px); animation: pulseMask 1.5s infinite alternate; border-radius: 16px; }
    @keyframes pulseMask { from { opacity: 0.7; } to { opacity: 0.95; } }
    .news-loader-spinner { width: 40px; height: 40px; border: 3px solid var(--apt-border); border-top-color: var(--apt-accent); border-radius: 50%; animation: aptSpin 1s linear infinite; }
    @keyframes aptSpin { to { transform: rotate(360deg); } }
    @keyframes newsFadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
    .news-article { animation: newsFadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
    
    input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none !important; margin: 0 !important; }
    input[type="number"] { -moz-appearance: textfield !important; }
    .custom-num-wrapper { display: flex; align-items: center; width: 100%; background: var(--apt-bg-input); border: 1px solid var(--apt-border); border-radius: 8px; overflow: hidden; transition: all 0.2s; }
    .custom-num-wrapper:focus-within { border-color: var(--apt-accent); box-shadow: 0 0 0 3px rgba(180, 140, 82, 0.1); }
    .custom-num-wrapper input { flex: 1; border: none !important; background: transparent !important; box-shadow: none !important; text-align: center; font-size: 15px; font-weight: bold; color: var(--apt-text-main); }
    .custom-num-wrapper input:focus { box-shadow: none !important; }
    .custom-num-btn { background: transparent; border: none; color: var(--apt-text-sub); font-size: 18px; width: 44px; height: 44px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
    .custom-num-btn:hover { background: var(--apt-border); color: var(--apt-accent); font-weight: bold; }
     
    .apt-news-floater { position: fixed; left: 0; top: 35%; background: var(--paper-bg, #fdfbf7); border: 2px solid var(--paper-border, #3e3a35); border-left: none; border-radius: 0 16px 16px 0; padding: 12px 15px 12px 10px; box-shadow: 5px 5px 20px rgba(0,0,0,0.15); cursor: pointer; z-index: 9999999; display: flex; flex-direction: column; align-items: center; transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); transform: translateX(-100%); }
    :host(.dark-theme) .apt-news-floater { background: var(--paper-bg, #1a1918); border-color: var(--paper-border, #5c564d); box-shadow: 5px 5px 20px rgba(0,0,0,0.6); }
    .apt-news-floater.show { transform: translateX(0); }
    .apt-news-floater:hover { padding-left: 20px; background: var(--paper-accent, #8b2500); color: #fff; }
    .apt-news-floater-icon { font-size: 26px; margin-bottom: 6px; animation: aptNewsSwing 2s infinite ease-in-out; }
    .apt-news-floater-text { font-size: 11px; font-family: var(--news-font-sans, sans-serif); font-weight: 900; letter-spacing: 2px; writing-mode: vertical-lr; text-transform: uppercase; }
    .apt-news-floater-badge { position: absolute; top: -6px; right: -6px; background: #ef4444; color: white; font-size: 10px; font-family: sans-serif; font-weight: bold; padding: 2px 6px; border-radius: 10px; box-shadow: 0 2px 5px rgba(239, 68, 68, 0.4); animation: aptNewsPulse 1.5s infinite; }
    @keyframes aptNewsSwing { 20% { transform: rotate(15deg); } 40% { transform: rotate(-10deg); } 60% { transform: rotate(5deg); } 80% { transform: rotate(-5deg); } 100% { transform: rotate(0deg); } }
    @keyframes aptNewsPulse { 0% { transform: scale(1); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
    `;

    /** =========================================================
     * 【DOM 渲染与交互绑定】
     * ========================================================= */
    function initHTML() {
        const AptSystem = window.parent.AptSystem;
        const shadow = AptSystem.shadowRoot;
        const $ = window.parent.jQuery;
        
        if (!shadow.getElementById('apt-news-styles')) $('<style>').attr('id', 'apt-news-styles').text(newsStyles).appendTo(shadow);

        const modalHTML = `
        <div id="modal-apt-news" class="modal-overlay">
            <div class="modal-box apt-news-box" style="width: 90%; max-width: 550px; height: 80vh; max-height: 800px; padding: 0;">
                <button class="close-modal-btn news-close-x" title="关闭报纸">×</button>
                <div class="news-header-brand">
                    <div class="news-brand-title">THE BAY TIMES</div>
                    <div class="news-brand-sub">落日与海湾 · 实时资讯</div>
                    <button class="news-refresh-btn" id="btn-force-news">🗞️ 催更</button>
                </div>
                <div class="news-content-area" id="news-list-container"></div>
            </div>
        </div>`;

        const oldModal = shadow.getElementById('modal-apt-news');
        if (oldModal) oldModal.remove();

        $(shadow).find('#apt-main-frame').append(modalHTML);
        
        // 绑定基础关闭/遮罩点击事件
        $(shadow).find('.news-close-x').click(function() { $(this).closest('.modal-overlay').removeClass('open'); });
        $(shadow).find('#modal-apt-news').on('mousedown', function(e) { if (e.target === this) $(this).find('.close-modal-btn').click(); });

        // 手动催更
        $(shadow).find('#btn-force-news').click(function() {
            if (BayNewsDaemon.isGenerating) return; // 防连击
            BayNewsDaemon.triggerGeneration(false);
        });
        
        // 报童悬浮窗
        if (!shadow.getElementById('apt-news-floater')) {
            const floaterHTML = `
            <div id="apt-news-floater" class="apt-news-floater" title="点击阅读新报纸">
                <div class="apt-news-floater-badge">NEW</div>
                <div class="apt-news-floater-icon">🗞️</div>
                <div class="apt-news-floater-text">海湾时报</div>
            </div>`;
            $(shadow).append(floaterHTML);
        }

        $(shadow).find('#apt-news-floater').off('click').on('click', function() {
            $(this).removeClass('show');
            const mainFrame = $(shadow).find('#apt-main-frame');
            if (!mainFrame.hasClass('active')) mainFrame.addClass('active');
            AptSystem.emit('open-module', APP_ID);
        });
    }

    /** * 核心：负责基于 isGenerating 状态自动同步 UI（遮罩和按钮防抖）
     */
    function syncLoadingState() {
        const AptSystem = window.parent.AptSystem;
        if (!AptSystem || !AptSystem.shadowRoot) return;
        
        const $ = window.parent.jQuery;
        const shadow = AptSystem.shadowRoot;
        const container = $(shadow).find('.apt-news-box');
        const btn = $(shadow).find('#btn-force-news');
        
        if (BayNewsDaemon.isGenerating) {
            // 锁定按钮并挂载遮罩
            if (btn.length) btn.prop('disabled', true).html('采风中...').css({'opacity': '0.6', 'cursor': 'not-allowed'});
            if (container.length && !$(shadow).find('#news-loading-mask').length) {
                container.append(`
                    <div class="news-skeleton-mask" id="news-loading-mask">
                        <div class="news-loader-spinner"></div>
                        <div style="margin-top: 15px; font-weight: bold; color: var(--apt-text-muted); font-family: var(--news-font-serif);">主编正在疯狂排版中...</div>
                    </div>
                `);
            }
        } else {
            // 释放按钮并移除遮罩
            if (btn.length) btn.prop('disabled', false).html('🗞️ 催更').css({'opacity': '1', 'cursor': 'pointer'});
            $(shadow).find('#news-loading-mask').fadeOut(300, function() { $(this).remove(); });
        }
    }

    function renderNews() {
        const AptSystem = window.parent.AptSystem;
        const shadow = AptSystem.shadowRoot;
        const $ = window.parent.jQuery;
        
        const container = $(shadow).find('#news-list-container').empty();
        const data = BayNewsDaemon.newsData;
        
        if (!data || !data.headlines || data.headlines.length === 0) {
            container.html(`<div class="news-empty">—— 今日海湾风平浪静，暂无逸闻 ——<br><br><span style="font-size:12px; opacity:0.6;">点击右上角催更报社获取最新资讯</span></div>`);
            return;
        }

        data.headlines.forEach((news, index) => {
            const summaryStr = news.summary || '';
            const firstChar = summaryStr.charAt(0);
            const restStr = summaryStr.slice(1);
            const animDelay = index * 0.15; 
            
           container.append(`
                <div class="news-article" style="animation-delay: ${animDelay}s;">
                    <div class="news-tag">${news.tag || '时讯'}</div>
                    <div class="news-title">${news.title}</div>
                    <div class="news-summary">
                        ${firstChar ? `<span class="news-drop-cap">${firstChar}</span>` : ''}${restStr}
                    </div>
                </div>
            `);
        });
    }

    /** =========================================================
     * 【设置面板挂载】
     * ========================================================= */
    function registerSettingsPane() {
        const AptSystem = window.parent.AptSystem;
        if (!AptSystem || !AptSystem.registerSettingsPage) return;

        AptSystem.registerSettingsPage({
            id: 'news-config',
            title: '报社配置',
            render: () => {
                const settings = AptSystem.getSettings().newsConfig || { 
                    autoGen: true, prompt: DEFAULT_PROMPT, 
                    incState: true, extractTag: 'content', chatRounds: 10 
                };
                const isAuto = String(settings.autoGen) === 'false' ? 'false' : 'true';
                
                return `
                <div class="input-group">
                    <label class="input-label">自动更新</label>
                    <select id="setting-news-auto" class="modal-input">
                        <option value="true" ${isAuto === 'true' ? 'selected' : ''}>开启 (游戏日期变更时自动生成)</option>
                        <option value="false" ${isAuto === 'false' ? 'selected' : ''}>关闭 (仅允许手动催更)</option>
                    </select>
                </div>
                
                <div class="input-group">
                    <label class="input-label">MVU变量发送</label>
                    <div style="display:flex; gap:20px; margin-bottom: 12px; padding: 10px; background: var(--apt-bg-input); border-radius: 8px; border: 1px solid var(--apt-border);">
                        <label style="color:var(--apt-text-main); font-size:13px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" id="setting-news-inc-state" ${settings.incState !== false ? 'checked' : ''} style="cursor:pointer; transform:scale(1.2);"> 默认注入宏观世界状态 (包含租客名单)
                        </label>
                    </div>
                </div>

                <div class="input-group">
                    <label class="input-label">正文标签提取 (支持多个，逗号隔开)</label>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="text" id="setting-news-extract-tag" class="modal-input" value="${settings.extractTag || 'content'}" placeholder="例如：content, action, secret">
                    </div>
                    <div style="font-size:11px; color:var(--apt-text-sub); margin-top:8px; line-height: 1.5;">
                        <b>玩法说明：</b>在聊天中用上述标签包裹文本（如 <code>&lt;action&gt;房东断电&lt;/action&gt;</code>），系统会自动拦截并发送给报社。支持中英文逗号隔开多个标签。
                    </div>
                </div>

                <div class="input-group">
                    <label class="input-label">发送轮数</label>
                    <div style="display: flex; flex-direction: row; align-items: center; background: var(--apt-bg-input); border: 1px solid var(--apt-border); border-radius: 8px; overflow: hidden; width: 100%;">
                        <button type="button" class="num-step" data-target="setting-news-chat-rounds" data-step="-1" style="flex: 0 0 44px; height: 44px; background: transparent; border: none; color: var(--apt-text-sub); font-size: 24px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='var(--apt-accent)'" onmouseout="this.style.color='var(--apt-text-sub)'">‹</button>
                        
                        <input type="text" id="setting-news-chat-rounds" min="0" max="50" value="${settings.chatRounds !== undefined ? settings.chatRounds : 10}" style="flex: 1; height: 44px; background: transparent; border: none; text-align: center; font-size: 15px; font-weight: bold; color: var(--apt-text-main); outline: none; box-shadow: none;">
                        
                        <button type="button" class="num-step" data-target="setting-news-chat-rounds" data-step="1" style="flex: 0 0 44px; height: 44px; background: transparent; border: none; color: var(--apt-text-sub); font-size: 24px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='var(--apt-accent)'" onmouseout="this.style.color='var(--apt-text-sub)'">›</button>
                    </div>
                </div>

                <div class="input-group">
                    <label class="input-label">主编指令 (System Prompt)</label>
                    <textarea id="setting-news-prompt" class="modal-input" style="height:150px; resize:vertical; line-height:1.5;">${settings.prompt || DEFAULT_PROMPT}</textarea>
                </div>
                <button id="btn-save-news-settings" class="btn-action" style="margin-top:10px;">保存报社设置</button>
                `;
            }
        });

        AptSystem.on('settings-rendered', () => {
            const $ = window.parent.jQuery;
            const shadow = AptSystem.shadowRoot;

            $(shadow).find('.num-step').off('click').on('click', function() {
                const $input = $(shadow).find('#' + $(this).data('target'));
                let val = parseInt($input.val()) || 0;
                const step = parseInt($(this).data('step'));
                const min = parseInt($input.attr('min')) || 0;
                const max = parseInt($input.attr('max')) || 50;
                
                val += step;
                if (val < min) val = min;
                if (val > max) val = max;
                $input.val(val);
            });
            
            $(shadow).find('#btn-save-news-settings').off('click').on('click', function() {
                const autoGen = $(shadow).find('#setting-news-auto').val() === 'true';
                const prompt = $(shadow).find('#setting-news-prompt').val().trim() || DEFAULT_PROMPT;
                const incState = $(shadow).find('#setting-news-inc-state').is(':checked');
                const extractTag = $(shadow).find('#setting-news-extract-tag').val().trim() || 'content';
                const chatRounds = parseInt($(shadow).find('#setting-news-chat-rounds').val(), 10) || 10;
                
                AptSystem.saveSettings({ newsConfig: { autoGen, prompt, incState, extractTag, chatRounds } });
                AptSystem.showNotification('报社配置已保存并生效！', 'success');
            });
        });
    }

    /** =========================================================
     * 【生命周期：注册与唤醒】
     * ========================================================= */
    function registerToOS() {
        const AptSystem = window.parent.AptSystem;
        if (!AptSystem || !AptSystem.registerModule) {
            setTimeout(registerToOS, 500);
            return;
        }

        AptSystem.registerModule({ id: APP_ID, name: APP_NAME, icon: APP_ICON, order: 3 });

        AptSystem.on('open-module', (id) => {
            if (id === APP_ID) {
                initHTML();     
                renderNews();   
                
                const $ = window.parent.jQuery;
                $(AptSystem.shadowRoot).find('#modal-apt-news').addClass('open');
                $(AptSystem.shadowRoot).find('#apt-news-floater').removeClass('show');

                // 核心改动：打开面板时立刻嗅探全局状态，按需挂载遮罩
                syncLoadingState();
            }
        });

        AptSystem.on('news-updated', () => {
            // 事件回调中仅需渲染新闻，遮罩已经在 triggerGeneration 的 finally 块中被安全移除
            if (window.parent.jQuery(AptSystem.shadowRoot).find('#modal-apt-news').hasClass('open')) {
                renderNews();
            }
        });

        // 挂载控制面版与启动守护进程
        registerSettingsPane();
        BayNewsDaemon.start();
        AptSystem.log('海湾时报 (The Bay Times) 已成功挂载', 'success');
    }

    registerToOS();
})();