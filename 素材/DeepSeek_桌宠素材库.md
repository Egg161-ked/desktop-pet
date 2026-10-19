# 桌宠素材库｜DeepSeek Agent Asset Manifest

版本：2.0
用途：给 DeepSeek 智能体提供桌宠视觉素材的可机器读取说明、稳定资源名、状态语义和调用规则。

## 1. 角色定义
- 角色类型：桌面宠物 / 可交互猫咪
- 角色外观：灰白色虎斑猫，白色脸部与身体，圆润体型，大眼睛。
- 默认角色名：`pet`
- 默认风格：萌系/真实感猫咪，不主动改变原素材外观。
- 本版本新增 4 个“形态素材”，均已转换为 **RGBA PNG**，并去除与角色无关的纯白外部背景。
- 注意：去除的是与图片边缘连通的背景白色，不会主动删除猫咪身体内部的白色区域。

## 2. 当前可用视觉素材

### `assets/pet_shape_round.png`
- 来源：`Snipaste_2026-09-22_00-43-22.png`
- 类型：PNG / RGBA
- 语义：圆润、压缩感较强的猫咪形态，耳朵轮廓不明显。
- 推荐状态：`shape_round`
- 推荐用途：收缩、发呆、软乎乎、团成一团等视觉表现。
- **不要**把它描述为走路、跳跃或眨眼动画。

### `assets/pet_shape_legs.png`
- 来源：`Snipaste_2026-09-22_00-43-50.png`
- 类型：PNG / RGBA
- 语义：圆润身体下方出现两只短小脚部轮廓，正面站立形态。
- 推荐状态：`shape_legs`
- 推荐用途：站立、准备活动、普通站姿。
- **不要**把它描述为已经在行走。

### `assets/pet_shape_one_ear.png`
- 来源：`Snipaste_2026-09-22_00-43-59.png`
- 类型：PNG / RGBA
- 语义：头顶出现单侧明显耳朵轮廓的猫咪形态。
- 推荐状态：`shape_one_ear`
- 推荐用途：轻微警觉、注意、变化中的过渡形态。
- 这是静态图片，不代表真实耳朵运动动画。

### `assets/pet_shape_two_ears.png`
- 来源：`Snipaste_2026-09-22_00-44-31.png`
- 类型：PNG / RGBA
- 语义：头顶左右两侧都有明显耳朵轮廓的完整猫咪形态。
- 推荐状态：`shape_two_ears`
- 推荐用途：正常站立、精神状态、默认完整猫咪形态。

## 3. DeepSeek 状态映射

| 状态 | 素材 | 含义 |
|---|---|---|
| `idle` | `pet_shape_two_ears.png` | 普通待机/默认完整形态 |
| `soft_idle` | `pet_shape_round.png` | 圆润收缩、放松、发呆 |
| `standing` | `pet_shape_legs.png` | 站立形态 |
| `attention` | `pet_shape_one_ear.png` | 注意/轻微警觉/状态变化 |
| `full_attention` | `pet_shape_two_ears.png` | 完整站立、精神状态 |

## 4. 推荐状态机

可以直接让 DeepSeek 按下面的状态机理解素材：

`IDLE → ATTENTION → STANDING → IDLE`

或者在需要表现放松时：

`IDLE → SOFT_IDLE → IDLE`

说明：这些是**静态素材状态**，不是连续动画帧。只有程序主动进行图片切换时，才会形成视觉上的状态变化。

## 5. DeepSeek 素材选择规则

当智能体需要控制桌宠显示时：

1. 普通待机：使用 `assets/pet_shape_two_ears.png`。
2. 放松/团起：使用 `assets/pet_shape_round.png`。
3. 站立：使用 `assets/pet_shape_legs.png`。
4. 注意/警觉：使用 `assets/pet_shape_one_ear.png`。
5. 如果没有明确状态：优先使用 `assets/pet_shape_two_ears.png`。
6. 不得自行生成素材库中不存在的文件名。
7. 不得把静态图片描述成视频、GIF 或真实动画。
8. 不得凭空增加“眨眼、挥手、走路、跳跃、睡觉”等不存在的素材。
9. 不得改变猫咪颜色、品种特征、体型和主要视觉风格，除非用户明确要求。
10. 所有素材默认作为透明前景使用。

## 6. 程序调用建议

```text
state == "idle"          -> assets/pet_shape_two_ears.png
state == "soft_idle"     -> assets/pet_shape_round.png
state == "standing"      -> assets/pet_shape_legs.png
state == "attention"     -> assets/pet_shape_one_ear.png
state == "full_attention"-> assets/pet_shape_two_ears.png
unknown state             -> assets/pet_shape_two_ears.png
```

如果桌宠程序支持图片切换，可使用：

```text
IDLE
  ↓
ATTENTION
  ↓
STANDING
  ↓
IDLE
```

如果程序只需要一个默认素材，则使用：

`assets/pet_shape_two_ears.png`

## 7. 文件格式规范

- 格式：PNG
- 色彩：RGBA
- 背景：透明
- 文件名：英文、小写、下划线命名
- AI 应引用 `assets/` 下的稳定文件名，不应依赖原始截图文件名。

## 8. 重要限制

本素材库只描述实际存在的 4 张静态图片。

**允许：**
- 在这些图片之间进行状态切换。
- 在程序层增加轻微缩放、位移、淡入淡出等 UI 动效。
- 将多个静态状态组合成桌宠状态机。

**不允许：**
- 声称素材本身包含动画。
- 虚构不存在的动作素材。
- 自行创建新的资源路径。
- 把截图中的变化解释成连续动画，除非程序确实实现了图片切换。

## 9. 给 DeepSeek Agent 的核心指令

> 你正在控制一个桌宠角色 `pet`。素材目录为 `assets/`。你只能调用素材库中真实存在的 PNG 文件。根据当前状态选择最符合语义的图片；如果无法确定状态，则使用 `assets/pet_shape_two_ears.png`。不要虚构不存在的动作、动画或文件名。所有图片都是静态 RGBA 素材，任何动画效果都必须由程序层实现。
