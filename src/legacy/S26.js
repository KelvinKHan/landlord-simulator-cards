(function () {
    'use strict';

    /** =========================================================
     * 【常量与系统配置】
     * ========================================================= */
    const APP_ID = 'apt-tenant-analyzer';
    const APP_NAME = '租客档案';
    const APP_ICON = '👤'; 

    /** =========================================================
     * 【提示词与解析引擎】
     * 保持原生逻辑，绝对不可更改
     * ========================================================= */
    const ANALYSIS_PROMPTS = {
        tenantDynamicAnalysis: function(tenantName, baseProfile, lastDynamic, recentChat) {
            return `你是一个角色动态分析专家。请根据角色的本色、上次调色和最近对话，分析角色"${tenantName}"的变化，生成新的"调色"档案。\n\n## 角色本色（固定人设，不会改变）\n${baseProfile || '暂无本色档案'}\n\n## 上次调色（上一次分析的动态人设）\n${lastDynamic || '暂无上次调色，这是第一次分析'}\n\n## 最近对话内容（重点关注与${tenantName}相关的部分）\n${recentChat}\n\n## 分析要求\n根据最近的对话内容，分析"${tenantName}"在以下四个方面可能发生的变化。请写出具体、生动的描述。\n\n## 输出格式\n请直接输出以下格式的内容（每项2-4句话，要具体描述）：\n\n【${tenantName}的近期动态】\n\n行为变化：\n${tenantName}最近[具体描述行为上的变化，包括日常习惯、作息、活动方式等。如无变化则描述当前保持的行为状态]\n\n性格微调：\n${tenantName}在性格上[描述细微的性格变化或当前性格特点的体现，不影响整体人设]\n\n语言风格：\n${tenantName}说话时[描述说话方式、用词习惯、语气的特点或变化]\n\n个人目标：\n${tenantName}目前[描述当前的目标、愿望、关注的事情或追求]\n\n注意：\n- 每项内容必须以"${tenantName}"开头，让读者知道这是谁的档案\n- 每项2-4句话，内容要具体、有细节\n- 要基于对话内容推断，不要凭空捏造\n- 如果对话中没有相关信息，可以根据本色档案描述当前状态\n- 不要使用markdown符号\n- 直接输出内容，不要输出解释文字`;
        },

        parseDynamicContent: function(aiResponse) {
            var content = aiResponse.trim();
            content = content.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '');
            return content;
        }
    };

    const DEFAULT_PROMPT = `你是一个角色动态分析专家。请根据角色的本色、上次调色和最近对话，分析角色的变化，生成新的"调色"档案。`; 

    /** =========================================================
     * 【核心大脑：租客分析守护进程】
     * 负责数据读取、大模型调度、世界书擦写及自动巡检触发
     * ========================================================= */
    const TenantAnalyzer = {
        lastAnalyzedFloor: 0,
        
        getSettings: function() {
            const AptSystem = window.parent.AptSystem;
            return AptSystem.getSettings().tenantConfig || {
                autoGen: true,
                interval: 30,
                extractTag: 'content', 
                prompt: DEFAULT_PROMPT
            };
        },

        getCurrentFloor: function() {
            try {
                const ctx = window.parent.SillyTavern?.getContext?.();
                if (ctx?.chat?.length) return Math.max(0, ctx.chat.length - 1);
            } catch (e) {}
            return 0;
        },

        getRecentChatContext: function (rounds = 30, extractTagsStr = 'content') {
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
                            if (match[2].trim()) extractedTexts.unshift(`[线索-${match[1]}]：${match[2].trim()}`);
                        }
                    }
                }
                return extractedTexts.join('\\n');
            } catch (e) { return ''; }
        },

        getBaseProfile: async function(tenantName) {
            try {
                var loreName = await this.ensureChatLore();
                if (!loreName) return null;
                
                var getWB = (typeof getWorldbook === 'function') ? getWorldbook : window.parent.getWorldbook;
                if (getWB) {
                    var entries = await getWB(loreName);
                    var entry = entries.find(function(e) { return e.name === tenantName; });
                    if (entry) return entry.content;
                }
            } catch (e) { console.error('[租客分析] 获取本色档案失败:', e); }
            return null;
        },

        getDynamicProfile: async function(tenantName) {
            try {
                var loreName = await this.ensureChatLore();
                if (!loreName) return null;
                
                var getWB = (typeof getWorldbook === 'function') ? getWorldbook : window.parent.getWorldbook;
                if (getWB) {
                    var entries = await getWB(loreName);
                    var entry = entries.find(function(e) { return e.name === '[租客动态]' + tenantName; });
                    return entry ? entry.content : null;
                }
            } catch (e) { console.error('[租客分析] 获取动态档案失败:', e); }
            return null;
        },

        ensureChatLore: async function() {
            try {
                if (typeof getOrCreateChatWorldbook === 'function') return await getOrCreateChatWorldbook('current');
                if (typeof getOrCreateChatLorebook === 'function') return await getOrCreateChatLorebook();
                if (window.parent.getOrCreateChatWorldbook) return await window.parent.getOrCreateChatWorldbook('current');
                if (window.parent.getOrCreateChatLorebook) return await window.parent.getOrCreateChatLorebook();
            } catch (e) { console.error('[租客分析] 创建ChatLore失败:', e); }
            return null;
        },

        updateDynamicLore: async function(tenantName, content) {
            try {
                var loreName = await this.ensureChatLore();
                if (!loreName) throw new Error('无法获取ChatLore');
                
                var entryName = '[租客动态]' + tenantName;
                var updateWB = (typeof updateWorldbookWith === 'function') ? updateWorldbookWith : window.parent.updateWorldbookWith;
                if (updateWB) {
                    await updateWB(loreName, function(entries) {
                        var existingIndex = entries.findIndex(function(e) { return e.name === entryName; });
                        var newEntry = {
                            name: entryName, enabled: true, content: content,
                            strategy: { type: 'constant', keys: [tenantName], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
                            position: { type: 'before_character_definition', role: 'system', depth: 4, order: 101 },
                            probability: 100, recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
                            effect: { sticky: null, cooldown: null, delay: null },
                        };
                        
                        if (existingIndex >= 0) entries[existingIndex] = Object.assign({}, entries[existingIndex], newEntry);
                        else entries.push(newEntry);
                        return entries;
                    });
                }
            } catch (e) {
                console.error('[租客分析] 更新动态档案失败:', e);
                throw e;
            }
        },

        getTenantList: function() {
            try {
                const Mvu = window.parent.Mvu;
                if (Mvu && typeof Mvu.getMvuData === 'function') {
                    const data = Mvu.getMvuData({ type: 'message', message_id: 'latest' })?.stat_data;
                    return data?.租客列表 || {};
                }
            } catch (e) {}
            return {};
        },

        addAnalysisTask: function(tenantName, isManual = false) {
            const AptSystem = window.parent.AptSystem;
            if (!AptSystem || !AptSystem.Scheduler) return Promise.resolve(false);

            return new Promise(resolve => AptSystem.Scheduler.addTask({
                onSettled: task => resolve(task.status === 'completed'),
                type: 'tenant_analyze',
                name: '分析租客: ' + tenantName,
                priority: isManual ? 1 : 2,
                execute: async () => { return await this.executeAnalysis(tenantName, isManual); }
            }));
        },

        executeAnalysis: async function(tenantName, isManual) {
            const AptSystem = window.parent.AptSystem;
            AptSystem.log(`[租客档案] 开始分析: ${tenantName}`, 'info');

            try {
                const baseProfile = await this.getBaseProfile(tenantName) || '暂无本色档案';
                const lastDynamic = await this.getDynamicProfile(tenantName) || '暂无上次调色，这是第一次分析';
                
                const settings = this.getSettings();
                const recentChat = this.getRecentChatContext(settings.interval, settings.extractTag);
                
                if (!isManual && (!recentChat || !recentChat.includes(tenantName))) {
                    AptSystem.log(`[租客档案] ${tenantName} 近期无活跃线索，跳过分析。`, 'info');
                    return;
                }

                if (isManual && !recentChat) {
                    AptSystem.showNotification(`未提取到任何带标签的剧情线索，AI 将基于旧档案强行推演`, 'warning');
                }

                const promptFn = ANALYSIS_PROMPTS.tenantDynamicAnalysis;
                const userPrompt = promptFn(tenantName, baseProfile, lastDynamic, recentChat);
                const sysPrompt = settings.prompt;

                const response = await AptSystem.callExternalAPI([{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }]);

                const parseFn = ANALYSIS_PROMPTS.parseDynamicContent;
                const dynamicContent = parseFn(response);

                if (dynamicContent && dynamicContent.length > 20) {
                    await this.updateDynamicLore(tenantName, dynamicContent);
                    AptSystem.showNotification(`[${tenantName}] 的动态档案已更新！`, 'success');
                    AptSystem.log(`[租客档案] ${tenantName} 分析完成。`, 'success');
                    AptSystem.emit('tenant-profile-updated', tenantName);
                } else {
                    throw new Error('AI 返回内容过短或格式异常');
                }
            } catch (error) {
                AptSystem.log(`[租客档案] ${tenantName} 分析失败: ${error.message}`, 'error');
                throw error;
            }
        },

        checkAndTriggerAuto: function() {
            const settings = this.getSettings();
            if (String(settings.autoGen) === 'false') return;

            const currentFloor = this.getCurrentFloor();
            if (currentFloor % 2 !== 0) return;

            const nextTrigger = this.lastAnalyzedFloor + (parseInt(settings.interval) || 30);
            if (currentFloor >= nextTrigger) {
                if (this.analysisBatch) return;
                window.parent.AptSystem?.log(`[租客档案] 触发自动巡检机制 (当前楼层: ${currentFloor})`, 'info');
                
                const tenants = this.getTenantList();
                this.analysisBatch = Promise.all(Object.keys(tenants).map(name => this.addAnalysisTask(name, false)))
                    .then(results => { if (results.every(Boolean)) { landlord.assertCurrent(); this.lastAnalyzedFloor = currentFloor; } })
                    .finally(() => { this.analysisBatch = null; });
                
                const AptSystem = window.parent.AptSystem;
                if (AptSystem && AptSystem.shadowRoot && window.parent.jQuery(AptSystem.shadowRoot).find('#modal-tenant-app').hasClass('open')) {
                    AppUI.renderStatus();
                }
            }
        }
    };

    /** =========================================================
     * 【视觉引擎：UI 交互与渲染层】
     * ========================================================= */
    const AppUI = {
        initHTML: function() {
            const AptSystem = window.parent.AptSystem;
            const shadow = AptSystem.shadowRoot;
            const $ = window.parent.jQuery;

            const oldModal = shadow.getElementById('modal-tenant-app');
            if (oldModal) oldModal.remove();

            const modalHTML = `
            <div id="modal-tenant-app" class="modal-overlay">
                <div class="modal-box" style="width: 90%; max-width: 850px; height: 75vh; max-height: 800px; padding: 0; display:flex; flex-direction:column; background: var(--apt-bg-surface); border: 1px solid var(--apt-border); box-shadow: 0 25px 60px var(--apt-shadow); overflow: hidden; border-radius: 16px;">
                    <button class="close-modal-btn" title="关闭档案" style="z-index: 10;">×</button>
                    
                    <div style="border-bottom: 1px solid var(--apt-border); padding: 25px 30px 20px; display:flex; justify-content: space-between; align-items: flex-end; background: var(--apt-bg-surface); position: relative;">
                        <div style="position: relative; z-index: 2;">
                            <div style="font-family: inherit !important; font-size: 24px; color: var(--apt-text-main); font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 10px;">
                                <span>📂</span> 租客深层档案
                            </div>
                            <div style="font-family: inherit !important; color: var(--apt-text-sub); font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700;">The Bay Profiling System</div>
                        </div>
                        <button id="btn-analyze-all" style="position: relative; z-index: 2; margin-right: 35px; background: linear-gradient(135deg, var(--apt-accent), var(--apt-accent-hover)); color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 6px 15px rgba(180, 140, 82, 0.25); display: flex; align-items: center; gap: 8px; letter-spacing: 1px; outline: none;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                            全员动态分析
                        </button>
                    </div>
                    
                    <div style="display:flex; flex:1; overflow:hidden; background: var(--apt-bg-base);">
                        <div style="width: 260px; background: var(--apt-bg-surface); border-right: 1px solid var(--apt-border); display: flex; flex-direction: column;">
                            <div id="tenant-app-status" style="padding: 16px 20px; border-bottom: 1px solid var(--apt-border); background: rgba(0,0,0,0.02);"></div>
                            <div id="tenant-app-list" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px;"></div>
                        </div>
                        
                        <div style="flex:1; padding: 0; overflow-y: auto; background: var(--apt-bg-base); position: relative; display: flex; flex-direction: column;" id="tenant-app-detail">
                            <div style="margin: auto; text-align:center; color:var(--apt-text-muted); font-size:14px; font-weight:bold; opacity: 0.6;">
                                <div style="font-size: 40px; margin-bottom: 15px;">🗂️</div>
                                请在左侧选择一位租客查看档案
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

            $(shadow).find('#apt-main-frame').append(modalHTML);
            
            $(shadow).find('#modal-tenant-app .close-modal-btn').click(function() { $(this).closest('.modal-overlay').removeClass('open'); });
            $(shadow).find('#modal-tenant-app').on('mousedown', function(e) { if (e.target === this) $(this).find('.close-modal-btn').click(); });

            $(shadow).find('#btn-analyze-all').hover(
                function() { $(this).css({'transform': 'translateY(-2px)', 'box-shadow': '0 8px 20px rgba(180, 140, 82, 0.4)'}); },
                function() { $(this).css({'transform': 'translateY(0)', 'box-shadow': '0 6px 15px rgba(180, 140, 82, 0.25)'}); }
            ).click(function() {
                const tenants = TenantAnalyzer.getTenantList();
                const names = Object.keys(tenants);
                if (names.length === 0) return AptSystem.showNotification('当前没有入住租客！', 'warning');
                
                AptSystem.showNotification('分析指令已下达，AI正在逐个分析...', 'success');
                names.forEach(name => TenantAnalyzer.addAnalysisTask(name, true));
            });
        },

        renderStatus: function() {
            const AptSystem = window.parent.AptSystem;
            const shadow = AptSystem.shadowRoot;
            const $ = window.parent.jQuery;
            const $status = $(shadow).find('#tenant-app-status');
            if (!$status.length) return;

            const settings = TenantAnalyzer.getSettings();
            const isAuto = String(settings.autoGen) !== 'false';
            const currentFloor = TenantAnalyzer.getCurrentFloor();
            const interval = parseInt(settings.interval) || 30;
            const nextTrigger = TenantAnalyzer.lastAnalyzedFloor + interval;

            let html = `<div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                            <span style="font-size: 12px; font-weight: 700; color: var(--apt-text-sub);">当前进展</span>
                            <span style="font-size: 12px; font-weight: 800; color: var(--apt-text-main);">${currentFloor} 轮</span>
                        </div>`;
            
            if (isAuto) {
                const remain = Math.max(0, nextTrigger - currentFloor);
                const progress = Math.min(100, Math.max(0, ((currentFloor - TenantAnalyzer.lastAnalyzedFloor) / interval) * 100));
                html += `<div style="display:flex; justify-content:space-between;">
                            <span style="font-size: 12px; font-weight: 700; color: var(--apt-text-sub);">距下次自动分析</span>
                            <span style="font-size: 12px; font-weight: 800; color: var(--apt-accent);">${remain} 轮</span>
                         </div>
                         <div style="margin-top: 10px; border-radius: 4px; background: var(--apt-border); height: 4px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
                             <div style="height: 100%; background: var(--apt-accent); width: ${progress}%; transition: width 0.3s ease;"></div>
                         </div>`;
            } else {
                html += `<div style="display:flex; justify-content:space-between; opacity: 0.6;">
                            <span style="font-size: 12px; font-weight: 700; color: var(--apt-text-sub);">自动分析</span>
                            <span style="font-size: 12px; font-weight: 800; color: var(--apt-text-muted);">已关闭(仅手动)</span>
                         </div>`;
            }
            $status.html(html);
        },

        renderList: function() {
            const AptSystem = window.parent.AptSystem;
            const shadow = AptSystem.shadowRoot;
            const $ = window.parent.jQuery;
            
            const tenants = TenantAnalyzer.getTenantList();
            const names = Object.keys(tenants);
            const $list = $(shadow).find('#tenant-app-list').empty();

            if (names.length === 0) {
                $list.html('<div style="text-align:center; color:var(--apt-text-muted); padding-top:40px; font-size:12px; font-weight:bold;">暂无入住租客</div>');
                return;
            }

            names.forEach(name => {
                const data = tenants[name];
                const btn = $(`
                    <div class="tenant-list-item" data-name="${name}" style="padding: 16px; background: var(--apt-bg-input); border: 1px solid transparent; border-radius: 12px; cursor: pointer; transition: all 0.2s;">
                        <div style="font-weight: 800; color: var(--apt-text-main); font-size: 15px; margin-bottom: 6px; display:flex; justify-content:space-between; align-items:center;">
                            <span>${name}</span>
                            <span style="font-size: 12px; opacity: 0.5;">👤</span>
                        </div>
                        <div style="font-size: 11px; color: var(--apt-text-sub); font-weight: 600;">${data.职业 || '未知职业'} | <span style="color:var(--apt-accent);">${data.状态 || '游荡中'}</span></div>
                    </div>
                `);
                
                btn.hover(
                    function() { if(!$(this).hasClass('active')) $(this).css({'background': 'var(--apt-bg-surface)', 'border-color': 'var(--apt-border)'}); },
                    function() { if(!$(this).hasClass('active')) $(this).css({'background': 'var(--apt-bg-input)', 'border-color': 'transparent'}); }
                );

                btn.click((e) => {
                    const $all = $(shadow).find('.tenant-list-item');
                    $all.removeClass('active').css({'background': 'var(--apt-bg-input)', 'border-color': 'transparent', 'box-shadow': 'none'});
                    
                    const $curr = $(e.currentTarget);
                    $curr.addClass('active').css({'background': 'var(--apt-bg-surface)', 'border-color': 'var(--apt-accent)', 'box-shadow': '0 4px 12px var(--apt-shadow)'});

                    this.renderDetail(name);
                });

                $list.append(btn);
            });
        },

        renderDetail: async function(tenantName) {
            const AptSystem = window.parent.AptSystem;
            const shadow = AptSystem.shadowRoot;
            const $ = window.parent.jQuery;
            const $detail = $(shadow).find('#tenant-app-detail');

            $detail.html('<div style="text-align:center; padding-top:40%; color:var(--apt-text-muted); font-weight:bold;">档案提档中... <div class="news-loader-spinner" style="margin: 15px auto;"></div></div>');

            try {
                const base = await TenantAnalyzer.getBaseProfile(tenantName) || '暂无本色档案记录。';
                const dynamic = await TenantAnalyzer.getDynamicProfile(tenantName) || '尚未进行过动态分析，请点击右上方按钮进行动态分析。';

                const html = `
                    <div style="padding: 30px; padding-bottom: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
                            <div>
                                <div style="font-size: 26px; font-weight: 900; color: var(--apt-text-main); letter-spacing: 1px; margin-bottom: 4px;">${tenantName}</div>
                                <div style="font-size: 12px; color: var(--apt-text-muted); font-weight: 600;">Subject Profile ID: ${Math.random().toString(36).substr(2, 8).toUpperCase()}</div>
                            </div>
                            <button class="btn-action" id="btn-analyze-single" style="width: auto; padding: 10px 18px; margin: 0; font-size: 13px; background: var(--apt-bg-surface); color: var(--apt-text-main); border: 1px solid var(--apt-border); border-radius: 8px; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 5px var(--apt-shadow); transition: 0.2s;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>
                                刷新侧写
                            </button>
                        </div>
                    </div>
                    
                    <div style="padding: 0 30px 30px 30px; display: flex; flex-direction: column; gap: 20px;">
                        <div style="background: var(--apt-bg-surface); border: 1px solid var(--apt-border); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px var(--apt-shadow);">
                            <div style="padding: 12px 20px; background: var(--apt-bg-input); border-bottom: 1px solid var(--apt-border); font-size: 12px; color: var(--apt-text-sub); font-weight: 800; letter-spacing: 1px; display: flex; align-items: center; gap: 6px;">
                                <span>⬛</span> 固有性格 (Base Profile)
                            </div>
                            <div style="padding: 20px; color: var(--apt-text-main); font-size: 13px; line-height: 1.8; white-space: pre-wrap; font-weight: 500;">${base}</div>
                        </div>

                        <div style="background: var(--apt-bg-surface); border: 1px solid var(--apt-accent); border-radius: 12px; overflow: hidden; box-shadow: 0 8px 20px rgba(180, 140, 82, 0.1);">
                            <div style="padding: 12px 20px; background: rgba(180, 140, 82, 0.1); border-bottom: 1px solid rgba(180, 140, 82, 0.2); font-size: 12px; color: var(--apt-accent); font-weight: 800; letter-spacing: 1px; display: flex; align-items: center; gap: 6px;">
                                <span>🎨</span> 近期心理动态 (Dynamic State)
                            </div>
                            <div style="padding: 20px; color: var(--apt-text-main); font-size: 13px; line-height: 1.8; white-space: pre-wrap; font-weight: 500;">${dynamic}</div>
                        </div>
                    </div>
                `;

                $detail.html(html);

                $detail.find('#btn-analyze-single').hover(
                    function() { $(this).css({'background': 'var(--apt-bg-input)', 'border-color': 'var(--apt-accent)', 'color': 'var(--apt-accent)'}); },
                    function() { $(this).css({'background': 'var(--apt-bg-surface)', 'border-color': 'var(--apt-border)', 'color': 'var(--apt-text-main)'}); }
                ).click(function() {
                    $(this).html('<div class="apt-di-spinner" style="width:12px; height:12px; border-width: 2px;"></div> 侧写中...').prop('disabled', true).css('opacity', 0.5);
                    TenantAnalyzer.addAnalysisTask(tenantName, true);
                    AptSystem.showNotification(`正在对 [${tenantName}] 进行深度分析`, 'info');
                });

            } catch (error) {
                $detail.html(`<div style="color: #ef4444; padding: 30px; text-align:center; font-weight:bold;">提档失败: ${error.message}</div>`);
            }
        }
    };

    /** =========================================================
     * 【控制面板：设置项注册】
     * ========================================================= */
    function registerSettingsPane() {
        const AptSystem = window.parent.AptSystem;
        if (!AptSystem || !AptSystem.registerSettingsPage) return;

        AptSystem.registerSettingsPage({
            id: 'tenant-config',
            title: '租客分析设置',
            render: () => {
                const settings = TenantAnalyzer.getSettings();
                const isAuto = String(settings.autoGen) === 'false' ? 'false' : 'true';
                
                return `
                <div class="input-group">
                    <label class="input-label">自动化监测 (自动在后台分析)</label>
                    <select id="setting-tenant-auto" class="modal-input">
                        <option value="true" ${isAuto === 'true' ? 'selected' : ''}>开启 (达到指定楼层后自动触发)</option>
                        <option value="false" ${isAuto === 'false' ? 'selected' : ''}>关闭 (仅允许手动分析)</option>
                    </select>
                </div>
                
                <div class="input-group">
                    <label class="input-label">触发间隔与追溯轮数 (每 N 楼分析一次，并向上提取 N 楼，建议双数)</label>
                    <div style="display: flex; flex-direction: row; align-items: center; background: var(--apt-bg-input); border: 1px solid var(--apt-border); border-radius: 8px; overflow: hidden; width: 100%;">
                        <button type="button" class="num-step" data-target="setting-tenant-interval" data-step="-2" style="flex: 0 0 44px; height: 44px; background: transparent; border: none; color: var(--apt-text-sub); font-size: 24px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='var(--apt-accent)'" onmouseout="this.style.color='var(--apt-text-sub)'">‹</button>
                        <input type="text" id="setting-tenant-interval" min="4" max="100" value="${settings.interval || 30}" style="flex: 1; height: 44px; background: transparent; border: none; text-align: center; font-size: 15px; font-weight: bold; color: var(--apt-text-main); outline: none; box-shadow: none;">
                        <button type="button" class="num-step" data-target="setting-tenant-interval" data-step="2" style="flex: 0 0 44px; height: 44px; background: transparent; border: none; color: var(--apt-text-sub); font-size: 24px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.color='var(--apt-accent)'" onmouseout="this.style.color='var(--apt-text-sub)'">›</button>
                    </div>
                </div>

                <div class="input-group">
                    <label class="input-label">正文标签提取 (支持多个，逗号隔开)</label>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="text" id="setting-tenant-extract-tag" class="modal-input" value="${settings.extractTag || 'content'}" placeholder="例如：content, action, secret">
                    </div>
                    <div style="font-size:11px; color:var(--apt-text-sub); margin-top:8px; line-height: 1.5;">
                        <b>说明：</b>系统将只扫描带有上述标签的对话记录作为素材。如果对话中没有提到某位租客，则该租客本次跳过分析。
                    </div>
                </div>

                <div class="input-group">
                    <label class="input-label">分析核心指令 (System Prompt)</label>
                    <textarea id="setting-tenant-prompt" class="modal-input" style="height:150px; resize:vertical; line-height:1.5;">${settings.prompt || DEFAULT_PROMPT}</textarea>
                </div>
                <button id="btn-save-tenant-settings" class="btn-action" style="margin-top:10px;">保存分析设置</button>
                `;
            }
        });

        AptSystem.on('settings-rendered', () => {
            const $ = window.parent.jQuery;
            const shadow = AptSystem.shadowRoot;
            
            $(shadow).find('.num-step').off('click.tenant').on('click.tenant', function() {
                const $input = $(shadow).find('#' + $(this).data('target'));
                let val = parseInt($input.val()) || 0;
                const step = parseInt($(this).data('step'));
                const min = parseInt($input.attr('min')) || 4;
                const max = parseInt($input.attr('max')) || 100;
                
                val += step;
                if (val < min) val = min;
                if (val > max) val = max;
                $input.val(val);
            });

            $(shadow).find('#btn-save-tenant-settings').off('click').on('click', function() {
                const autoGen = $(shadow).find('#setting-tenant-auto').val() === 'true';
                const interval = parseInt($(shadow).find('#setting-tenant-interval').val(), 10) || 30;
                const extractTag = $(shadow).find('#setting-tenant-extract-tag').val().trim() || 'content';
                const prompt = $(shadow).find('#setting-tenant-prompt').val().trim() || DEFAULT_PROMPT;
                
                AptSystem.saveSettings({ tenantConfig: { autoGen, interval, extractTag, prompt } });
                AptSystem.showNotification('租客分析配置已保存并生效！', 'success');
                
                if (window.parent.jQuery(shadow).find('#modal-tenant-app').hasClass('open')) {
                    AppUI.renderStatus();
                }
            });
        });
    }

    /** =========================================================
     * 【系统生命周期挂载与事件侦听】
     * ========================================================= */
    function registerToOS() {
        const AptSystem = window.parent.AptSystem;
        if (!AptSystem || !AptSystem.registerModule) {
            setTimeout(registerToOS, 500);
            return;
        }

        AptSystem.registerModule({ id: APP_ID, name: APP_NAME, icon: APP_ICON, order: 4 });

        AptSystem.on('open-module', (id) => {
            if (id === APP_ID) {
                AppUI.initHTML();
                AppUI.renderStatus();
                AppUI.renderList();   
                const $ = window.parent.jQuery;
                $(AptSystem.shadowRoot).find('#modal-tenant-app').addClass('open');
            }
        });

        AptSystem.on('tenant-profile-updated', (tenantName) => {
            const $ = window.parent.jQuery;
            const $modal = $(AptSystem.shadowRoot).find('#modal-tenant-app');
            if ($modal.hasClass('open')) {
                if ($modal.find('#tenant-app-detail').text().includes(tenantName)) {
                    AppUI.renderDetail(tenantName);
                }
            }
        });

        if (typeof window.parent.eventOn === 'function' && !window.parent._aptTenantWatcher) {
            window.parent.eventOn('message_received', () => {
                setTimeout(() => TenantAnalyzer.checkAndTriggerAuto(), 2000);
            });
            window.parent._aptTenantWatcher = true;
        }

        // 挂载核心以便外部（如通讯录）访问基础档案
        window.parent.TenantAnalyzer = TenantAnalyzer;
        AptSystem.log('👤 租客档案引擎已成功挂载...', 'success');
    }

    registerToOS();
    setTimeout(registerSettingsPane, 1000); 

})();