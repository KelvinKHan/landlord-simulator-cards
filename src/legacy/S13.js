// ==================== 租客聊天系统 - 手机APP界面 ====================
// 注册为PhoneSystem的APP，提供群聊和私聊界面
// 依赖：phone_chat_db.js, phone_chat_core.js, phone_main.js

(function () {
    'use strict';

    // ==================== APP 配置 ====================
    const APP_ID = 'tenant_chat';
    const APP_NAME = 'WeChat';
    const APP_ICON = '<img src="https://api.iconify.design/ri:wechat-fill.svg?color=white" style="width:70%;height:70%">';
    const GROUP_NAME = '公寓业主群';

    // ==================== 头像获取函数 ====================
    // 缓存用户头像路径
    let cachedUserAvatarPath = null;
    
    // 获取酒馆用户头像路径（通过SillyTavern API）
    function getUserAvatarPath() {
        // 使用缓存
        if (cachedUserAvatarPath) {
            return cachedUserAvatarPath;
        }
        
        try {
            // 方法1：从父窗口聊天界面的用户消息头像中提取（最可靠）
            if (window.parent.$) {
                const userMsgAvatar = window.parent.$('[is_user="true"] .avatar img').first().attr('src');
                if (userMsgAvatar && userMsgAvatar.length > 0) {
                    console.log('[聊天APP] 从DOM获取头像:', userMsgAvatar);
                    cachedUserAvatarPath = userMsgAvatar;
                    return userMsgAvatar;
                }
            }
            
            // 方法2：从persona面板获取当前选中的头像
            if (window.parent.$) {
                const personaAvatar = window.parent.$('#user_avatar_block .avatar-container.selected img').attr('src');
                if (personaAvatar && personaAvatar.length > 0) {
                    console.log('[聊天APP] 从persona面板获取头像:', personaAvatar);
                    cachedUserAvatarPath = personaAvatar;
                    return personaAvatar;
                }
            }
            
            // 方法3：从用户头像显示区域获取
            if (window.parent.$) {
                const displayAvatar = window.parent.$('#user_avatar img').attr('src');
                if (displayAvatar && displayAvatar.length > 0) {
                    console.log('[聊天APP] 从用户头像显示区获取:', displayAvatar);
                    cachedUserAvatarPath = displayAvatar;
                    return displayAvatar;
                }
            }
        } catch (e) {
            console.warn('[聊天APP] 获取用户头像失败:', e);
        }
        console.log('[聊天APP] 无法获取用户头像，使用默认图标');
        return null;
    }
    
    // 清除头像缓存（在需要刷新时调用）
    function clearAvatarCache() {
        cachedUserAvatarPath = null;
    }

    // ==================== 样式定义 ====================
    const APP_STYLES = `
        .chat-app {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: #ededed;
            font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
            padding-top: 44px; /* 给状态栏留空间 */
            box-sizing: border-box;
            color: #111;
        }

        /* 统一图标样式 */
        .icon-btn {
            width: 24px;
            height: 24px;
            background-repeat: no-repeat;
            background-position: center;
            background-size: contain;
            display: inline-block;
        }

        /* 会话列表页 */
        .chat-list-view {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: #ededed;
        }

        .chat-list-header {
            background: rgba(237, 237, 237, 0.9);
            backdrop-filter: blur(10px);
            padding: 10px 16px;
            display: flex;
            align-items: center;
            position: relative;
            z-index: 10;
            border-bottom: 1px solid rgba(0,0,0,0.1);
            height: 48px;
            box-sizing: border-box;
        }

        .chat-list-back-btn {
            border: none;
            background: none;
            color: #181818;
            cursor: pointer;
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 4px;
            margin-right: 4px;
        }

        .chat-list-title {
            font-size: 17px;
            font-weight: 600;
            color: #181818;
            flex: 1;
            margin-left: 4px;
        }

        .chat-list-actions {
            display: flex;
            gap: 16px;
            margin-left: auto;
            align-items: center;
        }

        .chat-list-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #181818;
            transition: opacity 0.2s;
        }

        .chat-list-btn:hover {
            opacity: 0.7;
        }
        
        .chat-list-btn img {
            width: 22px;
            height: 22px;
        }

        .chat-list {
            flex: 1;
            overflow-y: auto;
            background: #fff;
        }

        .chat-list-item {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            background: #fff;
            cursor: pointer;
            transition: background 0.2s;
            position: relative;
        }
        
        /* 列表分割线 (除了最后一个) */
        .chat-list-item::after {
            content: '';
            position: absolute;
            bottom: 0;
            right: 0;
            left: 76px; /* 头像宽+间距 */
            height: 1px;
            background: #f0f0f0;
            transform: scaleY(0.5);
        }

        .chat-list-item:active {
            background: #f0f0f0;
        }

        .chat-item-avatar {
            width: 48px;
            height: 48px;
            border-radius: 6px;
            background: #e0e0e0; /* 默认灰色 */
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
            flex-shrink: 0;
            overflow: hidden;
        }

        .chat-item-avatar.group {
            background: #07c160;
            color: #fff;
        }
        
        .chat-item-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .chat-item-content {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            height: 48px;
        }

        .chat-item-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        .chat-item-name {
            font-size: 16px;
            font-weight: 500;
            color: #111;
        }

        .chat-item-time {
            font-size: 11px;
            color: #b2b2b2;
            flex-shrink: 0;
        }

        .chat-item-preview {
            font-size: 13px;
            color: #999;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* 聊天界面 */
        .chat-room-view {
            display: flex;
            flex-direction: column;
            height: 100%;
            background: #ededed;
            position: relative;
        }

        .chat-room-header {
            background: rgba(237, 237, 237, 0.9);
            backdrop-filter: blur(10px);
            padding: 10px 12px;
            display: flex;
            align-items: center;
            border-bottom: 1px solid rgba(0,0,0,0.1);
            height: 48px;
            box-sizing: border-box;
            z-index: 10;
        }

        .chat-back-btn {
            border: none;
            background: none;
            cursor: pointer;
            padding: 8px 12px 8px 0;
            display: flex;
            align-items: center;
            color: #181818;
            height: 100%;
        }
        
        .chat-back-btn img {
            width: 24px;
            height: 24px;
        }

        .chat-room-title {
            flex: 1;
            font-size: 17px;
            font-weight: 600;
            text-align: left;
            margin: 0 4px;
            color: #181818;
        }

        .chat-room-info {
            font-size: 12px;
            color: #181818;
            opacity: 0.6;
            margin-left: 4px;
            font-weight: normal;
        }

        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            scroll-behavior: smooth;
        }

        .chat-message {
            display: flex;
            align-items: flex-start;
            max-width: 85%;
        }

        .chat-message.self {
            align-self: flex-end;
            flex-direction: row-reverse;
        }

        .chat-message.other {
            align-self: flex-start;
        }

        .msg-avatar {
            width: 38px;
            height: 38px;
            border-radius: 4px; /* 微信风格圆角 */
            background: #eee;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            overflow: hidden;
        }
        
        .msg-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        /* 替换文字头像为SVG */
        .chat-message.self .msg-avatar {
            margin-left: 10px;
        }

        .chat-message.other .msg-avatar {
            margin-right: 10px;
        }

        .msg-content-wrap {
            display: flex;
            flex-direction: column;
        }

        .chat-message.self .msg-content-wrap {
            align-items: flex-end;
        }

        .msg-sender {
            font-size: 11px;
            color: #999;
            margin-bottom: 4px;
            margin-left: 2px;
        }

        .chat-message.self .msg-sender {
            display: none;
        }

        .msg-bubble {
            background: #fff;
            padding: 10px 14px;
            border-radius: 4px;
            font-size: 15px;
            line-height: 1.5;
            word-break: break-word;
            position: relative;
            box-shadow: 0 1px 1px rgba(0,0,0,0.05);
            color: #111;
        }

        .chat-message.other .msg-bubble::before {
            content: '';
            position: absolute;
            left: -6px;
            top: 14px;
            width: 0;
            height: 0;
            border-top: 6px solid transparent;
            border-bottom: 6px solid transparent;
            border-right: 6px solid #fff;
        }

        .chat-message.self .msg-bubble {
            background: #95ec69; /* 微信绿 */
        }
        
        .chat-message.self .msg-bubble::after {
            content: '';
            position: absolute;
            right: -6px;
            top: 14px;
            width: 0;
            height: 0;
            border-top: 6px solid transparent;
            border-bottom: 6px solid transparent;
            border-left: 6px solid #95ec69;
        }

        .msg-time {
            font-size: 10px;
            color: #d0d0d0; /* 很淡的颜色，不抢眼 */
            margin-top: 4px;
            transform: scale(0.9);
            transform-origin: left top;
        }

        .chat-message.self .msg-time {
            text-align: right;
            transform-origin: right top;
        }

        /* 输入区域 */
        .chat-input-area {
            background: #f7f7f7;
            padding: 10px 12px;
            border-top: 1px solid #dcdcdc;
            display: flex;
            align-items: flex-end;
            gap: 10px;
            min-height: 56px;
            box-sizing: border-box;
        }

        .chat-input {
            flex: 1;
            background: #fff;
            border: none;
            border-radius: 4px;
            padding: 10px;
            font-size: 16px;
            resize: none;
            max-height: 120px;
            min-height: 20px;
            line-height: 1.4;
            outline: none;
            font-family: inherit;
        }

        .chat-send-btn {
            background: #07c160;
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 0 12px;
            height: 36px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 2px;
        }

        .chat-send-btn:hover {
            background: #06ae56;
        }

        .chat-send-btn:disabled {
            background: #e0e0e0;
            color: #aaa;
            cursor: not-allowed;
        }

        /* 加载状态 */
        .typing-indicator {
            display: none;
            align-items: center;
            justify-content: center;
            padding: 8px 16px;
            color: #999;
            font-size: 12px;
            background: transparent;
        }

        .typing-indicator.show {
            display: flex !important;
        }

        .typing-dots {
            display: flex;
            gap: 4px;
            margin-left: 6px;
        }

        .typing-dots span {
            width: 4px;
            height: 4px;
            background: #999;
            border-radius: 50%;
            animation: typing 1.4s infinite ease-in-out both;
        }

        .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
        .typing-dots span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes typing {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }

        /* 设置/导入导出面板 */
        .chat-settings-panel {
            position: absolute;
            top: 44px;
            left: 0;
            right: 0;
            bottom: 0;
            background: #ededed;
            z-index: 20;
            display: flex;
            flex-direction: column;
            animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
        }

        .settings-header {
            background: rgba(237, 237, 237, 0.9);
            backdrop-filter: blur(10px);
            padding: 10px 16px;
            display: flex;
            align-items: center;
            border-bottom: 1px solid rgba(0,0,0,0.1);
            height: 48px;
            box-sizing: border-box;
        }

        .settings-back-btn {
            border: none;
            background: none;
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
        }
        
        .settings-back-btn img {
            width: 24px;
            height: 24px;
        }

        .settings-title {
            flex: 1;
            font-size: 17px;
            font-weight: 600;
            text-align: left;
            margin-left: 12px;
            color: #181818;
        }

        .settings-content {
            flex: 1;
            overflow-y: auto;
            padding: 16px 0;
        }

        .settings-section {
            background: #fff;
            margin-top: 12px;
            border-top: 1px solid #e5e5e5;
            border-bottom: 1px solid #e5e5e5;
        }

        .settings-section:first-child {
            margin-top: 0;
        }

        .settings-section-title {
            font-size: 13px;
            color: #888;
            padding: 8px 16px;
            background: transparent;
            margin-bottom: -1px;
        }

        .settings-item {
            padding: 14px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: relative;
        }
        
        .settings-item:not(:last-child)::after {
            content: '';
            position: absolute;
            bottom: 0;
            right: 0;
            left: 16px;
            height: 1px;
            background: #f0f0f0;
            transform: scaleY(0.5);
        }

        .settings-item-label {
            font-size: 16px;
            color: #000;
        }

        .settings-item-value {
            font-size: 15px;
            color: #888;
        }

        .settings-btn {
            width: 100%;
            padding: 16px;
            background: #fff;
            border: none;
            font-size: 16px;
            color: #576b95;
            cursor: pointer;
            text-align: center;
            position: relative;
        }

        .settings-btn:active {
            background: #f5f5f5;
        }
        
        .settings-btn:not(:last-child)::after {
            content: '';
            position: absolute;
            bottom: 0;
            right: 0;
            left: 16px;
            height: 1px;
            background: #f0f0f0;
            transform: scaleY(0.5);
        }

        .settings-btn.danger {
            color: #fa5151;
        }

        /* 消息撤回按钮（小型灰色按钮，仅在聊天消息区域内显示） */
        .chat-messages .chat-message .msg-retract-btn {
            position: absolute;
            top: 4px;
            width: 12px;
            height: 12px;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            opacity: 0.35;
            transition: opacity 0.15s;
        }

        .chat-messages .chat-message .msg-retract-btn:hover,
        .chat-messages .chat-message .msg-retract-btn:active {
            opacity: 0.8;
        }

        .chat-messages .chat-message .msg-retract-btn img {
            width: 10px;
            height: 10px;
        }

        .chat-messages .chat-message.self .msg-retract-btn {
            left: -14px;
        }

        .chat-messages .chat-message.other .msg-retract-btn {
            right: -14px;
        }

        .chat-messages .msg-content-wrap {
            position: relative;
        }

        /* 表情包选择器 */
        .sticker-picker-panel {
            height: 0;
            overflow: hidden;
            background: #f7f7f7;
            border-top: 1px solid #dcdcdc;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            transition: height 0.2s ease-out;
        }

        .sticker-picker-panel.show {
            height: 200px;
        }

        .sticker-picker-grid {
            flex: 1;
            overflow-y: auto;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
            padding: 8px;
            align-content: start;
        }

        .sticker-picker-item {
            aspect-ratio: 1;
            border-radius: 6px;
            overflow: hidden;
            cursor: pointer;
            background: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.1s;
            border: 1px solid #eee;
        }

        .sticker-picker-item:active {
            transform: scale(0.92);
        }

        .sticker-picker-item img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
        }

        .sticker-picker-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #b2b2b2;
            font-size: 13px;
            flex-direction: column;
            gap: 8px;
        }

        .sticker-picker-empty img {
            width: 32px;
            height: 32px;
            opacity: 0.4;
        }

        /* 表情包消息气泡 */
        .msg-bubble.sticker-bubble {
            background: transparent !important;
            box-shadow: none !important;
            padding: 4px !important;
        }

        .msg-bubble.sticker-bubble::before,
        .msg-bubble.sticker-bubble::after {
            display: none !important;
        }

        .msg-bubble.sticker-bubble img {
            max-width: 120px;
            max-height: 120px;
            border-radius: 4px;
        }

        .sticker-btn-active {
            opacity: 1 !important;
        }

        /* 新建私聊选择器 */
        .tenant-selector {
            position: absolute;
            top: 44px;
            left: 0;
            right: 0;
            bottom: 0;
            background: #ededed;
            z-index: 20;
            display: flex;
            flex-direction: column;
            animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .tenant-list {
            flex: 1;
            overflow-y: auto;
            background: #fff;
        }

        .tenant-item {
            display: flex;
            align-items: center;
            padding: 10px 16px;
            background: #fff;
            cursor: pointer;
            border-bottom: 1px solid #f0f0f0;
        }

        .tenant-item:active {
            background: #f5f5f5;
        }

        .tenant-item-avatar {
            width: 40px;
            height: 40px;
            border-radius: 4px;
            background: #e0e0e0;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
        }
        
        .tenant-item-avatar img {
            width: 100%;
            height: 100%;
        }

        .tenant-item-info {
            flex: 1;
        }

        .tenant-item-name {
            font-size: 16px;
            font-weight: 500;
            color: #111;
        }

        .tenant-item-status {
            font-size: 13px;
            color: #999;
            margin-top: 2px;
        }

        /* 空状态 */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            color: #b2b2b2;
        }
        
        .empty-state img {
            width: 64px;
            height: 64px;
            margin-bottom: 16px;
            opacity: 0.5;
            filter: grayscale(100%);
        }

        .empty-state-text {
            font-size: 14px;
            text-align: center;
            line-height: 1.6;
        }
    `;

    // ==================== HTML 生成 ====================

    // 生成APP主HTML（使用onclick直接绑定事件）
    function generateAppHTML() {
        return `
            <div class="chat-app" id="chat-app-container">
                <div class="chat-list-view" id="chat-list-view">
                    <div class="chat-list-header">
                        <button class="chat-list-back-btn" id="btn-go-home" title="返回" onclick="goHome()">
                            <img src="https://api.iconify.design/ri:arrow-left-s-line.svg">
                        </button>
                        <span class="chat-list-title">微信</span>
                        <div class="chat-list-actions">
                            <button class="chat-list-btn" id="btn-new-chat" title="发起群聊">
                                <img src="https://api.iconify.design/ri:add-line.svg">
                            </button>
                            <button class="chat-list-btn" id="btn-chat-settings" title="设置">
                                <img src="https://api.iconify.design/ri:settings-3-line.svg">
                            </button>
                        </div>
                    </div>
                    <div class="chat-list" id="chat-list">
                        <!-- 会话列表 -->
                    </div>
                </div>
            </div>
        `;
    }

    // 生成聊天室HTML
    function generateChatRoomHTML(conv) {
        const isGroup = conv.type === 'group';
        const memberCount = conv.members ? conv.members.length : 0;

        return `
            <div class="chat-room-view" id="chat-room-view">
                <div class="chat-room-header">
                    <button class="chat-back-btn" id="btn-back-to-list">
                        <img src="https://api.iconify.design/ri:arrow-left-s-line.svg">
                    </button>
                    <span class="chat-room-title">${conv.name}</span>
                    ${isGroup ? `<span class="chat-room-info">(${memberCount})</span>` : ''}
                    <div style="width: 32px;"></div> <!-- 占位保持标题居中/平衡 -->
                </div>
                <div class="chat-messages" id="chat-messages">
                    <!-- 消息列表 -->
                </div>
                <div class="typing-indicator" id="typing-indicator">
                    <div class="typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                    <span style="margin-left:8px">正在输入...</span>
                </div>
                <div class="sticker-picker-panel" id="sticker-picker-panel">
                    <div class="sticker-picker-grid" id="sticker-picker-grid">
                        <div class="sticker-picker-empty">
                            <img src="https://api.iconify.design/ri:emotion-sad-line.svg">
                            加载中...
                        </div>
                    </div>
                </div>
                <div class="chat-input-area">
                    <div style="font-size:24px;color:#7f8389;display:flex;align-items:center;padding-bottom:10px;">
                        <img src="https://api.iconify.design/ri:mic-line.svg" style="width:24px;">
                    </div>
                    <textarea class="chat-input" id="chat-input" rows="1"></textarea>
                    <div id="btn-sticker-toggle" style="font-size:24px;color:#7f8389;display:flex;align-items:center;padding-bottom:10px;cursor:pointer;" title="表情包">
                        <img src="https://api.iconify.design/ri:emotion-line.svg" style="width:24px;">
                    </div>
                    <button class="chat-send-btn" id="btn-send">发送</button>
                </div>
            </div>
        `;
    }

    // 生成设置面板HTML
    function generateSettingsHTML(stats) {
        return `
            <div class="chat-settings-panel" id="chat-settings-panel">
                <div class="settings-header">
                    <button class="settings-back-btn" id="btn-settings-back">
                        <img src="https://api.iconify.design/ri:arrow-left-s-line.svg">
                    </button>
                    <span class="settings-title">设置</span>
                </div>
                <div class="settings-content">
                    <div class="settings-section">
                        <div class="settings-item">
                            <span class="settings-item-label">总会话数</span>
                            <span class="settings-item-value">${stats.conversationCount}</span>
                        </div>
                        <div class="settings-item">
                            <span class="settings-item-label">总消息数</span>
                            <span class="settings-item-value">${stats.messageCount}</span>
                        </div>
                    </div>
                    
                    <div class="settings-section">
                        <button class="settings-btn" id="btn-export-data">导出聊天记录</button>
                        <button class="settings-btn" id="btn-import-data">导入聊天记录</button>
                        <button class="settings-btn" id="btn-sync-members">同步群成员</button>
                    </div>
                    
                    <div class="settings-section">
                        <button class="settings-btn danger" id="btn-clear-data">清空所有聊天记录</button>
                    </div>
                </div>
            </div>
        `;
    }

    // 生成租客选择器HTML
    function generateTenantSelectorHTML(tenants, existingChats) {
        const existingNames = existingChats
            .filter(c => c.type === 'private')
            .map(c => c.members[0]);

        const availableTenants = tenants.filter(t => !existingNames.includes(t));

        let listHTML = '';
        if (availableTenants.length === 0) {
            listHTML = `
                <div class="empty-state">
                    <img src="https://api.iconify.design/ri:chat-check-line.svg">
                    <div class="empty-state-text">所有租客都已有私聊会话</div>
                </div>
            `;
        } else {
            listHTML = availableTenants.map(name => `
                <div class="tenant-item" data-name="${name}">
                    <div class="tenant-item-avatar">
                        <img src="https://api.iconify.design/ri:user-3-line.svg?color=gray">
                    </div>
                    <div class="tenant-item-info">
                        <div class="tenant-item-name">${name}</div>
                    </div>
                </div>
            `).join('');
        }

        return `
            <div class="tenant-selector" id="tenant-selector">
                <div class="settings-header">
                    <button class="settings-back-btn" id="btn-selector-back">
                        <img src="https://api.iconify.design/ri:arrow-left-s-line.svg">
                    </button>
                    <span class="settings-title">选择联系人</span>
                </div>
                <div class="tenant-list">
                    ${listHTML}
                </div>
            </div>
        `;
    }

    // 生成消息HTML
    function generateMessageHTML(msg, isGroupChat) {
        const isSelf = msg.sender === '<user>';
        const senderName = isSelf ? '我' : msg.sender;
        const timeStr = msg.gameTime ? msg.gameTime.时间 : '';

        // 头像处理
        let avatarUrl;
        
        if (isSelf) {
            // 用户消息：尝试使用酒馆用户头像
            const userAvatarPath = getUserAvatarPath();
            if (userAvatarPath) {
                avatarUrl = userAvatarPath;
            } else {
                // 回退到默认图标
                avatarUrl = `https://api.iconify.design/ri:user-star-fill.svg?color=%2307c160`;
            }
        } else {
            // 其他人消息：使用默认图标
            avatarUrl = `https://api.iconify.design/ri:user-3-fill.svg?color=%23999`;
        }

        // 判断是否是表情包消息
        const isSticker = msg.stickerImage && (msg.content.startsWith('[表情包：') || msg.content.startsWith('[sticker:'));
        let bubbleContent;
        if (isSticker) {
            bubbleContent = `<div class="msg-bubble sticker-bubble"><img src="${msg.stickerImage}" alt="表情包"></div>`;
        } else {
            bubbleContent = `<div class="msg-bubble">${escapeHtml(msg.content)}</div>`;
        }

        return `
            <div class="chat-message ${isSelf ? 'self' : 'other'}" data-id="${msg.id}">
                <div class="msg-avatar">
                    <img src="${avatarUrl}" />
                </div>
                <div class="msg-content-wrap">
                    ${!isSelf && isGroupChat ? `<div class="msg-sender">${senderName}</div>` : ''}
                    ${bubbleContent}
                    <div class="msg-time">${timeStr}</div>
                    <div class="msg-retract-btn" data-msg-id="${msg.id}" title="撤回消息">
                        <img src="https://api.iconify.design/ri:delete-back-2-line.svg?color=%23666666">
                    </div>
                </div>
            </div>
        `;
    }

    // 生成会话列表项HTML
    function generateChatListItemHTML(conv) {
        const isGroup = conv.type === 'group';
        const lastMsg = conv.lastMessage;
        let previewContent = lastMsg ? lastMsg.content : '';
        if (previewContent.startsWith('[sticker:') || previewContent.startsWith('[表情包：')) previewContent = '[表情包]';
        const preview = lastMsg
            ? `${lastMsg.sender === '<user>' ? '我' : lastMsg.sender}: ${previewContent}`.substring(0, 30)
            : '暂无消息';
        const timeStr = lastMsg?.gameTime?.时间 || '';

        // 头像
        let avatarIcon = isGroup ? 'ri:group-fill' : 'ri:user-3-fill';
        let avatarColor = isGroup ? '#07c160' : '#888';
        const avatarUrl = `https://api.iconify.design/${avatarIcon}.svg?color=white`;
        const avatarBg = isGroup ? '#07c160' : '#ddd';

        return `
            <div class="chat-list-item" data-conv-id="${conv.id}">
                <div class="chat-item-avatar" style="background:${avatarBg}">
                    <img src="${avatarUrl}" />
                </div>
                <div class="chat-item-content">
                    <div class="chat-item-top">
                        <div class="chat-item-name">${conv.name}</div>
                        <div class="chat-item-time">${timeStr}</div>
                    </div>
                    <div class="chat-item-preview">${escapeHtml(preview)}</div>
                </div>
            </div>
        `;
    }

    // HTML转义
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== APP 状态管理 ====================
    let currentIframeDoc = null; // phone iframe的document引用

    const AppState = {
        currentView: 'list', // 'list' | 'room' | 'settings' | 'selector'
        currentConversation: null,
        conversations: [],
        messages: [],
        isInitialized: false,
        lastChatId: null  // 用于检测ST聊天切换
    };

    // ==================== APP 核心逻辑 ====================

    // 初始化APP（支持重新初始化）
    async function initApp(forceReinit = false) {
        // 获取当前chatId
        const chatId = getCurrentChatId();
        if (!chatId) {
            console.error('[ChatApp] 无法获取chatId');
            return;
        }

        // 检查是否需要重新初始化（chatId变化了）
        if (AppState.isInitialized && !forceReinit) {
            if (AppState.lastChatId === chatId) {
                return; // 同一个聊天，无需重新初始化
            }
            console.log('[ChatApp] chatId变化，重新初始化:', AppState.lastChatId, '->', chatId);
        }

        try {
            // 初始化数据库
            const ChatDB = window.parent.ChatDB;
            if (!ChatDB) {
                console.error('[ChatApp] ChatDB未加载');
                return;
            }

            await ChatDB.init(chatId);

            // 确保群聊存在
            await ChatDB.getOrCreateGroupChat(GROUP_NAME);

            AppState.isInitialized = true;
            AppState.lastChatId = chatId;
            console.log('[ChatApp] 初始化完成, chatId:', chatId);

        } catch (e) {
            console.error('[ChatApp] 初始化失败:', e);
        }
    }

    // 获取当前chatId
    function getCurrentChatId() {
        try {
            if (window.parent.SillyTavern?.getContext) {
                const ctx = window.parent.SillyTavern.getContext();
                return ctx.chatId || ctx.chat_id || 'default';
            }
        } catch (e) { }
        return 'default_chat';
    }

    // 渲染会话列表
    async function renderChatList(iframeDoc) {
        const ChatDB = window.parent.ChatDB;
        const doc = iframeDoc || currentIframeDoc;
        if (!doc) return;
        const container = doc.getElementById('chat-list');
        if (!container) return;

        try {
            AppState.conversations = await ChatDB.getConversations();

            // 按更新时间排序，群聊置顶
            AppState.conversations.sort((a, b) => {
                if (a.type === 'group' && b.type !== 'group') return -1;
                if (b.type === 'group' && a.type !== 'group') return 1;
                return (b.updatedAt?.时间 || '') > (a.updatedAt?.时间 || '') ? 1 : -1;
            });

            if (AppState.conversations.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <img src="https://api.iconify.design/ri:chat-smile-3-line.svg">
                        <div class="empty-state-text">暂无消息<br>点击右上角 + 开始私聊</div>
                    </div>
                `;
            } else {
                container.innerHTML = AppState.conversations
                    .map(conv => generateChatListItemHTML(conv))
                    .join('');
            }

            // 绑定点击事件
            container.querySelectorAll('.chat-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    const convId = item.dataset.convId;
                    openChatRoom(convId);
                });
            });

        } catch (e) {
            console.error('[ChatApp] 渲染会话列表失败:', e);
            container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败</div></div>`;
        }
    }

    // 打开聊天室
    async function openChatRoom(convId) {
        const ChatDB = window.parent.ChatDB;
        const conv = await ChatDB.getConversation(convId);
        if (!conv) return;

        AppState.currentConversation = conv;
        AppState.currentView = 'room';

        const doc = currentIframeDoc || document;
        const appContainer = doc.getElementById('app-container');
        if (!appContainer) {
            console.error('[ChatApp] 找不到app-container');
            return;
        }

        // 渲染聊天室（包含外层chat-app容器）
        appContainer.innerHTML = `
            <div class="chat-app" id="chat-app-container">
                ${generateChatRoomHTML(conv)}
            </div>
        `;

        // 加载消息
        await renderMessages();

        // 绑定事件
        bindChatRoomEvents();
    }

    // 渲染消息列表
    async function renderMessages() {
        const ChatDB = window.parent.ChatDB;
        const doc = currentIframeDoc || document;
        const container = doc.getElementById('chat-messages');
        if (!container || !AppState.currentConversation) return;

        try {
            const messages = await ChatDB.getMessages(AppState.currentConversation.id, 100);
            AppState.messages = messages;

            const isGroup = AppState.currentConversation.type === 'group';

            if (messages.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <img src="https://api.iconify.design/ri:chat-1-line.svg">
                        <div class="empty-state-text">打个招呼吧</div>
                    </div>
                `;
            } else {
                container.innerHTML = messages
                    .map(msg => generateMessageHTML(msg, isGroup))
                    .join('');
            }

            // 滚动到底部
            container.scrollTop = container.scrollHeight;

        } catch (e) {
            console.error('[ChatApp] 渲染消息失败:', e);
        }
    }

    // 发送消息
    async function sendMessage() {
        const doc = currentIframeDoc || document;
        const input = doc.getElementById('chat-input');
        const sendBtn = doc.getElementById('btn-send');
        const content = input.value.trim();

        if (!content || !AppState.currentConversation) return;

        const conversation = AppState.currentConversation;
        const ChatCore = window.parent.ChatCore;
        const ChatDB = window.parent.ChatDB;

        // 禁用输入
        input.disabled = true;
        sendBtn.disabled = true;
        sendBtn.textContent = '...';
        sendBtn.classList.add('loading');

        try {
            // 1. 发送用户消息（纯文字）
            await ChatCore.sendUserMessage(conversation.id, content);
            input.value = '';

            // 刷新显示
            await renderMessages();

            // 2. 显示输入中
            const typingEl = doc.getElementById('typing-indicator');
            if (typingEl) typingEl.classList.add('show');

            // 3. 生成AI回复
            const isGroup = conversation.type === 'group';
            if (isGroup) {
                await ChatCore.generateGroupReply(conversation.id, content);
            } else {
                await ChatCore.generatePrivateReply(conversation.id, content);
            }

            // 4. AI回复完成后，同步到世界书
            if (window.parent.ChatSync) {
                await window.parent.ChatSync.instantSync(conversation.id);
            }

            // 5. 刷新显示
            await renderMessages();

        } catch (e) {
            console.error('[ChatApp] 发送消息失败:', e);
            if (e.name !== 'AbortError') alert('发送失败: ' + e.message);
        } finally {
            // 恢复输入
            input.disabled = false;
            sendBtn.disabled = false;
            sendBtn.textContent = '发送';
            sendBtn.classList.remove('loading');
            const typingEl = doc.getElementById('typing-indicator');
            if (typingEl) typingEl.classList.remove('show');
            input.focus();
        }
    }

    // ==================== 表情包选择器 ====================

    // 从创意工坊的IndexedDB读取表情包
    async function loadStickersFromWorkshop() {
        return new Promise((resolve) => {
            try {
                // 不指定版本号，避免在DB不存在时创建空DB影响workshop后续初始化
                const request = indexedDB.open('WorkshopStickersDB');
                request.onerror = () => { resolve([]); };
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('stickers')) { db.close(); resolve([]); return; }
                    const tx = db.transaction('stickers', 'readonly');
                    const store = tx.objectStore('stickers');
                    const all = store.getAll();
                    all.onsuccess = () => { db.close(); resolve(all.result || []); };
                    all.onerror = () => { db.close(); resolve([]); };
                };
            } catch (e) {
                console.warn('[ChatApp] 读取表情包失败:', e);
                resolve([]);
            }
        });
    }

    // 缓存表情包列表（避免频繁读取IndexedDB）
    let cachedStickers = null;
    let stickerCacheTime = 0;
    const STICKER_CACHE_TTL = 30000; // 30秒缓存

    async function getStickers() {
        const now = Date.now();
        if (cachedStickers && (now - stickerCacheTime) < STICKER_CACHE_TTL) {
            return cachedStickers;
        }
        cachedStickers = await loadStickersFromWorkshop();
        stickerCacheTime = now;
        return cachedStickers;
    }

    // 渲染表情包选择器内容
    async function renderStickerPicker() {
        const doc = currentIframeDoc || document;
        const grid = doc.getElementById('sticker-picker-grid');
        if (!grid) return;

        const stickers = await getStickers();

        if (stickers.length === 0) {
            grid.innerHTML = `
                <div class="sticker-picker-empty">
                    <img src="https://api.iconify.design/ri:emotion-sad-line.svg">
                    还没有表情包<br>请在创意工坊中添加
                </div>
            `;
            return;
        }

        grid.innerHTML = stickers.map(s => `
            <div class="sticker-picker-item" data-sticker-id="${s.id}" data-sticker-name="${escapeHtml(s.name || '')}" data-sticker-desc="${escapeHtml(s.description || '')}" title="${escapeHtml(s.name || '')}${s.description ? '\n' + escapeHtml(s.description) : ''}">
                <img src="${s.imageData || ''}" alt="${escapeHtml(s.name || '')}">
            </div>
        `).join('');

        // 绑定点击事件
        grid.querySelectorAll('.sticker-picker-item').forEach(item => {
            item.addEventListener('click', () => {
                const stickerId = item.dataset.stickerId;
                const stickerName = item.dataset.stickerName || '表情包';
                const stickerDesc = item.dataset.stickerDesc || '';
                const imgEl = item.querySelector('img');
                const stickerImage = imgEl ? imgEl.src : '';
                sendStickerMessage(stickerName, stickerDesc, stickerImage);
            });
        });
    }

    // 切换表情包选择器显示
    let stickerPickerLoaded = false;

    function toggleStickerPicker() {
        const doc = currentIframeDoc || document;
        const panel = doc.getElementById('sticker-picker-panel');
        const toggleBtn = doc.getElementById('btn-sticker-toggle');
        if (!panel) return;

        const isVisible = panel.classList.contains('show');
        if (isVisible) {
            panel.classList.remove('show');
            if (toggleBtn) toggleBtn.classList.remove('sticker-btn-active');
        } else {
            panel.classList.add('show');
            if (toggleBtn) toggleBtn.classList.add('sticker-btn-active');
            // 首次打开或刷新缓存过期时加载
            if (!stickerPickerLoaded || (Date.now() - stickerCacheTime) >= STICKER_CACHE_TTL) {
                renderStickerPicker();
                stickerPickerLoaded = true;
            }
        }
    }

    // 发送表情包消息（立即发送，不触发AI回复）
    async function sendStickerMessage(stickerName, stickerDesc, stickerImage) {
        if (!AppState.currentConversation) return;

        const ChatCore = window.parent.ChatCore;
        const doc = currentIframeDoc || document;

        // 关闭选择器
        const panel = doc.getElementById('sticker-picker-panel');
        if (panel) panel.classList.remove('show');
        const toggleBtn = doc.getElementById('btn-sticker-toggle');
        if (toggleBtn) toggleBtn.classList.remove('sticker-btn-active');

        // 构建消息内容（AI可读的沉浸式格式）
        const content = `[表情包：${stickerDesc || stickerName}]`;

        try {
            // 发送带表情包图片的用户消息（仅存入DB，不触发AI回复）
            await ChatCore.sendUserMessage(
                AppState.currentConversation.id,
                content,
                { stickerImage: stickerImage }
            );

            // 刷新聊天显示
            await renderMessages();

            // 同步到ChatLore（让AI知道用户发了表情包）
            if (window.parent.ChatSync) {
                window.parent.ChatSync.instantSync(AppState.currentConversation.id);
            }
        } catch (e) {
            console.error('[ChatApp] 发送表情包失败:', e);
        }
    }

    // 绑定聊天室事件
    function bindChatRoomEvents() {
        const doc = currentIframeDoc || document;
        // 返回按钮
        doc.getElementById('btn-back-to-list')?.addEventListener('click', () => {
            showListView();
        });

        // 发送按钮
        doc.getElementById('btn-send')?.addEventListener('click', sendMessage);

        // 输入框回车发送
        doc.getElementById('chat-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // 表情包按钮
        doc.getElementById('btn-sticker-toggle')?.addEventListener('click', toggleStickerPicker);

        // 自动调整输入框高度
        const input = doc.getElementById('chat-input');
        input?.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        });

        // 输入框获焦时关闭表情包面板
        input?.addEventListener('focus', () => {
            const panel = doc.getElementById('sticker-picker-panel');
            if (panel) panel.classList.remove('show');
            const toggleBtn = doc.getElementById('btn-sticker-toggle');
            if (toggleBtn) toggleBtn.classList.remove('sticker-btn-active');
        });

        // 绑定消息长按事件（用于撤回）
        bindMessageContextMenu();
    }

    // ==================== 消息撤回功能 ====================

    // 绑定撤回按钮点击事件
    function bindMessageContextMenu() {
        const doc = currentIframeDoc || document;
        const container = doc.getElementById('chat-messages');
        if (!container) return;

        // 点击撤回按钮直接撤回
        container.addEventListener('click', (e) => {
            const retractBtn = e.target.closest('.msg-retract-btn');
            if (retractBtn) {
                const msgId = retractBtn.dataset.msgId;
                if (msgId) {
                    e.stopPropagation();
                    retractMessage(msgId);
                }
            }
        });

        console.log('[ChatApp] 消息撤回按钮已绑定');
    }

    // 撤回消息
    async function retractMessage(messageId) {
        const ChatDB = window.parent.ChatDB;
        const ChatSync = window.parent.ChatSync;

        if (!AppState.currentConversation) return;

        try {
            // 1. 从IndexedDB删除消息
            await ChatDB.deleteMessage(messageId);
            console.log('[ChatApp] 消息已撤回:', messageId);

            // 2. 重新渲染消息列表
            await renderMessages();

            // 3. 同步更新ChatLore（重新同步整个会话）
            if (ChatSync) {
                ChatSync.instantSync(AppState.currentConversation.id);
            }

        } catch (e) {
            console.error('[ChatApp] 撤回消息失败:', e);
            alert('撤回失败: ' + e.message);
        }
    }

    // 撤回最后N条消息（用于批量撤回）
    async function retractLastMessages(count = 2) {
        const ChatDB = window.parent.ChatDB;
        const ChatSync = window.parent.ChatSync;

        if (!AppState.currentConversation) return;

        try {
            // 1. 从IndexedDB删除最后N条消息
            const deleted = await ChatDB.deleteLastMessages(AppState.currentConversation.id, count);
            console.log('[ChatApp] 已撤回', deleted.length, '条消息');

            // 2. 重新渲染消息列表
            await renderMessages();

            // 3. 同步更新ChatLore
            if (ChatSync) {
                ChatSync.instantSync(AppState.currentConversation.id);
            }

            return deleted;
        } catch (e) {
            console.error('[ChatApp] 批量撤回失败:', e);
            alert('撤回失败: ' + e.message);
            return [];
        }
    }

    // 显示列表视图（从聊天室返回时调用）
    function showListView() {
        AppState.currentView = 'list';
        AppState.currentConversation = null;

        const doc = currentIframeDoc;
        if (!doc) return;

        // 获取wrapper或app-container
        let container = doc.getElementById('chat-app-wrapper');
        if (!container) {
            container = doc.getElementById('app-container');
        }
        if (!container) return;

        // 重新渲染整个APP
        container.innerHTML = generateAppHTML();

        // 绑定事件
        setTimeout(function () {
            bindListViewEvents();
            renderChatList();
        }, 50);
    }

    // 显示设置面板
    async function showSettings() {
        const ChatDB = window.parent.ChatDB;
        const stats = await ChatDB.getStats();
        const doc = currentIframeDoc || document;

        const container = doc.getElementById('chat-app-container');
        container.insertAdjacentHTML('beforeend', generateSettingsHTML(stats));

        // 绑定事件
        doc.getElementById('btn-settings-back')?.addEventListener('click', () => {
            doc.getElementById('chat-settings-panel')?.remove();
        });

        doc.getElementById('btn-export-data')?.addEventListener('click', exportData);
        doc.getElementById('btn-import-data')?.addEventListener('click', importData);
        doc.getElementById('btn-sync-members')?.addEventListener('click', syncMembers);
        doc.getElementById('btn-clear-data')?.addEventListener('click', clearData);
    }

    // 显示租客选择器
    async function showTenantSelector() {
        const ChatDB = window.parent.ChatDB;
        const tenants = ChatDB.getTenantList();
        const conversations = await ChatDB.getConversations();
        const doc = currentIframeDoc || document;

        const container = doc.getElementById('chat-app-container');
        container.insertAdjacentHTML('beforeend', generateTenantSelectorHTML(tenants, conversations));

        // 绑定事件
        doc.getElementById('btn-selector-back')?.addEventListener('click', () => {
            doc.getElementById('tenant-selector')?.remove();
        });

        doc.querySelectorAll('.tenant-item').forEach(item => {
            item.addEventListener('click', async () => {
                const name = item.dataset.name;
                await createPrivateChat(name);
            });
        });
    }

    // 创建私聊
    async function createPrivateChat(tenantName) {
        const ChatDB = window.parent.ChatDB;
        const conv = await ChatDB.getOrCreatePrivateChat(tenantName);
        const doc = currentIframeDoc || document;

        doc.getElementById('tenant-selector')?.remove();
        await openChatRoom(conv.id);
    }

    // 导出数据
    async function exportData() {
        try {
            const ChatDB = window.parent.ChatDB;
            const jsonData = await ChatDB.exportData();

            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tenant_chat_backup_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);

            alert('导出成功！');
        } catch (e) {
            console.error('[ChatApp] 导出失败:', e);
            alert('导出失败: ' + e.message);
        }
    }

    // 导入数据
    async function importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const ChatDB = window.parent.ChatDB;

                const merge = confirm('是否合并数据？\n确定：合并到现有数据\n取消：覆盖现有数据');
                const result = await ChatDB.importData(text, { merge });

                alert(`导入成功！\n会话: ${result.conversations}\n消息: ${result.messages}`);

                // 刷新
                const doc = currentIframeDoc || document;
                doc.getElementById('chat-settings-panel')?.remove();
                await renderChatList();

            } catch (e) {
                console.error('[ChatApp] 导入失败:', e);
                alert('导入失败: ' + e.message);
            }
        };

        input.click();
    }

    // 同步群成员
    async function syncMembers() {
        try {
            const ChatDB = window.parent.ChatDB;
            const conversations = await ChatDB.getConversations();
            const groupConv = conversations.find(c => c.type === 'group');

            if (groupConv) {
                await ChatDB.syncGroupMembers(groupConv.id);
                alert('群成员已同步！');
            } else {
                alert('未找到群聊');
            }
        } catch (e) {
            console.error('[ChatApp] 同步失败:', e);
            alert('同步失败: ' + e.message);
        }
    }

    // 清空数据
    async function clearData() {
        if (!confirm('确定要清空所有聊天记录吗？此操作不可恢复！')) return;
        if (!confirm('再次确认：真的要删除吗？')) return;

        try {
            const ChatDB = window.parent.ChatDB;
            await ChatDB.clearCurrentChatData();

            alert('已清空所有聊天记录');

            // 刷新
            const doc = currentIframeDoc || document;
            doc.getElementById('chat-settings-panel')?.remove();

            // 重新创建群聊
            await ChatDB.getOrCreateGroupChat(GROUP_NAME);
            await renderChatList();

        } catch (e) {
            console.error('[ChatApp] 清空失败:', e);
            alert('清空失败: ' + e.message);
        }
    }

    // ==================== PhoneSystem 集成 ====================

    // 等待PhoneSystem就绪
    function waitForPhoneSystem(callback) {
        if (window.parent.PhoneSystem) {
            callback();
        } else {
            setTimeout(function () { waitForPhoneSystem(callback); }, 100);
        }
    }

    // 打开APP
    async function openApp() {
        const phoneSystem = window.parent.PhoneSystem;
        if (!phoneSystem || !phoneSystem.iframeWindow) {
            setTimeout(openApp, 200);
            return;
        }

        const iframeDoc = phoneSystem.iframeWindow.document;
        currentIframeDoc = iframeDoc;

        const appContainer = iframeDoc.getElementById('app-container');
        const homeScreen = iframeDoc.getElementById('home-screen');
        const statusBar = iframeDoc.getElementById('status-bar');

        if (!appContainer) {
            console.error('[ChatApp] 找不到app-container');
            return;
        }

        // 隐藏主屏幕，显示APP容器
        if (homeScreen) homeScreen.style.display = 'none';
        appContainer.innerHTML = '';
        appContainer.style.display = 'block';
        appContainer.style.pointerEvents = 'auto';

        if (statusBar) {
            statusBar.classList.remove('light');
            statusBar.classList.add('dark');
        }

        // 注入样式到iframe
        if (!iframeDoc.getElementById('chat-app-styles')) {
            const style = iframeDoc.createElement('style');
            style.id = 'chat-app-styles';
            style.textContent = APP_STYLES;
            iframeDoc.head.appendChild(style);
        }

        // 初始化数据库
        await initApp();

        // 创建APP内容（完全按照phone_debug_app.js的方式）
        const appDiv = iframeDoc.createElement('div');
        appDiv.id = 'chat-app-wrapper';
        appDiv.style.cssText = 'width:100%;height:100%;';
        appDiv.innerHTML = generateAppHTML();
        appContainer.appendChild(appDiv);

        // 绑定事件并渲染（使用setTimeout，和phone_debug_app.js一致）
        setTimeout(function () {
            bindListViewEvents();
            renderChatList();
        }, 50);

        console.log('[ChatApp] APP已打开');
    }

    // 绑定主界面事件
    function bindListViewEvents() {
        const doc = currentIframeDoc;
        if (!doc) return;

        // 返回主屏幕 - 已经用onclick="goHome()"绑定了，这里不需要重复绑定

        // 新建私聊
        const btnNewChat = doc.getElementById('btn-new-chat');
        if (btnNewChat) {
            btnNewChat.addEventListener('click', function () {
                showTenantSelector();
            });
        }

        // 设置
        const btnSettings = doc.getElementById('btn-chat-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', function () {
                showSettings();
            });
        }
    }

    // 关闭APP
    function closeApp() {
        if (!window.parent) return;
        const phoneSystem = window.parent.PhoneSystem;
        if (!phoneSystem || !phoneSystem.iframeWindow) return;

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

            // 重置状态
            AppState.currentView = 'list';
            AppState.currentConversation = null;
            currentIframeDoc = null;

        } catch (e) {
            console.error('[ChatApp] closeApp失败:', e);
        }
    }

    // 注册APP
    waitForPhoneSystem(function () {
        console.log('[ChatApp] PhoneSystem已就绪，开始注册');

        // 注册APP
        window.parent.PhoneSystem.registerApp({
            id: APP_ID,
            name: APP_NAME,
            icon: APP_ICON,
            color: '#07c160',
            order: 2
        });

        // 监听事件
        window.parent.PhoneSystem.on('app-opened', function (data) {
            if (data.id === APP_ID) openApp();
        });

        window.parent.PhoneSystem.on('go-home', function () {
            closeApp();
        });

        console.log('[ChatApp] APP已注册:', APP_NAME);
    });

    // 导出到全局
    window.parent.ChatApp = {
        init: initApp,
        getState: function () { return AppState; },
        getIframeDoc: function () { return currentIframeDoc; },
        retractMessage: retractMessage,
        retractLastMessages: retractLastMessages
    };

    console.log('✅ ChatApp 模块已加载');

})();
