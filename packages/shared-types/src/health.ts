/**
 * Health and Readiness Check DTOs
 */

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessDependencyStatus {
  status: 'ready' | 'pending_schema' | 'standby' | 'error';
  message?: string;
  [key: string]: unknown;
}

export interface ReadinessCheckResponse {
  status: 'ready' | 'not_ready';
  service: string;
  dependencies: {
    database: ReadinessDependencyStatus;
    worker: ReadinessDependencyStatus;
    [key: string]: ReadinessDependencyStatus;
  };
  timestamp: string;
}
