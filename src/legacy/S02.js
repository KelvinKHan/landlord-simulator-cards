/**
 * 悬浮球菜单管理器 - 统一管理多个悬浮球功能
 *
 * 功能：
 * - 创建主悬浮球（菜单按钮）
 * - 管理子悬浮球（功能球）
 * - 展开/收起动画
 * - 拖拽支持
 * - 位置持久化
 *
 * 使用方法：
 * 1. 加载此脚本
 * 2. 调用 FloatingMenuManager.init()
 * 3. 使用 FloatingMenuManager.registerButton() 注册功能球
 */

(function() {
    'use strict';

    console.log('[FloatingMenuManager] 脚本开始加载...');

    // ============ 获取父页面 document ============
    const parentDocument = window.parent.document;

    // ============ 配置常量 ============
    const CONFIG = {
        MAIN_SIZE: 56,           // 主球尺寸
        SUB_SIZE: 48,            // 子球尺寸
        SUB_SPACING: 60,         // 子球间距
        DRAG_THRESHOLD: 5,       // 拖拽阈值（px）
        ANIMATION_DURATION: 300, // 动画时长（ms）
        Z_INDEX_MAIN: 10000,     // 主球层级
        Z_INDEX_SUB: 9999,       // 子球层级
        STORAGE_KEY: 'floatingMenuManager_state'
    };

    // ============ SVG 图标 ============
    const ICONS = {
        // 三横线图标（收起状态）
        menu: `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
        </svg>`,
        // 向下箭头图标（展开状态）
        chevronDown: `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
        </svg>`
    };

    // ============ 全局状态 ============
    const state = {
        isExpanded: false,       // 展开状态
        isDragging: false,       // 拖拽状态
        hasMoved: false,         // 是否移动过
        buttons: [],             // 注册的按钮配置
        elements: {              // DOM元素引用
            main: null,          // 主悬浮球
            subContainer: null,  // 子球容器
            subs: []             // 子球数组
        },
        dragData: {              // 拖拽数据
            startX: 0,
            startY: 0,
            initialBottom: 0,
            initialRight: 0
        },
        position: {              // 位置（使用top/left定位）
            top: 100,
            left: 20
        }
    };

    // ============ 样式注入 ============
    function injectStyles() {
        if (parentDocument.getElementById('floating-menu-manager-styles')) return;

        const styles = `
<style id="floating-menu-manager-styles">
/* 主悬浮球 */
.fmm-main-fab {
    position: fixed;
    width: ${CONFIG.MAIN_SIZE}px;
    height: ${CONFIG.MAIN_SIZE}px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4B5563 0%, #374151 100%);
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: ${CONFIG.Z_INDEX_MAIN};
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    user-select: none;
    -webkit-user-select: none;
    color: white;
}

.fmm-main-fab:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 25px rgba(0,0,0,0.4);
}

.fmm-main-fab:active {
    transform: scale(0.95);
}

.fmm-main-fab.dragging {
    cursor: move;
    transform: scale(1.05);
}

.fmm-main-fab .icon {
    transition: transform 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.fmm-main-fab.expanded .icon {
    transform: rotate(180deg);
}

/* 子球容器 */
.fmm-sub-container {
    position: fixed;
    z-index: ${CONFIG.Z_INDEX_SUB};
    pointer-events: none;
}

/* 子悬浮球 */
.fmm-sub-fab {
    position: absolute;
    width: ${CONFIG.SUB_SIZE}px;
    height: ${CONFIG.SUB_SIZE}px;
    border-radius: 50%;
    box-shadow: 0 3px 15px rgba(0,0,0,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    user-select: none;
    -webkit-user-select: none;
    pointer-events: auto;
    opacity: 0;
    transform: scale(0);
}

.fmm-sub-fab:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 20px rgba(0,0,0,0.35);
}

.fmm-sub-fab:active {
    transform: scale(0.9);
}

/* 展开动画 */
@keyframes fmmExpandBall {
    0% {
        opacity: 0;
        transform: translateY(0) scale(0);
    }
    100% {
        opacity: 1;
        transform: translateY(var(--offset)) scale(1);
    }
}

/* 收起动画 */
@keyframes fmmCollapseBall {
    0% {
        opacity: 1;
        transform: translateY(var(--offset)) scale(1);
    }
    100% {
        opacity: 0;
        transform: translateY(0) scale(0);
    }
}

.fmm-sub-fab.expanding {
    animation: fmmExpandBall ${CONFIG.ANIMATION_DURATION}ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.fmm-sub-fab.collapsing {
    animation: fmmCollapseBall ${CONFIG.ANIMATION_DURATION}ms ease-in forwards;
}
</style>
        `;

        parentDocument.head.insertAdjacentHTML('beforeend', styles);
    }

    // ============ 创建主悬浮球 ============
    function createMainFab() {
        const fab = parentDocument.createElement('div');
        fab.className = 'fmm-main-fab';
        fab.innerHTML = `<div class="icon">${ICONS.menu}</div>`;

        // 设置初始位置
        fab.style.top = state.position.top + 'px';
        fab.style.left = state.position.left + 'px';

        parentDocument.body.appendChild(fab);
        state.elements.main = fab;

        // 绑定事件
        bindMainFabEvents(fab);

        return fab;
    }

    // ============ 创建子球容器 ============
    function createSubContainer() {
        const container = parentDocument.createElement('div');
        container.className = 'fmm-sub-container';
        parentDocument.body.appendChild(container);
        state.elements.subContainer = container;
        return container;
    }

    // ============ 更新子球容器位置 ============
    function updateSubContainerPosition() {
        if (!state.elements.main || !state.elements.subContainer) return;

        const container = state.elements.subContainer;

        // 子球容器位置与主球对齐
        container.style.top = state.position.top + 'px';
        container.style.left = state.position.left + 'px';
        container.style.width = CONFIG.SUB_SIZE + 'px';
        container.style.height = (state.buttons.length * CONFIG.SUB_SPACING) + 'px';
    }

    // ============ 创建子悬浮球 ============
    function createSubFab(config, index) {
        const fab = parentDocument.createElement('div');
        fab.className = 'fmm-sub-fab';
        fab.style.background = config.color || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

        // 设置图标内容
        if (typeof config.icon === 'string') {
            fab.innerHTML = config.icon;
        } else {
            fab.textContent = config.icon || '●';
        }

        // 设置位置偏移
        const offset = -(index + 1) * CONFIG.SUB_SPACING;
        fab.style.setProperty('--offset', offset + 'px');
        fab.style.top = '0px';
        fab.style.left = '4px'; // 居中对齐（(56-48)/2 = 4px）

        // 绑定点击事件
        fab.addEventListener('click', function(e) {
            e.stopPropagation();
            if (config.onClick && typeof config.onClick === 'function') {
                config.onClick();
            }
        });

        state.elements.subContainer.appendChild(fab);
        state.elements.subs.push(fab);

        return fab;
    }

    // ============ 渲染所有子球 ============
    function renderSubFabs() {
        // 清空现有子球
        state.elements.subs.forEach(fab => fab.remove());
        state.elements.subs = [];

        // 创建新的子球
        state.buttons.forEach((config, index) => {
            createSubFab(config, index);
        });

        updateSubContainerPosition();
    }

    // ============ 展开菜单 ============
    function expand() {
        if (state.isExpanded) return;
        state.isExpanded = true;

        // 更新主球图标
        const icon = state.elements.main.querySelector('.icon');
        icon.innerHTML = ICONS.chevronDown;
        state.elements.main.classList.add('expanded');

        // 展开子球
        state.elements.subs.forEach((fab, index) => {
            fab.classList.remove('collapsing');
            fab.classList.add('expanding');

            // 延迟显示，创造级联效果
            setTimeout(() => {
                fab.style.opacity = '1';
                fab.style.transform = `translateY(${-(index + 1) * CONFIG.SUB_SPACING}px) scale(1)`;
            }, index * 50);
        });
    }

    // ============ 收起菜单 ============
    function collapse() {
        if (!state.isExpanded) return;
        state.isExpanded = false;

        // 更新主球图标
        const icon = state.elements.main.querySelector('.icon');
        icon.innerHTML = ICONS.menu;
        state.elements.main.classList.remove('expanded');

        // 收起子球
        state.elements.subs.forEach((fab, index) => {
            fab.classList.remove('expanding');
            fab.classList.add('collapsing');

            setTimeout(() => {
                fab.style.opacity = '0';
                fab.style.transform = 'translateY(0) scale(0)';
            }, index * 30);
        });
    }

    // ============ 切换展开/收起 ============
    function toggle() {
        if (state.isExpanded) {
            collapse();
        } else {
            expand();
        }
    }

    // ============ 主球拖拽事件 ============
    function bindMainFabEvents(fab) {
        let rafId = null;

        function handleStart(e) {
            const touch = e.touches ? e.touches[0] : e;
            state.isDragging = true;
            state.hasMoved = false;
            state.dragData.startX = touch.clientX;
            state.dragData.startY = touch.clientY;

            const rect = fab.getBoundingClientRect();
            state.dragData.initialTop = rect.top;
            state.dragData.initialLeft = rect.left;

            fab.classList.add('dragging');
            e.preventDefault();
        }

        function handleMove(e) {
            if (!state.isDragging) return;

            const touch = e.touches ? e.touches[0] : e;
            const deltaX = touch.clientX - state.dragData.startX;
            const deltaY = touch.clientY - state.dragData.startY;

            // 判断是否移动
            if (Math.abs(deltaX) > CONFIG.DRAG_THRESHOLD || Math.abs(deltaY) > CONFIG.DRAG_THRESHOLD) {
                state.hasMoved = true;
            }

            // 使用 RAF 优化性能
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const newLeft = Math.max(0, Math.min(
                    state.dragData.initialLeft + deltaX,
                    window.parent.innerWidth - CONFIG.MAIN_SIZE
                ));
                const newTop = Math.max(0, Math.min(
                    state.dragData.initialTop + deltaY,
                    window.parent.innerHeight - CONFIG.MAIN_SIZE
                ));

                state.position.left = newLeft;
                state.position.top = newTop;

                fab.style.left = newLeft + 'px';
                fab.style.top = newTop + 'px';

                // 更新子球容器位置
                updateSubContainerPosition();

                rafId = null;
            });

            e.preventDefault();
        }

        function handleEnd(e) {
            if (!state.isDragging) return;
            state.isDragging = false;
            fab.classList.remove('dragging');

            // 保存位置
            savePosition();

            // 如果没有移动，则视为点击
            if (!state.hasMoved) {
                toggle();
            }

            state.hasMoved = false;
            e.preventDefault();
        }

        // 鼠标事件
        fab.addEventListener('mousedown', handleStart);
        parentDocument.addEventListener('mousemove', handleMove);
        parentDocument.addEventListener('mouseup', handleEnd);

        // 触摸事件
        fab.addEventListener('touchstart', handleStart, { passive: false });
        parentDocument.addEventListener('touchmove', handleMove, { passive: false });
        parentDocument.addEventListener('touchend', handleEnd, { passive: false });
    }

    // ============ 位置持久化 ============
    function savePosition() {
        try {
            const data = {
                top: state.position.top,
                left: state.position.left,
                isExpanded: state.isExpanded
            };
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('[FloatingMenuManager] 保存位置失败:', e);
        }
    }

    function loadPosition() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                state.position.top = data.top || 100;
                state.position.left = data.left || 20;
                // 不恢复展开状态，始终从收起状态开始
            }
        } catch (e) {
            console.error('[FloatingMenuManager] 加载位置失败:', e);
        }
    }

    // ============ 调整位置到可见范围 ============
    function adjustPositionToViewport() {
        if (!state.elements.main) return;

        const maxLeft = window.parent.innerWidth - CONFIG.MAIN_SIZE;
        const maxTop = window.parent.innerHeight - CONFIG.MAIN_SIZE;

        // 确保悬浮球在可见范围内
        let adjusted = false;

        if (state.position.left > maxLeft) {
            state.position.left = Math.max(0, maxLeft);
            adjusted = true;
        }

        if (state.position.top > maxTop) {
            state.position.top = Math.max(0, maxTop);
            adjusted = true;
        }

        if (state.position.left < 0) {
            state.position.left = 0;
            adjusted = true;
        }

        if (state.position.top < 0) {
            state.position.top = 0;
            adjusted = true;
        }

        // 如果位置被调整，更新DOM和保存
        if (adjusted) {
            state.elements.main.style.left = state.position.left + 'px';
            state.elements.main.style.top = state.position.top + 'px';
            updateSubContainerPosition();
            savePosition();
        }
    }

    // ============ 窗口大小改变监听 ============
    function bindWindowResize() {
        let resizeTimer = null;
        window.parent.addEventListener('resize', function() {
            // 使用防抖，避免频繁调整
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                adjustPositionToViewport();
                resizeTimer = null;
            }, 100);
        });
    }

    // ============ 公共API ============
    const FloatingMenuManager = {
        /**
         * 注册子按钮
         * @param {Object} config - 按钮配置
         * @param {string} config.id - 按钮唯一ID
         * @param {string|HTMLElement} config.icon - 图标（可以是emoji、SVG字符串或HTML）
         * @param {string} config.label - 按钮标签（用于调试）
         * @param {Function} config.onClick - 点击回调函数
         * @param {string} config.color - 背景渐变色
         * @param {number} config.order - 排序顺序（可选，默认按注册顺序）
         */
        registerButton: function(config) {
            if (!config || !config.id) {
                console.error('[FloatingMenuManager] 注册失败：缺少必要参数 id');
                return false;
            }

            // 检查是否已注册
            const existingIndex = state.buttons.findIndex(btn => btn.id === config.id);
            if (existingIndex !== -1) {
                console.warn('[FloatingMenuManager] 按钮已存在，将更新配置:', config.id);
                state.buttons[existingIndex] = config;
            } else {
                state.buttons.push(config);
            }

            // 按order排序
            state.buttons.sort((a, b) => (a.order || 99) - (b.order || 99));

            // 重新渲染子球
            if (state.elements.subContainer) {
                renderSubFabs();
            }

            console.log('[FloatingMenuManager] 注册成功:', config.id);
            return true;
        },

        /**
         * 取消注册按钮
         * @param {string} id - 按钮ID
         */
        unregisterButton: function(id) {
            const index = state.buttons.findIndex(btn => btn.id === id);
            if (index !== -1) {
                state.buttons.splice(index, 1);
                if (state.elements.subContainer) {
                    renderSubFabs();
                }
                console.log('[FloatingMenuManager] 取消注册:', id);
                return true;
            }
            return false;
        },

        /**
         * 展开菜单
         */
        expand: function() {
            expand();
        },

        /**
         * 收起菜单
         */
        collapse: function() {
            collapse();
        },

        /**
         * 切换展开/收起
         */
        toggle: function() {
            toggle();
        },

        /**
         * 初始化管理器
         */
        init: function() {
            console.log('[FloatingMenuManager] 初始化...');

            // 清理旧实例
            this.destroy();

            // 加载保存的位置
            loadPosition();

            // 注入样式
            injectStyles();

            // 创建主悬浮球
            createMainFab();

            // 创建子球容器
            createSubContainer();

            // 处理模块先于FMM加载时的待注册队列
            var pending = window.parent._fmmPendingRegistrations;
            if (pending && pending.length) {
                pending.forEach(function(config) {
                    FloatingMenuManager.registerButton(config);
                });
                window.parent._fmmPendingRegistrations = [];
                console.log('[FloatingMenuManager] 处理了 ' + pending.length + ' 个待注册按钮');
            }

            // 渲染已注册的子球
            renderSubFabs();

            // 调整位置到可见范围
            adjustPositionToViewport();

            // 绑定窗口大小改变监听
            bindWindowResize();

            console.log('[FloatingMenuManager] 初始化完成');
        },

        /**
         * 销毁管理器
         */
        destroy: function() {
            // 移除DOM元素（通过state引用）
            if (state.elements.main) {
                state.elements.main.remove();
                state.elements.main = null;
            }
            if (state.elements.subContainer) {
                state.elements.subContainer.remove();
                state.elements.subContainer = null;
            }

            // 通过选择器清理孤儿元素（脚本重执行时旧state已丢失）
            parentDocument.querySelectorAll('.fmm-main-fab').forEach(function(el) { el.remove(); });
            parentDocument.querySelectorAll('.fmm-sub-container').forEach(function(el) { el.remove(); });

            // 移除注入的样式
            const styles = parentDocument.getElementById('floating-menu-manager-styles');
            if (styles) styles.remove();

            // 清空子球数组
            state.elements.subs = [];

            // 清空注册的按钮
            state.buttons = [];

            // 重置状态
            state.isExpanded = false;
            state.isDragging = false;
            state.hasMoved = false;

            console.log('[FloatingMenuManager] 已销毁');
        },

        /**
         * 获取当前状态
         */
        getState: function() {
            return {
                isExpanded: state.isExpanded,
                buttonCount: state.buttons.length,
                position: { ...state.position }
            };
        },

        /**
         * 获取已注册的按钮列表
         */
        getButtons: function() {
            return state.buttons.map(btn => ({
                id: btn.id,
                label: btn.label,
                order: btn.order
            }));
        }
    };

    // ============ 导出到全局 ============
    if (typeof window !== 'undefined') {
        window.parent.FloatingMenuManager = FloatingMenuManager;
        console.log('[FloatingMenuManager] 已加载到 window.parent.FloatingMenuManager');
    }

    // ============ 自动初始化 ============
    if (parentDocument.readyState === 'loading') {
        parentDocument.addEventListener('DOMContentLoaded', function() {
            FloatingMenuManager.init();
        });
    } else {
        FloatingMenuManager.init();
    }

    // ============ 自动清理 ============
    $(window).on('pagehide', function() {
        console.log('[FloatingMenuManager] 脚本卸载，执行清理...');
        FloatingMenuManager.destroy();
    });

})();
