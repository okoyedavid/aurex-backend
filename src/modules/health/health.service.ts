type SystemState = "healthy" | "degraded" | "down";
type DatabaseState = "connected" | "connecting" | "disconnecting" | "disconnected" | "unknown";

export type SystemStatusPayload = {
  service: "Aurex API";
  status: SystemState;
  summary: string;
  environment: string;
  uptime: {
    seconds: number;
    label: string;
  };
  timestamp: string;
  database: {
    status: DatabaseState;
    connected: boolean;
  };
  api: {
    status: "running";
  };
  version: string | null;
};

type HealthServiceDependencies = {
  getDatabaseReadyState: () => number;
  getEnvironment: () => string;
  getUptimeSeconds: () => number;
  getVersion: () => string | null;
  getCurrentDate: () => Date;
};

const databaseStateByReadyState: Record<number, DatabaseState> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

const formatUptime = (uptimeSeconds: number) => {
  const totalSeconds = Math.floor(uptimeSeconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [
    days ? `${days}d` : null,
    hours ? `${hours}h` : null,
    minutes ? `${minutes}m` : null,
    `${seconds}s`,
  ].filter(Boolean);

  return parts.join(" ");
};

const toTitleCase = (value: string) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const escapeHtml = (value: string | number | null) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const getHttpStatusForSystemState = (status: SystemState) =>
  status === "healthy" ? 200 : 503;

const createHealthService = ({
  getDatabaseReadyState,
  getEnvironment,
  getUptimeSeconds,
  getVersion,
  getCurrentDate,
}: HealthServiceDependencies) => {
  const getSystemStatusPayload = (): SystemStatusPayload => {
    const databaseStatus =
      databaseStateByReadyState[getDatabaseReadyState()] ?? "unknown";
    const databaseConnected = databaseStatus === "connected";
    const status: SystemState = databaseConnected
      ? "healthy"
      : databaseStatus === "unknown"
        ? "down"
        : "degraded";
    const uptimeSeconds = getUptimeSeconds();

    return {
      service: "Aurex API",
      status,
      summary: "Real-time system visibility for the Aurex backend.",
      environment: getEnvironment(),
      uptime: {
        seconds: Math.floor(uptimeSeconds),
        label: formatUptime(uptimeSeconds),
      },
      timestamp: getCurrentDate().toISOString(),
      database: {
        status: databaseStatus,
        connected: databaseConnected,
      },
      api: {
        status: "running",
      },
      version: getVersion(),
    };
  };

  const renderStatusHtml = (payload: SystemStatusPayload) => {
    const statusLabel = toTitleCase(payload.status);
    const databaseLabel = toTitleCase(payload.database.status);
    const timestampLabel = new Date(payload.timestamp).toLocaleString("en", {
      dateStyle: "medium",
      timeStyle: "medium",
    });

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(payload.service)} Status</title>
  <style>
    :root {
      --bg: #030814;
      --panel: rgba(4, 15, 30, 0.74);
      --panel-border: rgba(94, 234, 212, 0.2);
      --text: #e7fbff;
      --muted: #8bb7c4;
      --cyan: #41f4ff;
      --blue: #1796d2;
      --deep: #061225;
      --green: #34d399;
      --amber: #fbbf24;
      --red: #fb7185;
      --state-color: ${payload.status === "healthy" ? "var(--green)" : payload.status === "degraded" ? "var(--amber)" : "var(--red)"};
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 48% 45%, rgba(65, 244, 255, 0.16), transparent 28rem),
        radial-gradient(circle at 54% 48%, rgba(23, 150, 210, 0.18), transparent 36rem),
        linear-gradient(145deg, #020511 0%, #061225 48%, #01030a 100%);
      display: grid;
      place-items: center;
      padding: 32px 16px;
      overflow-x: hidden;
    }

    .shell {
      width: min(1120px, 100%);
      position: relative;
    }

    .panel {
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      background:
        linear-gradient(180deg, rgba(4, 15, 30, 0.8), rgba(2, 8, 18, 0.74)),
        radial-gradient(circle at 28% 48%, rgba(65, 244, 255, 0.08), transparent 34rem);
      box-shadow:
        0 28px 100px rgba(0, 0, 0, 0.48),
        0 0 80px rgba(65, 244, 255, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(20px);
      padding: clamp(22px, 5vw, 56px);
      overflow: hidden;
      position: relative;
    }

    .panel::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(rgba(65, 244, 255, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(65, 244, 255, 0.04) 1px, transparent 1px);
      background-size: 36px 36px;
      mask-image: linear-gradient(to bottom, black, transparent 82%);
    }

    .hero {
      position: relative;
      display: grid;
      grid-template-columns: minmax(300px, 0.92fr) minmax(320px, 1fr);
      align-items: center;
      gap: clamp(24px, 6vw, 72px);
      z-index: 1;
    }

    .hud {
      position: relative;
      width: min(430px, 100%);
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      justify-self: center;
      filter: drop-shadow(0 0 28px rgba(65, 244, 255, 0.38));
      animation: hud-shift 1.25s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }

    .hud::before,
    .hud::after,
    .ring,
    .ring::before,
    .ring::after {
      content: "";
      position: absolute;
      border-radius: 50%;
    }

    .hud::before {
      inset: -7%;
      background:
        radial-gradient(circle, rgba(65, 244, 255, 0.2), transparent 56%),
        conic-gradient(from 0deg, transparent 0 8%, rgba(65, 244, 255, 0.52) 8% 11%, transparent 11% 24%, rgba(65, 244, 255, 0.68) 24% 28%, transparent 28% 100%);
      filter: blur(1px);
      opacity: 0.9;
      animation: spin 8s linear infinite, glow 2.8s ease-in-out infinite;
    }

    .hud::after {
      inset: 12%;
      border: 1px solid rgba(65, 244, 255, 0.4);
      box-shadow:
        0 0 24px rgba(65, 244, 255, 0.3),
        inset 0 0 34px rgba(65, 244, 255, 0.12);
      animation: spin-reverse 13s linear infinite;
    }

    .ring.outer {
      inset: 2%;
      border: 1px solid rgba(65, 244, 255, 0.28);
      background:
        repeating-conic-gradient(from 8deg, rgba(65, 244, 255, 0.82) 0 2deg, transparent 2deg 8deg),
        radial-gradient(circle, transparent 62%, rgba(65, 244, 255, 0.08) 63% 66%, transparent 67%);
      mask: radial-gradient(circle, transparent 64%, black 65% 69%, transparent 70%);
      animation: spin 18s linear infinite;
    }

    .ring.middle {
      inset: 17%;
      border: 1px solid rgba(65, 244, 255, 0.34);
      background:
        conic-gradient(from 42deg, rgba(65, 244, 255, 0.86) 0 11%, transparent 11% 18%, rgba(65, 244, 255, 0.5) 18% 22%, transparent 22% 44%, rgba(65, 244, 255, 0.78) 44% 51%, transparent 51% 100%);
      mask: radial-gradient(circle, transparent 58%, black 59% 65%, transparent 66%);
      animation: spin-reverse 10s linear infinite;
    }

    .ring.inner {
      inset: 29%;
      border: 2px solid rgba(65, 244, 255, 0.86);
      box-shadow:
        0 0 18px rgba(65, 244, 255, 0.72),
        inset 0 0 24px rgba(65, 244, 255, 0.18);
      animation: glow 2.2s ease-in-out infinite;
    }

    .ring.inner::before {
      inset: 11%;
      border: 1px solid rgba(65, 244, 255, 0.18);
      background: radial-gradient(circle, rgba(4, 15, 30, 0.86), rgba(2, 8, 18, 0.9));
    }

    .ring.inner::after {
      inset: -20%;
      background: linear-gradient(90deg, transparent, rgba(65, 244, 255, 0.34), transparent);
      height: 2px;
      top: 50%;
      border-radius: 0;
      box-shadow: 0 0 20px rgba(65, 244, 255, 0.64);
      animation: scan 2.6s ease-in-out infinite;
    }

    .aurex-mark {
      position: relative;
      display: grid;
      place-items: center;
      width: 44%;
      aspect-ratio: 1;
      border-radius: 50%;
      color: var(--text);
      font-size: clamp(1.3rem, 4vw, 2.3rem);
      font-weight: 800;
      letter-spacing: 0.16em;
      text-indent: 0.16em;
      text-shadow: 0 0 14px rgba(65, 244, 255, 0.9);
      background: radial-gradient(circle, rgba(8, 33, 52, 0.78), rgba(2, 8, 18, 0.92));
      box-shadow: inset 0 0 34px rgba(65, 244, 255, 0.13);
    }

    .copy {
      animation: reveal-copy 1s ease-out 0.48s both;
    }

    h1 {
      margin: 0 0 14px;
      font-size: clamp(2rem, 6vw, 4.3rem);
      line-height: 0.98;
      font-weight: 750;
      letter-spacing: 0;
    }

    .summary {
      margin: 0 0 22px;
      max-width: 580px;
      color: var(--muted);
      font-size: clamp(1rem, 2vw, 1.12rem);
      line-height: 1.65;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 38px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--state-color) 42%, transparent);
      background: color-mix(in srgb, var(--state-color) 14%, rgba(4, 15, 30, 0.78));
      color: var(--text);
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 18px;
    }

    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--state-color);
      box-shadow: 0 0 18px var(--state-color);
      animation: pulse 1.8s ease-in-out infinite;
      flex: 0 0 auto;
    }

    .grid {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      max-width: 620px;
    }

    .metric {
      min-height: 96px;
      border: 1px solid rgba(65, 244, 255, 0.16);
      border-radius: 8px;
      background: rgba(2, 8, 18, 0.48);
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    .label {
      color: var(--muted);
      font-size: 0.74rem;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.1em;
    }

    .value {
      color: var(--text);
      font-size: 1rem;
      font-weight: 680;
      overflow-wrap: anywhere;
    }

    .value.status-text {
      color: var(--state-color);
    }

    .footer {
      position: relative;
      z-index: 1;
      margin: 20px 0 0;
      color: rgba(139, 183, 196, 0.78);
      font-size: 0.86rem;
    }

    @keyframes hud-shift {
      0% { transform: translateX(34%) scale(0.86); opacity: 0; }
      54% { transform: translateX(34%) scale(1.02); opacity: 1; }
      100% { transform: translateX(0) scale(1); opacity: 1; }
    }

    @keyframes reveal-copy {
      from { opacity: 0; transform: translateX(24px); }
      to { opacity: 1; transform: translateX(0); }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes spin-reverse {
      to { transform: rotate(-360deg); }
    }

    @keyframes glow {
      0%, 100% { opacity: 0.68; filter: brightness(0.9); }
      50% { opacity: 1; filter: brightness(1.24); }
    }

    @keyframes scan {
      0%, 100% { transform: translateY(-30px); opacity: 0; }
      45%, 55% { opacity: 1; }
      50% { transform: translateY(30px); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.58; transform: scale(0.92); }
      50% { opacity: 1; transform: scale(1.12); }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
      }
    }

    @media (max-width: 880px) {
      .hero {
        grid-template-columns: 1fr;
        text-align: center;
      }

      .copy,
      .grid {
        justify-self: center;
      }

      .summary {
        margin-inline: auto;
      }
    }

    @media (max-width: 520px) {
      body {
        padding: 18px 12px;
      }

      .panel {
        padding: 24px 16px;
      }

      .hud {
        width: min(330px, 100%);
      }

      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel" aria-label="Aurex API status">
      <div class="hero">
        <div class="hud" aria-hidden="true">
          <div class="ring outer"></div>
          <div class="ring middle"></div>
          <div class="ring inner"></div>
          <div class="aurex-mark">AUREX</div>
        </div>

        <div class="copy">
          <span class="badge"><span class="dot"></span>${escapeHtml(statusLabel)}</span>
          <h1>Welcome.</h1>
          <p class="summary">Here is the backend status for ${escapeHtml(payload.service)}.</p>

          <div class="grid">
            <article class="metric">
              <span class="label">Database</span>
              <span class="value status-text">${escapeHtml(databaseLabel)}</span>
            </article>
            <article class="metric">
              <span class="label">API</span>
              <span class="value">${escapeHtml(toTitleCase(payload.api.status))}</span>
            </article>
            <article class="metric">
              <span class="label">Uptime</span>
              <span class="value">${escapeHtml(payload.uptime.label)}</span>
            </article>
            <article class="metric">
              <span class="label">Environment</span>
              <span class="value">${escapeHtml(payload.environment)}</span>
            </article>
            <article class="metric">
              <span class="label">Version</span>
              <span class="value">${escapeHtml(payload.version ?? "Not set")}</span>
            </article>
          </div>

          <p class="footer">Observed at ${escapeHtml(timestampLabel)}</p>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
  };

  return {
    getHttpStatusForSystemState,
    getSystemStatusPayload,
    renderStatusHtml,
  };
};

export { createHealthService };
export type HealthService = ReturnType<typeof createHealthService>;
