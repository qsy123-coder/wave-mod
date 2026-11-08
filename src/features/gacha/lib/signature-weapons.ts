/**
 * 角色 → 专武映射。
 *
 * 由 scripts/generate-signature-weapons.mjs 从资源包 catalog.json 生成，不要手改。
 * 数据来源与许可见同目录 NOTICE.md。
 */

export type SignatureWeapon = {
  /** 角色名，仅用于展示与日志 */
  roleName: string;
  /** 专属武器 resourceId */
  weaponId: number;
  /** 专属武器名 */
  weaponName: string;
};

export const SIGNATURE_WEAPONS: Record<number, SignatureWeapon> = {
  1105: {
    "roleName": "折枝",
    "weaponId": 21050026,
    "weaponName": "琼枝冰绡"
  },
  1107: {
    "roleName": "珂莱塔",
    "weaponId": 21030016,
    "weaponName": "死与舞"
  },
  1108: {
    "roleName": "绯雪",
    "weaponId": 21020086,
    "weaponName": "灼霜"
  },
  1109: {
    "roleName": "洛瑟菈",
    "weaponId": 21050086,
    "weaponName": "存帧"
  },
  1110: {
    "roleName": "穗穗",
    "weaponId": 21050096,
    "weaponName": "栖霞饮露"
  },
  1205: {
    "roleName": "长离",
    "weaponId": 21020016,
    "weaponName": "赫奕流明"
  },
  1206: {
    "roleName": "布兰特",
    "weaponId": 21020036,
    "weaponName": "不灭航路"
  },
  1207: {
    "roleName": "露帕",
    "weaponId": 21010036,
    "weaponName": "焰痕"
  },
  1208: {
    "roleName": "嘉贝莉娜",
    "weaponId": 21030036,
    "weaponName": "光影双生"
  },
  1209: {
    "roleName": "莫宁",
    "weaponId": 21010066,
    "weaponName": "宙算仪轨"
  },
  1210: {
    "roleName": "爱弥斯",
    "weaponId": 21020076,
    "weaponName": "永远的启明星"
  },
  1211: {
    "roleName": "达妮娅",
    "weaponId": 21050076,
    "weaponName": "赝作的矮星"
  },
  1212: {
    "roleName": "景燃",
    "weaponId": 21010076,
    "weaponName": "千般渡"
  },
  1302: {
    "roleName": "吟霖",
    "weaponId": 21050016,
    "weaponName": "掣傀之手"
  },
  1304: {
    "roleName": "今汐",
    "weaponId": 21010026,
    "weaponName": "时和岁稔"
  },
  1305: {
    "roleName": "相里要",
    "weaponId": 21040016,
    "weaponName": "诸方玄枢"
  },
  1306: {
    "roleName": "奥古斯塔",
    "weaponId": 21010046,
    "weaponName": "驭冕铸雷之权"
  },
  1308: {
    "roleName": "丽贝卡",
    "weaponId": 21030066,
    "weaponName": "碎骨"
  },
  1311: {
    "roleName": "心",
    "weaponId": 21050116,
    "weaponName": "玉阙玄华"
  },
  1312: {
    "roleName": "锁暝",
    "weaponId": 21020107,
    "weaponName": "沉冥"
  },
  1404: {
    "roleName": "忌炎",
    "weaponId": 21010016,
    "weaponName": "苍鳞千嶂"
  },
  1407: {
    "roleName": "夏空",
    "weaponId": 21030026,
    "weaponName": "林间的咏叹调"
  },
  1409: {
    "roleName": "卡提希娅",
    "weaponId": 21020056,
    "weaponName": "不屈命定之冠"
  },
  1410: {
    "roleName": "尤诺",
    "weaponId": 21040046,
    "weaponName": "万物持存的注释"
  },
  1411: {
    "roleName": "仇远",
    "weaponId": 21020066,
    "weaponName": "裁竹"
  },
  1412: {
    "roleName": "西格莉卡",
    "weaponId": 21040066,
    "weaponName": "昭日译注"
  },
  1413: {
    "roleName": "清宵",
    "weaponId": 21020106,
    "weaponName": "云琅"
  },
  1505: {
    "roleName": "守岸人",
    "weaponId": 21050036,
    "weaponName": "星序协响"
  },
  1506: {
    "roleName": "菲比",
    "weaponId": 21050046,
    "weaponName": "和光回唱"
  },
  1507: {
    "roleName": "赞妮",
    "weaponId": 21040036,
    "weaponName": "焰光裁定"
  },
  1508: {
    "roleName": "千咲",
    "weaponId": 21010056,
    "weaponName": "昙切"
  },
  1509: {
    "roleName": "琳奈",
    "weaponId": 21030046,
    "weaponName": "溢彩荧辉"
  },
  1510: {
    "roleName": "陆·赫斯",
    "weaponId": 21040056,
    "weaponName": "白昼之脊"
  },
  1511: {
    "roleName": "露西",
    "weaponId": 21030056,
    "weaponName": "蜃影"
  },
  1512: {
    "roleName": "莉莉",
    "weaponId": 21030076,
    "weaponName": "安魂"
  },
  1603: {
    "roleName": "椿",
    "weaponId": 21020026,
    "weaponName": "裁春"
  },
  1606: {
    "roleName": "洛可可",
    "weaponId": 21040026,
    "weaponName": "悲喜剧"
  },
  1607: {
    "roleName": "坎特蕾拉",
    "weaponId": 21050056,
    "weaponName": "海的呢喃"
  },
  1608: {
    "roleName": "弗洛洛",
    "weaponId": 21050066,
    "weaponName": "幽冥的忘忧章"
  },
  1610: {
    "roleName": "秧秧·玄翎",
    "weaponId": 21020096,
    "weaponName": "天之苍苍"
  },
};
