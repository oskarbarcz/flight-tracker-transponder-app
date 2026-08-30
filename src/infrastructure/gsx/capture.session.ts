import { type CaptureSink, CaptureRecorder } from './capture';
import { GsxConnection, type SocketOpener } from './connection';
import {
  type ProbeOutcome,
  PROBE_TIMEOUT_MS,
  Prober,
  ResultWaiter,
  SUBSCRIBE_ID,
  answerOf,
  subscribeRequest,
} from './probe';
import { formatReport } from './report';

export type CaptureSessionOptions = {
  url: string;
  file: string;
  sink: CaptureSink;
  onClosed: (reason: string) => void;
  now?: () => Date;
  open?: SocketOpener;
  timeoutMs?: number;
};

export class CaptureSession {
  private readonly waiter = new ResultWaiter();
  private readonly recorder: CaptureRecorder;
  private readonly connection: GsxConnection;

  private outcomes: ProbeOutcome[] = [];
  private subscription: ProbeOutcome | null = null;

  constructor(private readonly options: CaptureSessionOptions) {
    this.recorder = new CaptureRecorder(options.sink, options.now);
    this.connection = new GsxConnection(options.url, options.open);
  }

  async start(): Promise<void> {
    await this.connection.connect({
      onFrame: (frame) => {
        this.recorder.record(frame);
        this.waiter.accept(frame);
      },
      onClosed: (reason) => this.options.onClosed(reason),
    });
  }

  async subscribe(): Promise<ProbeOutcome> {
    this.connection.send(subscribeRequest());

    const frame = await this.waiter.wait(
      SUBSCRIBE_ID,
      this.options.timeoutMs ?? PROBE_TIMEOUT_MS,
    );

    this.subscription = { type: 'subscribe', ...answerOf(frame) };

    return this.subscription;
  }

  async probe(): Promise<void> {
    const prober = new Prober(
      (payload) => this.connection.send(payload),
      this.waiter,
      this.options.timeoutMs,
    );

    this.outcomes = await prober.run();
  }

  report(): string[] {
    return formatReport({
      file: this.options.file,
      summary: this.recorder.summary(),
      outcomes:
        this.subscription === null
          ? this.outcomes
          : [this.subscription, ...this.outcomes],
    });
  }

  stop(): void {
    this.connection.disconnect();
  }
}
