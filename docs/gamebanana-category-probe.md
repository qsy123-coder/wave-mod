# GameBanana 鸣潮专区 · 分类普查报告

> 由 `node scripts/probe-gamebanana-categories.mjs` 生成，只读不改库。
> 本报告是 `docs/gamebanana-integration-prd.md` 里 Phase 0 的产出物 ——
> 写 `scripts/gamebanana-classify.mjs` 的映射表必须以它为准，不得靠猜。

## 0. 口径说明（先读这一节）

GameBanana 的 Subfeed 是一个**混合流**，里面不只有 MOD。统计前必须按 `_sModelName` 过滤，
否则论坛提问与求物帖会混进映射表。下面所有统计（除本节外）**只针对**
`_sModelName === "Mod"` **且** `_bHasFiles !== false` 的记录 —— 即真正可下载、可入库的那批。

### 全量 feed 的类型分布（未过滤）

| `_sModelName` | 条数 | |
|---|---|---|
| Mod | 3057 | ✅ 正文口径 |
| Question | 1984 | ❌ 已排除 |
| Request | 702 | ❌ 已排除 |
| Wip | 134 | ❌ 已排除 |
| Thread | 61 | ❌ 已排除 |
| Tool | 57 | ❌ 已排除 |
| Tutorial | 25 | ❌ 已排除 |
| Script | 15 | ❌ 已排除 |
| Concept | 5 | ❌ 已排除 |
| Blog | 4 | ❌ 已排除 |
| News | 3 | ❌ 已排除 |
| Poll | 3 | ❌ 已排除 |

### 其他实测结论（正式同步脚本必须照做）

| 项 | 实测结果 |
|---|---|
| 分页参数 | `_nPerPage` / `_nPerpage` / `_per_page` / `_nLimit` **全部被忽略**，硬编码 15 条/页 |
| 全量遍历成本 | 405 次请求，无捷径 |
| `_sSort=default` | **不是时间序**（同页内 2026-09-27 与 2024-09-06 混排），不可用于增量 |
| `_sSort=new` | **严格时间倒序**，增量同步用这个 |
| `_sSort=updated` | 可用，但语义不同（记录数 1432，疑似近期有更新的子集） |
| `_sSort=popular/likes/downloads/best` | **一律 400**，服务端不支持按热度排序 |
| 下载链 | `https://gamebanana.com/mods/download/{_idRow}`，可由 id 直接构造 |
| 列表接口缺字段 | Subfeed **不含** `_aContentRatings` / `_aFiles` / `_nDownloadCount`，要逐条调 `Mod/{id}/ProfilePage` |

## 1. 概览

| 项 | 值 |
|---|---|
| GameBanana game id | `20357` |
| feed 报告总数 | 6075 |
| 抓取分页 | 405 页 |
| 抓取失败页 | 无 |
| 去重后实际读到 | 6050（覆盖 99.6%） |
| 其中 `_sModelName=Mod` | 3057 |
| 其中无文件（跳过） | 0 |
| **可入库（Mod + 有文件）** | **3057** |
| 其中无子分类（只能靠标题猜） | 410（13.4%） |
| 站内现有标准角色（合法取值域） | 64 个 |

## 2. 根分类分布（仅可入库记录）

| 根分类 | 条数 |
|---|---|
| Skins | 2816 |
| Other/Misc | 156 |
| UI | 85 |

## 3. 完整 `根分类 >> 子分类` 表（仅可入库记录）

**这张表是映射模块的输入。** 每行都要在映射表里有记录，
目标值**必须**是下面第 6 节里已有的角色 key。

| 根分类 >> 子分类 | 条数 |
|---|---|
| Skins >> (空) | 169 |
| Other/Misc >> (空) | 156 |
| Skins >> Changli | 142 |
| Skins >> Rover Female | 135 |
| Skins >> Shorekeeper | 122 |
| Skins >> Yinlin | 117 |
| Skins >> Camellya | 110 |
| Skins >> Carlotta | 102 |
| Skins >> Jinhsi | 97 |
| Skins >> Rover Male | 95 |
| Skins >> Cartethyia | 89 |
| UI >> (空) | 85 |
| Skins >> Phoebe | 83 |
| Skins >> Cantarella | 79 |
| Skins >> Chisa | 71 |
| Skins >> Aemeath | 69 |
| Skins >> Augusta | 63 |
| Skins >> Iuno | 58 |
| Skins >> Zani | 54 |
| Skins >> Hiyuki | 52 |
| Skins >> Sanhua | 52 |
| Skins >> Lupa | 51 |
| Skins >> Lynae | 51 |
| Skins >> Phrolova | 51 |
| Skins >> Zhezhi | 48 |
| Skins >> Baizhi | 45 |
| Skins >> Galbrena | 45 |
| Skins >> Ciaccona | 41 |
| Skins >> Yangyang: Xuanling | 39 |
| Skins >> Qingxiao | 38 |
| Skins >> Jianxin | 37 |
| Skins >> Danjin | 36 |
| Skins >> Yangyang | 36 |
| Skins >> Suisui | 34 |
| Skins >> Mornye | 33 |
| Skins >> Chixia | 32 |
| Skins >> Verina | 32 |
| Skins >> Taoqi | 30 |
| Skins >> Lucilla | 28 |
| Skins >> Encore | 27 |
| Skins >> Xiangli Yao | 26 |
| Skins >> Denia | 24 |
| Skins >> Jiyan | 24 |
| Skins >> NPCs & Entities | 24 |
| Skins >> Calcharo | 23 |
| Skins >> Qiuyuan | 23 |
| Skins >> Roccia | 22 |
| Skins >> Sigrika | 20 |
| Skins >> Brant | 18 |
| Skins >> Lumi | 18 |
| Skins >> Lucy | 14 |
| Skins >> Mortefi | 14 |
| Skins >> Buling | 13 |
| Skins >> Yuanwu | 12 |
| Skins >> Luuk Herssen | 11 |
| Skins >> Lingyang | 10 |
| Skins >> Rebecca | 9 |
| Skins >> Aalto | 7 |
| Skins >> Youhu | 7 |
| Skins >> Jingran | 4 |

## 4. 无子分类记录的「标题首段」分布（仅可入库）

首段 = 标题里第一个 `-` / `|` 之前的那一截。这批是标题关键词映射的候选词。

| 标题首段 | 条数 |
|---|---|
| Woju | 23 |
| Emerald of Genesis Redesign | 2 |
| Lynae | 2 |
| (F/M) Rover NSFW Ui | 1 |
| （Fail mod）Liangyu fullnude toggle | 1 |
| (outdated)Animate and static pantyhose splash art | 1 |
| （TBU）Sword of creator (Replica) | 1 |
| [2026]⭐Custom Splash Art Official⭐ | 1 |
| [WWMI] 4K Playable Character Textures Pack | 1 |
| [WWMI]Remove Zhezhi's glasses | 1 |
| [WWMI]Zhezhi's clean shoulders and chest | 1 |
| 【WWMI】Hide the fog | 1 |
| 【WWMI】Hide UI UID FOG and Coordinates | 1 |
| 【WWMI】Luhs UI Tool v1.3 Hide UI UID and FOG | 1 |
| ⭐Zani No Jacket⭐[MODP923] | 1 |
| 3.1黄金可变形摩托来了~~Gold Motorbike Transformation | 1 |
| 3.2LOD恶魔大姐姐来了3.2LODGalbrena is coming. | 1 |
| 3.2LODFIX小爱机甲~AemeathMecha | 1 |
| 奥古斯塔武器模组/Augusta weapon mod | 1 |
| 刺坆菇罪袋 mushroom mod | 1 |
| 飞行翅膀替换为无妄者的翅膀 | 1 |
| 弗洛洛 | 1 |
| 华彩乐段 》 万事明晰梦武器涂装 | 1 |
| 简易mod1.4 | 1 |
| 角 奶龙 dragon mod | 1 |
| 坎特蕾拉来啦~~[ZH] | 1 |
| 类泳装????比基尼????露帕 | 1 |
| 燎照之骑 雷欧赛文 motorcycle mod | 1 |
| 摩托车警察大王 Motorcycle CT | 1 |
| 派猛 | 1 |
| 漂泊者替换无冠者 | 1 |
| 奇幻变奏变为漪澜浮录（常驻） | 1 |
| 散华 | 1 |
| 散华的动态配队mod | 1 |
| 硕雷加拉特隆 | 1 |
| 维里奈 | 1 |
| 乌龟 奶龙贝利亚 Turtle boss mod | 1 |
| 武器 | 1 |
| 武器投影模型替换/Weapon projection mod replace | 1 |
| 小奶狼 | 1 |
| 新声骸boss改度星者 | 1 |
| 猩猩奶龙 monkey boss Milk Dragon | 1 |
| 釉瑚赤脚[ZH] | 1 |
| 渊武 | 1 |
| 云闪卡卡罗 monster mod Calcharo | 1 |
| 赞妮大胸~~[ZH] | 1 |
| A real man | 1 |
| ADJUST Flash Of Skill | 1 |
| Aemeath big breast | 1 |
| Aemeath Glider | 1 |
| Aether portal Minecraft mod 1.12 | 1 |
| All Characters Effect Color Modify | 1 |
| Alpha's Motorbike | 1 |
| Alternative Cursor Colors | 1 |
| Angel Wing | 1 |
| Animated + Static Randomised Loading Screen mod | 1 |
| Animated Custom Cursor | 1 |
| Animated Nitrous Bike | 1 |
| Animated NSFW Camellya Ui | 1 |
| Animated NSFW Guidebook Ui | 1 |
| Animated NSFW Phoebe Ui | 1 |
| Animated NSFW Yinlin Ui | 1 |
| Another Glider Recolor | 1 |
| Ark | 1 |
| Ascendant Aces_Splash | 1 |
| Asta sword only for augusta | 1 |
| Augusta, lord of sunlight | 1 |
| Aumento de FPS | 1 |
| Automatic Mod Changer For WW | 1 |
| B | 1 |
| Background + Portraits | 1 |
| Bad end | 1 |
| Bailu's Gourd | 1 |
| Better HUD | 1 |
| Big Glider Wings | 1 |
| Big Tiddy Cuties Portraits | 1 |
| Bike as Operational Howitzer [SU76] | 1 |
| Billy over Alto | 1 |
| bizarre phrolova | 1 |
| Black wildfire mark | 1 |
| Blanka XXMI | 1 |
| Blazing Brilliance over Commando of Conviction | 1 |
| Blazing Brilliance Over EOG | 1 |
| Bloodpact's Pledge for M/F Radiant Rover Mods | 1 |
| Brant Exposed Back + Jiggle Physics | 1 |
| Brant Jiggle Physics + Body Edit | 1 |
| Broom (Verdant Summit) | 1 |
| Buouxiong | 1 |
| butt plug on motorcycle | 1 |
| Butterfly Replaces Glider | 1 |
| CalbrenaChaopin | 1 |
| Calcharo Bike | 1 |
| Call_of_the_Abyss Recolored | 1 |
| Cantarella Ui | 1 |
| Carlotta Skin Animated Splash | 1 |
| carlotta weapon replace static mist/珂莱塔专武替换停驻之烟 | 1 |
| Carnival mask | 1 |
| Casual Date Lupa | 1 |
| Cervix shedding character selection mod | 1 |
| changli | 1 |
| Changli effect color modification | 1 |
| Changli Modify + Thicc | 1 |
| Changli Skin Animated Splash | 1 |
| Changli Summer Skin | 1 |
| Chest lines WuWa Ver. | 1 |
| Chibi Portraits! + Portrait Builder | 1 |
| Chiori over Danjin | 1 |
| Chisa | 1 |
| Chisa & Lynae | 1 |
| ChunNPCNudeSkin | 1 |
| Clean UI | 1 |
| Colley over frover | 1 |
| Commando of Conviction to Reverent Elusarca | 1 |
| Copium Carlotta Weapon | 1 |
| Crownless | 1 |
| Crownless Spear (Ages of Harvest) | 1 |
| Crownless&Vergil | 1 |
| Cursor Pack | 1 |
| Custom Loading Screen (SFW) | 1 |
| Custom portraits | 1 |
| Custom Splash Art(NSFW) | 1 |
| Custom Swimsuit Splash | 1 |
| Cute and Casual | 1 |
| Cutesy Sanhua | 1 |
| Discord to Tamonowo | 1 |
| Dog Remover | 1 |
| Dragon Wings | 1 |
| Easy Makeup Toggle | 1 |
| Edo tensei uchiha madara over crownless | 1 |
| Emerald of Genesis Recolour | 1 |
| Emu Otori to Jinhsi | 1 |
| Epic Portraits | 1 |
| Equipable Iuno's Bracelet | 1 |
| Error after update I found the solution like this | 1 |
| Exile NPC | 1 |
| Exile NPC Technician Thicc | 1 |
| F15 glider | 1 |
| Fat MEATMEAT UI | 1 |
| FeibiWhite dress | 1 |
| Felyne over The False Sovereign | 1 |
| Female Half Nude Splash Art 2.8.2 | 1 |
| Female NSFW/SFW Team Portraits | 1 |
| Femboy Iuno | 1 |
| Fleurdelys Bought Shoes | 1 |
| Fleurdelys fire sword | 1 |
| Floating Dreams over Rectifier | 1 |
| Full Pack Autoswap and Animation Portraits mod | 1 |
| fuludelisi simple | 1 |
| Game over defeated scene background | 1 |
| Genshin Door | 1 |
| Geshu Lin Swords | 1 |
| Glider Retexture | 1 |
| Guardian Sword to Holy Guild Knight | 1 |
| HAVOC SCYTHE | 1 |
| Havoc Spear & Flight Wings | 1 |
| Hecate half | 1 |
| Hecate over various swords | 1 |
| Hecate x EVA | 1 |
| Hellfire Replace Emerald of Genesis | 1 |
| Hi Friends | 1 |
| Hidden auxiliary weapons | 1 |
| Hidden auxiliary weapons 2 | 1 |
| Hidden motorcycle | 1 |
| Hide Echo Gourd v2.4 | 1 |
| Hide Terminal | 1 |
| Hide wings | 1 |
| Hide_UI 1.3 | 1 |
| Hider | 1 |
| HideUI 3.3 | 1 |
| High Voltage Yinlin & Stringmaster (Recolor) | 1 |
| higher and no cape | 1 |
| Holy Thorns Crownless | 1 |
| Hongzhen NPC Nude | 1 |
| Hoverdroid Glider | 1 |
| How To Install ReShade Add | 1 |
| Huanglong Breast Clinic | 1 |
| I.R.I.S | 1 |
| I.R.I.S Half | 1 |
| igris | 1 |
| Immersive Dialogue & Remove Text on Dialogue | 1 |
| Incredibly Infinite Intimidat Replace Abyss Surges | 1 |
| Inferno Rider | 1 |
| Injured Effect Remover v2.1.1 | 1 |
| Invisible gourd WWMI | 1 |
| Invisible Ocean's Gift | 1 |
| Iron Feathers over AOH+LR | 1 |
| Ishtar Weapon for Iuno | 1 |
| JianxinModify + Thicc | 1 |
| Jinhsi Skin Animated Splash | 1 |
| Jinhsi Skin Portrait Alternative | 1 |
| JinhsiNoPants | 1 |
| Kitsune Wives Cat Lingerie TeamUI | 1 |
| Koko NPC shorter skirt | 1 |
| Kusabimaru Glow | 1 |
| Kusabimaru over EOG | 1 |
| LargerMap | 1 |
| Last Dance Winchester Colt | 1 |
| LewdingImages | 1 |
| Light Sceptre Replace BigSword | 1 |
| Lilith replace Yinlin | 1 |
| limit testing reshade preset | 1 |
| Limited gacha page | 1 |
| Loading Screen Mod | 1 |
| Loli God Requiem Moon Help | 1 |
| Lustrous Blade | 1 |
| Lynette over charlotte | 1 |
| made in heaven phrolova | 1 |
| Maid Phoebe | 1 |
| Maintain the second form of Zanni 常驻赞妮爆衣状态 | 1 |
| Maliketh's Black Blade as wildfire mark | 1 |
| Man!! Replace Glider | 1 |
| Maqi NPC | 1 |
| MEGA EPIC UI Backgrounds Pack! | 1 |
| miHoYoDoor | 1 |
| monster Ultraman Belial 云闪之鳞 贝利亚 | 1 |
| Motor as Tank T | 1 |
| motorbike as a tank | 1 |
| Motorcycle as Tank | 1 |
| Mrover ID card | 1 |
| Multi | 1 |
| MultiColorChanger3 | 1 |
| MY PORSCHE ARRIVES | 1 |
| Namipon Replaced by Chiori's Doll | 1 |
| NANA | 1 |
| Nether Port | 1 |
| Nimbus wraith | 1 |
| No Calabash(No Gourd) (WWMI) | 1 |
| No Lock | 1 |
| No More Bloom | 1 |
| No More Outline (3DMigoto & WWMI Compatible) | 1 |
| No Outline | 1 |
| No Reload Mod Manager (Mod Selection) | 1 |
| NPC 1 Mini Skirt | 1 |
| NPC half | 1 |
| Npc Twins | 1 |
| NPC_Cartethyia x Senhime | 1 |
| NSFW Backpack,Team,Store, UI | 1 |
| NSFW Battlepass Ui | 1 |
| NSFW Cartethyia Ui | 1 |
| NSFW Custom Texture Selector Backpack/Item Details | 1 |
| NSFW Female Portraits | 1 |
| NSFW Guidebook | 1 |
| NSFW Jinhsi Ui | 1 |
| NSFW Lupa Ui | 1 |
| NSFW Shorekeeper Ui | 1 |
| NSFW Skill Icons & Forte Ui (Toggleable) | 1 |
| NSFW/SFW Custom Loading Screens | 1 |
| nvzhu2.1npc | 1 |
| Ocean Song Qingxiao | 1 |
| Ominous Emerald of Genesis | 1 |
| Onigiri is Back [Scar] | 1 |
| Onmyoji team cards | 1 |
| Original Game Painting | 1 |
| Outfit Display Nude Splash Art | 1 |
| outline remove | 1 |
| Overclocked Reshade | 1 |
| P5 Akechi over Brant | 1 |
| Paraglider | 1 |
| Phoebe Kite 菲比 白鸢 | 1 |
| phoebe Swimsuit executor | 1 |
| Phrolova | 1 |
| Phrolova mod/芙洛洛mod | 1 |
| Phrolova_Original_Toggles(Sliders) | 1 |
| Portrait MonsterGirls | 1 |
| Prevent Transparency | 1 |
| Project Gray Raven [PGR] | 1 |
| Projection weapon yamato | 1 |
| Puppet Nivora replaces Havoc Warrior | 1 |
| Purple Cosmic Ripples | 1 |
| Puzzle & Challenge Lines | 1 |
| Qingxiao can fly | 1 |
| Qiuyuan | 1 |
| QiuYuan | 1 |
| QIUYUAN | 1 |
| Quality of Life | 1 |
| Quiet HUD (UI toggles) | 1 |
| Radiant Corsair Brant | 1 |
| Radiant Emerald of Genesis | 1 |
| Radiant Glider and Wings | 1 |
| Radiant Qiuyuan's Emerald Sentence | 1 |
| Radiant Radiance Cleaver | 1 |
| Radiant Tyrodachi | 1 |
| Radiant Tyrokatana | 1 |
| Rayquaza over Jue | 1 |
| Rean Tachi over Bloodpact's Pledge and Haultir | 1 |
| Rean Tachi over Emerald of Genesis | 1 |
| Rean Tachi over Tyro Sword | 1 |
| Recolor Chest | 1 |
| Red Cosmic Ripples | 1 |
| Red Origami Umbrella Replaces Glider | 1 |
| Red Spring replaces Emerald of Genesis | 1 |
| Remove character contour lines(删除角色轮廓线) | 1 |
| Remove Gourd (WWMI) | 1 |
| Remove Gourd(Patch 1.2) | 1 |
| Remove Transparency Filter | 1 |
| Reshade Preset | 1 |
| Rickroll the whole Rinascita | 1 |
| Rinascita Breast Clinic | 1 |
| Rover Idol | 1 |
| Roververse | 1 |
| SD Character Icon | 1 |
| seolin | 1 |
| SFW Fanart Aesthetic Splash | 1 |
| SFXColorChanger | 1 |
| Shorekeeper Lewding | 1 |
| simple ciaccona mod/简单的夏空mod | 1 |
| SIMPLE EDIT CARLOTTA SECRET DATE | 1 |
| simple pohobe mod/简单的菲比mod | 1 |
| simple thicc zani（ WIP ） | 1 |
| Simplified dialog box | 1 |
| Skin Color Changer | 1 |
| Smoll Motorbike Mod | 1 |
| Somnoire Anchor to Scissor Blade | 1 |
| Splash Art (diverse art type) | 1 |
| SPOLSZCZENIE DO WUTHERING WAVES | 1 |
| Starfield Calibrated | 1 |
| StarFlower Replace Glider | 1 |
| Stati/Novaburst replace Galbrena weapon and other | 1 |
| Static Mist Recolored for Carlotta | 1 |
| Tab Menu Blur Removal | 1 |
| TAB radial menu blur removal | 1 |
| Tall Mommies Mod | 1 |
| Taller Lumi | 1 |
| Team pairing image Mod | 1 |
| TeamUI2Viewer | 1 |
| Teleport to Tuanzi | 1 |
| Terminal/Team Menu Background mod + Builder | 1 |
| The Appearance of the GunDevil Dragon | 1 |
| The Black Shores NPC | 1 |
| The Captain's Thighs | 1 |
| The Moon | 1 |
| The Wuthering ReShade [2.5.5][UI FIX for 3.1] | 1 |
| Thicc I.R.I.S | 1 |
| Thicc Lahai | 1 |
| Thicc Lorelei | 1 |
| This is not a Mod | 1 |
| toothless JUE | 1 |
| transparency filter remover | 1 |
| Tron Light Cycle | 1 |
| TrueView Reshade For WuWa | 1 |
| Tyro over multiple swords | 1 |
| Tyro Sword projection for Rover main | 1 |
| UI Mod Maker for WWMI | 1 |
| UI SFW Animation Portrait mod by Binhphuoi | 1 |
| UI Toggle | 1 |
| UI滑动模块切换组件 | 1 |
| UID Hider hash fix ? | 1 |
| UIDOFF | 1 |
| Ultimate ReShade Preset | 1 |
| Umbrella Glider | 1 |
| Vergil's Plastic Chair | 1 |
| Wajit nvzhu | 1 |
| Waldmeister Replace Age Of Harvest | 1 |
| WatermarkOff | 1 |
| weapon for huanren over yangyang | 1 |
| weapon for rover cos seraphia（女漂cos塞尔希娅武器) | 1 |
| weapon mod 常驻五星枪 火麒麟 | 1 |
| Weapon Replacement | 1 |
| White Standard Pistol and Sword | 1 |
| Wildfire replace Waning/Lustrous Razor/露帕专武外观替换 | 1 |
| Winter Mode Youhu | 1 |
| Winter's Glaive Verdant Summit | 1 |
| Wolf Fang Replace Static Mist | 1 |
| WSKr Loader (Special K for Wuthering Waves) | 1 |
| Wuthering Shades | 1 |
| Wuthering Waves Mod Manager | 1 |
| WUWA Image Quality Improvement 鸣潮画质提升指南(UE | 1 |
| WuWa Mod Manager (IMM) | 1 |
| WuWa Outline Removal | 1 |
| Wuwa X Freiren Project | 1 |
| WuWaLite (Ultra FPS Boost) | 1 |
| WuwaTFR | 1 |
| WWMI RabbitFX | 1 |
| WWW18+tips | 1 |
| xiangliyao | 1 |
| Yamato Replace Emerald of Genesis | 1 |
| yangyang exotic | 1 |
| Ying's Dress Youhu | 1 |
| YinlinModify + Thicc | 1 |
| YOUHU Bunny Ears | 1 |
| Youhu no Backpack no Hat | 1 |
| Zani | 1 |
| Zani Saint NSFW | 1 |
| Zani Tweaks (No cloak, No tail, etc.) | 1 |
| ZheZhi basebody model | 1 |
| zhezhi Remove chest covering and glasse【WWMI】 | 1 |

## 5. 无子分类记录的完整标题清单（仅可入库）

共 410 条，按点赞降序。人工判定这批属于哪个角色。

| gb_id | 点赞 | 标题首段 | 标题 |
|---|---|---|---|
| 527815 | 3287 | WWMI RabbitFX | WWMI RabbitFX - Glow FX + Censor Remover |
| 516485 | 3040 | Remove Transparency Filter | Remove Transparency Filter |
| 582623 | 1728 | No Reload Mod Manager (Mod Selection) | No Reload Mod Manager (Mod Selection) |
| 540497 | 1701 | Project Gray Raven [PGR] | Project Gray Raven [PGR] | Lucia |
| 611267 | 1498 | Prevent Transparency | Prevent Transparency |
| 545567 | 1403 | Female Half Nude Splash Art 2.8.2 | Female Half Nude Splash Art 2.8.2 |
| 535644 | 1237 | 【WWMI】Hide UI UID FOG and Coordinates | 【WWMI】Hide UI UID FOG and Coordinates |
| 530235 | 1136 | Remove Gourd (WWMI) | Remove Gourd (WWMI) |
| 636570 | 952 | Zani Saint NSFW | Zani Saint NSFW |
| 576820 | 881 | Phoebe Kite 菲比 白鸢 | Phoebe Kite 菲比 白鸢 |
| 571245 | 719 | NSFW Backpack,Team,Store, UI | NSFW Backpack,Team,Store, UI |
| 573760 | 718 | yangyang exotic | yangyang exotic |
| 601278 | 694 | NPC half | NPC half-nude |
| 575376 | 641 | Animated + Static Randomised Loading Screen mod | Animated + Static Randomised Loading Screen mod |
| 596124 | 639 | Kitsune Wives Cat Lingerie TeamUI | Kitsune Wives Cat Lingerie TeamUI |
| 595130 | 606 | transparency filter remover | transparency filter remover |
| 595701 | 583 | The Black Shores NPC | The Black Shores NPC |
| 567141 | 539 | Chest lines WuWa Ver. | Chest lines WuWa Ver. |
| 591297 | 492 | 赞妮大胸~~[ZH] | 赞妮大胸~~[ZH] |
| 598668 | 463 | Animated NSFW Guidebook Ui | Animated NSFW Guidebook Ui |
| 575443 | 461 | Maid Phoebe | Maid Phoebe |
| 525176 | 444 | Clean UI | Clean UI |
| 591451 | 434 | Maintain the second form of Zanni 常驻赞妮爆衣状态 | Maintain the second form of Zanni 常驻赞妮爆衣状态 |
| 607348 | 433 | NSFW Shorekeeper Ui | NSFW Shorekeeper Ui |
| 594483 | 428 | Thicc Lorelei | Thicc Lorelei |
| 625492 | 422 | Fat MEATMEAT UI | Fat MEATMEAT UI |
| 611923 | 414 | (F/M) Rover NSFW Ui | (F/M) Rover NSFW Ui |
| 571389 | 387 | NSFW/SFW Custom Loading Screens | NSFW/SFW Custom Loading Screens |
| 590003 | 380 | Animated NSFW Camellya Ui | Animated NSFW Camellya Ui |
| 593490 | 376 | WuWa Mod Manager (IMM) | WuWa Mod Manager (IMM) |
| 647211 | 361 | Lynae | Lynae - Mogador V3.4 |
| 566410 | 348 | Rinascita Breast Clinic | Rinascita Breast Clinic |
| 595706 | 336 | Animated NSFW Phoebe Ui | Animated NSFW Phoebe Ui |
| 540867 | 336 | MultiColorChanger3 | MultiColorChanger3 |
| 578604 | 330 | The Wuthering ReShade [2.5.5][UI FIX for 3.1] | The Wuthering ReShade [2.5.5][UI FIX for 3.1] |
| 575217 | 327 | WUWA Image Quality Improvement 鸣潮画质提升指南(UE | WUWA Image Quality Improvement 鸣潮画质提升指南(UE-Engine) |
| 591245 | 324 | simple thicc zani（ WIP ） | simple thicc zani（ WIP ） |
| 663206 | 321 | Cute and Casual | Cute and Casual |
| 570711 | 321 | Injured Effect Remover v2.1.1 | Injured Effect Remover v2.1.1 |
| 624169 | 305 | Cantarella Ui | Cantarella Ui |
| 584895 | 303 | [2026]⭐Custom Splash Art Official⭐ | [2026]⭐Custom Splash Art Official⭐ |
| 516470 | 300 | UIDOFF | UIDOFF |
| 604939 | 299 | Casual Date Lupa | Casual Date Lupa |
| 614925 | 298 | NSFW Jinhsi Ui | NSFW Jinhsi Ui |
| 571647 | 297 | NSFW Custom Texture Selector Backpack/Item Details | NSFW Custom Texture Selector Backpack/Item Details |
| 645212 | 294 | I.R.I.S Half | I.R.I.S Half-Nude |
| 531248 | 294 | NSFW Female Portraits | NSFW Female Portraits |
| 646495 | 292 | Animated Custom Cursor | Animated Custom Cursor |
| 545746 | 282 | Butterfly Replaces Glider | Butterfly Replaces Glider |
| 553233 | 281 | Winter Mode Youhu | Winter Mode Youhu |
| 625866 | 269 | 3.2LOD恶魔大姐姐来了3.2LODGalbrena is coming. | 3.2LOD恶魔大姐姐来了3.2LODGalbrena is coming. |
| 709655 | 268 | Ocean Song Qingxiao | Ocean Song Qingxiao |
| 652614 | 268 | Thicc Lahai | Thicc Lahai-Roi Students |
| 589699 | 266 | Puzzle & Challenge Lines | Puzzle & Challenge Lines |
| 596020 | 264 | Animated NSFW Yinlin Ui | Animated NSFW Yinlin Ui |
| 642123 | 263 | Quiet HUD (UI toggles) | Quiet HUD (UI toggles) |
| 575297 | 260 | Splash Art (diverse art type) | Splash Art (diverse art type) |
| 584205 | 255 | 坎特蕾拉来啦~~[ZH] | 坎特蕾拉来啦~~[ZH] |
| 536091 | 255 | Huanglong Breast Clinic | Huanglong Breast Clinic |
| 570851 | 254 | Female NSFW/SFW Team Portraits | Female NSFW/SFW Team Portraits |
| 542014 | 244 | Red Origami Umbrella Replaces Glider | Red Origami Umbrella Replaces Glider |
| 634001 | 239 | NSFW Cartethyia Ui | NSFW Cartethyia Ui |
| 569218 | 238 | Epic Portraits | Epic Portraits |
| 536201 | 232 | Remove Gourd(Patch 1.2) | Remove Gourd(Patch 1.2) |
| 545272 | 228 | All Characters Effect Color Modify | All Characters Effect Color Modify |
| 611237 | 227 | Hongzhen NPC Nude | Hongzhen NPC Nude | 虹镇 NPC 全裸 |
| 572298 | 224 | NSFW Battlepass Ui | NSFW Battlepass Ui |
| 572453 | 222 | NSFW Guidebook | NSFW Guidebook |
| 567799 | 221 | Big Glider Wings | Big Glider Wings |
| 571926 | 211 | NSFW Skill Icons & Forte Ui (Toggleable) | NSFW Skill Icons & Forte Ui (Toggleable) |
| 572000 | 209 | Angel Wing | Angel Wing |
| 661984 | 201 | Big Tiddy Cuties Portraits | Big Tiddy Cuties Portraits |
| 590465 | 201 | Ultimate ReShade Preset | Ultimate ReShade Preset |
| 524811 | 194 | The Moon | The Moon - Loli God Requiem |
| 642022 | 187 | NANA | NANA-巨乳 |
| 619220 | 187 | Limited gacha page | Limited gacha page |
| 570523 | 181 | Original Game Painting | Original Game Painting |
| 640603 | 179 | NSFW Lupa Ui | NSFW Lupa Ui |
| 536877 | 179 | [WWMI] 4K Playable Character Textures Pack | [WWMI] 4K Playable Character Textures Pack |
| 593301 | 176 | Custom Swimsuit Splash | Custom Swimsuit Splash |
| 577757 | 168 | Radiant Glider and Wings | Radiant Glider and Wings |
| 698416 | 167 | Chisa | Chisa - Kill la Kill |
| 543706 | 166 | weapon for rover cos seraphia（女漂cos塞尔希娅武器) | weapon for rover cos seraphia（女漂cos塞尔希娅武器) |
| 666189 | 165 | 3.2LODFIX小爱机甲~AemeathMecha | 3.2LODFIX小爱机甲~AemeathMecha |
| 604540 | 164 | 小奶狼 | 小奶狼-露帕来啦~~[ZH] |
| 609460 | 158 | Ark | Ark-Phrolova String Bikini |
| 530221 | 157 | Changli Modify + Thicc | Changli Modify + Thicc |
| 518152 | 155 | ChunNPCNudeSkin | ChunNPCNudeSkin |
| 578013 | 151 | Rover Idol | Rover Idol |
| 621271 | 150 | Changli Summer Skin | Changli Summer Skin |
| 643562 | 144 | Hidden motorcycle | Hidden motorcycle |
| 576117 | 144 | nvzhu2.1npc | nvzhu2.1npc |
| 543116 | 142 | 派猛 | 派猛-猿神！ |
| 676511 | 140 | Full Pack Autoswap and Animation Portraits mod | Full Pack Autoswap and Animation Portraits mod-3.4 |
| 658343 | 140 | Chibi Portraits! + Portrait Builder | Chibi Portraits! + Portrait Builder |
| 590631 | 139 | Cervix shedding character selection mod | Cervix shedding character selection mod |
| 575104 | 138 | Wuwa X Freiren Project | Wuwa X Freiren Project |
| 559997 | 135 | Umbrella Glider | Umbrella Glider |
| 552863 | 133 | Cutesy Sanhua | Cutesy Sanhua |
| 610490 | 128 | Hecate half | Hecate half-nude |
| 648562 | 126 | Alpha's Motorbike | Alpha's Motorbike | [Project Gray Raven] |
| 575859 | 123 | Outfit Display Nude Splash Art | Outfit Display Nude Splash Art |
| 533871 | 119 | Iron Feathers over AOH+LR | Iron Feathers over AOH+LR |
| 643857 | 118 | 3.1黄金可变形摩托来了~~Gold Motorbike Transformation | 3.1黄金可变形摩托来了~~Gold Motorbike Transformation |
| 646201 | 117 | I.R.I.S | I.R.I.S |
| 553264 | 117 | Ying's Dress Youhu | Ying's Dress Youhu |
| 538561 | 117 | toothless JUE | toothless JUE |
| 528807 | 114 | No Calabash(No Gourd) (WWMI) | No Calabash(No Gourd) (WWMI) |
| 539561 | 112 | Rayquaza over Jue | Rayquaza over Jue |
| 596596 | 111 | Better HUD | Better HUD |
| 585441 | 109 | TeamUI2Viewer | TeamUI2Viewer |
| 550312 | 109 | StarFlower Replace Glider | StarFlower Replace Glider |
| 664279 | 108 | Automatic Mod Changer For WW | Automatic Mod Changer For WW |
| 525395 | 107 | Weapon Replacement | Weapon Replacement |
| 516022 | 107 | Cursor Pack | Cursor Pack |
| 517687 | 106 | Onigiri is Back [Scar] | Onigiri is Back [Scar] |
| 520183 | 104 | Vergil's Plastic Chair | Vergil's Plastic Chair |
| 519914 | 103 | SD Character Icon | SD Character Icon - WuWa Edition |
| 641899 | 102 | Thicc I.R.I.S | Thicc I.R.I.S |
| 588968 | 102 | Multi | Multi-action formation selection mod |
| 582334 | 101 | Brant Jiggle Physics + Body Edit | Brant Jiggle Physics + Body Edit |
| 630356 | 100 | Qiuyuan | Qiuyuan-Chisa|仇远-千咲 |
| 531510 | 100 | JianxinModify + Thicc | JianxinModify + Thicc |
| 579590 | 98 | Radiant Corsair Brant | Radiant Corsair Brant |
| 573140 | 98 | Custom Loading Screen (SFW) | Custom Loading Screen (SFW) |
| 524986 | 98 | Invisible gourd WWMI | Invisible gourd WWMI |
| 567900 | 96 | Remove character contour lines(删除角色轮廓线) | Remove character contour lines(删除角色轮廓线) |
| 567853 | 96 | 飞行翅膀替换为无妄者的翅膀 | 飞行翅膀替换为无妄者的翅膀 |
| 572699 | 95 | 散华的动态配队mod | 散华的动态配队mod |
| 647747 | 94 | TrueView Reshade For WuWa | TrueView Reshade For WuWa |
| 643887 | 94 | Motorcycle as Tank | Motorcycle as Tank |
| 609333 | 94 | TAB radial menu blur removal | TAB radial menu blur removal-轮盘菜单去模糊 |
| 536454 | 94 | Kusabimaru over EOG | Kusabimaru over EOG |
| 531756 | 93 | Crownless | Crownless - BigSmoke Skin |
| 577114 | 92 | phoebe Swimsuit executor | phoebe Swimsuit executor |
| 553518 | 92 | Emerald of Genesis Redesign | Emerald of Genesis Redesign | Excalibur |
| 546552 | 92 | 新声骸boss改度星者 | 新声骸boss改度星者 |
| 611070 | 90 | Phrolova | Phrolova - No Hologram Effect |
| 592855 | 89 | igris | igris |
| 584399 | 89 | Hider | Hider |
| 625055 | 88 | B | B-17 flying fortress (in WUWA!) |
| 575678 | 87 | SFW Fanart Aesthetic Splash | SFW Fanart Aesthetic Splash |
| 548115 | 87 | How To Install ReShade Add | How To Install ReShade Add-On With XXMI For WuWa |
| 536292 | 87 | UI Mod Maker for WWMI | UI Mod Maker for WWMI |
| 549842 | 86 | Man!! Replace Glider | Man!! Replace Glider |
| 567302 | 85 | Hecate over various swords | Hecate over various swords |
| 555228 | 85 | YOUHU Bunny Ears | YOUHU Bunny Ears |
| 529832 | 85 | YinlinModify + Thicc | YinlinModify + Thicc |
| 558192 | 84 | Woju | Woju - 3in1 Glowing Scythes Replacing Red Spring |
| 651211 | 83 | Aemeath big breast | Aemeath big breast |
| 603478 | 83 | No Outline | No Outline |
| 704547 | 82 | Phrolova_Original_Toggles(Sliders) | Phrolova_Original_Toggles(Sliders) |
| 579924 | 81 | The Captain's Thighs | The Captain's Thighs |
| 560252 | 81 | Radiant Emerald of Genesis | Radiant Emerald of Genesis |
| 549419 | 80 | Paraglider | Paraglider |
| 544823 | 80 | weapon for huanren over yangyang | weapon for huanren over yangyang |
| 621402 | 79 | Ishtar Weapon for Iuno | Ishtar Weapon for Iuno |
| 580781 | 79 | Rickroll the whole Rinascita | Rickroll the whole Rinascita |
| 642250 | 78 | Calcharo Bike | Calcharo Bike |
| 615000 | 76 | changli | changli - bottomHeavyByHazeker |
| 556878 | 76 | Custom portraits | Custom portraits |
| 553682 | 76 | JinhsiNoPants | JinhsiNoPants |
| 591371 | 75 | WuWaLite (Ultra FPS Boost) | WuWaLite (Ultra FPS Boost) |
| 550700 | 75 | 釉瑚赤脚[ZH] | 釉瑚赤脚[ZH] |
| 555210 | 74 | Woju | Woju - 2 Swords Replaces EOG |
| 591280 | 73 | Zani Tweaks (No cloak, No tail, etc.) | Zani Tweaks (No cloak, No tail, etc.) |
| 552075 | 73 | Emerald of Genesis Recolour | Emerald of Genesis Recolour | 8 Color Variants |
| 533754 | 73 | Inferno Rider | Inferno Rider - Thomas the Train skin |
| 647400 | 71 | Lynae | Lynae-Klukai-HK416 Gun Mod|琳奈-可露凯-HK416武器模组 |
| 625276 | 70 | (outdated)Animate and static pantyhose splash art | (outdated)Animate and static pantyhose splash art |
| 600586 | 70 | Hide Echo Gourd v2.4 | Hide Echo Gourd v2.4 |
| 548905 | 70 | 【WWMI】Luhs UI Tool v1.3 Hide UI UID and FOG | 【WWMI】Luhs UI Tool v1.3 Hide UI UID and FOG |
| 536596 | 70 | Game over defeated scene background | Game over defeated scene background |
| 526813 | 70 | LewdingImages | LewdingImages |
| 585815 | 69 | Brant Exposed Back + Jiggle Physics | Brant Exposed Back + Jiggle Physics |
| 541526 | 69 | Lilith replace Yinlin | Lilith replace Yinlin |
| 673442 | 68 | HideUI 3.3 | HideUI 3.3 |
| 550736 | 68 | Lustrous Blade | Lustrous Blade|Curved Lustrous Razor |
| 549152 | 67 | Woju | Woju - Scarlet Night Rider |
| 576048 | 66 | FeibiWhite dress | FeibiWhite dress |
| 591313 | 65 | Custom Splash Art(NSFW) | Custom Splash Art(NSFW) |
| 551750 | 65 | Woju | Woju - Balloon Glider |
| 652185 | 63 | Animated Nitrous Bike | Animated Nitrous Bike |
| 516494 | 63 | UI Toggle | UI Toggle |
| 653958 | 62 | MY PORSCHE ARRIVES | MY PORSCHE ARRIVES |
| 593068 | 62 | Bloodpact's Pledge for M/F Radiant Rover Mods | Bloodpact's Pledge for M/F Radiant Rover Mods |
| 638134 | 61 | Augusta, lord of sunlight | Augusta, lord of sunlight |
| 583417 | 61 | Loading Screen Mod | Loading Screen Mod |
| 516132 | 60 | WatermarkOff | WatermarkOff |
| 605702 | 59 | Wildfire replace Waning/Lustrous Razor/露帕专武外观替换 | Wildfire replace Waning/Lustrous Razor/露帕专武外观替换 |
| 553181 | 59 | Woju | Woju - Christmas Tree, Gift Box & Snow Puppet |
| 545790 | 59 | Hide_UI 1.3 | Hide_UI 1.3 |
| 540627 | 59 | Exile NPC Technician Thicc | Exile NPC Technician Thicc |
| 535442 | 59 | [WWMI]Remove Zhezhi's glasses | [WWMI]Remove Zhezhi's glasses |
| 626022 | 58 | CalbrenaChaopin | CalbrenaChaopin |
| 608358 | 58 | 弗洛洛 | 弗洛洛-若叶睦 |
| 621977 | 57 | Havoc Spear & Flight Wings | Havoc Spear & Flight Wings |
| 593237 | 57 | Background + Portraits | Background + Portraits |
| 550771 | 57 | Youhu no Backpack no Hat | Youhu no Backpack no Hat |
| 550083 | 57 | 【WWMI】Hide the fog | 【WWMI】Hide the fog |
| 526886 | 57 | Recolor Chest | Recolor Chest |
| 604166 | 56 | Projection weapon yamato | Projection weapon yamato |
| 567691 | 56 | NPC_Cartethyia x Senhime | NPC_Cartethyia x Senhime |
| 521593 | 55 | No More Outline (3DMigoto & WWMI Compatible) | No More Outline (3DMigoto & WWMI Compatible) |
| 560840 | 54 | Floating Dreams over Rectifier | Floating Dreams over Rectifier |
| 543404 | 54 | 奇幻变奏变为漪澜浮录（常驻） | 奇幻变奏变为漪澜浮录（常驻） |
| 641476 | 53 | Teleport to Tuanzi | Teleport to Tuanzi |
| 541490 | 53 | Changli effect color modification | Changli effect color modification |
| 577323 | 52 | Ascendant Aces_Splash | Ascendant Aces_Splash |
| 556071 | 52 | Emerald of Genesis Redesign | Emerald of Genesis Redesign | Muramasa |
| 642287 | 51 | motorbike as a tank | motorbike as a tank |
| 529868 | 51 | Blazing Brilliance Over EOG | Blazing Brilliance Over EOG |
| 516882 | 51 | Tab Menu Blur Removal | Tab Menu Blur Removal |
| 616789 | 50 | 武器 | 武器-巧乐兹 |
| 586754 | 50 | fuludelisi simple | fuludelisi simple |
| 619375 | 49 | Roververse | Roververse |
| 546186 | 49 | Wuthering Shades | Wuthering Shades |
| 545386 | 49 | Shorekeeper Lewding | Shorekeeper Lewding |
| 655734 | 48 | Starfield Calibrated | Starfield Calibrated - 5 Dimensions-Animated V1.3 |
| 619423 | 48 | Femboy Iuno | Femboy Iuno |
| 557931 | 48 | Woju | Woju - 3in1 Emerald Of Genesis Mod |
| 550492 | 48 | Woju | Woju - Hover Pumpkin (Halloween Series) |
| 682025 | 47 | Dragon Wings | Dragon Wings |
| 560587 | 47 | Woju | Woju - 3in1 Weapon Replacing Abyss Surge |
| 611567 | 45 | Ominous Emerald of Genesis | Ominous Emerald of Genesis |
| 575485 | 45 | Wajit nvzhu | Wajit nvzhu |
| 554690 | 45 | Yamato Replace Emerald of Genesis | Yamato Replace Emerald of Genesis |
| 537270 | 45 | Winter's Glaive Verdant Summit | Winter's Glaive Verdant Summit |
| 519322 | 45 | WuWa Outline Removal | WuWa Outline Removal |
| 516956 | 45 | Quality of Life | Quality of Life |
| 622450 | 44 | Equipable Iuno's Bracelet | Equipable Iuno's Bracelet | Male and Female Rover |
| 576919 | 44 | SIMPLE EDIT CARLOTTA SECRET DATE | SIMPLE EDIT CARLOTTA SECRET DATE |
| 560781 | 44 | Woju | Woju - Glowing Destroyer Replacing Red Spring |
| 540613 | 44 | Koko NPC shorter skirt | Koko NPC shorter skirt |
| 681699 | 43 | Terminal/Team Menu Background mod + Builder | Terminal/Team Menu Background mod + Builder |
| 610521 | 43 | Bad end | Bad end |
| 555686 | 43 | Taller Lumi | Taller Lumi |
| 540561 | 43 | Holy Thorns Crownless | Holy Thorns Crownless |
| 633812 | 42 | Radiant Qiuyuan's Emerald Sentence | Radiant Qiuyuan's Emerald Sentence |
| 630859 | 42 | bizarre phrolova | bizarre phrolova |
| 626553 | 42 | 武器投影模型替换/Weapon projection mod replace | 武器投影模型替换/Weapon projection mod replace |
| 613659 | 42 | Easy Makeup Toggle | Easy Makeup Toggle |
| 594119 | 42 | Edo tensei uchiha madara over crownless | Edo tensei uchiha madara over crownless |
| 584218 | 42 | Hide wings | Hide wings |
| 630351 | 41 | QIUYUAN | QIUYUAN-JK |
| 608658 | 41 | simple ciaccona mod/简单的夏空mod | simple ciaccona mod/简单的夏空mod |
| 579932 | 41 | Wuthering Waves Mod Manager | Wuthering Waves Mod Manager |
| 540616 | 41 | Maqi NPC | Maqi NPC |
| 540602 | 41 | Exile NPC | Exile NPC |
| 535450 | 40 | [WWMI]Zhezhi's clean shoulders and chest | [WWMI]Zhezhi's clean shoulders and chest |
| 568531 | 39 | Copium Carlotta Weapon | Copium Carlotta Weapon |
| 560214 | 39 | Woju | Woju - Fantasy Glider |
| 550314 | 39 | Woju | Woju - Bumblebee Rider |
| 535447 | 39 | zhezhi Remove chest covering and glasse【WWMI】 | zhezhi  Remove chest covering and glasse【WWMI】 |
| 517197 | 39 | Aether portal Minecraft mod 1.12 | Aether portal Minecraft mod 1.12 |
| 638128 | 38 | Nimbus wraith | Nimbus wraith - echo mod |
| 601482 | 38 | Overclocked Reshade | Overclocked Reshade |
| 579633 | 38 | P5 Akechi over Brant | P5 Akechi over Brant |
| 554530 | 38 | Wolf Fang Replace Static Mist | Wolf Fang Replace Static Mist |
| 643468 | 37 | butt plug on motorcycle | butt plug on motorcycle |
| 638252 | 37 | 漂泊者替换无冠者 | 漂泊者替换无冠者 |
| 591484 | 37 | Zani | Zani-Ch'en the Holungday |
| 588114 | 37 | Geshu Lin Swords | Geshu Lin Swords |
| 578858 | 37 | Rean Tachi over Emerald of Genesis | Rean Tachi over Emerald of Genesis |
| 718300 | 36 | WuwaTFR | WuwaTFR - Remove Transparency Filter |
| 667318 | 36 | Aemeath Glider | Aemeath Glider |
| 633208 | 36 | Skin Color Changer | Skin Color Changer |
| 566609 | 36 | Static Mist Recolored for Carlotta | Static Mist Recolored for Carlotta |
| 558882 | 36 | Woju | Woju - Glider Mod Dreamless & Crownless |
| 551160 | 36 | Woju | Woju - Cake Stand & Angelic Cosmic Ripples |
| 657496 | 35 | Hidden auxiliary weapons | Hidden auxiliary weapons |
| 649215 | 35 | Tron Light Cycle | Tron Light Cycle |
| 556109 | 35 | Red Spring replaces Emerald of Genesis | Red Spring replaces Emerald of Genesis |
| 657110 | 34 | F15 glider | F15 glider |
| 617092 | 34 | 奥古斯塔武器模组/Augusta weapon mod | 奥古斯塔武器模组/Augusta weapon mod |
| 557941 | 34 | 刺坆菇罪袋 mushroom mod | 刺坆菇罪袋 mushroom mod |
| 708026 | 33 | （Fail mod）Liangyu fullnude toggle | （Fail mod）Liangyu fullnude toggle |
| 707651 | 33 | outline remove | outline remove |
| 551373 | 33 | Light Sceptre Replace BigSword | Light Sceptre Replace BigSword |
| 536743 | 33 | White Standard Pistol and Sword | White Standard Pistol and Sword |
| 517200 | 33 | Nether Port | Nether Port |
| 541475 | 32 | monster Ultraman Belial 云闪之鳞 贝利亚 | monster Ultraman Belial 云闪之鳞 贝利亚 |
| 521714 | 32 | No More Bloom | No More Bloom |
| 638147 | 31 | Radiant Tyrokatana | Radiant Tyrokatana |
| 609063 | 31 | Discord to Tamonowo | Discord to Tamonowo |
| 594322 | 31 | xiangliyao | xiangliyao-gray shade |
| 558699 | 31 | Woju | Woju - Christmas Weapon Mod Over Red Spring |
| 516125 | 31 | Genshin Door | Genshin Door |
| 679258 | 30 | Motor as Tank T | Motor as Tank T-34 Animated |
| 642666 | 30 | Smoll Motorbike Mod | Smoll Motorbike Mod |
| 607173 | 30 | simple pohobe mod/简单的菲比mod | simple pohobe mod/简单的菲比mod |
| 594115 | 30 | Chiori over Danjin | Chiori over Danjin |
| 573174 | 30 | Immersive Dialogue & Remove Text on Dialogue | Immersive Dialogue & Remove Text on Dialogue |
| 556117 | 30 | 简易mod1.4 | 简易mod1.4 |
| 609136 | 29 | Phrolova mod/芙洛洛mod | Phrolova mod/芙洛洛mod |
| 567973 | 29 | Call_of_the_Abyss Recolored | Call_of_the_Abyss Recolored |
| 560019 | 29 | Woju | Woju - Somnoire Anchor & EOG Mod |
| 557042 | 29 | 摩托车警察大王 Motorcycle CT | 摩托车警察大王 Motorcycle CT |
| 675273 | 28 | MEGA EPIC UI Backgrounds Pack! | MEGA EPIC UI Backgrounds Pack! |
| 651046 | 28 | Kusabimaru Glow | Kusabimaru Glow |
| 642213 | 28 | WWW18+tips | WWW18+tips |
| 604522 | 28 | 类泳装????比基尼????露帕 | 类泳装????比基尼????露帕 |
| 553898 | 28 | Woju | Woju - Age Of Harvest Mod - Mystic Fang |
| 539784 | 28 | Bailu's Gourd | Bailu's Gourd |
| 671587 | 27 | Radiant Radiance Cleaver | Radiant Radiance Cleaver |
| 581436 | 27 | Rean Tachi over Tyro Sword | Rean Tachi over Tyro Sword |
| 566677 | 27 | Simplified dialog box | Simplified dialog box |
| 555759 | 27 | Tall Mommies Mod | Tall Mommies Mod |
| 679853 | 26 | Puppet Nivora replaces Havoc Warrior | Puppet Nivora replaces Havoc Warrior |
| 561416 | 26 | Woju | Woju - Trinity Shooter | Static Mist |
| 554268 | 26 | Hellfire Replace Emerald of Genesis | Hellfire Replace Emerald of Genesis |
| 550905 | 26 | Woju | Woju - Glowing Emerald Of Genesis Double Blade |
| 535905 | 26 | ZheZhi basebody model | ZheZhi basebody model |
| 605777 | 25 | carlotta weapon replace static mist/珂莱塔专武替换停驻之烟 | carlotta weapon replace static mist/珂莱塔专武替换停驻之烟 |
| 594113 | 25 | Lynette over charlotte | Lynette over charlotte |
| 594112 | 25 | Billy over Alto | Billy over Alto |
| 559336 | 25 | Woju | Woju - 6 Luminous Shurikens Over Cosmic Ripples |
| 550139 | 25 | Woju | Woju - Bat Glider (Halloween Series) |
| 707534 | 24 | Qingxiao can fly | Qingxiao can fly |
| 630393 | 24 | QiuYuan | QiuYuan-LiBai&Nobunaga |
| 621412 | 24 | Asta sword only for augusta | Asta sword only for augusta |
| 679884 | 23 | SFXColorChanger | SFXColorChanger |
| 603439 | 23 | Reshade Preset | Reshade Preset |
| 601381 | 23 | Portrait MonsterGirls | Portrait MonsterGirls |
| 591411 | 23 | Dog Remover | Dog Remover |
| 524637 | 23 | Crownless&Vergil | Crownless&Vergil |
| 517137 | 23 | Glider Retexture | Glider Retexture |
| 693662 | 22 | LargerMap | LargerMap |
| 648676 | 22 | Hoverdroid Glider | Hoverdroid Glider |
| 628537 | 22 | Black wildfire mark | Black wildfire mark |
| 617782 | 22 | High Voltage Yinlin & Stringmaster (Recolor) | High Voltage Yinlin & Stringmaster (Recolor) |
| 614591 | 22 | Hecate x EVA | Hecate x EVA-01 |
| 609190 | 22 | Somnoire Anchor to Scissor Blade | Somnoire Anchor to Scissor Blade |
| 552700 | 22 | Woju | Woju - Fallacy Of Inevitable |
| 537249 | 22 | Purple Cosmic Ripples | Purple Cosmic Ripples |
| 534941 | 22 | Emu Otori to Jinhsi | Emu Otori to Jinhsi |
| 694359 | 21 | WSKr Loader (Special K for Wuthering Waves) | WSKr Loader (Special K for Wuthering Waves) |
| 694065 | 21 | Blanka XXMI | Blanka XXMI |
| 685213 | 21 | Hidden auxiliary weapons 2 | Hidden auxiliary weapons 2 |
| 678948 | 21 | Hi Friends | Hi Friends |
| 669922 | 21 | （TBU）Sword of creator (Replica) | （TBU）Sword of creator (Replica) |
| 625998 | 21 | Stati/Novaburst replace Galbrena weapon and other | Stati/Novaburst replace Galbrena weapon and other |
| 591284 | 21 | ⭐Zani No Jacket⭐[MODP923] | ⭐Zani No Jacket⭐[MODP923] |
| 566839 | 21 | weapon mod 常驻五星枪 火麒麟 | weapon mod 常驻五星枪 火麒麟 |
| 521730 | 21 | This is not a Mod | This is not a Mod |
| 620193 | 20 | Tyro over multiple swords | Tyro over multiple swords |
| 616025 | 20 | Fleurdelys fire sword | Fleurdelys fire sword |
| 614682 | 20 | No Lock | No Lock-on Reticle |
| 607461 | 20 | Commando of Conviction to Reverent Elusarca | Commando of Conviction to Reverent Elusarca |
| 590656 | 20 | seolin | seolin |
| 550138 | 20 | Woju | Woju - Hover Droid Iron Man |
| 682010 | 19 | Team pairing image Mod | Team pairing image Mod--3.4 |
| 652181 | 19 | Bike as Operational Howitzer [SU76] | Bike as Operational Howitzer [SU76] |
| 638894 | 19 | Radiant Tyrodachi | Radiant Tyrodachi |
| 525331 | 19 | NPC 1 Mini Skirt | NPC 1 Mini Skirt |
| 620115 | 18 | Felyne over The False Sovereign | Felyne over The False Sovereign |
| 609061 | 18 | Guardian Sword to Holy Guild Knight | Guardian Sword to Holy Guild Knight |
| 603593 | 18 | Carlotta Skin Animated Splash | Carlotta Skin Animated Splash |
| 593381 | 18 | 散华 | 散华-技能特效隐藏 |
| 560968 | 18 | 燎照之骑 雷欧赛文 motorcycle mod | 燎照之骑 雷欧赛文 motorcycle mod |
| 558203 | 18 | 云闪卡卡罗 monster mod Calcharo | 云闪卡卡罗 monster mod Calcharo |
| 522417 | 18 | Another Glider Recolor | Another Glider Recolor |
| 628292 | 17 | UI滑动模块切换组件 | UI滑动模块切换组件 |
| 622298 | 17 | Aumento de FPS | Aumento de FPS |
| 621092 | 17 | Carnival mask | Carnival mask - Sunglasses |
| 603697 | 17 | Changli Skin Animated Splash | Changli Skin Animated Splash |
| 554284 | 17 | Waldmeister Replace Age Of Harvest | Waldmeister Replace Age Of Harvest |
| 577864 | 16 | Jinhsi Skin Portrait Alternative | Jinhsi Skin Portrait Alternative |
| 570691 | 16 | Tyro Sword projection for Rover main | Tyro Sword projection for Rover main |
| 556880 | 16 | Woju | Woju - Glowing Great Swords Replacing Red Spring |
| 558840 | 15 | 猩猩奶龙 monkey boss Milk Dragon | 猩猩奶龙 monkey boss Milk Dragon |
| 594114 | 14 | Colley over frover | Colley over frover |
| 561587 | 14 | 华彩乐段 》 万事明晰梦武器涂装 | 华彩乐段 》 万事明晰梦武器涂装 |
| 527082 | 13 | Crownless Spear (Ages of Harvest) | Crownless Spear (Ages of Harvest) - Updated |
| 631151 | 12 | made in heaven phrolova | made in heaven phrolova |
| 605386 | 12 | ADJUST Flash Of Skill | ADJUST Flash Of Skill |
| 597027 | 12 | 维里奈 | 维里奈-隐藏攻击的藤曼/Verina-skill-hide |
| 579494 | 12 | Invisible Ocean's Gift | Invisible Ocean's Gift |
| 560202 | 12 | 乌龟 奶龙贝利亚 Turtle boss mod | 乌龟 奶龙贝利亚 Turtle boss mod |
| 527243 | 12 | Broom (Verdant Summit) | Broom (Verdant Summit) |
| 679441 | 11 | Buouxiong | Buouxiong |
| 667820 | 11 | Mrover ID card | Mrover ID card |
| 642774 | 11 | Npc Twins | Npc Twins |
| 610031 | 11 | Red Cosmic Ripples | Red Cosmic Ripples |
| 597919 | 11 | A real man | A real man |
| 530293 | 11 | Blazing Brilliance over Commando of Conviction | Blazing Brilliance over Commando of Conviction |
| 703761 | 10 | SPOLSZCZENIE DO WUTHERING WAVES | SPOLSZCZENIE DO WUTHERING WAVES |
| 629230 | 10 | Maliketh's Black Blade as wildfire mark | Maliketh's Black Blade as wildfire mark |
| 620301 | 10 | Last Dance Winchester Colt | Last Dance Winchester Colt |
| 603722 | 10 | Jinhsi Skin Animated Splash | Jinhsi Skin Animated Splash |
| 635391 | 9 | Namipon Replaced by Chiori's Doll | Namipon Replaced by Chiori's Doll |
| 626381 | 9 | Alternative Cursor Colors | Alternative Cursor Colors |
| 621807 | 9 | The Appearance of the GunDevil Dragon | The Appearance of the GunDevil Dragon |
| 589707 | 9 | Onmyoji team cards | Onmyoji team cards |
| 703743 | 8 | Hide Terminal | Hide Terminal |
| 610754 | 8 | Loli God Requiem Moon Help | Loli God Requiem Moon Help |
| 600571 | 8 | Error after update I found the solution like this | Error after update I found the solution like this |
| 550076 | 8 | 硕雷加拉特隆 | 硕雷加拉特隆 |
| 676726 | 7 | Chisa & Lynae | Chisa & Lynae - Fire Twins |
| 672455 | 7 | UID Hider hash fix ? | UID Hider hash fix ? |
| 560754 | 7 | 角 奶龙 dragon mod | 角 奶龙 dragon mod |
| 554492 | 7 | Incredibly Infinite Intimidat Replace Abyss Surges | Incredibly Infinite Intimidat Replace Abyss Surges |
| 516870 | 7 | miHoYoDoor | miHoYoDoor |
| 643340 | 6 | Rean Tachi over Bloodpact's Pledge and Haultir | Rean Tachi over Bloodpact's Pledge and Haultir |
| 600900 | 6 | Fleurdelys Bought Shoes | Fleurdelys Bought Shoes |
| 691784 | 4 | UI SFW Animation Portrait mod by Binhphuoi | UI SFW Animation Portrait mod by Binhphuoi |
| 651738 | 4 | HAVOC SCYTHE | HAVOC SCYTHE |
| 593091 | 4 | 渊武 | 渊武-隐藏技能特效-雷之楔/yuanwu-skill-hide |
| 536442 | 4 | higher and no cape | higher and no cape |
| 605765 | 1 | limit testing reshade preset | limit testing reshade preset |

## 6. 站内现有标准角色（合法取值域，共 64 个）

来源：`src/lib/constants/character-images.ts` 的 `characterImageMap`。
**任何映射的目标值都必须在这一节里**，否则前台角色分类页会长出计划外的新分类（CLAUDE.md 硬规则）。

`Skins` · `Other/Misc` · `UI` · `秋水` · `奥古斯塔` · `白芷` · `布兰特` · `卜灵` · `卡卡罗` · `椿` · `坎特蕾拉` · `珂莱塔` · `卡提希娅` · `芙露德莉斯` · `长离` · `千咲` · `炽霞` · `达妮娅` · `夏空` · `丹瑾` · `安可` · `绯雪` · `嘉贝莉娜` · `爱弥斯` · `爱弥斯的机甲` · `尤诺` · `鉴心` · `今汐` · `忌炎` · `凌阳` · `洛瑟菈` · `露西` · `灯灯` · `露帕` · `路赫斯` · `琳奈` · `莫宁` · `莫特斐` · `菲比` · `弗洛洛` · `仇远` · `丽贝卡` · `洛可可` · `男漂` · `女漂` · `散华` · `守岸人` · `西格莉卡` · `桃祈` · `维里奈` · `相里要` · `玄翎` · `秧秧` · `吟霖` · `釉瑚` · `滑翔翼,翱翔翼,科考摩托` · `渊武` · `赞妮` · `折枝` · `景燃` · `清宵` · `穗穗` · `锁暝` · `心月狐`

## 7. 附：无子分类但无文件的记录（仅留档，不参与映射）

共 0 条，入库时会因 `_bHasFiles=false` 被跳过。
