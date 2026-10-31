export type RootStackParamList = {
  Dashboard: undefined;
  AddApps: undefined;
  ServiceDetail: { serviceId: number; name: string };
  Chat: { serviceId?: number };
  DirectCheck: { directCheckId?: string };
  ChangeFeed: undefined;
  About: undefined;
};
