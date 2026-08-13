export type SimSample = {
  sampledAt: Date;
  latitude: number;
  longitude: number;
  altitude: number;
  groundSpeed: number;
  track: number;
  verticalRate: number;
  isOnGround: boolean;
  transponderCodeBcd: number;
  aircraftIdentifier: string;
};
