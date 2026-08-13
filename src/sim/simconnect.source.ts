import {
  open,
  Protocol,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
  type SimConnectConnection,
  type RecvSimObjectData,
} from 'node-simconnect';
import type { SimSample } from '../domain/sim-sample';

const DEFINITION_ID = 1;
const REQUEST_ID = 1;
const CLIENT_NAME = 'Flight Tracker Transponder';

type VariableSpec = [name: string, unit: string, type: SimConnectDataType];

const VARIABLES: VariableSpec[] = [
  ['PLANE LATITUDE', 'degrees', SimConnectDataType.FLOAT64],
  ['PLANE LONGITUDE', 'degrees', SimConnectDataType.FLOAT64],
  ['INDICATED ALTITUDE', 'feet', SimConnectDataType.FLOAT64],
  ['GPS GROUND SPEED', 'knots', SimConnectDataType.FLOAT64],
  ['MAGNETIC COMPASS', 'degrees', SimConnectDataType.FLOAT64],
  ['VERTICAL SPEED', 'feet per minute', SimConnectDataType.FLOAT64],
  ['CONTACT POINT IS ON GROUND', 'bool', SimConnectDataType.INT32],
  ['TRANSPONDER CODE:1', 'number', SimConnectDataType.INT32],
];

const AIRCRAFT_IDENTIFIER_DEFINITION_ID = 2;
const AIRCRAFT_IDENTIFIER_REQUEST_ID = 2;

export type SimSourceHandlers = {
  onSample: (sample: SimSample) => void;
  onAircraftIdentifier: (identifier: string) => void;
  onClosed: () => void;
};

export type SimconnectRemote = {
  host: string;
  port: number;
};

export class SimconnectSource {
  private connection: SimConnectConnection | null = null;
  private aircraftIdentifier = '';

  constructor(
    private readonly remote: SimconnectRemote | null = null,
    private readonly protocol: Protocol = Protocol.KittyHawk,
  ) {}

  async connect(handlers: SimSourceHandlers): Promise<string> {
    const { recvOpen, handle } =
      this.remote === null
        ? await open(CLIENT_NAME, this.protocol)
        : await open(CLIENT_NAME, this.protocol, {
            host: this.remote.host,
            port: this.remote.port,
          });
    this.connection = handle;

    for (const [name, unit, type] of VARIABLES) {
      handle.addToDataDefinition(DEFINITION_ID, name, unit, type);
    }

    handle.addToDataDefinition(
      AIRCRAFT_IDENTIFIER_DEFINITION_ID,
      'ATC ID',
      null,
      SimConnectDataType.STRING32,
    );

    handle.requestDataOnSimObject(
      REQUEST_ID,
      DEFINITION_ID,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SECOND,
    );

    handle.requestDataOnSimObject(
      AIRCRAFT_IDENTIFIER_REQUEST_ID,
      AIRCRAFT_IDENTIFIER_DEFINITION_ID,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SECOND,
    );

    handle.on('simObjectData', (recv: RecvSimObjectData) => {
      if (recv.requestID === AIRCRAFT_IDENTIFIER_REQUEST_ID) {
        const identifier = recv.data.readString32().trim();

        if (identifier !== this.aircraftIdentifier) {
          this.aircraftIdentifier = identifier;
          handlers.onAircraftIdentifier(identifier);
        }

        return;
      }

      if (recv.requestID !== REQUEST_ID) {
        return;
      }

      handlers.onSample(readSample(recv));
    });

    handle.on('quit', () => {
      this.connection = null;
      handlers.onClosed();
    });

    handle.on('close', () => {
      this.connection = null;
      handlers.onClosed();
    });

    return `${recvOpen.applicationName} ${recvOpen.applicationVersionMajor}.${recvOpen.applicationVersionMinor}`;
  }

  disconnect(): void {
    this.connection?.close();
    this.connection = null;
  }
}

function readSample(recv: RecvSimObjectData): SimSample {
  return {
    sampledAt: new Date(),
    latitude: recv.data.readFloat64(),
    longitude: recv.data.readFloat64(),
    altitude: recv.data.readFloat64(),
    groundSpeed: recv.data.readFloat64(),
    track: recv.data.readFloat64(),
    verticalRate: recv.data.readFloat64(),
    isOnGround: recv.data.readInt32() === 1,
    transponderCodeBcd: recv.data.readInt32(),
    aircraftIdentifier: '',
  };
}
