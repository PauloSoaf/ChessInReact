export interface ChromiumSmokeResult {
  success: boolean;
  skipped?: boolean;
  result: string;
}

export function runChromiumWorkerSmokeTest(): Promise<ChromiumSmokeResult>;
