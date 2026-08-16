## Q25 · 怎么修改 Mod 的切换键？

**解决方法**

1. 打开你要修改切换键的 Mod 文件夹。

2. 找到里面的 ini 文件并打开。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image41.webp)

3. 查找类似 `key = 5` 的代码，`key=` 后面的数字就是切换键。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image42.webp)

4. 将 `=` 后面的数字改为你想要的键位，比如改为 6 就改成 `key = 6`。

5. 改完后一定记得保存文件。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image43.webp)

> **键位参考**：小键盘数字键要加 num 前缀，如小键盘 1 改为 `key = num1`。
>
> 方向键改为 `up`、`down`、`left`、`right`。
>
> 组合键同时写两个键位，如 Alt+6 改为 `key = alt 6`。
>
> **注意**：部分 Mod 虽然有切换键配置但可能无效。

---

## Q26 · 怎么修改或保存可切换类 Mod 的初始形态？

**解决方法**

1. 搭配 JASM 管理器时：打开单个角色管理界面 → 点击「自动同步」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image44.webp)

然后到「模组预设」界面，勾选「切换预设时自动同步 Mod 首选项」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image45.webp)

2. 尝试将 Mod 文件名改短，然后游戏内切换到喜欢的形态，按 F10 保存。

---

## Q27 · 怎么在游戏内切换 Mod？

**解决方法**

1. **单独使用 XXMI 加载器**：后台打开 Mods 文件夹，更换 Mod 文件后按 F10 加载。

> 举例：换今汐 Mod → 把原 Mod 从 Mods 移出 → 放入新 Mod → 回游戏按 F10。

2. **使用 JASM 管理器**：后台打开 JASM 界面，勾选新 Mod（取消原 Mod 勾选），回游戏按 F10。

---

## Q28 · JASM 管理器怎么在角色分区勾选多个 Mod？

**解决方法**

1. 打开角色分区 → 点击左上角「显示」→ 取消勾选「单选模式」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image46.webp)

---

## Q29 · 怎么在游戏内快速取消启用所有 Mod？

**解决方法**

1. 游戏内按 F6 即可（部分 Mod 可能取消不了）。

---

## Q30 · 游戏内出现写满英文的黑色弹窗怎么关闭？

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image47.webp)

**解决方法**

1. 多按几次 F10 或按 X 键隐藏。

> 自己翻译一下最后一行，不难懂的。

---

## Q31 · JASM 管理器设置的路径错了怎么修改？

**解决方法**

1. JASM 主界面左下角点击「设置」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image48.webp)

2. 点击「浏览」重新选择路径，设置完后点击「更新路径」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image49.webp)

---

## Q32 · JASM 管理器怎么添加新角色的分区？

**解决方法**

1. 点击 JASM 左下角「设置」→「同步游戏数据」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image50.webp)

> 如果设置里没有这个按钮，说明 JASM 版本旧了，去整合包换新版。
>
> 如果一直同步不完成，可以挂个梯子：[梯子链接](https://wwww.qumianq.xyz/#/register?code=OHpLpXgg)

2. 也可以手动创建：点击 JASM 左上角角色管理器（铅笔图标）→ 点击「+」。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image51.webp)

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image52.webp)

3. 按界面标注填写信息。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image53.webp)

4. 点击右下角按钮创建分区。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image54.webp)

5. 如需删除此分区：进入该角色管理界面，右上角有删除按钮。

![](https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/troubleshooting/image55.webp)
