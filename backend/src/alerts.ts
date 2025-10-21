export type AlertEvent =
  | { type: 'http_5xx_spike'; count: number; windowMs: number }
  | { type: 'rate_limit_spike'; count: number; windowMs: number };

type AlertHandler = (event: AlertEvent) => void;

let handler: AlertHandler = (event) => {
  const message = `[ALERT] ${event.type} count=${event.count} windowMs=${event.windowMs}`;
  if (process.env.NODE_ENV === 'test') {
    // eslint-disable-next-line no-console
    console.warn(message);
  } else {
    // eslint-disable-next-line no-console
    console.error(message);
  }
};

export function registerAlertHandler(custom: AlertHandler) {
  handler = custom;
}

export function triggerAlert(event: AlertEvent) {
  handler(event);
}
