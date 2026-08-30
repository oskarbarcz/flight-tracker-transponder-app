import { type CaptureSink, CaptureRecorder } from './capture';
import { GsxConnection, type SocketOpener } from './connection';
import {
  type Envelope,
  type ProbeOutcome,
  Prober,
  ResultWaiter,
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

  private envelope: Envelope | null = null;
  private outcomes: ProbeOutcome[] = [];

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

  async probe(): Promise<void> {
    const prober = new Prober(
      (payload) => this.connection.send(payload),
      this.waiter,
      this.options.timeoutMs,
    );

    this.envelope = await prober.discoverEnvelope();
    this.outcomes =
      this.envelope === null ? [] : await prober.run(this.envelope);
  }

  report(): string[] {
    return formatReport({
      file: this.options.file,
      summary: this.recorder.summary(),
      envelope: this.envelope,
      outcomes: this.outcomes,
    });
  }

  stop(): void {
    this.connection.disconnect();
  }
}
