# GameBanana → 站内角色 映射表

> 本文件由 `scripts/logs/gamebanana/analyze-boundary.mjs` 生成，**进仓库**。
> 这是 `scripts/gamebanana-classify.mjs` 的输入，也是 PRD「Phase 1 第 1 步」的产物。

## 怎么读这张表

| 证据来源 | 含意 | 可信度 |
|---|---|---|
| `data` | 全库标题里的**中英同现**证据（如 `珂莱塔黑丝睡衣-Carlotta-black stockings pajamas`） | 高，可直接采信 |
| `human` | 数据给不出证据，按**鸣潮官方中英译名**补的 | ✅ **主理人已于 2026-09-28 逐行确认** |
| `none` | 混合桶，不映射 | 落 `Other/Misc` |

**硬约束**：右列每个值都必须 ∈ `characterImageMap`（64 个 key），单测会断言这一点。

## 全量 57 个子分类

| GameBanana 子分类 | 站内角色 | 该子分类条数 | 证据来源 | 证据数 | 证据样本 / 说明 |
|---|---|---|---|---|---|
| `Changli` | `长离` | 142 | data | 23 | `630132` Changli-Andoris\|长离-安朵丝 |
| `Rover Female` | `女漂` | 135 | data | 3 | `618400` Rover Female X Ryza 女漂 X 莱莎 |
| `Shorekeeper` | `守岸人` | 122 | data | 13 | `699213` 守岸人-花间舞 \| Shorekeeper - HuaJianWu |
| `Yinlin` | `吟霖` | 117 | data | 12 | `629936` 吟霖旗袍黑丝过膝袜-Yinlin Cheongsam black silk knee socks |
| `Camellya` | `椿` | 110 | data | 20 | `683897` 椿（Camellya）-机器 |
| `Carlotta` | `珂莱塔` | 102 | data | 8 | `673015` 珂莱塔黑丝睡衣-Carlotta-black stockings pajamas |
| `Jinhsi` | `今汐` | 97 | data | 9 | `645850` JinHsi-Oblivionis\|今汐-丰川祥子（演出服） |
| `Rover Male` | `男漂` | 95 | human | 0 | 标题多写作 RoverMale / Startorch，与 'Rover Male' 不字面匹配，池子只有 12 条 |
| `Cartethyia` | `卡提希娅` | 89 | human | 1 | 仅 1 条同现；大卡/小卡混装 mod 多，与 Fleurdelys 纠缠（见 Feature 5 特例） |
| `Phoebe` | `菲比` | 83 | data | 18 | `639358` Phoebe-Christmas(菲比-圣诞)-Num019 |
| `Cantarella` | `坎特蕾拉` | 79 | data | 5 | `615543` 坎特蕾拉mod~~Cantarella mod |
| `Chisa` | `千咲` | 71 | data | 5 | `699812` Chisa千咲泳装 |
| `Aemeath` | `爱弥斯` | 69 | data | 6 | `707986` 爱弥斯-蕾米的礼物 \| Aemeath-Rami 's present |
| `Augusta` | `奥古斯塔` | 63 | data | 7 | `680157` Queen Augusta 奥古斯塔×精绝女王 |
| `Iuno` | `尤诺` | 58 | data | 6 | `649135` Iuno 尤诺-慵懒清晨(Lazy Dawn Glow)-Num027 |
| `Zani` | `赞妮` | 54 | data | 2 | `637170` 3.2LODFIX赞妮皮肤mod来啦~Zani Skin mod is coming~~ |
| `Hiyuki` | `绯雪` | 52 | data | 13 | `718643` 绯雪和服黑丝-Hiyuki-Black kimono-black stockings |
| `Sanhua` | `散华` | 52 | data | 4 | `594498` Sanhua X qiming 启明替代散华 |
| `Lynae` | `琳奈` | 51 | data | 8 | `702871` Lynae泳装琳奈 |
| `Phrolova` | `弗洛洛` | 51 | data | 5 | `611173` 弗洛洛全裸(Phrolova Nude) |
| `Lupa` | `露帕` | 51 | data | 4 | `686671` (TBU)露帕-索普｜Lupa-M4 SOPMODII |
| `Zhezhi` | `折枝` | 48 | data | 10 | `632812` 折枝系带胖次-ZheZhi Lace underwear |
| `Baizhi` | `白芷` | 45 | data | 4 | `645127` Baizhi Bikini(toggle) 白芷 比基尼 |
| `Galbrena` | `嘉贝莉娜` | 45 | data | 4 | `657601` 嘉贝莉娜(Galbrena)-恶魔猎者-Num032 |
| `Ciaccona` | `夏空` | 41 | data | 5 | `637544` （空灵诗篇）Eversoul laura X Ciaccona（夏空） |
| `Yangyang: Xuanling` | `玄翎` | 39 | human | 1 | 统计被 'Yangyang' 污染误判为秧秧；这是秧秧的形态，站内是独立分类 |
| `Qingxiao` | `清宵` | 38 | data | 4 | `714219` 清宵-踏云-公开版\|Qingxiao-Step on the cloud |
| `Jianxin` | `鉴心` | 37 | human | 1 | 仅 1 条同现 |
| `Danjin` | `丹瑾` | 36 | data | 4 | `691446` Danjin-Longyan\|丹瑾-胧嫣\|3.5 fix |
| `Yangyang` | `秧秧` | 36 | data | 6 | `694702` Yangyang XuanLing barefoot SP秧秧裸足 |
| `Suisui` | `穗穗` | 34 | data | 2 | `700253` 穗穗-小修小补-公开版\|SuiSui-tweak-public version |
| `Mornye` | `莫宁` | 33 | data | 3 | `650295` Mornye Columbina Hyposelenia 莫宁 少女 |
| `Chixia` | `炽霞` | 32 | human | 1 | 仅 1 条同现；注意有条标题误写「赤霞」 |
| `Verina` | `维里奈` | 32 | data | 4 | `633336` Verina-Nanally\|维里奈-娜娜莉 |
| `Taoqi` | `桃祈` | 30 | data | 2 | `684726` 桃祈（taoqi）-杀戮都市 |
| `Lucilla` | `洛瑟菈` | 28 | data | 2 | `693587` Lucilla-Wine and Petals\|洛瑟菈-酒与花\|3. 6 texture fixed |
| `Encore` | `安可` | 27 | data | 3 | `686673` 安可Encore-森亚露露香 |
| `Xiangli Yao` | `相里要` | 26 | data | 4 | `550075` 相里要布莱泽 xiangliyao |
| `Denia` | `达妮娅` | 24 | human | 1 | 仅 1 条同现 |
| `Jiyan` | `忌炎` | 24 | human | 1 | 仅 1 条同现 |
| `NPCs & Entities` | — | 24 | none | — | 混合桶，**不查子分类表**；走完整条链后仍未命中的落 `Other/Misc` |
| `Calcharo` | `卡卡罗` | 23 | human | 1 | 仅 1 条同现 |
| `Qiuyuan` | `仇远` | 23 | human | 1 | ⚠️ 统计误判为千咲（被多角色混搭 mod 污染）；Chisa 才是千咲 |
| `Roccia` | `洛可可` | 22 | data | 2 | `690543` 洛可可-阿比盖尔·威廉姆斯（FGO） \| Roccia-Abigail Williams(FGO) |
| `Sigrika` | `西格莉卡` | 20 | data | 2 | `666781` 西格莉卡蕾丝内衣-Sigrika-lace underwear |
| `Brant` | `布兰特` | 18 | human | 1 | 仅 1 条同现 |
| `Lumi` | `灯灯` | 18 | human | 1 | 仅 1 条同现 |
| `Lucy` | `露西` | 14 | human | 1 | 仅 1 条同现 |
| `Mortefi` | `莫特斐` | 14 | human | 0 | 零同现 |
| `Buling` | `卜灵` | 13 | data | 4 | `639650` Buling卜灵pregnant |
| `Yuanwu` | `渊武` | 12 | human | 1 | 仅 1 条同现 |
| `Luuk Herssen` | `路赫斯` | 11 | human | 0 | 零同现；标题常拼错成 Luuk Hersson/Herssen，需补别名 |
| `Lingyang` | `凌阳` | 10 | human | 0 | 零同现 |
| `Rebecca` | `丽贝卡` | 9 | human | 0 | 零同现 |
| `Youhu` | `釉瑚` | 7 | human | 0 | 零同现 |
| `Aalto` | `秋水` | 7 | human | 0 | 零同现。初稿误判「站内无此角色」—— 秋水就是 Aalto |
| `Jingran` | `景燃` | 4 | human | 0 | 零同现 |

## 统计

- 有数据证据（`data`）：**36** 个
- 靠官方译名补（`human`）：**20** 个 —— ✅ 主理人已于 2026-09-28 确认
- 不映射（`none`）：**1** 个
- 完整性校验：✅ 57 个子分类全部有归属
- 越界校验：✅ 没有映射到 characterImageMap 之外的值

## 已知统计陷阱（单测要钉死）

| 子分类 | 统计会给出 | 实际应为 | 原因 |
|---|---|---|---|
| `Qiuyuan` | `千咲` | `仇远` | 多角色混搭 mod（`Qiuyuan-Jingran`）污染共现；千咲是 `Chisa` |
| `Yangyang: Xuanling` | `秧秧` | `玄翎` | 别名展开让它的池子混进了 `Yangyang` 的标题 |
| `Chixia` | `炽霞` | `炽霞` ✅ | 仅 1 条证据，且该条标题误写「赤霞」 |

## 两个不走子分类表的特例（必须排在查表之前）

`Skins >> Cartethyia` 与 `Skins >> Aemeath` 两个子分类里**混装了站内已有的独立分类**，
只查表会整批糊成一个值，**且不报错**：

| 子分类 | 混装内容 | 拆分规则（实测落点） |
|---|---|---|
| `Cartethyia` | 大卡 + 小卡 | 标题或子分类含 `Fleurdelys` / `fuludelisi` / `大卡` → `芙露德莉斯`（41 条）；否则 → `卡提希娅`（59 条） |
| `Aemeath` | 爱弥斯本体 + 机甲 | 标题含 `机甲` / `Mecha` / `Exo` → `爱弥斯的机甲`（4 条）；否则 → `爱弥斯`（69 条） |

排序要求：**特例规则 → 子分类查表**。写反了特例会静默失效（整批落进子分类的值）。
参照既有的 `scripts/daka-classify.mjs`（同样处理「大卡 → 芙露德莉斯」）。

## 子分类 `NPCs & Entities` 只能当末位兜底

主理人口径「NPC / 怪物归 `Other/Misc`」成立，但这个子分类是**混合桶** ——
实测混着真角色、载具、立绘，把它放在判定链最前面会**静默吞掉**它们（且不报错）。
正确做法：走完整条链仍未命中，才落 `Other/Misc`。

## ⛔ 别把 `woju` 当成载具关键词（曾写错过）

`Woju` 是**高产作者名**，他给自己的每次投稿都加这个前缀 —— 全库 64 条以 `Woju` 开头：

| 落点 | 条数 | 例 |
|---|---|---|
| 角色（守岸人 / 椿 / 吟霖 / 白芷 / 长离 …） | 41 | `Woju - Shorekeeper Neko Maid`、`Woju - Baizhi Summer Bliss` |
| 武器 / 特效 → `Other/Misc` | 19 | `Woju - Trinity Shooter \| Static Mist`、`Woju - 3in1 Glowing Scythes` |
| 载具 | 4 | `Woju - Fantasy Glider`、`Woju - Bat Glider` |

**把 `woju` 加进载具正则，那 19 条武器 / 特效会被整批错归进 `滑翔翼,翱翔翼,科考摩托`。**
真正的载具靠 `glider` 这个词就能抓到，不需要作者名。

唯一还悬着的是 4 条 `Hover` / `Rider`（`Woju - Scarlet Night Rider`（67 赞）、
`Woju - Hover Pumpkin`、`Woju - Bumblebee Rider`、`Woju - Hover Droid Iron Man`）——
`Scarlet Night` 是长离皮肤名，疑为配套摩托涂装。要捞得加收紧的 `\brider\b|hover`
（`Inferno Rider` 是 boss，会误命中）。**影响面 4 条，留在 `Other/Misc` 完全安全，故不动。**
