// ==================== 掌上公寓 - SillyTavern 插件版 ====================
// 完整功能的公寓管理系统，带可拖动按钮
// 版本：动态扩展版

console.log('🏢 加载掌上公寓插件...');

// ==================== 样式定义 ====================
const styles = `
<style id="apartment-plugin-styles">
/* ==================== 全局样式 ==================== */
/* 仅作用于掌上公寓UI，不影响SillyTavern原有样式 */
.apartment-toggle-btn, .apartment-toggle-btn *, 
.apartment-main-panel, .apartment-main-panel * { 
    margin: 0; padding: 0; box-sizing: border-box; 
}
.no-select { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; }

:root { 
    --theme-phone-bg: #f8fafc; 
    --theme-text-color: #1e293b; 
    --theme-border-color: #ffffff; /* White border for Candy theme */
    --theme-container-bg: #ffffff; 
    --theme-subtitle-color: #64748b; 
    --theme-header-bg: #FF9EAA; /* Pink Header */
    --theme-dock-bg: rgba(255, 255, 255, 0.95); 
    --theme-modal-btn-bg: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); 
    --color-fixed: #fef3c7; 
    --color-bedroom: #fce7f3; 
    --color-functional: #dbeafe; 
    --color-empty: #f1f5f9; 
    --color-outdoor: #dcfce7; 
    --color-pending: #fef9c3;
    --color-danger: #fee2e2; 
    --your-room-bg: #cffafe; 
    --progress-bar-bg: #e2e8f0; 
    --progress-bar-favor-fill: linear-gradient(90deg, #f472b6 0%, #ec4899 100%); 
    --progress-bar-lust-fill: linear-gradient(90deg, #f9a8d4 0%, #db2777 100%); 
    --color-add-room: #bbf7d0; 
    --accent-gradient: linear-gradient(135deg, #FF9EAA 0%, #FFB7B2 100%); /* Pink gradient */
    --accent-color: #E68A96; /* Pink accent */
    --accent-hover: #FFB7B2;
}

.dark-theme { 
    --theme-phone-bg: #232136; /* Deep Rose Pine base */
    --theme-text-color: #e0def4; 
    --theme-border-color: #44415a; /* Muted purple border */
    --theme-container-bg: #2a273f; 
    --theme-subtitle-color: #908caa;
    --theme-header-bg: #eb6f92; /* Love (Red/Pink) */
    --theme-dock-bg: rgba(35, 33, 54, 0.95); 
    --theme-modal-btn-bg: linear-gradient(135deg, #2a273f 0%, #393552 100%); 
    --color-fixed: #9ccdf1; /* Foam */
    --color-bedroom: #c4a7e7; /* Iris */
    --color-functional: #31748f; /* Pine */
    --color-empty: #26233a; /* Surface */
    --color-outdoor: #9ccfd8; /* Rose */
    --color-pending: #f6c177; /* Gold */
    --color-danger: #eb6f92; /* Love */
    --your-room-bg: #ebbcba; /* Rose */
    --progress-bar-bg: #44415a; 
    --progress-bar-favor-fill: linear-gradient(90deg, #c4a7e7 0%, #eb6f92 100%); 
    --progress-bar-lust-fill: linear-gradient(90deg, #ebbcba 0%, #f6c177 100%); 
    --color-add-room: #31748f; 
    --accent-gradient: linear-gradient(135deg, #eb6f92 0%, #c4a7e7 100%);
    --accent-color: #eb6f92;
    --accent-hover: #c4a7e7;
}

/* ==================== 拖动按钮 (Original Logic Restored) ==================== */
.apartment-toggle-btn {
    position: absolute;
    top: 100px;
    left: 20px;
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    z-index: 1000;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    transition: transform 0.2s ease;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    font-size: 24px;
}

.apartment-toggle-btn:hover {
    transform: scale(1.1);
}

.apartment-toggle-btn.dragging {
    cursor: grabbing !important;
    opacity: 0.85;
    z-index: 1001;
    transform: scale(0.95);
}

/* ==================== 主界面容器 (Pink Mac Candy Style) ==================== */
.apartment-main-panel {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 900px;
    height: 650px;
    background: #fdfdfd;
    border: 4px solid #FFFFFF; /* White thick border */
    border-radius: 16px; 
    box-shadow: 0 6px 0px #E68A96, 0 10px 20px rgba(0,0,0,0.1); /* Pink solid shadow */
    z-index: 999;
    display: none;
    flex-direction: column;
    overflow: hidden;
    color: var(--theme-text-color);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; /* System fonts */
    animation: windowPopup 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
}

.apartment-main-panel.active {
    display: flex;
    animation: windowPopup 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
}

@keyframes windowPopup {
    0% { opacity: 0; transform: translate(-50%, -46%) scale(0.98); }
    100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* Mac Title Bar Integration (Pink) */
.mac-title-bar {
    height: 38px;
    background: #FF9EAA; /* Pink Header */
    border-bottom: 2px solid #FFFFFF;
    display: flex;
    align-items: center;
    padding: 0 16px;
    position: relative;
    user-select: none;
    flex-shrink: 0;
}

.window-controls {
    display: flex;
    gap: 8px;
}
.control-dot { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 2px 0 rgba(0,0,0,0.1); border: 2px solid white; }
.control-dot.red { background: #ff5f57; }
.control-dot.yellow { background: #febc2e; }
.control-dot.green { background: #28c840; }
.control-dot:hover { filter: brightness(0.9); cursor: pointer; }

/* Empty Title (Mac Style) */
.window-title { display: none; }

/* New Status Bar for Date/Time */
.status-bar-line {
    padding: 5px 16px;
    background: #FFF0F5; /* Light pink background */
    color: #E68A96;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 15px;
    border-bottom: 1px solid #ffe4e8;
}

.status-clock {
    display: flex;
    gap: 10px;
    font-variant-numeric: tabular-nums;
}

/* Dark Theme Specific Overrides */
.dark-theme .status-bar-line {
    background: #2a273f;
    border-bottom: 1px solid #44415a;
    color: #eb6f92;
}

.dark-theme .mac-title-bar {
    border-bottom: 2px solid #44415a;
}
.dark-theme .apartment-main-panel {
    background: #232136;
    border: 4px solid #44415a;
    box-shadow: 0 6px 0px #1c1a2e, 0 10px 20px rgba(0,0,0,0.4);
}
.dark-theme .control-dot {
    border: 2px solid #44415a;
}

/* Dark Theme: 模态框 */
.dark-theme .modal-content {
    background: rgba(42, 39, 63, 0.92);
    color: #e0def4;
    border: 1px solid #44415a;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
}

.dark-theme .modal-overlay {
    background: rgba(0, 0, 0, 0.6);
}

.dark-theme .modal-title {
    color: #e0def4;
}

.dark-theme .modal-choices button:disabled {
    background-color: #393552;
    color: #6e6a86;
}

.dark-theme .danger-btn {
    background-color: #3b1a2e;
    border-color: #eb6f92;
    color: #eb6f92;
}

/* Dark Theme: 画布视口 */
.dark-theme .canvas-viewport {
    background: #1a1826;
}

/* Dark Theme: Dock底栏 */
.dark-theme .mobile-footer {
    background: rgba(35, 33, 54, 0.75);
    border: 1px solid rgba(68, 65, 90, 0.5);
    box-shadow: 0 10px 30px rgba(0,0,0,0.4);
}

.dark-theme .mobile-footer:hover {
    background: rgba(35, 33, 54, 0.85);
}

.dark-theme .dock-button.active {
    background: rgba(255,255,255,0.08);
}

/* Dark Theme: 信息模态框 */
.dark-theme #info-modal-header {
    border-bottom: 1px solid #44415a;
}

.dark-theme #info-modal-details {
    background: #232136;
}

.dark-theme #info-modal-details li {
    border-bottom: 1px solid #393552;
}

.dark-theme #info-modal-details li strong {
    color: #908caa;
}

/* Dark Theme: 轮播导航 */
.dark-theme .tenant-carousel-nav {
    border-top: 1px solid #44415a;
}

.dark-theme .carousel-arrow {
    background: #393552;
    border-color: #44415a;
    color: #e0def4;
}

.dark-theme .carousel-arrow:hover {
    border-color: #eb6f92;
    color: #eb6f92;
}

.dark-theme .carousel-arrow:disabled {
    background: #2a273f;
    color: #6e6a86;
}

/* Dark Theme: 房间卡片文字（卡片背景是亮色，用深色字提高对比度） */
.dark-theme .room-card .room-name {
    color: #1e1a2e;
}
.dark-theme .room-card .room-occupant {
    color: #44415a;
    background-color: rgba(255,255,255,0.6);
}
.dark-theme .room-card .room-icon {
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
}
.dark-theme .room-card .slot-indicator {
    color: #44415a;
}
.dark-theme .add-room-card {
    color: #e0def4;
}
.dark-theme .add-floor-btn,
.dark-theme .add-room-btn {
    color: #e0def4;
}

/* Dark Theme: 楼层标签 */
.dark-theme .floor-label {
    color: #908caa;
}

/* Dark Theme: 观察/建造模式标签 */
.dark-theme #mode-display.observation-mode {
    background-color: rgba(35, 33, 54, 0.8);
    color: #eb6f92;
    border: 1px solid #eb6f92;
}

/* ==================== 移动端响应式 ==================== */
@media (max-width: 768px) {
    .apartment-main-panel {
        width: 95%;
        height: 90%;
        max-width: 420px;
        max-height: 730px;
        border-radius: 40px;
    }
}

/* ==================== 头部 ==================== */
.mobile-header { 
    flex-shrink: 0; 
    padding: 12px 18px;
    background: var(--theme-header-bg); 
    border-bottom: none; 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    font-size: 0.9em; 
    position: relative; 
    z-index: 20;
    color: white;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

#mode-display { 
    font-weight: bold; 
    padding: 3px 8px; 
    border-radius: 5px;
}

#mode-display.observation-mode { 
    background-color: rgba(255,255,255,0.6); 
    color: #E68A96; /* Pink text for visibility */
    border: 1px solid #E68A96;
    backdrop-filter: blur(4px);
}

#mode-display.build-mode { 
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
}

/* ==================== 画布视口 ==================== */
.canvas-viewport { 
    flex-grow: 1; 
    position: relative; 
    overflow: hidden; 
    min-height: 0; 
    border-radius: 20px; 
    cursor: grab;
    background: #fafafa;
}

.canvas-viewport:active { 
    cursor: grabbing; 
}

#apartment-canvas { 
    position: absolute; 
    left: 50%; 
    top: 50%; 
    transform: translate(-50%, -50%) scale(1); 
    transform-origin: center center; 
    transition: transform 0.2s ease-out; 
    display: flex; 
    flex-direction: column; 
    align-items: stretch; 
    gap: 10px; 
    will-change: transform;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
}

/* ==================== 底部工具栏 (Mac Dock) ==================== */
.mobile-footer { 
    flex-shrink: 0;
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: auto;
    max-width: 90%;
    padding: 10px 20px; 
    background: rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(20px); 
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 24px;
    display: flex; 
    justify-content: center; 
    align-items: flex-end; 
    z-index: 100; 
    gap: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    transition: all 0.3s ease;
}

.mobile-footer:hover {
    background: rgba(255, 255, 255, 0.35);
    transform: translateX(-50%) scale(1.02);
}

.dock-button { 
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    gap: 4px; 
    cursor: pointer; 
    background: none; 
    border: none;
    color: var(--theme-subtitle-color); 
    font-size: 11px; 
    font-family: inherit; 
    min-width: 50px; 
    flex: 0 0 auto;
    padding: 6px; 
    border-radius: 12px;
    transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94); 
    position: relative;
    user-select: none;
}

.dock-button:hover { 
    transform: translateY(-10px) scale(1.1);
    color: var(--accent-color);
}

.dock-button:hover .dock-button-icon {
    filter: drop-shadow(0 4px 6px rgba(0,0,0,0.2));
}

.dock-button.active {
    background: rgba(255,255,255,0.2);
}

.dock-button.active .dock-button-icon { 
    color: var(--accent-color);
    transform: scale(1.1);
}

.dock-button.active::after {
    content: '';
    position: absolute;
    bottom: -4px;
    width: 4px;
    height: 4px;
    background: var(--accent-color);
    border-radius: 50%;
}

@media (max-width: 450px) {
    .dock-button { 
        font-size: 10px; 
        min-width: 50px; 
        padding: 3px 1px; 
    }
    .dock-button-icon { 
        font-size: 20px !important; 
    }
    .dock-button span:not(.dock-button-icon) { 
        display: none; 
    }
}

.dock-button:disabled { 
    color: #999 !important;
    cursor: not-allowed; 
} 

.dock-button-icon { 
    font-size: 24px;
}

.dock-button:hover { 
    color: var(--accent-color);
    transform: translateY(-2px);
}

.dock-button.active .dock-button-icon { 
    color: var(--accent-color);
}

/* ==================== 楼层和房间 ==================== */
.above-ground-wrapper { 
    display: grid; 
    grid-template-columns: 200px 1fr 200px; 
    align-items: end; 
    gap: 20px;
    padding: 30px 40px 10px 40px; 
}

.basement-wrapper { 
    display: grid; 
    grid-template-columns: 200px 1fr 200px; 
    gap: 20px;
    padding: 0 20px 20px 20px; 
}

.indoor-levels { 
    display: flex; 
    flex-direction: column; 
    gap: 20px;
}

.level { 
    background-color: var(--theme-container-bg); 
    border-radius: 20px; 
    box-shadow: 0 4px 20px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.03); 
    padding: 24px;
    border: 1px solid var(--theme-border-color);  
    display: flex; 
    flex-direction: column; 
    width: 1275px; 
    box-sizing: border-box;
    transition: box-shadow 0.3s ease;
}

.level:hover {
    box-shadow: 0 8px 30px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08);
}

.level-title { 
    font-size: 1.2em; 
    font-weight: 600; 
    margin: 0 0 15px 5px;
    color: var(--theme-text-color); 
    flex-shrink: 0; 
}

.room-grid { 
    display: flex; 
    gap: 10px; 
    flex: 1; 
    align-items: stretch; 
}

.room-card { 
    flex-shrink: 0;
    flex-basis: 0; 
    border-radius: 8px; 
    padding: 15px 10px; 
    min-height: 70px; 
    display: flex; 
    display: flex; 
    flex-direction: column; 
    justify-content: center; 
    align-items: center; 
    text-align: center;
    font-weight: 600; 
    font-size: 0.9em; 
    border: 1px solid rgba(0,0,0,0.05); 
    box-shadow: 0 2px 5px rgba(0,0,0,0.02);
    min-height: 110px; /* Increased height */
    position: relative;
    overflow: hidden;
}

.room-icon {
    font-size: 32px;
    margin-bottom: 8px;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.1));
    transition: transform 0.2s ease;
}

.room-card:hover .room-icon {
    transform: scale(1.15);
}

.room-card {
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
}

.size-2 { flex-grow: 2; }
.size-3 { flex-grow: 3; }
.size-6 { flex-grow: 6; }

.room-card.actionable { 
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.room-card.actionable:hover { 
    transform: translateY(-5px); 
    box-shadow: 0 10px 20px rgba(0,0,0,0.1);
    z-index: 10;
}

.placeholder { 
    visibility: hidden; 
}

.fixed-room { 
    background-color: var(--color-fixed);
    border: 1px solid rgba(255,255,255,0.5);
}

.outdoor-room { 
    background-color: var(--color-outdoor); 
    background-image: radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px);
    background-size: 10px 10px;
}

.empty-room { 
    background-color: var(--color-empty); 
    opacity: 0.8;
    border: 1px dashed rgba(0,0,0,0.1);
}

.bedroom-room { 
    background-color: var(--color-bedroom);
    border: 1px solid rgba(255,255,255,0.6);
}

.your-room { 
    background-color: var(--your-room-bg); 
    border: 2px solid white;
    box-shadow: 0 4px 15px rgba(20, 184, 166, 0.15);
}

.functional-room { 
    background-color: var(--color-functional); 
    border: 1px solid rgba(255,255,255,0.6);
}

.pending-decoration { 
    background-color: var(--color-pending); 
    border-style: dashed;
}

.pending-eviction { 
    background-color: var(--color-danger); 
    border-style: dotted; 
    color: #721c24; 
}

.pending-demolition { 
    background-color: var(--color-danger); 
    border-style: dashed;
    color: #721c24; 
}

.room-name { 
    font-weight: 600; 
    font-size: 0.85em;
    color: var(--theme-text-color);
    line-height: 1.2;
}

.room-occupant { 
    font-size: 0.75em; 
    color: var(--theme-subtitle-color); 
    margin-top: 4px; 
    background-color: rgba(255,255,255,0.5);
    padding: 2px 6px;
    border-radius: 10px;
}

.add-room-card { 
    background-color: var(--color-add-room); 
    border: 2px dashed var(--theme-border-color); 
    font-size: 1.5em; 
    color: var(--theme-subtitle-color); 
}

.add-floor-btn { 
    width: 100%; 
    min-width: 1515px; 
    padding: 10px; 
    background-color: var(--color-add-room); 
    border: 2px dashed var(--theme-border-color); 
    border-radius: 8px; 
    cursor: pointer; 
    font-weight: bold; 
    color: var(--theme-text-color); 
    font-size: 0.9em; 
    display: block; 
    box-sizing: border-box; 
}

.add-room-btn { 
    width: 100%; 
    padding: 10px; 
    background-color: var(--color-add-room); 
    border: 2px dashed var(--theme-border-color); 
    border-radius: 8px; 
    cursor: pointer; 
    font-weight: bold; 
    margin: 10px 0; 
    color: var(--theme-text-color); 
    font-size: 0.9em; 
    display: block; 
    box-sizing: border-box; 
}

.slot-indicator { 
    font-size: 0.7em; 
    color: var(--theme-subtitle-color); 
    margin-top: 3px; 
}

.outdoor-room { 
    background-color: var(--color-outdoor); 
    min-height: 100%; 
}

.floor-wrapper { 
    display: flex; 
    align-items: stretch; 
    width: 100%; 
    min-width: 1515px; 
}

.floor-outdoor-left { 
    width: 120px; 
    flex-shrink: 0; 
    display: flex; 
    flex-direction: column; 
}

.floor-outdoor-right { 
    width: 120px; 
    flex-shrink: 0; 
    display: flex; 
    flex-direction: column; 
}

.floor-main { 
    flex: 1; 
    display: flex; 
    justify-content: center; 
    align-items: stretch; 
}

.outdoor-card { 
    width: 100%; 
    flex: 1; 
    display: flex; 
    flex-direction: column; 
    align-items: center; 
    justify-content: center; 
    text-align: center; 
    padding: 10px; 
    font-size: 0.85em; 
}

/* ==================== 浮动UI ==================== */
.floating-ui { 
    position: absolute; 
    bottom: 80px; 
    right: 20px; 
    z-index: 10; 
    display: flex; 
    flex-direction: column; 
    align-items: flex-end;
    gap: 10px; 
}

.zoom-controls { 
    display: flex; 
    flex-direction: column; 
    gap: 5px;
}

.zoom-btn, .confirm-btn { 
    width: 45px; 
    height: 45px; 
    border-radius: 50%; 
    border: none; 
    background-color: rgba(0, 0, 0, 0.6);
    color: white; 
    font-size: 24px; 
    font-weight: bold; 
    cursor: pointer; 
    line-height: 1; 
}

.confirm-btn { 
    width: auto;
    padding: 0 20px; 
    border-radius: 25px; 
    font-size: 18px; 
    background-color: #28a745; 
}

/* ==================== 模态框 ==================== */
.modal-overlay { 
    position: absolute; 
    top: 0;
    left: 0; 
    width: 100%; 
    height: 100%; 
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex; 
    justify-content: center; 
    align-items: center; 
    z-index: 2000;
    animation: modalFadeIn 0.2s ease;
}

@keyframes modalFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.modal-content { 
    background: rgba(255, 255, 255, 0.85); /* Mac Light mode base */
    backdrop-filter: blur(25px);
    -webkit-backdrop-filter: blur(25px);
    color: #333; 
    padding: 24px; 
    border-radius: 18px; 
    width: 90%; 
    max-width: 400px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.4) inset;
    border: 1px solid rgba(0,0,0,0.1);
    animation: modalScaleIn 0.25s cubic-bezier(0.19, 1, 0.22, 1);
    display: flex;
    flex-direction: column;
    gap: 15px;
}

/* Dark mode support for modals via CSS variable override in script if needed, 
   but enforcing Mac-like light/glass by default for "Candy" feel */

@keyframes modalScaleIn {
    from { transform: scale(0.9); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
}
    box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 8px 20px rgba(0,0,0,0.1);
    animation: modalSlideIn 0.3s ease;
}

@keyframes modalSlideIn {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

.modal-title { 
    margin: 0 0 8px 0;
    font-size: 1.3em;
    font-weight: 600;
}

.modal-subtitle { 
    color: var(--theme-subtitle-color); 
    margin: 0 0 24px 0;
    font-size: 0.95em;
}

.modal-choices button, .modal-confirm-btn { 
    display: block;
    width: 100%; 
    padding: 14px 16px; 
    margin-bottom: 12px; 
    font-size: 1em;
    font-weight: 500;
    border-radius: 12px; 
    border: 1px solid var(--theme-border-color); 
    cursor: pointer; 
    background: var(--theme-modal-btn-bg); 
    color: var(--theme-text-color);
    transition: all 0.2s ease;
}

.modal-choices button:hover, .modal-confirm-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border-color: var(--accent-color);
}

.modal-choices button:disabled { 
    background-color: #ccc; 
    color: #666; 
    cursor: not-allowed;
}

.modal-functional-input { 
    margin-top: 15px; 
}

.modal-functional-input input, 
.modal-functional-input select { 
    width: 100%; 
    padding: 12px 14px;
    box-sizing: border-box; 
    border: 2px solid var(--theme-border-color); 
    border-radius: 10px; 
    margin-bottom: 12px; 
    background-color: #ffffff !important;
    color: #1e293b !important;
    font-size: 1em;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
}

/* 暗色模式下的输入框 */
.dark-theme .modal-functional-input input,
.dark-theme .modal-functional-input select {
    background-color: #1e293b !important;
    color: #f1f5f9 !important;
    border-color: #475569;
}

/* 选择框的下拉箭头 */
.modal-functional-input select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
}

.dark-theme .modal-functional-input select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ccc' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
}

.modal-functional-input input:focus,
.modal-functional-input select:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

.modal-functional-input input::placeholder {
    color: #94a3b8 !important;
}

.dark-theme .modal-functional-input input::placeholder {
    color: #64748b !important;
}

.hidden { 
    display: none !important; 
}

.danger-btn { 
    background-color: var(--color-danger); 
    border-color: #f5c6cb; 
    color: #721c24;
}



/* ==================== 信息模态框美化 ==================== */
#info-modal .modal-content {
    padding: 0;
    overflow: hidden;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
}

#info-modal-header {
    padding: 20px 25px;
    border-bottom: 1px solid var(--theme-border-color);
    flex-shrink: 0;
}

#info-modal-details {
    padding: 20px 25px;
    overflow-y: auto;
    flex: 1;
    max-height: calc(80vh - 100px);
}

#info-modal-details ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

#info-modal-details li {
    padding: 8px 0;
    border-bottom: 1px solid var(--theme-border-color);
    font-size: 0.95em;
}

#info-modal-details li:last-child {
    border-bottom: none;
}

#info-modal-details li strong {
    color: var(--theme-subtitle-color);
    margin-right: 10px;
    display: inline-block;
    width: 50px;
}

#info-modal-details p strong {
    font-weight: 600;
    margin-right: 5px;
}

.progress-bar-container {
    display: flex;
    align-items: center;
    gap: 10px;
}

.progress-bar {
    flex-grow: 1;
    height: 12px;
    background-color: var(--progress-bar-bg);
    border-radius: 6px;
    overflow: hidden;
}

.progress-bar-fill {
    height: 100%;
    width: 0%;
    border-radius: 6px;
    transition: width 0.5s ease-in-out;
}

.progress-bar-favor { 
    background-color: var(--progress-bar-favor-fill); 
}

.progress-bar-lust { 
    background-color: var(--progress-bar-lust-fill); 
}

.progress-value {
    font-weight: bold;
    font-size: 0.9em;
    min-width: 30px;
    text-align: right;
}

/* ==================== 格子选择器 ==================== */
.grid-cell {
    padding: 15px 5px;
    border: 2px solid var(--theme-border-color);
    border-radius: 5px;
    text-align: center;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s;
    background-color: var(--color-empty);
}

.grid-cell.occupied {
    background-color: #ddd !important;
    cursor: not-allowed !important;
    opacity: 0.5;
}

.grid-cell.selected {
    background-color: var(--color-add-room) !important;
    border-color: #28a745 !important;
    font-weight: bold;
}

.grid-cell.start-point {
    border-color: #007bff !important;
    box-shadow: 0 0 0 2px #007bff;
}

.grid-cell.end-point {
    border-color: #28a745 !important;
    box-shadow: 0 0 0 2px #28a745;
}

.grid-cell:not(.occupied):active {
    transform: scale(0.95);
}

#info-modal-details:has(.tenant-carousel) {
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* ==================== 租客轮播（合租信息） ==================== */
.tenant-carousel {
    position: relative;
    overflow: hidden;
    flex: 1;
    min-height: 0;
}

.tenant-carousel-track {
    display: flex;
    transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    height: 100%;
}

.tenant-carousel-slide {
    min-width: 100%;
    width: 100%;
    max-width: 100%;
    flex-shrink: 0;
    padding: 20px 25px;
    overflow-y: auto;
    overflow-x: hidden;
    box-sizing: border-box;
    word-break: break-word;
    overflow-wrap: break-word;
}

.tenant-carousel-slide .slide-name {
    font-size: 1.1em;
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--theme-text-color);
}

.tenant-carousel-slide .slide-sub {
    font-size: 0.85em;
    color: var(--theme-subtitle-color);
    margin-bottom: 12px;
}

.tenant-carousel-slide ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

.tenant-carousel-slide li {
    padding: 8px 0;
    border-bottom: 1px solid var(--theme-border-color);
    font-size: 0.95em;
    word-break: break-word;
    overflow-wrap: break-word;
}

.tenant-carousel-slide li:last-child {
    border-bottom: none;
}

.tenant-carousel-slide li strong {
    color: var(--theme-subtitle-color);
    margin-right: 10px;
    display: inline-block;
    width: 50px;
}

.tenant-carousel-nav {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 10px 20px;
    gap: 16px;
    border-top: 1px solid var(--theme-border-color);
    flex-shrink: 0;
}

.carousel-arrow {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--theme-border-color);
    background: var(--theme-container-bg);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.2s;
    color: var(--theme-text-color);
}

.carousel-arrow:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

.carousel-arrow:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.carousel-dots {
    display: flex;
    gap: 6px;
    align-items: center;
}

.carousel-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(0,0,0,0.15);
    transition: all 0.2s;
    cursor: pointer;
}

.carousel-dot.active {
    background: var(--accent-color);
    transform: scale(1.3);
}

.dark-theme .carousel-dot {
    background: rgba(255,255,255,0.2);
}

/* ==================== Mac Scrollbar ==================== */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.35); }
::-webkit-scrollbar-corner { background: transparent; }

</style>
`;

// ==================== HTML 结构 ====================
const html = `
<!-- 拖动按钮 -->
<div id="apartment-toggle-btn" class="apartment-toggle-btn">
    <img src="https://api.iconify.design/ri:building-4-fill.svg?color=%23ffffff" style="width:28px;height:28px;">
</div>

<!-- 主面板 (Pink Mac Window) -->
<div id="apartment-main-panel" class="apartment-main-panel">
    <!-- Pink Title Bar -->
    <div class="mac-title-bar">
        <div class="window-controls">
            <div class="control-dot red" title="关闭" onclick="document.getElementById('apartment-main-panel').classList.remove('active')"></div>
            <div class="control-dot yellow" title="最小化"></div>
            <div class="control-dot green" title="最大化"></div>
        </div>
        <!-- No Title Text -->
    </div>
    
    <!-- Status Bar Line (Time/Date) -->
    <div class="status-bar-line">
        <span id="mode-display" style="margin-right:auto; font-size:12px; padding:2px 6px; border-radius:4px; border:1px solid #E68A96;"></span>
        <div class="status-clock">
             <span id="date-display">...</span> <span id="time-display"></span>
        </div>
    </div>
    
    <div class="canvas-viewport" id="screen">
        <div id="apartment-canvas">
            <!-- 动态生成的公寓楼层将插入这里 -->
        </div>
        <div class="floating-ui">
            <button id="execute-actions-btn" class="confirm-btn hidden"></button>
            <div class="zoom-controls">
                <button id="zoom-in-btn" class="zoom-btn">+</button>
                <button id="zoom-out-btn" class="zoom-btn">-</button>
            </div>
        </div>
    </div>
    
    <footer class="mobile-footer">
        <button id="recruitment-btn" class="dock-button">
            <span class="dock-button-icon">👤</span>
            <span>招募</span>
        </button>
        <button id="build-mode-btn" class="dock-button">
            <span class="dock-button-icon">🔨</span>
            <span>建造</span>
        </button>

        <button id="relation-btn" class="dock-button">
            <span class="dock-button-icon">🕸️</span>
            <span>关系</span>
        </button>
        <button id="settings-btn" class="dock-button">
            <span class="dock-button-icon">⚙️</span>
            <span>设置</span>
        </button>
    </footer>
    
</div>

<!-- 所有模态框 -->
<div id="add-room-modal" class="modal-overlay hidden">
    <div class="modal-content">
        <h2 class="modal-title" id="add-room-modal-title">新建房间</h2>
        <p class="modal-subtitle" id="add-room-modal-subtitle"></p>
        <div class="modal-functional-input">
            <div id="grid-selector-container" style="margin: 15px 0;">
                <label style="font-weight: bold; margin-bottom: 10px; display: block;">
                    选择房间位置（点击并拖动选择连续格子）：
                </label>
                <div id="grid-selector" style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; margin: 10px 0; user-select: none;"></div>
                <p id="selected-range-display" style="margin-top: 10px; font-size: 0.9em; color: var(--theme-subtitle-color);"></p>
            </div>
            <label>房间类型：</label>
            <select id="add-room-type">
                <option value="卧室">卧室</option>
                <option value="功能性房间">功能性房间</option>
            </select>
            <div id="add-room-custom-name-area" style="display: none;">
                <label>房间名称：</label>
                <input type="text" id="add-room-custom-name" placeholder="例如：书房">
            </div>
            <button id="confirm-add-room-btn" class="modal-confirm-btn">确认新建</button>
        </div>
    </div>
</div>

<div id="add-floor-modal" class="modal-overlay hidden">
    <div class="modal-content">
        <h2 class="modal-title">新建楼层</h2>
        <div class="modal-functional-input">
            <label>楼层名称：</label>
            <input type="text" id="add-floor-name" placeholder="例如：五楼、地下二楼">
            <label>楼层位置：</label>
            <select id="add-floor-position">
                <option value="top">最顶层（向上扩展）</option>
                <option value="bottom">最底层（向下扩展）</option>
            </select>
            <button id="confirm-add-floor-btn" class="modal-confirm-btn">确认新建</button>
        </div>
    </div>
</div>

<div id="management-modal" class="modal-overlay hidden">
    <div class="modal-content">
        <h2 id="management-modal-title" class="modal-title"></h2>
        <p id="management-modal-subtitle" class="modal-subtitle"></p>
        <div id="management-modal-choices" class="modal-choices"></div>
    </div>
</div>

<div id="info-modal" class="modal-overlay hidden">
    <div class="modal-content">
        <div id="info-modal-header">
            <h2 id="info-modal-title" class="modal-title"></h2>
            <p id="info-modal-subtitle" class="modal-subtitle"></p>
        </div>
        <div id="info-modal-details"></div>
    </div>
</div>

<div id="recruitment-modal" class="modal-overlay hidden">
    <div class="modal-content">
        <h2 class="modal-title">招募新租客</h2>
        <p class="subtitle">请输入您期望的租客特征</p>
        <div class="modal-functional-input">
            <input type="text" id="recruitment-keywords" placeholder="例如：人妻、金发、JK">
            <button id="confirm-recruitment-btn" class="modal-confirm-btn">确认招募</button>
        </div>
    </div>
</div>



<div id="settings-modal" class="modal-overlay hidden">
    <div class="modal-content">
        <h2 class="modal-title">系统设置</h2>
        <div class="modal-choices">
            <button data-theme="light">☀️ 光辉白日</button>
            <button data-theme="dark">🌙 静谧夜晚</button>
        </div>
    </div>
</div>

<div id="relation-modal" class="modal-overlay hidden">
    <div class="modal-content" style="max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
        <h2 class="modal-title">🕸️ 关系网络</h2>
        <p class="modal-subtitle" style="margin-bottom: 15px;">点击查看该角色对其他人的关系</p>
        <div id="relation-content" style="flex: 1; overflow-y: auto; padding: 10px 0;">
            <p style="color: var(--theme-subtitle-color);">加载中...</p>
        </div>
    </div>
</div>
`;

// ==================== JavaScript 功能实现 ====================

// 全局变量
let isBuildMode = false;
let actionQueue = {};
let currentEditingRoomId = null;
let currentEditingRoomName = null;
let currentFloorForNewRoom = null;
let cachedMVUData = null;
let btnDragData = null;  // 按钮拖动数据

let scale = 1, posX = 0, posY = 0;
let isDragging = false, hasDragged = false;
let startX, startY, lastX, lastY;

const MAX_RETRIES = 5;
const RETRY_DELAY = 400;
let currentRetry = 0;

// ==================== 工具函数 ====================
function SafeGetValue(data, path, defaultValue = '未知') {
    if (!data) return defaultValue;
    const keys = path.split('.');
    let current = data;
    for (const key of keys) {
        if (current === undefined || current === null || typeof current !== 'object' || !current.hasOwnProperty(key)) {
            return defaultValue;
        }
        current = current[key];
    }
    if (current === undefined || current === null) return defaultValue;
    // MVU Zod 直接存储值，不再使用数组包装
    return String(current) === '' ? defaultValue : String(current);
}

function countCurrentTenants(data) {
    // MVU Zod 直接存储对象，不使用[0]索引
    const tenantList = data?.租客列表;
    if (!tenantList) return 0;
    let count = 0;
    for (const key in tenantList) {
        if (typeof tenantList[key] === 'object') {
            count++;
        }
    }
    return count;
}

// 统计空余卧室数量（类型为"卧室"且住户为"无"的房间）
function countEmptyBedrooms(data) {
    const rooms = data?.公寓?.房间列表;
    if (!rooms) return 0;
    return Object.values(rooms).filter(room =>
        room.类型 === '卧室' && room.住户 === '无'
    ).length;
}

function parsePosition(posStr) {
    const parts = posStr.split('-');
    return { start: parseInt(parts[0]), end: parseInt(parts[1]) };
}

function calculateSize(posStr) {
    const pos = parsePosition(posStr);
    return pos.end - pos.start + 1;
}

function findAvailableSlots(floorName, roomsData, totalCapacity = 10) {
    const occupied = [];
    for (const roomKey in roomsData) {
        // MVU Zod格式：直接访问房间的楼层和位置属性
        const room = roomsData[roomKey];
        if (room && room.楼层 === floorName) {
            const pos = parsePosition(room.位置 || '1-2');
            for (let i = pos.start; i <= pos.end; i++) {
                occupied.push(i);
            }
        }
    }
    const available = [];
    let start = null;
    for (let i = 1; i <= totalCapacity; i++) {
        if (!occupied.includes(i)) {
            if (start === null) start = i;
            if (i === totalCapacity || occupied.includes(i + 1)) {
                available.push({ start, end: i, size: i - start + 1 });
                start = null;
            }
        } else {
            start = null;
        }
    }
    return available;
}

// ==================== 清理函数 ====================
// 【按照悬浮球示例】使用酒馆助手的$操作父页面DOM
function cleanupApartmentPlugin() {
    console.log('🧹 清理掌上公寓插件...');

    // 1. 清理拖拽状态
    if (typeof btnDragData !== 'undefined') {
        window.btnDragData = null;
    }

    // 2. 从 FloatingMenuManager 反注册
    if (window.parent.FloatingMenuManager) {
        window.parent.FloatingMenuManager.unregisterButton('apartment');
    }

    // 3. 精确移除插件的主界面和样式（含fallback悬浮球）
    $('#apartment-toggle-btn').remove();
    $('#apartment-main-panel').remove();
    $('#apartment-plugin-styles').remove();

    // 3. 只移除属于本插件的特定模态框，避免使用模糊匹配 [id$="-modal"]
    // 这样不会误删st-chatu8等其他插件的模态框
    const apartmentModals = [
        '#add-room-modal',
        '#add-floor-modal',
        '#management-modal',
        '#info-modal',
        '#recruitment-modal',
        '#settings-modal',
        '#relation-modal',
        '#confirm-modal',
        '#tenant-modal'
    ];

    apartmentModals.forEach(selector => {
        $(selector).remove();
    });

    // 4. 移除绑定在父页面document上的命名空间事件
    $(window.parent.document).off('.apartment-plugin');

    console.log('✅ 掌上公寓插件清理完成，已避开其他插件组件');
}

// 暴露清理函数到全局
window.cleanupApartmentPlugin = cleanupApartmentPlugin;

// ==================== 初始化函数 ====================
// 【按照悬浮球示例】使用酒馆助手的$操作父页面DOM
function initializeApartmentPlugin() {
    console.log('🚀 初始化掌上公寓插件...');

    // 每次初始化时都先彻底清理旧的，确保干净启动
    cleanupApartmentPlugin();

    // 使用jQuery注入样式到父页面的head（酒馆助手的$直接操作父页面）
    if ($('#apartment-plugin-styles').length === 0) {
        // 提取style标签内容
        const styleContent = styles.replace('<style id="apartment-plugin-styles">', '').replace('</style>', '');
        $('<style>')
            .attr('id', 'apartment-plugin-styles')
            .html(styleContent)
            .appendTo('head');
        console.log('✅ 样式已注入到父页面');
    }

    // 使用jQuery注入HTML到父页面的body（酒馆助手的$直接操作父页面）
    $(html).appendTo('body');
    console.log('✅ HTML已注入到父页面');

    // 获取父页面document用于后续操作
    const targetDoc = window.parent.document;

    // ============ 注册到悬浮球菜单管理器 ============
    if (window.parent.FloatingMenuManager) {
        // 使用统一菜单系统
        console.log('[掌上公寓] 注册到FloatingMenuManager');

        const panel = targetDoc.getElementById('apartment-main-panel');

        window.parent.FloatingMenuManager.registerButton({
            id: 'apartment',
            icon: '<img src="https://api.iconify.design/mdi:home-city.svg?color=%23ffffff" style="width:26px;height:26px;">',
            label: '掌上公寓',
            onClick: function() {
                panel.classList.toggle('active');
                // 打开面板时加载数据
                if (panel.classList.contains('active')) {
                    currentRetry = 0;
                    populateDataWithMVU(targetDoc);
                }
            },
            color: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            order: 3
        });

        // 隐藏独立悬浮球按钮
        const btn = targetDoc.getElementById('apartment-toggle-btn');
        if (btn) btn.style.display = 'none';

    } else {
        // 降级方案：使用独立悬浮球
        console.log('[掌上公寓] FloatingMenuManager未加载，使用独立悬浮球');

        // 从 localStorage 恢复按钮位置
        const $btn = $('#apartment-toggle-btn');
        try {
            const saved = localStorage.getItem('apartment-btn-position');
            if (saved) {
                const pos = JSON.parse(saved);
                $btn.css({
                    left: pos.left + 'px',
                    top: pos.top + 'px'
                });
                console.log('📍 恢复按钮位置:', pos);
            }
        } catch (e) {
            console.warn('⚠️ 恢复按钮位置失败');
        }

        // 初始化按钮拖动功能
        initializeButtonDrag(targetDoc);
    }

    // 初始化公寓系统
    initializeApartmentSystem(targetDoc);

    console.log('✅ 掌上公寓插件初始化完成！');
}

// ==================== 按钮拖动功能 ====================
function initializeButtonDrag(targetDoc) {
    const btn = targetDoc.getElementById('apartment-toggle-btn');
    const panel = targetDoc.getElementById('apartment-main-panel');
    const $targetDoc = $(targetDoc);

    // 【按照悬浮球示例】使用父窗口
    const targetWindow = window.parent;

    // 拖动开始 - 【优化】使用getBoundingClientRect
    function handleBtnDragStart(clientX, clientY) {
        if (btnDragData) return false;

        // 使用getBoundingClientRect获取位置（与悬浮球示例相同）
        const rect = btn.getBoundingClientRect();

        btnDragData = {
            startX: clientX,
            startY: clientY,
            initialLeft: rect.left,
            initialTop: rect.top
        };

        btn.classList.add('dragging');
        return true;
    }

    // 拖动移动 - 【优化】使用直接赋值和window.parent.innerWidth
    function handleBtnDragMove(clientX, clientY) {
        if (!btnDragData) return;

        const deltaX = clientX - btnDragData.startX;
        const deltaY = clientY - btnDragData.startY;

        let newLeft = btnDragData.initialLeft + deltaX;
        let newTop = btnDragData.initialTop + deltaY;

        // 边界限制（使用父窗口的尺寸，与悬浮球示例相同）
        const btnSize = 60;
        const maxX = window.parent.innerWidth - btnSize;
        const maxY = window.parent.innerHeight - btnSize;

        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(0, Math.min(newTop, maxY));

        btn.style.left = newLeft + 'px';
        btn.style.top = newTop + 'px';
    }

    // 拖动结束
    function handleBtnDragEnd(clientX, clientY) {
        if (!btnDragData) return;

        btn.classList.remove('dragging');

        // 计算拖动距离
        const deltaX = clientX - btnDragData.startX;
        const deltaY = clientY - btnDragData.startY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // 保存位置 - 使用getBoundingClientRect（与悬浮球示例相同）
        const rect = btn.getBoundingClientRect();
        const position = {
            left: rect.left,
            top: rect.top
        };

        localStorage.setItem('apartment-btn-position', JSON.stringify(position));

        btnDragData = null;

        // 如果是点击（移动距离小于5像素），打开/关闭面板
        if (distance < 5) {
            console.log('🎨 检测到点击，切换面板');
            panel.classList.toggle('active');
            // 打开面板时加载数据
            if (panel.classList.contains('active')) {
                currentRetry = 0;  // 重置重试计数器
                populateDataWithMVU(targetDoc);
            }
        }
    }

    // 绑定事件
    $(btn).on('mousedown.apartment-plugin', function (e) {
        if (handleBtnDragStart(e.clientX, e.clientY)) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    $(btn).on('touchstart.apartment-plugin', function (e) {
        const touch = e.originalEvent.touches[0];
        if (handleBtnDragStart(touch.clientX, touch.clientY)) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    $targetDoc.on('mousemove.apartment-plugin', function (e) {
        handleBtnDragMove(e.clientX, e.clientY);
        if (btnDragData) e.preventDefault();
    });

    $targetDoc.on('touchmove.apartment-plugin', function (e) {
        const touch = e.originalEvent.touches[0];
        handleBtnDragMove(touch.clientX, touch.clientY);
        if (btnDragData) e.preventDefault();
    });

    $targetDoc.on('mouseup.apartment-plugin', function (e) {
        handleBtnDragEnd(e.clientX, e.clientY);
    });

    $targetDoc.on('touchend.apartment-plugin touchcancel.apartment-plugin', function (e) {
        const touch = e.originalEvent.changedTouches[0];
        if (touch) {
            handleBtnDragEnd(touch.clientX, touch.clientY);
        } else {
            handleBtnDragEnd(0, 0);
        }
    });

    console.log('✅ 按钮拖动功能已初始化');
}

// ==================== 公寓系统初始化 ====================
function initializeApartmentSystem(targetDoc) {
    const screen = targetDoc.getElementById('screen');
    const canvas = targetDoc.getElementById('apartment-canvas');
    const modeDisplay = targetDoc.getElementById('mode-display');
    const buildModeBtn = targetDoc.getElementById('build-mode-btn');
    const allModals = targetDoc.querySelectorAll('.modal-overlay');

    // 恢复上次保存的主题
    try {
        const savedTheme = localStorage.getItem('apartment_theme');
        if (savedTheme === 'dark') {
            targetDoc.getElementById('apartment-main-panel').classList.add('dark-theme');
        }
    } catch(e) {}

    // 设置初始模式
    modeDisplay.textContent = '观察模式';
    modeDisplay.className = 'observation-mode';

    // 视图控制函数
    function updateTransform() {
        canvas.style.transform = `translate(calc(-50% + ${posX}px), calc(-50% + ${posY}px)) scale(${scale})`;
    }

    function zoom(factor) {
        scale = Math.min(Math.max(0.2, scale * factor), 2);
        updateTransform();
    }

    // 拖动画布
    function handleDragStart(e) {
        // 检查是否点击在按钮等UI控件上（不包括房间卡片，房间卡片需要接收点击）
        const target = e.target;
        if (target.closest('.dock-button') ||
            target.closest('.zoom-btn') ||
            target.closest('.confirm-btn') ||
            target.closest('.add-room-btn') ||
            target.closest('.add-floor-btn') ||
            target.closest('.level-title') ||
            (target.tagName === 'BUTTON' && !target.closest('.room-card'))) {
            return; // 点击UI控件时不触发拖动
        }

        isDragging = true;
        hasDragged = false;
        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;
        lastX = posX;
        lastY = posY;
        targetDoc.body.classList.add('no-select');
    }

    let rafId = null;
    function handleDragMove(e) {
        if (!isDragging) return;
        const touch = e.touches ? e.touches[0] : e;
        const currentX = touch.clientX;
        const currentY = touch.clientY;

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        // 降低拖动阈值到5像素，让拖动更跟手
        if (!hasDragged && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
            hasDragged = true;
            // 重置起点，避免瞬移
            startX = currentX;
            startY = currentY;
            lastX = posX;
            lastY = posY;
        }

        if (hasDragged) {
            e.preventDefault();
            // 使用新的起点计算增量
            const newDeltaX = currentX - startX;
            const newDeltaY = currentY - startY;

            // 使用requestAnimationFrame避免抖动
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                posX = lastX + newDeltaX;
                posY = lastY + newDeltaY;
                updateTransform();
                rafId = null;
            });
        }
    }

    function handleDragEnd(e) {
        const wasDragging = isDragging;
        if (isDragging) {
            isDragging = false;
            targetDoc.body.classList.remove('no-select');
        }

        // 在鼠标释放后立即检查并重置 hasDragged
        // 但要给 onclick 一个小延迟来正确读取状态
        if (!hasDragged) {
            // 如果没有拖动，立即重置（实际上已经是 false）
            hasDragged = false;
        } else {
            // 如果有拖动，延迟重置，让 onclick 能够正确判断
            setTimeout(() => {
                hasDragged = false;
            }, 50);
        }
    }

    // 绑定画布拖动事件 - 确保事件只在真正需要时触发
    screen.addEventListener('mousedown', handleDragStart);
    targetDoc.addEventListener('mousemove', handleDragMove);  // 绑定到document而不是screen
    targetDoc.addEventListener('mouseup', handleDragEnd);
    screen.addEventListener('touchstart', handleDragStart, { passive: true });
    targetDoc.addEventListener('touchmove', handleDragMove, { passive: false });
    targetDoc.addEventListener('touchend', handleDragEnd);

    // 绑定按钮事件
    targetDoc.getElementById('zoom-in-btn').addEventListener('click', () => zoom(1.2));
    targetDoc.getElementById('zoom-out-btn').addEventListener('click', () => zoom(0.8));
    targetDoc.getElementById('build-mode-btn').addEventListener('click', toggleBuildMode);
    targetDoc.getElementById('recruitment-btn').addEventListener('click', openRecruitmentModal);
    targetDoc.getElementById('settings-btn').addEventListener('click', openSettingsModal);
    targetDoc.getElementById('relation-btn').addEventListener('click', window.parent.openRelationModal);



    // 绑定模态框关闭
    allModals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeAllModals();
        });
    });

    // 新建房间相关
    targetDoc.getElementById('add-room-type').addEventListener('change', (e) => {
        const customNameArea = targetDoc.getElementById('add-room-custom-name-area');
        if (e.target.value === '功能性房间') {
            customNameArea.style.display = 'block';
        } else {
            customNameArea.style.display = 'none';
        }
    });
    targetDoc.getElementById('confirm-add-room-btn').addEventListener('click', confirmAddRoom);
    targetDoc.getElementById('confirm-add-floor-btn').addEventListener('click', confirmAddFloor);
    targetDoc.getElementById('confirm-recruitment-btn').addEventListener('click', confirmRecruitment);

    // 设置主题切换
    targetDoc.querySelector('#settings-modal .modal-choices').addEventListener('click', (e) => {
        if (e.target.dataset.theme) switchTheme(e.target.dataset.theme);
    });

    // 事件生成器（如果存在）
    const closeEventBtn = targetDoc.getElementById('close-event-modal-btn');
    if (closeEventBtn) closeEventBtn.addEventListener('click', closeEventGenerator);
    const singleEvents = targetDoc.getElementById('single-events');
    if (singleEvents) {
        singleEvents.addEventListener('click', (e) => {
            if (e.target.matches('.event-button')) {
                triggerEvent(e.target.dataset.eventType, '个人');
            }
        });
    }
    const groupEvents = targetDoc.getElementById('group-events');
    if (groupEvents) {
        groupEvents.addEventListener('click', (e) => {
            if (e.target.matches('.event-button')) {
                triggerEvent(e.target.dataset.eventType, '集体');
            }
        });
    }

    // 模式切换函数
    function toggleBuildMode() {
        isBuildMode = !isBuildMode;
        buildModeBtn.classList.toggle('active');
        if (isBuildMode) {
            modeDisplay.textContent = '建造模式';
            modeDisplay.className = 'build-mode';
        } else {
            modeDisplay.textContent = '观察模式';
            modeDisplay.className = 'observation-mode';
        }
        if (cachedMVUData) {
            renderApartment(cachedMVUData, targetDoc);
        }
    }

    // 居中视图
    function centerView() {
        setTimeout(() => {
            const viewportWidth = screen.offsetWidth;
            const viewportHeight = screen.offsetHeight;
            const canvasWidth = 1515;

            const scaleX = (viewportWidth - 40) / canvasWidth;
            const scaleY = (viewportHeight - 40) / 800;
            const rawScale = Math.min(1, Math.max(0.25, Math.min(scaleX, scaleY)));
            scale = Math.round(rawScale * 20) / 20; // 四舍五入到0.05，减少文字模糊

            posX = 0;
            posY = 0;

            updateTransform();
        }, 200);
    }

    centerView();
    console.log('✅ 公寓系统已初始化');
}

// ==================== 数据加载函数 ====================
async function populateDataWithMVU(targetDoc) {
    try {
        // 检查MVU是否可用
        if (typeof Mvu === 'undefined') {
            // 尝试从父窗口获取
            if (window.parent && typeof window.parent.Mvu !== 'undefined') {
                window.Mvu = window.parent.Mvu;
                console.log('✅ 已从父窗口引用MVU');
            } else {
                console.warn('⚠️ MVU框架未加载');
                if (currentRetry < MAX_RETRIES) {
                    currentRetry++;
                    setTimeout(() => populateDataWithMVU(targetDoc), RETRY_DELAY);
                } else {
                    targetDoc.getElementById('date-display').innerText = "MVU未加载";
                }
                return;
            }
        }

        // 智能获取应该显示的数据
        let targetMessageId = 'latest';
        if (typeof getLastMessageId === 'function' && typeof getChatMessages === 'function') {
            let currentId = getLastMessageId();

            while (currentId >= 0) {
                const message = getChatMessages(currentId).at(-1);
                if (message && message.role !== 'user') {
                    targetMessageId = currentId;
                    if (currentId !== getLastMessageId()) {
                        console.log(`📝 向上查找到第 ${currentId} 层的AI消息`);
                    }
                    break;
                }
                currentId--;
            }

            if (currentId < 0) {
                targetMessageId = 'latest';
                console.warn('⚠️ 没有找到AI消息，使用最后一层');
            }
        }

        // 使用Mvu.getMvuData获取数据
        const mvuResult = Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
        const data = mvuResult?.stat_data;

        if (!data) {
            console.warn('⚠️ MVU数据为空');
            if (currentRetry < MAX_RETRIES) {
                currentRetry++;
                setTimeout(() => populateDataWithMVU(targetDoc), RETRY_DELAY);
            } else {
                targetDoc.getElementById('date-display').innerText = "未能加载数据QAQ";
            }
            return;
        }

        cachedMVUData = data;
        console.log('✅ 数据加载成功', data);

        // 更新时间显示
        const world = data.世界;
        targetDoc.getElementById('date-display').textContent = `${SafeGetValue(world, '年份')} ${SafeGetValue(world, '日期')} ${SafeGetValue(world, '星期')}`;
        targetDoc.getElementById('time-display').textContent = SafeGetValue(world, '时间');

        // 更新招募按钮状态
        const tenantCount = countCurrentTenants(data);
        const emptyBedrooms = countEmptyBedrooms(data);
        const recruitBtn = targetDoc.getElementById('recruitment-btn');

        // 无人数上限，仅在没有空余卧室时禁用（合租场景下用户仍可手动安排）
        recruitBtn.disabled = (emptyBedrooms === 0 && tenantCount > 0);

        // 更新按钮提示
        if (emptyBedrooms === 0 && tenantCount > 0) {
            recruitBtn.title = '没有空余卧室，请先建造卧室或安排合租';
        } else {
            recruitBtn.title = `可招募新租客（当前${tenantCount}人，空余卧室：${emptyBedrooms}）`;
        }

        // 渲染公寓
        renderApartment(data, targetDoc);

    } catch (error) {
        console.error("状态栏加载出错:", error);
        console.error("错误详情:", error.stack);
        targetDoc.getElementById('date-display').innerText = "加载出错: " + error.message;
    }
}

// ==================== 渲染公寓 ====================
function renderApartment(data, targetDoc) {

    // MVU Zod 格式：楼层列表是数组，房间列表是直接对象
    const floorList = data.公寓?.楼层列表;
    const roomsData = data.公寓?.房间列表;

    if (!floorList || !roomsData) return;

    // 从楼层列表数组构建楼层信息
    const floors = floorList.map((floorName, index) => ({
        key: floorName,
        name: floorName,
        order: floorList.length - index,  // 倒序排列，第一个楼层在最上面
        capacity: 10  // 默认每层10个格子
    }));

    const canvas = targetDoc.getElementById('apartment-canvas');
    canvas.innerHTML = '';

    // 添加新建楼层按钮（顶部）
    if (isBuildMode) {
        const addTopFloorBtn = document.createElement('button');
        addTopFloorBtn.className = 'add-floor-btn';
        addTopFloorBtn.textContent = '➕ 新建楼层（向上扩展）';
        addTopFloorBtn.onclick = () => openAddFloorModal('top');
        canvas.appendChild(addTopFloorBtn);
    }

    // 渲染每个楼层
    floors.forEach(floor => {
        const floorElement = createFloorElement(floor, roomsData, targetDoc);
        canvas.appendChild(floorElement);
    });

    // 添加新建楼层按钮（底部）
    if (isBuildMode) {
        const addBottomFloorBtn = document.createElement('button');
        addBottomFloorBtn.className = 'add-floor-btn';
        addBottomFloorBtn.textContent = '➕ 新建楼层（向下扩展）';
        addBottomFloorBtn.onclick = () => openAddFloorModal('bottom');
        canvas.appendChild(addBottomFloorBtn);
    }
}

// ==================== 创建楼层元素 ====================
function createFloorElement(floor, roomsData, targetDoc) {
    const floorRooms = [];
    const outdoorRooms = { left: null, right: null };

    for (const roomKey in roomsData) {
        const roomData = roomsData[roomKey];
        // MVU Zod格式：楼层和位置是房间对象的直接属性
        const roomFloor = roomData?.楼层;
        const position = roomData?.位置 || '1-2';

        if (roomFloor === floor.name) {
            if (position === 'outdoor-left') {
                outdoorRooms.left = { key: roomKey, data: roomData };
            } else if (position === 'outdoor-right') {
                outdoorRooms.right = { key: roomKey, data: roomData };
            } else {
                const pos = parsePosition(position);
                floorRooms.push({
                    key: roomKey,
                    data: roomData,
                    position: position,
                    start: pos.start,
                    end: pos.end,
                    size: pos.end - pos.start + 1
                });
            }
        }
    }
    floorRooms.sort((a, b) => a.start - b.start);

    const floorWrapper = document.createElement('div');
    floorWrapper.className = 'floor-wrapper';

    // 左侧区域
    const leftDiv = document.createElement('div');
    leftDiv.className = 'floor-outdoor-left';
    if (outdoorRooms.left) {
        leftDiv.appendChild(createOutdoorCard(outdoorRooms.left, targetDoc));
    }
    floorWrapper.appendChild(leftDiv);

    // 主楼层
    const mainDiv = document.createElement('div');
    mainDiv.className = 'floor-main';

    const floorDiv = document.createElement('div');
    floorDiv.className = 'level';
    floorDiv.dataset.floorKey = floor.key;

    const titleDiv = document.createElement('div');
    titleDiv.className = 'level-title';
    titleDiv.textContent = floor.name;
    floorDiv.appendChild(titleDiv);

    const gridDiv = document.createElement('div');
    gridDiv.className = 'room-grid';

    let currentPos = 1;
    floorRooms.forEach(room => {
        if (room.start > currentPos) {
            const emptySize = room.start - currentPos;
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'placeholder';
            emptyDiv.style.flexGrow = emptySize;
            gridDiv.appendChild(emptyDiv);
        }

        const roomCard = createRoomCard(room, targetDoc);
        gridDiv.appendChild(roomCard);
        currentPos = room.end + 1;
    });

    if (currentPos <= floor.capacity) {
        const emptySize = floor.capacity - currentPos + 1;
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'placeholder';
        emptyDiv.style.flexGrow = emptySize;
        gridDiv.appendChild(emptyDiv);
    }

    floorDiv.appendChild(gridDiv);

    if (isBuildMode) {
        const availableSlots = findAvailableSlots(floor.name, roomsData, floor.capacity);
        if (availableSlots.length > 0) {
            const addRoomBtn = document.createElement('button');
            addRoomBtn.className = 'add-room-btn';
            addRoomBtn.textContent = `➕ 在${floor.name}新建房间`;
            addRoomBtn.onclick = () => openAddRoomModal(floor.name, availableSlots);
            floorDiv.appendChild(addRoomBtn);
        }
    }

    mainDiv.appendChild(floorDiv);
    floorWrapper.appendChild(mainDiv);

    // 右侧区域
    const rightDiv = document.createElement('div');
    rightDiv.className = 'floor-outdoor-right';
    if (outdoorRooms.right) {
        rightDiv.appendChild(createOutdoorCard(outdoorRooms.right, targetDoc));
    }
    floorWrapper.appendChild(rightDiv);

    return floorWrapper;
}

//====================创建室外卡片====================
function createOutdoorCard(outdoorRoom, targetDoc) {
    const card = document.createElement('div');
    card.className = 'room-card outdoor-room outdoor-card actionable';
    card.dataset.roomName = outdoorRoom.key;

    const roomName = SafeGetValue(outdoorRoom.data, '名称');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'room-name';
    nameSpan.textContent = roomName;
    card.appendChild(nameSpan);

    // 阻止房间卡片触发画布拖动
    card.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    card.onclick = (e) => {
        e.stopPropagation();
        // 点击房间卡片时总是触发（因为我们已经阻止了拖动）
        handleRoomClick(card, targetDoc);
    };

    return card;
}

// ==================== 创建房间卡片 ====================
// ==================== 创建房间卡片 ====================
function createRoomCard(room, targetDoc) {
    const roomCard = document.createElement('div');
    roomCard.className = 'room-card actionable';
    roomCard.dataset.roomName = room.key;
    roomCard.style.flexGrow = room.size;

    const roomType = SafeGetValue(room.data, '类型');
    const roomName = SafeGetValue(room.data, '名称', room.key);
    const occupant = SafeGetValue(room.data, '住户');

    // 智能选择图标
    let icon = '📦';
    if (roomType === '您的房间') {
        roomCard.classList.add('your-room');
        icon = '👑';
    } else if (roomType === '固定设施') {
        roomCard.classList.add('fixed-room');
        if (roomName.includes('厨房')) icon = '🍳';
        else if (roomName.includes('卫') || roomName.includes('浴')) icon = '🚿';
        else if (roomName.includes('厅')) icon = '🛋️';
        else icon = '🏗️';
    } else if (roomType === '卧室') {
        roomCard.classList.add('bedroom-room');
        icon = '🛏️';
    } else if (roomType === '功能性房间') {
        roomCard.classList.add('functional-room');
        icon = '✨';
        // 根据名称猜测图标
        if (roomName.includes('书')) icon = '📚';
        else if (roomName.includes('健身') || roomName.includes('运动')) icon = '🏋️';
        else if (roomName.includes('影')) icon = '🎬';
        else if (roomName.includes('游') || roomName.includes('电')) icon = '🎮';
        else if (roomName.includes('餐') || roomName.includes('吃')) icon = '🍽️';
        else if (roomName.includes('衣')) icon = '👗';
        else if (roomName.includes('画') || roomName.includes('绘')) icon = '🎨';
        else if (roomName.includes('乐') || roomName.includes('琴')) icon = '🎹';
    } else {
        roomCard.classList.add('empty-room');
        icon = '🧱';
    }

    // 创建图标元素
    const iconSpan = document.createElement('div');
    iconSpan.className = 'room-icon';
    iconSpan.textContent = icon;
    roomCard.appendChild(iconSpan);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'room-name';
    nameSpan.textContent = roomName;
    roomCard.appendChild(nameSpan);

    if (roomType === '卧室') {
        const occupantSpan = document.createElement('span');
        occupantSpan.className = 'room-occupant';
        if (occupant !== '未知' && occupant !== '<user>' && occupant !== '{{user}}') {
            occupantSpan.textContent = `${occupant}`;
            roomCard.dataset.occupant = occupant;
        } else {
            occupantSpan.textContent = '空置';
        }
        roomCard.appendChild(occupantSpan);
    }

    // 阻止房间卡片触发画布拖动
    roomCard.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    roomCard.onclick = (e) => {
        e.stopPropagation();
        // 点击房间卡片时总是触发（因为我们已经阻止了拖动）
        handleRoomClick(roomCard, targetDoc);
    };

    return roomCard;
}

// ==================== 房间点击处理 ====================
function handleRoomClick(roomCard, targetDoc) {
    if (isBuildMode) {
        openManagementMenu(roomCard, targetDoc);
    } else {
        showTenantInfoModal(roomCard, targetDoc);
    }
}

// ==================== 租客信息显示 ====================
function buildTenantDetailHTML(tenantData) {
    let html = '<ul>';
    html += '<li><strong>外貌:</strong> ' + SafeGetValue(tenantData, '外貌') + '</li>';
    html += '<li><strong>性格:</strong> ' + SafeGetValue(tenantData, '性格') + '</li>';
    html += '<li><strong>状态:</strong> ' + SafeGetValue(tenantData, '状态') + '</li>';
    html += '<li><strong>内心:</strong> ' + SafeGetValue(tenantData, '内心') + '</li>';
    html += '</ul>';
    return html;
}

async function showTenantInfoModal(roomCard, targetDoc) {
    try {
        // 优先使用缓存数据，如果没有则重新获取
        let data = cachedMVUData;
        if (!data && typeof Mvu !== 'undefined') {
            let targetMessageId = 'latest';
            if (typeof getLastMessageId === 'function') {
                targetMessageId = getLastMessageId();
            }
            const mvuResult = Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
            data = mvuResult?.stat_data;
        }
        if (!data) return;
        const roomNameKey = roomCard.dataset.roomName;
        const occupantName = roomCard.dataset.occupant;

        if (!occupantName) {
            openInfoModal(roomCard, targetDoc, data);
            return;
        }

        // 查找租客数据 - 支持合租（住户字段可能是 "张小雪、林诗涵" 格式）
        const tenantList = data.租客列表;
        const occupantNames = occupantName.split('、').map(s => s.trim()).filter(s => s && s !== '无' && s !== '<user>' && s !== '{{user}}');

        if (occupantNames.length === 0) {
            openInfoModal(roomCard, targetDoc, data);
            return;
        }

        // 收集有效租客数据
        const validTenants = [];
        for (const name of occupantNames) {
            const tenantData = tenantList?.[name];
            if (tenantData) validTenants.push({ name, data: tenantData });
        }

        if (validTenants.length === 0) {
            targetDoc.getElementById('info-modal-title').textContent = occupantName;
            targetDoc.getElementById('info-modal-subtitle').textContent = "租客信息未找到";
            targetDoc.getElementById('info-modal-details').innerHTML = "<p style='padding: 10px 0;'>无法找到该租客的详细信息</p>";
            targetDoc.getElementById('info-modal').classList.remove('hidden');
            return;
        }

        // 单人房间：经典布局
        if (validTenants.length === 1) {
            const t = validTenants[0];
            targetDoc.getElementById('info-modal-title').textContent = t.name;
            targetDoc.getElementById('info-modal-subtitle').textContent = `${SafeGetValue(t.data, '职业')} | ${SafeGetValue(t.data, '年龄')}岁`;
            targetDoc.getElementById('info-modal-details').innerHTML = buildTenantDetailHTML(t.data);
            targetDoc.getElementById('info-modal').classList.remove('hidden');
            return;
        }

        // 多人合租：轮播布局
        const roomName = roomCard.dataset.roomName || '';
        targetDoc.getElementById('info-modal-title').textContent = roomName || '合租房';
        targetDoc.getElementById('info-modal-subtitle').textContent = `${validTenants.length} 位住户 · 左右滑动查看`;

        // 构建轮播HTML
        let slidesHTML = '';
        for (const t of validTenants) {
            slidesHTML += '<div class="tenant-carousel-slide">'
                + '<div class="slide-name">' + t.name + '</div>'
                + '<div class="slide-sub">' + SafeGetValue(t.data, '职业') + ' | ' + SafeGetValue(t.data, '年龄') + '岁</div>'
                + buildTenantDetailHTML(t.data)
                + '</div>';
        }

        let dotsHTML = '';
        for (let i = 0; i < validTenants.length; i++) {
            dotsHTML += '<span class="carousel-dot' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '"></span>';
        }

        const carouselHTML = '<div class="tenant-carousel">'
            + '<div class="tenant-carousel-track">' + slidesHTML + '</div>'
            + '</div>'
            + '<div class="tenant-carousel-nav">'
            + '<button class="carousel-arrow" id="carousel-prev">◀</button>'
            + '<div class="carousel-dots">' + dotsHTML + '</div>'
            + '<button class="carousel-arrow" id="carousel-next">▶</button>'
            + '</div>';

        targetDoc.getElementById('info-modal-details').innerHTML = carouselHTML;

        // 轮播逻辑
        let currentSlide = 0;
        const totalSlides = validTenants.length;
        const track = targetDoc.querySelector('.tenant-carousel-track');
        const dots = targetDoc.querySelectorAll('.carousel-dot');
        const prevBtn = targetDoc.getElementById('carousel-prev');
        const nextBtn = targetDoc.getElementById('carousel-next');
        const carousel = targetDoc.querySelector('.tenant-carousel');

        function goToSlide(idx) {
            currentSlide = Math.max(0, Math.min(idx, totalSlides - 1));
            const slideWidth = carousel.offsetWidth;
            track.style.transform = 'translateX(-' + (currentSlide * slideWidth) + 'px)';
            dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
            prevBtn.disabled = (currentSlide === 0);
            nextBtn.disabled = (currentSlide === totalSlides - 1);
        }

        prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
        nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));
        dots.forEach(dot => {
            dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.idx)));
        });

        // 触摸滑动支持
        let touchStartX = 0;
        carousel.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
        carousel.addEventListener('touchend', (e) => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
                if (diff > 0) goToSlide(currentSlide + 1);
                else goToSlide(currentSlide - 1);
            }
        }, { passive: true });

        goToSlide(0);
        targetDoc.getElementById('info-modal').classList.remove('hidden');
    } catch (e) {
        console.error("显示租客信息时出错: ", e);
    }
}

async function openInfoModal(roomCard, targetDoc, data) {
    if (!data) {
        data = cachedMVUData;
        if (!data && typeof Mvu !== 'undefined') {
            let targetMessageId = 'latest';
            if (typeof getLastMessageId === 'function') {
                targetMessageId = getLastMessageId();
            }
            const mvuResult = Mvu.getMvuData({ type: 'message', message_id: targetMessageId });
            data = mvuResult?.stat_data;
        }
    }
    const roomNameKey = roomCard.dataset.roomName;
    // MVU Zod格式：直接访问房间列表
    const roomData = data.公寓?.房间列表?.[roomNameKey];

    const roomType = SafeGetValue(roomData, '类型');
    const roomName = SafeGetValue(roomData, '名称', roomNameKey);
    const description = SafeGetValue(roomData, '描述', '无');

    targetDoc.getElementById('info-modal-title').textContent = roomName;
    targetDoc.getElementById('info-modal-subtitle').textContent = `类型：${roomType}`;
    targetDoc.getElementById('info-modal-details').innerHTML = `<p style="padding: 10px 0;"><strong>房间描述:</strong> ${description}</p>`;
    targetDoc.getElementById('info-modal').classList.remove('hidden');
}

// ==================== 格子选择器 ====================
// 改为"点击起点+点击终点"模式，更适合移动端
let gridSelectionState = { start: null, end: null, isSelecting: false };
let currentOccupiedSlots = new Set();

function openAddRoomModal(floorName, availableSlots) {
    const targetDoc = window.parent.document;
    currentFloorForNewRoom = floorName;
    targetDoc.getElementById('add-room-modal-title').textContent = `在【${floorName}】新建房间`;
    targetDoc.getElementById('add-room-modal-subtitle').textContent = `可用空位：${availableSlots.map(s => `${s.start}-${s.end}`).join(', ')}`;

    gridSelectionState = { start: null, end: null, isSelecting: false };
    currentOccupiedSlots = new Set();

    const gridContainer = targetDoc.getElementById('grid-selector');
    gridContainer.innerHTML = '';

    // 确定已占用的位置
    if (cachedMVUData) {
        // MVU Zod格式：直接访问房间列表
        const roomsData = cachedMVUData.公寓?.房间列表;
        if (roomsData) {
            for (const roomKey in roomsData) {
                const roomData = roomsData[roomKey];
                // MVU Zod格式：楼层和位置是直接属性
                if (roomData?.楼层 === floorName) {
                    const position = roomData?.位置 || '1-2';
                    if (position !== 'outdoor-left' && position !== 'outdoor-right') {
                        const pos = parsePosition(position);
                        for (let i = pos.start; i <= pos.end; i++) {
                            currentOccupiedSlots.add(i);
                        }
                    }
                }
            }
        }
    }

    // 创建10个格子
    for (let i = 1; i <= 10; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.position = i;
        cell.textContent = i;

        if (currentOccupiedSlots.has(i)) {
            cell.classList.add('occupied');
            cell.title = '已占用';
        } else {
            // 点击选择：第一次点击设起点，第二次点击设终点
            const handleCellClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleGridClick(i, targetDoc);
            };
            cell.addEventListener('click', handleCellClick);
            cell.addEventListener('touchend', handleCellClick);
        }

        gridContainer.appendChild(cell);
    }

    updateSelectionDisplay(targetDoc);
    targetDoc.getElementById('add-room-modal').classList.remove('hidden');
}

function handleGridClick(position, targetDoc) {
    if (currentOccupiedSlots.has(position)) return;

    if (gridSelectionState.start === null) {
        // 第一次点击：设置起点
        gridSelectionState.start = position;
        gridSelectionState.end = position;
    } else if (gridSelectionState.start === position && gridSelectionState.end === position) {
        // 点击同一个格子：取消选择
        gridSelectionState.start = null;
        gridSelectionState.end = null;
    } else {
        // 第二次点击：设置终点，验证中间是否有障碍
        const start = Math.min(gridSelectionState.start, position);
        const end = Math.max(gridSelectionState.start, position);

        // 检查范围内是否有已占用格子
        let hasObstacle = false;
        for (let i = start; i <= end; i++) {
            if (currentOccupiedSlots.has(i)) {
                hasObstacle = true;
                break;
            }
        }

        if (hasObstacle) {
            // 有障碍：重新以当前位置为起点
            gridSelectionState.start = position;
            gridSelectionState.end = position;
        } else {
            // 无障碍：设置终点
            gridSelectionState.end = position;
        }
    }

    updateGridVisual(targetDoc);
    updateSelectionDisplay(targetDoc);
}

function updateGridVisual(targetDoc) {
    const cells = targetDoc.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        const pos = parseInt(cell.dataset.position);
        cell.classList.remove('selected', 'start-point', 'end-point');

        if (currentOccupiedSlots.has(pos)) return;

        if (gridSelectionState.start !== null) {
            const finalStart = Math.min(gridSelectionState.start, gridSelectionState.end || gridSelectionState.start);
            const finalEnd = Math.max(gridSelectionState.start, gridSelectionState.end || gridSelectionState.start);

            if (pos >= finalStart && pos <= finalEnd) {
                cell.classList.add('selected');
            }
            if (pos === gridSelectionState.start) {
                cell.classList.add('start-point');
            }
            if (gridSelectionState.end !== null && gridSelectionState.end !== gridSelectionState.start && pos === gridSelectionState.end) {
                cell.classList.add('end-point');
            }
        }
    });
}

function updateGridSelection(position, occupiedSlots, targetDoc) {
    if (!gridSelectionState.start) return;

    const start = Math.min(gridSelectionState.start, position);
    const end = Math.max(gridSelectionState.start, position);

    let valid = true;
    for (let i = start; i <= end; i++) {
        if (occupiedSlots.has(i)) {
            valid = false;
            break;
        }
    }

    if (valid) {
        gridSelectionState.end = position;
    }

    const cells = targetDoc.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        const pos = parseInt(cell.dataset.position);
        if (!occupiedSlots.has(pos)) {
            const finalStart = Math.min(gridSelectionState.start, gridSelectionState.end);
            const finalEnd = Math.max(gridSelectionState.start, gridSelectionState.end);

            if (pos >= finalStart && pos <= finalEnd) {
                cell.classList.add('selected');
            } else {
                cell.classList.remove('selected');
            }
        }
    });

    updateSelectionDisplay(targetDoc);
}

function updateSelectionDisplay(targetDoc) {
    const display = targetDoc.getElementById('selected-range-display');
    if (gridSelectionState.start !== null && gridSelectionState.end !== null) {
        const start = Math.min(gridSelectionState.start, gridSelectionState.end);
        const end = Math.max(gridSelectionState.start, gridSelectionState.end);
        const size = end - start + 1;
        if (start === end) {
            display.textContent = `起点: ${start} (再点击另一格设置终点)`;
            display.style.color = '#007bff';
        } else {
            display.textContent = `已选择: ${start}-${end} (大小: ${size} 格)`;
            display.style.color = '#28a745';
        }
        display.style.fontWeight = 'bold';
    } else {
        display.textContent = '点击格子选择起点';
        display.style.color = 'var(--theme-subtitle-color)';
        display.style.fontWeight = 'normal';
    }
}

// ==================== 其他模态框函数 ====================
function openAddFloorModal(position) {
    const targetDoc = window.parent.document;
    targetDoc.getElementById('add-floor-position').value = position;
    targetDoc.getElementById('add-floor-modal').classList.remove('hidden');
}

function openManagementMenu(roomCard, targetDoc) {
    currentEditingRoomName = roomCard.dataset.roomName;
    // MVU Zod格式：直接访问房间列表
    const roomType = cachedMVUData?.公寓?.房间列表?.[currentEditingRoomName]?.类型 || '未知';
    const occupant = roomCard.dataset.occupant;

    targetDoc.getElementById('management-modal-title').textContent = currentEditingRoomName;
    targetDoc.getElementById('management-modal-subtitle').textContent = `类型：${roomType}`;

    const choicesDiv = targetDoc.getElementById('management-modal-choices');
    choicesDiv.innerHTML = '';

    if (roomType === '空房间') {
        const decorateBtn = document.createElement('button');
        decorateBtn.textContent = '🏠 装修为卧室';
        decorateBtn.onclick = () => {
            // 简化指令格式
            const command = `将【${currentEditingRoomName}】装修为卧室`;
            fillCommand(command);
            closeAllModals();
        };
        choicesDiv.appendChild(decorateBtn);

        const functionalBtn = document.createElement('button');
        functionalBtn.textContent = '🎨 装修为功能性房间';
        functionalBtn.onclick = () => {
            const roomName = prompt('请输入房间名称（例如：书房、健身房）');
            if (roomName) {
                // 简化指令格式
                const command = `将【${currentEditingRoomName}】装修为功能性房间【${roomName}】`;
                fillCommand(command);
                closeAllModals();
            }
        };
        choicesDiv.appendChild(functionalBtn);

        const demolishBtn = document.createElement('button');
        demolishBtn.textContent = '💣 拆除房间';
        demolishBtn.className = 'danger-btn';
        demolishBtn.onclick = () => {
            // 简化指令格式
            const command = `拆除房间【${currentEditingRoomName}】`;
            fillCommand(command);
            closeAllModals();
        };
        choicesDiv.appendChild(demolishBtn);
    }
    else if (occupant && occupant !== '未知' && occupant !== '无') {
        const evictBtn = document.createElement('button');
        evictBtn.textContent = '🚪 让租客退租';
        evictBtn.className = 'danger-btn';
        evictBtn.onclick = () => {
            // 简化指令格式
            const command = `让租客【${occupant}】从【${currentEditingRoomName}】退租`;
            fillCommand(command);
            closeAllModals();
        };
        choicesDiv.appendChild(evictBtn);
    }
    else if (roomType === '卧室' || roomType === '功能性房间') {
        const demolishBtn = document.createElement('button');
        demolishBtn.textContent = '💣 拆除房间';
        demolishBtn.className = 'danger-btn';
        demolishBtn.onclick = () => {
            // 简化指令格式
            const command = `拆除房间【${currentEditingRoomName}】`;
            fillCommand(command);
            closeAllModals();
        };
        choicesDiv.appendChild(demolishBtn);
    }
    else if (roomType === '固定设施' || roomType === '您的房间' || roomType === '室外区域') {
        const infoText = document.createElement('p');
        infoText.textContent = '该区域不可修改或拆除';
        infoText.style.cssText = 'padding: 20px; text-align: center; color: var(--theme-subtitle-color);';
        choicesDiv.appendChild(infoText);
    }

    targetDoc.getElementById('management-modal').classList.remove('hidden');
}

// ==================== 命令生成 ====================
function confirmAddRoom() {
    const targetDoc = window.parent.document;
    const floorName = currentFloorForNewRoom;
    const roomType = targetDoc.getElementById('add-room-type').value;

    if (!gridSelectionState.start || !gridSelectionState.end) {
        alert('请先选择房间位置！');
        return;
    }

    const start = Math.min(gridSelectionState.start, gridSelectionState.end);
    const end = Math.max(gridSelectionState.start, gridSelectionState.end);
    const position = `${start}-${end}`;

    let roomName = '';
    let customName = '';

    if (roomType === '功能性房间') {
        customName = targetDoc.getElementById('add-room-custom-name').value.trim();
        if (!customName) {
            alert('请输入房间名称！');
            return;
        }
        roomName = customName;
    } else {
        roomName = `${floorName}新房间${Date.now()}`;
    }

    // 简化指令格式：只发送自然语言描述
    const command = `在【${floorName}】的位置${position}新建一间${roomType}${customName ? `，命名为【${customName}】` : ''}`;

    fillCommand(command);
    closeAllModals();
}

function confirmAddFloor() {
    const targetDoc = window.parent.document;
    const floorName = targetDoc.getElementById('add-floor-name').value.trim();
    const position = targetDoc.getElementById('add-floor-position').value;

    if (!floorName) {
        alert('请输入楼层名称！');
        return;
    }

    // 简化指令格式
    const command = `新建楼层【${floorName}】（${position === 'top' ? '向上扩展' : '向下扩展'}）`;

    fillCommand(command);
    closeAllModals();
}

function confirmRecruitment() {
    const targetDoc = window.parent.document;
    const keywords = targetDoc.getElementById('recruitment-keywords').value.trim();
    const command = `招募一名符合以下特征的租客：${keywords}`;
    fillCommand(command);
    closeAllModals();
}

function fillCommand(command) {
    try {
        const chatInput = parent.document.querySelector('#send_textarea');
        if (chatInput) {
            if (chatInput.value.trim() !== '') {
                chatInput.value += '\n' + command;
            } else {
                chatInput.value = command;
            }
            chatInput.focus();
        } else {
            throw new Error();
        }
    } catch (e) {
        alert('未能自动找到输入框，请手动复制：\n\n' + command);
    }
}

// ==================== 其他功能 ====================
function closeAllModals() {
    const targetDoc = window.parent.document;
    const allModals = targetDoc.querySelectorAll('.modal-overlay');
    allModals.forEach(modal => modal.classList.add('hidden'));
}

function openRecruitmentModal() {
    const targetDoc = window.parent.document;
    targetDoc.getElementById('recruitment-modal').classList.remove('hidden');
}

function openSettingsModal() {
    const targetDoc = window.parent.document;
    targetDoc.getElementById('settings-modal').classList.remove('hidden');
}

function switchTheme(theme) {
    const targetDoc = window.parent.document;
    const panel = targetDoc.getElementById('apartment-main-panel');
    if (theme === 'dark') {
        panel.classList.add('dark-theme');
    } else {
        panel.classList.remove('dark-theme');
    }
    // 持久化主题选择，供正文美化等其他组件读取
    try { localStorage.setItem('apartment_theme', theme); } catch(e) {}
}


// ==================== 暴露给外部的API ====================

// 强制刷新MVU数据并重新渲染公寓（供外部脚本如创意工坊在替换消息后调用）
window.parent.refreshApartmentData = function () {
    cachedMVUData = null;
    const targetDoc = window.parent.document;
    const panel = targetDoc.querySelector('.apartment-main-panel');
    if (panel && panel.classList.contains('active')) {
        populateDataWithMVU(targetDoc);
    }
    console.log('[掌上公寓] 外部触发数据刷新');
};

// 供正则iframe等外部上下文获取卧室列表（用于房间选择器）
window.parent.getApartmentBedrooms = function () { return landlord.getBedrooms(); };

// ==================== 关系网络功能 ====================
// 注意：这些函数需要绑定到window.parent，因为onclick是在父窗口DOM上执行的
window.parent.openRelationModal = function () {
    const targetDoc = window.parent.document;
    const data = cachedMVUData;
    if (!data) return;

    // MVU Zod格式：直接访问租客列表（无[0]索引）
    const tenantList = data.租客列表;
    const contentDiv = targetDoc.getElementById('relation-content');

    if (!tenantList || Object.keys(tenantList).length === 0) {
        contentDiv.innerHTML = '<p style="color: var(--theme-subtitle-color); text-align: center;">暂无租客数据</p>';
        targetDoc.getElementById('relation-modal').classList.remove('hidden');
        return;
    }

    // 获取用户名（SillyTavern API或默认为"您"）
    let userName = '您';
    let userRealName = null;  // 用于匹配关系中的用户名
    try {
        if (typeof getContext === 'function') {
            const ctx = getContext();
            if (ctx && ctx.name1) {
                userName = ctx.name1;
                userRealName = ctx.name1;
            }
        }
    } catch (e) {
        console.warn('获取用户名失败:', e);
    }

    // 获取所有租客的名字列表（用于判断关系键是否为其他租客）
    const tenantNames = Object.keys(tenantList);

    // 构建角色列表（包括用户和所有租客）
    const characters = [];

    // 添加用户
    characters.push({
        name: '<user>',
        displayName: userName,
        realName: userRealName,
        relations: {}  // 用户的关系需要从租客的关系中反推
    });

    // 添加所有租客（MVU Zod格式无需$meta检查）
    for (const key in tenantList) {
        const tenant = tenantList[key];
        const relations = tenant.关系 || {};

        // 反推用户关系：遍历租客的所有关系
        // 如果关系键不在租客列表中，则认为是对用户的关系
        for (const relKey in relations) {
            if (!tenantNames.includes(relKey)) {
                // 这个关系键不是租客，所以是对用户的关系
                characters[0].relations[key] = SafeGetValue(relations, relKey, '未知');
                // 如果还没有获取到用户名，尝试从这里获取
                if (!userRealName) {
                    userRealName = relKey;
                    characters[0].realName = relKey;
                }
            }
        }

        characters.push({
            name: key,
            displayName: key,
            relations: relations
        });
    }

    // 生成界面
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;">';

    characters.forEach(char => {
        const relationCount = Object.keys(char.relations).length;
        html += `
            <div onclick="showCharacterRelations('${char.name}')" 
                 style="padding: 15px; background: var(--theme-modal-btn-bg); border-radius: 10px; cursor: pointer; transition: all 0.2s; border: 2px solid var(--theme-border-color); text-align: center;"
                 onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)';"
                 onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                <div style="font-size: 28px; margin-bottom: 8px;">${char.name === '<user>' ? '👤' : '👥'}</div>
                <div style="font-weight: bold; margin-bottom: 5px; font-size: 14px;">${char.displayName}</div>
                <div style="font-size: 12px; color: var(--theme-subtitle-color);">
                    ${relationCount > 0 ? `${relationCount} 个关系` : '暂无关系'}
                </div>
            </div>
        `;
    });

    html += '</div>';
    contentDiv.innerHTML = html;
    targetDoc.getElementById('relation-modal').classList.remove('hidden');
}

// 显示某个角色的关系详情（图形化）
window.parent.showCharacterRelations = function (characterName) {
    const targetDoc = window.parent.document;
    const data = cachedMVUData;
    if (!data) return;

    // MVU Zod格式：直接访问租客列表
    const tenantList = data.租客列表;
    const contentDiv = targetDoc.getElementById('relation-content');

    // 获取用户名
    let userName = '您';
    try {
        if (typeof getContext === 'function') {
            const ctx = getContext();
            if (ctx && ctx.name1) {
                userName = ctx.name1;
            }
        }
    } catch (e) { }

    // 获取所有租客的名字列表
    const tenantNames = Object.keys(tenantList);

    // 获取角色数据
    let character = null;
    let relations = {};

    if (characterName === '<user>') {
        // 用户的关系需要从所有租客的关系中收集
        // 遍历租客，找出所有非租客名的关系键（那些就是对用户的关系）
        for (const key in tenantList) {
            const tenant = tenantList[key];
            const tenantRelations = tenant.关系 || {};
            for (const relKey in tenantRelations) {
                // 如果关系键不在租客列表中，则认为是对用户的关系
                if (!tenantNames.includes(relKey)) {
                    relations[key] = SafeGetValue(tenantRelations, relKey, '未知');
                    break;  // 每个租客只取一个对用户的关系
                }
            }
        }
        character = {
            name: '<user>',
            displayName: userName,
            relations: relations
        };
    } else {
        const tenant = tenantList[characterName];
        if (tenant) {
            character = {
                name: characterName,
                displayName: characterName,
                relations: tenant.关系 || {}
            };
        }
    }

    if (!character) {
        contentDiv.innerHTML = '<p style="color: var(--theme-subtitle-color); text-align: center;">未找到角色数据</p>';
        return;
    }

    // 显示角色关系
    let html = `
        <div style="margin-bottom: 15px; text-align: center;">
            <button onclick="openRelationModal()" 
                    style="padding: 8px 16px; background: var(--theme-modal-btn-bg); border: 1px solid var(--theme-border-color); border-radius: 8px; cursor: pointer; color: var(--theme-text-color);">
                ← 返回列表
            </button>
        </div>
        
        <div style="text-align: center; margin-bottom: 15px;">
            <div style="font-size: 18px; font-weight: bold; color: var(--theme-text-color);">
                ${character.name === '<user>' ? '👤' : '👥'} ${character.displayName} 的关系网络
            </div>
        </div>
    `;

    const relationEntries = Object.entries(character.relations);

    if (relationEntries.length === 0) {
        html += `
            <div style="text-align: center; padding: 40px; color: var(--theme-subtitle-color);">
                <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">🤷</div>
                <div style="font-size: 16px;">暂无关系记录</div>
            </div>
        `;
        contentDiv.innerHTML = html;
    } else {
        // 创建Canvas绘制关系图
        html += '<canvas id="relation-canvas" style="width: 100%; height: 450px; background: var(--theme-phone-bg); border-radius: 10px; border: 1px solid var(--theme-border-color);"></canvas>';
        contentDiv.innerHTML = html;

        // 等待DOM更新后绘制
        setTimeout(() => {
            drawRelationGraph(character, relationEntries, targetDoc);
        }, 50);
    }
}

// 绘制关系网络图
function drawRelationGraph(character, relationEntries, targetDoc) {
    const canvas = targetDoc.getElementById('relation-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // 设置Canvas实际大小
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // 中心点位置
    const centerX = width / 2;
    const centerY = height / 2;
    const centerRadius = 35;

    // 计算周围节点的位置（圆形分布）
    const nodeRadius = 30;
    const orbitRadius = Math.min(width, height) * 0.32; // 轨道半径
    const angleStep = (Math.PI * 2) / relationEntries.length;

    // 获取主题颜色
    const isDarkTheme = targetDoc.getElementById('apartment-main-panel').classList.contains('dark-theme');
    const textColor = isDarkTheme ? '#e0e0e0' : '#333333';
    const lineColor = isDarkTheme ? '#667eea' : '#667eea';
    const centerColor = isDarkTheme ? '#7c3aed' : '#8b5cf6';
    const nodeColor = isDarkTheme ? '#4ade80' : '#10b981';
    const bgColor = isDarkTheme ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)';

    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 绘制背景
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // 计算所有节点位置
    const nodes = relationEntries.map(([targetName, relationDesc], index) => {
        const angle = angleStep * index - Math.PI / 2; // 从顶部开始
        return {
            x: centerX + Math.cos(angle) * orbitRadius,
            y: centerY + Math.sin(angle) * orbitRadius,
            name: targetName,
            displayName: targetName === '<user>' ? '您' : targetName,
            relation: relationDesc
        };
    });

    // 1. 绘制连接线
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    nodes.forEach(node => {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();
    });

    ctx.setLineDash([]);

    // 2. 绘制关系文字（在线的中点）
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    nodes.forEach(node => {
        const midX = (centerX + node.x) / 2;
        const midY = (centerY + node.y) / 2;

        // 计算文字的旋转角度
        const angle = Math.atan2(node.y - centerY, node.x - centerX);
        const distance = Math.sqrt(Math.pow(node.x - centerX, 2) + Math.pow(node.y - centerY, 2));

        // 文字背景
        const text = node.relation;
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = 16;

        ctx.fillStyle = isDarkTheme ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(midX - textWidth / 2 - 4, midY - textHeight / 2, textWidth + 8, textHeight);

        ctx.fillStyle = lineColor;
        ctx.fillText(text, midX, midY);
    });

    // 3. 绘制周围节点
    nodes.forEach(node => {
        // 节点圆形
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.fill();
        ctx.strokeStyle = isDarkTheme ? '#333' : '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 节点图标
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(node.name === '<user>' ? '👤' : '👥', node.x, node.y - 2);

        // 节点名称（在圆形下方）
        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = textColor;
        ctx.fillText(node.displayName, node.x, node.y + nodeRadius + 15);
    });

    // 4. 绘制中心节点（最后绘制，在最上层）
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
    ctx.fillStyle = centerColor;
    ctx.fill();
    ctx.strokeStyle = isDarkTheme ? '#333' : '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 中心节点图标
    ctx.font = '28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(character.name === '<user>' ? '👤' : '👥', centerX, centerY - 3);

    // 中心节点名称（在圆形下方）
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = textColor;
    ctx.fillText(character.displayName, centerX, centerY + centerRadius + 20);
}

// ============ 初始化 - 完全按照悬浮球示例 ============

// 页面加载完成后初始化（与悬浮球示例相同）
$(() => {
    console.log('[掌上公寓] 脚本已加载，正在初始化...');

    // 延迟一小段时间确保酒馆完全加载（与悬浮球示例相同）
    initializeApartmentPlugin();
    populateDataWithMVU(window.parent.document);
    eventOn("mag_variable_update_ended", () => populateDataWithMVU(window.parent.document));
    eventOn("mag_variable_initialized", () => populateDataWithMVU(window.parent.document));
});

// ============ 事件监听 - 按照悬浮球示例 ============

// 监听脚本卸载事件 - 当离开当前角色卡时移除掌上公寓
// 酒馆助手会在切换角色或返回首页时卸载角色脚本库的脚本
$(window).on('pagehide', () => {
    console.log('� 脚本正在卸载，清理掌上公寓...');
    cleanupApartmentPlugin();
});

// 额外监听 CHAT_CHANGED 事件，确保在聊天切换时也能正确清理
if (typeof eventOn === 'function') {
    eventOn('chat_id_changed', (chatFileName) => {
        console.log('� 聊天已切换:', chatFileName);
        // 如果聊天文件名为空（返回首页），移除掌上公寓
        if (!chatFileName) {
            cleanupApartmentPlugin();
        }
    });
    console.log('✅ 已注册chat_id_changed事件监听');
}

console.log('✅ 掌上公寓插件脚本加载完成');


// ==================== 3D ��Ⱦģ�� (Three.js) ====================
let threeJSLoaded = false;
let scene, camera, renderer, controls, raycaster, mouse;
let animationFrameId; // ����ֹͣ����ѭ��
let roomMeshes = []; // �洢�����������ڽ���

async function loadThreeJS() {
    if (threeJSLoaded) return true;

    console.log(' ���ڼ��� Three.js...');
    return new Promise((resolve) => {
        if (window.THREE) {
            threeJSLoaded = true;
            resolve(true);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        script.onload = () => {
            console.log(' Three.js �������');
            const controlsScript = document.createElement('script');
            controlsScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
            controlsScript.onload = () => {
                console.log(' OrbitControls �������');
                threeJSLoaded = true;
                resolve(true);
            };
            controlsScript.onerror = () => {
                console.warn(' OrbitControls ����ʧ�ܣ���ʹ�û�������');
                threeJSLoaded = true;
                resolve(true);
            }
            document.head.appendChild(controlsScript);
        };
        script.onerror = () => {
            console.error(' Three.js ����ʧ��');
            resolve(false);
        };
        document.head.appendChild(script);
    });
}

function init3DScene(containerData, targetDoc) {
    if (!window.THREE) return;

    const canvasContainer = targetDoc.getElementById('apartment-canvas');
    if (!canvasContainer) return;

    canvasContainer.innerHTML = '';

    // Fix: Force container to take up space since we cleared the HTML content
    canvasContainer.style.width = '100%';
    canvasContainer.style.height = '100%';
    canvasContainer.style.display = 'block'; // Reset flex display

    const rect = canvasContainer.getBoundingClientRect();
    console.log('📦 3D Canvas Container Size:', rect.width, rect.height);

    if (rect.width === 0 || rect.height === 0) {
        console.error('❌ Canvas container has 0 size!');
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);
    if (targetDoc.getElementById('apartment-main-panel').classList.contains('dark-theme')) {
        scene.background = new THREE.Color(0x232136);
    }

    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    const d = 60;
    camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);

    camera.position.set(100, 100, 100);
    camera.lookAt(scene.position);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);

    if (window.THREE.OrbitControls) {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableZoom = true;
        controls.minZoom = 0.5;
        controls.maxZoom = 2;
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI / 2;
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(50, 80, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    renderer.domElement.addEventListener('mousemove', onMouseMove, false);
    renderer.domElement.addEventListener('click', onMouseClick, false);
    renderer.domElement.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
    });

    window.addEventListener('resize', onWindowResize, false);

    animate();

    console.log(' 3D������ʼ�����');
}

function onWindowResize() {
    if (!camera || !renderer) return;
    const container = renderer.domElement.parentElement;
    if (!container) return;

    const aspect = container.clientWidth / container.clientHeight;
    const d = 60;

    camera.left = -d * aspect;
    camera.right = d * aspect;
    camera.top = d;
    camera.bottom = -d;

    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (controls) controls.update();
    renderer.render(scene, camera);
}

function onMouseMove(event) {
    if (!raycaster || !mouse || !camera) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(roomMeshes);

    roomMeshes.forEach(mesh => {
        if (mesh.userData.originalHex) {
            mesh.material.emissive.setHex(0x000000);
        }
    });

    if (intersects.length > 0) {
        const object = intersects[0].object;
        object.material.emissive.setHex(0x333333);
        renderer.domElement.style.cursor = 'pointer';
    } else {
        renderer.domElement.style.cursor = 'default';
    }
}

function onMouseClick(event) {
    if (!raycaster || !mouse || !camera) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(roomMeshes);

    if (intersects.length > 0) {
        const object = intersects[0].object;
        const roomData = object.userData.roomData;
        console.log(' �����3D����:', roomData);
    }
}


// ==================== 3D 渲染数据映射 ====================
function render3DApartment(data, targetDoc) {
    if (!scene || !window.THREE) return;

    // 清理旧的 Mesh (保留地板)
    for (let i = roomMeshes.length - 1; i >= 0; i--) {
        const mesh = roomMeshes[i];
        scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
    }
    roomMeshes = [];

    const floorList = data.公寓?.楼层列表 || [];
    const roomsData = data.公寓?.房间列表 || {};

    // 反转楼层列表，使得高层在上面 (原数据是倒序的吗？render2D里做了处理)
    // render2D里: index 0 is top floor? No, order = floorList.length - index
    // 让我们假设 floorList[0] 是最高层
    // 在3D里 y 轴向上

    floorList.forEach((floorName, index) => {
        // 计算楼层高度 (反转索引，使得列表第一个在最高处)
        const floorHeightIndex = floorList.length - 1 - index;
        const y = floorHeightIndex * 15;

        // 渲染每层地板
        const floorGeo = new THREE.BoxGeometry(160, 2, 60);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0xeef2f6 });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.position.set(50, y, 0); // 居中偏移
        floorMesh.receiveShadow = true;
        scene.add(floorMesh);
        // 地板不参与点击交互

        // 渲染房间
        for (const roomKey in roomsData) {
            const roomData = roomsData[roomKey];
            if (roomData?.楼层 === floorName) {
                const position = roomData?.位置 || '1-2';
                let start = 1, end = 1;

                // 解析位置
                if (position === 'outdoor-left') {
                    start = -2; end = 0; // 左侧室外
                } else if (position === 'outdoor-right') {
                    start = 11; end = 13; // 右侧室外
                } else {
                    const pos = parsePosition(position);
                    start = pos.start;
                    end = pos.end;
                }

                // 计算房间尺寸和位置
                // 每个格子宽10
                const roomWidth = (end - start + 1) * 10;
                // 房间中心X坐标: (start + end)/2 * 10
                const roomCenterX = (start + end) / 2 * 10;

                const roomGeo = new THREE.BoxGeometry(roomWidth - 1, 10, 30);

                // 颜色映射
                let color = 0xffffff;
                const type = roomData.类型;
                if (type === '您的房间') color = 0xa7f3d0;
                else if (type === '卧室') color = 0xfef08a;
                else if (type === '功能性房间') color = 0xfde68a;
                else if (type === '固定设施') color = 0xe2e8f0;
                else if (type === '室外区域') color = 0xdcfce7;
                else if (type === '空房间') color = 0xffffff;

                const roomMat = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.5,
                    metalness: 0.1
                });
                const roomMesh = new THREE.Mesh(roomGeo, roomMat);

                roomMesh.position.set(roomCenterX, y + 6, 0);
                roomMesh.castShadow = true;
                roomMesh.receiveShadow = true;

                // 存储数据
                roomMesh.userData = {
                    roomData: roomData,
                    roomKey: roomKey,
                    originalHex: color
                };

                scene.add(roomMesh);
                roomMeshes.push(roomMesh);
            }
        }
    });
}

