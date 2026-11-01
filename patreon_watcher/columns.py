"""Patreon 来源的 CSV 列定义。

与其它来源最大的差别：**没有下载链接列**。
Patreon 是付费门禁平台，campaign 标了 `is_nsfw` 时匿名只能读元数据，
正文/附件拿不到（实测 `current_user_can_view` 恒为 False）。故只存：
标题、发布时间、帖子链接、点赞评论数、预览图。
"""

PATREON_COLUMNS = [
    "日期",
    "来源",
    "名称",
    "作者",
    "类型",        # post_type：image_file=带图 Mod 帖，text_only=纯文本公告
    "页面链接",
    "点赞",        # like_count
    "评论",        # comment_count
    "预览图",
    "mod_id",
    "发布时间",
    "首次发现时间",
]
