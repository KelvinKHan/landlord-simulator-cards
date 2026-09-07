// ==================== 房东模拟器 - 变量结构定义 ====================
// 使用 MVU Zod 定义变量结构
// 单入口先注册结构监听，再启动固定版本的 MVU 本体。

import { registerMvuSchema } from 'https://cdn.jsdelivr.net/gh/StageDog/tavern_resource@dee97e8c3e24e1e75efe21141743e4b5c0af776e/dist/util/mvu_zod.js';

// ==================== Schema 定义 ====================
// 使用 zod 4 的语法定义变量结构
// z 是全局变量，由 MVU 本体提供

// ==================== 房间子Schema（含业务保护 + prefault） ====================
const RoomSchema = z.object({
    类型: z.string().prefault('空房间'),
    名称: z.string().prefault('未命名房间'),
    楼层: z.string().prefault('一楼'),
    位置: z.string().prefault('1-2'),
    住户: z.string().prefault('无'),
    描述: z.string().prefault('暂无描述'),
}).prefault({}).refine(room => {
    // 业务保护：有租客居住的房间类型必须为"卧室"
    const occupants = room.住户.split('、').map(s => s.trim()).filter(s => s && s !== '无' && s !== '<user>' && s !== '{{user}}');
    if (occupants.length > 0 && room.类型 !== '卧室' && room.类型 !== '您的房间') return false;
    return true;
}, { message: '有租客居住的房间类型必须为"卧室"，不能将租客分配到非卧室房间' });

const Schema = z.object({
    // 世界时间
    世界: z.object({
        年份: z.string().prefault('2024'),
        日期: z.string().prefault('1月1日'),
        星期: z.string().prefault('星期一'),
        时间: z.string().prefault('上午'),
    }).prefault({}),

    // 公寓配置
    公寓: z.object({
        楼层列表: z.array(z.string()).prefault([]),
        房间列表: z.record(
            z.string().describe('房间名'),
            RoomSchema
        ).prefault({}),
    }).prefault({}),

    // 租客列表（动态键：租客姓名 -> 租客数据）
    // 只保留核心字段：年龄、外貌、职业、性格、状态、内心、关系
    租客列表: z.record(
        z.string().describe('租客姓名'),
        z.object({
            年龄: z.coerce.number().prefault(20),
            外貌: z.string().prefault('待描述'),
            职业: z.string().prefault('无'),
            性格: z.string().prefault('待描述'),
            状态: z.string().prefault('正常'),
            内心: z.string().prefault('平静'),
            关系: z.record(
                z.string().describe('对象名'),
                z.string().describe('关系描述')
            ).prefault({}),
        }).prefault({})
    ).prefault({}),

}).superRefine((data, ctx) => {
    // ==================== 跨字段一致性校验 ====================
    const tenantNames = new Set(Object.keys(data.租客列表 || {}));
    const rooms = data.公寓?.房间列表 || {};

    // 校验1：房间住户必须存在于租客列表（防止幽灵住户）
    for (const [roomKey, room] of Object.entries(rooms)) {
        const occupant = room.住户;
        if (!occupant || occupant === '无') continue;
        if (room.类型 === '您的房间') continue;
        const names = occupant.split('、').map(s => s.trim()).filter(s => s && s !== '无' && s !== '<user>' && s !== '{{user}}');
        for (const name of names) {
            if (!tenantNames.has(name)) {
                ctx.addIssue({
                    code: 'custom',
                    message: '房间「' + roomKey + '」的住户「' + name + '」不在租客列表中，请同时添加租客档案',
                    path: ['公寓', '房间列表', roomKey, '住户'],
                });
            }
        }
    }

    // 校验2：租客列表中的每个租客必须被分配到某间卧室（防止无房租客）
    for (const tenantName of tenantNames) {
        let found = false;
        for (const room of Object.values(rooms)) {
            const names = (room.住户 || '').split('、').map(s => s.trim());
            if (names.includes(tenantName)) { found = true; break; }
        }
        if (!found) {
            ctx.addIssue({
                code: 'custom',
                message: '租客「' + tenantName + '」未分配到任何房间，请更新对应卧室的住户字段',
                path: ['租客列表', tenantName],
            });
        }
    }
});

// ==================== 注册 Schema ====================
$(() => {
    landlord.registerSchema(registerMvuSchema, Schema);
    console.log('✅ 房东模拟器变量结构已注册');
});
