"""Nexus Mods 来源的 CSV 列定义（与其它来源字段不同，故各来源独立）。

没有「夸克链接」这类网盘字段 —— Nexus 是站内直接下载，故只存页面链接。
"""

NEXUS_COLUMNS = [
    "日期",
    "来源",
    "名称",
    "作者",
    "分类",
    "版本",
    "页面链接",
    "点赞",        # endorsement_count
    "下载量",      # mod_downloads
    "成人内容",    # contains_adult_content
    "预览图",
    "mod_id",
    "发布时间",
    "首次发现时间",
]
