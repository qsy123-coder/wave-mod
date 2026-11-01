/**
 * 网盘点击统计的数据形状。
 *
 * 与香港计数服务 `GET /drive-stats` 的响应一一对应：
 * 原始行只包含**有数据**的日期，补零、算占比在 `aggregate.ts` 里做。
 */

export type DriveClickDay = {
  /** `YYYY-MM-DD`（上海日历日） */
  date: string;
  count: number;
};

/** 一个网盘平台的原始记录（只含有数据的日期） */
export type DrivePlatformRow = {
  platform: string;
  total: number;
  days: DriveClickDay[];
};

/** 补零、算完占比后的展示数据 */
export type DrivePlatformStats = DrivePlatformRow & {
  today: number;
  yesterday: number;
  /** 占全部平台累计点击的比例，0–1；全站为 0 时是 0 */
  share: number;
};

export type DriveStats = {
  /** 按累计点击降序 */
  platforms: DrivePlatformStats[];
  total: number;
  today: number;
  yesterday: number;
};
